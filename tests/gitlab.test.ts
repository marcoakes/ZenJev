import {describe,it,expect,vi} from 'vitest';
import {type ApprovalBinding,type ActionApproval,approvalHash,issueKey,isProjectPath,assertActionAllowed} from '../src/domain';
import {GitLabProvider,GitHubProvider,resolveGitLabServer,requestJson} from '../src/providers';
const TOKEN='glpat-FIXTURE_GITLAB_CANARY_TOKEN';
const project='acme-group/platform/billing-service';
const response=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const remoteProject={id:8812,path_with_namespace:project,visibility:'private',web_url:`https://gitlab.com/${project}`};
const remoteIssue={id:99001,iid:42,title:'Webhook retries stop on timeout',description:'Callback retry defect',state:'opened',labels:['bug','integrations'],created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-02T00:00:00Z',web_url:`https://gitlab.com/${project}/-/issues/42`};
const provider=(f:typeof fetch,overrides:Partial<ConstructorParameters<typeof GitLabProvider>[0]>={})=>new GitLabProvider({token:TOKEN,projects:[project],fetch:f,maxRetries:0,...overrides});
const binding=(overrides:Partial<ApprovalBinding>={}):ApprovalBinding=>({actionId:'action-1',ticketId:'ticket-1',ticketVersion:1,ticketSnapshotId:'snapshot-1',decisionId:'decision-1',decisionVersion:1,destination:project,dataSource:'zendesk',provider:'jev',mode:'live',kind:'create_issue',target:{provider:'gitlab',host:'gitlab.com',project},payload:{title:'Webhook timeout',body:'Redacted public evidence',repository:project},...overrides});
const approved=(b:ApprovalBinding):ActionApproval=>({hash:approvalHash(b),reviewerId:'reviewer-1',reviewerRole:'reviewer',status:'approved',expiresAt:'2099-01-01T00:00:00Z'});
const controls={authenticated:true,allowLiveWrites:true,allowLiveDataProcessing:true,currentTicketVersion:1,currentDecisionVersion:1,repositories:[project],groups:['integrations']};

describe('GitLab server configuration',()=>{
  it('accepts a bare HTTPS origin and keeps a nondefault port in the stored host',()=>{
    expect(resolveGitLabServer('https://gitlab.com')).toEqual({origin:'https://gitlab.com',host:'gitlab.com'});
    expect(resolveGitLabServer('https://gitlab.example.com:8443')).toEqual({origin:'https://gitlab.example.com:8443',host:'gitlab.example.com:8443'});
  });
  it.each([
    ['http://gitlab.example.com','HTTPS'],
    ['https://user:pw@gitlab.example.com','bare origin'],
    ['https://gitlab.example.com/gitlab','bare origin'],
    ['https://gitlab.example.com/?a=1','bare origin'],
    ['not-a-url','valid absolute URL'],
  ])('refuses %s',(url,reason)=>{expect(()=>resolveGitLabServer(url)).toThrow(reason);});
  it.each(['https://localhost','https://127.0.0.1','https://10.1.2.3','https://172.20.0.5','https://192.168.1.10','https://169.254.169.254','https://gitlab.internal'])('refuses the private endpoint %s unless it is explicitly declared',host=>{
    expect(()=>resolveGitLabServer(host)).toThrow('private-network');
    expect(resolveGitLabServer(host,true).origin).toBe(new URL(host).origin);
  });
  it('refuses to construct an adapter for an invalid server URL before any request',()=>{
    const f=vi.fn<typeof fetch>();
    expect(()=>provider(f,{serverUrl:'http://gitlab.example.com'})).toThrow('HTTPS');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('GitLab project paths and stored identity',()=>{
  it('accepts nested groups and rejects traversal, reserved suffixes and single segments',()=>{
    for(const valid of ['group/project','a/b/c','acme-group/platform/billing-service','g1/g2/g3/g4/p'])expect(isProjectPath(valid)).toBe(true);
    for(const invalid of ['project','/group/project','group/','group/../secret','group/project.git','group/project.atom','group//project','-group/project','a/b/c/d/e/f/g'])expect(isProjectPath(invalid)).toBe(false);
    expect(isProjectPath('a/b/c','github')).toBe(false);
  });
  it('keeps historic GitHub.com keys and qualifies every other host, so numbers cannot collide',()=>{
    expect(issueKey({provider:'github',host:'github.com',project:'example/repo'},42)).toBe('example/repo#42');
    expect(issueKey({provider:'gitlab',host:'gitlab.com',project:'example/repo'},42)).toBe('gitlab:gitlab.com:example/repo#42');
    expect(issueKey({provider:'gitlab',host:'gitlab.example.com',project:'example/repo'},42)).toBe('gitlab:gitlab.example.com:example/repo#42');
    expect(issueKey({provider:'github',host:'ghe.example.com',project:'example/repo'},42)).toBe('github:ghe.example.com:example/repo#42');
    const keys=new Set([issueKey({provider:'github',host:'github.com',project:'example/repo'},42),issueKey({provider:'gitlab',host:'gitlab.com',project:'example/repo'},42)]);
    expect(keys.size).toBe(2);
  });
});

describe('GitLab issue retrieval',()=>{
  it('encodes the nested path, sends bearer auth, follows x-next-page and reports project-scoped identifiers',async()=>{
    const f=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(remoteProject))
      .mockResolvedValueOnce(response([remoteIssue],200,{'x-next-page':'2'}))
      .mockResolvedValueOnce(response([{...remoteIssue,id:99002,iid:43,state:'closed',web_url:`https://gitlab.com/${project}/-/issues/43`}],200,{'x-next-page':''}));
    const issues=await provider(f).listIssues(project);
    expect(f).toHaveBeenCalledTimes(3);
    expect(String(f.mock.calls[0][0])).toBe(`https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`);
    expect(new Headers(f.mock.calls[1][1]!.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(String(f.mock.calls[2][0])).toContain('page=2');
    expect(issues.map(i=>[i.id,i.number,i.state])).toEqual([[`gitlab:gitlab.com:${project}#42`,'42','open'],[`gitlab:gitlab.com:${project}#43`,'43','closed']]);
    expect(issues[0]).toMatchObject({repository:project,provider:'gitlab',host:'gitlab.com',private:true,labels:['bug','integrations'],url:`https://gitlab.com/${project}/-/issues/42`});
  });
  it('excludes task work items and marks issues in a nonprivate project as not private',async()=>{
    const f=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({...remoteProject,visibility:'internal'}))
      .mockResolvedValueOnce(response([remoteIssue,{...remoteIssue,id:99003,iid:44,type:'TASK'},{...remoteIssue,id:99004,iid:45,type:'ISSUE'}],200,{'x-next-page':''}));
    const issues=await provider(f).listIssues(project);
    expect(issues.map(i=>i.number)).toEqual(['42','45']);
    expect(issues.every(i=>i.private===false)).toBe(true);
  });
  it('rejects a project outside the allowlist and an invalid path before any request',async()=>{
    const f=vi.fn<typeof fetch>();
    await expect(provider(f).listIssues('other-group/secret')).rejects.toMatchObject({code:'policy'});
    await expect(provider(f,{projects:['group/../secret']}).listIssues('group/../secret')).rejects.toMatchObject({code:'policy'});
    expect(f).not.toHaveBeenCalled();
  });
  it('reports an exhausted pagination bound as an incomplete sync rather than a partial index',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject)).mockImplementation(async()=>response([remoteIssue],200,{'x-next-page':'9'}));
    await expect(provider(f).listIssues(project,2)).rejects.toMatchObject({code:'transient'});
  });
  it.each([
    ['an unknown state',[{...remoteIssue,state:'merged'}]],
    ['a missing iid',[{...remoteIssue,iid:undefined}]],
    ['a nonarray body',{issues:[remoteIssue]}],
  ])('rejects %s as a schema error',async(_label,body)=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject)).mockResolvedValueOnce(response(body,200,{'x-next-page':''}));
    await expect(provider(f).listIssues(project)).rejects.toMatchObject({code:'schema'});
  });
  it('rejects a project response whose path does not match the requested project',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response({...remoteProject,path_with_namespace:'attacker/elsewhere'}));
    await expect(provider(f).project(project)).rejects.toMatchObject({code:'schema'});
  });
});

