import {readFile,symlink,mkdir} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {cleanEnvironment} from './environment.mjs';
// npm ci --ignore-scripts avoids running transitive install scripts. Restore only
// the pinned native PostgreSQL package's in-package shared-library symlinks.
const platform=process.platform==='win32'?'windows':process.platform;
const directory=resolve(`node_modules/@embedded-postgres/${platform}-${process.arch}`);
let links=[];
try {links=JSON.parse(await readFile(resolve(directory,'native/pg-symlinks.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;}
for(const {source,target} of links){
  const from=resolve(directory,source),to=resolve(directory,target);
  if(!from.startsWith(directory+sep)||!to.startsWith(directory+sep))throw new Error('Refusing a PostgreSQL symlink outside its pinned package.');
  await mkdir(dirname(to),{recursive:true});
  try{await symlink(relative(dirname(to),from),to);}catch(error){if(error.code!=='EEXIST')throw error;}
}
const generated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','generate'],{env:cleanEnvironment(),stdio:'inherit'});
process.exitCode=generated.status??1;
