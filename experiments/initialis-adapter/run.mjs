// Bounded research using the real Flint benchmark bootstrap. No production imports.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'artifacts/initialis-adapter/direct';await mkdir(artifacts,{recursive:true});
const assetRequests=[];
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
 transform(code,id){if(!id.endsWith('/src/block-tree/repository.ts'))return;return code.replace(/(function (validateRepository|planChangedRecords)\([^)]*\)[^{]*\{)/g,(match,_header,name)=>match+` if(globalThis.__characterProofCounters)globalThis.__characterProofCounters.${name==='validateRepository'?'fullValidation':'broadPlanning'}++;`);},
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{directDomCharacterCells:${process.env.CARET_PATH!=='solid'},nativeKnowledge:false,sqliteKnowledge:false,nativeDocumentPersistence:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const native=(await import('/src/persistence/native-session.ts')).nativeDocumentSession(editor);
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host,native};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://local');
 if(url.pathname.startsWith('/vendor/initialis/')){assetRequests.push(url.pathname);res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self'");}
 if(url.pathname==='/__fail-worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end('self.onmessage=()=>{throw Error("Qualification worker failure")};');return;}
 if(url.pathname==='/__font-fail-worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(`const original=fetch;globalThis.fetch=(url,...rest)=>String(url).includes('/caps/')?Promise.resolve(new Response('',{status:404})):original(url,...rest);const queue=[];self.onmessage=e=>queue.push(e);await import('/vendor/initialis/worker.mjs');const handler=self.onmessage;for(const event of queue)handler(event);`);return;}
 if(url.pathname==='/__webgl-fail-worker.mjs'){res.setHeader('Content-Type','text/javascript');res.end(`const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args)};const queue=[];self.onmessage=e=>queue.push(e);await import('/vendor/initialis/worker.mjs');const handler=self.onmessage;for(const event of queue)handler(event);`);return;}

 if(url.pathname==='/__late-font'){await new Promise(r=>setTimeout(r,100));res.setHeader('Content-Type','font/ttf');res.end(await readFile('src/assets/fonts/MedievalSharp-Regular.ttf'));return;}
 if(url.pathname==='/__character-benchmark.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('experiments/initialis-adapter/browser.js'));return;}
if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'nonce-bXV0YWJsZS1wcm9vZg=='; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'");res.end((await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>')).replaceAll('<script','<script nonce="bXV0YWJsZS1wcm9vZg=="'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},600000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);

 await evaluate("(async()=>{proof.caret=await import('/__character-benchmark.js');await proof.caret.setup(proof);})()");
 const key=async(key,modifiers=0)=>{const code={ArrowLeft:37,ArrowRight:39,Backspace:8,Delete:46,Enter:13,x:88,i:73,z:90,';':186}[key]??(/^[a-z]$/.test(key)?key.toUpperCase().charCodeAt(0):0);for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key===';'?'Semicolon':/^[a-z]$/.test(key)?'Key'+key.toUpperCase():key,windowsVirtualKeyCode:code,modifiers,...(type==='keyDown'&&/^[a-z]$/.test(key)&&!modifiers?{text:key}:{})},sessionId);};
 const click=async(point)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1},sessionId);};

 const report={csp:"Same-origin scripts/workers/connect, local raster img blob/data; style inline required by existing renderer",internet:"External DNS disabled; local Mutable server available",path:process.env.CARET_PATH??'direct',browser:await send('Browser.getVersion'),checks:[]};
 const check=(name,passed,details)=>{report.checks.push({name,passed:!!passed,details});};
 await evaluate("proof.before=proof.mount.captureText();proof.initialRevision=proof.editor.repository.state.revision;proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:0})");
 await key('ArrowRight',8);
 check('trusted selection covers one source Cell',await evaluate('proof.mount.captureInlineSelection().head===1'));
 await evaluate('proof.caret.startCounters();proof.activationStart=performance.now()');
 await key(';',2);await key('i');
 report.keyboardImmediate=await evaluate('({selection:proof.mount.captureInlineSelection(),properties:JSON.parse(JSON.stringify(proof.editor.node(proof.text.key).payload.standoffProperties.filter(p=>p.type==="style/character-surface"))),text:proof.mount.captureText(),notice:proof.editor.initialis.notice()})');
 await evaluate('proof.caret.ready()');
 report.keyboardReadyMs=await evaluate('performance.now()-proof.activationStart');
 report.activationCounts=await evaluate('proof.caret.stopCounters()');
 check('keyboard authors exactly one Initialis property',report.keyboardImmediate.properties.length===1&&report.keyboardImmediate.properties[0].metadata.renderer==='initialis');
 check('keyboard retains selection',report.keyboardImmediate.selection.anchor===0&&report.keyboardImmediate.selection.head===1);
 check('activation uses bounded canonical admission',report.activationCounts.counts.snapshots===0&&report.activationCounts.counts.fullValidation===0&&report.activationCounts.counts.broadPlanning===0&&report.activationCounts.counts.projectionBuilds===0,report.activationCounts.counts);
 check('source character and Cell retained',await evaluate('proof.mount.captureText()===proof.before&&proof.caret.inspect().sameText&&proof.caret.inspect().sameCell'));
 await key(';',2);await key('i');
 check('duplicate is nonauthoring',await evaluate('proof.editor.repository.state.revision===proof.initialRevision+1'));
 await key('z',4);await wait('!proof.flow.firstElementChild.hasAttribute("data-character-surface")');
 check('one trusted undo removes property',await evaluate('!proof.editor.node(proof.text.key).payload.standoffProperties.some(p=>p.type==="style/character-surface")'));
 await key('z',12);await evaluate('proof.caret.ready()');check('trusted redo renders property',true);
 await key('z',4);await evaluate('proof.mount.restoreInlineSelection({anchor:0,head:0})');await key('ArrowRight',8);
 const point=await evaluate(`(()=>{const b=[...proof.root.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Apply Initialis')&&b.getBoundingClientRect().width);if(!b)throw Error('Initialis button missing');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await click(point);await evaluate('proof.caret.ready()');
 report.toolbar=await evaluate('({selection:proof.mount.captureInlineSelection(),focused:proof.mount.root.contains(document.activeElement),properties:proof.editor.node(proof.text.key).payload.standoffProperties.filter(p=>p.type==="style/character-surface").length})');
 check('trusted button retains selection and focus',report.toolbar.selection.anchor===0&&report.toolbar.selection.head===1&&report.toolbar.focused,report.toolbar);
 check('button authors exactly one property',report.toolbar.properties===1);
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'activation.png'),Buffer.from(shot.data,'base64'));

 const unchanged=await evaluate('proof.editor.repository.state.revision');
 for(const mode of ['collapsed','multiple','lowercase']){
  const start=mode==='lowercase'?await evaluate('proof.mount.captureText().search(/[a-z]/)'):0;
  await evaluate(`proof.mount.focus();proof.mount.restoreInlineSelection({anchor:${start},head:${start}})`);
  if(mode!=='collapsed')await key('ArrowRight',8);if(mode==='multiple')await key('ArrowRight',8);
  await key(';',2);await key('i');check(mode+' keyboard rejection is nonauthoring',await evaluate('proof.editor.repository.state.revision')===unchanged);
  await click(point);check(mode+' toolbar rejection is nonauthoring',await evaluate('proof.editor.repository.state.revision')===unchanged);
 }
 await evaluate('proof.editor.commands.setPayloadField(proof.text.key,"standoffProperties",JSON.parse(JSON.stringify(proof.editor.node(proof.text.key).payload.standoffProperties)).filter(p=>p.type!=="style/character-surface"))');
 report.unrelated=await evaluate('proof.caret.openUnrelated()');
 report.performance=[];let seed=100;
 for(const variant of ['static','cached','background','cached','background','static','background','static','cached']){
  await evaluate(`proof.caret.apply(${JSON.stringify(variant==='static'?'static':'initialis')});proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:100})`);await evaluate('proof.caret.ready()');await evaluate('new Promise(r=>requestAnimationFrame(r))');
  if(variant==='background')await evaluate(`proof.caret.startBackground(${seed+=10})`);
  const networkBefore=assetRequests.length;await evaluate('proof.beforeStats={...proof.editor.initialis.service.stats};proof.caret.startCounters()');
  for(let i=0;i<20;i++){await key(i%2?'Backspace':'x');await evaluate('new Promise(r=>requestAnimationFrame(r))');}
  const result=await evaluate('proof.caret.stopCounters()');const stats=await evaluate('({hashes:proof.editor.initialis.service.stats.hashes-proof.beforeStats.hashes,workers:proof.editor.initialis.service.stats.workersStarted-proof.beforeStats.workersStarted,generated:proof.editor.initialis.service.stats.generated-proof.beforeStats.generated,active:proof.beforeStats.active})');
  report.performance.push({variant,...result,stats,assetRequests:assetRequests.length-networkBefore});check('no worker asset requests while typing',assetRequests.length===networkBefore);check(variant+' bounded typing work',result.counts.snapshots===0&&result.counts.fullValidation===0&&result.counts.broadPlanning===0&&result.counts.projectionBuilds===0&&result.counts.paragraphTextWalks===0&&result.counts.unrelatedGeometry===0&&result.counts.unrelatedMutations===0&&stats.hashes===0&&stats.workers===0,result.counts);
  check(variant+' retains source Text',result.domRetained);if(variant==='background'){check('generation overlapped typing',stats.active===1&&stats.generated>0,stats);await evaluate('proof.caret.stopBackground()');}
 }
 report.handlers=[];for(const variant of ['static','cached','background','cached','background','static','background','static','cached']){
  await evaluate(`proof.caret.apply(${JSON.stringify(variant==='static'?'static':'initialis')})`);await evaluate('proof.caret.ready()');if(variant==='background')await evaluate(`proof.caret.startBackground(${seed+=10})`);
  report.handlers.push({variant,...await evaluate('proof.caret.handlers()')});if(variant==='background')await evaluate('proof.caret.stopBackground()');
 }
 await evaluate('proof.caret.apply();proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:0})');await evaluate('proof.caret.ready()');
 await key('ArrowRight');report.trailing=await evaluate('proof.caret.inspect()');await key('ArrowLeft');report.leading=await evaluate('proof.caret.inspect()');await key('ArrowRight',8);report.selection=await evaluate('proof.caret.inspect()');
 check('native keyboard trailing boundary',report.trailing.logical.head===1&&Math.abs(report.trailing.native.x-report.trailing.cell.x-report.trailing.cell.w)<.15);
 check('native keyboard leading boundary',report.leading.logical.head===0&&Math.abs(report.leading.native.x-report.leading.cell.x)<.15);
 report.grid=[];for(const point of await evaluate('proof.caret.grid()')){await click(point);const state=await evaluate('proof.caret.inspect()');report.grid.push({point,state});check('native pointer '+point.expected,state.logical.head===point.expected);}
 report.stress=[];for(const count of (process.env.SKIP_STRESS?[]:[1,10,50,100])){const result=await evaluate(`proof.caret.loadingStress(${count},${1000+count*100})`);report.stress.push(result);check('distinct loading stress '+count,result.ready===count&&result.generated===count&&result.peakQueued<=64&&result.peakBytes<=16*1024*1024,result);}
 await evaluate('proof.caret.apply();proof.mount.focus();proof.mount.restoreInlineSelection({anchor:1,head:1});proof.before=proof.mount.captureText()');await evaluate('proof.caret.ready()');
 await send('Input.imeSetComposition',{text:'漢',selectionStart:1,selectionEnd:1},sessionId);check('IME preedit suspends artwork',await evaluate('!proof.flow.firstElementChild.hasAttribute("data-character-surface")'));
 await send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0},sessionId);await evaluate('new Promise(r=>setTimeout(r,100))');check('IME cancellation restores artwork and source',await evaluate('proof.flow.firstElementChild.hasAttribute("data-character-surface")&&proof.mount.captureText()===proof.before'));
 report.extended=await evaluate('proof.caret.extended()');report.checks.push(...report.extended.checks);

 report.renderStats=await evaluate("JSON.parse(JSON.stringify(proof.editor.initialis.service.stats))");
 // Fresh renderer services exercise real same-origin module worker failures.
 report.failures=[];
 for(const mode of ['font','webgl','worker']){
  await evaluate(`(async()=>{proof.caret.plain();proof.editor.initialis.service.dispose();const {InitialisService}=await import('/src/features/initialis/service.ts');proof.editor.initialis.service=new InitialisService(()=>new Worker('/__${mode==='worker'?'fail':mode+'-fail'}-worker.mjs',{type:'module'}));proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:0});})()`);
  await key('ArrowRight',8);const before=await evaluate('proof.editor.repository.state.revision');await key(';',2);await key('i');await wait('proof.editor.initialis.service.stats.failures===1');
  const result=await evaluate('({surface:proof.flow.firstElementChild.hasAttribute("data-character-surface"),text:proof.mount.captureText(),properties:proof.editor.node(proof.text.key).payload.standoffProperties.filter(p=>p.type==="style/character-surface").length,stats:proof.editor.initialis.service.stats,revision:proof.editor.repository.state.revision})');report.failures.push({mode,...result});
  check(mode+' failure keeps text/property and makes no completion edit',!result.surface&&result.properties===1&&result.revision===before+1);
  await key('z',4);check(mode+' failure is still undoable',await evaluate('!proof.editor.node(proof.text.key).payload.standoffProperties.some(p=>p.type==="style/character-surface")'));
 }
 report.assetRequests=assetRequests;
 report.stats=await evaluate('proof.editor.initialis.service.stats');report.errors=errors;
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({path:report.path,checks:report.checks.length,failures:report.checks.filter(c=>!c.passed),stress:report.stress,errors},null,2));
 assert.equal(report.checks.filter(c=>!c.passed).length,0);assert.equal(errors.length,0);
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
