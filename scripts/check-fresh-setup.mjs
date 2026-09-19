import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { demoEnvironment } from './environment.mjs';

// This check owns a fresh temporary database and a dedicated port. It never
// connects to, resets, migrates or seeds the normal demo/test databases.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = 55435;
const url = `postgresql://demo:demo@127.0.0.1:${port}/zenjev_test?pgbouncer=true&statement_cache_size=0&connection_limit=1`;
const env = demoEnvironment({ DATABASE_URL: url, NODE_ENV: 'test' });
const abort = new AbortController();
const onSignal = () => abort.abort(new Error('Fresh setup verification interrupted'));
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
const deadline = setTimeout(() => abort.abort(new Error('Fresh setup verification exceeded 240 seconds')), 240_000);
let temporaryDirectory;
let database;
let server;
let started = false;
let result;
let failure;

async function run(label, args) {
  abort.signal.throwIfAborted();
  console.log(JSON.stringify({ check: 'fresh-portable-setup', phase: label }));
  // Async spawning is essential: the parent must continue serving the socket.
  await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] });
    let spawnError;
    let killDeadline;
    const stopChild = () => {
      child.kill('SIGTERM');
      killDeadline = setTimeout(() => child.kill('SIGKILL'), 5_000);
      killDeadline.unref();
    };
    abort.signal.addEventListener('abort', stopChild, { once: true });
    if (abort.signal.aborted) stopChild();
    child.once('error', error => { spawnError = error; });
    child.once('close', (code, signal) => {
      abort.signal.removeEventListener('abort', stopChild);
      if (killDeadline) clearTimeout(killDeadline);
      if (abort.signal.aborted) rejectChild(abort.signal.reason);
      else if (spawnError) rejectChild(spawnError);
      else if (code !== 0) rejectChild(new Error(`${label} failed (exit ${code ?? signal})`));
      else resolveChild();
    });
  });
}

