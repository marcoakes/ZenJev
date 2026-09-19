import { spawn } from 'node:child_process';
import { demoEnvironment } from './environment.mjs';

// This gate never substitutes the portable wire adapter for native PostgreSQL.
const database = process.env.ZENJEV_TEST_DATABASE_URL || 'postgresql://demo:demo@127.0.0.1:55433/zenjev_test';
const url = new URL(database);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/zenjev_test' || url.port !== '55433') {
  throw new Error('Native concurrency checks require the isolated loopback zenjev_test database on port 55433.');
}
url.searchParams.delete('pgbouncer');
url.searchParams.set('connection_limit', '4');
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.native.config.ts'], {
  stdio: 'inherit',
  env: demoEnvironment({ DATABASE_URL: url.href, TEST_DATABASE_URL: url.href, NATIVE_DATABASE_TESTS: 'true', NODE_ENV: 'test' }),
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
