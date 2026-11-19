// Run against Vite; isolated Chrome profile, in-memory documents, no document saves.
// TEI_QUALIFICATION_URL defaults to http://127.0.0.1:3000. Writes only QA evidence.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const origin=process.env.TEI_QUALIFICATION_URL??'http://127.0.0.1:3000';
const profile=await mkdtemp(path.join(tmpdir(),'tei-smoke-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';chrome.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const result=JSON.parse(e.data),p=pending.get(result.id);if(p){pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('timeout '+method)),120000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:origin+'/src/interchange/tei/fixtures/README.md'},sessionId);await new Promise(r=>setTimeout(r,1000));
 const results=[];
 for(const name of ['A040080.xml','A041209.xml']){
  const prepared=await evaluate(`(async()=>{
   const {runInterchange}=await import('/src/runtime/interchange-worker.ts');
   const {decodeNative,captureNative,nativeBytes}=await import('/src/persistence/native-resource.ts');
   const {resourceToRepository}=await import('/src/history/durable-core.ts');const {encodeDocument}=await import('/src/block-tree/codecs.ts');
   const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
   const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const webPath=source.split('"').find(p=>p.includes('/solid-js_web.js'));const {render,createComponent}=await import(webPath);
   const xml=await(await fetch('/src/interchange/tei/fixtures/${name}')).text(),start=performance.now();
   const result=await runInterchange({kind:'tei-document',file:{name:'${name}',blob:new Blob([xml])}},new AbortController().signal);
   const dto=encodeDocument(resourceToRepository(decodeNative(result.bytes))),editor=new ReactiveEditor(dto);registerCoreViews(editor);const projection=editor.createView();document.body.replaceChildren();const host=document.body.appendChild(document.createElement('div'));
   const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);await new Promise(requestAnimationFrame);
   const node=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>10&&editor.mounts.get(n.key));
   const value=()=>editor.node(node.key).inlineContent.map(k=>editor.node(k).payload.text).join('');const before=value();const mount=editor.mounts.get(node.key);mount.focus();mount.restoreInlineSelection({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0,0);
   window.teiSmoke={editor,projection,host,dispose,node,value,before,captureNative,nativeBytes,decodeNative,id:dto.id};
   return {name:'${name}',cells:result.stats.cells,bytes:result.bytes.length,prepareAndMountMs:Math.round(performance.now()-start),pages:host.querySelectorAll('.reactive-page').length,initialTab:host.querySelector('[role=tab][aria-selected=true]')?.textContent,truncated:result.truncated,warnings:result.diagnostics.map(d=>({code:d.code,count:d.count}))};
  })()`);
  assert.equal(prepared.pages,1);assert.equal(prepared.initialTab,'Text');assert.equal(prepared.truncated,false);
  await send('Input.insertText',{text:'X'},sessionId);
  const edited=await evaluate(`(async()=>{const f=window.teiSmoke;const inserted=f.value()==='X'+f.before;f.editor.repository.undo();const undone=f.value()===f.before;f.editor.repository.redo();const redone=f.value()==='X'+f.before;f.editor.repository.undo();
   const bytes=f.nativeBytes(f.captureNative(f.editor.repository.readState(),f.id));const restored=f.decodeNative(bytes);const nativePages=Object.values(restored.contents).filter(c=>c.viewType==='page-block').length;
   const start=performance.now();[...f.host.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Metadata').click();await new Promise(requestAnimationFrame);const metadataVisible=f.host.querySelector('[role=tab][aria-selected=true]')?.textContent==='Metadata';const metadataMountMs=Math.round(performance.now()-start);f.dispose();f.editor.dispose();return {inserted,undone,redone,nativePages,metadataVisible,metadataMountMs};})()`);
  assert(edited.inserted&&edited.undone&&edited.redone&&edited.metadataVisible);assert.equal(edited.nativePages,1);results.push({...prepared,...edited});console.log(JSON.stringify(results.at(-1)));
 }
 const cancellation=await evaluate(`(async()=>{const {runInterchange}=await import('/src/runtime/interchange-worker.ts');const file={name:'cancel.tei',blob:new Blob(['<TEI><p>'+ 'a'.repeat(1000000)+'</p></TEI>'])};
 const controller=new AbortController();const work=runInterchange({kind:'tei-document',file},controller.signal);setTimeout(()=>controller.abort(),5);let cancelled=false,timedOut=false;
 try{await work;}catch(error){cancelled=String(error).includes('cancelled');}
 try{await runInterchange({kind:'tei-document',file,limits:{timeoutMs:1}},new AbortController().signal);}catch(error){timedOut=String(error).includes('timed out');}return {cancelled,timedOut};})()`);
 assert(cancellation.cancelled&&cancellation.timedOut);console.log(JSON.stringify({cancellation}));
 await mkdir('artifacts/tei-m1',{recursive:true});await writeFile('artifacts/tei-m1/browser-smoke.json',JSON.stringify({environment:'Chrome headless, Vite, real worker and trusted CDP text input; isolated in-memory documents',results,cancellation},null,2)+'\n');
}finally{socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
