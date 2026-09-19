import { createHash, timingSafeEqual } from 'node:crypto';

export const TEAMS = ['support', 'billing', 'identity', 'integrations', 'platform', 'unknown'] as const;
export const ISSUE_TYPES = ['how_to', 'billing', 'bug_report', 'feature_request', 'access', 'unknown'] as const;
export type Team = typeof TEAMS[number];
export type PolicyThresholds={routingConfidence:number;engineering:number;missingInfo:number;multipleIssues:number;matchProbability:number;matchMargin:number};
export const DEFAULT_POLICY:PolicyThresholds={routingConfidence:0.8,engineering:0.7,missingInfo:0.5,multipleIssues:0.5,matchProbability:0.9,matchMargin:0.15};
export const DEFAULT_TEAM_CRITERIA:Record<Team,string>={support:'General product usage or setup assistance',billing:'Invoices, charges or subscription administration',identity:'Authentication, permissions or sign-in failures',integrations:'Webhooks, external connectors or integration behaviour',platform:'Core service failures or platform availability',unknown:'Insufficient evidence or multiple teams are plausible'};
export function resolvePolicy(overrides:Partial<PolicyThresholds>={}):PolicyThresholds {
  if(!overrides||Array.isArray(overrides)||Object.keys(overrides).some(k=>!(k in DEFAULT_POLICY)))throw new Error('Unknown policy threshold');
  const policy={...DEFAULT_POLICY,...overrides};
  if(Object.values(policy).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))throw new Error('Policy thresholds must be finite numbers from zero to one');
  return policy;
}
export function resolveTeamCriteria(overrides:Partial<Record<Team,string>>={}):Record<Team,string> {
  if(!overrides||Array.isArray(overrides)||Object.keys(overrides).some(k=>!(TEAMS as readonly string[]).includes(k)))throw new Error('Unknown team criteria');
  const criteria={...DEFAULT_TEAM_CRITERIA,...overrides};
  if(Object.values(criteria).some(v=>typeof v!=='string'||v.trim().length<3||v.length>600))throw new Error('Team criteria require 3–600 characters per team');
  return criteria;
}

