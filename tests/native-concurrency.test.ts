import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { Client } from 'pg';
import { demoEnvironment } from '../scripts/environment.mjs';

const database = process.env.TEST_DATABASE_URL;
const children = new Set<ChildProcess>();
let db: typeof import('../src/server/db').db;
let flow: typeof import('../src/server/workflows');
let inspector: Client;
let blocker: Client;
const actor = { id: 'native-reviewer', role: 'admin' as const, demo: true, csrfToken: 'local-loopback-demo' };
type Message = { event: string; pid?: number; job?: { id: string } | null; ok?: boolean; message?: string };
type NativeChild = { child: ChildProcess; pid: number; messages: Message[]; completed: Promise<number | null>; start(): void; event(name: string): Promise<Message> };

async function launch(operation: string, id = '', name = `native-${operation}-${crypto.randomUUID()}`): Promise<NativeChild> {
  const url = new URL(database!);
  url.searchParams.set('connection_limit', '1');
  const child = fork('scripts/native-worker-test-child.ts', [operation, id, name], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...demoEnvironment({ DATABASE_URL: url.href, TEST_DATABASE_URL: url.href, NATIVE_DATABASE_TESTS: 'true' }), NODE_ENV: 'test' },
  });
  children.add(child);
  const messages: Message[] = [];
  let output = '';
  child.stdout?.on('data', chunk => { output = (output + chunk).slice(-8_000); });
  child.stderr?.on('data', chunk => { output = (output + chunk).slice(-8_000); });
  child.on('message', message => messages.push(message as Message));
  const completed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => { children.delete(child); resolve(code); });
  });
  async function event(name: string) {
    let observed: Message | undefined;
    await expect.poll(() => {
      observed = messages.find(message => message.event === name);
      if (!observed && (child.exitCode !== null || child.signalCode !== null)) throw new Error(`Native child exited before ${name}: ${output}`);
      return Boolean(observed);
    }, { timeout: 10_000, interval: 20 }).toBe(true);
    return observed!;
  }
  const ready = await event('ready');
  return { child, pid: ready.pid!, messages, completed, start: () => child.send({ event: 'start' }), event };
}
async function waitingOnLock(pids: number[]) {
  const result = await inspector.query<{ count: string }>('SELECT count(*) FROM pg_stat_activity WHERE pid = ANY($1::int[]) AND wait_event_type = $2', [pids, 'Lock']);
  return Number(result.rows[0].count);
}
async function approvedAction(ticketId: string) {
  await flow.evaluateTicket(ticketId, 'native-concurrency');
  const action = await flow.proposeAction(ticketId, 'route', { destination: 'integrations', reason: 'Native concurrency fixture routing' }, actor);
  await flow.approveAction(action.id, actor);
  return action;
}
async function killOwned(worker: NativeChild) {
  worker.child.kill('SIGKILL');
  await worker.completed;
}

