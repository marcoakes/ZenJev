import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { cleanEnvironment, demoEnvironment } from './environment.mjs';

const expectedHarness = '7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4';
const harness = process.env.WRINGER_BINARY;
const harnessRepo = process.env.WRINGER_REPOSITORY;
if (!harness || !harnessRepo) throw new Error('CI requires the reviewed Wringer binary and repository. No fallback harness is permitted.');
const output = resolve('work/ci');
await mkdir(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', env: cleanEnvironment() }).trim();
if (git('-C', harnessRepo, 'rev-parse', 'HEAD') !== expectedHarness) throw new Error('Unexpected Wringer source revision');
const source = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) throw new Error('CI verification requires a clean source checkout');
const demoDatabase = 'postgresql://demo:demo@127.0.0.1:55432/zenjev_demo?connection_limit=4';
const testDatabase = 'postgresql://demo:demo@127.0.0.1:55433/zenjev_test?connection_limit=4';
const env = demoEnvironment({ DATABASE_URL: demoDatabase, ZENJEV_TEST_DATABASE_URL: testDatabase, APP_BIND_HOST: '127.0.0.1', NODE_ENV: 'production' });
const owned = new Set();
const report = { schemaVersion: 'zenjev.ci-verification.v1', sourceCommit: source, harnessCommit: expectedHarness, startedAt: new Date().toISOString(), runtime: process.version, platform: process.platform, dataMode: 'synthetic', provider: 'mock', commands: [], databases: [], bundles: [], status: 'running', limitations: ['Synthetic fixture tests do not validate production credentials or live provider writes.', 'Human usability approval is not manufactured by CI.'] };

function start(label, binary, args, childEnv = env) {
  const log = createWriteStream(join(output, `${label}.log`), { flags: 'w' });
  const child = spawn(binary, args, { env: childEnv, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  owned.add(child);
  child.stdout.on('data', chunk => { log.write(chunk); process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { log.write(chunk); process.stderr.write(chunk); });
  const completion = new Promise(resolve => {
    child.once('error', error => { log.write(`${error.message}\n`); resolve({ code: null, signal: null, error: error.message }); });
    child.once('close', (code, signal) => { owned.delete(child); log.end(); resolve({ code, signal }); });
  });
  return { child, completion };
}
function signal(child, value) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { if (process.platform === 'win32') child.kill(value); else process.kill(-child.pid, value); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function run(label, binary, args, childEnv = env, timeout = 300_000) {
  const startedAt = new Date().toISOString();
  const launched = start(label, binary, args, childEnv);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; signal(launched.child, 'SIGTERM'); }, timeout);
  const killTimer = setTimeout(() => signal(launched.child, 'SIGKILL'), timeout + 5_000);
  const result = await launched.completion;
  clearTimeout(timer); clearTimeout(killTimer);
  report.commands.push({ label, binary, args, startedAt, finishedAt: new Date().toISOString(), ...result, timedOut });
  if (result.code !== 0 || timedOut) throw new Error(`${label} failed; inspect work/ci/${label}.log`);
}
async function stopAll() {
  const current = [...owned]; current.forEach(child => signal(child, 'SIGTERM'));
  if (current.length) await new Promise(resolve => setTimeout(resolve, 1_000));
  current.forEach(child => signal(child, 'SIGKILL'));
}
for (const value of ['SIGINT', 'SIGTERM']) process.once(value, () => { void stopAll().finally(() => process.exit(130)); });
async function readiness(url, services, authenticated = false) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (services.some(({ child }) => child.exitCode !== null || child.signalCode !== null)) throw new Error('Production process exited before readiness');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (authenticated ? response.status === 401 : response.ok && (await response.json()).worker?.status === 'healthy') return;
    } catch { /* Bounded readiness polling; no test or job reruns. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Production readiness timed out: ${url}`);
}
async function verify(label, gates) {
  await run(label, harness, ['verify', '--repo', process.cwd(), '--serial', ...gates.flatMap(gate => ['--gate', gate]), '--json'], env, 900_000);
}
try {
  for (const [name, database] of [['demo', demoDatabase], ['test', testDatabase]]) {
    const client = new Client({ connectionString: database, connectionTimeoutMillis: 5_000 });
    await client.connect();
    try {
      const result = await client.query('SELECT version(), current_database() AS database, current_setting(\'server_version_num\')::int AS version_number');
      const record = result.rows[0];
      if (record.version_number < 170000 || record.version_number >= 180000 || /pglite|wasm|emscripten/i.test(record.version)) throw new Error('CI requires native PostgreSQL 17');
      report.databases.push({ name, ...record });
    } finally { await client.end(); }
    await run(`migrate-${name}`, process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], demoEnvironment({ DATABASE_URL: database }));
  }
  await run('seed-demo-first', process.execPath, ['--import', 'tsx', 'scripts/seed.ts']);
  await run('seed-demo-second', process.execPath, ['--import', 'tsx', 'scripts/seed.ts']);
  await verify('wringer-build', ['lint', 'typecheck', 'production-build']);
  const failures = [];
  // Independent browser evidence remains useful if the native gate exposes a defect;
  // every failed required gate still makes the final job fail, with no automatic rerun.
  try { await verify('wringer-native', ['native-concurrency']); }
  catch (error) { failures.push(error.message); console.error(error.message); }
  const worker = start('worker', process.execPath, ['--import', 'tsx', 'src/worker/index.ts']);
  const app = start('production-app', process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000']);
  // Conservatively require real sessions while still binding this synthetic fixture server to loopback.
  const authApp = start('authenticated-app', process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3001'], { ...env, APP_BASE_URL: 'http://127.0.0.1:3001', APP_BIND_HOST: '0.0.0.0' });
  await readiness('http://127.0.0.1:3000/api/health', [worker, app]);
  await readiness('http://127.0.0.1:3001/api/settings', [authApp], true);
  try { await verify('wringer-workflows', ['fresh-offline-setup', 'branding', 'domain-provider-contracts', 'persistence-workflow', 'browser']); }
  catch (error) { failures.push(error.message); console.error(error.message); }
  try { await verify('wringer-auth', ['browser-auth']); }
  catch (error) { failures.push(error.message); console.error(error.message); }
  if (git('rev-parse', 'HEAD') !== source || git('status', '--porcelain')) throw new Error('Source changed during CI verification');
  if (failures.length) throw new Error(failures.join('; '));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error instanceof Error ? error.message : 'CI verification failed'; process.exitCode = 1;
} finally {
  await stopAll();
  for (const directory of await readdir('.wringer/runs').catch(() => [])) {
    const path = join('.wringer/runs', directory);
    try { const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')); report.bundles.push({ path, sourceCommit: manifest.repo.head_sha, result: manifest.result }); }
    catch { report.bundles.push({ path, incomplete: true }); }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, sourceCommit: source, report: 'work/ci/verification.json' }));
}
