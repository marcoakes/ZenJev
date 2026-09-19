import {z} from 'zod';
import {type Issue,type ApprovalBinding,type ActionApproval,type IssueTarget,assertActionAllowed,sanitize,issueKey,isProjectPath} from '../domain';
import {type HttpOptions,ProviderError,requestJson} from './http';
const id=z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().refine(Number.isSafeInteger)]).transform(String);
const projectSchema=z.object({id,path_with_namespace:z.string(),visibility:z.enum(['private','internal','public']),web_url:z.string().url()});
const issueSchema=z.object({id,iid:id,title:z.string(),description:z.string().nullable().optional(),state:z.string(),labels:z.array(z.string()),created_at:z.string(),updated_at:z.string(),web_url:z.string().url(),type:z.string().optional()});
export type GitLabProject={id:string;path:string;visibility:'private'|'internal'|'public';url:string};
type WriteControls=Parameters<typeof assertActionAllowed>[2];
/** Loopback, link-local and RFC1918 destinations stay refused unless an operator declares a private endpoint. */
function isPrivateHost(hostname:string):boolean {
  const host=hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return true;
  if(host==='::1'||host==='::'||/^f[cd][0-9a-f]{2}:/.test(host)||/^fe[89ab][0-9a-f]:/.test(host))return true;
  const parts=host.split('.');
  if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)))return false;
  const [a,b]=parts.map(Number);
  if(parts.map(Number).some(n=>n>255))return false;
  return a===127||a===10||a===0||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===169&&b===254);
}
/**
 * Accepts a bare HTTPS origin only. GitLab installed under a relative URL root is not supported,
 * because two roots on one hostname would share a stored issue identity.
 */
