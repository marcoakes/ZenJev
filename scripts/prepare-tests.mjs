import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {demoEnvironment} from './environment.mjs';
const database=process.env.ZENJEV_TEST_DATABASE_URL||'postgresql://demo:demo@127.0.0.1:55433/zenjev_test?pgbouncer=true&statement_cache_size=0&connection_limit=1';
const url=new URL(database);
if(url.pathname!=='/zenjev_test'||!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Test setup requires the isolated loopback zenjev_test database.');
if(url.port==='55433'){
  const client=new Client({connectionString:database});
  await client.connect();await client.query('DISCARD ALL');await client.end();
}
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:demoEnvironment({DATABASE_URL:database}),stdio:'inherit'});
process.exitCode=result.status??1;
