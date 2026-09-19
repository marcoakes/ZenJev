import { spawn } from 'node:child_process';
import { ensurePostgres } from './postgres.mjs';
import { ensurePortablePostgres } from './portable-postgres.mjs';
import { Client } from 'pg';
import { createConnection } from 'node:net';
if (!process.argv.includes('--database-only')) {
  const occupied = await new Promise(resolve => {
    const socket = createConnection({host:'127.0.0.1',port:3000});
    socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',()=>resolve(false));
    socket.setTimeout(1000,()=>{socket.destroy();resolve(false);});
  });
  if (occupied) throw new Error('Port 3000 is already in use. Stop that app before migrations or startup; no database changes were made.');
}
const children = new Set();
const database = await (process.argv.includes('--portable') ? ensurePortablePostgres() : ensurePostgres());
const start = (args) => { const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env }); children.add(child); child.on('exit', () => children.delete(child)); return child; };
const run = (args) => new Promise((resolve, reject) => { const child = start(args); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Command ${args[0]} failed (${code})`))); });
let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 500));
  await database.stop();
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown(0));
try {
  if (process.argv.includes('--database-only')) {
    console.log('Database-only mode; Ctrl+C stops this owned PostgreSQL process.');
    setInterval(() => {}, 60_000);
  } else {
    if (process.argv.includes('--portable')) {
      // The development wire multiplexer retains prepared statement names between clients.
      // Clear them only before startup, before this process launches the web app and worker.
      const client = new Client({connectionString:process.env.DATABASE_URL});
      await client.connect();await client.query('DISCARD ALL');await client.end();
    }
    await run(['node_modules/prisma/build/index.js', 'generate']);
    await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    await run(['--import', 'tsx', 'scripts/seed.ts']);
    if (process.argv.includes('--prepare-only')) await shutdown(0);
    else {
      start(['--import', 'tsx', 'src/worker/index.ts']).on('exit', code => { if (!shuttingDown) void shutdown(code || 1); });
      start(['node_modules/next/dist/bin/next', process.argv.includes('--production') ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', '3000']).on('exit', code => { if (!shuttingDown) void shutdown(code || 1); });
      console.log('ZenJev: http://127.0.0.1:3000 — Synthetic data / Mock decisions / Dry run only.');
    }
  }
} catch (error) { console.error(error.message); await shutdown(1); }
