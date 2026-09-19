import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Client } from 'pg';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function ensurePortablePostgres() {
  const owned = [];
  for (const [name, port] of [['zenjev_demo', 55432], ['zenjev_test', 55433]]) {
    const connection = new Client({connectionString:`postgresql://demo:demo@127.0.0.1:${port}/${name}`,connectionTimeoutMillis:1000});
    let running = false;
    try { await connection.connect(); running = true; } catch {} finally { await connection.end().catch(() => {}); }
    if (running) continue;
    const dataDir = resolve(`.local/portable-${name}`);
    await mkdir(dataDir, {recursive:true});
    const db = await PGlite.create(dataDir);
    const server = new PGLiteSocketServer({db,host:'127.0.0.1',port,maxConnections:20});
    await server.start();
    owned.push({db,server});
  }
  console.log('Portable development PostgreSQL (PGlite): demo :55432, isolated tests :55433. This is not native PostgreSQL concurrency evidence.');
  return {owned:owned.length>0,stop:async()=>{for(const {db,server} of owned){await server.stop();await db.close();}}};
}
