export class ProviderError extends Error {
  constructor(public readonly code:'configuration'|'authentication'|'schema'|'rate_limit'|'transient'|'conflict'|'uncertain'|'policy', message:string, public readonly status:number|null=null,public readonly retryAfterMs:number|null=null) {super(message);this.name='ProviderError';}
}
export type HttpOptions={fetch?:typeof fetch;timeoutMs?:number;maxRetries?:number;sleep?:(ms:number)=>Promise<void>;random?:()=>number;minimumRetryDelayMs?:number};
export async function requestJson(url:string,init:RequestInit,options:HttpOptions={},mutation=false):Promise<{body:unknown;response:Response}> {
  const retries=mutation?0:Math.min(3,Math.max(0,options.maxRetries??2));
  const sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  for(let attempt=0;;attempt++) {
    let response:Response;
    try { response=await (options.fetch??fetch)(url,{...init,redirect:'error',signal:AbortSignal.timeout(Math.min(60000,Math.max(10,options.timeoutMs??15000)))}); }
    catch {
      if(mutation) throw new ProviderError('uncertain','Remote write outcome is uncertain; reconcile before retry');
      if(attempt>=retries) throw new ProviderError('transient','Provider request failed or deadline exceeded',null,options.minimumRetryDelayMs??null);
      await sleep(100*2**attempt+Math.floor((options.random??Math.random)()*50));continue;
    }
    if(response.ok){
      try {return {body:parseProviderJson(await response.text()),response};}catch {if(mutation)throw new ProviderError('uncertain','Write response could not be decoded; reconcile before retry');throw new ProviderError('schema','Provider returned invalid JSON',response.status);}
    }
    const rateLimited=response.status===429||(response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after')));
    if(response.status===401||(response.status===403&&!rateLimited)) throw new ProviderError('authentication','Provider authentication or permission failed',response.status);
    if(response.status===409) throw new ProviderError('conflict','Remote state changed; return to review',409);
    const transient=rateLimited||response.status>=500;
    if(mutation&&response.status>=500) throw new ProviderError('uncertain','Remote write outcome is uncertain; reconcile before retry',response.status);
    if(!transient) throw new ProviderError('schema',`Provider rejected the request (HTTP ${response.status})`,response.status);
    const header=response.headers.get('retry-after');
    const retryAfter=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-Date.now()):rateLimited&&response.headers.has('x-ratelimit-reset')?Number(response.headers.get('x-ratelimit-reset'))*1000-Date.now():0;
    if(attempt>=retries) throw new ProviderError(rateLimited?'rate_limit':'transient','Provider retry limit exhausted',response.status,Math.max(options.minimumRetryDelayMs??0,retryAfter)||null);
    // Never retry earlier than a server deadline. Long delays are delegated to durable job scheduling.
    if(retryAfter>30000)throw new ProviderError('rate_limit','Provider requested a delayed retry; reschedule the job',response.status,retryAfter);
    await sleep(Math.max(options.minimumRetryDelayMs??0,retryAfter,100*2**attempt+Math.floor((options.random??Math.random)()*50)));
  }
}

/** Preserve external integer identifiers before JS numeric decoding can round them. */
export function parseProviderJson(raw:string):unknown {
  return JSON.parse(raw.replace(/("(?:id|number|[a-z_]+_id)"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"$2"'));
}
