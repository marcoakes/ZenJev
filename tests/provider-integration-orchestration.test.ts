import {createHmac} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import type {PrismaClient,WorkspaceSettings,SyncCursor} from '@prisma/client';
import {buildContext} from '../src/domain';

/** All remote HTTP is intercepted. Uses only the isolated local test database. */
describe('durable provider orchestration with intercepted HTTP',()=>{
  let db:PrismaClient;
  let originalSettings:WorkspaceSettings|null=null,originalCursor:SyncCursor|null=null,originalRate:SyncCursor|null=null;
  let integrations:typeof import('../src/server/integrations');
  let workflows:typeof import('../src/server/workflows');
  const account='orchestration-fixture',sourceId='991001',ticketId=`zendesk:${account}:${sourceId}`;
  const sourceTime='2026-09-19T12:00:00.000Z';
  const remoteTicket={id:sourceId,subject:'Webhook callback times out',organization_id:'7',created_at:'2026-09-01T00:00:00Z',updated_at:sourceTime,tags:['customer_tag']};
  const baseComments=[{id:'991101',body:'The webhook times out and retry stops.',public:true,author_id:'9001',created_at:'2026-09-18T12:00:00Z'},{id:'991102',body:'PRIVATE_ORCHESTRATION_CANARY',public:false,author_id:'9002',created_at:'2026-09-18T13:00:00Z'},{id:'991103',body:'FUTURE_OUTCOME_LABEL billing resolved',public:true,author_id:'9001',created_at:'2027-01-01T00:00:00Z'}];
  const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
  const remoteFetch=vi.fn<typeof fetch>();
  function intercept(comments=baseComments,page?:unknown){
    remoteFetch.mockImplementation(async input=>{
      const url=String(input);
      if(url===`https://${account}.zendesk.com/oauth/tokens`)return json({access_token:'FIXTURE_ONLY_TOKEN',token_type:'bearer',expires_in:1800});
      if(url===`https://${account}.zendesk.com/api/v2/tickets/${sourceId}.json`)return json({ticket:remoteTicket});
      if(url.startsWith(`https://${account}.zendesk.com/api/v2/tickets/${sourceId}/comments.json?`))return json({comments,users:[{id:'9001',role:'end-user',name:'Fictional Person'},{id:'9002',role:'agent',name:'Fictional Agent'}],meta:{has_more:false,after_cursor:null}});
      if(url.startsWith(`https://${account}.zendesk.com/api/v2/incremental/tickets/cursor.json?`))return json(page??{tickets:[remoteTicket],after_cursor:'orchestration-page-after',end_of_stream:false});
      throw new Error('Unexpected outbound endpoint in isolated HTTP fixture');
    });
  }
  beforeAll(async()=>{
    const url=process.env.TEST_DATABASE_URL??process.env.ZENJEV_TEST_DATABASE_URL??process.env.DATABASE_URL;
    if(!url||new URL(url).pathname!=='/zenjev_test')throw new Error('Provider orchestration tests require the isolated zenjev_test database');
    vi.stubEnv('DATABASE_URL',url);vi.stubEnv('DATA_MODE','live');vi.stubEnv('JEV_MODE','live');vi.stubEnv('ZENDESK_SUBDOMAIN',account);vi.stubEnv('ZENDESK_OAUTH_CLIENT_ID','FIXTURE_CLIENT');vi.stubEnv('ZENDESK_OAUTH_CLIENT_SECRET','FIXTURE_SECRET');vi.stubEnv('ZENDESK_OAUTH_SCOPES','tickets:read');vi.stubEnv('ZENDESK_WEBHOOK_SECRET','FIXTURE_WEBHOOK_SECRET');vi.stubEnv('GITHUB_TOKEN','FIXTURE_GITHUB_TOKEN');vi.stubGlobal('fetch',remoteFetch);intercept();
    ({db}=await import('../src/server/db'));integrations=await import('../src/server/integrations');workflows=await import('../src/server/workflows');
    originalSettings=await db.workspaceSettings.findUnique({where:{id:'workspace'}});originalCursor=await db.syncCursor.findUnique({where:{id:'zendesk'}});originalRate=await db.syncCursor.findUnique({where:{id:'zendesk-export-rate'}});
    await db.workspaceSettings.upsert({where:{id:'workspace'},update:{dataMode:'live',jevMode:'live',repositories:['orchestration-fixture/issues']},create:{id:'workspace',dataMode:'live',jevMode:'live',repositories:['orchestration-fixture/issues'],teamMappings:{support:'101',integrations:'104'}}});
    await db.ticket.deleteMany({where:{id:ticketId}});await db.webhookReceipt.deleteMany({where:{account}});await db.job.deleteMany({where:{dedupKey:{startsWith:'orchestration:'}}});
  });
  afterAll(async()=>{
    vi.restoreAllMocks();
    if(db){
      const receipts=await db.webhookReceipt.findMany({where:{account}});
      await db.job.deleteMany({where:{OR:[{dedupKey:{in:receipts.map(r=>`webhook:${r.id}`)}},{dedupKey:{startsWith:`zendesk:${sourceId}:`}},{dedupKey:'zendesk-page:orchestration-page-after'}]}});
      await db.webhookReceipt.deleteMany({where:{account}});await db.ticket.deleteMany({where:{id:ticketId}});await db.syncCursor.deleteMany({where:{id:'github:orchestration-fixture/issues'}});
      if(originalCursor)await db.syncCursor.upsert({where:{id:'zendesk'},update:{cursor:originalCursor.cursor,lastSuccessAt:originalCursor.lastSuccessAt,error:originalCursor.error},create:originalCursor});else await db.syncCursor.deleteMany({where:{id:'zendesk'}});
      if(originalRate)await db.syncCursor.upsert({where:{id:'zendesk-export-rate'},update:{nextAllowedAt:originalRate.nextAllowedAt},create:originalRate});else await db.syncCursor.deleteMany({where:{id:'zendesk-export-rate'}});
      if(originalSettings){const {id,updatedAt,...values}=originalSettings;await db.workspaceSettings.update({where:{id},data:{...values,repositories:workflows.json(values.repositories),teamMappings:workflows.json(values.teamMappings),policyThresholds:workflows.json(values.policyThresholds),teamCriteria:workflows.json(values.teamCriteria)}});void updatedAt;}else await db.workspaceSettings.deleteMany({where:{id:'workspace'}});
    }
    vi.unstubAllEnvs();vi.unstubAllGlobals();
  });
  function webhook(body=JSON.stringify({account,ticket_id:sourceId}),timestamp=new Date().toISOString(),signature?:string){
    const signed=signature??createHmac('sha256','FIXTURE_WEBHOOK_SECRET').update(timestamp+body).digest('base64');
    return new Request('http://127.0.0.1:3000/api/webhooks/zendesk',{method:'POST',headers:{'x-zendesk-webhook-signature':signed,'x-zendesk-webhook-signature-timestamp':timestamp},body});
  }
  it('acknowledges only one durable job for repeated signed webhook deliveries',async()=>{
    const timestamp=new Date().toISOString();
    expect(await integrations.receiveWebhook(webhook(undefined,timestamp))).toEqual({accepted:true,duplicate:false});
    expect(await integrations.receiveWebhook(webhook(undefined,timestamp))).toEqual({accepted:true,duplicate:true});
    const receipts=await db.webhookReceipt.findMany({where:{account}});expect(receipts).toHaveLength(1);expect(await db.job.count({where:{dedupKey:`webhook:${receipts[0].id}`}})).toBe(1);expect(remoteFetch).not.toHaveBeenCalled();
  });
  it('rejects unsigned, stale and oversized notifications without enqueueing',async()=>{
    const count=await db.webhookReceipt.count({where:{account}});
    await expect(integrations.receiveWebhook(webhook(undefined,undefined,'invalid'))).rejects.toThrow('signature');
    await expect(integrations.receiveWebhook(webhook(undefined,new Date(Date.now()-600000).toISOString()))).rejects.toThrow('stale');
    await expect(integrations.receiveWebhook(webhook('x'.repeat(65537)))).rejects.toThrow('limit');
    expect(await db.webhookReceipt.count({where:{account}})).toBe(count);
  });
  it('idempotently imports full conversations and excludes future/private evaluation evidence',async()=>{
    intercept();await integrations.ingestZendeskTicket(sourceId);await integrations.ingestZendeskTicket(sourceId);
    const ticket=await db.ticket.findUniqueOrThrow({where:{id:ticketId},include:{comments:true}});
    expect(ticket.version).toBe(1);expect(ticket.comments).toHaveLength(3);
    const input=buildContext(workflows.domainTicket(ticket),{asOf:sourceTime});
    expect(JSON.stringify(input)).not.toContain('PRIVATE_ORCHESTRATION_CANARY');expect(JSON.stringify(input)).not.toContain('FUTURE_OUTCOME_LABEL');
    expect(await db.decisionRun.count({where:{ticketId}})).toBe(0);
    expect(remoteFetch.mock.calls.every(c=>String(c[0]).startsWith(`https://${account}.zendesk.com/`))).toBe(true);
  });
  it('customer-supplied receipt markers cannot suppress new evidence or ticket version changes',async()=>{
    const comments=[...baseComments,{id:'991104',body:'NEW_CUSTOMER_EVIDENCE [zenjev-action:fake-marker]',public:true,author_id:'9001',created_at:'2026-09-19T11:00:00Z'}];intercept(comments);await integrations.ingestZendeskTicket(sourceId);
    const ticket=await db.ticket.findUniqueOrThrow({where:{id:ticketId},include:{comments:true}});expect(ticket.version).toBe(2);const customer=ticket.comments.find(c=>c.sourceId==='991104');expect(customer?.integrationReceipt).toBe(false);
    expect(JSON.stringify(buildContext(workflows.domainTicket(ticket),{asOf:sourceTime}))).toContain('NEW_CUSTOMER_EVIDENCE');
  });
  it('does not advance a cursor if durable follow-on jobs fail; recovery commits the same page once',async()=>{
    await db.syncCursor.upsert({where:{id:'zendesk'},update:{cursor:'orchestration-before'},create:{id:'zendesk',provider:'zendesk',cursor:'orchestration-before'}});intercept();
    await db.syncCursor.upsert({where:{id:'zendesk-export-rate'},update:{nextAllowedAt:new Date(0)},create:{id:'zendesk-export-rate',provider:'zendesk',nextAllowedAt:new Date(0)}});
    let transactionCount=0;const realTransaction=db.$transaction.bind(db);
    const transaction=vi.spyOn(db,'$transaction').mockImplementation(((...args:Parameters<typeof db.$transaction>)=>{transactionCount++;if(transactionCount===2)return Promise.reject(new Error('Injected commit failure'));return realTransaction(...args);}) as typeof db.$transaction);
    await expect(integrations.syncZendeskPage()).rejects.toThrow('Injected commit failure');transaction.mockRestore();
    expect((await db.syncCursor.findUniqueOrThrow({where:{id:'zendesk'}})).cursor).toBe('orchestration-before');expect(await db.job.count({where:{dedupKey:`zendesk:${sourceId}:${sourceTime}`}})).toBe(0);
    await db.syncCursor.update({where:{id:'zendesk-export-rate'},data:{nextAllowedAt:new Date(0)}});
    const started=Date.now();await integrations.syncZendeskPage();
    await expect(integrations.syncZendeskPage()).rejects.toMatchObject({code:'rate_limit'});
    await db.syncCursor.update({where:{id:'zendesk-export-rate'},data:{nextAllowedAt:new Date(0)}});await integrations.syncZendeskPage();
    expect((await db.syncCursor.findUniqueOrThrow({where:{id:'zendesk'}})).cursor).toBe('orchestration-page-after');expect(await db.job.count({where:{dedupKey:`zendesk:${sourceId}:${sourceTime}`}})).toBe(1);
    const followup=await db.job.findUniqueOrThrow({where:{dedupKey:'zendesk-page:orchestration-page-after'}});expect(followup.availableAt.getTime()-started).toBeGreaterThanOrEqual(6000);
    const exports=remoteFetch.mock.calls.filter(c=>String(c[0]).includes('/incremental/'));expect(String(exports[0][0])).toContain('cursor=orchestration-before');expect(String(exports[1][0])).toContain('cursor=orchestration-before');
  });
  it('persists sync failure instead of reporting an empty issue index and redacts response bodies',async()=>{
    remoteFetch.mockReset();remoteFetch.mockResolvedValue(json({message:'PRIVATE_RATE_LIMIT_CANARY'},429,{'Retry-After':'60'}));
    await expect(integrations.syncGitHub()).rejects.toThrow('delayed retry');expect(remoteFetch).toHaveBeenCalledTimes(1);
    const status=await db.syncCursor.findUniqueOrThrow({where:{id:'github:orchestration-fixture/issues'}});expect(status.lastSuccessAt).toBeNull();expect(status.error).toContain('delayed retry');expect(status.error).not.toContain('PRIVATE_RATE_LIMIT_CANARY');
  });
});
