import { db } from './db';
import { DEMO_REPOSITORIES, TEAM_MAPPINGS, makeTicketFixture, makeIssueFixture } from './fixtures';
import { makeEvaluationLabels } from './evaluation-labels';
import {buildContext,type DomainTicket} from '../domain';
import type {Prisma} from '@prisma/client';
export async function seedDemo() {
  if ((process.env.DATA_MODE??'demo')!=='demo') throw new Error('Synthetic seed requires DATA_MODE=demo');
  const url=new URL(process.env.DATABASE_URL??'postgresql://demo:demo@127.0.0.1:55432/zenjev_demo');
  if (!['/zenjev_demo','/zenjev_test'].includes(url.pathname)) throw new Error('Seed only supports explicitly named zenjev_demo or zenjev_test databases');
  await db.workspaceSettings.upsert({where:{id:'workspace'},update:{},create:{id:'workspace',repositories:DEMO_REPOSITORIES,teamMappings:TEAM_MAPPINGS}});
  for(let n=1;n<=20;n++) {const issue=makeIssueFixture(n);await db.gitHubIssue.upsert({where:{id:issue.id},update:{},create:issue});}
  for(let n=1;n<=100;n++) {
    const {comments,...ticket}=makeTicketFixture(n);
    await db.ticket.upsert({where:{id:ticket.id},update:{},create:{...ticket,comments:{create:comments}}});
  }
  // Freeze source snapshots independently of labels, before any reviewer edits.
  // Both privacy configurations remain explicit; the evaluator never reconstructs past subjects from current state.
  const snapshots=[];
  for(let n=1;n<=100;n++){
   const fixture=makeTicketFixture(n),ticket:DomainTicket={...fixture,source:'synthetic',createdAt:fixture.createdAt.toISOString(),comments:fixture.comments.map(c=>({...c,visibility:c.visibility as 'public'|'internal',createdAt:c.createdAt.toISOString()}))};
   for(const asOf of [fixture.createdAt,fixture.sourceUpdatedAt])for(const includeInternalNotes of [false,true]){
    const snapshot=buildContext(ticket,{asOf:asOf.toISOString(),includeInternalNotes});
    snapshots.push({id:snapshot.id,ticketId:ticket.id,ticketVersion:ticket.version,contentHash:snapshot.hash,asOf,input:JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,omissions:{messages:snapshot.omittedCount,attachments:snapshot.attachmentCount},includeInternalNotes});
   }
  }
  await db.ticketSnapshot.createMany({data:snapshots,skipDuplicates:true});
  for(const label of makeEvaluationLabels()) await db.evaluationLabel.upsert({where:{id:label.id},update:{},create:label});
  for(let n=1;n<=13;n++) await db.job.upsert({where:{dedupKey:`seed-evaluate-${n}`},update:{},create:{kind:'evaluate',dedupKey:`seed-evaluate-${n}`,payload:{ticketId:`ticket-${String(n).padStart(3,'0')}`}}});
  return {tickets:await db.ticket.count(),issues:await db.gitHubIssue.count(),organizations:12,labels:await db.evaluationLabel.count(),pendingJobs:await db.job.count({where:{state:'queued'}})};
}
