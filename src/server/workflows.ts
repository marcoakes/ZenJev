import type { Prisma,ProposedAction,DecisionRun,Ticket } from '@prisma/client';
import { db } from './db';
import { getSettings } from './settings';
import { HttpError,type Actor } from './auth';
import { buildContext,retrieveCandidates,reviewReasons,contentHash,approvalHash,assertActionAllowed,sanitize,TEAMS,keywordBaseline,evaluateSaved,type Decision,type DomainTicket,type Issue,type ApprovalBinding,type SavedPrediction,type EvaluationLabel,type Snapshot } from '../domain';
import { MockDecisionProvider,JevDecisionProvider } from '../providers';
export const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const safeError=(error:unknown)=>error instanceof Error&&error.name.startsWith('Prisma')?'Database operation failed; inspect the operation status and retry safely':sanitize(error instanceof Error?error.message:'Operation failed').slice(0,500);
export async function audit(actor:string,action:string,recordId:string,outcome:string,details:unknown={},provider='mock') {return db.auditEvent.create({data:{actor,action,recordId,outcome,details:json(details),provider}});}
export async function enqueue(kind:string,payload:unknown,dedupKey:string,availableAt=new Date()) {return db.job.upsert({where:{dedupKey},update:{},create:{kind,payload:json(payload),dedupKey,availableAt}});}
export function domainTicket(ticket:Ticket&{comments:{id:string;text:string;visibility:string;createdAt:Date;integrationReceipt:boolean}[]}):DomainTicket {return {id:ticket.id,subject:ticket.subject,organization:ticket.organization,source:ticket.source as DomainTicket['source'],version:ticket.version,createdAt:ticket.createdAt.toISOString(),attachments:ticket.attachments,comments:ticket.comments.map(c=>({id:c.id,text:c.text,visibility:c.visibility as 'public'|'internal',createdAt:c.createdAt.toISOString(),integrationReceipt:c.integrationReceipt}))};}
export async function issueIndex():Promise<Issue[]> {return (await db.gitHubIssue.findMany({where:(process.env.DATA_MODE??'demo')==='demo'?{source:'synthetic'}:{source:'github'}})).map(i=>({...i,labels:i.labels as string[],state:i.state as 'open'|'closed',createdAt:i.createdAt.toISOString(),updatedAt:i.updatedAt.toISOString()}));}
function providerFor(settings:Awaited<ReturnType<typeof getSettings>>) {return settings.jevMode==='live'?new JevDecisionProvider({apiKey:process.env.TYPESAFE_API_KEY??'',model:process.env.JEV_MODEL??'jev-1.13.0',allowLiveDataProcessing:settings.allowLiveDataProcessing&&process.env.ALLOW_LIVE_DATA_PROCESSING==='true',thresholds:{...settings.policyThresholds as object,routingConfidence:settings.threshold},teamCriteria:settings.teamCriteria as Record<string,string>}):new MockDecisionProvider({thresholds:{...settings.policyThresholds as object,routingConfidence:settings.threshold},teamCriteria:settings.teamCriteria as Record<string,string>});}
export async function evaluateTicket(ticketId:string,actor='worker') {
 const started=performance.now(),settings=await getSettings();
 const ticket=await db.ticket.findUnique({where:{id:ticketId},include:{comments:{orderBy:{createdAt:'asc'}}}});
 if(!ticket)throw new HttpError(404,'Ticket not found');
 if(ticket.source==='zendesk'&&settings.jevMode!=='live')throw new HttpError(403,'Live tickets require live Jev mode');
 const snapshot=buildContext(domainTicket(ticket),{asOf:ticket.sourceUpdatedAt.toISOString(),includeInternalNotes:settings.includeInternalNotes});
 const stored=await db.ticketSnapshot.upsert({where:{id:snapshot.id},update:{},create:{id:snapshot.id,ticketId,ticketVersion:ticket.version,contentHash:snapshot.hash,asOf:new Date(snapshot.asOf),input:json(snapshot),omissions:json({messages:snapshot.omittedCount,attachments:snapshot.attachmentCount}),includeInternalNotes:settings.includeInternalNotes}});
 const run=await db.decisionRun.create({data:{ticketId,snapshotId:stored.id,ticketVersion:ticket.version,provider:settings.jevMode==='mock'?'mock':'jev',dataSource:ticket.source,requestedModel:settings.jevMode==='mock'?'mock-rules-v1':process.env.JEV_MODEL??'jev-1.13.0',status:'running'}});
 try {
  const candidates=retrieveCandidates(snapshot,await issueIndex(),{repositories:settings.repositories as string[],asOf:snapshot.asOf});
  await db.candidateSnapshot.create({data:{decisionId:run.id,candidates:json(candidates),retrievalVersion:'token-relevance-v1',asOf:new Date(snapshot.asOf)}});
  const output=await providerFor(settings).decide(snapshot,candidates);
  // Revalidate candidate references at the persistence boundary.
  if(output.matches.some(m=>!candidates.some(c=>c.issue.id===m.issueId))||(output.proposedIssueId&&!candidates.some(c=>c.issue.id===output.proposedIssueId)))throw new Error('Provider returned a match outside the stored candidate set');
  const reasons=[...new Set([...output.reviewReasons,...reviewReasons(output,settings.threshold)])];
  output.reviewReasons=reasons;
  await db.$transaction(async tx=>{
   await tx.decisionRun.update({where:{id:run.id},data:{status:'succeeded',output:json(output),requestedModel:output.requestedModel,reportedModel:output.reportedModel,inputTokens:output.inputTokens,outputTokens:output.outputTokens,providerLatencyMs:output.providerLatencyMs,processingLatencyMs:performance.now()-started}});
   await tx.ticket.updateMany({where:{id:ticketId,version:ticket.version},data:{reviewState:reasons.length?'needs_review':'ready'}});
   await tx.proposedAction.updateMany({where:{ticketId,state:{in:['approved','queued']}},data:{state:'stale',error:'A new decision requires renewed approval'}});
   await tx.auditEvent.create({data:{actor,action:'decision.completed',recordId:ticketId,provider:output.provider,outcome:'succeeded',details:json({decisionId:run.id,snapshotId:stored.id,reviewReasons:reasons,dataSource:output.dataSource})}});
  });
  return await db.decisionRun.findUniqueOrThrow({where:{id:run.id}});
 }catch(error){
  const message=safeError(error);
  await db.decisionRun.update({where:{id:run.id},data:{status:'failed',error:message,processingLatencyMs:performance.now()-started}});
  await db.ticket.update({where:{id:ticketId},data:{reviewState:'failed'}});
  await audit(actor,'decision.failed',ticketId,'failed',{decisionId:run.id,error:message},run.provider);
  return await db.decisionRun.findUniqueOrThrow({where:{id:run.id}});
 }
}
async function currentDecision(ticketId:string) {
 const ticket=await db.ticket.findUnique({where:{id:ticketId},include:{comments:true}});
 if(!ticket)throw new HttpError(404,'Ticket not found');
 const decision=await db.decisionRun.findFirst({where:{ticketId,status:'succeeded'},orderBy:{createdAt:'desc'},include:{candidateSnapshot:true,snapshot:true}});
 if(!decision||decision.ticketVersion!==ticket.version)throw new HttpError(409,'Evaluate the current ticket before reviewing an action');
 return {ticket,decision,output:decision.output as unknown as Decision};
}
export async function approveLink(ticketId:string,issueId:string,reason:string|undefined,actor:Actor) {
 const {ticket,decision}=await currentDecision(ticketId); const settings=await getSettings();
 const candidates=decision.candidateSnapshot?.candidates as unknown as {issue:Issue}[]|undefined;
 const issue=await db.gitHubIssue.findUnique({where:{id:issueId}});
 if(!issue||!(settings.repositories as string[]).includes(issue.repository)||!candidates?.some(c=>c.issue.id===issueId))throw new HttpError(403,'Association must select a stored allowlisted candidate');
 const link=await db.$transaction(async tx=>{
  const link=await tx.ticketIssueLink.upsert({where:{ticketId_issueId:{ticketId,issueId}},update:{reviewer:actor.id,reason:sanitize(reason??''),decisionId:decision.id,status:'approved'},create:{ticketId,issueId,reviewer:actor.id,reason:sanitize(reason??''),decisionId:decision.id,status:'approved'}});
  await tx.ticket.update({where:{id:ticket.id},data:{reviewState:'approved'}});
  await tx.auditEvent.create({data:{actor:actor.id,action:'association.approved',recordId:ticketId,provider:decision.provider,outcome:'succeeded',details:json({issueId,decisionId:decision.id,localOnly:true})}});
  return link;
 }); return link;
}
export function bindingFor(action:ProposedAction,decision:DecisionRun):ApprovalBinding {return {actionId:action.id,payload:action.payload,ticketId:action.ticketId,ticketVersion:action.ticketVersion,ticketSnapshotId:decision.snapshotId,decisionId:action.decisionId,decisionVersion:decision.ticketVersion,destination:action.destination,dataSource:action.dataSource as ApprovalBinding['dataSource'],provider:action.provider as ApprovalBinding['provider'],mode:action.mode as ApprovalBinding['mode'],kind:action.type as ApprovalBinding['kind']};}
export async function proposeAction(ticketId:string,type:'route'|'create_issue'|'tags'|'internal_note',body:Record<string,unknown>,actor:Actor) {
 const {ticket,decision,output}=await currentDecision(ticketId),settings=await getSettings();
 let destination:string,payload:unknown;
 if(type==='route'){
  destination=String(body.destination??output.destination.value);
  if(!(TEAMS as readonly string[]).includes(destination)||destination==='unknown')throw new HttpError(400,'Select a known destination team');
  if(destination!==output.destination.value&&(!body.reason||String(body.reason).trim().length<3))throw new HttpError(400,'An override requires a reason');
  const groupId=(settings.teamMappings as Record<string,string|null>)[destination];
  if(!groupId)throw new HttpError(400,'Destination has no configured Zendesk group');
  payload={destination,groupId,tags:['zenjev_reviewed'],reason:sanitize(String(body.reason??'Reviewer accepted the proposed route')),ticketSourceId:ticket.sourceId,updatedAtSource:ticket.sourceUpdatedAt.toISOString()};
 } else if(type==='tags') {
  if(!Array.isArray(body.tags)||body.tags.length>10||body.tags.some(t=>typeof t!=='string'||!/^zenjev_[a-z0-9_]+$/.test(t)))throw new HttpError(400,'Only app-specific zenjev_ tags are allowed');
  destination=ticket.sourceId;payload={tags:body.tags,ticketSourceId:ticket.sourceId,updatedAtSource:ticket.sourceUpdatedAt.toISOString()};
 } else if(type==='internal_note') {
  if(typeof body.body!=='string'||body.body.trim().length<3||body.body.length>10000)throw new HttpError(400,'Supply a bounded internal integration note');
  destination=ticket.sourceId;payload={body:sanitize(body.body,[ticket.organization]),ticketSourceId:ticket.sourceId,updatedAtSource:ticket.sourceUpdatedAt.toISOString()};
 } else {
  destination=String(body.repository??(settings.repositories as string[])[0]);
  if(!(settings.repositories as string[]).includes(destination))throw new HttpError(403,'Repository is not allowlisted');
  const snapshot=decision.snapshot.input as unknown as ReturnType<typeof buildContext>;
  const problem=snapshot.messages.filter(m=>m.visibility==='public').slice(0,2).map(m=>m.text).join('\n\n');
  payload={title:sanitize(String(body.title??snapshot.subject),[ticket.organization]).slice(0,200),body:sanitize(String(body.body??`## Problem statement\n${problem}\n\n## Expected / actual behaviour\nSee the permitted source excerpts above.\n\n## Environment\nNot supplied\n\n## Reproduction details\nNot supplied — request exact steps before investigation.\n\n## Affected organisations\n1 ${ticket.source==='synthetic'?'fictional ':''}organisation\n\n## Missing information\n${output.missingReproInfo>=(output.policy?.missingInfo??.5)?'Essential diagnostic information is missing.':'Confirm environment and reproducibility.'}\n\n## Internal source\nZenJev ticket ${ticket.number}`)),repository:destination};
 }
 assertDraftPrivacy(ticket,payload);
 const mode=settings.allowLiveWrites&&process.env.ALLOW_LIVE_WRITES==='true'&&settings.dataMode==='live'&&ticket.source==='zendesk'&&decision.provider==='jev'?'live':'dry_run';
 const actionId=crypto.randomUUID();
 const partial={id:actionId,ticketId,decisionId:decision.id,ticketVersion:ticket.version,type,destination,payload:json(payload),mode,provider:decision.provider,dataSource:ticket.source};
 const payloadHash=contentHash(payload),dedupKey=contentHash({ticketId,decisionId:decision.id,type,destination,payload,mode});
 const action=await db.proposedAction.upsert({where:{dedupKey},update:{},create:{...partial,payloadHash,dedupKey}});
 await audit(actor.id,'action.proposed',ticketId,'succeeded',{actionId:action.id,type,mode,payloadHash},decision.provider);
 return action;
}
export async function editAction(id:string,payload:unknown,actor:Actor) {
 const action=await db.proposedAction.findUnique({where:{id},include:{ticket:{include:{comments:true}}}});
 if(!action)throw new HttpError(404,'Action not found');
 if(!['proposed','approved','stale','rejected'].includes(action.state))throw new HttpError(409,'Executing or completed actions cannot be edited');
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new HttpError(400,'Payload must be an object');
 const p=payload as Record<string,unknown>,settings=await getSettings();
 if(action.type==='route') {if(p.ticketSourceId!==action.ticket.sourceId||p.updatedAtSource!==action.ticket.sourceUpdatedAt.toISOString()||p.destination!==action.destination||p.groupId!==(settings.teamMappings as Record<string,unknown>)[action.destination]||!Array.isArray(p.tags)||p.tags.some(t=>typeof t!=='string'||!t.startsWith('zenjev_')))throw new HttpError(400,'Route payload must keep approved destination and only app tags');}
 else if(action.type==='create_issue'&&(typeof p.title!=='string'||typeof p.body!=='string'||p.repository!==action.destination))throw new HttpError(400,'Issue payload requires title, body and the selected repository');
 else if(action.type==='tags'||action.type==='internal_note') {
  if(p.ticketSourceId!==action.ticket.sourceId||p.updatedAtSource!==action.ticket.sourceUpdatedAt.toISOString())throw new HttpError(400,'Source ticket context cannot be edited');
  if(action.type==='tags'&&(!Array.isArray(p.tags)||p.tags.length>10||p.tags.some(t=>typeof t!=='string'||!/^zenjev_[a-z0-9_]+$/.test(t))))throw new HttpError(400,'Only app-specific tags are allowed');
  if(action.type==='internal_note'&&(typeof p.body!=='string'||p.body.length<3||p.body.length>10000))throw new HttpError(400,'Internal note must be bounded nonempty text');
 }
 assertDraftPrivacy(action.ticket,p);
 const clean=json(Object.fromEntries(Object.entries(p).map(([key,value])=>[key,typeof value==='string'?sanitize(value):value])));
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "ProposedAction" WHERE id=${id} FOR UPDATE`;
  const current=await tx.proposedAction.findUniqueOrThrow({where:{id}});
  if(!['proposed','approved','stale','rejected'].includes(current.state)||current.payloadHash!==action.payloadHash)throw new HttpError(409,'Action changed or can no longer be edited');
  await tx.approval.updateMany({where:{actionId:id,invalidatedAt:null},data:{invalidatedAt:new Date()}});
  const edited=await tx.proposedAction.update({where:{id},data:{payload:clean,payloadHash:contentHash(clean),state:'proposed',error:null}});
  await tx.auditEvent.create({data:{actor:actor.id,action:'action.edited',recordId:action.ticketId,provider:action.provider,outcome:'approval_invalidated',details:json({actionId:id,beforeHash:action.payloadHash,afterHash:edited.payloadHash})}});
  return edited;
 });
}
export async function approveAction(id:string,actor:Actor) {
 const action=await db.proposedAction.findUnique({where:{id},include:{decision:true,ticket:true}});
 if(!action)throw new HttpError(404,'Action not found');
 if(!['proposed','approved'].includes(action.state))throw new HttpError(409,'Action needs a current proposal');
 if(action.ticket.version!==action.ticketVersion)throw new HttpError(409,'Ticket changed; create a new action');
 if(!['admin','reviewer'].includes(actor.role))throw new HttpError(403,'Reviewer role required');
 const hash=approvalHash(bindingFor(action,action.decision));
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "ProposedAction" WHERE id=${id} FOR UPDATE`;
  const current=await tx.proposedAction.findUniqueOrThrow({where:{id}});
  if(!['proposed','approved'].includes(current.state)||current.payloadHash!==action.payloadHash)throw new HttpError(409,'Action changed; inspect the current preview before approving');
  const currentTicket=await tx.ticket.findUniqueOrThrow({where:{id:action.ticketId}});
  if(currentTicket.version!==action.ticketVersion)throw new HttpError(409,'Ticket changed; renewed review required');
  const latest=await tx.decisionRun.findFirst({where:{ticketId:action.ticketId,status:'succeeded'},orderBy:{createdAt:'desc'}});
  if(latest?.id!==action.decisionId)throw new HttpError(409,'Decision changed; create a new action');
  await tx.approval.updateMany({where:{actionId:id,invalidatedAt:null},data:{invalidatedAt:new Date()}});
  await tx.approval.create({data:{actionId:id,reviewer:actor.id,reviewerRole:actor.role,bindingHash:hash,expiresAt:new Date(Date.now()+30*60_000)}});
  const approved=await tx.proposedAction.update({where:{id},data:{state:'approved'}});
  await tx.auditEvent.create({data:{actor:actor.id,action:'action.approved',recordId:action.ticketId,provider:action.provider,outcome:'succeeded',details:json({actionId:id,bindingHash:hash,demoReviewer:actor.demo})}});
  return approved;
 });
}
export async function queueAction(id:string,actor:Actor) {
 const action=await db.proposedAction.findUnique({where:{id},include:{decision:true,ticket:true,approvals:{where:{invalidatedAt:null},orderBy:{createdAt:'desc'},take:1}}});
 if(!action)throw new HttpError(404,'Action not found');
 if(['queued','executing','succeeded','needs_reconciliation'].includes(action.state))return action;
 if(action.state!=='approved'||!action.approvals[0])throw new HttpError(409,'Approve the exact preview before execution');
 await validateAction(action);
 return db.$transaction(async tx=>{
  const updated=await tx.proposedAction.updateMany({where:{id,state:'approved'},data:{state:'queued'}});
  if(updated.count)await tx.job.upsert({where:{dedupKey:`action:${id}`},update:{},create:{kind:'action',payload:{actionId:id},dedupKey:`action:${id}`}});
  await tx.auditEvent.create({data:{actor:actor.id,action:'action.queued',recordId:action.ticketId,provider:action.provider,outcome:'succeeded',details:{actionId:id}}});
  return tx.proposedAction.findUniqueOrThrow({where:{id}});
 });
}
export async function validateAction(action:ProposedAction&{decision:DecisionRun;ticket:Ticket;approvals:{bindingHash:string;reviewer:string;reviewerRole:string;expiresAt:Date;invalidatedAt:Date|null}[]}) {
 const settings=await getSettings(),approval=action.approvals[0];
 const latest=await db.decisionRun.findFirst({where:{ticketId:action.ticketId,status:'succeeded'},orderBy:{createdAt:'desc'}});
 try {
  if(!approval||approval.invalidatedAt)throw new Error('Approval is not current');
  if(latest?.id!==action.decisionId)throw new Error('Decision changed');
  if(action.type!=='create_issue'){const payload=action.payload as Record<string,unknown>;if(payload.ticketSourceId!==action.ticket.sourceId||payload.updatedAtSource!==action.ticket.sourceUpdatedAt.toISOString())throw new Error('Action source ticket context changed');}
  if(settings.jevMode!==(action.provider==='mock'?'mock':'live')||settings.dataMode!==(action.dataSource==='synthetic'?'demo':'live'))throw new Error('Data or model mode changed');
  if(action.mode==='live'){
   const reviewer=await db.user.findUnique({where:{id:approval.reviewer}});
   if(!reviewer||!['admin','reviewer'].includes(reviewer.role))throw new Error('A currently authorised authenticated reviewer is required for live writes');
  }
  assertActionAllowed(bindingFor(action,action.decision),{hash:approval.bindingHash,reviewerId:approval.reviewer,reviewerRole:approval.reviewerRole as 'admin',expiresAt:approval.expiresAt.toISOString(),status:'approved'},{allowLiveWrites:settings.allowLiveWrites&&process.env.ALLOW_LIVE_WRITES==='true',allowLiveDataProcessing:settings.allowLiveDataProcessing&&process.env.ALLOW_LIVE_DATA_PROCESSING==='true',authenticated:true,currentTicketVersion:action.ticket.version,currentDecisionVersion:latest.ticketVersion,repositories:settings.repositories as string[],groups:TEAMS.filter(t=>t!=='unknown') as unknown as string[]});
 }catch(error){await db.proposedAction.updateMany({where:{id:action.id,state:{in:['proposed','approved','queued']}},data:{state:'stale',error:safeError(error)}});throw new HttpError(409,safeError(error));}
}
export async function runEvaluation(options:{task?:string;split?:string;threshold?:number;newRun?:boolean},actor:Actor) {
 const settings=await getSettings(),task=options.task??'initial_routing',split=options.split??'development',threshold=options.threshold??settings.threshold;
 if(!['initial_routing','engineering_escalation'].includes(task)||!['development','held_out'].includes(split))throw new HttpError(400,'Unknown evaluation task or split');
 if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new HttpError(400,'Threshold must be between zero and one');
 const labels=await db.evaluationLabel.findMany({where:{task,split},orderBy:{ticketId:'asc'}});
 const mappedLabels:EvaluationLabel[]=labels.map(l=>({ticketId:l.ticketId,destination:l.destination as EvaluationLabel['destination'],needsEngineering:l.engineering,critical:l.critical,matchingIssueId:l.issueId,split:l.split as 'development'|'held_out',incidentId:l.incidentGroup}));
 const previous=await db.evaluationRun.findFirst({where:{task,split},orderBy:{createdAt:'desc'}});
 if(!options.newRun){
  if(!previous)throw new HttpError(409,'Run and save predictions before changing the threshold');
  const predictions=previous.predictions as unknown as SavedPrediction[];
  const frozenLabels=(previous.settings as {evaluationLabels?:EvaluationLabel[]}).evaluationLabels??mappedLabels;
  const metrics=evaluateSaved(predictions,frozenLabels,threshold);
  const run=await db.evaluationRun.create({data:{task,split,threshold,provider:previous.provider,dataSource:previous.dataSource,datasetVersion:previous.datasetVersion,settings:previous.settings as Prisma.InputJsonValue,predictions:json(predictions),metrics:json(metrics),providerCalls:0}});
  await audit(actor.id,'evaluation.recomputed',run.id,'succeeded',{fromRun:previous.id,providerCalls:0,threshold},run.provider);return run;
 }
 // Labels select IDs/timestamps only. Their outcomes are never passed to context, retrieval or provider.
 const predictions:SavedPrediction[]=[],issues=await issueIndex();
 let providerCalls=0;
 for(const label of labels){
  const ticket=await db.ticket.findUnique({where:{id:label.ticketId},include:{comments:true}});
  if(!ticket){predictions.push({ticketId:label.ticketId,decision:null,candidateIds:[],baseline:'unknown',error:'Ticket missing'});continue;}
  const frozen=await db.ticketSnapshot.findFirst({where:{ticketId:ticket.id,asOf:label.asOf,includeInternalNotes:settings.includeInternalNotes},orderBy:{createdAt:'asc'}});
  if(!frozen){predictions.push({ticketId:ticket.id,decision:null,candidateIds:[],baseline:'unknown',error:'No immutable source snapshot exists at the labelled decision time'});continue;}
  const snapshot=frozen.input as unknown as Snapshot;
  const candidates=retrieveCandidates(snapshot,issues,{repositories:settings.repositories as string[],asOf:snapshot.asOf});const started=performance.now();
  try{providerCalls++;const decision=await providerFor(settings).decide(snapshot,candidates);predictions.push({ticketId:ticket.id,decision,candidateIds:candidates.map(c=>c.issue.id),baseline:keywordBaseline(snapshot),latencyMs:performance.now()-started,split:split as 'development'|'held_out',incidentId:label.incidentGroup});}
  catch(error){predictions.push({ticketId:ticket.id,decision:null,candidateIds:candidates.map(c=>c.issue.id),baseline:keywordBaseline(snapshot),error:safeError(error),latencyMs:performance.now()-started});}
 }
 const metrics=evaluateSaved(predictions,mappedLabels,threshold);
 const run=await db.evaluationRun.create({data:{task,split,threshold,provider:settings.jevMode==='mock'?'mock':'jev',dataSource:settings.dataMode==='demo'?'synthetic':'zendesk',datasetVersion:'synthetic-v1',settings:json({repositories:settings.repositories,rubricVersion:settings.rubricVersion,includeInternalNotes:settings.includeInternalNotes,policyThresholds:settings.policyThresholds,teamCriteria:settings.teamCriteria,evaluationLabels:mappedLabels,decisionTimestamps:labels.map(l=>({ticketId:l.ticketId,asOf:l.asOf.toISOString()}))}),predictions:json(predictions),metrics:json(metrics),providerCalls}});
 await audit(actor.id,'evaluation.completed',run.id,'succeeded',{task,split,count:predictions.length,providerCalls},run.provider);return run;
}

