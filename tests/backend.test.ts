import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from 'vitest';
import { createHmac } from 'node:crypto';
const database=process.env.TEST_DATABASE_URL;
const suite=database?describe:describe.skip;
let db:typeof import('../src/server/db').db;
let flow:typeof import('../src/server/workflows');
let worker:typeof import('../src/worker/processor');
let api:typeof import('../src/server/api').handleApi;
const actor={id:'test-reviewer',role:'admin' as const,demo:true,csrfToken:'local-loopback-demo'};
const envOriginal={...process.env};
async function request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}) {return api(new Request(`http://127.0.0.1:3000/api/${path}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined}),path.split('?')[0].split('/'));}
async function freshDecision(id='ticket-001') {return flow.evaluateTicket(id,'test');}
async function proposed(id='ticket-001',type:'route'|'create_issue'='route') {await freshDecision(id);return flow.proposeAction(id,type,type==='route'?{destination:'integrations'}:{},actor);}
suite('PostgreSQL persisted workflows (isolated test database)',()=>{
 beforeAll(async()=>{
  if(!database||new URL(database).pathname!=='/zenjev_test')throw new Error('Integration suite requires isolated zenjev_test database');
  process.env.DATABASE_URL=database;process.env.DATA_MODE='demo';process.env.JEV_MODE='mock';process.env.APP_BASE_URL='http://127.0.0.1:3000';process.env.APP_BIND_HOST='127.0.0.1';
  ({db}=await import('../src/server/db'));flow=await import('../src/server/workflows');worker=await import('../src/worker/processor');({handleApi:api}=await import('../src/server/api'));
  await db.proposedAction.deleteMany();await db.ticket.deleteMany();await db.job.deleteMany();await db.evaluationRun.deleteMany();await db.session.deleteMany();await db.user.deleteMany();await db.workspaceSettings.deleteMany();
  await (await import('../src/server/seed')).seedDemo();
 },60000);
 beforeEach(async()=>{
  vi.restoreAllMocks();process.env.DATA_MODE='demo';process.env.JEV_MODE='mock';process.env.ALLOW_LIVE_WRITES='false';process.env.ALLOW_LIVE_DATA_PROCESSING='false';delete process.env.TYPESAFE_API_KEY;
  await db.workspaceSettings.update({where:{id:'workspace'},data:{dataMode:'demo',jevMode:'mock',allowLiveWrites:false,allowLiveDataProcessing:false,includeInternalNotes:false,threshold:.8,policyThresholds:{routingConfidence:.8,engineering:.7,missingInfo:.5,multipleIssues:.5,matchProbability:.9,matchMargin:.15}}});
 });
 afterAll(async()=>{if(db)await db.$disconnect();process.env=envOriginal;});
 it('SW-01 idempotent seed persists 100 tickets, 20 issues, 12 organisations, 200 separate labels',async()=>{
  const result=await (await import('../src/server/seed')).seedDemo();
  expect(result.tickets).toBe(100);expect(result.issues).toBe(20);expect(result.labels).toBe(200);
  expect((await db.ticket.findMany({distinct:['organization'],select:{organization:true}}))).toHaveLength(12);
  expect(await db.ticketComment.count()).toBe(300);
 });
 it('SW-02 three wordings propose the same stored issue; ambiguous sign-in requires review',async()=>{
  const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('External network forbidden'));
  const runs=[];for(const id of ['ticket-001','ticket-002','ticket-003'])runs.push(await freshDecision(id));
  expect(runs.map(r=>(r.output as {proposedIssueId:string}).proposedIssueId)).toEqual(['issue-001','issue-001','issue-001']);
  const ambiguous=await freshDecision('ticket-005');expect((ambiguous.output as {reviewReasons:string[]}).reviewReasons.length).toBeGreaterThan(0);
  expect(fetchSpy).not.toHaveBeenCalled();
 });
 it('full persisted local association -> exact dry-run preview -> approval -> receipt',async()=>{
  await freshDecision();await flow.approveLink('ticket-001','issue-001','Known shared defect',actor);
  const action=await flow.proposeAction('ticket-001','route',{destination:'integrations'},actor);
  expect(action.state).toBe('proposed');expect(action.mode).toBe('dry_run');
  await flow.approveAction(action.id,actor);await flow.queueAction(action.id,actor);
  const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('External network forbidden'));
  const complete=await worker.executeAction(action.id);
  expect(complete.state).toBe('succeeded');expect(complete.receipt).toMatchObject({label:'Dry run — no external change',externalCalls:0});expect(fetchSpy).not.toHaveBeenCalled();
  expect(await db.approval.count({where:{actionId:action.id}})).toBe(1);expect(await db.auditEvent.count({where:{recordId:'ticket-001',action:'action.dry_run'}})).toBeGreaterThan(0);
 });
 it('SW-03 synthetic tickets remain dry-run when credentials and write flags are deliberately supplied',async()=>{
  process.env.ALLOW_LIVE_WRITES='true';process.env.ALLOW_LIVE_DATA_PROCESSING='true';process.env.GITHUB_TOKEN='fake-canary-token';process.env.ZENDESK_OAUTH_CLIENT_SECRET='fake-canary-secret';
  await db.workspaceSettings.update({where:{id:'workspace'},data:{allowLiveWrites:true,allowLiveDataProcessing:true}});
  const action=await proposed('ticket-002');expect(action.mode).toBe('dry_run');await flow.approveAction(action.id,actor);await flow.queueAction(action.id,actor);
  const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No writes allowed'));await worker.executeAction(action.id);expect(fetchSpy).not.toHaveBeenCalled();
 });
 it('SW-04 absent live key persists a failed Jev run without mock fallback',async()=>{
  process.env.JEV_MODE='live';const run=await freshDecision('ticket-006');expect(run.provider).toBe('jev');expect(run.status).toBe('failed');expect(run.output).toBeNull();expect(run.error).toMatch(/key|credential/i);
 });
 it('SW-05 edit invalidates approval and source ticket target cannot change',async()=>{
  const action=await proposed('ticket-008');await flow.approveAction(action.id,actor);
  await expect(flow.editAction(action.id,{...action.payload as object,ticketSourceId:'999999'},actor)).rejects.toThrow(/payload/);
  const edit=await flow.editAction(action.id,{...action.payload as object,reason:'Reviewed revised explanation'},actor);expect(edit.state).toBe('proposed');
  expect((await db.approval.findFirstOrThrow({where:{actionId:action.id}})).invalidatedAt).not.toBeNull();await expect(flow.queueAction(action.id,actor)).rejects.toThrow(/Approve/);
 });
 it('stale ticket and mode changes block an approved action server-side',async()=>{
  const action=await proposed('ticket-008');await flow.approveAction(action.id,actor);await db.ticket.update({where:{id:'ticket-008'},data:{version:{increment:1}}});
  await expect(flow.queueAction(action.id,actor)).rejects.toThrow(/stale/i);expect((await db.proposedAction.findUniqueOrThrow({where:{id:action.id}})).state).toBe('stale');
  const other=await proposed('ticket-003');await flow.approveAction(other.id,actor);process.env.JEV_MODE='live';await expect(flow.queueAction(other.id,actor)).rejects.toThrow(/mode|changed/i);
 });
 it('SW-06 duplicate execution produces one local receipt, expired lease becomes reconciliation',async()=>{
  const action=await proposed('ticket-009');await flow.approveAction(action.id,actor);await Promise.all([flow.queueAction(action.id,actor),flow.queueAction(action.id,actor)]);
  await Promise.all([worker.executeAction(action.id),worker.executeAction(action.id)]);
  expect(await db.actionAttempt.count({where:{actionId:action.id}})).toBe(1);
  const crashed=await proposed('ticket-008');await flow.approveAction(crashed.id,actor);await flow.queueAction(crashed.id,actor);await db.proposedAction.update({where:{id:crashed.id},data:{state:'executing'}});
  const recovered=await worker.executeAction(crashed.id);expect(recovered.state).toBe('needs_reconciliation');expect(await db.actionAttempt.count({where:{actionId:crashed.id}})).toBe(0);
 });
 it('an edit paused before its transaction cannot reset an executing approved action',async()=>{
  const action=await proposed('ticket-014');await flow.approveAction(action.id,actor);
  let releaseEdit!:()=>void,editReached!:()=>void,releaseWorker!:()=>void,workerReached!:()=>void;
  const editGate=new Promise<void>(r=>{releaseEdit=r;}),editReady=new Promise<void>(r=>{editReached=r;});
  const originalTransaction=db.$transaction.bind(db);
  vi.spyOn(db,'$transaction').mockImplementationOnce(((...args:Parameters<typeof db.$transaction>)=>{editReached();return editGate.then(()=>originalTransaction(...args));}) as typeof db.$transaction);
  const editing=flow.editAction(action.id,{...action.payload as object,reason:'Late replacement payload'},actor).then(()=>null,e=>e as Error);
  await editReady;await flow.queueAction(action.id,actor);
  const workerGate=new Promise<void>(r=>{releaseWorker=r;}),workerReady=new Promise<void>(r=>{workerReached=r;});
  const originalAttempt=db.actionAttempt.create.bind(db.actionAttempt);
  // The deliberately deferred test double returns a Promise instead of Prisma's lazy generic client.
  vi.spyOn(db.actionAttempt,'create').mockImplementationOnce((async(args:Parameters<typeof db.actionAttempt.create>[0])=>{const attempt=await originalAttempt(args);workerReached();await workerGate;return attempt;}) as unknown as typeof db.actionAttempt.create);
  const executing=worker.executeAction(action.id);await workerReady;
  try {
   releaseEdit();expect(await editing).toBeInstanceOf(Error);
   const current=await db.proposedAction.findUniqueOrThrow({where:{id:action.id}});expect(current.state).toBe('executing');expect(current.payload).toEqual(action.payload);
   expect((await db.approval.findFirstOrThrow({where:{actionId:action.id}})).invalidatedAt).toBeNull();
   await expect(flow.rejectAction(action.id,actor)).rejects.toThrow(/pending/);
  }finally{releaseWorker();}
  expect((await executing).state).toBe('succeeded');
 });
 it('approval paused before its transaction cannot approve a subsequently edited payload',async()=>{
  const action=await proposed('ticket-015');let release!:()=>void,reached!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{reached=r;});
  const original=db.$transaction.bind(db);vi.spyOn(db,'$transaction').mockImplementationOnce(((...args:Parameters<typeof db.$transaction>)=>{reached();return gate.then(()=>original(...args));}) as typeof db.$transaction);
  const approving=flow.approveAction(action.id,actor).then(()=>null,e=>e as Error);await ready;
  await flow.editAction(action.id,{...action.payload as object,reason:'A new exact preview'},actor);release();expect(await approving).toBeInstanceOf(Error);
  expect((await db.proposedAction.findUniqueOrThrow({where:{id:action.id}})).state).toBe('proposed');expect(await db.approval.count({where:{actionId:action.id,invalidatedAt:null}})).toBe(0);
 });
 it('leased jobs are claimed once and an expired lease is recoverable',async()=>{
  await db.job.updateMany({where:{state:'queued'},data:{state:'succeeded'}});
  const job=await flow.enqueue('evaluate',{ticketId:'ticket-004'},'test-atomic-claim');
  const claims=await Promise.all([worker.claimJob('one'),worker.claimJob('two')]);expect(claims.filter(j=>j?.id===job.id)).toHaveLength(1);
  await db.job.update({where:{id:job.id},data:{leaseUntil:new Date(Date.now()-1000)}});
  const recovered=await worker.claimJob('three');expect(recovered?.id).toBe(job.id);expect(recovered?.attempts).toBe(2);
  await db.job.update({where:{id:job.id},data:{state:'succeeded'}});
 });
 it('SW-07 internal notes stay out of snapshots/drafts and editing cannot disclose them',async()=>{
  const run=await freshDecision('ticket-010'),snapshot=await db.ticketSnapshot.findUniqueOrThrow({where:{id:run.snapshotId}});
  expect(JSON.stringify(snapshot.input)).not.toContain('Internal support note');
  const action=await flow.proposeAction('ticket-010','create_issue',{},actor);expect(JSON.stringify(action.payload)).not.toContain('Internal support note');
  const comment=await db.ticketComment.findFirstOrThrow({where:{ticketId:'ticket-010',visibility:'internal'}});
  await expect(flow.editAction(action.id,{...action.payload as object,body:comment.text},actor)).rejects.toThrow(/Internal-note/);
 });
 it('SW-08/SW-09 frozen predictions omit future comments and threshold changes cause zero new calls',async()=>{
  const spy=vi.spyOn((await import('../src/providers')).MockDecisionProvider.prototype,'decide');
  const oldSubject=(await db.ticket.findUniqueOrThrow({where:{id:'ticket-004'}})).subject;await db.ticket.update({where:{id:'ticket-004'},data:{subject:'FUTURE RESOLUTION — DO NOT USE'}});
  const initial=await flow.runEvaluation({task:'initial_routing',split:'development',newRun:true},actor);expect(initial.providerCalls).toBeGreaterThan(0);
  expect(spy.mock.calls.map(c=>c[0].subject)).not.toContain('FUTURE RESOLUTION — DO NOT USE');await db.ticket.update({where:{id:'ticket-004'},data:{subject:oldSubject}});
  const timestamps=(initial.settings as {decisionTimestamps:{ticketId:string;asOf:string}[]}).decisionTimestamps;
  expect(timestamps).toHaveLength((initial.predictions as unknown[]).length);
  const before=spy.mock.calls.length;
  const recompute=await flow.runEvaluation({task:'initial_routing',split:'development',threshold:.99},actor);
  expect(spy.mock.calls.length).toBe(before);expect(recompute.providerCalls).toBe(0);expect(recompute.predictions).toEqual(initial.predictions);
  expect((recompute.metrics as {total:number}).total).toBe((initial.metrics as {total:number}).total);
 });
 it('SW-10 invalid candidates, destinations and anonymous nonlocal mutations are denied',async()=>{
  await freshDecision();await expect(flow.approveLink('ticket-001','invented-issue','',actor)).rejects.toThrow(/candidate/);
  await expect(flow.proposeAction('ticket-001','route',{destination:'attacker'},actor)).rejects.toThrow(/known destination/);
  await expect(flow.approveAction((await proposed()).id,{...actor,role:'viewer'})).rejects.toThrow(/Reviewer/);
  const denied=await api(new Request('https://deployment.example/api/settings',{method:'POST',body:JSON.stringify({threshold:.5})}),['settings']);expect(denied.status).toBe(401);
  const csrf=await request('settings','POST',{threshold:.5},{origin:'https://attacker.example'});expect(csrf.status).toBe(403);
 });
 it('authenticated session requires CSRF and viewer cannot approve',async()=>{
  const {hashPassword}=await import('../src/server/auth');
  const user=await db.user.create({data:{username:'test-viewer',passwordHash:hashPassword('deliberately-long-test-password'),role:'viewer'}});
  await db.session.create({data:{id:'test-session',userId:user.id,csrfToken:'test-csrf',expiresAt:new Date(Date.now()+100000)}});
  const noCsrf=await api(new Request('https://deployment.example/api/settings',{method:'POST',headers:{cookie:'zenjev_session=test-session'},body:'{}'}),['settings']);expect(noCsrf.status).toBe(403);
  const viewer=await api(new Request('https://deployment.example/api/settings',{method:'POST',headers:{cookie:'zenjev_session=test-session','x-csrf-token':'test-csrf'},body:'{}'}),['settings']);expect(viewer.status).toBe(403);
 });
 it('login rejects oversized bodies and lengths and caps concurrent username failures with expiry',async()=>{
  const {login}=await import('../src/server/auth');const call=(username:string,password='wrong')=>login(new Request('http://127.0.0.1:3000/api/auth/login',{method:'POST',body:JSON.stringify({username,password})}));
  await expect(call('x'.repeat(129))).rejects.toMatchObject({status:400});await expect(call('test','x'.repeat(1025))).rejects.toMatchObject({status:400});await expect(call('test','x'.repeat(20000))).rejects.toMatchObject({status:413});
  const lookup=vi.spyOn(db.user,'findUnique').mockResolvedValue(null);const now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now);
  const results=await Promise.all(Array.from({length:1001},(_,n)=>call(`bounded-user-${n}`).catch(e=>e as {status:number})));
  expect(results.filter(r=>'status' in r&&r.status===429)).toHaveLength(1);expect(lookup).toHaveBeenCalledTimes(1000);
  clock.mockReturnValue(now+16*60_000);await expect(call('after-cache-expiry')).rejects.toMatchObject({status:401});expect(lookup).toHaveBeenCalledTimes(1001);clock.mockRestore();lookup.mockRestore();
 });
 it('audit records are append-only at the database layer',async()=>{
  const entry=await flow.audit('test','test.audit','workspace','succeeded');
  const {Client}=await import('pg');const client=new Client({connectionString:database});await client.connect();
  try {
   // Catch the server exception in a PostgreSQL block so the portable socket's error transport cannot obscure SQLSTATE.
   // If the trigger is absent, the mutation succeeds and the returned sentinel makes this test fail.
   await client.query(`CREATE OR REPLACE FUNCTION pg_temp.zenjev_verify_audit_guard(record_id text, operation text) RETURNS text AS $$ BEGIN IF operation='update' THEN UPDATE "AuditEvent" SET outcome='forged' WHERE id=record_id; ELSE DELETE FROM "AuditEvent" WHERE id=record_id; END IF; RETURN 'mutation_was_allowed'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ':' || SQLERRM; END; $$ LANGUAGE plpgsql`);
   const escaped=entry.id.replaceAll("'","''");
   const updated=await client.query(`SELECT pg_temp.zenjev_verify_audit_guard('${escaped}','update') AS result`);
   expect(updated.rows[0].result).toBe('P0001:AuditEvent is append-only');
   const deleted=await client.query(`SELECT pg_temp.zenjev_verify_audit_guard('${escaped}','delete') AS result`);
   expect(deleted.rows[0].result).toBe('P0001:AuditEvent is append-only');
   const unchanged=await client.query(`SELECT outcome FROM "AuditEvent" WHERE id='${escaped}'`);expect(unchanged.rows).toEqual([{outcome:'succeeded'}]);
  }finally{await client.end();}
 });
 it('simulated uncertain creation and backlink failure retain issue marker and never duplicate',async()=>{
  const action=await proposed('ticket-011','create_issue');await flow.approveAction(action.id,actor);
  const results=await Promise.all([request('demo/scenario','POST',{scenario:'backlink_failure',actionId:action.id}),request('demo/scenario','POST',{scenario:'backlink_failure',actionId:action.id})]);
  expect(results.filter(r=>r.ok)).toHaveLength(1);expect(await db.actionAttempt.count({where:{actionId:action.id,operation:'create_issue'}})).toBe(1);
  const before=await db.proposedAction.findUniqueOrThrow({where:{id:action.id}});expect(before.remoteIssueId).toBeTruthy();expect(before.state).toBe('needs_reconciliation');
  const after=await worker.reconcileAction(action.id);expect(after.remoteIssueId).toBe(before.remoteIssueId);expect(after.state).toBe('needs_reconciliation');
  const backlink=await flow.proposeBacklink(action.id,actor);expect(backlink.type).toBe('internal_note');expect(backlink.state).toBe('proposed');
  await flow.approveAction(backlink.id,actor);await flow.queueAction(backlink.id,actor);await worker.executeAction(backlink.id);
  const completed=await db.proposedAction.findUniqueOrThrow({where:{id:action.id}});expect(completed.remoteIssueId).toBe(before.remoteIssueId);expect(completed.receipt).toMatchObject({backlinkState:'succeeded'});expect(await db.actionAttempt.count({where:{actionId:action.id,operation:'create_issue'}})).toBe(1);
 });
 it('app tags and internal integration notes require exact separate approval and stay dry-run',async()=>{
  await freshDecision('ticket-012');
  const tags=await flow.proposeAction('ticket-012','tags',{tags:['zenjev_reviewed','zenjev_engineering']},actor);expect(tags.type).toBe('tags');
  await expect(flow.proposeAction('ticket-012','tags',{tags:['unrelated_tag']},actor)).rejects.toThrow(/app-specific/);
  const note=await flow.proposeAction('ticket-012','internal_note',{body:'Reviewed handoff requires additional diagnostic information.'},actor);
  await expect(flow.queueAction(note.id,actor)).rejects.toThrow(/Approve/);
  await flow.approveAction(note.id,actor);await flow.queueAction(note.id,actor);expect((await worker.executeAction(note.id)).receipt).toMatchObject({externalCalls:0,operation:'internal_note'});
 });
 it('signed webhook receipt and enqueue commit once, invalid/oversize requests enqueue nothing',async()=>{
  process.env.DATA_MODE='live';process.env.ZENDESK_SUBDOMAIN='example';process.env.ZENDESK_WEBHOOK_SECRET='fake-webhook-secret';
  const {receiveWebhook}=await import('../src/server/integrations');const raw=JSON.stringify({account:'example',ticket_id:'90071992547409930'}),timestamp=new Date().toISOString();
  const signature=createHmac('sha256',process.env.ZENDESK_WEBHOOK_SECRET).update(timestamp).update(raw).digest('base64');
  const build=(sig=signature,body=raw)=>new Request('http://127.0.0.1/api/webhooks/zendesk',{method:'POST',headers:{'x-zendesk-webhook-signature':sig,'x-zendesk-webhook-signature-timestamp':timestamp},body});
  const first=await receiveWebhook(build()),second=await receiveWebhook(build());expect(first.duplicate).toBe(false);expect(second.duplicate).toBe(true);
  const count=await db.job.count({where:{kind:'zendesk_ticket'}});await expect(receiveWebhook(build('invalid'))).rejects.toThrow(/signature/);await expect(receiveWebhook(build(signature,'x'.repeat(65537)))).rejects.toThrow(/limit/);expect(await db.job.count({where:{kind:'zendesk_ticket'}})).toBe(count);
 });
 it('configurable policy is persisted and frozen into decisions',async()=>{
  const configured={routingConfidence:.95,engineering:.99,missingInfo:.9,multipleIssues:.8,matchProbability:.99,matchMargin:.2};
  const updated=await request('settings','POST',{policyThresholds:configured});expect(updated.ok).toBe(true);expect((await updated.json()).threshold).toBe(.95);
  const run=await freshDecision('ticket-002');expect((run.output as {policy:unknown}).policy).toEqual(configured);expect((run.output as {proposedIssueId:string|null}).proposedIssueId).toBeNull();
  const rejected=await request('settings','POST',{policyThresholds:{...configured,engineering:1.2}});expect(rejected.status).toBe(400);
 });
 it('retention CLI dry-run and apply remove only selected old records and preserve audit',async()=>{
  const ticket=await db.ticket.create({data:{id:'test-retention-old',source:'synthetic',account:'demo',sourceId:'retention-old',number:'retention-old',subject:'Old synthetic retention fixture',organization:'Retention Example',incidentGroup:'retention',sourceUpdatedAt:new Date('2000-01-01T00:00:00Z'),createdAt:new Date('2000-01-01T00:00:00Z'),comments:{create:{id:'test-retention-comment',sourceId:'retention-comment',visibility:'public',text:'Synthetic retention test only',createdAt:new Date('2000-01-01T00:00:00Z')}}}});
  const beforeAudit=await db.auditEvent.count();const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const run=promisify(execFile);
  const args=['node_modules/tsx/dist/cli.mjs','scripts/retention.ts','--source=synthetic','--before=2001-01-01T00:00:00Z'];
  const options={cwd:process.cwd(),encoding:'utf8' as const,env:{NODE_ENV:'test' as const,PATH:process.env.PATH,DATABASE_URL:database,DATA_MODE:'demo',JEV_MODE:'mock'}};
  const dry=JSON.parse((await run(process.execPath,args,options)).stdout);expect(dry).toMatchObject({dryRun:true,tickets:1,auditPreserved:true});expect(await db.ticket.findUnique({where:{id:ticket.id}})).not.toBeNull();
  const applied=JSON.parse((await run(process.execPath,[...args,'--apply'],options)).stdout);expect(applied).toMatchObject({deletedTickets:1,auditPreserved:true});expect(await db.ticket.findUnique({where:{id:ticket.id}})).toBeNull();expect(await db.ticketComment.findUnique({where:{id:'test-retention-comment'}})).toBeNull();expect(await db.auditEvent.count()).toBe(beforeAudit+1);expect(await db.ticket.count()).toBe(100);
 });
 it('read APIs return real persisted counts, candidates, actions, health and evaluation data',async()=>{
  const queue=await request('tickets?q=webhook&pageSize=5');expect(queue.ok).toBe(true);const list=await queue.json();expect(list.tickets.length).toBeLessThanOrEqual(5);expect(list.total).toBeGreaterThan(0);
  const d=await (await request('tickets/ticket-001')).json();expect(d.ticket.comments).toHaveLength(3);expect(d.decisions.length).toBeGreaterThan(0);expect(d.candidates.length).toBeGreaterThan(0);
  expect((await (await request('engineering')).json()).issues.length).toBeGreaterThan(0);expect((await (await request('evaluation')).json()).latest).toBeTruthy();expect((await (await request('health')).json()).database).toBe('connected');
 });
});
