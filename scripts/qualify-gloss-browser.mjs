// Finite browser interaction checks and instrumented orientation timings.
// Owns and cleans up its Vite server, Chrome process and temporary profile.
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const commandQualification = true;
const stageC5=process.env.GLOSS_STAGE==='c5';
const stageC4=process.env.GLOSS_STAGE==='c4';
const stageC3=process.env.GLOSS_STAGE==='c3';
const stageC2=process.env.GLOSS_STAGE==='c2';
const stageC1=process.env.GLOSS_STAGE==='c1';
const stageB=process.env.GLOSS_STAGE==='b'||stageC1||stageC2||stageC3||stageC4||stageC5;
const milestone = process.env.GLOSS_SWITCH_ONLY==='1'?'gloss-popup-switch':stageC5?'gloss-stage-c5-'+(process.env.GLOSS_GRAPH_SIZE||'10'):stageC4?'gloss-stage-c4-'+(process.env.GLOSS_GRAPH_SIZE||'10')+(process.env.GLOSS_GRAPH_DENSE==='1'?'-dense':''):stageC3?'gloss-stage-c3-'+(process.env.GLOSS_GRAPH_SIZE||'10')+(process.env.GLOSS_GRAPH_DENSE==='1'?'-dense':''):stageC2?'gloss-stage-c2'+(process.env.GLOSS_C2_DENSITY==='16'?'-dense':''):stageC1?'gloss-stage-c1':stageB?'gloss-stage-b':process.env.GLOSS_STAGE==='c'?'gloss-stage-c-shortcut':'gloss-stage-a';
const vault=stageB?await mkdtemp(path.join(tmpdir(),'mutable-gloss-vault-')):undefined;
const api=stageB?(await import('express')).default():undefined;
if(api)api.use('/api/native',(await import('../dist/server/native-document-store.mjs')).createNativeDocumentStoreRouter({root:vault}));
const artifactDirectory = path.resolve('artifacts/'+milestone);
await mkdir(artifactDirectory, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), `mutable-${milestone}-`));
let server, chrome, socket;
const interactions = new Set();let profiled=false;
try {
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-tab-orientation', plugins: [solidPlugin(), {
    name: 'tab-orientation-isolated-fixture',
    configureServer(server) { if(api)server.middlewares.use(api);server.middlewares.use((req, res, next) => {
    if (req.url === '/__tab_orientation') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>Tab orientation qualification</title></head><body></body></html>'); }
    else if (req.url?.startsWith('/api/')) { res.statusCode = 503; res.end('Qualification has no backend'); }
    else next();
    }); },
  }], server: { hmr: false, host: '127.0.0.1', port: 0, open: false, proxy: {} } });
  await server.listen();
  const port = server.httpServer.address().port;
  chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Chrome startup timed out')), 15000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.stderr.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data), entry = pending.get(value.id);
    if (entry) { pending.delete(value.id); clearTimeout(entry.timer); value.error ? entry.reject(Error(JSON.stringify(value.error))) : entry.resolve(value.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id, timer = setTimeout(() => { pending.delete(requestId); reject(Error('CDP timeout: ' + method)); }, method==='Runtime.evaluate'?360000:60000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Runtime.enable',{},sessionId);
  await send('Page.enable',{},sessionId);
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Page.javascriptDialogOpening'){console.error('DIALOG',m.params);void send('Page.handleJavaScriptDialog',{accept:false},sessionId);}if(m.method==='Runtime.exceptionThrown')console.error('BROWSER EXCEPTION',m.params.exceptionDetails);});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(process.env.GLOSS_TRACE&&m.method==='Runtime.consoleAPICalled')console.error(new Date().toISOString(),m.params.args.map(a=>a.value??a.description).join(' '));});
  if(stageC3)await send('Browser.grantPermissions',{origin:`http://127.0.0.1:${port}`,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/__tab_orientation` }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 250));
  if(milestone!=='a0') {
    await send('Runtime.addBinding',{name:'tabsInput'},sessionId);
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);if(message.method!=='Runtime.bindingCalled'||message.params.name!=='tabsInput')return;
      const task=(async()=>{
      const action=JSON.parse(message.params.payload);let result;
      try {
        if(action.type==='select'){
          for(const key of action.text){await send('Input.dispatchKeyEvent',{type:'keyDown',key,text:key,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)},sessionId);}

        }
        if(action.type==='composition')await send('Input.imeSetComposition',{text:action.text,selectionStart:action.text.length,selectionEnd:action.text.length},sessionId);
        if(action.type==='text')await send('Input.insertText',{text:action.text},sessionId);
        if(action.type==='paint') { await send('Page.captureScreenshot',{format:'png'},sessionId); }
        if(action.type==='screenshot') {
          const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
          await writeFile(path.join(artifactDirectory,action.name+'.png'),Buffer.from(shot.data,'base64'));
        }
        if(action.type==='disk-proof'){const saved=await readFile(path.join(vault,'gloss-primary.ink'),'utf8');await writeFile(path.join(artifactDirectory,'saved-document.ink'),saved);result={bytes:Buffer.byteLength(saved),contains: saved.includes(action.id)};}
        if(action.type==='wheel')await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:action.x,y:action.y,deltaX:0,deltaY:action.deltaY},sessionId);
        if(action.type==='fixture'){await writeFile(path.join(artifactDirectory,'typing-fixture.mutable.json'),action.text);if(stageB)await writeFile(path.join(vault,'gloss-primary.ink'),action.text);}
        if(action.type==='click') {
          if(action.double) {
            await send('Input.dispatchMouseEvent',{type:'mousePressed',x:action.x,y:action.y,button:action.button??'left',clickCount:1},sessionId);
            await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:action.x,y:action.y,button:action.button??'left',clickCount:1},sessionId);
          }
          await send('Input.dispatchMouseEvent',{type:'mousePressed',x:action.x,y:action.y,button:action.button??'left',clickCount:action.double?2:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:action.x,y:action.y,button:action.button??'left',clickCount:action.double?2:1},sessionId);
        }
        if(action.type==='drag') {
          await send('Input.dispatchMouseEvent',{type:'mousePressed',...action.from,button:action.button??'left',clickCount:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseMoved',...action.to,button:'left',buttons:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',...action.to,button:action.button??'left',clickCount:1},sessionId);
        }
        if(action.type==='viewport')await send('Emulation.setDeviceMetricsOverride',{width:action.width,height:action.height,deviceScaleFactor:action.deviceScaleFactor??1,mobile:false},sessionId);
        const profile=process.env.GLOSS_PROFILE&&!profiled&&action.type==='key'&&action.key==='Enter'&&!action.modifiers;if(profile){profiled=true;await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);}
        if(action.type==='key')for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:action.key,code:action.key.length===1&&/[a-z]/i.test(action.key)?'Key'+action.key.toUpperCase():action.key,...(type==='keyDown'&&action.key==='Enter'?{text:'\r'}:{}),...(type==='keyDown'&&action.text?{text:action.text}:{}),...(type==='keyDown'&&action.key==='a'&&(action.modifiers===4||action.modifiers===2)?{commands:['selectAll']}:{}),modifiers:action.modifiers??0,windowsVirtualKeyCode:({Tab:9,Backspace:8,Escape:27,Enter:13,Home:36,End:35,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40})[action.key]??(action.key.length===1?action.key.toUpperCase().charCodeAt(0):0)},sessionId);
        if(profile){const data=await send('Profiler.stop',{},sessionId);await writeFile('/tmp/gloss-cpu.json',JSON.stringify(data.profile));console.error('PROFILE SAVED');}
        if(action.type==='diagram-action'){
          const target=(await send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe');if(!target)throw Error('Missing diagram frame');
          const attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
          const frameEvaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true},attached.sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
          try{
            if(action.op==='proof')result=await frameEvaluate(`({selected:document.querySelector('.mutable-gloss-selected')?.getAttribute('data-gloss-node'),selectedOutline:document.querySelector('.mutable-gloss-selected')?getComputedStyle(document.querySelector('.mutable-gloss-selected')).outlineStyle:null,focus:document.activeElement?.getAttribute('data-gloss-node'),outline:document.activeElement?getComputedStyle(document.activeElement).outlineStyle:null,nodes:[...document.querySelectorAll('[data-gloss-node]')].map(n=>({token:n.getAttribute('data-gloss-node'),label:n.getAttribute('aria-label'),role:n.getAttribute('role'),tab:n.getAttribute('tabindex')})),unsafe:document.querySelectorAll('svg script,svg foreignObject,svg image,svg a').length,handlers:[...document.querySelectorAll('svg *')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name))),lastTarget:window.lastNodeTarget,lastActivationAt:window.lastActivationAt})`);
            if(action.op==='click'){
              const pos=await frameEvaluate(`(()=>{const el=document.querySelector(${JSON.stringify(action.selector)});if(!el)throw Error('Missing diagram target');el.scrollIntoView({block:'center',inline:'center'});document.addEventListener('click',e=>window.lastNodeTarget=e.target.tagName,{once:true,capture:true});if(!window.activationProbe){window.activationProbe=true;for(const type of ['click','keydown'])document.addEventListener(type,e=>{if(type==='click'||e.key==='Enter'||e.key===' ')window.lastActivationAt=performance.timeOrigin+performance.now();},{capture:true});}const r=el.getBoundingClientRect();return{x:r.x+Math.min(r.width/2,8),y:r.y+Math.min(r.height/2,8)};})()`);
              const framePos=await send('Runtime.evaluate',{expression:`(()=>{const f=document.querySelector('.gloss-graph iframe');const r=f.getBoundingClientRect();return{x:r.x,y:r.y};})()`,returnByValue:true},sessionId);
              await send('Page.captureScreenshot',{format:'png'},sessionId);
              await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x+framePos.result.value.x,y:pos.y+framePos.result.value.y},sessionId);
              for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:pos.x+framePos.result.value.x,y:pos.y+framePos.result.value.y,button:'left',clickCount:1},sessionId);
            }
            if(action.op==='focus-start')await frameEvaluate(`document.activeElement?.blur();document.body.setAttribute('tabindex','-1');document.body.focus()`);
            if(action.op==='forge')await frameEvaluate(`(()=>{const token=window.structuredInput.token;for(const data of [{kind:'gloss-node-select',token:'stale',node:'G1',sequence:900},{kind:'gloss-node-select',token,node:'G999',sequence:900},{kind:'gloss-node-select',token,node:'G1',sequence:0},{kind:'gloss-node-select',token,node:'G1',sequence:900,extra:'bad'}])parent.postMessage(data,'*');})()`);
            if(action.op==='failure')try{await frameEvaluate(`parent.postMessage({token:window.structuredInput.token,error:'Qualification renderer failure'},'*')`);}catch(error){if(!/session|context|target/i.test(String(error)))throw error;}
            if(action.op==='ax')result=(await send('Accessibility.getFullAXTree',{},attached.sessionId)).nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value}));
          }finally{try{await send('Target.detachFromTarget',{sessionId:attached.sessionId});}catch(error){if(action.op!=='failure')throw error;}}
        }
        if(action.type==='diagram-proof'){
          const targets=(await send('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe');const proofs=[];
          for(const target of targets){const attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});try{const r=await send('Runtime.evaluate',{expression:`({svg:!!document.querySelector('svg'),nodes:document.querySelectorAll('g.node').length,nodeTokens:[...document.querySelectorAll('g.node')].slice(0,8).map(n=>({id:n.getAttribute('id'),dataId:n.getAttribute('data-id')})),unsafe:document.querySelectorAll('svg script,svg foreignObject,svg image,svg a,svg iframe').length,events:[...document.querySelectorAll('svg *')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name))),literalMarkup:[...document.querySelectorAll('svg text')].some(t=>t.textContent.includes('<img')),text:[...document.querySelectorAll('svg text')].map(t=>t.textContent).join(' ').slice(0,600),xss:!!window.glossInjected})`,returnByValue:true},attached.sessionId);proofs.push(r.result.value);}finally{await send('Target.detachFromTarget',{sessionId:attached.sessionId});}}
          result={proofs};
        }
        if(action.type==='accessibility')result=(await send('Accessibility.getFullAXTree',{},sessionId)).nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value,properties:n.properties}));
        await send('Runtime.evaluate',{expression:`globalThis.__tabsResume(${JSON.stringify({result})})`},sessionId);
      } catch(error) { await send('Runtime.evaluate',{expression:`globalThis.__tabsResume(${JSON.stringify({error:String(error)})})`},sessionId); }
      })();interactions.add(task);void task.then(()=>interactions.delete(task),()=>interactions.delete(task));
    });
  }
  const result = await send('Runtime.evaluate', {
    expression: `(async()=>{const m=await import('${stageC5?'/src/application/gloss-stage-c5.browser-fixture.tsx':stageC4?'/src/application/gloss-stage-c4.browser-fixture.tsx':stageC3?'/src/application/gloss-stage-c3.browser-fixture.tsx':stageC2?'/src/application/gloss-stage-c2.browser-fixture.tsx':stageC1?'/src/application/gloss-stage-c1.browser-fixture.tsx':stageB?'/src/application/gloss-stage-b.browser-fixture.tsx':'/src/application/gloss.browser-fixture.tsx'}');return m.qualifyGloss(${stageC3||stageC4||stageC5?JSON.stringify({size:Number(process.env.GLOSS_GRAPH_SIZE)||10,dense:process.env.GLOSS_GRAPH_DENSE==='1',switchOnly:process.env.GLOSS_SWITCH_ONLY==='1'}):stageC2?JSON.stringify({density:Number(process.env.GLOSS_C2_DENSITY)||4}):''});})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  // The last input resume can complete the fixture before its own CDP reply.
  // Drain those replies before closing Chrome so no timer/rejected task survives.
  await Promise.all([...interactions]);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  await writeFile(path.join(artifactDirectory,'qualification.json'),JSON.stringify(result.result.value,null,2)+'\n');
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    const force = setTimeout(() => chrome.kill('SIGKILL'), 3000);
    await exited; clearTimeout(force);
  }
  await server?.close();
  if(vault)await rm(vault,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  await rm(profile, { recursive: true, force: true, maxRetries:5, retryDelay:200 });
}

// The finite qualification has awaited artifacts, input replies and cleanup.
// Do not retain a Vite/esbuild helper handle after the browser has exited.
await new Promise(resolve=>process.stdout.write('',resolve));
process.exit(0);
