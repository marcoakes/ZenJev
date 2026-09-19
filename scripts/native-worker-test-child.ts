import { db } from '../src/server/db';
import { approveAction, editAction } from '../src/server/workflows';
import { claimJob, executeAction, runOnce } from '../src/worker/processor';

// Only the isolated, explicitly enabled native integration test may launch this process.
const database = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.NATIVE_DATABASE_TESTS !== 'true' || database.pathname !== '/zenjev_test' || database.port !== '55433' || !['127.0.0.1', 'localhost'].includes(database.hostname) || !process.send) {
  throw new Error('Native test child requires its guarded test database and an IPC parent.');
}
const [operation, id, name] = process.argv.slice(2);
const actor = { id: name, role: 'admin' as const, demo: true, csrfToken: 'local-loopback-demo' };
const send = (message: unknown) => process.send?.(message);
async function main() {
  const backend = await db.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  send({ event: 'ready', pid: backend[0].pid });
  await new Promise<void>(resolve => process.once('message', () => resolve()));
  if (operation === 'approve') await approveAction(id, actor);
  else if (operation === 'edit') {
    const action = await db.proposedAction.findUniqueOrThrow({ where: { id } });
    await editAction(id, { ...action.payload as object, reason: 'A separately reviewed replacement preview' }, actor);
  } else if (operation === 'claim' || operation === 'claim-and-hold' || operation === 'claim-and-execute') {
    const job = await claimJob(name, operation === 'claim' ? 60_000 : 2_000);
    send({ event: 'claimed', job });
    if (operation === 'claim-and-hold') await new Promise<void>(resolve => process.once('message', () => resolve()));
    if (operation === 'claim-and-execute') {
      if (!job || job.kind !== 'action') throw new Error('Expected the isolated action job');
      await executeAction(String((job.payload as { actionId: string }).actionId));
    }
  } else if (operation === 'run-once') await runOnce(name);
  else throw new Error('Unknown native test operation');
  send({ event: 'result', ok: true });
}
main().catch(error => {
  send({ event: 'result', ok: false, message: error instanceof Error ? error.message : 'Native child failed' });
  process.exitCode = 1;
}).finally(async () => { await db.$disconnect(); process.disconnect?.(); });