export function assertDraftPrivacy(ticket:{organization:string;comments:{text:string;visibility:string}[]},payload:unknown) {
 const p=payload as Record<string,unknown>;
 if(typeof p.body!=='string'&&typeof p.title!=='string')return;
 const outgoing=[p.title,p.body].filter(v=>typeof v==='string').join('\n');
 if(sanitize(outgoing,[ticket.organization])!==outgoing)throw new HttpError(400,'Preview contains a detected secret, customer identifier, unsafe content or organization name; use permitted aliases');
 for(const note of ticket.comments.filter(c=>c.visibility==='internal')) {
  const fragments=note.text.split(/[.!?\n]/).map(v=>v.trim()).filter(v=>v.length>=24);
  if(fragments.some(f=>outgoing.toLowerCase().includes(f.toLowerCase())))throw new HttpError(403,'Internal-note content cannot be copied into an engineering draft');
 }
}

export async function proposeBacklink(actionId:string,actor:Actor) {
 const original=await db.proposedAction.findUniqueOrThrow({where:{id:actionId}});
 if(original.type!=='create_issue'||!original.remoteIssueId||!['succeeded','needs_reconciliation'].includes(original.state))throw new HttpError(409,'Backlink requires a retained created issue receipt');
 const body=original.mode==='dry_run'?`Synthetic engineering handoff marker ${original.remoteIssueId}. Dry run — no external issue exists.`:`Engineering handoff: ${original.remoteIssueUrl}`;
 if(original.mode==='live'&&(!original.remoteIssueUrl||!original.remoteIssueUrl.startsWith(`https://github.com/${original.destination}/issues/`)))throw new HttpError(409,'Stored issue URL does not match the reviewed repository');
 const note=await proposeAction(original.ticketId,'internal_note',{body},actor);
 const linked=await db.proposedAction.update({where:{id:note.id},data:{parentActionId:original.id}});
 await audit(actor.id,'backlink.proposed',original.ticketId,'succeeded',{actionId:note.id,parentActionId:original.id,requiresSeparateApproval:true},original.provider);
 return linked;
}

export async function rejectAction(id:string,actor:Actor) {
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "ProposedAction" WHERE id=${id} FOR UPDATE`;
  const action=await tx.proposedAction.findUniqueOrThrow({where:{id}});
  if(!['proposed','approved'].includes(action.state))throw new HttpError(409,'Only pending actions can be rejected');
  await tx.approval.updateMany({where:{actionId:id,invalidatedAt:null},data:{invalidatedAt:new Date()}});
  const rejected=await tx.proposedAction.update({where:{id},data:{state:'rejected'}});
  await tx.auditEvent.create({data:{actor:actor.id,action:'action.rejected',recordId:action.ticketId,provider:action.provider,outcome:'succeeded',details:{actionId:id}}});
  return rejected;
 });
}