describe('GitLab error, rate-limit and redaction handling',()=>{
  it('reports a hidden or missing project as an access failure, not an empty result',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({message:'404 Project Not Found'},404));
    await expect(provider(f).project(project)).rejects.toMatchObject({code:'authentication',status:404});
  });
  it('maps an invalid token and an insufficient scope to authentication without retrying',async()=>{
    for(const status of [401,403]){
      const f=vi.fn<typeof fetch>().mockResolvedValue(response({message:'denied'},status));
      await expect(provider(f,{maxRetries:3}).project(project)).rejects.toMatchObject({code:'authentication'});
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it('preserves a GitLab RateLimit-Reset deadline and never retries earlier than the server allows',async()=>{
    const reset=Math.floor(Date.now()/1000)+90;
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({},429,{'ratelimit-remaining':'0','ratelimit-reset':String(reset)}));
    const error=await requestJson('https://gitlab.com/api/v4/projects/1',{},{fetch:f,maxRetries:2}).catch((e:unknown)=>e);
    expect(error).toMatchObject({code:'rate_limit'});
    expect((error as {retryAfterMs:number}).retryAfterMs).toBeGreaterThan(80_000);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('never places the token in a URL and never repeats it in a raised error',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({message:`denied for ${TOKEN}`},403));
    const error=await provider(f).project(project).catch((e:unknown)=>e);
    expect(String((error as Error).message)+String((error as Error).stack)).not.toContain(TOKEN);
    expect(f.mock.calls.every(call=>!String(call[0]).includes(TOKEN))).toBe(true);
    expect(f.mock.calls.every(call=>String(call[0]).startsWith('https://gitlab.com/api/v4/'))).toBe(true);
  });
});

