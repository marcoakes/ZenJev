import { db } from './db';
import { DEMO_REPOSITORIES,TEAM_MAPPINGS } from './fixtures';
import { ISSUE_PROVIDERS,DEFAULT_ISSUE_HOSTS,type IssueProviderName } from '../domain';
import { resolveGitLabServer } from '../providers';
export type CredentialState='unconfigured'|'configured'|'retrieval_failed'|'connection_failed'|'connection_verified';
export const CREDENTIAL_STATE_LABELS:Record<CredentialState,string>={
 unconfigured:'Not configured',
 configured:'Configured; live connection unverified',
 retrieval_failed:'Configured, but the credential could not be retrieved',
 connection_failed:'Configured; the last connection check failed',
 connection_verified:'Connection verified',
};
export function issueProviderOf(value:unknown):IssueProviderName {return (ISSUE_PROVIDERS as readonly string[]).includes(String(value))?String(value) as IssueProviderName:'github';}
/** The issue host is server configuration. A client can select a provider but never supply its host. */
export function issueHostFor(provider:IssueProviderName):string {
 if(provider!=='gitlab')return process.env.GITHUB_HOST||DEFAULT_ISSUE_HOSTS.github;
 return resolveGitLabServer(process.env.GITLAB_SERVER_URL||'https://gitlab.com',process.env.GITLAB_ALLOW_PRIVATE_NETWORK==='true').host;
}
export function issueTargetSettings(provider:IssueProviderName):{provider:IssueProviderName;host:string;error:string|null} {
 try {return {provider,host:issueHostFor(provider),error:null};}
 catch(error){return {provider,host:'',error:error instanceof Error?error.message:'Issue host configuration is invalid'};}
}
/**
 * A present reference does not prove the value can be read, and a readable value does not prove
 * the remote accepts it. The four states stay separate and only an explicit check verifies one.
 */
export function credentialState(token:string|undefined,reference:string|undefined,check:{lastSuccessAt:Date|null;error:string|null}|null|undefined):CredentialState {
 if(!token) return reference?'retrieval_failed':'unconfigured';
 if(check?.error) return check.error.startsWith('retrieval:')?'retrieval_failed':'connection_failed';
 return check?.lastSuccessAt?'connection_verified':'configured';
}
export const connectionCursorId=(provider:IssueProviderName,host:string)=>`connection:${provider}:${host}`;
export async function getSettings() {
 const configured={dataMode:process.env.DATA_MODE??'demo',jevMode:process.env.JEV_MODE??'mock'};
 const current=await db.workspaceSettings.upsert({where:{id:'workspace'},update:{},create:{id:'workspace',...configured,repositories:DEMO_REPOSITORIES,teamMappings:TEAM_MAPPINGS}});
 if(current.dataMode===configured.dataMode&&current.jevMode===configured.jevMode)return current;
 return db.$transaction(async tx=>{
  await tx.proposedAction.updateMany({where:{state:{in:['approved','queued']}},data:{state:'stale',error:'Configured data or provider mode changed'}});
  return tx.workspaceSettings.update({where:{id:'workspace'},data:configured});
 });
}
export async function publicSettings(csrfToken?:string) {
 const s=await getSettings();
 const provider=issueProviderOf(s.issueProvider),target=issueTargetSettings(provider);
 const check=target.host?await db.syncCursor.findUnique({where:{id:connectionCursorId(provider,target.host)}}).catch(()=>null):null;
 const issueState=target.error?'unconfigured':credentialState(provider==='gitlab'?process.env.GITLAB_TOKEN:process.env.GITHUB_TOKEN,provider==='gitlab'?process.env.GITLAB_CREDENTIAL_REFERENCE:process.env.GITHUB_CREDENTIAL_REFERENCE,check);
 return {...s,csrfToken,issueProvider:provider,issueHost:target.host,issueHostError:target.error,issueCredentialState:issueState,
  connections:{
   jev:s.jevMode==='mock'?'Mock — no credentials needed':process.env.TYPESAFE_API_KEY?'Configured; live connection unverified':'Missing TYPESAFE_API_KEY',
   github:process.env.GITHUB_TOKEN?'Configured; live connection unverified':'Not configured — synthetic issue index',
   gitlab:provider==='gitlab'?(target.error?`Not configured — ${target.error}`:CREDENTIAL_STATE_LABELS[issueState]):process.env.GITLAB_TOKEN?'Configured; not the selected issue provider':'Not configured — GitHub is the selected issue provider',
   zendesk:process.env.ZENDESK_OAUTH_CLIENT_ID&&process.env.ZENDESK_OAUTH_CLIENT_SECRET?'Configured; live connection unverified':'Not configured — synthetic tickets'},
  liveActivation:'Environment configuration, authenticated reviewer and explicit per-action approval required'};
}
