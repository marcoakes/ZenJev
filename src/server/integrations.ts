import { db } from './db';
import { getSettings } from './settings';
import { ZendeskProvider,GitHubProvider,verifyZendeskWebhook,ProviderError } from '../providers';
import { contentHash,sanitize } from '../domain';
import { json,audit,safeError } from './workflows';
import { HttpError } from './auth';
export async function integrationProviders() {
 const settings=await getSettings();
 return {github:new GitHubProvider({token:process.env.GITHUB_TOKEN??'',repositories:settings.repositories as string[],apiVersion:process.env.GITHUB_API_VERSION}),get zendesk(){return new ZendeskProvider({subdomain:process.env.ZENDESK_SUBDOMAIN??'unconfigured',clientId:process.env.ZENDESK_OAUTH_CLIENT_ID??'',clientSecret:process.env.ZENDESK_OAUTH_CLIENT_SECRET??'',scopes:process.env.ZENDESK_OAUTH_SCOPES??'',allowedGroupIds:Object.values(settings.teamMappings as Record<string,string|null>).filter((v):v is string=>v!==null)})}};
}
export async function receiveWebhook(request:Request) {
 const chunks:Uint8Array[]=[];let size=0;
 const reader=request.body?.getReader();if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();throw new HttpError(413,'Webhook exceeds payload limit');}chunks.push(part.value);}}
 const raw=Buffer.concat(chunks).toString('utf8');
 const verified=verifyZendeskWebhook({rawBody:raw,signature:request.headers.get('x-zendesk-webhook-signature')??'',timestamp:request.headers.get('x-zendesk-webhook-signature-timestamp')??'',secret:process.env.ZENDESK_WEBHOOK_SECRET??'',account:process.env.ZENDESK_SUBDOMAIN??''});
 if((process.env.DATA_MODE??'demo')!=='live')throw new HttpError(403,'Zendesk ingestion requires explicitly configured live data mode');
 const dedup=`webhook:${verified.receiptId}`;
 try {
  const inserted=await db.$transaction(async tx=>{
   const inserted=await tx.webhookReceipt.createMany({data:[{id:verified.receiptId,account:verified.account,ticketId:verified.ticketId,bodyHash:contentHash(raw)}],skipDuplicates:true});
   if(!inserted.count)return false;
   await tx.job.create({data:{kind:'zendesk_ticket',dedupKey:dedup,payload:{sourceId:verified.ticketId},availableAt:new Date(Date.now()+2_000)}});
   return true;
  });
  return {accepted:true,duplicate:!inserted};
 }catch(error){if((error as {code?:string}).code==='P2002')return {accepted:true,duplicate:true};throw error;}
}
export async function syncGitHub() {
 const settings=await getSettings();if(settings.dataMode!=='live')throw new HttpError(403,'Issue sync requires live mode');
 const {github}=await integrationProviders();
 for(const repository of settings.repositories as string[]) {
  try {
   const issues=await github.listIssues(repository);
   await db.$transaction(async tx=>{
    for(const issue of issues)await tx.gitHubIssue.upsert({where:{repository_number:{repository,number:issue.number}},update:{title:issue.title,body:issue.body,state:issue.state,labels:json(issue.labels),private:issue.private,updatedAt:new Date(issue.updatedAt)},create:{...issue,labels:json(issue.labels),createdAt:new Date(issue.createdAt??issue.updatedAt),updatedAt:new Date(issue.updatedAt),source:'github'}});
    await tx.syncCursor.upsert({where:{id:`github:${repository}`},update:{lastSuccessAt:new Date(),error:null},create:{id:`github:${repository}`,provider:'github',lastSuccessAt:new Date()}});
   });
  }catch(error){await db.syncCursor.upsert({where:{id:`github:${repository}`},update:{error:safeError(error)},create:{id:`github:${repository}`,provider:'github',error:safeError(error)}});throw error;}
 }
}
export async function syncZendeskPage() {
 const settings=await getSettings();if(settings.dataMode!=='live')throw new HttpError(403,'Zendesk sync requires live mode');
 await db.syncCursor.upsert({where:{id:'zendesk-export-rate'},update:{},create:{id:'zendesk-export-rate',provider:'zendesk'}});
 await db.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{nextAllowedAt:Date|null}[]>`SELECT "nextAllowedAt" FROM "SyncCursor" WHERE id='zendesk-export-rate' FOR UPDATE`;
  const remaining=(rows[0]?.nextAllowedAt?.getTime()??0)-Date.now();
  if(remaining>0)throw new ProviderError('rate_limit','Zendesk export rate gate requires a delayed retry',429,remaining);
  await tx.syncCursor.update({where:{id:'zendesk-export-rate'},data:{nextAllowedAt:new Date(Date.now()+6100)}});
 });
 const {zendesk}=await integrationProviders(),cursor=await db.syncCursor.findUnique({where:{id:'zendesk'}});
 const page=await zendesk.exportPage(cursor?.cursor?{cursor:cursor.cursor}:{startTime:Math.floor(Date.now()/1000)-86400*7});
 // Follow-on authoritative fetches and cursor advance commit atomically. Crashes cannot skip a page.
 await db.$transaction(async tx=>{
  for(const ticket of page.tickets)await tx.job.upsert({where:{dedupKey:`zendesk:${ticket.id}:${ticket.updated_at}`},update:{},create:{kind:'zendesk_ticket',dedupKey:`zendesk:${ticket.id}:${ticket.updated_at}`,payload:{sourceId:ticket.id}}});
  await tx.syncCursor.upsert({where:{id:'zendesk'},update:{cursor:page.cursor,lastSuccessAt:new Date(),error:null},create:{id:'zendesk',provider:'zendesk',cursor:page.cursor,lastSuccessAt:new Date()}});
  if(!page.endOfStream)await tx.job.upsert({where:{dedupKey:`zendesk-page:${page.cursor}`},update:{},create:{kind:'zendesk_sync',dedupKey:`zendesk-page:${page.cursor}`,payload:{},availableAt:new Date(Date.now()+6100)}});
 });return page;
}
export async function ingestZendeskTicket(sourceId:string) {
 const settings=await getSettings();if(settings.dataMode!=='live')throw new HttpError(403,'Zendesk sync requires live mode');
 const {zendesk}=await integrationProviders();
 const ticket=await zendesk.ticket(sourceId),sourceComments=await zendesk.comments(sourceId);
 const names=sourceComments.flatMap(c=>c.authorName?[c.authorName]:[]);
 const comments=sourceComments.map(c=>({...c,text:sanitize(c.text,names)}));
 const account=process.env.ZENDESK_SUBDOMAIN!,id=`zendesk:${account}:${sourceId}`;
 const knownActions=await db.proposedAction.findMany({where:{ticketId:id,state:'succeeded'},select:{id:true}});
 const markers=new Set(knownActions.map(a=>`[zenjev-action:${a.id}]`));
 const receiptComment=(c:typeof comments[number])=>c.visibility==='internal'&&!!process.env.ZENDESK_INTEGRATION_AUTHOR_ID&&c.authorId===process.env.ZENDESK_INTEGRATION_AUTHOR_ID&&[...markers].some(marker=>c.text.includes(marker));
 const relevant=comments.filter(c=>!receiptComment(c)).map(c=>({id:c.id,text:c.text,visibility:c.visibility}));
 const fingerprint=contentHash({subject:ticket.subject,comments:relevant,attachments:comments.reduce((sum,c)=>sum+(c.attachments??0),0)});
 await db.$transaction(async tx=>{
  const existing=await tx.ticket.findUnique({where:{account_sourceId:{account,sourceId}}});
  const changed=!existing||existing.fingerprint!==fingerprint;
  const data={subject:sanitize(ticket.subject??'(No subject)',names),organization:`Organization-${ticket.organization_id??'unknown'}`,attachments:comments.reduce((sum,c)=>sum+(c.attachments??0),0),currentTeam:Object.entries(settings.teamMappings as Record<string,string|null>).find(([,group])=>group===ticket.group_id)?.[0]??'unknown',status:ticket.status??'open',sourceUpdatedAt:new Date(ticket.updated_at),fingerprint,version:existing?existing.version+(changed?1:0):1};
  await tx.ticket.upsert({where:{id},update:data,create:{id,...data,account,sourceId,number:sourceId,source:'zendesk',incidentGroup:id,createdAt:new Date(ticket.created_at)}});
  for(const comment of comments)await tx.ticketComment.upsert({where:{ticketId_sourceId:{ticketId:id,sourceId:comment.id}},update:{text:comment.text,visibility:comment.visibility},create:{id:`${id}:comment:${comment.id}`,ticketId:id,sourceId:comment.id,text:comment.text,visibility:comment.visibility,authorType:comment.authorType??'unknown',integrationReceipt:receiptComment(comment),createdAt:new Date(comment.createdAt)}});
  if(changed){
   await tx.proposedAction.updateMany({where:{ticketId:id,state:{in:['approved','queued']}},data:{state:'stale',error:'Authoritative ticket changed'}});
   // Processing remains explicit: imports create pending review, never a paid model call.
   await tx.ticket.update({where:{id},data:{reviewState:'pending'}});
  }
 });
 await audit('worker','ticket.synchronised',id,'succeeded',{sourceId,comments:comments.length},'jev');
}