describe('GitLab approved writes',()=>{
  it('refetches visibility, appends the action marker and returns provider identifiers',async()=>{
    const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject)).mockResolvedValueOnce(response({id:99010,iid:77,web_url:`https://gitlab.com/${project}/-/issues/77`}));
    const b=binding();
    const created=await provider(f).createIssue(b,approved(b),controls);
    expect(created).toEqual({id:'99010',number:'77',url:`https://gitlab.com/${project}/-/issues/77`,marker:'zenjev-action:action-1'});
    expect(f.mock.calls[0][1]!.method).not.toBe('POST');
    const sent=JSON.parse(String(f.mock.calls[1][1]!.body));
    expect(sent.title).toBe('Webhook timeout');
    expect(sent.description).toContain('<!-- zenjev-action:action-1 -->');
    expect(sent).not.toHaveProperty('body');
  });
  it.each(['internal','public'])('refuses a write to a %s project after one metadata read',async visibility=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(response({...remoteProject,visibility}));
    const b=binding();
    await expect(provider(f).createIssue(b,approved(b),controls)).rejects.toMatchObject({code:'policy'});
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1]!.method).not.toBe('POST');
  });
  it('treats a timeout or malformed creation response as uncertain and never retries it',async()=>{
    for(const outcome of ['timeout','malformed']){
      const f=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject));
      if(outcome==='timeout')f.mockRejectedValueOnce(new Error('socket timeout'));else f.mockResolvedValueOnce(response({ok:true}));
      const b=binding();
      await expect(provider(f,{maxRetries:3}).createIssue(b,approved(b),controls)).rejects.toMatchObject({code:'uncertain'});
      expect(f).toHaveBeenCalledTimes(2);
    }
  });
  it('synthetic and dry-run issue actions never reach the network',async()=>{
    const f=vi.fn<typeof fetch>();
    for(const b of [binding({dataSource:'synthetic'}),binding({mode:'dry_run'})])await expect(provider(f).createIssue(b,approved(b),controls)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it('reconciles by action marker, refuses ambiguity and never creates a replacement',async()=>{
    const marked={...remoteIssue,description:`Body\n\n<!-- zenjev-action:action-1 -->`};
    const found=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject)).mockResolvedValueOnce(response([remoteIssue,marked],200,{'x-next-page':''}));
    expect(await provider(found).reconcileIssue(project,'action-1')).toMatchObject({number:'42'});
    expect(found.mock.calls.every(call=>call[1]?.method===undefined||call[1]?.method==='GET')).toBe(true);
    const missing=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject)).mockResolvedValueOnce(response([remoteIssue],200,{'x-next-page':''}));
    expect(await provider(missing).reconcileIssue(project,'action-1')).toBeNull();
    const ambiguous=vi.fn<typeof fetch>().mockResolvedValueOnce(response(remoteProject)).mockResolvedValueOnce(response([marked,{...marked,iid:43}],200,{'x-next-page':''}));
    await expect(provider(ambiguous).reconcileIssue(project,'action-1')).rejects.toMatchObject({code:'conflict'});
  });
});