async function inspect() {
  const { rows: [counts] } = await database.query(`SELECT
    (SELECT count(*) FROM "Ticket") AS tickets,
    (SELECT count(*) FROM "Ticket" WHERE source='synthetic') AS synthetic_tickets,
    (SELECT count(DISTINCT organization) FROM "Ticket") AS organizations,
    (SELECT count(*) FROM "TicketComment") AS comments,
    (SELECT count(*) FROM "GitHubIssue") AS issues,
    (SELECT count(*) FROM "EvaluationLabel") AS labels,
    (SELECT count(*) FROM "TicketSnapshot") AS snapshots,
    (SELECT count(*) FROM "Job") AS jobs,
    (SELECT count(*) FROM "ProposedAction") AS actions`);
  const measured = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)]));
  assert.deepEqual(measured, {
    tickets: 100, synthetic_tickets: 100, organizations: 12, comments: 300,
    issues: 20, labels: 200, snapshots: 400, jobs: 13, actions: 0,
  }, 'Fresh seed must produce the complete synthetic dataset and durable pending work');
  const { rows: settings } = await database.query(`SELECT "dataMode", "jevMode", "allowLiveWrites", "allowLiveDataProcessing", "includeInternalNotes" FROM "WorkspaceSettings"`);
  assert.deepEqual(settings, [{ dataMode: 'demo', jevMode: 'mock', allowLiveWrites: false, allowLiveDataProcessing: false, includeInternalNotes: false }]);
  const { rows: snapshots } = await database.query(`SELECT id, "ticketId", "ticketVersion", "contentHash", EXTRACT(EPOCH FROM ("asOf" AT TIME ZONE 'UTC')) * 1000 AS "asOfMs", input, "includeInternalNotes", EXTRACT(EPOCH FROM ("createdAt" AT TIME ZONE 'UTC')) * 1000 AS "createdAtMs" FROM "TicketSnapshot" ORDER BY id`);
  for (const snapshot of snapshots) {
    assert.equal(snapshot.ticketVersion, 1);
    assert.equal(snapshot.input.dataSource, 'synthetic');
    assert.equal(snapshot.input.id, snapshot.id);
    assert.equal(snapshot.input.hash, snapshot.contentHash);
    assert.equal(snapshot.input.internalNotesIncluded, snapshot.includeInternalNotes);
    // Prisma stores these timestamp-without-time-zone values in UTC. Extract
    // epoch in SQL so PGlite's JS decoder cannot reinterpret them in local BST.
    const asOfMs = Number(snapshot.asOfMs);
    assert.ok(Number.isFinite(asOfMs));
    assert.ok(Number.isFinite(Number(snapshot.createdAtMs)));
    assert.equal(Date.parse(snapshot.input.asOf), asOfMs);
    assert.ok(snapshot.input.messages.length > 0);
    for (const message of snapshot.input.messages) {
      const messageMs = Date.parse(message.createdAt);
      assert.ok(Number.isFinite(messageMs) && messageMs <= asOfMs, 'Snapshot must not contain future messages');
      if (!snapshot.includeInternalNotes) assert.equal(message.visibility, 'public', 'Default snapshot must exclude internal notes');
    }
  }
  const { rows: migrations } = await database.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`);
  const expectedMigrations = (await readdir(join(root, 'prisma', 'migrations'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(migrations.map(row => row.migration_name), expectedMigrations, 'Every checked-in migration must be applied');
  const { rows: unfinished } = await database.query(`SELECT count(*) AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`);
  assert.equal(Number(unfinished[0].count), 0);
  return { counts: measured, snapshots, migrations: expectedMigrations };
}

try {
  for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'TYPESAFE_API_KEY', 'GITHUB_TOKEN', 'ZENDESK_OAUTH_CLIENT_SECRET']) {
    assert.equal(env[name], undefined, `Child environment must exclude ${name}`);
  }
  await mkdir(join(root, 'work'), { recursive: true });
  temporaryDirectory = await mkdtemp(join(root, 'work', 'fresh-setup-'));
  database = await PGlite.create(join(temporaryDirectory, 'database'));
  const { rows: initialTables } = await database.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'`);
  assert.equal(initialTables.length, 0, 'Verification must begin with an actually empty database');
  server = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port, maxConnections: 5 });
  await server.start();
  started = true;
  await run('migrate-empty-database', ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await database.query('DISCARD ALL');
  await run('seed-first-pass', ['node_modules/tsx/dist/cli.mjs', 'scripts/seed.ts']);
  const first = await inspect();
  await database.query('DISCARD ALL');
  await run('seed-second-pass', ['node_modules/tsx/dist/cli.mjs', 'scripts/seed.ts']);
  const second = await inspect();
  assert.deepEqual(second, first, 'Second seed must preserve counts and every immutable source snapshot, including creation timestamps');
  abort.signal.throwIfAborted();
  result = { check: 'fresh-portable-setup', status: 'passed', startedEmpty: true, seedPasses: 2, ...second.counts, migrations: second.migrations, snapshotIntegrity: '400 source snapshots unchanged across both seeds', credentials: 'excluded from child processes', runtime: 'PGlite PostgreSQL over dedicated loopback TCP', port, limitation: 'Does not verify native PostgreSQL startup, multiprocess concurrency or a fresh dependency installation' };
} catch (error) {
  failure = error;
} finally {
  clearTimeout(deadline);
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
  for (const clean of [
    async () => { if (started) await server.stop(); },
    async () => { if (database) await database.close(); },
    // Only the exact directory returned by mkdtemp is removed.
    async () => { if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }); },
  ]) {
    try { await clean(); } catch (error) { failure ??= error; }
  }
}
if (failure) {
  console.error(JSON.stringify({ check: 'fresh-portable-setup', status: 'failed', error: String(failure instanceof Error ? failure.message : failure).slice(0, 1000) }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ...result, ownedTemporaryDatabaseRemoved: true }));
}
