import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { readBoundedText } from './request';
export type Actor={id:string;role:'admin'|'reviewer'|'viewer';demo:boolean;csrfToken:string};
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
function loopback(host:string) { return ['127.0.0.1','localhost','[::1]','::1'].includes(host); }
export function hashPassword(password:string) {if(password.length<14)throw new Error('Use a password of at least 14 characters');const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function checkPassword(password:string,encoded:string) {const [salt,hash]=encoded.split(':');if(!salt||!hash)return false;const derived=scryptSync(password,salt,64);const stored=Buffer.from(hash,'hex');return stored.length===derived.length&&timingSafeEqual(stored,derived);}
export async function authenticate(request:Request,write=false,admin=false):Promise<Actor> {
  const settings=await db.workspaceSettings.findUnique({where:{id:'workspace'}});
  const url=new URL(request.url), configured=new URL(process.env.APP_BASE_URL??'http://127.0.0.1:3000');
  const origin=request.headers.get('origin');
  if(write&&origin&&origin!==url.origin&&origin!==configured.origin)throw new HttpError(403,'Cross-origin mutation rejected');
  const bind=process.env.APP_BIND_HOST??'127.0.0.1';
  const isDemo=settings?.dataMode==='demo'&&(process.env.DATA_MODE??'demo')==='demo'&&loopback(url.hostname)&&loopback(configured.hostname)&&loopback(bind);
  if(isDemo&&await db.ticket.count({where:{source:'zendesk'}})===0) return {id:'local-demo-reviewer',role:'admin',demo:true,csrfToken:'local-loopback-demo'};
  const sid=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('zenjev_session='))?.slice('zenjev_session='.length);
  const session=sid?await db.session.findUnique({where:{id:sid},include:{user:true}}):null;
  if(!session||session.expiresAt<=new Date())throw new HttpError(401,'Authenticated session required');
  if(write&&request.headers.get('x-csrf-token')!==session.csrfToken)throw new HttpError(403,'CSRF token required');
  const endingOwnSession=request.method==='POST'&&url.pathname==='/api/auth/logout';
  if(write&&!endingOwnSession&&!['admin','reviewer'].includes(session.user.role))throw new HttpError(403,'Reviewer role required');
  if(admin&&session.user.role!=='admin')throw new HttpError(403,'Administrator role required');
  return {id:session.user.id,role:session.user.role as Actor['role'],demo:false,csrfToken:session.csrfToken};
}
const loginFailures=new Map<string,{count:number;until:number}>();
export async function login(request:Request) {
  const origin=request.headers.get('origin'),url=new URL(request.url),configured=new URL(process.env.APP_BASE_URL??'http://127.0.0.1:3000');
  if(origin&&origin!==url.origin&&origin!==configured.origin)throw new HttpError(403,'Cross-origin login rejected');
  let body:{username?:unknown;password?:unknown};try{body=JSON.parse(await readBoundedText(request,16384));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid login JSON');}
  if(!body||typeof body.username!=='string'||typeof body.password!=='string'||body.username.trim().length<1||body.username.length>128||body.password.length<1||body.password.length>1024)throw new HttpError(400,'Username and password must have valid bounded lengths');
  const now=Date.now();for(const [key,value] of loginFailures){if(value.until<=now)loginFailures.delete(key);}
  if(loginFailures.size>=1000&&!loginFailures.has(body.username))throw new HttpError(429,'Login capacity temporarily exhausted; try again later');
  const record=loginFailures.get(body.username);
  if(record&&record.count>=5&&record.until>Date.now())throw new HttpError(429,'Too many login attempts; try again later');
  // Reserve before awaiting the database so concurrent arbitrary usernames cannot grow the cache past its cap.
  loginFailures.set(body.username,{count:(record?.count??0)+1,until:record?.until??now+15*60_000});
  const user=await db.user.findUnique({where:{username:body.username}});
  if(!user||!checkPassword(body.password,user.passwordHash)){throw new HttpError(401,'Invalid credentials');}
  loginFailures.delete(body.username);
  const session=await db.session.create({data:{id:randomBytes(32).toString('hex'),userId:user.id,csrfToken:randomBytes(24).toString('hex'),expiresAt:new Date(Date.now()+8*3600_000)}});
  return Response.json({user:{id:user.id,role:user.role},csrfToken:session.csrfToken},{headers:{'set-cookie':`zenjev_session=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${url.protocol==='https:'?'; Secure':''}`}});
}
export function validateRuntimeConfig() {
  const dataMode=process.env.DATA_MODE??'demo', jevMode=process.env.JEV_MODE??'mock';
  if(!['demo','live'].includes(dataMode)||!['mock','live'].includes(jevMode))throw new Error('Invalid DATA_MODE or JEV_MODE');
  if(dataMode==='live') {
    if(jevMode!=='live')throw new Error('Live data requires live Jev; real-data/mock operation is prohibited');
    if((process.env.SESSION_SECRET?.length??0)<32)throw new Error('Live startup requires SESSION_SECRET of at least 32 characters');
    const u=new URL(process.env.DATABASE_URL??'postgresql://demo:demo@localhost/zenjev_demo');
    if(u.username==='demo'||u.password==='demo'||u.pathname.endsWith('_demo'))throw new Error('Live startup rejects demo database credentials');
  }
}
