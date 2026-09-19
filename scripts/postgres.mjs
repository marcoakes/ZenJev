import { Client } from 'pg';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const connectionString = 'postgresql://demo:demo@127.0.0.1:55432/postgres';
async function connect() { const client = new Client({ connectionString, connectionTimeoutMillis: 1500 }); await client.connect(); return client; }

export async function ensurePostgres() {
  let server;
  let client;
  try { client = await connect(); } catch {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const databaseDir = resolve('.local/postgres');
    await mkdir(resolve('.local'), { recursive: true });
    server = new EmbeddedPostgres({ databaseDir, user: 'demo', password: 'demo', port: 55432, persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1', '-k', ''], onLog: () => {}, onError: () => {} });
    try { await access(resolve(databaseDir, 'PG_VERSION')); } catch { await server.initialise(); }
    await server.start();
    client = await connect();
  }
  try {
    for (const name of ['zenjev_demo', 'zenjev_test']) {
      const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
      if (!result.rowCount) await client.query(`CREATE DATABASE "${name}"`);
    }
    const result = await client.query('SHOW server_version');
    console.log(`Local PostgreSQL ${result.rows[0].server_version} ready on 127.0.0.1:55432 (existing data preserved).`);
  } finally { await client.end(); }
  return { owned: !!server, stop: async () => { if (server) await server.stop(); } };
}
