import { db } from './db';
import { DEMO_REPOSITORIES,TEAM_MAPPINGS } from './fixtures';
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
 return {...s,csrfToken,connections:{jev:s.jevMode==='mock'?'Mock — no credentials needed':process.env.TYPESAFE_API_KEY?'Configured; live connection unverified':'Missing TYPESAFE_API_KEY',github:process.env.GITHUB_TOKEN?'Configured; live connection unverified':'Not configured — synthetic issue index',zendesk:process.env.ZENDESK_OAUTH_CLIENT_ID&&process.env.ZENDESK_OAUTH_CLIENT_SECRET?'Configured; live connection unverified':'Not configured — synthetic tickets'},liveActivation:'Environment configuration, authenticated reviewer and explicit per-action approval required'};
}
