import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCaptured, runKeychainJev, safeSmokeMetadata } from '../scripts/keychain-jev.mjs';
import { runJevSmoke } from '../scripts/jev-smoke';
import { IMPACT_RUBRIC } from '../src/providers/decision';

const fakeKey = 'fake_jev_key_canary_7e6b9d';
const optIn = ['--allow-one-paid-request'];
const env = { TYPESAFE_API_KEY: fakeKey, DATA_MODE: 'demo', JEV_MODE: 'live', ALLOW_LIVE_WRITES: 'false', ALLOW_LIVE_DATA_PROCESSING: 'false' };
const metadata = { status: 'succeeded', provider: 'jev', dataSource: 'synthetic', requestedModel: 'jev-1.13.0', reportedModel: 'jev-1.13.0', durationMs: 20, providerLatencyMs: 15, inputTokens: 321, outputTokens: 9 };
const processResult = (stdout: string, code = 0) => ({ code, stdout, timedOut: false, overflow: false });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const nativeResponse = (model = 'jev-1.13.0') => ({
  model,
  answers: {
    destination_team: { type: 'choice', choice: 'support', confidence: .95, probabilities: { support: .95, billing: .01, identity: .01, integrations: .01, platform: .01, unknown: .01 } },
    issue_type: { type: 'choice', choice: 'how_to', confidence: .95, probabilities: { how_to: .95, billing: .01, bug_report: .01, feature_request: .01, access: .01, unknown: .01 } },
    impact: { type: 'score', score: 0, confidence: 1, probabilities: { '0': 1, '1': 0, '2': 0, '3': 0 }, legend: Object.fromEntries(IMPACT_RUBRIC.map((text, index) => [String(index), text])) },
    needs_engineering: { type: 'noul', noul: .1 }, missing_repro_info: { type: 'noul', noul: .1 }, multiple_issues: { type: 'noul', noul: .1 },
  }, usage: { input_tokens: 321, output_tokens: 9 },
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('narrow Keychain Jev launcher', () => {
  it('requires exactly one explicit paid-request opt-in before any Keychain lookup', async () => {
    const run = vi.fn();
    for (const args of [[], ['--help'], [...optIn, '--service=other'], [...optIn, ...optIn]]) {
      expect(await runKeychainJev(args, { run })).toEqual({ exitCode: 1, output: { status: 'failed', code: 'explicit_opt_in_required' } });
    }
    expect(run).not.toHaveBeenCalled();
  });
  it('uses only the declared item and passes its key only in the clean smoke child environment', async () => {
    for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'GITHUB_TOKEN', 'ZENDESK_OAUTH_CLIENT_SECRET', 'TYPESAFE_API_KEY', 'NODE_OPTIONS']) vi.stubEnv(name, `FAKE_UNRELATED_${name}`);
    const seen: { command: string; args: string[]; env: Record<string, string>; timeoutMs: number; maxBytes: number }[] = [];
    const run = vi.fn(async (command: string, args: string[], options: { env: Record<string, string>; timeoutMs?: number; maxBytes?: number }) => {
      seen.push({ command, args: [...args], ...options, env: { ...options.env }, timeoutMs: options.timeoutMs ?? 30000, maxBytes: options.maxBytes ?? 65536 });
      return seen.length === 1 ? processResult(`${fakeKey}\n`) : processResult(JSON.stringify(metadata));
    });
    const result = await runKeychainJev(optIn, { run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(seen[0].command).toBe('/usr/bin/security');
    expect(seen[0].args).toEqual(['find-generic-password', '-s', 'typesafe-api-key', '-a', 'zenjev', '-w']);
    expect(seen[0].env).not.toHaveProperty('TYPESAFE_API_KEY');
    expect(seen[1].command).toBe(process.execPath);
    expect(seen[1].args).toEqual(['--import', 'tsx', expect.stringMatching(/\/scripts\/jev-smoke\.ts$/), '--allow-one-paid-request']);
    expect(seen[1].env).toMatchObject({ ...env, JEV_MODEL: 'jev-1.13.0', NODE_OPTIONS: '--max-old-space-size=1024' });
    for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'GITHUB_TOKEN', 'ZENDESK_OAUTH_CLIENT_SECRET']) expect(seen[1].env).not.toHaveProperty(name);
    expect(JSON.stringify(seen.map(item => item.args))).not.toContain(fakeKey);
    expect(result).toMatchObject({ exitCode: 0, output: { ...metadata, requestLimit: 1, automaticRetries: 0, requestDeadlineMs: 15000 } });
    expect(JSON.stringify(result)).not.toContain(fakeKey);
    expect(run.mock.calls[1][2].env).not.toHaveProperty('TYPESAFE_API_KEY');
  });
  it('sanitizes cancelled, missing, malformed and failed lookups without starting the smoke', async () => {
    for (const lookup of [processResult(fakeKey, 44), { ...processResult(fakeKey), timedOut: true }, { ...processResult(fakeKey), overflow: true }, processResult(''), processResult(`${fakeKey}\ninjected`), processResult('x'.repeat(4097))]) {
      const run = vi.fn().mockResolvedValue(lookup);
      const result = await runKeychainJev(optIn, { run });
      expect(result.exitCode).toBe(1); expect(run).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain(fakeKey);
    }
    const thrown = vi.fn().mockRejectedValue(new Error(`Keychain cancelled ${fakeKey}`));
    expect(await runKeychainJev(optIn, { run: thrown })).toEqual({ exitCode: 1, output: { status: 'failed', code: 'keychain_unavailable' } });
  });
  it('drops reflected keys, arbitrary messages and unbounded metadata before output', async () => {
    const unsafe = { ...metadata, reportedModel: `jev-${fakeKey.toLowerCase()}`, requestedModel: `jev-${fakeKey}`, inputTokens: Infinity, outputTokens: -1, durationMs: 1e10, secret: fakeKey, error: fakeKey, validFields: [fakeKey] };
    const run = vi.fn().mockResolvedValueOnce(processResult(`${fakeKey}\n`)).mockResolvedValueOnce(processResult(JSON.stringify({ ...unsafe, reportedModel: `jev-${fakeKey}` })));
    const result = await runKeychainJev(optIn, { run });
    expect(result.output).toMatchObject({ requestedModel: null, reportedModel: null, inputTokens: null, outputTokens: null, durationMs: null });
    expect(result.output).not.toHaveProperty('secret'); expect(result.output).not.toHaveProperty('error'); expect(result.output).not.toHaveProperty('validFields');
    expect(JSON.stringify(result)).not.toContain(fakeKey);
    expect(safeSmokeMetadata({ status: 'failed', code: fakeKey, error: fakeKey }, fakeKey)).toEqual({ status: 'failed', code: 'provider_failure', durationMs: null });
    expect(safeSmokeMetadata({ ...metadata, reportedModel: `jev-${'a'.repeat(1000)}` }, fakeKey)).toMatchObject({ reportedModel: null });
  });
  it('fails closed on invalid, excessive, timed-out or contradictory child output', async () => {
    for (const child of [processResult(fakeKey), { ...processResult(fakeKey), overflow: true }, { ...processResult(fakeKey), timedOut: true }, processResult(JSON.stringify(metadata), 1), processResult(JSON.stringify({ status: 'unexpected', secret: fakeKey }))]) {
      const run = vi.fn().mockResolvedValueOnce(processResult(`${fakeKey}\n`)).mockResolvedValueOnce(child);
      const result = await runKeychainJev(optIn, { run });
      expect(result.exitCode).toBe(1); expect(run).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toContain(fakeKey);
    }
  });
  it('bounds real child output and time while discarding stderr', async () => {
    const result = await runCaptured(process.execPath, ['-e', 'process.stderr.write("FAKE_STDERR_CANARY");process.stdout.write("x".repeat(10000))'], { env: {}, timeoutMs: 2000, maxBytes: 64 });
    expect(result).toMatchObject({ stdout: '', overflow: true });
    expect(JSON.stringify(result)).not.toContain('FAKE_STDERR_CANARY');
    const timeout = await runCaptured(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { env: {}, timeoutMs: 30, maxBytes: 64 });
    expect(timeout).toMatchObject({ stdout: '', timedOut: true });
  });
});

