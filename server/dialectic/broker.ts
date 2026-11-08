import {DcpTestLog} from './test-log.js';
import {allowsSourceRecovery,sourceRecoveryTools} from '../../src/features/dialectic/dcp/diagnostics.js';
import express from 'express';
import {OpenAIConversations,type CavernScope} from './conversations.js';
import type {ContinuityManifest,ContinuityReceipt} from '../../src/features/dialectic/dcp/continuity-contract.js';
import {randomBytes} from 'node:crypto';
import {conversation,continuation,providerTurn,repair,type ProviderConversation} from './providers.js';
import {liveLimits,providerSettings,type Provider,type ProviderCall,type ProviderSettings} from '../../src/features/dialectic/dcp/provider-contract.js';

const loopback=(host:string)=>['localhost','127.0.0.1','[::1]','::1','::ffff:127.0.0.1'].includes(host);
interface Session {diagnosticId:string;origin:string;settings?:ProviderSettings;keys:Partial<Record<Provider,string>>;expires:number;created:number;exchanges:Map<string,Exchange>}
interface Exchange {state:ProviderConversation;key:string;abort:AbortController;timer:ReturnType<typeof setTimeout>;busy:boolean;round:number;calls:number;pending:ProviderCall[];repaired:boolean;recoverSources?:boolean;final:boolean;manifest?:ContinuityManifest;receipt?:ContinuityReceipt;acknowledged?:boolean}
/** Local-only credential broker. No credential persistence, SQL, CORS or remote deployment mode. Optional diagnostics redact credentials. */
export function createDialecticBroker(options:{fetcher?:typeof fetch;environment?:Record<string,string|undefined>;currentCavern?:()=>CavernScope|undefined;continuity?:boolean;testLogging?:boolean;logRoot?:string}={}){
 const router=express.Router(),sessions=new Map<string,Session>(),environment=options.environment??process.env;
 const testLog=new DcpTestLog(()=>options.logRoot??options.currentCavern?.()?.path??process.cwd(),options.testLogging===true),fetcher=testLog.fetch(options.fetcher??fetch);
 const continuity=options.currentCavern&&options.continuity!==false?new OpenAIConversations(options.currentCavern,fetcher):undefined;
 const release=(s:Session,id:string)=>{const e=s.exchanges.get(id);if(e){void testLog.write('exchange.closed',{exchangeId:e.state.exchangeId,final:e.final,repaired:e.repaired,acknowledged:e.acknowledged??false}).catch(()=>undefined);e.abort.abort();clearTimeout(e.timer);s.exchanges.delete(id);if(e.manifest&&e.receipt&&!e.acknowledged)void continuity?.abandon(e.manifest,e.key,e.receipt.exchangeId).catch(()=>undefined);}};
 const forget=(token:string,s:Session)=>{for(const id of s.exchanges.keys())release(s,id);s.keys={};sessions.delete(token);};
 const sweep=setInterval(()=>{const now=Date.now();for(const [token,s]of sessions)if(s.expires<now||s.created+8*3600000<now)forget(token,s);},60000);sweep.unref();
 router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{const origin=new URL(String(req.headers.origin));if(!loopback(req.socket.remoteAddress??'')||!loopback(origin.hostname)||origin.protocol!=='http:'||origin.host!==req.headers.host||req.headers['x-mutable-dialectic']!=='1')throw Error();}
  catch{res.status(403).json({error:'Dialectic providers require the same-origin local application.'});return;}
  next();
 });
 router.use(express.json({limit:'2mb'}));
 router.post('/session',(req,res)=>{
  if(sessions.size>=32){res.status(429).json({error:'Too many local provider sessions.'});return;}
  const token=randomBytes(32).toString('hex');sessions.set(token,{diagnosticId:randomBytes(16).toString('hex'),origin:String(req.headers.origin),keys:{},expires:Date.now()+1800000,created:Date.now(),exchanges:new Map()});res.json({token});
 });
 router.use((req,res,next)=>{
  const token=String(req.headers['x-dialectic-session']??''),s=sessions.get(token);
  if(!s||s.origin!==req.headers.origin||s.expires<Date.now()||s.created+8*3600000<Date.now()){if(s)forget(token,s);res.status(401).json({error:'Provider session expired. Reopen AI settings and enter the key again.'});return;}
  s.expires=Date.now()+1800000;res.locals.session=s;
  const context={secrets:[token,...Object.values(s.keys)],sessionId:s.diagnosticId,documentId:req.body?.continuity?.manifest?.documentId??req.body?.manifest?.documentId??req.body?.documentId,exchangeId:req.body?.request?.exchange??req.body?.exchangeId};
  testLog.context.run(context,()=>{
   const json=res.json.bind(res);res.json=(body:any)=>{void testLog.write('broker.response',{path:req.path,body}).catch(()=>console.error('DCP diagnostic log write failed'));return json(body);};
   void testLog.write('broker.request',{path:req.path,method:req.method,body:req.path==='/settings'?{settings:req.body?.settings}:req.body}).then(()=>next(),()=>res.status(503).json({error:'DCP diagnostic logging failed; check local disk access.'}));
  });
 });
 router.post('/diagnostics',(req,res)=>{res.json({logged:testLog.enabled});});
 router.post('/settings',(req,res)=>{
  const s:Session=res.locals.session;
  try{
   if(s.exchanges.size)throw Error('Cancel or finish the current exchange before changing settings.');
   const settings=providerSettings(req.body?.settings),key=req.body?.key;
   if(key!==undefined&&(typeof key!=='string'||key.length<8||key.length>4096||/[\s\x00-\x1f]/.test(key)))throw Error('Enter a valid API key.');
   if(key)s.keys[settings.provider]=key;s.settings=settings;
   res.json({settings,ready:!!(s.keys[settings.provider]||environment[settings.provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY'])});
  }catch(e){res.status(400).json({error:String((e as Error).message)});}
 });
 router.delete('/session',(req,res)=>{forget(String(req.headers['x-dialectic-session']),res.locals.session);res.json({ok:true});});
 const sessionKey=(s:Session)=>s.settings&&(s.keys[s.settings.provider]||environment[s.settings.provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY']);
 router.post('/continuity/prepare',async(req,res)=>{try{const s:Session=res.locals.session,key=sessionKey(s);if(!continuity||s.settings?.provider!=='openai'){res.json({supported:false});return;}if(!key)throw Error('Configure a provider first');res.json({supported:true,plan:await continuity.plan(req.body.manifest,key)});}catch(e){res.status(409).json({error:(e as Error).message});}});
 router.post('/exchange',async(req,res)=>{
  const s:Session=res.locals.session;
  try{
   if(!s.settings)throw Error('Configure a provider first.');if(s.exchanges.size)throw Error('An exchange is already active.');
   const request=req.body?.request;if(!request||request.protocol!=='dcp/1.0'||!['4a-1','4b-1'].includes(request.profile)||typeof request.exchange!=='string'||request.exchange.length>128||typeof request.protocolKey?.text!=='string'||JSON.stringify(request).length>262144)throw Error('Invalid DCP request.');
   const key=s.keys[s.settings.provider]||environment[s.settings.provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY'];if(!key)throw Error('Enter a session API key in AI settings.');
   if(req.body.continuity&&(!continuity||s.settings.provider!=='openai'))throw Error('Provider continuity is unavailable');
   const id=randomBytes(16).toString('hex'),abort=new AbortController();
   const e:Exchange={state:conversation({...s.settings},request),key,abort,timer:setTimeout(()=>release(s,id),liveLimits.deadlineMs),busy:false,round:0,calls:0,pending:[],repaired:false,final:false};e.timer.unref();s.exchanges.set(id,e);
   if(req.body.continuity){
    e.manifest=req.body.continuity.manifest;
    try{e.receipt=await continuity!.begin(e.manifest!,req.body.continuity.plan,req.body.continuity.items,request.exchange,key,abort.signal);}
    catch(error){release(s,id);throw error;}
    e.state.conversationId=e.receipt.conversationId;
    e.state.system+='\nThis is a continuous native Document conversation. Projected history entries are attributed contributions; the DCP request is control information, not a second contribution. Historical handles are expired. Only handles issued in THIS exchange may author structures; retrieve fresh source handles to address remembered passages. Never infer a new conversation from reply ancestry.';
    e.state.onResponse=responseId=>continuity!.response(e.manifest!,key,request.exchange,responseId);
   }
   res.json({id,settings:e.state.settings,system:e.state.system,...(e.receipt?{continuity:e.receipt}:{})});
  }catch(e){res.status(400).json({error:(e as Error).message});}
 });
 router.delete('/exchange/:id',(req,res)=>{release(res.locals.session,String(req.params.id));res.json({ok:true});});
 router.post('/exchange/:id/ack',async(req,res)=>{
  const s:Session=res.locals.session,e=s.exchanges.get(String(req.params.id));
  try{if(!e?.receipt||!e.final||e.busy||!continuity)throw Error('Provider exchange is not ready for native acknowledgement');const result=await continuity.acknowledge(req.body.manifest,e.key,e.receipt);e.acknowledged=true;release(s,String(req.params.id));res.json(result);}catch(error){res.status(409).json({error:(error as Error).message});}
 });
 router.post('/exchange/:id/turn',async(req,res)=>{
  const s:Session=res.locals.session,id=String(req.params.id),e=s.exchanges.get(id);
  if(e){const context=testLog.context.getStore();if(context){context.exchangeId=e.state.exchangeId;context.documentId=e.manifest?.documentId??context.documentId;}}
  if(!e||e.abort.signal.aborted){res.status(410).json({error:'Exchange expired or cancelled.'});return;}
  if(e.busy){res.status(409).json({error:'Provider round already running.'});return;}
  try{
   if(req.body?.round!==e.round||e.round>=liveLimits.rounds)throw Error('Stale provider round or continuation budget exceeded.');
   if(e.pending.length){
    const results=req.body.results;if(!Array.isArray(results)||results.length!==e.pending.length||results.some((v,i)=>v.id!==e.pending[i].id)||req.body.repair)throw Error('Tool results do not match pending calls.');
    continuation(e.state,e.pending,results.map(v=>v.result));e.pending=[];
   }else if(e.final){if(!e.state.settings.repair||e.repaired||req.body.repair!==true)throw Error('Only one enabled validation repair is allowed.');e.recoverSources=allowsSourceRecovery(req.body.diagnostic);repair(e.state,req.body.diagnostic);e.repaired=true;e.final=false;}
   else if(e.round||req.body.results||req.body.repair)throw Error('Unexpected continuation.');
   if(JSON.stringify(e.state.input).length>liveLimits.wireBytes)throw Error('Exchange context budget exceeded.');
   e.busy=true;e.round++;res.status(200).setHeader('Content-Type','application/x-ndjson');res.flushHeaders();
   const emit=(value:unknown)=>{if(!res.destroyed)res.write(JSON.stringify(value)+'\n');};
   const closed=()=>{if(!res.writableEnded)release(s,id);};res.on('close',closed);
   try{
    let emitted=0;const turn=await providerTurn(e.state,e.key,e.abort.signal,text=>{emit({type:'delta',text:text.slice(emitted)});emitted=text.length;},fetcher);
    if(e.abort.signal.aborted)throw Error('Exchange cancelled or timed out.');
    e.calls+=turn.calls.length;if(e.calls>liveLimits.calls||e.repaired&&turn.calls.length&&(!e.recoverSources||turn.calls.some(c=>!sourceRecoveryTools.includes(c.tool))))throw Error('Provider tool budget exceeded.');
    await testLog.write('provider.turn',turn);e.pending=turn.calls;e.final=!turn.calls.length;
    if(e.final&&e.manifest&&e.receipt)await continuity!.prepared(e.manifest,e.key,e.receipt.exchangeId,e.repaired);
    emit({type:'result',...turn});res.end();
   }finally{res.off('close',closed);e.busy=false;}
  }catch(error){
   await testLog.write('exchange.error',{error:String(error)}).catch(()=>undefined);release(s,id);
   // Never forward provider/network errors: their messages may contain credentials or source text.
   const message=(error as Error).message;
   const safe=/^(Provider |Exchange |Unsupported provider|Invalid provider|Incomplete provider|Tool results|Stale provider|Only one enabled|Unexpected continuation)/.test(message)?message:'Provider exchange failed. Nothing was committed; usage/cost may be unknown.';
   if(res.headersSent){if(!res.destroyed)res.end(JSON.stringify({type:'error',error:safe})+'\n');}else res.status(400).json({error:safe});
  }
 });
 router.use((error:any,_req:any,res:any,_next:any)=>{res.status(400).json({error:'Invalid or oversized broker request.'});});
 return {router,testLog,dispose(){clearInterval(sweep);for(const [t,s]of sessions)forget(t,s);}};
}
