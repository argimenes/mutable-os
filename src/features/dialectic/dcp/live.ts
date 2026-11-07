import {validationDiagnostic} from './diagnostics';
import {defaultProviderSettings,liveLimits,type ProviderSettings,type ProviderTurn,type LiveProvenance} from './provider-contract';
import type {DcpTransport} from './exchange';

/** Application-session memory only. Disposal/reload forgets the local bearer token. */
export class DialecticProviderSession {
 private token='';private pending?:Promise<void>;private disposed=false;
 settings:ProviderSettings={...defaultProviderSettings};ready=false;
 private pagehide=()=>{void this.forget();};
 constructor(){window.addEventListener('pagehide',this.pagehide);}
 private async connect(){
  if(this.disposed)throw Error('Provider session closed.');if(this.token)return;
  if(!this.pending)this.pending=(async()=>{const r=await fetch('/api/dialectic/session',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'x-mutable-dialectic':'1'}});const data=await r.json();if(!r.ok)throw Error(data.error??'Local provider broker unavailable.');this.token=data.token;if(this.disposed){await this.forget();throw Error('Provider session closed.');}})().finally(()=>{this.pending=undefined;});
  await this.pending;
 }
 private async call(path:string,body?:unknown,signal?:AbortSignal,method='POST'){
  await this.connect();const response=await fetch('/api/dialectic'+path,{method,signal:signal??AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-mutable-dialectic':'1','x-dialectic-session':this.token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok){if(response.status===401){this.token='';this.ready=false;}const e=await response.json().catch(()=>({}));throw Error(e.error??'Local provider broker request failed.');}return response;
 }
 async configure(settings:ProviderSettings,key?:string){const response=await this.call('/settings',{settings,...(key?{key}:{})});const data=await response.json();this.settings=data.settings;this.ready=data.ready;return this.ready;}
 private async closeExchange(id:string){if(!this.token)return;await fetch('/api/dialectic/exchange/'+id,{method:'DELETE',signal:AbortSignal.timeout(2000),headers:{'x-mutable-dialectic':'1','x-dialectic-session':this.token},keepalive:true}).catch(()=>undefined);}
 async forget(){const token=this.token;this.token='';this.ready=false;if(token)await fetch('/api/dialectic/session',{method:'DELETE',headers:{'x-mutable-dialectic':'1','x-dialectic-session':token},keepalive:true}).catch(()=>undefined);}
 dispose(){window.removeEventListener('pagehide',this.pagehide);this.disposed=true;void this.forget();}
 transport(){
  const details:LiveProvenance={version:1,adapterVersion:'4c-1',settings:{...this.settings},attempts:[],cost:{status:'unknown'}};
  const run:DcpTransport=async(request,sources,chunk,signal,validate)=>{
   if(!this.ready)throw Error('Configure an API key and model in AI settings first.');
   let id='',round=0,calls=0,repair=false,next:any={round:0};
   const close=()=>{if(id)void this.closeExchange(id);};signal.addEventListener('abort',close,{once:true});
   try{
    const response=await this.call('/exchange',{request},signal),start=await response.json();id=start.id;details.settings=start.settings;details.system=start.system;if(signal.aborted)throw Error('DCP cancelled');
    while(round<liveLimits.rounds){
     sources.check();const response=await this.call('/exchange/'+id+'/turn',next,signal);if(!response.body)throw Error('Missing broker stream.');
     const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',wire=0,preview='',turn:ProviderTurn|undefined;
     try{while(true){const {done,value}=await reader.read();if(done)break;wire+=value.byteLength;if(wire>2*liveLimits.wireBytes)throw Error('Broker stream budget exceeded.');buffer+=decoder.decode(value,{stream:true});let end:number;
      while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);if(event.type==='delta'){preview+=event.text;if(preview.length>liveLimits.bytes)throw Error('DCP output budget exceeded.');chunk(preview);}else if(event.type==='result'){if(turn)throw Error('Duplicate provider result.');turn=event;}}
     }}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
     if(buffer.trim()||!turn)throw Error('Broker stream interrupted; no contribution committed.');sources.check();
     const attempt:LiveProvenance['attempts'][number]={receipt:turn.receipt,toolCalls:turn.calls,toolResultIds:[]};details.attempts.push(attempt);round++;
     if(turn.calls.length){
      calls+=turn.calls.length;if(calls>liveLimits.calls||repair)throw Error('DCP tool budget exceeded.');const results=[];
      for(const [i,call]of turn.calls.entries()){sources.check();const toolId=`provider-${round}-${i}`,result=await sources.tool({...call,id:toolId});attempt.toolResultIds.push(toolId);results.push({id:call.id,result});}
      next={round,results};continue;
     }
     try{await validate?.(turn.text);return turn.text;}
     catch(error){sources.check();if(repair||!details.settings.repair)throw error;repair=true;attempt.repair=String(error).slice(0,1000);attempt.rejectedResponse=turn.text;chunk('DCP validation failed; trying the enabled single repair…');next={round,repair:true,diagnostic:validationDiagnostic(error)};}
    }throw Error('DCP continuation limit exceeded.');
   }finally{signal.removeEventListener('abort',close);if(id)await this.closeExchange(id);}
  };
  return {run,details};
 }
}
