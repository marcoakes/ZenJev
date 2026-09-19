import { describe, expect, it, vi } from 'vitest';
import { integrationSmoke, smokeFailure } from '../scripts/integration-smoke';

const githubArgs = ['--provider=github', '--repository=example/private', '--allow-live-read'];
const githubEnv = { DATA_MODE: 'live', ALLOW_LIVE_WRITES: 'false', ALLOW_LIVE_DATA_PROCESSING: 'false', GITHUB_TOKEN: 'FAKE_GITHUB_SECRET_CANARY', GITHUB_REPOSITORIES: 'example/private' };
const zendeskArgs = ['--provider=zendesk', '--ticket=123', '--allow-live-read'];
const zendeskEnv = { DATA_MODE: 'live', ALLOW_LIVE_WRITES: 'false', ALLOW_LIVE_DATA_PROCESSING: 'false', ZENDESK_SUBDOMAIN: 'example', ZENDESK_OAUTH_CLIENT_ID: 'FAKE_CLIENT_ID', ZENDESK_OAUTH_CLIENT_SECRET: 'FAKE_CLIENT_SECRET_CANARY', ZENDESK_OAUTH_SCOPES: 'tickets:read' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('operator read-only integration smoke', () => {
  it('fails closed before HTTP on missing acknowledgement, enabled writes, malformed targets, missing credentials and write scopes', async () => {
    const f = vi.fn<typeof fetch>();
    const cases: [string[], Record<string, string>][] = [
      [githubArgs.slice(0, 2), githubEnv],
      [githubArgs, { ...githubEnv, DATA_MODE: 'demo' }],
      [githubArgs, { ...githubEnv, ALLOW_LIVE_WRITES: 'true' }],
      [githubArgs, { ...githubEnv, ALLOW_LIVE_DATA_PROCESSING: 'true' }],
      [githubArgs, { ...githubEnv, GITHUB_TOKEN: '' }],
      [githubArgs, { ...githubEnv, GITHUB_REPOSITORIES: 'different/repo' }],
      [['--provider=github', '--repository=example/../elsewhere', '--allow-live-read'], githubEnv],
      [['--provider=github', '--repository=example/..', '--allow-live-read'], { ...githubEnv, GITHUB_REPOSITORIES: 'example/..' }],
      [['--provider=github', '--repository=./repo', '--allow-live-read'], { ...githubEnv, GITHUB_REPOSITORIES: './repo' }],
      [[...githubArgs, '--token=FAKE_CLI_SECRET'], githubEnv],
      [[...githubArgs, '--provider=zendesk'], githubEnv],
      [[...githubArgs, '--ticket=123'], githubEnv],
      [zendeskArgs, { ...zendeskEnv, ZENDESK_OAUTH_SCOPES: 'read tickets:write' }],
      [zendeskArgs, { ...zendeskEnv, ZENDESK_SUBDOMAIN: 'example.evil.invalid' }],
      [zendeskArgs, { ...zendeskEnv, ZENDESK_OAUTH_CLIENT_SECRET: '' }],
      [['--provider=zendesk', '--ticket=https://evil.invalid', '--allow-live-read'], zendeskEnv],
    ];
    for (const [args, env] of cases) await expect(integrationSmoke(args, env, f)).rejects.toMatchObject({ code: 'configuration' });
    expect(f).not.toHaveBeenCalled();
  });
  it('reads exactly one allowlisted repository metadata record and emits no content or token', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(response({ full_name: 'example/private', private: true, description: 'PRIVATE_REPOSITORY_CONTENT_CANARY' }));
    const result = await integrationSmoke(githubArgs, githubEnv, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://api.github.com/repos/example/private');
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
    expect(f.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
    expect(result).toEqual({ status: 'succeeded', provider: 'github', readOnly: true, recordsRead: 1, httpRequests: 1, modelCalls: 0, mutations: 0, repositoryPrivate: true });
    expect(JSON.stringify(result)).not.toMatch(/CANARY|example\/private/);
  });
  it('permits only Zendesk token acquisition and one ticket GET, without logging ticket content or model calls', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ access_token: 'FAKE_ACCESS_TOKEN_CANARY', token_type: 'Bearer', expires_in: 1800 })).mockResolvedValueOnce(response({ ticket: { id: 123, subject: 'PRIVATE_SUBJECT_CANARY', description: 'PRIVATE_BODY_CANARY', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z' } }));
    const result = await integrationSmoke(zendeskArgs, zendeskEnv, f);
    expect(f.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://example.zendesk.com/oauth/tokens', 'POST'], ['https://example.zendesk.com/api/v2/tickets/123.json', 'GET'],
    ]);
    expect(new URLSearchParams(String(f.mock.calls[0][1]?.body)).get('scope')).toBe('tickets:read');
    expect(result).toEqual({ status: 'succeeded', provider: 'zendesk', readOnly: true, recordsRead: 1, httpRequests: 2, modelCalls: 0, mutations: 0 });
    expect(JSON.stringify(result)).not.toMatch(/CANARY|123|example/);
  });
  it('never retries rate-limited reads or failed authentication and never echoes provider error content', async () => {
    for (const status of [429, 401, 500]) {
      const f = vi.fn<typeof fetch>().mockResolvedValue(response({ message: 'PRIVATE_ERROR_CONTENT_CANARY' }, status));
      const failure = await integrationSmoke(githubArgs, githubEnv, f).then(() => null, smokeFailure);
      expect(f).toHaveBeenCalledTimes(1);
      expect(failure).toMatchObject({ status: 'failed', httpStatus: status });
      expect(JSON.stringify(failure)).not.toMatch(/CANARY|example|secret/);
    }
  });
  it('reports timeout and unknown exceptions without exposing messages or retrying', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new Error('FAKE_NETWORK_SECRET_CANARY'));
    const failure = await integrationSmoke(githubArgs, githubEnv, f).then(() => null, smokeFailure);
    expect(f).toHaveBeenCalledTimes(1);
    expect(failure).toEqual({ status: 'failed', code: 'transient', httpStatus: null });
    expect(smokeFailure(new Error('FAKE_INTERNAL_SECRET_CANARY'))).toEqual({ status: 'failed', code: 'unexpected', httpStatus: null });
  });
});
