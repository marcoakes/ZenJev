import { pathToFileURL } from 'node:url';
import { buildContext, type DomainTicket } from '../src/domain';
import { JevDecisionProvider } from '../src/providers/decision';
import { ProviderError } from '../src/providers/http';
import { safeSmokeMetadata } from './keychain-jev.mjs';

const ticket: DomainTicket = { id: 'smoke-synthetic', subject: 'Where can I download an invoice?', organization: 'Synthetic Organisation', source: 'synthetic', version: 1, createdAt: '2026-09-01T09:00:00Z', comments: [{ id: 'smoke-comment', visibility: 'public', text: 'I need help finding a billing invoice. There is no service failure.', createdAt: '2026-09-01T09:00:00Z' }] };

export async function runJevSmoke(args: string[], env: Record<string, string | undefined>, fetcher: typeof fetch = fetch) {
  const start = performance.now(), key = env.TYPESAFE_API_KEY ?? '', model = env.JEV_MODEL || 'jev-1.13.0';
  try {
    if (args.length !== 1 || args[0] !== '--allow-one-paid-request' || env.DATA_MODE !== 'demo' || env.JEV_MODE !== 'live' || env.ALLOW_LIVE_WRITES !== 'false' || env.ALLOW_LIVE_DATA_PROCESSING !== 'false' || !key || key.length > 4096 || /[\s\x00-\x1f\x7f]/.test(key) || !/^jev-[a-z0-9][a-z0-9._-]{0,79}$/.test(model) || model.includes(key)) throw new ProviderError('configuration', 'Invalid synthetic smoke configuration');
    const provider = new JevDecisionProvider({ apiKey: key, model, fetch: fetcher, maxRetries: 0, timeoutMs: 15000, allowLiveDataProcessing: false });
    // Empty candidates deliberately avoids a separate issue-match request.
    const result = await provider.decide(buildContext(ticket, { asOf: '2026-09-01T09:01:00Z' }), []);
    return safeSmokeMetadata({ ...result, status: 'succeeded', durationMs: Math.round(performance.now() - start) }, key)!;
  } catch (error) {
    return safeSmokeMetadata({ status: 'failed', durationMs: Math.round(performance.now() - start), code: error instanceof ProviderError ? error.code : 'provider_failure' }, key)!;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runJevSmoke(process.argv.slice(2), process.env);
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'succeeded' ? 0 : 1;
}