export type DomainTicket = { id: string; subject: string; organization: string; source: 'synthetic'|'zendesk'; version: number; createdAt: string; comments: { id: string; text: string; visibility: 'public'|'internal'; createdAt: string; authorName?: string; authorId?: string; authorType?: 'customer'|'agent'|'system'|'unknown'; attachments?: number; integrationReceipt?: boolean }[]; attachments?: number; customerNames?: string[] };
export type Issue = { id: string; repository: string; number: string; title: string; body: string; state: 'open'|'closed'; labels: string[]; updatedAt: string; createdAt?: string; private: boolean };
export type Snapshot = { id: string; hash: string; ticketId: string; ticketVersion: number; dataSource: DomainTicket['source']; asOf: string; subject: string; organizationAlias: string; messages: { sourceId: string; text: string; visibility: 'public'|'internal'; createdAt: string }[]; omittedCount: number; internalNotesIncluded: boolean; attachmentCount: number; contextIncomplete: boolean };
export type Candidate = { issue: Issue; relevance: number };
export type ChoiceResult = { value: string; probabilities: Record<string, number>; confidence: number };
export type Decision = { policy?:PolicyThresholds; provider: 'mock'|'jev'; dataSource: DomainTicket['source']; requestedModel: string; reportedModel: string|null; ticketSnapshotId: string; rubricVersion: string; destination: ChoiceResult; issueType: ChoiceResult; impact: { value: number; legend: Record<string,string>; probabilities: Record<string,number>; confidence: number }; needsEngineering: number; missingReproInfo: number; multipleIssues: number; contextIncomplete: boolean; providerLatencyMs: number|null; inputTokens: number|null; outputTokens: number|null; matches: { issueId: string; probability: number }[]; proposedIssueId: string|null; reviewReasons: string[] };
export interface DecisionProvider { decide(snapshot: Snapshot, candidates: Candidate[]): Promise<Decision> }

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Unsupported canonical value');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
export function contentHash(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function alias(value: string, kind: string): string { return `${kind}-${createHash('sha256').update(value.toLowerCase().trim()).digest('hex').slice(0,8)}`; }
/** Best-effort redaction, not a guarantee. Names supplied by authoritative ingestion are explicitly replaced. */
export function sanitize(text: string, privateValues: string[] = []): string {
  let out = text;
  for (const value of privateValues.filter(v=>v.trim().length>1).sort((a,b)=>b.length-a.length)) out = out.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `[${alias(value,'person')}]`);
  return out
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_|AKIA)[A-Za-z0-9_-]{8,}\b/g, '[REDACTED SECRET]')
    .replace(/\b(?:bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED SECRET]')
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^\s,"';]+["']?/gi, '[REDACTED CREDENTIAL]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, email=>`[${alias(email,'email')}]`)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[remote image omitted]')
    .replace(/<[^>]*>/g, '')
    .replace(/\b(?:javascript|data):\S+/gi, '[unsafe URL omitted]');
}
export function buildContext(ticket: DomainTicket, options: { asOf: string; includeInternalNotes?: boolean; maxChars?: number; maxMessages?: number }): Snapshot {
  const asOf = new Date(options.asOf);
  if (!Number.isFinite(asOf.getTime()) || new Date(ticket.createdAt)>asOf) throw new Error('Snapshot timestamp precedes ticket creation or is invalid');
  const maxChars = Math.max(256, Math.min(options.maxChars ?? 14000, 50000));
  const maxMessages = Math.max(1, Math.min(options.maxMessages ?? 12, 50));
  const available = ticket.comments.filter(c=>new Date(c.createdAt)<=asOf && !c.integrationReceipt && (c.visibility==='public'||options.includeInternalNotes)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const chosen = available.length>maxMessages ? maxMessages===1 ? [available[0]] : [available[0],...available.slice(-(maxMessages-1))] : available;
  const privateValues = [ticket.organization,...(ticket.customerNames??[]),...ticket.comments.map(c=>c.authorName??'')];
  const subject = sanitize(ticket.subject,privateValues).slice(0,500);
  let remaining=maxChars-subject.length, truncated=false;
  const messages=chosen.map(c=>{
    const clean=sanitize(c.text,privateValues), text=clean.slice(0,Math.max(0,remaining));
    truncated ||= text.length<clean.length; remaining-=text.length;
    return {sourceId:c.id,text,visibility:c.visibility,createdAt:c.createdAt};
  }).filter(c=>c.text.length>0);
  const input={ticketId:ticket.id,ticketVersion:ticket.version,dataSource:ticket.source,asOf:asOf.toISOString(),subject,organizationAlias:alias(ticket.organization,'org'),messages,omittedCount:available.length-messages.length,internalNotesIncluded:!!options.includeInternalNotes,attachmentCount:ticket.attachments??0,contextIncomplete:truncated||available.length>messages.length||(ticket.attachments??0)>0||messages.length===0};
  const hash=contentHash(input); return {id:`snapshot-${hash.slice(0,24)}`,hash,...input};
}
const defaultAliases: Record<string,string> = { callback:'webhook', callbacks:'webhook', webhooks:'webhook', retries:'retry', retried:'retry', timed:'timeout', invoices:'invoice', signin:'login', authentication:'login', outage:'unavailable', connectors:'integration' };
export function tokens(text: string, aliases: Record<string,string> = defaultAliases): Set<string> { return new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g)??[]).map(w=>aliases[w]??w).filter(w=>!['the','and','our','with','for','this','that','not','from','are','was','have','after'].includes(w))); }
/** Input types are whitelisted; labels in this module mean GitHub metadata, never evaluation truth. */
export function retrieveCandidates(snapshot: Snapshot, issues: Issue[], options: { repositories: string[]; asOf?: string; aliases?: Record<string,string> }): Candidate[] {
  const query=tokens(`${snapshot.subject} ${snapshot.messages.map(m=>m.text).join(' ')}`,options.aliases);
  const asOf=Date.parse(options.asOf??snapshot.asOf);
  return issues.filter(i=>options.repositories.includes(i.repository) && Date.parse(i.createdAt??i.updatedAt)<=asOf && Date.parse(i.updatedAt)<=asOf)
    .map(issue=>{
      const title=tokens(issue.title,options.aliases),body=tokens(issue.body,options.aliases),labels=tokens(issue.labels.join(' '),options.aliases);
      const relevance=[...query].reduce((sum,w)=>sum+(title.has(w)?3:0)+(body.has(w)?1:0)+(labels.has(w)?2:0),0);
      return {issue,relevance};
    }).filter(c=>c.relevance>0).sort((a,b)=>b.relevance-a.relevance||a.issue.id.localeCompare(b.issue.id)).slice(0,10);
}
export function reviewReasons(d: Decision, threshold=d.policy?.routingConfidence??0.8, policy=resolvePolicy(d.policy)): string[] {
  const reasons:string[]=[];
  if(d.destination.value==='unknown') reasons.push('Destination is unknown');
  if(!Number.isFinite(d.destination.confidence)||d.destination.confidence<threshold) reasons.push('Destination confidence is below the review threshold');
  if(d.contextIncomplete) reasons.push('Decision context is incomplete');
  if(d.multipleIssues>=policy.multipleIssues) reasons.push('Multiple issues need separate review');
  if(d.missingReproInfo>=policy.missingInfo) reasons.push('Essential diagnostic information is missing');
  return reasons;
}
export function selectMatch(matches: Decision['matches'], candidates: Candidate[], threshold=0.9, margin=0.15): {proposedIssueId:string|null;reasons:string[]} {
  const ids=new Set(candidates.map(c=>c.issue.id));
  if(matches.some(m=>!ids.has(m.issueId)||!Number.isFinite(m.probability)||m.probability<0||m.probability>1)||new Set(matches.map(m=>m.issueId)).size!==matches.length) throw new Error('Match is outside the candidate set or invalid');
  const ranked=[...matches].sort((a,b)=>b.probability-a.probability||a.issueId.localeCompare(b.issueId));
  if(!ranked.length||ranked[0].probability<threshold) return {proposedIssueId:null,reasons:['No clear match among retrieved candidates']};
  if(ranked[0].probability-(ranked[1]?.probability??0)<margin) return {proposedIssueId:null,reasons:['Two issue candidates remain plausible']};
  if(candidates.find(c=>c.issue.id===ranked[0].issueId)?.issue.state==='closed') return {proposedIssueId:null,reasons:['Closest issue is closed; review required']};
  return {proposedIssueId:ranked[0].issueId,reasons:[]};
}
export function keywordBaseline(snapshot: Snapshot): Team {
  const text=`${snapshot.subject} ${snapshot.messages.map(m=>m.text).join(' ')}`.toLowerCase();
  if(/invoice|billing|charge|subscription/.test(text)) return 'billing';
  if(/webhook|callback|connector/.test(text)) return 'integrations';
  if(/sign.in|login|password|sso/.test(text)) return 'identity';
  if(/outage|unavailable|latency|database/.test(text)) return 'platform';
  if(/how (do|can)|where|setup/.test(text)) return 'support';
  return 'unknown';
}
export type ApprovalBinding = { actionId:string; payload:unknown; ticketId:string; ticketVersion:number; ticketSnapshotId:string; decisionId:string; decisionVersion:number; destination:string; dataSource:'synthetic'|'zendesk'; provider:'mock'|'jev'; mode:'dry_run'|'live'; kind:'route'|'tags'|'internal_note'|'create_issue' };
export function approvalHash(binding: ApprovalBinding): string { return contentHash(binding); }
export type ActionApproval = { hash:string; reviewerId:string; reviewerRole:'admin'|'reviewer'|'viewer'; expiresAt:string; status:'approved'|'stale'|'rejected' };
export function assertActionAllowed(binding: ApprovalBinding, approval: ActionApproval, controls: {allowLiveWrites:boolean;allowLiveDataProcessing:boolean;authenticated:boolean;currentTicketVersion:number;currentDecisionVersion:number;repositories:string[];groups?:string[];now?:Date}): void {
  if(!controls.authenticated||!approval.reviewerId||!['admin','reviewer'].includes(approval.reviewerRole)) throw new Error('An authenticated authorised reviewer is required');
  if(approval.status!=='approved'||!Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=(controls.now??new Date()).getTime()) throw new Error('Approval is not current');
  const actual=Buffer.from(approvalHash(binding)),expected=Buffer.from(approval.hash);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw new Error('Approval payload or context changed');
  if(binding.ticketVersion!==controls.currentTicketVersion||binding.decisionVersion!==controls.currentDecisionVersion) throw new Error('Approval is stale');
  if(!['route','tags','internal_note','create_issue'].includes(binding.kind)) throw new Error('Unsupported action');
  if(binding.kind==='create_issue'&&!controls.repositories.includes(binding.destination)) throw new Error('Repository is not allowlisted');
  if(binding.kind==='route'&&controls.groups&&!controls.groups.includes(binding.destination)) throw new Error('Destination group is not allowlisted');
  if(binding.mode==='live'&&(!controls.allowLiveWrites||!controls.allowLiveDataProcessing||binding.dataSource!=='zendesk'||binding.provider!=='jev')) throw new Error('Live writes require real data, live Jev, and explicit processing/write controls');
}
export type SavedPrediction = { ticketId:string; decision:Decision|null; candidateIds:string[]; baseline:Team; error?:string|null; retrievalError?:string|null; latencyMs?:number|null; split?:'development'|'held_out'; incidentId?:string };
export type EvaluationLabel = {ticketId:string; destination:Team|null; needsEngineering:boolean|null; critical?:boolean; matchingIssueId?:string|null; split?:'development'|'held_out'; incidentId?:string};
function ratio(n:number,d:number):number|null {return d?n/d:null;}
function percentile(values:number[],p:number):number|null {if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];}
/** Pure recomputation over frozen predictions. Deliberately has no provider parameter or import. */
export function evaluateSaved(predictions: SavedPrediction[], labels: EvaluationLabel[], threshold=0.8) {
  if(!Number.isFinite(threshold)||threshold<0||threshold>1) throw new Error('Threshold must be between zero and one');
  const byId=new Map(labels.map(l=>[l.ticketId,l]));
  const eligible=predictions.filter(p=>p.decision&&!p.error&&p.decision.destination.value!=='unknown'&&p.decision.destination.confidence>=threshold&&!p.decision.contextIncomplete&&p.decision.multipleIssues<(p.decision.policy?.multipleIssues??DEFAULT_POLICY.multipleIssues));
  const labelledEligible=eligible.filter(p=>byId.get(p.ticketId)?.destination!=null);
  const correct=labelledEligible.filter(p=>p.decision!.destination.value===byId.get(p.ticketId)!.destination).length;
  const positives=predictions.filter(p=>byId.get(p.ticketId)?.needsEngineering===true);
  const engineeringHits=positives.filter(p=>p.decision&&!p.error&&p.decision.needsEngineering>=(p.decision.policy?.engineering??DEFAULT_POLICY.engineering));
  const matchLabels=predictions.filter(p=>byId.get(p.ticketId)?.matchingIssueId);
  const links=predictions.filter(p=>p.decision?.proposedIssueId&&!p.error&&byId.has(p.ticketId));
  const modelLatencies=predictions.flatMap(p=>p.decision?.provider==='jev'&&p.decision.providerLatencyMs!=null?[p.decision.providerLatencyMs]:[]);
  const latencies=predictions.flatMap(p=>p.latencyMs!=null?[p.latencyMs]:[]);
  const labelled=predictions.filter(p=>byId.get(p.ticketId)?.destination!=null);
  return {total:predictions.length,threshold,eligible:eligible.length,labelledEligible:labelledEligible.length,routingCorrect:correct,routingPrecision:ratio(correct,labelledEligible.length),coverage:ratio(eligible.length,predictions.length),reviewRate:ratio(predictions.length-eligible.length,predictions.length),missingLabels:predictions.filter(p=>!byId.has(p.ticketId)||byId.get(p.ticketId)?.destination==null).length,decisionFailures:predictions.filter(p=>p.error||!p.decision).length,retrievalFailures:predictions.filter(p=>p.retrievalError).length,engineeringRecall:ratio(engineeringHits.length,positives.length),engineeringDenominator:positives.length,missedCritical:positives.filter(p=>byId.get(p.ticketId)?.critical&&(!p.decision||p.error||p.decision.needsEngineering<(p.decision.policy?.engineering??DEFAULT_POLICY.engineering))).length,candidateRecallAt10:ratio(matchLabels.filter(p=>!p.retrievalError&&p.candidateIds.slice(0,10).includes(byId.get(p.ticketId)!.matchingIssueId!)).length,matchLabels.length),candidateRecallDenominator:matchLabels.length,issueLinkPrecision:ratio(links.filter(p=>p.decision!.proposedIssueId===byId.get(p.ticketId)?.matchingIssueId).length,links.length),issueLinkDenominator:links.length,baselineAccuracy:ratio(labelled.filter(p=>p.baseline===byId.get(p.ticketId)?.destination).length,labelled.length),latency:{count:latencies.length,p50:percentile(latencies,0.5),p95:percentile(latencies,0.95)},modelLatency:{count:modelLatencies.length,p50:percentile(modelLatencies,0.5),p95:percentile(modelLatencies,0.95)},provenance:[...new Set(predictions.flatMap(p=>p.decision?[`${p.decision.dataSource}/${p.decision.provider}`]:[]))]};
}
export function incidentSplit(incidentId:string): 'development'|'held_out' { return parseInt(createHash('sha256').update(incidentId).digest('hex').slice(0,8),16)%5===0?'held_out':'development'; }
export function estimateModelCost(decision:Decision,usdPerMillion=0.042):number|null {return decision.provider==='jev'&&decision.inputTokens!=null?decision.inputTokens*usdPerMillion/1_000_000:null;}

