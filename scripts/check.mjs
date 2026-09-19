import { spawn } from 'node:child_process';
import { cleanEnvironment, demoEnvironment } from './environment.mjs';
const [task, ...args] = process.argv.slice(2);
const commands = {
  lint: ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings=0'],
  typecheck: ['node_modules/typescript/bin/tsc', '--noEmit'],
  test: ['node_modules/vitest/vitest.mjs', 'run'],
  browser: ['node_modules/@playwright/test/cli.js', 'test'],
  build: ['node_modules/next/dist/bin/next', 'build'],
};
if (!commands[task]) throw new Error('Unknown check');
const testDatabase = process.env.ZENJEV_TEST_DATABASE_URL || 'postgresql://demo:demo@127.0.0.1:55433/zenjev_test?pgbouncer=true&statement_cache_size=0&connection_limit=1';
const env = task === 'lint' || task === 'typecheck' ? cleanEnvironment() : demoEnvironment({ DATABASE_URL:testDatabase, TEST_DATABASE_URL:testDatabase });
if (process.env.WRINGER_ARTIFACTS_DIR) env.WRINGER_ARTIFACTS_DIR = process.env.WRINGER_ARTIFACTS_DIR;
const child = spawn(process.execPath, [...commands[task], ...args], { env, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
