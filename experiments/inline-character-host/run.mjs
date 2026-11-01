// Bounded research using the real Flint benchmark bootstrap. No production imports.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'artifacts/inline-character-host/direct';await mkdir(artifacts,{recursive:true});
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
 if(url.pathname==='/__late-font'){await new Promise(r=>setTimeout(r,100));res.setHeader('Content-Type','font/ttf');res.end(await readFile('src/assets/fonts/MedievalSharp-Regular.ttf'));return;}
 if(url.pathname==='/__character-benchmark.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('experiments/inline-character-host/browser.js'));return;}
if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
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
 const key=async(key,modifiers=0)=>{const code={ArrowLeft:37,ArrowRight:39,Backspace:8,Delete:46,Enter:13,x:88}[key]??0;for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key==='x'?'KeyX':key,windowsVirtualKeyCode:code,modifiers,...(type==='keyDown'&&key==='x'?{text:'x'}:{})},sessionId);};
 const click=async(point)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1},sessionId);};
 const matrix=[];
 for(const variant of ['spacing']){
  await evaluate(`proof.caret.apply(${JSON.stringify(variant)});proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:0})`);
  await evaluate('proof.caret.ready()');await key('ArrowRight');const after=await evaluate('proof.caret.inspect()');await key('ArrowLeft');const before=await evaluate('proof.caret.inspect()');
  await key('ArrowRight',8);const selection=await evaluate('proof.caret.inspect()');if(['spacing','font-41'].includes(variant)){const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,variant+'-selection.png'),Buffer.from(shot.data,'base64'));}const points=await evaluate('proof.caret.points()');const clicks=[];
  for(const point of points){await click(point);clicks.push(await evaluate('proof.caret.inspect()'));}
  matrix.push({variant,before,after,selection,clicks});
 }
 const report={path:process.env.CARET_PATH??'direct',browser:await send('Browser.getVersion'),matrix,checks:[]};
 const check=(name,passed,details)=>{report.checks.push({name,passed:!!passed,details});};
 await evaluate("proof.caret.apply('spacing');proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:0})");
 await evaluate('proof.caret.ready()');await key('ArrowRight');report.trailing=await evaluate('proof.caret.inspect()');
 const capture=async(name)=>{const shot=await send('Page.captureScreenshot',{format:'png',clip:await evaluate('proof.caret.clip()')},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
 await capture('native-caret');await key('ArrowLeft');await capture('native-leading-caret');await key('ArrowRight',8);await capture('native-selection');
 report.grid=[];for(const point of await evaluate('proof.caret.grid()')){const {expected,...xy}=point;await click(xy);const state=await evaluate('proof.caret.inspect()');report.grid.push({point,state});if(report.grid.length===1)await capture('native-pointer-leading');if(report.grid.length===12)await capture('native-pointer-trailing');check('native pointer '+point.x+','+point.y,state.logical.anchor===expected&&state.logical.head===expected);}
 const points=await evaluate('proof.caret.points()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...points[0],button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...points[3],button:'left',buttons:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...points[3],button:'left',clickCount:1},sessionId);report.drag=await evaluate('proof.caret.inspect()');check('native drag selects Cell',report.drag.logical.anchor===0&&report.drag.logical.head===1);
 report.activation=await evaluate('proof.caret.activation()');
 report.instrumentationCanary=await evaluate(`(async()=>{window.__characterProofCounters={fullValidation:0,broadPlanning:0};const repo=await import('/src/block-tree/repository.ts');repo.planOperations(proof.editor.repository.readState(),[]);const result=window.__characterProofCounters;delete window.__characterProofCounters;return result})()`);assert.equal(report.instrumentationCanary.fullValidation,1);assert.equal(report.instrumentationCanary.broadPlanning,1);
 report.performance=[];report.unrelated=await evaluate('proof.caret.openUnrelated()');
 // Alternate plain/decorated samples in the actual annotated Flint editor.
 for(const variant of ['plain','spacing','plain','spacing','plain','spacing']){
  await evaluate(`proof.caret.${variant==='plain'?'plain()':"apply('spacing')"};proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:100});void 0`);
  if(variant!=='plain')await evaluate('proof.caret.ready()');await evaluate('new Promise(r=>requestAnimationFrame(r))');await evaluate('proof.caret.startCounters()');
  for(let i=0;i<20;i++){await key(i%2?'Backspace':'x');await evaluate('new Promise(r=>requestAnimationFrame(r))');}
  const result=await evaluate('proof.caret.stopCounters()');report.performance.push({variant,...result});check(variant+' bounded commits',result.counts.snapshots===0&&result.counts.projectionBuilds===0&&result.counts.inlineCommits===20&&result.counts.commits===20);check(variant+' original Text node survives typing',result.domRetained);
 }
 report.handlers=[];for(const variant of ['plain','spacing','plain','spacing','plain','spacing']){await evaluate(`proof.caret.${variant==='plain'?'plain()':"apply()"}`);if(variant!=='plain')await evaluate('proof.caret.ready()');report.handlers.push({variant,...await evaluate('proof.caret.handlers()')});}
 await evaluate("proof.caret.apply('spacing');proof.before=proof.mount.captureText()");
 for(const index of [0,1]){await evaluate(`proof.mount.restoreInlineSelection({anchor:${index},head:${index}})`);await key('x');const state=await evaluate('({text:proof.mount.captureText(),identity:proof.caret.original()})');check('insert at '+index,state.text===await evaluate(`proof.before.slice(0,${index})+'x'+proof.before.slice(${index})`));check('insert preserves original Text node '+index,state.identity.domRetained);await evaluate('proof.editor.repository.undo()');check('undo insert '+index,await evaluate('proof.mount.captureText()===proof.before'));await evaluate('proof.editor.repository.redo()');check('redo insert '+index,await evaluate(`proof.mount.captureText()===proof.before.slice(0,${index})+'x'+proof.before.slice(${index})`));await evaluate('proof.editor.repository.undo();proof.caret.refresh()');}
 report.clipboard=await evaluate('proof.caret.clipboard()');report.checks.push(...report.clipboard.checks);
 // Resize and zoom affect native layout; no custom pointer mapping is installed.
 report.layout=[];for(const mode of ['narrow','zoom']){await evaluate(mode==='narrow'?"proof.flow.style.width='180px'":"proof.flow.style.width='';proof.flow.style.zoom='1.25'");await evaluate('new Promise(r=>requestAnimationFrame(r))');const grid=await evaluate('proof.caret.grid()');const samples=[];for(const point of grid){const {expected,...xy}=point;await click(xy);const state=await evaluate('proof.caret.inspect()');samples.push(state);check(mode+' native pointer',state.logical.anchor===expected&&state.logical.head===expected);}report.layout.push({mode,samples});}await evaluate("proof.flow.style.width='';proof.flow.style.zoom=''");
 await evaluate("proof.caret.guards();proof.mount.focus();proof.mount.restoreInlineSelection({anchor:0,head:1})");
 await send('Input.imeSetComposition',{text:'漢',selectionStart:1,selectionEnd:1},sessionId);report.imePreedit=await evaluate('({text:proof.mount.captureText(),composing:proof.mount.composing})');
 await send('Input.insertText',{text:'漢'},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(r))');check('native IME commit',await evaluate("proof.mount.captureText()==='漢'+proof.before.slice(1)"));await evaluate('proof.editor.repository.undo();proof.caret.refresh();proof.caret.apply("spacing")');check('IME undo',await evaluate('proof.mount.captureText()===proof.before'));
 await evaluate('proof.mount.focus();proof.mount.restoreInlineSelection({anchor:1,head:1})');await key('Backspace');check('native Backspace removes one decorated character',await evaluate('proof.mount.captureText()===proof.before.slice(1)'));await evaluate('proof.editor.repository.undo();proof.caret.refresh()');check('deletion Undo',await evaluate('proof.mount.captureText()===proof.before'));
 report.boundaries=[];
 for(const mode of ['paragraph-end','line-end']){await evaluate(`proof.caret.boundaryFixture(${JSON.stringify(mode)})`);await key('ArrowRight');const after=await evaluate('proof.caret.boundaryState()');const clip=await evaluate('proof.caret.boundaryClip()');let shot=await send('Page.captureScreenshot',{format:'png',clip},sessionId);await writeFile(path.join(artifacts,mode+'-trailing.png'),Buffer.from(shot.data,'base64'));await key('ArrowLeft');shot=await send('Page.captureScreenshot',{format:'png',clip},sessionId);await writeFile(path.join(artifacts,mode+'-leading.png'),Buffer.from(shot.data,'base64'));const before=await evaluate('proof.caret.boundaryState()');check(mode+' native trailing',after.logical.head===2&&Math.abs(after.rect.x-after.cell.right)<.15);check(mode+' native leading',before.logical.head===1&&Math.abs(before.rect.x-before.cell.left)<.15);report.boundaries.push({mode,before,after,clip});}
 await evaluate('proof.mount.focus();proof.mount.restoreInlineSelection({anchor:1,head:1});proof.caret.apply()');await evaluate('proof.caret.ready()');
 await send('Input.imeSetComposition',{text:'漢',selectionStart:1,selectionEnd:1},sessionId);check('IME preedit suspends artwork',await evaluate('!proof.flow.firstElementChild.hasAttribute("data-character-surface")'));
 await send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0},sessionId);await evaluate('new Promise(r=>setTimeout(r,100))');check('IME cancel restores source and artwork',await evaluate('proof.mount.captureText()===proof.before&&proof.flow.firstElementChild.hasAttribute("data-character-surface")'));
 report.extended=await evaluate('proof.caret.extended()');report.checks.push(...report.extended.checks);
 report.errors=errors;
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({path:report.path,checks:report.checks.length,failures:report.checks.filter(c=>!c.passed),errors},null,2));
 assert.equal(report.checks.filter(c=>!c.passed).length,0,'All checks pass');assert.equal(errors.length,0,'No uncaught browser errors');
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
