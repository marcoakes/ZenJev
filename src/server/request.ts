import { HttpError } from './auth';
/** Bound bytes while streaming, including requests without a Content-Length header. */
export async function readBoundedText(request:Request,maxBytes=65536) {
 const length=Number(request.headers.get('content-length')??0);
 if(!Number.isFinite(length)||length>maxBytes)throw new HttpError(413,'Request body too large');
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new HttpError(413,'Request body too large');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}
