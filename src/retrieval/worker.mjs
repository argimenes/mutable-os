import {parentPort,workerData,isMainThread} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {openRetrievalStore,stamp} from './store.mjs';
import {planPassages,hash,tokens} from './passages.mjs';
assert(!isMainThread);
let store,provider;const controllers=new Map();
try{store=openRetrievalStore(workerData);provider=(await import(workerData.providerModule??new URL('./provider.mjs',import.meta.url).href)).createProvider(workerData.providerOptions);assert.equal(provider.identity.model,store.profile.model);assert.equal(provider.identity.provider,store.profile.provider);assert.equal(provider.identity.dimensions,store.profile.dimensions);parentPort.postMessage({ready:true});}catch(e){store?.close();store=undefined;parentPort.postMessage({startupError:e.message});parentPort.close();}
if(store&&provider){
 const active=new Set();const epoch=workerData.epoch;
 async function embedding(texts,scope,grant,signal,check){
  check();assert(texts.length<=128);const count=texts.reduce((sum,s)=>sum+tokens(s),0);assert(count<=50000,'Embedding batch budget exceeded');let receipt,receipted=false;
  if(provider.external){assert(grant?.approved===true&&typeof grant.id==='string'&&grant.id.length<=128,'Explicit embedding consent required');assert.equal(grant.vaultGuid,store.vaultGuid);assert.equal(grant.indexId,store.indexId,'Consent belongs to another index lifetime');assert.equal(grant.model,provider.identity.model);assert(Date.parse(grant.expiresAt)>Date.now(),'Embedding consent expired');assert(Number.isInteger(grant.maxTokens)&&grant.maxTokens>0&&grant.maxTokens<=50000,'Invalid consent cap');
   if(scope.kind==='document')assert(grant.documents?.some(x=>x.resourceId===scope.resourceId&&x.contentHash===scope.sourceHash),'Document revision not approved for upload');
   else assert(grant.queries?.includes(hash(texts[0])),'Query not approved for upload');
   receipt=store.reserve(grant,count,hash(JSON.stringify([scope,texts.map(hash)])));
  }
  const start=performance.now();try{const result=await provider.embed(texts,{signal,scope});const ms=performance.now()-start;
   assert.equal(result.vectors.length,texts.length);for(const v of result.vectors){assert(v.length===store.profile.dimensions&&v.every(Number.isFinite),'Invalid embedding');assert(v.some(n=>n!==0),'Zero embedding');}
   const vectors=result.vectors.map(v=>Buffer.from(new Float32Array(v).buffer));
   if(scope.kind==='document')store.cacheVectors(texts,vectors);
   if(receipt){store.receipt(receipt,{actual:result.usage,providerMs:ms,requestId:result.requestId,status:'complete'});receipted=true;}check();
   return {vectors,providerMs:ms,usage:result.usage??0};
  }catch(e){if(receipt&&!receipted)store.receipt(receipt,{providerMs:performance.now()-start,status:'failed-or-unknown'});throw e;}
 }
 async function run(operation,payload,signal,check){
  if(operation==='index'){
   const saved=store.resource(payload.resourceId);assert(saved?.indexStatus==='complete','Saved projection unavailable');const expected=stamp(saved);check();if(payload.contentHash)assert.equal(payload.contentHash,saved.contentHash,'Confirmation superseded');
   if(store.indexedStamp(payload.resourceId)===expected)return {unchanged:true,embedded:0,projectionReads:0};
   const p=store.projection(payload.resourceId);assert.equal(stamp(p.resource),expected,'Saved source superseded');
   const start=performance.now(),chunks=planPassages(p,store.profile,check),missing=new Map(),vectors=new Map();
   for(const c of chunks){check();const cached=store.cached(c.inputHash);if(cached)vectors.set(c.inputHash,cached);else missing.set(c.inputHash,c.text);}
   const planningMs=performance.now()-start;let providerMs=0,usage=0;
   const pending=[...missing];for(let i=0;i<pending.length;i+=64){check();const batch=pending.slice(i,i+64),r=await embedding(batch.map(x=>x[1]),{kind:'document',resourceId:p.resource.guid,sourceHash:p.resource.contentHash},payload.consent,signal,check);r.vectors.forEach((v,j)=>vectors.set(batch[j][0],v));providerMs+=r.providerMs;usage+=r.usage;}
   check();const publish=performance.now();store.publish(p,chunks,vectors,expected,check);return {resourceId:p.resource.guid,passages:chunks.length,embedded:missing.size,reused:chunks.filter(c=>!missing.has(c.inputHash)).length,planningMs,providerMs,publicationMs:performance.now()-publish,usage};
  }
  if(operation==='query'){
   assert(typeof payload.query==='string'&&payload.query.trim()&&payload.query.length<=4096,'Query must be 1–4096 characters');assert(tokens(payload.query)<=1024,'Query token budget exceeded');
   const strategy=payload.strategy??'hybrid';let vector,providerMs=0,usage=0;
   if(strategy!=='lexical'){const r=await embedding([payload.query],{kind:'query'},payload.consent,signal,check);[vector]=r.vectors;providerMs=r.providerMs;usage=r.usage;}
   check();const start=performance.now();const result=store.rank(payload.query,vector,payload,check);check();return {...result,timing:{providerMs,localMs:performance.now()-start},usage,profile:store.profile,provenance:{vaultGuid:store.vaultGuid,profileKey:store.profileKey}};
  }
  if(operation==='verify'){check();assert.equal(payload.vaultGuid,store.vaultGuid);assert(store.current(payload.resourceId,payload.stamp),'Stale source reference');return {currency:'verified-saved-projection',liveCurrency:'unknown'};}
  if(operation==='inventory')return store.inventory();
  if(operation==='reconcile'){store.reconcile();return {reconciled:true};}
  if(operation==='status')return {profile:store.profile,indexId:store.indexId,resources:store.db.prepare('SELECT count(*) n FROM SavedResource').get().n,passages:store.db.prepare('SELECT count(*) n FROM Passage').get().n,embeddings:store.db.prepare('SELECT count(*) n FROM Embedding').get().n,receipts:store.db.prepare('SELECT * FROM Receipt ORDER BY id DESC LIMIT 100').all()};
  throw Error('Unsupported retrieval operation');
 }
 parentPort.on('message',message=>{
  if(message.cancel){controllers.get(message.cancel)?.abort(Error('Retrieval cancelled'));return;}
  const {id,operation,payload={}}=message;
  if(operation==='close'){for(const c of controllers.values())c.abort();Promise.allSettled([...active]).then(()=>{store.close();parentPort.postMessage({id,value:{closed:true}});parentPort.close();});return;}
  const controller=new AbortController();controllers.set(id,controller);const initial=payload.expectedEpoch;
  const check=()=>{controller.signal.throwIfAborted();assert(Atomics.load(epoch,1),'Saved scope is not currently confirmed');assert(!payload.cancellation||!Atomics.load(payload.cancellation,0),'Retrieval cancelled');assert.equal(Atomics.load(epoch,0),initial,'Retrieval superseded');};
  const task=(async()=>{try{check();const value=await run(operation,payload,controller.signal,check);check();parentPort.postMessage({id,value});}catch(e){parentPort.postMessage({id,error:e.message});}finally{controllers.delete(id);}})();active.add(task);void task.finally(()=>active.delete(task));
 });
}
