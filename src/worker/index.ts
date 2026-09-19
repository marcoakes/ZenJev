import { db } from '../server/db';
import { validateRuntimeConfig } from '../server/auth';
import { runOnce,scheduleReconciliation } from './processor';
validateRuntimeConfig();
let running=true;
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
const workerId=`worker-${process.pid}`;
async function main(){
 console.log(JSON.stringify({event:'worker.started',workerId,dataMode:process.env.DATA_MODE??'demo',jevMode:process.env.JEV_MODE??'mock'}));
 let lastReconcile=0;
 while(running){
  try{if(Date.now()-lastReconcile>300_000){await scheduleReconciliation();lastReconcile=Date.now();}const job=await runOnce(workerId);if(!job)await new Promise(r=>setTimeout(r,750));}
  catch(error){console.error(JSON.stringify({event:'worker.error',code:error instanceof Error?error.name:'Error'}));await new Promise(r=>setTimeout(r,2000));}
 }
 await db.$disconnect();
}
void main();
