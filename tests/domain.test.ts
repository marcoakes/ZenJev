import {describe,it,expect,vi} from 'vitest';
import {type DomainTicket,type Issue,type Decision,type ApprovalBinding,type ActionApproval,type SavedPrediction,buildContext,retrieveCandidates,sanitize,contentHash,reviewReasons,selectMatch,approvalHash,assertActionAllowed,evaluateSaved,incidentSplit,validateDatasetSplits,buildIssueDraft,decisionFingerprint} from '../src/domain';
import {MockDecisionProvider} from '../src/providers';
const asOf='2026-09-19T09:00:00.000Z';
const ticket:DomainTicket={id:'1',subject:'Webhook timeout',organization:'Secret Company',source:'synthetic',version:1,createdAt:'2026-09-18T09:00:00Z',customerNames:['Alice Smith'],comments:[{id:'1-public',text:'Alice Smith at Secret Company: callback timed out and retries stopped. alice@example.com',visibility:'public',createdAt:'2026-09-18T09:00:00Z'},{id:'1-internal',text:'INTERNAL_CANARY token=TEST_SECRET',visibility:'internal',createdAt:'2026-09-18T10:00:00Z'},{id:'1-future',text:'FUTURE_LABEL billing resolved',visibility:'public',createdAt:'2026-09-20T00:00:00Z'}]};
const issue:Issue={id:'i1',repository:'example/integrations',number:'42',title:'Webhook retry stops on timeout',body:'Callback delivery fails after timeout without retry',state:'open',labels:['webhook'],updatedAt:'2026-09-17T00:00:00Z',createdAt:'2026-09-16T00:00:00Z',private:true};
const snapshot=()=>buildContext(ticket,{asOf});
const binding:ApprovalBinding={actionId:'a1',ticketId:'1',ticketVersion:1,ticketSnapshotId:'s1',decisionId:'d1',decisionVersion:1,destination:'example/integrations',dataSource:'synthetic',provider:'mock',mode:'dry_run',kind:'create_issue',payload:{title:'Webhook retries stop',body:'Public evidence'}};
const approval=(b=binding):ActionApproval=>({hash:approvalHash(b),reviewerId:'reviewer',reviewerRole:'reviewer',expiresAt:'2099-01-01T00:00:00Z',status:'approved'});
const controls={allowLiveWrites:true,allowLiveDataProcessing:true,authenticated:true,currentTicketVersion:1,currentDecisionVersion:1,repositories:['example/integrations']};
describe('context and retrieval boundaries',()=>{
  it('omits internal notes, later comments, names, organisation, emails and arbitrary label fields',()=>{
    const extra={...ticket,evaluationLabel:'SECRET_GROUND_TRUTH',finalRouting:'billing'};
    const s=buildContext(extra,{asOf});const encoded=JSON.stringify(s);
    for(const secret of ['Alice Smith','Secret Company','alice@example.com','INTERNAL_CANARY','FUTURE_LABEL','SECRET_GROUND_TRUTH','finalRouting'])expect(encoded).not.toContain(secret);
    expect(s.messages.map(m=>m.sourceId)).toEqual(['1-public']);expect(s.internalNotesIncluded).toBe(false);
  });
  it('records internal-note opt-in but never includes internal content in issue drafts',()=>{
    const s=buildContext(ticket,{asOf,includeInternalNotes:true});expect(s.internalNotesIncluded).toBe(true);expect(s.messages.some(m=>m.visibility==='internal')).toBe(true);expect(buildIssueDraft(s).body).not.toContain('INTERNAL_CANARY');
  });
  it('redacts key canaries and does not load remote images or active markup',()=>{
    const raw='sk-proj-canarysecret01234 ghp_canarytoken01234567 password=foo Bearer abc123 email@example.com ![x](https://tracking.example.com/a) <script>bad</script> javascript:evil()';
    const clean=sanitize(raw);for(const forbidden of ['canarysecret','canarytoken','password=foo','abc123','email@example.com','tracking.example.com','<script>','javascript:'])expect(clean).not.toContain(forbidden);
  });
  it('preserves the original report and recent messages and makes truncation explicit',()=>{
    const t={...ticket,comments:Array.from({length:8},(_,i)=>({id:`c${i}`,text:'x'.repeat(120),visibility:'public' as const,createdAt:`2026-09-18T0${i}:00:00Z`}))};
    const s=buildContext(t,{asOf,maxMessages:3,maxChars:260});expect(s.messages[0].sourceId).toBe('c0');expect(s.messages[1].sourceId).toBe('c6');expect(s.contextIncomplete).toBe(true);expect(s.omittedCount).toBeGreaterThan(0);
  });
  it('rejects impossible snapshots and flags attachments',()=>{expect(()=>buildContext(ticket,{asOf:'2026-01-01T00:00:00Z'})).toThrow();expect(buildContext({...ticket,attachments:1},{asOf}).contextIncomplete).toBe(true);});
  it('never retrieves foreign repositories, future issues, or issue text updated after the decision timestamp',()=>{
    const candidates=retrieveCandidates(snapshot(),[issue,{...issue,id:'foreign',repository:'evil/elsewhere'},{...issue,id:'future',createdAt:'2026-09-20T00:00:00Z'},{...issue,id:'future-update',updatedAt:'2026-09-20T00:00:00Z'}],{repositories:[issue.repository]});
    expect(candidates.map(c=>c.issue.id)).toEqual(['i1']);expect(candidates[0].relevance).toBeGreaterThan(1);
  });
  it('never accepts invented candidates, multiple plausible candidates or closed matches',()=>{
    const candidates=[{issue,relevance:10},{issue:{...issue,id:'i2'},relevance:8}];
    expect(()=>selectMatch([{issueId:'invented',probability:1}],candidates)).toThrow('candidate');
    expect(selectMatch([{issueId:'i1',probability:.98},{issueId:'i2',probability:.9}],candidates).proposedIssueId).toBeNull();
    expect(selectMatch([{issueId:'i1',probability:.98}],[{issue:{...issue,state:'closed'},relevance:10}]).proposedIssueId).toBeNull();
  });
  it('fingerprints ignore app receipts but retain a simultaneous customer message',()=>{
    const receipt={id:'receipt',text:'integration finished',visibility:'internal' as const,createdAt:'2026-09-19T08:00:00Z',integrationReceipt:true};
    const s=snapshot();const withReceipt=buildContext({...ticket,version:2,comments:[...ticket.comments,receipt]},{asOf});expect(decisionFingerprint(s)).toBe(decisionFingerprint(withReceipt));
    const withCustomer=buildContext({...ticket,comments:[...ticket.comments,receipt,{...receipt,id:'customer',integrationReceipt:false,visibility:'public',text:'New customer evidence'}]},{asOf});expect(decisionFingerprint(s)).not.toBe(decisionFingerprint(withCustomer));
  });
});
describe('deterministic policy and approval identity',()=>{
  it('canonicalises key order but hashes every decision/action boundary',()=>{
    expect(contentHash({a:1,b:2})).toBe(contentHash({b:2,a:1}));
    for(const b of [{...binding,payload:{title:'Changed',body:'Public evidence'}},{...binding,destination:'evil/repo'},{...binding,ticketVersion:2},{...binding,decisionVersion:2},{...binding,mode:'live' as const},{...binding,provider:'jev' as const}])expect(()=>assertActionAllowed(b,approval(),controls)).toThrow();
  });
  it('requires authorised reviewer and rejects stale snapshots',()=>{
    expect(()=>assertActionAllowed(binding,{...approval(),reviewerRole:'viewer'},controls)).toThrow('reviewer');
    expect(()=>assertActionAllowed(binding,approval(),{...controls,authenticated:false})).toThrow('reviewer');
    expect(()=>assertActionAllowed(binding,approval(),{...controls,currentTicketVersion:2})).toThrow('stale');
    expect(()=>assertActionAllowed(binding,{...approval(),expiresAt:'2000-01-01T00:00:00Z'},controls)).toThrow('current');
  });
  it('synthetic data cannot authorise external writes even with all flags on',()=>{
    const live={...binding,mode:'live' as const,provider:'jev' as const};expect(()=>assertActionAllowed(live,approval(live),controls)).toThrow('real data');
    const real={...live,dataSource:'zendesk' as const};expect(()=>assertActionAllowed(real,approval(real),controls)).not.toThrow();
    expect(()=>assertActionAllowed(real,approval(real),{...controls,allowLiveWrites:false})).toThrow('Live writes');
  });
  it('unknown and incomplete mock inputs abstain without external calls',async()=>{
    const calls=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('network forbidden'));
    try {const s=buildContext({...ticket,subject:'Ambiguous login',comments:[{...ticket.comments[0],text:'Sometimes sign-in fails, maybe platform or identity'}]},{asOf});const d=await new MockDecisionProvider().decide(s,[]);expect(d.destination.value).toBe('unknown');expect(d.reviewReasons.length).toBeGreaterThan(0);expect(d.providerLatencyMs).toBeNull();expect(calls).not.toHaveBeenCalled();}finally{calls.mockRestore();}
  });
  it('three paraphrases independently match the same stored issue',async()=>{
    for(const text of ['Our callback timed out and no retries followed.','Webhook delivery stops following a timeout.','After a timeout there are no callback retry attempts.']){
      const s=buildContext({...ticket,subject:text,comments:[{...ticket.comments[0],text}]},{asOf});const candidates=retrieveCandidates(s,[issue],{repositories:[issue.repository]});const d=await new MockDecisionProvider().decide(s,candidates);expect(d.proposedIssueId).toBe('i1');
    }
  });
});
describe('saved evaluation denominators',()=>{
  async function decision(confidence=.9):Promise<Decision>{const d=await new MockDecisionProvider().decide(snapshot(),[]);return {...d,destination:{...d.destination,value:'integrations',confidence},contextIncomplete:false,multipleIssues:0,needsEngineering:.9};}
  it('includes failures and missing labels in coverage and critical misses; threshold changes do not call a provider',async()=>{
    const d=await decision();const predictions:SavedPrediction[]=[{ticketId:'1',decision:d,candidateIds:['i1'],baseline:'integrations'},{ticketId:'2',decision:null,candidateIds:[],baseline:'unknown',error:'Provider failed',retrievalError:'Retrieval failed'},{ticketId:'3',decision:{...d,destination:{...d.destination,confidence:.7}},candidateIds:[],baseline:'unknown'}];
    const labels=[{ticketId:'1',destination:'integrations' as const,needsEngineering:true,matchingIssueId:'i1'},{ticketId:'2',destination:'platform' as const,needsEngineering:true,critical:true,matchingIssueId:'i2'}];
    const calls=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No provider call allowed'));
    try {const m=evaluateSaved(predictions,labels,.8);expect(m).toMatchObject({total:3,eligible:1,labelledEligible:1,routingPrecision:1,coverage:1/3,reviewRate:2/3,engineeringRecall:.5,missedCritical:1,candidateRecallAt10:.5,decisionFailures:1,retrievalFailures:1,missingLabels:1});expect(evaluateSaved(predictions,labels,.6).eligible).toBe(2);expect(evaluateSaved([],[]).routingPrecision).toBeNull();expect(m.modelLatency).toEqual({count:0,p50:null,p95:null});expect(calls).not.toHaveBeenCalled();}finally{calls.mockRestore();}
  });
  it('keeps incident families together and detects split leakage',()=>{expect(incidentSplit('webhook-incident')).toBe(incidentSplit('webhook-incident'));expect(()=>validateDatasetSplits([{incidentId:'same',split:'development'},{incidentId:'same',split:'held_out'}])).toThrow('crosses');});
  it('review reasons do not treat confidence as correctness',async()=>{const d=await decision();expect(reviewReasons({...d,contextIncomplete:true})).toContain('Decision context is incomplete');});
});

