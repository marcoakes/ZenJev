import {z} from 'zod';
import {type Issue,type ApprovalBinding,type ActionApproval,type IssueTarget,assertActionAllowed,sanitize,issueKey} from '../domain';
import {type HttpOptions,ProviderError,requestJson} from './http';
const id=z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().refine(Number.isSafeInteger)]).transform(String);
const repositorySchema=z.object({full_name:z.string(),private:z.boolean()});
const issueSchema=z.object({id,number:id,title:z.string(),body:z.string().nullable().optional(),state:z.enum(['open','closed']),labels:z.array(z.union([z.string(),z.object({name:z.string()})])),created_at:z.string(),updated_at:z.string(),pull_request:z.unknown().optional()});
export type WriteControls=Parameters<typeof assertActionAllowed>[2];
export class GitHubProvider {
  readonly host:string;
  constructor(private readonly options:HttpOptions&{token:string;repositories:string[];apiVersion?:string;host?:string}){this.host=options.host||'github.com';}
  target(repository:string):IssueTarget{return {provider:'github',host:this.host,project:repository};}
  private headers(){if(!this.options.token)throw new ProviderError('configuration','GitHub token is unavailable');return {Authorization:`Bearer ${this.options.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':this.options.apiVersion??'2026-03-10','Content-Type':'application/json'};}
  private path(repository:string){if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!this.options.repositories.includes(repository))throw new ProviderError('policy','Repository is not allowlisted');return `https://api.github.com/repos/${repository}`;}
  async repository(repository:string):Promise<{full_name:string;private:boolean}>{
    const {body}=await requestJson(this.path(repository),{headers:this.headers()},this.options);
    const parsed=repositorySchema.safeParse(body);if(!parsed.success||parsed.data.full_name.toLowerCase()!==repository.toLowerCase())throw new ProviderError('schema','GitHub repository response is invalid');return parsed.data;
  }
  async listIssues(repository:string,maxPages=20):Promise<Issue[]>{
    const base=this.path(repository),metadata=await this.repository(repository),target=this.target(repository),issues:Issue[]=[];
    for(let page=1;page<=Math.min(maxPages,100);page++){
      const {body,response}=await requestJson(`${base}/issues?state=all&per_page=100&page=${page}`,{headers:this.headers()},this.options);
      const parsed=z.array(issueSchema).safeParse(body);if(!parsed.success)throw new ProviderError('schema','GitHub issue response is invalid');
      for(const issue of parsed.data.filter(i=>!i.pull_request))issues.push({id:issueKey(target,issue.number),repository,number:issue.number,title:issue.title,body:issue.body??'',state:issue.state,labels:issue.labels.map(l=>typeof l==='string'?l:l.name),updatedAt:issue.updated_at,createdAt:issue.created_at,private:metadata.private,provider:'github',host:this.host,url:`https://${this.host}/${repository}/issues/${issue.number}`});
      const hasNext=/rel="next"/.test(response.headers.get('link')??'');
      if(!hasNext)return issues;
    }
    throw new ProviderError('transient','GitHub pagination limit reached; sync incomplete');
  }
  async createIssue(binding:ApprovalBinding,approval:ActionApproval,controls:WriteControls):Promise<{id:string;number:string;url:string;marker:string}>{
    assertActionAllowed(binding,approval,controls);
    if(binding.mode!=='live'||binding.kind!=='create_issue')throw new ProviderError('policy','Write adapter only accepts approved live issue creation');
    // A GitLab approval can never reach this adapter, whatever the caller passed as controls.
    if(binding.target?.provider!=='github'||binding.target.host!==this.host)throw new ProviderError('policy','Approval does not authorise this GitHub host');
    const base=this.path(binding.destination);
    const payload=z.object({title:z.string().min(1).max(240),body:z.string().min(1).max(20000),repository:z.string()}).strict().safeParse(binding.payload);
    if(!payload.success||payload.data.repository!==binding.destination)throw new ProviderError('schema','Issue draft is invalid');
    if(sanitize(payload.data.title)!==payload.data.title||sanitize(payload.data.body)!==payload.data.body)throw new ProviderError('policy','Issue draft still contains detected sensitive or unsafe content');
    const current=await this.repository(binding.destination);if(!current.private)throw new ProviderError('policy','Public-repository writes are prohibited');
    const marker=`zenjev-action:${binding.actionId}`;
    const {body}=await requestJson(`${base}/issues`,{method:'POST',headers:this.headers(),body:JSON.stringify({title:payload.data.title,body:`${payload.data.body}\n\n<!-- ${marker} -->`})},this.options,true);
    const parsed=z.object({id,number:id,html_url:z.string().url()}).safeParse(body);if(!parsed.success)throw new ProviderError('uncertain','Issue creation response invalid; reconcile marker before retry');
    return {id:parsed.data.id,number:parsed.data.number,url:parsed.data.html_url,marker};
  }
  /** Read-only reconciliation after an uncertain result. Never creates a replacement automatically. */
  async reconcileIssue(repository:string,actionId:string):Promise<Issue|null>{
    const marker=`zenjev-action:${actionId}`,matches=(await this.listIssues(repository)).filter(i=>i.body.includes(`<!-- ${marker} -->`));
    if(matches.length>1)throw new ProviderError('conflict','Multiple matching action markers require operator reconciliation');return matches[0]??null;
  }
}
