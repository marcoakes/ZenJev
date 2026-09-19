import { db } from '../src/server/db';
const beforeArg = process.argv.find(v => v.startsWith('--before='))?.slice(9);
const source = process.argv.includes('--source=zendesk') ? 'zendesk' : process.argv.includes('--source=synthetic') ? 'synthetic' : null;
if (!beforeArg || !source || !Number.isFinite(Date.parse(beforeArg))) throw new Error('Usage: npm run retention -- --source=synthetic|zendesk --before=ISO_TIMESTAMP [--apply]. Defaults to a count-only dry run.');
const before = new Date(beforeArg);
if (before > new Date()) throw new Error('Retention cutoff must not be in the future');
const where = {source,sourceUpdatedAt:{lt:before}};
try {
  const tickets = await db.ticket.count({where});
  const evaluations = await db.evaluationRun.count({where:{dataSource:source,createdAt:{lt:before}}});
  if (!process.argv.includes('--apply')) console.log(JSON.stringify({dryRun:true,tickets,evaluations,source,before:before.toISOString(),auditPreserved:true}));
  else {
    await db.$transaction(async tx => {
      if(await tx.proposedAction.count({where:{ticket:where,state:{in:['queued','executing','needs_reconciliation']}}}))throw new Error('Reconcile or finish outstanding actions before deleting their source tickets');
      const ids=(await tx.ticket.findMany({where,select:{id:true}})).map(t=>t.id);
      await tx.evaluationLabel.deleteMany({where:{ticketId:{in:ids}}});
      const jobs=await tx.job.findMany({where:{kind:'evaluate',state:{in:['queued','running']}}});
      for(const job of jobs){if(ids.includes(String((job.payload as {ticketId?:string}).ticketId)))await tx.job.delete({where:{id:job.id}});}
      await tx.proposedAction.deleteMany({where:{ticket:where}});
      await tx.ticket.deleteMany({where});
      await tx.evaluationRun.deleteMany({where:{dataSource:source,createdAt:{lt:before}}});
      await tx.auditEvent.create({data:{actor:'operator-retention-cli',action:'retention.applied',recordId:'workspace',outcome:'succeeded',provider:'not_applicable',details:{source,before:before.toISOString(),tickets,evaluations}}});
    });
    console.log(JSON.stringify({deletedTickets:tickets,deletedEvaluations:evaluations,auditPreserved:true}));
  }
} finally {await db.$disconnect();}
