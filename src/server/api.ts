import { Prisma } from '@prisma/client';
import { db } from './db';
import {readBoundedText} from './request';
import { authenticate,login,HttpError,validateRuntimeConfig } from './auth';
import { getSettings,publicSettings } from './settings';
import { json,safeError,enqueue,approveLink,proposeAction,editAction,approveAction,queueAction,runEvaluation,audit,proposeBacklink,rejectAction } from './workflows';
import { receiveWebhook } from './integrations';
import { seedDemo } from './seed';
import { TEAMS,type Decision,type Candidate } from '../domain';

const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function bodyOf(request:Request):Promise<Record<string,unknown>> {
 const text=await readBoundedText(request);
 if(!text)return {};
 let result:unknown;try{result=JSON.parse(text);}catch{throw new HttpError(400,'Invalid JSON');}
 if(!result||typeof result!=='object'||Array.isArray(result))throw new HttpError(400,'JSON object required');return result as Record<string,unknown>;
}
function enrichTicket<T extends {decisions?:unknown[];links?:unknown[]}>(ticket:T) {
 const latest=(ticket.decisions?.[0]??null) as {id:string;status:string;output:unknown;error:string;createdAt:Date}|null;
 const decision=latest?.output?{...latest.output as Decision,id:latest.id,status:latest.status,createdAt:latest.createdAt}:latest?{id:latest.id,status:latest.status,error:latest.error}:null;
 const links=ticket.links as {issue:unknown}[]|undefined;
 return {...ticket,decision,match:links?.[0]?.issue??null};
}
async function listTickets(url:URL,actorDemo:boolean) {
 const settings=await getSettings(),q=url.searchParams.get('q')??url.searchParams.get('search')??'';
 const where:Prisma.TicketWhereInput={active:true,...(actorDemo?{source:'synthetic'}:{})};
 if(q)where.OR=[{subject:{contains:q,mode:'insensitive'}},{organization:{contains:q,mode:'insensitive'}},{number:{contains:q}}];
 if(url.searchParams.get('team'))where.currentTeam=url.searchParams.get('team')!;
 const review=url.searchParams.get('review')??url.searchParams.get('reviewState');if(review)where.reviewState=review;
 const all=await db.ticket.findMany({where,include:{decisions:{orderBy:{createdAt:'desc'},take:1},links:{include:{issue:true}}},orderBy:{createdAt:'desc'}});
 let tickets=all.map(enrichTicket);
 const issue=url.searchParams.get('issue'),impact=url.searchParams.get('impact'),provider=url.searchParams.get('provider');
 if(issue==='matched')tickets=tickets.filter(t=>(t.decision as Decision|null)?.proposedIssueId||t.match);
 if(issue==='unmatched')tickets=tickets.filter(t=>!(t.decision as Decision|null)?.proposedIssueId&&!t.match);
 if(impact)tickets=tickets.filter(t=>Math.round((t.decision as Decision|null)?.impact?.value??-1)===Number(impact));
 if(provider)tickets=tickets.filter(t=>(t.decision as Decision|null)?.provider===provider);
 const sort=url.searchParams.get('sort');
 if(sort==='oldest')tickets.reverse();
 if(sort==='subject')tickets.sort((a,b)=>String(a.subject).localeCompare(String(b.subject)));
 if(sort==='confidence')tickets.sort((a,b)=>((b.decision as Decision|null)?.destination?.confidence??-1)-((a.decision as Decision|null)?.destination?.confidence??-1));
 const page=Math.max(1,Number(url.searchParams.get('page'))||1),pageSize=Math.max(1,Math.min(100,Number(url.searchParams.get('pageSize'))||15));
 const [unreviewed,engineering,linked,completed]=await Promise.all([
  db.ticket.count({where:{active:true,...(actorDemo?{source:'synthetic'}:{}),reviewState:{in:['pending','needs_review','ready','failed']}}}),
  db.decisionRun.findMany({where:{status:'succeeded',...(actorDemo?{dataSource:'synthetic'}:{})},distinct:['ticketId'],orderBy:{createdAt:'desc'},select:{output:true}}).then(d=>d.filter(r=>(r.output as unknown as Decision).needsEngineering>=((r.output as unknown as Decision).policy?.engineering??.7)).length),
  db.ticketIssueLink.count({where:{status:'approved',...(actorDemo?{ticket:{source:'synthetic'}}:{})}}),
  db.proposedAction.count({where:{state:'succeeded',...(actorDemo?{dataSource:'synthetic'}:{})}})
 ]);
 const enriched=tickets.slice((page-1)*pageSize,page*pageSize);
 const issueIds=enriched.flatMap(t=>(t.decision as Decision|null)?.proposedIssueId?[(t.decision as unknown as Decision).proposedIssueId!]:[]);
 const matches=await db.gitHubIssue.findMany({where:{id:{in:issueIds}}});
 return {tickets:enriched.map(t=>({...t,match:t.match??matches.find(i=>i.id===(t.decision as Decision|null)?.proposedIssueId)??null})),total:tickets.length,page,pageSize,counts:{unreviewed,engineering,linked,completed},settings};
}
async function detail(ticketId:string,actorDemo:boolean) {
 const ticket=await db.ticket.findUnique({where:{id:ticketId},include:{comments:{orderBy:{createdAt:'asc'}},decisions:{orderBy:{createdAt:'desc'},include:{candidateSnapshot:true,snapshot:true}},links:{include:{issue:true}},actions:{orderBy:{createdAt:'desc'},include:{approvals:{orderBy:{createdAt:'desc'}},attempts:{orderBy:{createdAt:'desc'}}}}}});
 if(!ticket)throw new HttpError(404,'Ticket not found');if(actorDemo&&ticket.source!=='synthetic')throw new HttpError(403,'Demo reviewer cannot access live tickets');
 const latest=ticket.decisions[0],decision=latest?.output as unknown as Decision|undefined;
 const candidates=((latest?.candidateSnapshot?.candidates??[]) as unknown as Candidate[]).map(c=>({...c,probability:decision?.matches.find(m=>m.issueId===c.issue.id)?.probability??null}));
 return {ticket:enrichTicket(ticket),decisions:ticket.decisions,candidates,links:ticket.links,actions:ticket.actions,audit:await db.auditEvent.findMany({where:{recordId:ticketId},orderBy:{createdAt:'desc'},take:100}),settings:await getSettings()};
}
export async function handleApi(request:Request,segments:string[]):Promise<Response> {
 try {
  validateRuntimeConfig();
  const [resource,id,operation]=segments,url=new URL(request.url),method=request.method;
  if(resource==='auth'&&id==='login'&&method==='POST')return await login(request);
  if(resource==='webhooks'&&id==='zendesk'&&method==='POST')return response(await receiveWebhook(request),202);
  const write=!['GET','HEAD'].includes(method),actor=await authenticate(request,write,resource==='settings'&&write||resource==='sync');
  if(resource==='auth'&&id==='me')return response({actor});
  if(resource==='auth'&&id==='logout'&&method==='POST'){
   const sid=request.headers.get('cookie')?.match(/(?:^|;\s*)zenjev_session=([^;]+)/)?.[1];if(sid)await db.session.deleteMany({where:{id:sid}});
   return Response.json({ok:true},{headers:{'set-cookie':'zenjev_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}});
  }
  if(resource==='health'&&method==='GET'){
   const [workers,jobs,sync,settings]=await Promise.all([db.workerHealth.findMany({orderBy:{lastSeenAt:'desc'},take:5}),db.job.groupBy({by:['state'],_count:true}),db.syncCursor.findMany(),publicSettings(actor.csrfToken)]);
   return response({status:'ok',database:'connected',worker:{status:workers.some(w=>Date.now()-w.lastSeenAt.getTime()<90_000)?'healthy':'not running',lastSeenAt:workers[0]?.lastSeenAt??null},workers,jobs,sync,settings,liveIntegrationsVerified:false});
  }
  if(resource==='tickets'&&method==='GET')return response(id?await detail(id,actor.demo):await listTickets(url,actor.demo));
  if(resource==='tickets'&&id&&method==='POST'){
   const ticket=await db.ticket.findUnique({where:{id}});if(!ticket)throw new HttpError(404,'Ticket not found');if(actor.demo&&ticket.source!=='synthetic')throw new HttpError(403,'Live ticket requires authenticated session');
   const body=await bodyOf(request);
   if(operation==='evaluate'){
    const s=await getSettings();
    const dedup=`evaluate:${id}:${ticket.version}:${s.jevMode}:${s.includeInternalNotes}:${Math.floor(Date.now()/5000)}`;
    const job=await enqueue('evaluate',{ticketId:id},dedup);return response({jobId:job.id,status:job.state},202);
   }
   if(operation==='link')return response({link:await approveLink(id,String(body.issueId??''),body.reason?String(body.reason):undefined,actor)});
   if(operation==='route')return response({action:await proposeAction(id,'route',body,actor)},201);
   if(operation==='tags')return response({action:await proposeAction(id,'tags',body,actor)},201);
   if(operation==='note')return response({action:await proposeAction(id,'internal_note',body,actor)},201);
   if(operation==='draft')return response({action:await proposeAction(id,'create_issue',body,actor)},201);
  }
  if(resource==='actions'&&id&&method==='POST'){
   const action=await db.proposedAction.findUnique({where:{id}});if(!action)throw new HttpError(404,'Action not found');if(actor.demo&&action.dataSource!=='synthetic')throw new HttpError(403,'Live action requires authenticated session');
   const body=await bodyOf(request);
   if(operation==='backlink')return response({action:await proposeBacklink(id,actor)},201);
   if(operation==='edit')return response({action:await editAction(id,body.payload,actor)});
   if(operation==='approve')return response({action:await approveAction(id,actor)});
   if(operation==='execute')return response({action:await queueAction(id,actor)},202);
   if(operation==='reject')return response({action:await rejectAction(id,actor)});
   if(operation==='reconcile'){if(action.state!=='needs_reconciliation')throw new HttpError(409,'Action is not awaiting reconciliation');const job=await enqueue('reconcile',{actionId:id},`reconcile:${id}:${Date.now()}`);return response({jobId:job.id},202);}
  }
  if(resource==='engineering'&&method==='GET'){
   const all=await db.gitHubIssue.findMany({where:actor.demo?{source:'synthetic'}:{},include:{links:{where:{status:'approved',...(actor.demo?{ticket:{source:'synthetic'}}:{})},include:{ticket:true}}},orderBy:[{repository:'asc'},{number:'asc'}]});
   const issues=all.filter(i=>i.links.length).map(i=>({...i,tickets:i.links.map(l=>l.ticket),organizationCount:new Set(i.links.map(l=>l.ticket.organization)).size,ticketCount:i.links.length,proposedTeam:i.repository.split('/')[1]}));
   return response({issues,indexCount:all.length,drafts:await db.proposedAction.findMany({where:{type:'create_issue',...(actor.demo?{dataSource:'synthetic'}:{})},include:{ticket:true},orderBy:{createdAt:'desc'}})});
  }
  if(resource==='evaluation'&&method==='GET'){
   const runs=await db.evaluationRun.findMany({where:{...(url.searchParams.get('task')?{task:url.searchParams.get('task')!}:{}),...(url.searchParams.get('split')?{split:url.searchParams.get('split')!}:{}),...(actor.demo?{dataSource:'synthetic'}:{})},orderBy:{createdAt:'desc'},take:20});
   return response({runs,latest:runs[0]??null,metrics:runs[0]?.metrics??null});
  }
  if(resource==='evaluation'&&method==='POST'){
   const body=await bodyOf(request);const run=await runEvaluation({task:body.task?String(body.task):undefined,split:body.split?String(body.split):undefined,threshold:body.threshold===undefined?undefined:Number(body.threshold),newRun:body.newRun===true},actor);
   return response({run,latest:run,metrics:run.metrics});
  }
  if(resource==='settings'&&method==='GET')return response(await publicSettings(actor.csrfToken));
  if(resource==='settings'&&method==='POST'){
   const body=await bodyOf(request),settings=await getSettings();
   const allowed=['threshold','includeInternalNotes','retentionDays','repositories','teamMappings','allowLiveWrites','allowLiveDataProcessing','dataMode','jevMode','policyThresholds','teamCriteria'];
   if(Object.keys(body).some(k=>!allowed.includes(k)))throw new HttpError(400,'Unknown setting or secret field');
   const updates:Prisma.WorkspaceSettingsUpdateInput={};
   if(body.threshold!==undefined){if(typeof body.threshold!=='number'||body.threshold<0||body.threshold>1)throw new HttpError(400,'Threshold must be between 0 and 1');updates.threshold=body.threshold;}
   if(body.policyThresholds!==undefined){
    const p=body.policyThresholds;if(!p||typeof p!=='object'||Array.isArray(p))throw new HttpError(400,'Policy thresholds must be an object');
    const keys=['routingConfidence','engineering','missingInfo','multipleIssues','matchProbability','matchMargin'];
    if(Object.keys(p).length!==keys.length||keys.some(k=>typeof (p as Record<string,unknown>)[k]!=='number'||!Number.isFinite((p as Record<string,number>)[k])||(p as Record<string,number>)[k]<0||(p as Record<string,number>)[k]>1))throw new HttpError(400,'Supply all six policy thresholds as numbers between zero and one');
    updates.policyThresholds=json(p);updates.threshold=body.threshold===undefined?(p as Record<string,number>).routingConfidence:Number(body.threshold);
   }
   if(body.threshold!==undefined||body.policyThresholds!==undefined)updates.policyThresholds=json({...settings.policyThresholds as object,...body.policyThresholds as object,routingConfidence:typeof updates.threshold==='number'?updates.threshold:settings.threshold});
   if(body.teamCriteria!==undefined){const criteria=body.teamCriteria;if(!criteria||typeof criteria!=='object'||Array.isArray(criteria)||Object.keys(criteria).length!==TEAMS.length||TEAMS.some(t=>typeof (criteria as Record<string,unknown>)[t]!=='string'||(criteria as Record<string,string>)[t].trim().length<3||(criteria as Record<string,string>)[t].length>500))throw new HttpError(400,'Supply a 3–500 character description for every fixed team option');updates.teamCriteria=json(criteria);}
   if(body.includeInternalNotes!==undefined){if(typeof body.includeInternalNotes!=='boolean')throw new HttpError(400,'Privacy setting must be boolean');updates.includeInternalNotes=body.includeInternalNotes;}
   if(body.retentionDays!==undefined){if(!Number.isInteger(body.retentionDays)||Number(body.retentionDays)<1||Number(body.retentionDays)>365)throw new HttpError(400,'Retention must be 1–365 days');updates.retentionDays=Number(body.retentionDays);}
   if(body.repositories!==undefined){if(!Array.isArray(body.repositories)||body.repositories.length>20||body.repositories.some(r=>typeof r!=='string'||!/^[\w.-]+\/[\w.-]+$/.test(r)))throw new HttpError(400,'Invalid repository allowlist');updates.repositories=json(body.repositories);}
   if(body.teamMappings!==undefined){if(!body.teamMappings||typeof body.teamMappings!=='object'||Array.isArray(body.teamMappings)||Object.keys(body.teamMappings).some(k=>!(TEAMS as readonly string[]).includes(k))||Object.values(body.teamMappings).some(v=>v!==null&&(typeof v!=='string'||!/^\d+$/.test(v))))throw new HttpError(400,'Invalid team mappings');updates.teamMappings=json(body.teamMappings);}
   if(body.dataMode!==undefined&&body.dataMode!==settings.dataMode)throw new HttpError(403,'Change data mode through reviewed server deployment configuration');
   if(body.jevMode!==undefined&&body.jevMode!==settings.jevMode)throw new HttpError(403,'Change Jev mode through explicit server configuration; activation may incur provider cost');
   for(const [field,env] of [['allowLiveWrites','ALLOW_LIVE_WRITES'],['allowLiveDataProcessing','ALLOW_LIVE_DATA_PROCESSING']] as const){if(body[field]!==undefined){if(typeof body[field]!=='boolean')throw new HttpError(400,'Control must be boolean');if(body[field]===true&&(actor.demo||process.env[env]!=='true'))throw new HttpError(403,'Live activation requires an authenticated admin and enabled server control');updates[field]=body[field];}}
   await db.$transaction(async tx=>{
    await tx.workspaceSettings.update({where:{id:'workspace'},data:updates});
    await tx.proposedAction.updateMany({where:{state:{in:['approved','queued']}},data:{state:'stale',error:'Workspace policy changed; renewed approval required'}});
    await tx.auditEvent.create({data:{actor:actor.id,action:'settings.updated',recordId:'workspace',provider:settings.jevMode==='mock'?'mock':'jev',outcome:'succeeded',details:json({changedFields:Object.keys(updates)})}});
   });return response(await publicSettings(actor.csrfToken));
  }
  if(resource==='audit'&&method==='GET')return response({events:await db.auditEvent.findMany({where:url.searchParams.get('recordId')?{recordId:url.searchParams.get('recordId')!}:{},orderBy:{createdAt:'desc'},take:200})});
  if(resource==='sync'&&method==='POST'){
   if(actor.demo||(await getSettings()).dataMode!=='live')throw new HttpError(403,'Live ingestion requires authenticated live configuration');
   if(!['zendesk','github'].includes(id))throw new HttpError(400,'Unknown integration');
   const job=await enqueue(`${id}_sync`,{},`manual-sync:${id}:${Date.now()}`);return response({jobId:job.id},202);
  }
  if(resource==='demo'&&id==='replay'&&method==='POST'){
   const settings=await getSettings();if(settings.dataMode!=='demo')throw new HttpError(403,'Replay is synthetic-only');const body=await bodyOf(request);
   if(body.action==='play'){await db.workspaceSettings.update({where:{id:'workspace'},data:{replayState:'playing'}});await enqueue('replay',{},`replay:${Date.now()}`);}
   else if(body.action==='pause')await db.workspaceSettings.update({where:{id:'workspace'},data:{replayState:'paused'}});
   else if(body.action==='reset'){
    if(await db.ticket.count({where:{source:{not:'synthetic'}}}))throw new HttpError(403,'Reset refuses a workspace containing live data');
    await db.$transaction(async tx=>{
     await tx.workspaceSettings.update({where:{id:'workspace'},data:{replayState:'paused',replayCursor:0}});
     await tx.job.deleteMany({where:{kind:{in:['evaluate','action','reconcile','replay']}}});
     await tx.proposedAction.deleteMany({where:{dataSource:'synthetic'}});
     await tx.ticket.deleteMany({where:{source:'synthetic'}});
     await tx.evaluationRun.deleteMany({where:{dataSource:'synthetic'}});
    });await seedDemo();
   }else throw new HttpError(400,'Unknown replay command');
   await audit(actor.id,`demo.${body.action}`,'workspace','succeeded');return response({settings:await getSettings()});
  }
  if(resource==='demo'&&id==='scenario'&&method==='POST'){
   if((await getSettings()).dataMode!=='demo')throw new HttpError(403,'Scenarios require synthetic data');const body=await bodyOf(request);
   if(body.scenario==='stale_approval'){
    const ticket=await db.ticket.findUniqueOrThrow({where:{id:String(body.ticketId??'ticket-008')}});if(ticket.source!=='synthetic')throw new HttpError(403,'Synthetic ticket required');
    await db.$transaction(async tx=>{
     await tx.ticketComment.create({data:{id:crypto.randomUUID(),ticketId:ticket.id,sourceId:crypto.randomUUID(),text:'New synthetic customer information: timeout also occurs after a successful callback. Re-evaluate this changed report.',visibility:'public',createdAt:new Date()}});
     await tx.ticket.update({where:{id:ticket.id},data:{version:{increment:1},sourceUpdatedAt:new Date(),reviewState:'pending'}});
     await tx.proposedAction.updateMany({where:{ticketId:ticket.id,state:{in:['approved','queued']}},data:{state:'stale',error:'Synthetic customer update invalidated approval'}});
    });await audit(actor.id,'demo.ticket_changed',ticket.id,'succeeded');return response({ticketId:ticket.id});
   }
   if(body.scenario==='uncertain_write'||body.scenario==='backlink_failure'){
    const action=await db.proposedAction.findUniqueOrThrow({where:{id:String(body.actionId)}});
    if(action.dataSource!=='synthetic'||action.mode!=='dry_run'||action.state!=='approved'||action.type!=='create_issue')throw new HttpError(409,'Approve a synthetic issue draft before this simulation');
    const remoteIssueId=`simulated-${action.id}`;
    await db.$transaction(async tx=>{
     const reserved=await tx.proposedAction.updateMany({where:{id:action.id,state:'approved'},data:{state:'needs_reconciliation'}});
     if(!reserved.count)throw new HttpError(409,'Simulation already started');
     await tx.actionAttempt.create({data:{actionId:action.id,operation:'create_issue',state:'simulated_remote_created',marker:`zenjev-action:${action.id}`,receipt:json({simulated:true,remoteIssueId,externalCalls:0})}});
     if(body.scenario==='backlink_failure')await tx.actionAttempt.create({data:{actionId:action.id,operation:'zendesk_backlink',state:'failed',marker:`zenjev-action:${action.id}`,error:'Simulated backlink failure; retain created issue'}});
     await tx.proposedAction.update({where:{id:action.id},data:{state:'needs_reconciliation',remoteIssueId,error:body.scenario==='backlink_failure'?'Simulated issue created; backlink failed. Existing issue retained.':'Simulated timeout after creation; reconcile marker instead of retrying',receipt:json({simulated:true,externalCalls:0,remoteIssueId,backlinkState:body.scenario==='backlink_failure'?'failed':'not_requested'})}});
    });await audit(actor.id,`demo.${body.scenario}`,action.ticketId,'needs_reconciliation',{actionId:action.id,externalCalls:0});return response({action:await db.proposedAction.findUnique({where:{id:action.id}})});
   }
   throw new HttpError(400,'Unknown scenario');
  }
  throw new HttpError(404,'Endpoint not found');
 }catch(error){
  const status=error instanceof HttpError?error.status:(error as {code?:string}).code==='P2025'?404:400;
  return response({error:safeError(error)},status);
 }
}
