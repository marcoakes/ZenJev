import {createHmac} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {type ApprovalBinding,type ActionApproval,approvalHash,buildContext,type Candidate} from '../src/domain';
import {JevDecisionProvider,MockDecisionProvider,GitHubProvider,ZendeskProvider,verifyZendeskWebhook,requestJson,parseProviderJson} from '../src/providers';
const now=Date.parse('2026-09-19T12:00:00Z');
const snapshot=buildContext({id:'ticket-1',subject:'Webhook timeout',organization:'Example',source:'synthetic',version:1,createdAt:'2026-09-18T00:00:00Z',comments:[{id:'c1',text:'Callback timed out and retries stopped',visibility:'public',createdAt:'2026-09-18T00:00:00Z'}]},{asOf:new Date(now).toISOString()});
const candidate:Candidate={relevance:12,issue:{id:'example/repo#42',repository:'example/repo',number:'42',title:'Webhook retries stop on timeout',body:'Callback retry defect',state:'open',labels:['bug'],updatedAt:'2026-09-17T00:00:00Z',private:true}};
const response=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const nativeTriage=()=>({model:'jev-1.13.0',answers:{destination_team:{type:'choice',choice:'integrations',confidence:.92,probabilities:{support:.01,billing:.01,identity:.01,integrations:.95,platform:.01,unknown:.01}},issue_type:{type:'choice',choice:'bug_report',confidence:.9,probabilities:{how_to:.01,billing:.01,bug_report:.95,feature_request:.01,access:.01,unknown:.01}},impact:{type:'score',score:2.9,legend:{'0':'No workflow interruption is reported','1':'A minor inconvenience is reported','2':'A workflow is degraded but a workaround is described','3':'A critical customer workflow is blocked with no stated workaround'},probabilities:{'0':0,'1':0,'2':.1,'3':.9},confidence:.9},needs_engineering:{type:'noul',noul:.97},missing_repro_info:{type:'noul',noul:.1},multiple_issues:{type:'noul',noul:.01}},usage:{input_tokens:321,output_tokens:45}});
const options=(fetchFn:typeof fetch)=>({apiKey:'fixture-key-only',fetch:fetchFn,maxRetries:0});
const binding=(overrides:Partial<ApprovalBinding>={}):ApprovalBinding=>({actionId:'action-1',ticketId:'ticket-1',ticketVersion:1,ticketSnapshotId:snapshot.id,decisionId:'decision-1',decisionVersion:1,destination:'example/repo',dataSource:'zendesk',provider:'jev',mode:'live',kind:'create_issue',payload:{title:'Webhook timeout',body:'Redacted public evidence',repository:'example/repo'},...overrides});
const approved=(b:ApprovalBinding):ActionApproval=>({hash:approvalHash(b),reviewerId:'reviewer-1',reviewerRole:'reviewer',status:'approved',expiresAt:'2099-01-01T00:00:00Z'});
const controls={authenticated:true,allowLiveWrites:true,allowLiveDataProcessing:true,currentTicketVersion:1,currentDecisionVersion:1,repositories:['example/repo'],groups:['integrations']};
describe('native Jev HTTP contract',()=>{
  it('posts typed native questions, performs bounded candidate matching and preserves provenance/usage',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(nativeTriage())).mockResolvedValueOnce(response({model:'jev-1.13.0',answers:{match_0:{type:'noul',noul:.97}},usage:{input_tokens:111,output_tokens:12}}));
    const d=await new JevDecisionProvider(options(f)).decide(snapshot,[candidate]);
    expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
    const request=JSON.parse(String(f.mock.calls[0][1]!.body));expect(request).toMatchObject({model:'jev-1.13.0',state:{ticket:{subject:'Webhook timeout'}},questions:{destination_team:{type:'choice'},impact:{type:'score'},needs_engineering:{type:'noul'}}});expect(request).not.toHaveProperty('messages');expect(Object.keys(request.questions.destination_team.criteria)).toEqual(['support','billing','identity','integrations','platform','unknown']);
    expect(d).toMatchObject({provider:'jev',dataSource:'synthetic',reportedModel:'jev-1.13.0',inputTokens:432,outputTokens:57,proposedIssueId:'example/repo#42'});expect(d.providerLatencyMs).toBeGreaterThanOrEqual(0);
  });
  it('no key and disallowed live processing fail before any HTTP call',async()=>{
    const f=vi.fn<typeof fetch>();await expect(new JevDecisionProvider({...options(f),apiKey:''}).decide(snapshot,[])).rejects.toMatchObject({code:'configuration'});
    await expect(new JevDecisionProvider(options(f)).decide({...snapshot,dataSource:'zendesk'},[])).rejects.toMatchObject({code:'policy'});expect(f).not.toHaveBeenCalled();
  });
  it('authentication failures never silently become mock success and do not expose provider body/key',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({secret:'CANARY_RESPONSE_TOKEN'},401));const mock=vi.spyOn(MockDecisionProvider.prototype,'decide');
    try{await expect(new JevDecisionProvider({...options(f),maxRetries:3}).decide(snapshot,[])).rejects.toMatchObject({code:'authentication',message:'Provider authentication or permission failed'});expect(f).toHaveBeenCalledTimes(1);expect(mock).not.toHaveBeenCalled();}finally{mock.mockRestore();}
  });
  it.each(['bad-option','bad-distribution','missing-answer','wrong-type','nonfinite'])('rejects %s before candidate calls',async(kind)=>{
    const raw=nativeTriage();
    if(kind==='bad-option')raw.answers.destination_team.choice='evil/repo';
    if(kind==='bad-distribution')raw.answers.destination_team.probabilities.integrations=.1;
    if(kind==='missing-answer')delete (raw.answers as Record<string,unknown>).needs_engineering;
    if(kind==='wrong-type')(raw.answers.needs_engineering as unknown as {type:string}).type='choice';
    if(kind==='nonfinite')raw.answers.needs_engineering.noul=Infinity;
    const f=vi.fn<typeof fetch>().mockResolvedValue(response(raw));await expect(new JevDecisionProvider(options(f)).decide(snapshot,[candidate])).rejects.toMatchObject({code:'schema'});expect(f).toHaveBeenCalledTimes(1);
  });
  it('rejects invented candidate response keys',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(nativeTriage())).mockResolvedValueOnce(response({answers:{'evil/repo#900':{type:'noul',noul:1}}}));await expect(new JevDecisionProvider(options(f)).decide(snapshot,[candidate])).rejects.toMatchObject({code:'schema'});
  });
  it('missing model and usage are unknown, never invented or zero',async()=>{
    const raw=nativeTriage();delete (raw as Record<string,unknown>).model;delete (raw as Record<string,unknown>).usage;const f=vi.fn<typeof fetch>().mockResolvedValue(response(raw));expect(await new JevDecisionProvider(options(f)).decide(snapshot,[])).toMatchObject({reportedModel:null,inputTokens:null,outputTokens:null});
  });
});
describe('bounded HTTP reliability',()=>{
  it('honours Retry-After and bounded retry count',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response({},429,{'Retry-After':'2'})).mockResolvedValueOnce(response({},529)).mockResolvedValueOnce(response({ok:true}));const sleep=vi.fn<(ms:number)=>Promise<void>>(async()=>{});
    const result=await requestJson('https://api.example.com',{}, {fetch:f,maxRetries:2,sleep,random:()=>0});expect(result.body).toEqual({ok:true});expect(sleep.mock.calls[0][0]).toBe(2000);expect(f).toHaveBeenCalledTimes(3);
  });
  it('does not retry a timed-out or server-error mutation',async()=>{
    for(const outcome of ['timeout','server']){const f=outcome==='timeout'?vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout SECRET')):vi.fn<typeof fetch>().mockResolvedValue(response({},503));await expect(requestJson('https://api.example.com',{method:'POST'},{fetch:f,maxRetries:3},true)).rejects.toMatchObject({code:'uncertain'});expect(f).toHaveBeenCalledTimes(1);}
  });
  it('preserves external numeric identifiers beyond JavaScript safe integer precision',()=>{expect(parseProviderJson('{"id":9223372036854775807,"number":9007199254740993,"score":0.8}')).toEqual({id:'9223372036854775807',number:'9007199254740993',score:.8});});
});
describe('GitHub allowlist and writes',()=>{
  const remoteIssue={id:1,number:42,title:'Webhook retry',body:'Timeout',state:'open',labels:[{name:'bug'}],created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
  it('retrieves pages, excludes pull requests, uses current API header, and rejects unknown repos',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response({full_name:'example/repo',private:true})).mockResolvedValueOnce(response([remoteIssue,{...remoteIssue,number:43,pull_request:{url:'https://example.com'}}],200,{link:'<https://api.github.com/repos/example/repo/issues?page=2>; rel="next"'})).mockResolvedValueOnce(response([{...remoteIssue,id:2,number:44}]));
    const provider=new GitHubProvider({token:'fixture-token',repositories:['example/repo'],fetch:f});const issues=await provider.listIssues('example/repo');expect(issues.map(i=>i.number)).toEqual(['42','44']);expect(new Headers(f.mock.calls[1][1]!.headers).get('X-GitHub-Api-Version')).toBe('2026-03-10');await expect(provider.listIssues('evil/repo')).rejects.toMatchObject({code:'policy'});expect(f).toHaveBeenCalledTimes(3);
  });
  it('refetches destination visibility and blocks a private-to-public change',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({full_name:'example/repo',private:false}));const provider=new GitHubProvider({token:'fixture',repositories:['example/repo'],fetch:f});const b=binding();await expect(provider.createIssue(b,approved(b),controls)).rejects.toMatchObject({code:'policy'});expect(f).toHaveBeenCalledTimes(1);expect(f.mock.calls[0][1]!.method).not.toBe('POST');
  });
  it('synthetic and dry-run actions never invoke a provider write or metadata request',async()=>{
    const f=vi.fn<typeof fetch>();const provider=new GitHubProvider({token:'fixture',repositories:['example/repo'],fetch:f});
    for(const b of [binding({dataSource:'synthetic'}),binding({mode:'dry_run'})])await expect(provider.createIssue(b,approved(b),controls)).rejects.toThrow();expect(f).not.toHaveBeenCalled();
  });
  it('uncertain creation is marked for reconciliation and is not retried',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response({full_name:'example/repo',private:true})).mockRejectedValueOnce(new Error('socket timeout'));const b=binding();await expect(new GitHubProvider({token:'fixture',repositories:['example/repo'],fetch:f}).createIssue(b,approved(b),controls)).rejects.toMatchObject({code:'uncertain'});expect(f).toHaveBeenCalledTimes(2);expect(JSON.parse(String(f.mock.calls[1][1]!.body)).body).toContain('zenjev-action:action-1');
  });
});
describe('Zendesk OAuth, pagination and safe updates',()=>{
  const token={access_token:'fixture-oauth-token',token_type:'bearer',expires_in:1800};
  const remoteTicket={id:123,subject:'Webhook retry',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-18T00:00:00Z',tags:['customer_tag'],organization_id:7};
  const config=(f:typeof fetch)=>({subdomain:'example',clientId:'fixture-client',clientSecret:'fixture-secret',scopes:'tickets:read tickets:write',allowedGroupIds:['12'],fetch:f,now:()=>now,maxRetries:0,sleep:async()=>{}});
  it('uses client-credentials OAuth once, walks comments by cursor, preserves visibility and never fetches attachments',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response({comments:[{id:1,body:'Customer',public:true,created_at:'2026-09-17T00:00:00Z',attachments:[{content_url:'https://evil.example.com/file'}]}],meta:{has_more:true,after_cursor:'cursor-2'}})).mockResolvedValueOnce(response({comments:[{id:2,body:'Internal',public:false,created_at:'2026-09-18T00:00:00Z'}],meta:{has_more:false,after_cursor:null}}));
    const comments=await new ZendeskProvider(config(f)).comments('123');expect(comments.map(c=>c.visibility)).toEqual(['public','internal']);expect(f).toHaveBeenCalledTimes(3);expect(f.mock.calls[0][0]).toBe('https://example.zendesk.com/oauth/tokens');const grant=new URLSearchParams(String(f.mock.calls[0][1]!.body));expect(grant.get('grant_type')).toBe('client_credentials');expect(grant.has('refresh_token')).toBe(false);expect(String(f.mock.calls[2][0])).toContain('page%5Bafter%5D=cursor-2');expect(f.mock.calls.every(c=>String(c[0]).startsWith('https://example.zendesk.com/'))).toBe(true);
  });
  it('returns resumable export cursor, rejects newest-minute start and never follows supplied URLs',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response({tickets:[remoteTicket],after_cursor:'page2',end_of_stream:false,after_url:'https://evil.example.com/'}));const provider=new ZendeskProvider(config(f));expect(await provider.exportPage({startTime:now/1000-120})).toMatchObject({cursor:'page2',endOfStream:false});await expect(provider.exportPage({startTime:now/1000})).rejects.toMatchObject({code:'configuration'});expect(f).toHaveBeenCalledTimes(2);
  });
  it('preserves customer tags and fields and uses safe_update/updated_stamp',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response({ticket:remoteTicket})).mockResolvedValueOnce(response({ticket:{...remoteTicket,updated_at:'2026-09-19T12:00:00Z'}}));const b=binding({kind:'route',destination:'integrations',payload:{destination:'integrations',groupId:'12',tags:['zenjev_reviewed'],reason:'Reviewed evidence',ticketSourceId:'123',updatedAtSource:remoteTicket.updated_at}});
    await new ZendeskProvider(config(f)).updateTicket(b,approved(b),controls);const sent=JSON.parse(String(f.mock.calls[2][1]!.body));expect(sent).toEqual({ticket:{safe_update:true,updated_stamp:remoteTicket.updated_at,group_id:'12',tags:['customer_tag','zenjev_reviewed']}});expect(sent.ticket).not.toHaveProperty('subject');
  });
  it('stale remote ticket prevents PUT and conflict never blindly retries',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(token)).mockResolvedValueOnce(response({ticket:remoteTicket}));const b=binding({kind:'internal_note',destination:'123',payload:{body:'An integration result',ticketSourceId:'123',updatedAtSource:'2026-09-10T00:00:00Z'}});await expect(new ZendeskProvider(config(f)).updateTicket(b,approved(b),controls)).rejects.toMatchObject({code:'conflict'});expect(f).toHaveBeenCalledTimes(2);
  });
});
describe('Zendesk signed notifications',()=>{
  const raw='{"account":"example","ticket_id":"123"}',secret='fixture-signing-secret',timestamp=new Date(now).toISOString();
  const signature=(body=raw,time=timestamp)=>createHmac('sha256',secret).update(time+body).digest('base64');
  const args={rawBody:raw,secret,timestamp,signature:signature(),account:'example',now};
  it('validates raw body and produces stable deduplication identity',()=>{const a=verifyZendeskWebhook(args),b=verifyZendeskWebhook(args);expect(a).toEqual(b);expect(a.ticketId).toBe('123');});
  it('rejects invalid signatures, stale timestamps, large payloads, account mismatch and arbitrary URLs',()=>{
    expect(()=>verifyZendeskWebhook({...args,signature:'invalid'})).toThrow('signature');expect(()=>verifyZendeskWebhook({...args,now:now+300001})).toThrow('stale');expect(()=>verifyZendeskWebhook({...args,maxBytes:10})).toThrow('limit');expect(()=>verifyZendeskWebhook({...args,account:'foreign'})).toThrow('account');
    const withUrl='{"account":"example","ticket_id":"123","url":"https://evil.example.com"}';expect(()=>verifyZendeskWebhook({...args,rawBody:withUrl,signature:signature(withUrl)})).toThrow('account');
  });
});

