import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {type DomainTicket,type ApprovalBinding,type ActionApproval,assertActionAllowed,sanitize} from '../domain';
import {type HttpOptions,ProviderError,requestJson} from './http';
import {type WriteControls} from './github';
const id=z.union([z.string().regex(/^\d+$/),z.number().int().nonnegative().refine(Number.isSafeInteger)]).transform(String);
const ticketSchema=z.object({id,subject:z.string().nullable(),description:z.string().optional(),organization_id:id.nullable().optional(),created_at:z.string(),updated_at:z.string(),status:z.string().optional(),tags:z.array(z.string()).optional(),group_id:id.nullable().optional()});
const commentSchema=z.object({id,body:z.string(),public:z.boolean(),created_at:z.string(),author_id:id.optional(),attachments:z.array(z.unknown()).optional()});
export type ZendeskTicket=z.infer<typeof ticketSchema>;
export class ZendeskProvider {
  private access:{token:string;expiresAt:number}|null=null;
  private tokenPending:Promise<string>|null=null;
  private lastExportAt=0;
  private readonly origin:string;
  constructor(private readonly options:HttpOptions&{subdomain:string;clientId:string;clientSecret:string;scopes:string;allowedGroupIds?:string[];now?:()=>number}){
    if(!/^[a-z0-9][a-z0-9-]*$/.test(options.subdomain))throw new ProviderError('configuration','Invalid Zendesk subdomain');
    if(!options.scopes.trim())throw new ProviderError('configuration','Explicit Zendesk OAuth scopes are required');
    this.origin=`https://${options.subdomain}.zendesk.com`;
  }
  private now(){return (this.options.now??Date.now)();}
  private async token():Promise<string>{
    if(this.access&&this.access.expiresAt>this.now()+60000)return this.access.token;
    if(this.tokenPending)return this.tokenPending;
    this.tokenPending=(async()=>{
      if(!this.options.clientId||!this.options.clientSecret)throw new ProviderError('configuration','Zendesk OAuth credentials are unavailable');
      const {body}=await requestJson(`${this.origin}/oauth/tokens`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:this.options.clientId,client_secret:this.options.clientSecret,scope:this.options.scopes,expires_in:'1800'})},this.options);
      const parsed=z.object({access_token:z.string().min(1),token_type:z.string(),expires_in:z.number().positive()}).safeParse(body);
      if(!parsed.success||parsed.data.token_type.toLowerCase()!=='bearer')throw new ProviderError('schema','Invalid Zendesk OAuth response');
      this.access={token:parsed.data.access_token,expiresAt:this.now()+parsed.data.expires_in*1000};return this.access.token;
    })();
    try{return await this.tokenPending;}finally{this.tokenPending=null;}
  }
  private async call(path:string,init:RequestInit={},mutation=false){
    if(!path.startsWith('/api/v2/'))throw new ProviderError('policy','Unsupported Zendesk API path');
    return requestJson(`${this.origin}${path}`,{...init,headers:{Authorization:`Bearer ${await this.token()}`,'Content-Type':'application/json',...init.headers}},path.startsWith('/api/v2/incremental/')?{...this.options,maxRetries:0,minimumRetryDelayMs:6100}:this.options,mutation);
  }
  async ticket(ticketId:string):Promise<ZendeskTicket>{
    if(!/^\d+$/.test(ticketId))throw new ProviderError('policy','Invalid ticket identifier');
    const {body}=await this.call(`/api/v2/tickets/${ticketId}.json`);const result=z.object({ticket:ticketSchema}).safeParse(body);
    if(!result.success||result.data.ticket.id!==ticketId)throw new ProviderError('schema','Invalid Zendesk ticket response');return result.data.ticket;
  }
  async exportPage(options:{cursor?:string;startTime?:number}):Promise<{tickets:ZendeskTicket[];cursor:string;endOfStream:boolean}>{
    if(!options.cursor&&(!Number.isFinite(options.startTime)||options.startTime! >= (this.now()/1000)-60))throw new ProviderError('configuration','Initial export must start more than one minute in the past');
    const wait=Math.max(0,this.lastExportAt+6000-this.now());if(wait)await (this.options.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))(wait);
    this.lastExportAt=this.now();
    const query=new URLSearchParams(options.cursor?{cursor:options.cursor}:{start_time:String(options.startTime)});query.set('per_page','100');
    const {body}=await this.call(`/api/v2/incremental/tickets/cursor.json?${query}`);
    const result=z.object({tickets:z.array(ticketSchema),after_cursor:z.string(),end_of_stream:z.boolean()}).safeParse(body);
    if(!result.success)throw new ProviderError('schema','Invalid Zendesk export page');
    return {tickets:result.data.tickets,cursor:result.data.after_cursor,endOfStream:result.data.end_of_stream};
  }
  async comments(ticketId:string,maxPages=100):Promise<DomainTicket['comments']>{
    if(!/^\d+$/.test(ticketId))throw new ProviderError('policy','Invalid ticket identifier');
    const comments:DomainTicket['comments']=[];let cursor:string|undefined;
    for(let page=0;page<Math.min(maxPages,100);page++){
      const query=new URLSearchParams({'page[size]':'100',sort:'created_at',include:'users'});if(cursor)query.set('page[after]',cursor);
      const {body}=await this.call(`/api/v2/tickets/${ticketId}/comments.json?${query}`);
      const result=z.object({comments:z.array(commentSchema),users:z.array(z.object({id,name:z.string().optional(),role:z.enum(['end-user','agent','admin']).optional()})).optional(),meta:z.object({has_more:z.boolean(),after_cursor:z.string().nullable()}).optional(),next_page:z.string().nullable().optional()}).safeParse(body);
      if(!result.success)throw new ProviderError('schema','Invalid Zendesk comments page');
      comments.push(...result.data.comments.map(c=>({id:c.id,text:sanitize(c.body,(result.data.users??[]).map(u=>u.name??'')),visibility:c.public?'public' as const:'internal' as const,createdAt:c.created_at,authorId:c.author_id,authorName:result.data.users?.find(u=>u.id===c.author_id)?.name,authorType:(result.data.users?.find(u=>u.id===c.author_id)?.role==='end-user'?'customer':result.data.users?.find(u=>u.id===c.author_id)?.role?'agent':'unknown') as 'customer'|'agent'|'unknown',attachments:c.attachments?.length??0})));
      if(!result.data.meta?.has_more){if(result.data.next_page)throw new ProviderError('schema','Zendesk did not return requested cursor pagination');return [...new Map(comments.map(c=>[c.id,c])).values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}
      const next=result.data.meta.after_cursor;if(!next||next===cursor)throw new ProviderError('schema','Zendesk comment cursor did not advance');cursor=next;
    }
    throw new ProviderError('transient','Comment pagination limit reached; context incomplete');
  }
  async updateTicket(binding:ApprovalBinding,approval:ActionApproval,controls:WriteControls,expectedUpdatedAt?:string):Promise<{ticketId:string;updatedAt:string;marker:string|null}>{
    assertActionAllowed(binding,approval,controls);
    if(binding.mode!=='live'||binding.kind==='create_issue')throw new ProviderError('policy','Write adapter only accepts approved live Zendesk actions');
    const common=z.object({ticketSourceId:id,updatedAtSource:z.string()}).safeParse(binding.payload);
    if(!common.success)throw new ProviderError('schema','Bound source ticket identity is required');
    if(expectedUpdatedAt&&expectedUpdatedAt!==common.data.updatedAtSource)throw new ProviderError('policy','Execution timestamp differs from the approved payload');
    expectedUpdatedAt??=common.data.updatedAtSource;
    const current=await this.ticket(common.data.ticketSourceId);
    if(current.updated_at!==expectedUpdatedAt)throw new ProviderError('conflict','Ticket changed since approval; return to review');
    const update:Record<string,unknown>={safe_update:true,updated_stamp:expectedUpdatedAt};let marker:string|null=null;
    if(binding.kind==='route'){
      const payload=z.object({groupId:id,destination:z.string(),tags:z.array(z.string().regex(/^zenjev_[a-z0-9_]+$/)).max(10),reason:z.string(),ticketSourceId:id,updatedAtSource:z.string()}).strict().safeParse(binding.payload);if(!payload.success||payload.data.destination!==binding.destination||!this.options.allowedGroupIds?.includes(payload.data.groupId))throw new ProviderError('policy','Group is not allowlisted');update.group_id=payload.data.groupId;update.tags=[...new Set([...(current.tags??[]),...payload.data.tags])];
    }else if(binding.kind==='tags'){
      const payload=z.object({tags:z.array(z.string().regex(/^zenjev_[a-z0-9_]+$/)).max(10),ticketSourceId:id,updatedAtSource:z.string()}).strict().safeParse(binding.payload);if(!payload.success)throw new ProviderError('policy','Only app-specific tag additions are permitted');update.tags=[...new Set([...(current.tags??[]),...payload.data.tags])];
    }else if(binding.kind==='internal_note'){
      const payload=z.object({body:z.string().min(1).max(10000),ticketSourceId:id,updatedAtSource:z.string()}).strict().safeParse(binding.payload);if(!payload.success||sanitize(payload.data.body)!==payload.data.body)throw new ProviderError('policy','Internal note is invalid or contains detected sensitive content');marker=`zenjev-action:${binding.actionId}`;update.comment={body:`${payload.data.body}\n\n[${marker}]`,public:false};
    }else throw new ProviderError('policy','Unsupported Zendesk action');
    const {body}=await this.call(`/api/v2/tickets/${current.id}.json`,{method:'PUT',body:JSON.stringify({ticket:update})},true);
    const parsed=z.object({ticket:ticketSchema}).safeParse(body);if(!parsed.success)throw new ProviderError('uncertain','Ticket write response invalid; reconcile before retry');
    return {ticketId:parsed.data.ticket.id,updatedAt:parsed.data.ticket.updated_at,marker};
  }
  async reconcileNote(ticketId:string,actionId:string):Promise<string|null>{const notes=(await this.comments(ticketId)).filter(c=>c.visibility==='internal'&&c.text.includes(`[zenjev-action:${actionId}]`));if(notes.length>1)throw new ProviderError('conflict','Multiple notes match the action marker');return notes[0]?.id??null;}
}
/** Pure verifier. Caller must transactionally persist receiptId and enqueue before acknowledging. */
export function verifyZendeskWebhook(input:{rawBody:string|Buffer;signature:string;timestamp:string;secret:string;account:string;now?:number;maxBytes?:number}):{receiptId:string;ticketId:string;account:string}{
  const raw=Buffer.isBuffer(input.rawBody)?input.rawBody:Buffer.from(input.rawBody);
  if(raw.length>(input.maxBytes??65536))throw new ProviderError('policy','Webhook exceeds payload limit');
  if(!input.secret)throw new ProviderError('configuration','Webhook signing secret is unavailable');
  const time=Date.parse(input.timestamp);if(!Number.isFinite(time)||Math.abs((input.now??Date.now())-time)>300000)throw new ProviderError('policy','Webhook timestamp is invalid or stale');
  const expected=createHmac('sha256',input.secret).update(input.timestamp).update(raw).digest('base64');const actual=Buffer.from(input.signature),safe=Buffer.from(expected);
  if(actual.length!==safe.length||!timingSafeEqual(actual,safe))throw new ProviderError('authentication','Webhook signature is invalid');
  let value:unknown;try{value=JSON.parse(raw.toString('utf8'));}catch{throw new ProviderError('schema','Webhook payload is invalid JSON');}
  // Configure a Zendesk trigger with this minimal body; no arbitrary URLs are accepted.
  const parsed=z.object({account:z.string(),ticket_id:z.string().regex(/^\d+$/)}).strict().safeParse(value);
  if(!parsed.success||parsed.data.account!==input.account)throw new ProviderError('policy','Webhook account or ticket is invalid');
  return {receiptId:createHash('sha256').update(input.timestamp).update(raw).digest('hex'),ticketId:parsed.data.ticket_id,account:parsed.data.account};
}
