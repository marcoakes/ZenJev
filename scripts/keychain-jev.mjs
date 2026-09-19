import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanEnvironment } from './environment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = 'typesafe-api-key';
const account = 'zenjev';
const failureCodes = new Set(['configuration', 'authentication', 'schema', 'rate_limit', 'transient', 'conflict', 'uncertain', 'policy']);

/** Only fixed fields and bounded scalar metadata can leave the trusted process. */
export function safeSmokeMetadata(value, secret = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safeNumber = (number, maximum) => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : null;
  const safeModel = model => typeof model === 'string' && /^jev-[a-z0-9][a-z0-9._-]{0,79}$/.test(model) && (!secret || !model.includes(secret)) ? model : null;
  let result;
  if (value.status === 'succeeded' && value.provider === 'jev' && value.dataSource === 'synthetic') {
    result = {
      status: 'succeeded', provider: 'jev', dataSource: 'synthetic',
      requestedModel: safeModel(value.requestedModel), reportedModel: safeModel(value.reportedModel),
      durationMs: safeNumber(value.durationMs, 120000), providerLatencyMs: safeNumber(value.providerLatencyMs, 120000),
      inputTokens: safeNumber(value.inputTokens, 1000000000), outputTokens: safeNumber(value.outputTokens, 1000000000),
      requestLimit: 1, automaticRetries: 0, requestDeadlineMs: 15000,
    };
  } else if (value.status === 'failed') {
    result = { status: 'failed', code: failureCodes.has(value.code) ? value.code : 'provider_failure', durationMs: safeNumber(value.durationMs, 120000) };
  } else return null;
  // Defence in depth for any reflected key, including an unexpectedly numeric key.
  return secret && JSON.stringify(result).includes(secret) ? { status: 'failed', code: 'output_redacted' } : result;
}

/** Capture bounded stdout privately; stderr and raw exceptions never reach the terminal. */
export function runCaptured(command, args, { env, cwd = root, timeoutMs = 30000, maxBytes = 65536 }) {
  return new Promise(resolveRun => {
    let child;
    try { child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { resolveRun({ code: null, stdout: '', timedOut: false, overflow: false }); return; }
    let chunks = [], size = 0, timedOut = false, overflow = false, forceKill;
    const stop = () => {
      child.kill('SIGTERM');
      forceKill ??= setTimeout(() => child.kill('SIGKILL'), 1000);
      forceKill.unref();
    };
    const timer = setTimeout(() => { timedOut = true; chunks = []; stop(); }, timeoutMs);
    child.stdout.on('data', chunk => {
      if (timedOut || overflow) return;
      size += chunk.length;
      if (size > maxBytes) { overflow = true; chunks = []; stop(); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', () => {});
    child.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer); if (forceKill) clearTimeout(forceKill);
      resolveRun({ code, stdout: timedOut || overflow ? '' : Buffer.concat(chunks).toString('utf8'), timedOut, overflow });
    });
  });
}

export async function runKeychainJev(args, { run = runCaptured } = {}) {
  const failed = code => ({ exitCode: 1, output: { status: 'failed', code } });
  if (args.length !== 1 || args[0] !== '--allow-one-paid-request') return failed('explicit_opt_in_required');
  let secret = '', childEnv;
  try {
    const lookup = await run('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { env: cleanEnvironment(), timeoutMs: 30000, maxBytes: 8192 });
    if (lookup.code !== 0 || lookup.timedOut || lookup.overflow || typeof lookup.stdout !== 'string') return failed('keychain_unavailable');
    secret = lookup.stdout.replace(/\r?\n$/, '');
    lookup.stdout = '';
    if (!secret || secret.length > 4096 || /[\s\x00-\x1f\x7f]/.test(secret)) return failed('keychain_value_invalid');
    childEnv = cleanEnvironment({ TYPESAFE_API_KEY: secret, DATA_MODE: 'demo', JEV_MODE: 'live', JEV_MODEL: 'jev-1.13.0', ALLOW_LIVE_WRITES: 'false', ALLOW_LIVE_DATA_PROCESSING: 'false' });
    const child = await run(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/jev-smoke.ts'), '--allow-one-paid-request'], { env: childEnv, timeoutMs: 30000, maxBytes: 65536 });
    if (child.timedOut) return failed('smoke_process_timeout');
    if (child.overflow) return failed('smoke_output_limit');
    let parsed;
    try { parsed = JSON.parse(child.stdout); } catch { return failed('smoke_output_invalid'); }
    const output = safeSmokeMetadata(parsed, secret);
    if (!output || (child.code !== 0 && output.status === 'succeeded')) return failed('smoke_process_failed');
    return { exitCode: child.code === 0 && output.status === 'succeeded' ? 0 : 1, output };
  } catch {
    return failed(secret ? 'smoke_process_failed' : 'keychain_unavailable');
  } finally {
    if (childEnv) delete childEnv.TYPESAFE_API_KEY;
    secret = '';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runKeychainJev(process.argv.slice(2));
  console.log(JSON.stringify(result.output));
  process.exitCode = result.exitCode;
}