describe('cross-provider approval boundary',()=>{
  const github=(f:typeof fetch)=>new GitHubProvider({token:'fixture-github-token',repositories:['example/repo'],fetch:f,maxRetries:0});
  it('a GitHub approval cannot authorise a GitLab write, and the reverse also fails, before any request',async()=>{
    const f=vi.fn<typeof fetch>();
    const githubBinding=binding({destination:'example/repo',target:{provider:'github',host:'github.com',project:'example/repo'},payload:{title:'T',body:'B',repository:'example/repo'}});
    await expect(provider(f,{projects:['example/repo']}).createIssue(githubBinding,approved(githubBinding),{...controls,repositories:['example/repo']})).rejects.toMatchObject({code:'policy'});
    const gitlabBinding=binding({destination:'example/repo',target:{provider:'gitlab',host:'gitlab.com',project:'example/repo'},payload:{title:'T',body:'B',repository:'example/repo'}});
    await expect(github(f).createIssue(gitlabBinding,approved(gitlabBinding),{...controls,repositories:['example/repo']})).rejects.toMatchObject({code:'policy'});
    expect(f).not.toHaveBeenCalled();
  });
  it('an approval bound to one self-managed host cannot be replayed against another',async()=>{
    const f=vi.fn<typeof fetch>();
    const other=binding({target:{provider:'gitlab',host:'gitlab.example.com',project}});
    await expect(provider(f).createIssue(other,approved(other),controls)).rejects.toMatchObject({code:'policy'});
    expect(f).not.toHaveBeenCalled();
  });
  it('an issue approval must carry a target, must match its destination and must match current configuration',()=>{
    const untargeted:ApprovalBinding={...binding()};delete untargeted.target;
    expect(()=>assertActionAllowed(untargeted,approved(untargeted),controls)).toThrow('must bind a provider');
    const mismatched=binding({target:{provider:'gitlab',host:'gitlab.com',project:'other/elsewhere'}});
    expect(()=>assertActionAllowed(mismatched,approved(mismatched),controls)).toThrow('does not match the bound destination');
    const b=binding();
    expect(()=>assertActionAllowed(b,approved(b),{...controls,issueTarget:{provider:'github',host:'github.com'}})).toThrow('changed after approval');
    expect(()=>assertActionAllowed(b,approved(b),{...controls,issueTarget:{provider:'gitlab',host:'gitlab.com'}})).not.toThrow();
  });
  it('changing the bound target invalidates the approval hash',()=>{
    const original=binding();
    const moved={...original,target:{provider:'gitlab' as const,host:'gitlab.com',project:'acme-group/platform/other'}};
    expect(approvalHash(original)).not.toBe(approvalHash(moved));
    expect(()=>assertActionAllowed(moved,approved(original),controls)).toThrow('Approval payload or context changed');
  });
  it('a Zendesk action keeps the binding hash it had before issue targets existed',()=>{
    const route:ApprovalBinding={actionId:'action-2',ticketId:'ticket-1',ticketVersion:1,ticketSnapshotId:'snapshot-1',decisionId:'decision-1',decisionVersion:1,destination:'integrations',dataSource:'zendesk',provider:'jev',mode:'live',kind:'route',payload:{destination:'integrations'}};
    expect(approvalHash(route)).toBe(approvalHash({...route}));
    expect(()=>assertActionAllowed(route,approved(route),controls)).not.toThrow();
  });
});
