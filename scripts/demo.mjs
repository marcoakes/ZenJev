import { spawn } from 'node:child_process';
import { demoEnvironment } from './environment.mjs';
if (process.env.DATA_MODE === 'live' || process.env.JEV_MODE === 'live') throw new Error('npm run demo is synthetic/mock only. Use the documented explicit live startup instead.');
const portable = process.argv.includes('--portable');
const child = spawn(process.execPath, ['scripts/local-stack.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env: demoEnvironment(portable ? { DATABASE_ENGINE:'portable', DATABASE_URL:'postgresql://demo:demo@127.0.0.1:55432/zenjev_demo?pgbouncer=true&statement_cache_size=0&connection_limit=1' } : { DATABASE_ENGINE:'native' }) });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