export function decisionFingerprint(snapshot:Snapshot):string {return contentHash({subject:snapshot.subject,messages:snapshot.messages.map(m=>({sourceId:m.sourceId,text:m.text,visibility:m.visibility})),internalNotesIncluded:snapshot.internalNotesIncluded,contextIncomplete:snapshot.contextIncomplete});}
export function buildIssueDraft(snapshot:Snapshot,affectedOrganizations=1):{title:string;body:string} {
  const publicEvidence=snapshot.messages.filter(m=>m.visibility==='public').map(m=>sanitize(m.text)).join('\n\n');
  return {title:sanitize(snapshot.subject),body:`## Problem\n${publicEvidence||'Not supplied'}\n\n## Expected behaviour\nNot supplied\n\n## Actual behaviour\nSee the permitted public evidence above.\n\n## Environment\nNot supplied\n\n## Reproduction\nNot supplied\n\n## Affected organisations\n${affectedOrganizations}\n\n## Missing information\nConfirm environment, exact reproduction steps and expected behaviour.\n\nPrepared from a sanitised support snapshot; human review required.`};
}
export function validateDatasetSplits(rows:{incidentId:string;split:'development'|'held_out'}[]):void {
  const incidents=new Map<string,string>();for(const row of rows){const old=incidents.get(row.incidentId);if(old&&old!==row.split)throw new Error('Related incident crosses evaluation splits');incidents.set(row.incidentId,row.split);}
}
