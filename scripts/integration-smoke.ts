import { pathToFileURL } from 'node:url';
import { GitHubProvider } from '../src/providers/github';
import { GitLabProvider, resolveGitLabServer } from '../src/providers/gitlab';
import { ZendeskProvider } from '../src/providers/zendesk';
import { ProviderError } from '../src/providers/http';
import { isProjectPath } from '../src/domain';

type Environment = Record<string, string | undefined>;
type SmokeResult = { status: 'succeeded'; provider: 'github' | 'gitlab' | 'zendesk'; readOnly: true; recordsRead: 1; httpRequests: number; modelCalls: 0; mutations: 0; repositoryPrivate?: boolean; projectVisibility?: 'private' | 'internal' | 'public' };

/** Operator-only, bounded connection check. Never imports the app database or Jev. */
export async function integrationSmoke(args: string[], env: Environment, fetcher: typeof fetch = fetch): Promise<SmokeResult> {
  const fail = () => { throw new ProviderError('configuration', 'Invalid read-only smoke configuration; no request sent'); };
  const values: Record<string, string> = {};
  for (const arg of args) {
    const match = /^(--provider|--repository|--project|--ticket)=(.+)$/.exec(arg);
    if (arg === '--allow-live-read') { if (values.ack) fail(); values.ack = 'yes'; }
    else if (match && !values[match[1]]) values[match[1]] = match[2];
    else fail();
  }
  if (!values.ack || env.DATA_MODE !== 'live' || env.ALLOW_LIVE_WRITES !== 'false' || env.ALLOW_LIVE_DATA_PROCESSING !== 'false') fail();
  const provider = values['--provider'];
  if (provider !== 'github' && provider !== 'gitlab' && provider !== 'zendesk') fail();
  let requests = 0;
  const allowed = new Map<string, string>();
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (allowed.get(url) !== (init?.method ?? 'GET') || requests >= allowed.size) throw new ProviderError('policy', 'Smoke request exceeded its declared boundary');
    requests++;
    return fetcher(input, init);
  };
  const options = { fetch: guardedFetch, maxRetries: 0, timeoutMs: 15000 };
  if (provider === 'github') {
    const repository = values['--repository'];
    const allowlist = (env.GITHUB_REPOSITORIES ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (values['--ticket'] || values['--project'] || !repository || repository.length > 200 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.split('/').some(segment => segment === '.' || segment === '..') || !allowlist.includes(repository) || !env.GITHUB_TOKEN?.trim()) fail();
    if (env.GITHUB_API_VERSION && !/^\d{4}-\d{2}-\d{2}$/.test(env.GITHUB_API_VERSION)) fail();
    allowed.set(`https://api.github.com/repos/${repository}`, 'GET');
    const metadata = await new GitHubProvider({ ...options, token: env.GITHUB_TOKEN!, repositories: [repository], apiVersion: env.GITHUB_API_VERSION }).repository(repository);
    return { status: 'succeeded', provider: 'github', readOnly: true, recordsRead: 1, httpRequests: requests, modelCalls: 0, mutations: 0, repositoryPrivate: metadata.private };
  }
  if (provider === 'gitlab') {
    const project = values['--project'];
    const allowlist = (env.GITLAB_PROJECTS ?? '').split(',').map(value => value.trim()).filter(Boolean);
    if (values['--ticket'] || values['--repository'] || !project || !isProjectPath(project, 'gitlab') || !allowlist.includes(project) || !env.GITLAB_TOKEN?.trim()) fail();
    // The server URL is validated before it can reach the network, and a private endpoint must be declared.
    const server = resolveGitLabServer(env.GITLAB_SERVER_URL || 'https://gitlab.com', env.GITLAB_ALLOW_PRIVATE_NETWORK === 'true');
    allowed.set(`${server.origin}/api/v4/projects/${encodeURIComponent(project)}`, 'GET');
    const metadata = await new GitLabProvider({ ...options, token: env.GITLAB_TOKEN!, projects: [project], serverUrl: server.origin, allowPrivateNetwork: env.GITLAB_ALLOW_PRIVATE_NETWORK === 'true' }).project(project);
    return { status: 'succeeded', provider: 'gitlab', readOnly: true, recordsRead: 1, httpRequests: requests, modelCalls: 0, mutations: 0, projectVisibility: metadata.visibility };
  }
  const ticket = values['--ticket'], subdomain = env.ZENDESK_SUBDOMAIN ?? '';
  const scopes = env.ZENDESK_OAUTH_SCOPES?.trim() ?? '';
  if (values['--repository'] || values['--project'] || !ticket || !/^\d{1,32}$/.test(ticket) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain) || !env.ZENDESK_OAUTH_CLIENT_ID?.trim() || !env.ZENDESK_OAUTH_CLIENT_SECRET?.trim() || !scopes || scopes.split(/\s+/).some(scope => !['read', 'tickets:read'].includes(scope))) fail();
  const origin = `https://${subdomain}.zendesk.com`;
  allowed.set(`${origin}/oauth/tokens`, 'POST');
  allowed.set(`${origin}/api/v2/tickets/${ticket}.json`, 'GET');
  await new ZendeskProvider({ ...options, subdomain, clientId: env.ZENDESK_OAUTH_CLIENT_ID!, clientSecret: env.ZENDESK_OAUTH_CLIENT_SECRET!, scopes }).ticket(ticket);
  return { status: 'succeeded', provider: 'zendesk', readOnly: true, recordsRead: 1, httpRequests: requests, modelCalls: 0, mutations: 0 };
}

export function smokeFailure(error: unknown) {
  return { status: 'failed', code: error instanceof ProviderError ? error.code : 'unexpected', httpStatus: error instanceof ProviderError ? error.status : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  integrationSmoke(process.argv.slice(2), process.env).then(result => console.log(JSON.stringify(result))).catch(error => {
    // Deliberately omit exception messages, URLs, response bodies, identifiers and credentials.
    console.error(JSON.stringify(smokeFailure(error)));
    process.exitCode = 1;
  });
}
