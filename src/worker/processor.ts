import type { Job } from '@prisma/client';
import { db } from '../server/db';
import { getSettings } from '../server/settings';
import { evaluateTicket,validateAction,bindingFor,json,safeError,audit,enqueue } from '../server/workflows';
import { integrationProviders,syncIssues,syncZendeskPage,ingestZendeskTicket } from '../server/integrations';
import { makeTicketFixture } from '../server/fixtures';
import type { ActionApproval } from '../domain';
import { ProviderError } from '../providers';
/** Atomic PostgreSQL lease; locked rows are skipped by concurrent workers. */
export async function claimJob(workerId:string,leaseMs=60_000):Promise<Job|null> {
 const rows=await db.$queryRaw<Job[]>`UPDATE "Job" SET state='running',"claimedBy"=${workerId},"leaseUntil"=NOW()+(${leaseMs} * INTERVAL '1 millisecond'),attempts=attempts+1,"updatedAt"=NOW() WHERE id=(SELECT id FROM "Job" WHERE ((state='queued' AND "availableAt"<=NOW()) OR (state='running' AND "leaseUntil"<NOW())) AND attempts<"maxAttempts" ORDER BY "availableAt","createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
 return rows[0]??null;
}
export async function executeAction(actionId:string,adapters?:Awaited<ReturnType<typeof integrationProviders>>) {
 const action=await db.proposedAction.findUnique({where:{id:actionId},include:{ticket:true,decision:true,approvals:{where:{invalidatedAt:null},orderBy:{createdAt:'desc'},take:1},attempts:true}});
 if(!action)throw new Error('Action not found');
 if(['succeeded','failed','stale','rejected','needs_reconciliation'].includes(action.state))return action;
 if(action.state==='executing'){
  // A previous process may have sent the mutation. Do not repeat it after a crash.
  return db.proposedAction.update({where:{id:actionId},data:{state:'needs_reconciliation',error:'Worker lease expired during execution; reconcile remote marker before any retry'}});
 }
 if(action.state!=='queued')throw new Error('Action is not queued');
 await validateAction(action);
 const transitioned=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id=${action.ticketId} FOR UPDATE`;
  const current=await tx.proposedAction.findUniqueOrThrow({where:{id:actionId},include:{ticket:true,approvals:{where:{invalidatedAt:null},orderBy:{createdAt:'desc'},take:1}}});
  const latest=await tx.decisionRun.findFirst({where:{ticketId:action.ticketId,status:'succeeded'},orderBy:{createdAt:'desc'}});
  if(current.state!=='queued')return {count:0};
  if(current.payloadHash!==action.payloadHash||current.ticket.version!==action.ticketVersion||latest?.id!==action.decisionId||current.approvals[0]?.bindingHash!==action.approvals[0]?.bindingHash||current.approvals[0].expiresAt<=new Date()){await tx.proposedAction.update({where:{id:actionId},data:{state:'stale',error:'Action approval context changed before execution reservation'}});return {count:0};}
  if(await tx.proposedAction.count({where:{ticketId:action.ticketId,id:{notIn:[actionId,...(action.parentActionId?[action.parentActionId]:[])]},state:{in:['executing','needs_reconciliation']}}}))throw new Error('Another action on this ticket is executing or awaiting reconciliation');
  return tx.proposedAction.updateMany({where:{id:actionId,state:'queued'},data:{state:'executing'}});
 });
 if(!transitioned.count)return db.proposedAction.findUniqueOrThrow({where:{id:actionId}});
 const attempt=await db.actionAttempt.create({data:{actionId,operation:action.type,state:'executing',marker:`zenjev-action:${actionId}`}});
 try {
  if(action.mode==='dry_run') {
   // This branch intentionally resolves no adapter or credential. Writes are impossible here.
   const receipt={label:'Dry run — no external change',simulated:true,actionId,operation:action.type,intendedMutation:action.payload,completedAt:new Date().toISOString(),externalCalls:0};
   await db.$transaction(async tx=>{
    await tx.actionAttempt.update({where:{id:attempt.id},data:{state:'succeeded',receipt:json(receipt)}});
    await tx.proposedAction.update({where:{id:actionId},data:{state:'succeeded',receipt:json(receipt)}});
    if(action.parentActionId){const parent=await tx.proposedAction.findUniqueOrThrow({where:{id:action.parentActionId}});await tx.proposedAction.update({where:{id:parent.id},data:{state:'succeeded',error:null,receipt:json({...parent.receipt as object,backlinkState:'succeeded',backlinkActionId:actionId})}});}
    await tx.auditEvent.create({data:{actor:'worker',action:'action.dry_run',recordId:action.ticketId,provider:action.provider,outcome:'succeeded',details:json({actionId,attemptId:attempt.id,externalCalls:0})}});
   });return db.proposedAction.findUniqueOrThrow({where:{id:actionId}});
  }
  const settings=await getSettings();
  const approved=action.approvals[0],approval:ActionApproval={hash:approved.bindingHash,reviewerId:approved.reviewer,reviewerRole:approved.reviewerRole as 'admin',expiresAt:approved.expiresAt.toISOString(),status:'approved'};
  const clients=adapters??await integrationProviders();
  const controls={allowLiveWrites:settings.allowLiveWrites&&process.env.ALLOW_LIVE_WRITES==='true',allowLiveDataProcessing:settings.allowLiveDataProcessing&&process.env.ALLOW_LIVE_DATA_PROCESSING==='true',authenticated:true,currentTicketVersion:action.ticket.version,currentDecisionVersion:action.decision.ticketVersion,repositories:settings.repositories as string[],groups:Object.keys(settings.teamMappings as object),...(action.type==='create_issue'?{issueTarget:{provider:clients.issueProvider,host:clients.issues.host}}:{})};
  const current=await clients.zendesk.ticket(action.ticket.sourceId);
  if(new Date(current.updated_at).getTime()!==action.ticket.sourceUpdatedAt.getTime())throw new ProviderError('conflict','Ticket changed at source; return to review');
  let receipt:unknown;
  if(action.type==='create_issue'){
   const created=await clients.issues.createIssue(bindingFor(action,action.decision),approval,controls);
   // Persist the issue receipt before a separately approved backlink can ever be attempted.
   receipt={...created,backlinkState:'requires_separate_approval',message:'Issue created. Zendesk backlink is a separate action and has not been sent.'};
   await db.proposedAction.update({where:{id:actionId},data:{remoteIssueId:created.id,remoteIssueUrl:created.url,receipt:json(receipt)}});
  }else receipt=await clients.zendesk.updateTicket(bindingFor(action,action.decision),approval,controls,action.ticket.sourceUpdatedAt.toISOString());
  await db.$transaction(async tx=>{
   await tx.actionAttempt.update({where:{id:attempt.id},data:{state:'succeeded',receipt:json(receipt)}});
   await tx.proposedAction.update({where:{id:actionId},data:{state:'succeeded',receipt:json(receipt)}});
    if(action.parentActionId){const parent=await tx.proposedAction.findUniqueOrThrow({where:{id:action.parentActionId}});await tx.proposedAction.update({where:{id:parent.id},data:{state:'succeeded',error:null,receipt:json({...parent.receipt as object,backlinkState:'succeeded',backlinkActionId:actionId})}});}
   await tx.auditEvent.create({data:{actor:'worker',action:'action.executed',recordId:action.ticketId,provider:action.provider,outcome:'succeeded',details:json({actionId,attemptId:attempt.id})}});
  });return db.proposedAction.findUniqueOrThrow({where:{id:actionId}});
 }catch(error){
  const code=error instanceof ProviderError?error.code:'uncertain';
  const state=code==='conflict'?'stale':code==='uncertain'||code==='transient'?'needs_reconciliation':'failed';
  await db.$transaction(async tx=>{
   await tx.actionAttempt.update({where:{id:attempt.id},data:{state,error:safeError(error)}});
   await tx.proposedAction.update({where:{id:actionId},data:{state,error:safeError(error)}});
   await tx.auditEvent.create({data:{actor:'worker',action:'action.failed',recordId:action.ticketId,provider:action.provider,outcome:state,details:json({actionId,error:safeError(error)})}});
  });return db.proposedAction.findUniqueOrThrow({where:{id:actionId}});
 }
}
export async function reconcileAction(actionId:string) {
 const action=await db.proposedAction.findUniqueOrThrow({where:{id:actionId}});
 if(action.state!=='needs_reconciliation')return action;
 if(action.mode==='dry_run'){
  const existing=await db.actionAttempt.findFirst({where:{actionId,state:'simulated_remote_created'}});
  if(!existing)throw new Error('No simulated remote marker found; manual review required');
  const prior=action.receipt as Record<string,unknown>|null;
  const receipt={...prior,label:'Dry run — no external change',simulated:true,reconciled:true,externalCalls:0,remoteIssueId:action.remoteIssueId,attemptId:existing.id};
  await audit('worker','action.reconciled',action.ticketId,'succeeded',{actionId,externalCalls:0});
  return db.proposedAction.update({where:{id:actionId},data:{state:prior?.backlinkState==='failed'?'needs_reconciliation':'succeeded',receipt:json(receipt),error:prior?.backlinkState==='failed'?'Created issue is reconciled; backlink still requires separate approval and execution':null}});
 }
 const clients=await integrationProviders();
 const ticket=await db.ticket.findUniqueOrThrow({where:{id:action.ticketId}});
 // Reconcile against the provider and host the action was approved for, never the currently selected one.
 if(action.type==='create_issue'&&(action.issueProvider!==clients.issueProvider||action.issueHost!==clients.issues.host))throw new Error('Configured issue provider or host differs from the approved destination; reconcile manually');
 const found=action.type==='create_issue'?await clients.issues.reconcileIssue(action.destination,action.id):action.type==='internal_note'?await clients.zendesk.reconcileNote(ticket.sourceId,action.id):null;
 if(!found)throw new Error('No authoritative marker found. Action remains in reconciliation; no automatic retry.');
 return db.proposedAction.update({where:{id:actionId},data:{state:'succeeded',receipt:json({reconciled:true,result:found}),error:null,remoteIssueId:typeof found==='object'?found.id:action.remoteIssueId}});
}
async function replayStep() {
 const settings=await getSettings();if(settings.dataMode!=='demo'||settings.replayState!=='playing')return;
 const next=settings.replayCursor+1;if(next>12){await db.workspaceSettings.update({where:{id:'workspace'},data:{replayState:'paused'}});return;}
 const {comments,...ticket}=makeTicketFixture(100+next);
 await db.$transaction(async tx=>{
  await tx.ticket.upsert({where:{id:ticket.id},update:{},create:{...ticket,comments:{create:comments}}});
  await tx.workspaceSettings.update({where:{id:'workspace'},data:{replayCursor:next}});
  await tx.job.upsert({where:{dedupKey:`replay-evaluate:${next}`},update:{},create:{kind:'evaluate',payload:{ticketId:ticket.id},dedupKey:`replay-evaluate:${next}`}});
  await tx.job.create({data:{kind:'replay',payload:{},dedupKey:`replay-step:${next}:${Date.now()}`,availableAt:new Date(Date.now()+1800)}});
 });
}
export async function processJob(job:Job) {
 const p=job.payload as Record<string,unknown>;
 switch(job.kind){
  case 'evaluate': await evaluateTicket(String(p.ticketId));break;
  case 'action': await executeAction(String(p.actionId));break;
  case 'reconcile': await reconcileAction(String(p.actionId));break;
  // `github_sync` remains accepted so jobs queued before GitLab support still run.
  case 'issue_sync': case 'github_sync': await syncIssues();break;
  case 'zendesk_sync': await syncZendeskPage();break;
  case 'zendesk_ticket': await ingestZendeskTicket(String(p.sourceId));break;
  case 'replay':await replayStep();break;
  default:throw new Error('Unsupported job kind');
 }
}
export async function runOnce(workerId=`worker-${process.pid}`) {
 await db.workerHealth.upsert({where:{id:workerId},update:{lastSeenAt:new Date()},create:{id:workerId,lastSeenAt:new Date()}});
 // Exhausted expired leases become visible failed records instead of disappearing.
 await db.$executeRaw`UPDATE "Job" SET state='failed',"lastError"='Lease expired after maximum attempts',"updatedAt"=NOW() WHERE state='running' AND "leaseUntil"<NOW() AND attempts>="maxAttempts"`;
 const job=await claimJob(workerId);if(!job)return null;
 const heartbeat=setInterval(()=>{void db.job.updateMany({where:{id:job.id,state:'running',claimedBy:workerId},data:{leaseUntil:new Date(Date.now()+60_000)}}).catch(()=>{});},15_000);
 try{
  await processJob(job);
  await db.job.updateMany({where:{id:job.id,claimedBy:workerId,state:'running'},data:{state:'succeeded',leaseUntil:null,lastError:null}});
 }catch(error){
  const attempts=job.attempts,failed=attempts>=job.maxAttempts;
  await db.job.updateMany({where:{id:job.id,claimedBy:workerId},data:{state:failed?'failed':'queued',leaseUntil:null,availableAt:new Date(Date.now()+Math.max(Math.min(60_000,1000*2**attempts),error instanceof ProviderError?error.retryAfterMs??0:0)),lastError:safeError(error)}});
  console.error(JSON.stringify({event:'job.failed',jobId:job.id,kind:job.kind,attempt:attempts,error:safeError(error)}));
 }finally{clearInterval(heartbeat);await db.workerHealth.update({where:{id:workerId},data:{lastSeenAt:new Date(),lastJobId:job.id}});}
 return job;
}
export async function scheduleReconciliation() {
 const s=await getSettings();if(s.dataMode!=='live')return;
 const bucket=Math.floor(Date.now()/300_000);
 await enqueue('zendesk_sync',{},`reconcile-zendesk:${bucket}`);
 await enqueue('issue_sync',{},`reconcile-issues:${bucket}`);
}
