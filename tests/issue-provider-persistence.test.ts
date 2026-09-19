import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import type {PrismaClient,WorkspaceSettings} from '@prisma/client';
import {buildContext,issueKey,type Decision,type DomainTicket} from '../src/domain';

/**
 * Cross-provider persistence. Every remote call is intercepted and only the isolated
 * zenjev_test database is used; no live credential, network or provider is involved.
 */
const database=process.env.TEST_DATABASE_URL??process.env.ZENJEV_TEST_DATABASE_URL;
const suite=database?describe:describe.skip;
describe('cross-provider issue persistence',()=>{
 suite('isolated test database',()=>{
  let db:PrismaClient;
  let flow:typeof import('../src/server/workflows');
  let worker:typeof import('../src/worker/processor');
  let integrations:typeof import('../src/server/integrations');
  let api:typeof import('../src/server/api').handleApi;
  let original:WorkspaceSettings|null=null;
  const account='provider-fixture',sourceId='770001',ticketId=`zendesk:${account}:${sourceId}`;
  const sourceTime='2026-09-19T12:00:00.000Z',createdAt='2026-09-01T00:00:00.000Z';
  const project='acme-group/platform/billing-service',repository='acme-group/billing';
  const reviewer='provider-fixture-reviewer';
  const remoteTicket={id:sourceId,subject:'Webhook callback times out',organization_id:'7',created_at:createdAt,updated_at:sourceTime,tags:['customer_tag']};
  const gitlabProject={id:8812,path_with_namespace:project,visibility:'private',web_url:`https://gitlab.com/${project}`};
  const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
  const remoteFetch=vi.fn<typeof fetch>();
  const actor={id:reviewer,role:'admin' as const,demo:false,csrfToken:'local-loopback-demo'};
  /** Zendesk always answers; the issue host is supplied per test. */
  function intercept(issueHandler:(url:string,init?:RequestInit)=>Response|Promise<Response>|null){
   remoteFetch.mockImplementation(async(input,init)=>{
    const url=String(input);
    if(url===`https://${account}.zendesk.com/oauth/tokens`)return json({access_token:'FIXTURE_ONLY_TOKEN',token_type:'bearer',expires_in:1800});
    if(url===`https://${account}.zendesk.com/api/v2/tickets/${sourceId}.json`)return json({ticket:remoteTicket});
    const handled=await issueHandler(url,init as RequestInit|undefined);
    if(handled)return handled;
    throw new Error(`Unexpected outbound endpoint in isolated fixture: ${url}`);
   });
  }
  const session={id:'provider-fixture-session',csrf:'provider-fixture-csrf'};
  /** A real administrator session: a workspace holding live tickets never receives the loopback demo actor. */
  async function request(path:string,method='GET',body?:unknown){
   return api(new Request(`http://127.0.0.1:3000/api/${path}`,{method,headers:{cookie:`zenjev_session=${session.id}`,'x-csrf-token':session.csrf,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),path.split('?')[0].split('/'));
  }
  /** A frozen snapshot and succeeded decision, written directly so no paid provider call is needed. */
  async function seedDecision(){
   const domain:DomainTicket={id:ticketId,subject:'Webhook callback times out',organization:'Fictional Org',source:'zendesk',version:1,createdAt,comments:[{id:'c1',text:'The webhook callback times out and retries stop.',visibility:'public',createdAt}]};
   const snapshot=buildContext(domain,{asOf:sourceTime});
   const decision:Decision={provider:'jev',dataSource:'zendesk',requestedModel:'jev-1.13.0',reportedModel:'jev-1.13.0',ticketSnapshotId:snapshot.id,rubricVersion:'triage-v1',destination:{value:'integrations',probabilities:{integrations:1},confidence:.95},issueType:{value:'bug_report',probabilities:{bug_report:1},confidence:.95},impact:{value:2,legend:{'2':'Degraded'},probabilities:{'2':1},confidence:.9},needsEngineering:.95,missingReproInfo:.1,multipleIssues:.01,contextIncomplete:false,providerLatencyMs:10,inputTokens:10,outputTokens:5,matches:[],proposedIssueId:null,reviewReasons:[]};
   await db.ticketSnapshot.upsert({where:{id:snapshot.id},update:{},create:{id:snapshot.id,ticketId,ticketVersion:1,contentHash:snapshot.hash,asOf:new Date(sourceTime),input:flow.json(snapshot),omissions:flow.json({messages:0,attachments:0}),includeInternalNotes:false}});
   await db.decisionRun.deleteMany({where:{ticketId}});
   return db.decisionRun.create({data:{ticketId,snapshotId:snapshot.id,ticketVersion:1,provider:'jev',dataSource:'zendesk',requestedModel:'jev-1.13.0',status:'succeeded',output:flow.json(decision)}});
  }
  async function liveDraft(destination:string){
   await seedDecision();
   const action=await flow.proposeAction(ticketId,'create_issue',{repository:destination,title:'Webhook retries stop after timeout',body:'Public evidence only. Retries stop after a callback timeout.'},actor);
   expect(action.mode).toBe('live');
   await flow.approveAction(action.id,actor);
   return action;
  }
  beforeAll(async()=>{
   if(!database||new URL(database).pathname!=='/zenjev_test')throw new Error('Cross-provider persistence tests require the isolated zenjev_test database');
   vi.stubEnv('DATABASE_URL',database);vi.stubEnv('DATA_MODE','live');vi.stubEnv('JEV_MODE','live');
   vi.stubEnv('ALLOW_LIVE_WRITES','true');vi.stubEnv('ALLOW_LIVE_DATA_PROCESSING','true');
   vi.stubEnv('ZENDESK_SUBDOMAIN',account);vi.stubEnv('ZENDESK_OAUTH_CLIENT_ID','FIXTURE_CLIENT');vi.stubEnv('ZENDESK_OAUTH_CLIENT_SECRET','FIXTURE_SECRET');vi.stubEnv('ZENDESK_OAUTH_SCOPES','read');
   vi.stubEnv('GITHUB_TOKEN','FIXTURE_GITHUB_TOKEN');vi.stubEnv('GITLAB_TOKEN','FIXTURE_GITLAB_TOKEN');
   vi.stubEnv('APP_BASE_URL','http://127.0.0.1:3000');vi.stubEnv('APP_BIND_HOST','127.0.0.1');
   vi.stubGlobal('fetch',remoteFetch);
   ({db}=await import('../src/server/db'));
   flow=await import('../src/server/workflows');worker=await import('../src/worker/processor');integrations=await import('../src/server/integrations');({handleApi:api}=await import('../src/server/api'));
   original=await db.workspaceSettings.findUnique({where:{id:'workspace'}});
   await db.user.upsert({where:{id:reviewer},update:{role:'admin'},create:{id:reviewer,username:reviewer,role:'admin',passwordHash:'x'.repeat(60)}});
   await db.session.upsert({where:{id:session.id},update:{expiresAt:new Date(Date.now()+3600_000)},create:{id:session.id,userId:reviewer,csrfToken:session.csrf,expiresAt:new Date(Date.now()+3600_000)}});
   await db.ticket.deleteMany({where:{id:ticketId}});
   await db.ticket.create({data:{id:ticketId,account,sourceId,number:sourceId,source:'zendesk',subject:'Webhook callback times out',organization:'Fictional Org',currentTeam:'support',status:'open',reviewState:'pending',version:1,incidentGroup:ticketId,createdAt:new Date(createdAt),sourceUpdatedAt:new Date(sourceTime),comments:{create:[{id:`${ticketId}:c1`,sourceId:'c1',text:'The webhook callback times out and retries stop.',visibility:'public',authorType:'customer',createdAt:new Date(createdAt)}]}}});
  },60000);
  beforeEach(async()=>{
   await db.proposedAction.deleteMany({where:{ticketId}});
   await db.workspaceSettings.upsert({where:{id:'workspace'},update:{dataMode:'live',jevMode:'live',allowLiveWrites:true,allowLiveDataProcessing:true,issueProvider:'gitlab',repositories:[project,repository]},create:{id:'workspace',dataMode:'live',jevMode:'live',allowLiveWrites:true,allowLiveDataProcessing:true,issueProvider:'gitlab',repositories:[project,repository],teamMappings:{support:'101',integrations:'104'}}});
   remoteFetch.mockReset();
  });
  afterAll(async()=>{
   if(db){
    await db.proposedAction.deleteMany({where:{ticketId}});
    await db.decisionRun.deleteMany({where:{ticketId}});await db.ticketSnapshot.deleteMany({where:{ticketId}});
    await db.ticketIssueLink.deleteMany({where:{ticketId}});await db.ticket.deleteMany({where:{id:ticketId}});
    await db.gitHubIssue.deleteMany({where:{repository:{in:[project,repository]}}});
    await db.syncCursor.deleteMany({where:{OR:[{id:{startsWith:'gitlab:'}},{id:{startsWith:'connection:'}},{id:`github:${repository}`}]}});
    await db.user.deleteMany({where:{id:reviewer}});
    if(original){const {id,updatedAt,...values}=original;await db.workspaceSettings.update({where:{id},data:{...values,repositories:flow.json(values.repositories),teamMappings:flow.json(values.teamMappings),policyThresholds:flow.json(values.policyThresholds),teamCriteria:flow.json(values.teamCriteria)}});void updatedAt;}
    await db.$disconnect();
   }
   vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();
  });

  it('stores a GitLab index scoped by provider and host without disturbing an identically numbered GitHub issue',async()=>{
   const legacyKey=issueKey({provider:'github',host:'github.com',project:repository},42);
   await db.gitHubIssue.upsert({where:{id:legacyKey},update:{},create:{id:legacyKey,repository,number:'42',title:'Historic GitHub issue',body:'Recorded before GitLab support',state:'open',labels:['bug'],private:true,source:'github',createdAt:new Date(createdAt),updatedAt:new Date(createdAt)}});
   intercept(url=>{
    if(url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`)return json(gitlabProject);
    if(url.startsWith(`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}/issues?`))return json([{id:99001,iid:42,title:'GitLab issue forty-two',description:'Distinct project-scoped issue',state:'opened',labels:['bug'],created_at:createdAt,updated_at:sourceTime,web_url:`https://gitlab.com/${project}/-/issues/42`}],200,{'x-next-page':''});
    if(url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(repository)}`)return json({message:'404 Project Not Found'},404);
    return null;
   });
   await expect(integrations.syncIssues()).rejects.toMatchObject({code:'authentication'});
   const stored=await db.gitHubIssue.findMany({where:{number:'42'},orderBy:{id:'asc'}});
   expect(stored.map(i=>[i.id,i.provider,i.host,i.repository])).toEqual([
    [legacyKey,'github','github.com',repository],
    [`gitlab:gitlab.com:${project}#42`,'gitlab','gitlab.com',project],
   ]);
   // The historic GitHub row is untouched and both survive the shared number.
   expect(stored[0].title).toBe('Historic GitHub issue');
   expect(await db.syncCursor.findUnique({where:{id:`gitlab:gitlab.com:${project}`}})).toMatchObject({provider:'gitlab'});
  });

  it('a pre-existing GitHub issue keeps its identifier, ticket link and default provider after migration',async()=>{
   const legacyKey=issueKey({provider:'github',host:'github.com',project:repository},7);
   await db.gitHubIssue.upsert({where:{id:legacyKey},update:{},create:{id:legacyKey,repository,number:'7',title:'Linked historic issue',body:'Body',state:'open',labels:[],private:true,source:'github',createdAt:new Date(createdAt),updatedAt:new Date(createdAt)}});
   const decision=await seedDecision();
   await db.ticketIssueLink.upsert({where:{ticketId_issueId:{ticketId,issueId:legacyKey}},update:{},create:{ticketId,issueId:legacyKey,reviewer,decisionId:decision.id}});
   const row=await db.gitHubIssue.findUniqueOrThrow({where:{id:legacyKey},include:{links:true}});
   expect(row.id).toBe('acme-group/billing#7');
   expect({provider:row.provider,host:row.host,url:row.url}).toEqual({provider:'github',host:'github.com',url:null});
   expect(row.links.map(l=>l.ticketId)).toEqual([ticketId]);
  });

  it('freezes provider and host onto an approved action and binds them into the approval',async()=>{
   const action=await liveDraft(project);
   expect({issueProvider:action.issueProvider,issueHost:action.issueHost}).toEqual({issueProvider:'gitlab',issueHost:'gitlab.com'});
   const stored=await db.proposedAction.findUniqueOrThrow({where:{id:action.id},include:{decision:true,approvals:true}});
   expect(flow.bindingFor(stored,stored.decision).target).toEqual({provider:'gitlab',host:'gitlab.com',project});
   expect(stored.approvals.filter(a=>!a.invalidatedAt)).toHaveLength(1);
  });

  it('the same draft on two providers produces separate actions rather than a deduplication collision',async()=>{
   // `repository` is a valid path for both providers, so only the provider and host differ.
   const draft={repository,title:'Webhook retries stop after timeout',body:'Public evidence only. Retries stop after a callback timeout.'};
   await seedDecision();
   const gitlabAction=await flow.proposeAction(ticketId,'create_issue',draft,actor);
   await db.workspaceSettings.update({where:{id:'workspace'},data:{issueProvider:'github'}});
   const githubAction=await flow.proposeAction(ticketId,'create_issue',draft,actor);
   expect(githubAction.id).not.toBe(gitlabAction.id);
   expect(githubAction.dedupKey).not.toBe(gitlabAction.dedupKey);
   expect({issueProvider:gitlabAction.issueProvider,issueHost:gitlabAction.issueHost}).toEqual({issueProvider:'gitlab',issueHost:'gitlab.com'});
   expect({issueProvider:githubAction.issueProvider,issueHost:githubAction.issueHost}).toEqual({issueProvider:'github',issueHost:'github.com'});
   // Re-proposing the identical draft under the same provider still deduplicates.
   expect((await flow.proposeAction(ticketId,'create_issue',draft,actor)).id).toBe(githubAction.id);
  });
  it('a nested GitLab path is refused as a GitHub destination before an action exists',async()=>{
   await db.workspaceSettings.update({where:{id:'workspace'},data:{issueProvider:'github'}});
   await seedDecision();
   await expect(flow.proposeAction(ticketId,'create_issue',{repository:project,title:'T',body:'Public evidence only.'},actor)).rejects.toThrow(/not valid for the selected issue provider/);
   expect(await db.proposedAction.count({where:{ticketId}})).toBe(0);
  });

  it('switching the configured provider makes an approved action stale before any request is attempted',async()=>{
   const action=await liveDraft(project);
   await db.workspaceSettings.update({where:{id:'workspace'},data:{issueProvider:'github'}});
   intercept(()=>{throw new Error('No issue request may be attempted for a mismatched provider');});
   await expect(flow.queueAction(action.id,actor)).rejects.toThrow(/provider or host changed/);
   const after=await db.proposedAction.findUniqueOrThrow({where:{id:action.id}});
   expect(after.state).toBe('stale');
   expect(remoteFetch.mock.calls.filter(c=>String(c[0]).includes('/api/v4/'))).toHaveLength(0);
  });

  it('executes an approved GitLab write once, refetching visibility and recording a reconcilable receipt',async()=>{
   const action=await liveDraft(project);
   await flow.queueAction(action.id,actor);
   const posted:RequestInit[]=[];
   intercept((url,init)=>{
    if(url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`)return json(gitlabProject);
    if(url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}/issues`&&init?.method==='POST'){posted.push(init);return json({id:99100,iid:501,web_url:`https://gitlab.com/${project}/-/issues/501`});}
    return null;
   });
   const executed=await worker.executeAction(action.id);
   expect(executed.state).toBe('succeeded');
   expect(executed.remoteIssueUrl).toBe(`https://gitlab.com/${project}/-/issues/501`);
   expect(executed.receipt).toMatchObject({number:'501',backlinkState:'requires_separate_approval'});
   expect(posted).toHaveLength(1);
   expect(JSON.parse(String(posted[0].body)).description).toContain(`<!-- zenjev-action:${action.id} -->`);
   // The backlink is a separate approval and quotes the GitLab issue URL form.
   const backlink=await flow.proposeBacklink(action.id,actor);
   expect(String((backlink.payload as {body:string}).body)).toContain(`https://gitlab.com/${project}/-/issues/501`);
  });

  it('a GitHub receipt URL cannot back a GitLab action backlink',async()=>{
   const action=await liveDraft(project);
   await db.proposedAction.update({where:{id:action.id},data:{state:'succeeded',remoteIssueId:'1',remoteIssueUrl:`https://github.com/${project}/issues/9`}});
   await expect(flow.proposeBacklink(action.id,actor)).rejects.toThrow(/provider, host and project/);
  });

  it('an uncertain GitLab write is held for reconciliation, never retried, and refuses to reconcile against another provider',async()=>{
   const action=await liveDraft(project);
   await flow.queueAction(action.id,actor);
   let posts=0;
   intercept((url,init)=>{
    if(url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`)return json(gitlabProject);
    if(url.endsWith('/issues')&&init?.method==='POST'){posts++;throw new Error('socket timeout');}
    return null;
   });
   const executed=await worker.executeAction(action.id);
   expect(executed.state).toBe('needs_reconciliation');
   expect(posts).toBe(1);
   await db.workspaceSettings.update({where:{id:'workspace'},data:{issueProvider:'github'}});
   await expect(worker.reconcileAction(action.id)).rejects.toThrow(/differs from the approved destination/);
   expect((await db.proposedAction.findUniqueOrThrow({where:{id:action.id}})).state).toBe('needs_reconciliation');
  });

  it('GitHub issue creation still works end to end under the same approval rules',async()=>{
   await db.workspaceSettings.update({where:{id:'workspace'},data:{issueProvider:'github'}});
   await seedDecision();
   const action=await flow.proposeAction(ticketId,'create_issue',{repository,title:'Webhook retries stop after timeout',body:'Public evidence only. Retries stop after a callback timeout.'},actor);
   expect({issueProvider:action.issueProvider,issueHost:action.issueHost}).toEqual({issueProvider:'github',issueHost:'github.com'});
   await flow.approveAction(action.id,actor);await flow.queueAction(action.id,actor);
   const posted:RequestInit[]=[];
   intercept((url,init)=>{
    if(url===`https://api.github.com/repos/${repository}`)return json({full_name:repository,private:true});
    if(url===`https://api.github.com/repos/${repository}/issues`&&init?.method==='POST'){posted.push(init);return json({id:5150,number:88,html_url:`https://github.com/${repository}/issues/88`});}
    return null;
   });
   const executed=await worker.executeAction(action.id);
   expect(executed.state).toBe('succeeded');
   expect(executed.remoteIssueUrl).toBe(`https://github.com/${repository}/issues/88`);
   expect(posted).toHaveLength(1);
   expect(JSON.parse(String(posted[0].body)).body).toContain(`<!-- zenjev-action:${action.id} -->`);
  });

  it('the settings endpoint validates the allowlist against the selected provider and never accepts a host',async()=>{
   // The HTTP surface runs in demo mode: live startup deliberately refuses demo database credentials.
   vi.stubEnv('DATA_MODE','demo');vi.stubEnv('JEV_MODE','mock');
   await db.workspaceSettings.update({where:{id:'workspace'},data:{dataMode:'demo',jevMode:'mock',issueProvider:'github',repositories:[repository]}});
   const nested=await request('settings','POST',{repositories:[project]});
   expect(nested.status).toBe(400);
   expect((await nested.json()).error).toMatch(/allowlist/i);
   const host=await request('settings','POST',{issueHost:'https://attacker.example.com'});
   expect(host.status).toBe(400);
   expect((await host.json()).error).toMatch(/Unknown setting/i);
   const unknown=await request('settings','POST',{issueProvider:'bitbucket'});
   expect(unknown.status).toBe(400);
   expect((await unknown.json()).error).toMatch(/Unknown issue provider/i);
   const selected=await request('settings','POST',{issueProvider:'gitlab',repositories:[project,repository]});
   expect(selected.status).toBe(200);
   expect(await selected.json()).toMatchObject({issueProvider:'gitlab',issueHost:'gitlab.com'});
   // Returning to GitHub while a nested project remains allowlisted must be refused, not silently truncated.
   const back=await request('settings','POST',{issueProvider:'github'});
   expect(back.status).toBe(400);
   expect((await back.json()).error).toMatch(/supply a new allowlist/i);
   expect((await db.workspaceSettings.findUniqueOrThrow({where:{id:'workspace'}})).issueProvider).toBe('gitlab');
   vi.stubEnv('DATA_MODE','live');vi.stubEnv('JEV_MODE','live');
  });

  it('reports the credential as configured but unverified until a check succeeds, and refuses a check by default',async()=>{
   const settings=await import('../src/server/settings');
   expect(await settings.publicSettings()).toMatchObject({issueProvider:'gitlab',issueHost:'gitlab.com',issueCredentialState:'configured'});
   await expect(integrations.checkIssueConnection(project)).rejects.toThrow(/ALLOW_LIVE_CONNECTION_CHECK/);
   vi.stubEnv('ALLOW_LIVE_CONNECTION_CHECK','true');
   intercept(url=>url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`?json(gitlabProject):null);
   expect(await integrations.checkIssueConnection(project)).toMatchObject({provider:'gitlab',host:'gitlab.com',visibility:'private'});
   expect((await settings.publicSettings()).issueCredentialState).toBe('connection_verified');
   intercept(url=>url===`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`?json({message:'401 Unauthorized'},401):null);
   await expect(integrations.checkIssueConnection(project)).rejects.toMatchObject({code:'authentication'});
   expect((await settings.publicSettings()).issueCredentialState).toBe('connection_failed');
   // A project outside the allowlist is refused before any request.
   remoteFetch.mockReset();
   await expect(integrations.checkIssueConnection('other/elsewhere')).rejects.toThrow(/allowlisted/);
   expect(remoteFetch).not.toHaveBeenCalled();
   vi.stubEnv('ALLOW_LIVE_CONNECTION_CHECK','');
  });
 });
});
