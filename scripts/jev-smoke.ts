import { buildContext, type DomainTicket } from '../src/domain';
import { JevDecisionProvider } from '../src/providers';

if (!process.argv.includes('--allow-one-paid-request')) throw new Error('Opt-in required: --allow-one-paid-request. This command may incur provider charges.');
if (process.env.DATA_MODE !== 'demo' || process.env.JEV_MODE !== 'live' || process.env.ALLOW_LIVE_WRITES !== 'false' || process.env.ALLOW_LIVE_DATA_PROCESSING !== 'false') throw new Error('Require DATA_MODE=demo JEV_MODE=live ALLOW_LIVE_WRITES=false ALLOW_LIVE_DATA_PROCESSING=false');
if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is missing. No request sent.');
const ticket: DomainTicket = { id: 'smoke-synthetic', subject: 'Where can I download an invoice?', organization: 'Synthetic Organisation', source: 'synthetic', version: 1, createdAt: '2026-09-01T09:00:00Z', comments: [{ id: 'smoke-comment', visibility: 'public', text: 'I need help finding a billing invoice. There is no service failure.', createdAt: '2026-09-01T09:00:00Z' }] };
const provider = new JevDecisionProvider({ apiKey: process.env.TYPESAFE_API_KEY, model: process.env.JEV_MODEL || 'jev-1.13.0', maxRetries: 0, timeoutMs: 15000, allowLiveDataProcessing: false });
const start = performance.now();
try {
  // Empty candidates deliberately avoids a separate issue-match request.
  const result = await provider.decide(buildContext(ticket, {asOf:'2026-09-01T09:01:00Z'}), []);
  console.log(JSON.stringify({ status: 'succeeded', dataSource: result.dataSource, provider: result.provider, requestedModel: result.requestedModel, reportedModel: result.reportedModel, durationMs: Math.round(performance.now()-start), providerLatencyMs: result.providerLatencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, validFields: Object.keys(result) }, null, 2));
} catch (error) { console.error(JSON.stringify({status:'failed',durationMs:Math.round(performance.now()-start),error:error instanceof Error?error.message:'Provider failure'})); process.exitCode=1; }