describe('offline launcher credential isolation',()=>{
  it('strips fake build/product credentials before demo and check runtimes, without logging canaries',async()=>{
    const {spawnSync}=await import('node:child_process');
    const names=['ANTHROPIC_API_KEY','CODEX_API_KEY','OPENAI_API_KEY','GITHUB_TOKEN','TYPESAFE_API_KEY','ZENDESK_OAUTH_CLIENT_SECRET','NEXT_PUBLIC_TYPESAFE_API_KEY'];
    const environmentModule=new URL('../scripts/environment.mjs',import.meta.url).href;
    const child=spawnSync(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';import {cleanEnvironment,demoEnvironment} from ${JSON.stringify(environmentModule)};const names=${JSON.stringify(names)};for(const env of [cleanEnvironment(),demoEnvironment()]){for(const name of names)assert.equal(env[name],undefined);assert.equal(JSON.stringify(env).includes('CANARY_LAUNCH_SECRET'),false);}assert.equal(demoEnvironment().JEV_MODE,'mock');assert.equal(demoEnvironment().ALLOW_LIVE_WRITES,'false');console.log('credential-isolation-ok');`],{encoding:'utf8',env:{NODE_ENV:'test',PATH:process.env.PATH??'',...Object.fromEntries(names.map(name=>[name,'CANARY_LAUNCH_SECRET_'+name]))}});
    expect(child.status).toBe(0);expect(child.stdout.trim()).toBe('credential-isolation-ok');expect(child.stderr).toBe('');expect(child.stdout+child.stderr).not.toContain('CANARY_LAUNCH_SECRET');
  });
});

describe('provider scheduling metadata',()=>{
  it('classifies GitHub exhausted-rate 403 as retryable and preserves the server deadline',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({},403,{'x-ratelimit-remaining':'0','retry-after':'90'}));
    await expect(requestJson('https://api.github.com/repos/example/repo',{}, {fetch:f})).rejects.toMatchObject({code:'rate_limit',retryAfterMs:90000});expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('reviewed Jev question configuration',()=>{
  it('sends configured team descriptions with a fixed option allowlist and saved cutoffs',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response(nativeTriage()));
    const provider=new JevDecisionProvider({...options(f),teamCriteria:{integrations:'Investigate partner callbacks and connector delivery.'},thresholds:{routingConfidence:.95,engineering:.8,matchMargin:.2}});
    const d=await provider.decide(snapshot,[]);const body=JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(body.questions.destination_team.criteria.integrations).toBe('Investigate partner callbacks and connector delivery.');expect(Object.keys(body.questions.destination_team.criteria)).toHaveLength(6);expect(d.policy).toMatchObject({routingConfidence:.95,engineering:.8,matchMargin:.2});expect(d.reviewReasons).toContain('Destination confidence is below the review threshold');
  });
  it('rejects nonfinite/out-of-range policy and unknown team keys before HTTP',()=>{
    const f=vi.fn<typeof fetch>();expect(()=>new JevDecisionProvider({...options(f),thresholds:{engineering:NaN}})).toThrow('finite');expect(()=>new MockDecisionProvider({thresholds:{matchMargin:2}})).toThrow('finite');expect(()=>new JevDecisionProvider({...options(f),teamCriteria:{evil:'An invented destination'} as never})).toThrow('Unknown team');expect(f).not.toHaveBeenCalled();
  });
});