describe('Native PostgreSQL 17: independent processes, real locks and crash recovery', () => {
  beforeAll(async () => {
    if (!database || process.env.NATIVE_DATABASE_TESTS !== 'true') throw new Error('Use scripts/check-native.mjs with the explicit isolated native database');
    const url = new URL(database);
    if (url.pathname !== '/zenjev_test' || url.port !== '55433' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Refusing any database except the isolated native test service');
    process.env.DATABASE_URL = database;
    inspector = new Client({ connectionString: database, connectionTimeoutMillis: 5_000 });
    blocker = new Client({ connectionString: database, connectionTimeoutMillis: 5_000 });
    await inspector.connect(); await blocker.connect();
    const native = await inspector.query('SELECT version(), current_database() AS database, current_setting(\'server_version_num\')::int AS version_number, pg_backend_pid() AS pid');
    const other = await blocker.query('SELECT pg_backend_pid() AS pid');
    expect(native.rows[0].database).toBe('zenjev_test');
    expect(native.rows[0].version_number).toBeGreaterThanOrEqual(170000);
    expect(native.rows[0].version_number).toBeLessThan(180000);
    expect(native.rows[0].version).not.toMatch(/pglite|wasm|emscripten/i);
    expect(native.rows[0].pid).not.toBe(other.rows[0].pid);
    console.log(JSON.stringify({ event: 'native_database_verified', version: native.rows[0].version, independentBackendPids: [native.rows[0].pid, other.rows[0].pid] }));
    ({ db } = await import('../src/server/db'));
    flow = await import('../src/server/workflows');
    await (await import('../src/server/seed')).seedDemo();
  });
  beforeEach(async () => {
    await db.job.deleteMany();
    await db.workspaceSettings.update({ where: { id: 'workspace' }, data: { dataMode: 'demo', jevMode: 'mock', allowLiveWrites: false, allowLiveDataProcessing: false } });
  });
  afterEach(async () => {
    await blocker?.query('ROLLBACK');
    await Promise.all([...children].map(async child => {
      const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
    }));
  });
  afterAll(async () => { await db?.$disconnect(); await inspector?.end(); await blocker?.end(); });

  it('a simultaneous approval cannot survive a replacement preview on another database connection', async () => {
    await flow.evaluateTicket('ticket-080', 'native-race');
    const action = await flow.proposeAction('ticket-080', 'route', { destination: 'integrations', reason: 'Original native race preview' }, actor);
    const approving = await launch('approve', action.id);
    const editing = await launch('edit', action.id);
    expect(approving.pid).not.toBe(editing.pid);
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM "ProposedAction" WHERE id=$1 FOR UPDATE', [action.id]);
    approving.start(); editing.start();
    // Both application transactions really reach the database lock before either can win.
    await expect.poll(() => waitingOnLock([approving.pid, editing.pid]), { timeout: 3_000, interval: 20 }).toBe(2);
    await blocker.query('COMMIT');
    expect((await editing.event('result')).ok).toBe(true);
    const approvalResult = await approving.event('result');
    if (!approvalResult.ok) expect(approvalResult.message).toMatch(/changed|preview/i);
    await Promise.all([editing.completed, approving.completed]);
    const persisted = await db.proposedAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(persisted.state).toBe('proposed');
    expect(persisted.payload).toMatchObject({ reason: 'A separately reviewed replacement preview' });
    expect(await db.approval.count({ where: { actionId: action.id, invalidatedAt: null } })).toBe(0);
    await expect(flow.queueAction(action.id, actor)).rejects.toThrow(/Approve/);
  });

  it('two simultaneous independent workers claim a queued job exactly once', async () => {
    const job = await flow.enqueue('evaluate', { ticketId: 'ticket-081' }, 'native-atomic-claim');
    const left = await launch('claim'), right = await launch('claim');
    expect(left.pid).not.toBe(right.pid);
    left.start(); right.start();
    const claims = await Promise.all([left.event('claimed'), right.event('claimed')]);
    expect(claims.filter(message => message.job?.id === job.id)).toHaveLength(1);
    expect(claims.filter(message => message.job === null)).toHaveLength(1);
    expect(await Promise.all([left.completed, right.completed])).toEqual([0, 0]);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(1);
  });

  it('a killed claimant is recovered by a fresh process after its real lease expires', async () => {
    const baseline = await db.decisionRun.count({ where: { ticketId: 'ticket-082' } });
    const job = await flow.enqueue('evaluate', { ticketId: 'ticket-082' }, 'native-killed-claimant');
    const crashed = await launch('claim-and-hold'); crashed.start();
    expect((await crashed.event('claimed')).job?.id).toBe(job.id);
    await killOwned(crashed);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('running');
    await expect.poll(async () => (await inspector.query('SELECT "leaseUntil" < NOW() AS expired FROM "Job" WHERE id=$1', [job.id])).rows[0].expired, { timeout: 5_000, interval: 25 }).toBe(true);
    const replacement = await launch('run-once'); replacement.start();
    expect((await replacement.event('result')).ok).toBe(true); expect(await replacement.completed).toBe(0);
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ state: 'succeeded', attempts: 2, leaseUntil: null, lastError: null });
    expect(await db.decisionRun.count({ where: { ticketId: 'ticket-082' } })).toBe(baseline + 1);
  });

  it('a process killed after execution reservation is reconciled without replaying the action', async () => {
    const action = await approvedAction('ticket-083');
    await flow.queueAction(action.id, actor);
    const job = await db.job.findUniqueOrThrow({ where: { dedupKey: `action:${action.id}` } });
    const crashed = await launch('claim-and-execute');
    await blocker.query('BEGIN');
    // SHARE permits the worker's initial receipt SELECT but blocks the later INSERT.
    await blocker.query('LOCK TABLE "ActionAttempt" IN SHARE MODE');
    crashed.start(); expect((await crashed.event('claimed')).job?.id).toBe(job.id);
    await expect.poll(() => waitingOnLock([crashed.pid]), { timeout: 3_000, interval: 20 }).toBe(1);
    expect((await db.proposedAction.findUniqueOrThrow({ where: { id: action.id } })).state).toBe('executing');
    await killOwned(crashed); await blocker.query('COMMIT');
    await expect.poll(async () => (await inspector.query('SELECT "leaseUntil" < NOW() AS expired FROM "Job" WHERE id=$1', [job.id])).rows[0].expired, { timeout: 5_000, interval: 25 }).toBe(true);
    const replacement = await launch('run-once'); replacement.start();
    expect((await replacement.event('result')).ok).toBe(true); expect(await replacement.completed).toBe(0);
    expect((await db.proposedAction.findUniqueOrThrow({ where: { id: action.id } })).state).toBe('needs_reconciliation');
    expect(await db.actionAttempt.count({ where: { actionId: action.id } })).toBe(0);
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ state: 'succeeded', attempts: 2 });
  });
});