describe('complete synthetic retrieval index',()=>{
  it('shared defect paraphrases select one issue despite similar and closed issues in the index',async()=>{
    const {makeTicketFixture,makeIssueFixture}=await import('../src/server/fixtures');
    const issues=Array.from({length:20},(_,i)=>makeIssueFixture(i+1)).map(i=>({...i,state:i.state as 'open'|'closed',createdAt:i.createdAt.toISOString(),updatedAt:i.updatedAt.toISOString()}));
    for(let n=1;n<=3;n++){
      const t=makeTicketFixture(n);const dTicket:DomainTicket={...t,source:'synthetic',createdAt:t.createdAt.toISOString(),comments:t.comments.map(c=>({...c,authorType:c.authorType as 'customer'|'agent',visibility:c.visibility as 'public'|'internal',createdAt:c.createdAt.toISOString()}))};
      const s=buildContext(dTicket,{asOf:t.sourceUpdatedAt.toISOString()});const c=retrieveCandidates(s,issues,{repositories:['zenjev-demo/integrations','zenjev-demo/platform','zenjev-demo/identity']});const result=await new MockDecisionProvider().decide(s,c);expect(result.proposedIssueId).toBe('issue-001');
    }
  });
  it('multi-problem fixture requires review',async()=>{
    const s=buildContext({...ticket,subject:'Invoice query and broken webhook',comments:[{...ticket.comments[0],text:'We need a billing invoice and separately the webhook retries fail. These are two separate issues.'}]},{asOf});const result=await new MockDecisionProvider().decide(s,[]);expect(result.multipleIssues).toBeGreaterThanOrEqual(.5);expect(result.reviewReasons).toContain('Multiple issues need separate review');
  });
});

