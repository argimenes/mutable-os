import { render } from 'solid-js/web';
import { ReactiveEditor } from '../../src/reactive-editor/editor';
import { registerApplicationViews } from '../../src/application/features';
import { ReactiveTreeView } from '../../src/rendering/reactive-tree-view';
import { runInterchange } from '../../src/runtime/interchange-worker';
import { admitNative } from '../../src/persistence/native-resource';
import small from '../../src/interchange/tei/fixtures/A040080.xml?raw';
import large from '../../src/interchange/tei/fixtures/A041209.xml?raw';
import '../../src/assets/reset.css';
import '../../src/index.css';
import '../../src/features/flint/flint.css';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
const sources = {small, large, anthology: large.replace('</body>', Array.from({length:12},(_,i)=>`<div n="${i}"><head>Correspondence section ${i+1}</head>` + Array.from({length:20},()=>'<p>A letter records a place, a date, and a reading. <persName ref="#missing">The correspondent</persName> retained the original wording, including <del>deleted</del> and <add>added</add> passages, for later scholarly interpretation.</p>').join('') + '</div>').join('')+'</body>')};
let cleanup = () => {};
(window as any).teiCleanup = () => { cleanup(); cleanup = () => {}; };
(window as any).teiPerformance = async (name: keyof typeof sources) => {
 cleanup();
 const editor = new ReactiveEditor({id:'performance-workspace',type:'workspace-block',children:[{id:'performance-bank',type:'workspace-object-bank-block',children:[]}]});
 registerApplicationViews(editor);
 const bank = Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!;
 const host = document.body.appendChild(document.createElement('div'));host.style.cssText='width:900px;margin:auto';
 const memory = () => (performance as any).memory?.usedJSHeapSize;
 const heapBefore = memory(), start=performance.now();
 const result = await runInterchange({kind:'tei-document',file:{name:name+'.tei',blob:new Blob([sources[name]])},profile:true},new AbortController().signal);
 const received=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'worker',...result.stats,counts:result.counts,timings:result.timings,workerMs:(result as any).workerMs,workerRoundTripMs:received-start,transferAndDispatchMs:performance.timeOrigin+received-(result as any).sentAt}));
 const admissionTimings:Record<string,number>={};
 const admission=admitNative(editor.repository,result.bytes,bank.key,admissionTimings),admitted=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'admission',ms:admitted-received,admissionTimings}));
 const projection=editor.createView(undefined,admission.placementKey),projected=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'projection',ms:projected-admitted}));
 const stop=render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host);editor.installGateway(document);
 await frame();const usable=performance.now(),heapMounted=memory();
 const pageCount=host.querySelectorAll('.reactive-page').length;
 const node=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>10&&editor.mounts.get(n.key))!;
 const mount=editor.mounts.get(node.key)!;mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0,0);
 const flow=document.activeElement as HTMLElement;
 const samples:number[]=[];const before=flow.textContent;let snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot();};
 for(let i=0;i<(name==='anthology'?0:3);i++) {let t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'}));samples.push(performance.now()-t);await frame();t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));samples.push(performance.now()-t);await frame();}
 samples.sort((a,b)=>a-b);
 const restored=flow.textContent===before;
 const metadataStart=performance.now();[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(e=>e.textContent==='Metadata')!.click();await frame();const metadataMs=performance.now()-metadataStart;
 cleanup=()=>{stop();editor.dispose();host.remove();};
 return {name,sourceBytes:new TextEncoder().encode(sources[name]).length,...result.stats,counts:result.counts,nativeBytes:result.bytes.length,timings:result.timings,workerMs:(result as any).workerMs,workerRoundTripMs:received-start,transferAndDispatchMs:performance.timeOrigin+received-(result as any).sentAt,admissionMs:admitted-received,admissionTimings,projectionMs:projected-admitted,renderMs:usable-projected,usableMs:usable-start,metadataMs,pageCount,truncated:result.truncated,heapBefore,heapMounted,heapMetadata:memory(),typing:{samples:samples.length,medianMs:samples[3],p95Ms:samples[5],maxMs:samples[5],snapshots,restored,before:before?.slice(0,80),after:flow.textContent?.slice(0,80)}};
};
// Separate CPU-profile entry: same preparation code, on the main thread only
// so CDP can sample it. Never used for end-to-end browser timing claims.
(window as any).teiPreparationProfile = async (name: keyof typeof sources) => {
 const {prepareTeiDocument}=await import('../../src/interchange/tei/native');
 const result=await prepareTeiDocument({name:name+'.tei',blob:new Blob([sources[name]])},{},true);
 return {timings:result.timings,counts:result.counts};
};

/** Full Flint lifecycle companion to the isolated stage probe above. */
(window as any).teiFlintPerformance = async (name: keyof typeof sources) => {
 cleanup();cleanup=()=>{};
 const {materializeLocalWorkspace}=await import('../../src/reactive-editor/workspace-manifest');
 const {documentApplicationPorts}=await import('../../src/application/document-application-ports');
 const {nativeDocumentSession}=await import('../../src/persistence/native-session');
 const editor=new ReactiveEditor(materializeLocalWorkspace({id:'flint-performance-workspace',type:'workspace-block',children:[]}));
 registerApplicationViews(editor);const workspace=editor.createView('performance-workspace');
 editor.commandRegistry.execute('flint.open',{targetKey:workspace.state.rootKey,args:undefined});
 const host=document.body.appendChild(document.createElement('div'));
 const stop=render(()=><ReactiveTreeView editor={editor} projection={workspace}/>,host);editor.installGateway(document);await frame();
 const app=documentApplicationPorts(editor).ports()[0]?.application;
 if(!app)throw Error('Flint application port was not mounted');
 const session=nativeDocumentSession(editor);
 const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block')!;
 const memory=()=>(performance as any).memory?.usedJSHeapSize;
 const heapBefore=memory(),start=performance.now();
 const result=await runInterchange({kind:'tei-document',file:{name:name+'.tei',blob:new Blob([sources[name]])},profile:true},new AbortController().signal);
 const received=performance.now();console.debug('TEI_STAGE',JSON.stringify({name,stage:'worker',timings:result.timings,counts:result.counts,...result.stats,workerMs:(result as any).workerMs,workerRoundTripMs:received-start}));
 const admissionTimings:Record<string,number>={};
 admitNative(editor.repository,result.bytes,bank.key,admissionTimings);const admitted=performance.now();
 console.debug('TEI_STAGE',JSON.stringify({name,stage:'admission',ms:admitted-received,admissionTimings}));
 session.trackCandidate(result.id);const candidate=performance.now();console.debug('TEI_STAGE',JSON.stringify({name,stage:'candidate',ms:candidate-admitted}));
 let projectionMs=0;const createView=editor.createView.bind(editor);
 editor.createView=(...args:Parameters<typeof createView>)=>{const t=performance.now(),p=createView(...args);projectionMs+=performance.now()-t;return p;};
 app.openDocument(result.id);await frame();const usable=performance.now();
 const view=[...editor.projections.values()].find(p=>p!==workspace&&p.state.nodes[p.state.rootKey]?.payload.id===result.id);
 if(!view)throw Error('Imported document did not open in Flint');
 const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>10&&editor.mounts.get(n.key))!;
 const mount=editor.mounts.get(node.key)!;mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0,0);
 const flow=document.activeElement as HTMLElement,before=flow.textContent;let snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot();};
 const samples:number[]=[];
 for(let i=0;i<(name==='anthology'?0:3);i++){let t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'}));samples.push(performance.now()-t);await frame();t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));samples.push(performance.now()-t);await frame();}
 samples.sort((a,b)=>a-b);const restored=flow.textContent===before,heapMounted=memory();
 const metadataStart=performance.now();[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent==='Metadata'&&!b.closest('[hidden]'))!.click();await frame();const metadataMs=performance.now()-metadataStart;
 const pageCount=Object.values(view.state.nodes).filter(n=>n.viewType==='page-block').length;
 cleanup=()=>{stop();editor.dispose();host.remove();};
 return {name,host:'Flint application',sourceBytes:new TextEncoder().encode(sources[name]).length,...result.stats,counts:result.counts,nativeBytes:result.bytes.length,timings:result.timings,workerMs:(result as any).workerMs,workerRoundTripMs:received-start,transferAndDispatchMs:performance.timeOrigin+received-(result as any).sentAt,admissionMs:admitted-received,admissionTimings,candidateMs:candidate-admitted,projectionMs,openAndRenderMs:usable-candidate,usableMs:usable-start,metadataMs,pageCount,truncated:result.truncated,candidate:session.isCandidate(result.id),dirty:session.isDirty(result.id),heapBefore,heapMounted,heapMetadata:memory(),typing:{samples:samples.length,medianMs:samples[3],p95Ms:samples[5],snapshots,restored}};
};