describe('single synthetic Jev request', () => {
  it('makes one six-question request with a 15-second deadline, no candidates and no secret output', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(response(nativeResponse()));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const result = await runJevSmoke(optIn, env, f);
    expect(result).toMatchObject({ status: 'succeeded', provider: 'jev', dataSource: 'synthetic', inputTokens: 321, outputTokens: 9 });
    expect(f).toHaveBeenCalledTimes(1); expect(timeout).toHaveBeenCalledWith(15000);
    expect(f.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${fakeKey}` } });
    const body = JSON.parse(String(f.mock.calls[0][1]?.body));
    expect(Object.keys(body.questions)).toHaveLength(6); expect(body.state).not.toHaveProperty('candidates'); expect(body).not.toHaveProperty('max_tokens');
    expect(JSON.stringify(body)).not.toContain(fakeKey); expect(JSON.stringify(result)).not.toContain(fakeKey);
  });
  it('suppresses provider-reflected model secrets and preserves missing usage as unknown', async () => {
    const raw = nativeResponse(`jev-${fakeKey}`); delete (raw as Record<string, unknown>).usage;
    const f = vi.fn<typeof fetch>().mockResolvedValue(response(raw));
    const result = await runJevSmoke(optIn, env, f);
    expect(result).toMatchObject({ status: 'succeeded', reportedModel: null, inputTokens: null, outputTokens: null });
    expect(JSON.stringify(result)).not.toContain(fakeKey); expect(f).toHaveBeenCalledTimes(1);
  });
  it('rejects unsafe configuration before HTTP and never retries failed requests', async () => {
    const f = vi.fn<typeof fetch>();
    for (const configuration of [{ ...env, DATA_MODE: 'live' }, { ...env, ALLOW_LIVE_WRITES: 'true' }, { ...env, TYPESAFE_API_KEY: '' }, { ...env, ALLOW_LIVE_DATA_PROCESSING: 'true' }, { ...env, JEV_MODEL: fakeKey }]) expect(await runJevSmoke(optIn, configuration, f)).toMatchObject({ status: 'failed', code: 'configuration' });
    expect(await runJevSmoke([], env, f)).toMatchObject({ status: 'failed', code: 'configuration' });
    expect(f).not.toHaveBeenCalled();
    for (const status of [401, 429, 500]) {
      f.mockReset().mockResolvedValue(response({ error: fakeKey }, status));
      const result = await runJevSmoke(optIn, env, f);
      expect(result.status).toBe('failed'); expect(f).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain(fakeKey);
    }
    f.mockReset().mockRejectedValue(new Error(fakeKey));
    expect(await runJevSmoke(optIn, env, f)).toMatchObject({ status: 'failed', code: 'transient' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