describe('versioned configurable decision policy',()=>{
  it('freezes policy on predictions and changes match eligibility without changing authority',async()=>{
    const candidates=[{issue,relevance:12}];
    const strict=await new MockDecisionProvider({thresholds:{routingConfidence:.95,matchProbability:.99}}).decide(snapshot(),candidates);
    const regular=await new MockDecisionProvider().decide(snapshot(),candidates);
    expect(regular.proposedIssueId).toBe('i1');expect(strict.proposedIssueId).toBeNull();expect(strict.policy?.matchProbability).toBe(.99);expect(strict.reviewReasons).toContain('Destination confidence is below the review threshold');expect(regular.policy?.matchProbability).toBe(.9);
    // Both are suggestions only: changing a threshold never creates an approval or changes source mode.
    expect(strict.dataSource).toBe('synthetic');expect(strict.provider).toBe('mock');
  });
  it('saved engineering and multiple-issue policy determine metrics without new model calls',async()=>{
    const d=await new MockDecisionProvider({thresholds:{engineering:.99,multipleIssues:.01}}).decide(snapshot(),[]);
    const calls=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No provider call allowed'));
    try{const m=evaluateSaved([{ticketId:'1',decision:d,candidateIds:[],baseline:'integrations'}],[{ticketId:'1',destination:'integrations',needsEngineering:true,critical:true}],.8);expect(m.engineeringRecall).toBe(0);expect(m.missedCritical).toBe(1);expect(m.eligible).toBe(0);expect(calls).not.toHaveBeenCalled();}finally{calls.mockRestore();}
  });
});