export function resolveGitLabServer(serverUrl:string,allowPrivateNetwork=false):{origin:string;host:string} {
  let url:URL;
  try{url=new URL(serverUrl);}catch{throw new ProviderError('configuration','GitLab server URL is not a valid absolute URL');}
  if(url.protocol!=='https:')throw new ProviderError('configuration','GitLab server URL must use HTTPS');
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new ProviderError('configuration','GitLab server URL must be a bare origin without credentials, path or query');
  if(!allowPrivateNetwork&&isPrivateHost(url.hostname))throw new ProviderError('configuration','Private, loopback or link-local GitLab hosts require an explicit private-network declaration');
  return {origin:url.origin,host:url.host};
}
export class GitLabProvider {
  readonly host:string;
  private readonly origin:string;
  constructor(private readonly options:HttpOptions&{token:string;projects:string[];serverUrl?:string;allowPrivateNetwork?:boolean}) {
    const resolved=resolveGitLabServer(options.serverUrl||'https://gitlab.com',options.allowPrivateNetwork===true);
    this.origin=resolved.origin;this.host=resolved.host;
  }
  private headers(){if(!this.options.token)throw new ProviderError('configuration','GitLab token is unavailable');return {Authorization:`Bearer ${this.options.token}`,Accept:'application/json','Content-Type':'application/json'};}
  private path(project:string){if(!isProjectPath(project,'gitlab')||!this.options.projects.includes(project))throw new ProviderError('policy','Project is not allowlisted');return `${this.origin}/api/v4/projects/${encodeURIComponent(project)}`;}
  target(project:string):IssueTarget{return {provider:'gitlab',host:this.host,project};}
  /** GitLab answers 404 for a project the credential cannot see, so absence and denial are reported together. */
  async project(project:string):Promise<GitLabProject> {
    let body:unknown;
    try{({body}=await requestJson(this.path(project),{headers:this.headers()},this.options));}
    catch(error){if(error instanceof ProviderError&&error.status===404)throw new ProviderError('authentication','GitLab project was not found or the token cannot access it',404);throw error;}
    const parsed=projectSchema.safeParse(body);
    if(!parsed.success||parsed.data.path_with_namespace.toLowerCase()!==project.toLowerCase())throw new ProviderError('schema','GitLab project response is invalid');
    return {id:parsed.data.id,path:parsed.data.path_with_namespace,visibility:parsed.data.visibility,url:parsed.data.web_url};
  }
  async listIssues(project:string,maxPages=20):Promise<Issue[]> {
    const base=this.path(project),metadata=await this.project(project),target=this.target(project),issues:Issue[]=[];
    for(let page=1;page<=Math.min(maxPages,100);page++) {
      const {body,response}=await requestJson(`${base}/issues?state=all&scope=all&order_by=updated_at&per_page=100&page=${page}`,{headers:this.headers()},this.options);
      const parsed=z.array(issueSchema).safeParse(body);
      if(!parsed.success)throw new ProviderError('schema','GitLab issue response is invalid');
      for(const issue of parsed.data) {
        // Tasks are child work items surfaced by the issues endpoint; they are excluded like GitHub pull requests.
        if(issue.type&&issue.type.toUpperCase()==='TASK')continue;
        if(issue.state!=='opened'&&issue.state!=='closed')throw new ProviderError('schema','GitLab issue state is unrecognised');
        issues.push({id:issueKey(target,issue.iid),repository:project,number:issue.iid,title:issue.title,body:issue.description??'',state:issue.state==='opened'?'open':'closed',labels:issue.labels,updatedAt:issue.updated_at,createdAt:issue.created_at,private:metadata.visibility==='private',provider:'gitlab',host:this.host,url:issue.web_url});
      }
      const next=response.headers.get('x-next-page')??'';
      if(!next.trim())return issues;
    }
    throw new ProviderError('transient','GitLab pagination limit reached; sync incomplete');
  }
  async createIssue(binding:ApprovalBinding,approval:ActionApproval,controls:WriteControls):Promise<{id:string;number:string;url:string;marker:string}> {
    assertActionAllowed(binding,approval,controls);
    if(binding.mode!=='live'||binding.kind!=='create_issue')throw new ProviderError('policy','Write adapter only accepts approved live issue creation');
    // A foreign approval can never reach this adapter, whatever the caller passed as controls.
    if(binding.target?.provider!=='gitlab'||binding.target.host!==this.host)throw new ProviderError('policy','Approval does not authorise this GitLab host');
    const base=this.path(binding.destination);
    const payload=z.object({title:z.string().min(1).max(240),body:z.string().min(1).max(20000),repository:z.string()}).strict().safeParse(binding.payload);
    if(!payload.success||payload.data.repository!==binding.destination)throw new ProviderError('schema','Issue draft is invalid');
    if(sanitize(payload.data.title)!==payload.data.title||sanitize(payload.data.body)!==payload.data.body)throw new ProviderError('policy','Issue draft still contains detected sensitive or unsafe content');
    const current=await this.project(binding.destination);
    if(current.visibility!=='private')throw new ProviderError('policy',`Writes to a ${current.visibility} GitLab project are prohibited`);
    const marker=`zenjev-action:${binding.actionId}`;
    const {body}=await requestJson(`${base}/issues`,{method:'POST',headers:this.headers(),body:JSON.stringify({title:payload.data.title,description:`${payload.data.body}\n\n<!-- ${marker} -->`})},this.options,true);
    const parsed=z.object({id,iid:id,web_url:z.string().url()}).safeParse(body);
    if(!parsed.success)throw new ProviderError('uncertain','Issue creation response invalid; reconcile marker before retry');
    // `id` is the provider's own identifier, matching the GitHub adapter's receipt shape.
    return {id:parsed.data.id,number:parsed.data.iid,url:parsed.data.web_url,marker};
  }
  /**
   * Read-only reconciliation after an uncertain result. Never creates a replacement automatically.
   * GitLab's search index lags writes, so the marker is matched over a listed page instead.
   */
  async reconcileIssue(project:string,actionId:string):Promise<Issue|null> {
    const marker=`zenjev-action:${actionId}`,matches=(await this.listIssues(project)).filter(i=>i.body.includes(`<!-- ${marker} -->`));
    if(matches.length>1)throw new ProviderError('conflict','Multiple matching action markers require operator reconciliation');
    return matches[0]??null;
  }
}
