import {render} from 'solid-js/web';
import {createRoot,createEffect} from 'solid-js';
import {createWorkspaceOpenControls} from '../demo/workspace-open-controls';
import {WorkspaceSession} from './workspace-session';
import {WorkspacePresentationView} from './workspace-presentation-view';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {nativeDocumentSession} from '../persistence/native-session';
import {captureNative,nativeText,decodeNative} from '../persistence/native-resource';
import {createAutocompleteFeature} from '../features/autocomplete';
import {packageFragment,materializePackage} from '../interchange/package/native';
import '../index.css';import '../demo/workspace-demo.css';
const pause=()=>new Promise(r=>setTimeout(r,12));
async function until(fn:()=>unknown,label:string){const limit=performance.now()+10000;while(!fn()){if(performance.now()>limit)throw Error(label);await pause();}}
async function trusted(action:Record<string,unknown>):Promise<any>{console.log('INPUT',action.type,action.key??'');return new Promise((resolve,reject)=>{(globalThis as any).__tabsResume=(v:any)=>v.error?reject(Error(v.error)):resolve(v.result);(globalThis as any).tabsInput(JSON.stringify(action));});}
async function click(el:Element){el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();await trusted({type:'click',x:r.x+r.width/2,y:r.y+r.height/2});}
function resource(id:string,count:number,glosses:boolean){const definitions:any={};const children=Array.from({length:count},(_,i)=>{const properties:any[]=[{id:`bold-${i}`,type:'style/bold',start:10,end:20}];if(glosses)for(let j=0;j<5;j++){const g=`g-${i}-${j}`;definitions[g]={id:g,type:'mutable/gloss',value:'note: Existing interpretation '+g,metadata:{gloss:{version:1,localId:g,links:{}}}};properties.push({id:'seg-'+g,type:'mutable/gloss',annotationId:g,start:30+j*20,end:40+j*20});}return {id:id+'-p'+i,type:'standoff-editor-block',text:('Alpha beta gamma delta. Text remains editable and annotated. ').repeat(16).slice(0,900),standoffProperties:properties};});
 const e=new ReactiveEditor({id,type:'document-block',metadata:{documentId:id,title:id},linkedAnnotations:definitions,children});try{return nativeText(captureNative(e.repository.readState(),id));}finally{e.dispose();}}
export async function qualifyGloss(){
 const checks:string[]=[],timings:any[]=[],check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push(label);console.log('PASS',label);};
 const resources=new Map([['gloss-primary',resource('gloss-primary',30,true)],['gloss-other',resource('gloss-other',16,false)]]);
 await trusted({type:'fixture',text:resources.get('gloss-primary')});
 const originalFetch=window.fetch;let requests=0,saves=0,lastSaved='';
 window.fetch=(async(url,init)=>{requests++;const body=init?.body?JSON.parse(String(init.body)):{};const ok=(Data:any)=>new Response(JSON.stringify({Success:true,Data}),{headers:{'Content-Type':'application/json'}});
  if(String(url)==='/api/native/vault/default')return ok({vault:undefined});
  if(String(url)==='/api/native/open'){const id=body.location.filename.replace('.ink','');return ok({kind:'native',resourceId:id,native:resources.get(id),baseline:{nativeHash:'fixture-'+id,markdownHash:null,generation:null},readOnly:false});}
  if(String(url)==='/api/native/save'){saves++;lastSaved=body.generation.native;return ok({result:{phase:'saved',generation:body.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:body.generation.generation}});}
  return new Response(JSON.stringify({Success:false,Error:'Isolated browser qualification'}),{status:503});}) as typeof fetch;
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'canvas-background-block',children:[]},{type:'workspace-object-bank-block',children:[]}]}),{features:{nativeKnowledge:false,sqliteKnowledge:false,entityReferences:false,desktopApplicationIcons:false,flintMaterialChrome:false,flintProbe:false}}),e=session.editor,native=nativeDocumentSession(e);
 const Controls=()=>{const controls=createWorkspaceOpenControls(session,()=>true);return <controls.Dialogs/>;};
 const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';host.dataset.windowWorkArea='';const dispose=render(()=><><WorkspacePresentationView session={session}/><Controls/></>,host),input=e.installGateway(document),cleanup:(()=>void)[]=[];
 try {
  for(const id of resources.keys())await native.open({folder:'.',filename:id+'.ink'});
  await e.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});if(!e.completionInput)e.featureHost.activate(createAutocompleteFeature(e));
  await until(()=>host.querySelector('[data-block-id="gloss-primary-p0"] .reactive-standoff-flow'),'Flint text mount');await document.fonts.ready;
  const flow=()=>host.querySelector<HTMLElement>('[data-block-id="gloss-primary-p0"] .reactive-standoff-flow')!;
  const key=()=>e.mounts.resolveElement(flow())!.nodeKey;
  const select=async(a=2,b=a)=>{flow().children[a].scrollIntoView({block:'center'});const r=flow().children[a].getBoundingClientRect();if(a===b)await trusted({type:'click',x:r.left+.2,y:r.top+r.height/2});else{const t=flow().children[b-1].getBoundingClientRect();await trusted({type:'drag',from:{x:r.left+.2,y:r.top+r.height/2},to:{x:t.right-.2,y:t.top+t.height/2}});}check(e.mounts.get(key())?.captureInlineSelection?.()?.anchor===a,'Trusted caret/selection start '+a);};
  const root=Object.values(e.repository.readState().contents).find(c=>c.payload.id==='gloss-primary')!,defs=()=>e.repository.readState().contents[root.key].payload.linkedAnnotations as any;
  const counters={snapshots:0,builds:0,unrelatedUpdates:0},canonicalTimings:{label:string;ms:number}[]=[];const commit=e.repository.commit.bind(e.repository);e.repository.commit=(...args)=>{const start=performance.now();try{return commit(...args);}finally{canonicalTimings.push({label:args[0],ms:performance.now()-start});}};
  const patch=(o:any,name:string,c:keyof typeof counters)=>{const old=o[name];o[name]=function(...args:any[]){counters[c]++;return old.apply(this,args);};cleanup.push(()=>o[name]=old);};
  patch(e.repository,'snapshot','snapshots');for(const view of e.projections.values())patch(view,'build','builds');
  const unrelated=Object.values(session.projection.state.nodes).find(n=>n.payload.id==='gloss-other')!,other=e.createView('gloss-unrelated',unrelated.placementKey);patch(other,'setState','unrelatedUpdates');
  const reset=()=>{counters.snapshots=counters.builds=counters.unrelatedUpdates=0;requests=0;};
  const measure=async(name:string,act:()=>Promise<void>,ready:()=>unknown)=>{const start=performance.now();await act();await until(ready,name);const dom=performance.now()-start;await trusted({type:'paint'});timings.push({name,dispatchToDOMMs:dom,dispatchToScreenshotMs:performance.now()-start});console.log('TIMING',JSON.stringify(timings.at(-1)));};
  check(!e.bindings.conflicts('gloss.create',e.bindings.effective('gloss.create')).length,'Gloss shortcuts have no runtime binding conflicts');
  await select();reset();
  await measure('Cmd/Ctrl+G to focused textbox',()=>trusted({type:'key',key:'g',modifiers:/Mac|iPhone|iPad|iPod/i.test(navigator.platform)?4:2}),()=>document.activeElement?.matches('.gloss-input textarea'));
  const textarea=()=>document.querySelector<HTMLTextAreaElement>('.gloss-input textarea')!;
  check(textarea().value==='','Caret opens an empty draft');check(!native.isDirty('gloss-primary'),'Opening draft does not dirty Document');
  await measure('draft keystroke to visible input',()=>trusted({type:'key',key:'e',text:'e'}),()=>textarea()?.value==='e');await trusted({type:'text',text:'ntity: philosophical sense: not a database object'});await trusted({type:'screenshot',name:'gloss-textbox'});await click(flow().children[200]);check(!!textarea()&&textarea().value.includes('object'),'Outside click retains draft');await click(textarea());
  check(Object.keys(defs()).length===150,'Draft typing creates no definition');
  await trusted({type:'key',key:'Enter',modifiers:8});check(textarea().value.includes('\n'),'Shift+Enter inserts newline');
  const stableCells=[...e.node(key())!.inlineContent],markerCount=()=>e.mounts.get(key())!.root.querySelectorAll('.mutable-gloss-anchor').length;const existingMarkers=markerCount();check(existingMarkers>0,'Existing Gloss markers painted');
  await measure('Enter to marker',()=>trusted({type:'key',key:'Enter'}),()=>!document.querySelector('.gloss-input')&&Object.keys(defs()).length===151&&markerCount()>existingMarkers);
  const id=Object.keys(defs()).find(id=>!id.startsWith('g-'))!;check(defs()[id].value.includes('sense: not'),'First colon preserves later colon');check(e.node(key())!.inlineContent.every((c,i)=>c===stableCells[i]),'Cells preserved');check(native.isDirty('gloss-primary')&&!native.isDirty('gloss-other'),'Only owning Document dirty');check(e.mounts.get(key())!.captureInlineSelection!()?.anchor===2,'Caret restored after commit');
  await until(()=>flow().children[0].classList.contains('mutable-gloss-anchor'),'Gloss marker rendered');
  const glyph=flow().children[2];await measure('marker click to edit',()=>click(glyph),()=>textarea()?.value.includes('philosophical'));
  await trusted({type:'key',key:'a',modifiers:4});await trusted({type:'text',text:'question: edited'});
  check(textarea().value==='question: edited','Trusted Select All replaced textarea value: '+textarea().value);
  await measure('edit commit',()=>trusted({type:'key',key:'Enter'}),()=>defs()[id].value==='question: edited');
  await measure('Undo',()=>trusted({type:'key',key:'z',modifiers:4}),()=>defs()[id].value.includes('philosophical'));
  await measure('Redo',()=>trusted({type:'key',key:'z',modifiers:12}),()=>defs()[id].value==='question: edited');
  await click(flow().children[2]);await until(()=>textarea(),'Edit reopen');
  await measure('Delete Gloss',()=>click([...document.querySelectorAll('.gloss-input button')].find(b=>b.textContent==='Delete Gloss')!),()=>defs()[id].isDeleted&&markerCount()===existingMarkers);
  await trusted({type:'key',key:'z',modifiers:4});check(!defs()[id].isDeleted,'Delete Undo restores definition');
  check(counters.snapshots===0&&counters.builds===0&&counters.unrelatedUpdates===0,'Create/edit/delete/Undo/Redo bounded');check(requests===0,'No network requests during Gloss interactions');
  const bounded={...counters,requests},authoringTimings=[...canonicalTimings];
  await select(6,10);const button=host.querySelector('[data-command="gloss.create"]')??[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Create Gloss'));check(button,'Toolbar action exists');await click(button!);await until(()=>textarea(),'Toolbar focus');
  await trusted({type:'text',text:'note: unfinished draft'});await trusted({type:'key',key:'s',modifiers:4});await until(()=>saves>0,'Manual Save while draft');check(!!textarea()&&textarea().value.includes('unfinished'),'Save retains draft');check(!lastSaved.includes('unfinished draft'),'Save excludes draft');check(document.querySelector('.gloss-draft-status')?.textContent?.includes('not saved'),'Save shows draft notice');
  await trusted({type:'key',key:'Escape'});check(!document.querySelector('.gloss-input'),'Escape cancels');
  await select(7);reset();await trusted({type:'text',text:'/'});await until(()=>document.querySelector('.autocomplete-workstation input'),'Command Bar query');await trusted({type:'text',text:'gloss'});await pause();await trusted({type:'key',key:'Enter'});await until(()=>textarea(),'Slash Gloss focus');check(!flow().textContent?.includes('/gloss'),'Command Bar preserves original prose');await trusted({type:'text',text:'unfamiliar: new type'});await trusted({type:'key',key:'Enter'});
  check(Object.values(defs()).some((d:any)=>d.value==='unfamiliar: new type'),'Unfamiliar type accepted');check(!requests&&!counters.snapshots&&!counters.builds,'Slash authoring bounded');
  await select(13);await trusted({type:'key',key:';',modifiers:2});await trusted({type:'key',key:'g'});await until(()=>textarea(),'Composition draft');await trusted({type:'text',text:'unf'});const suggestion=[...document.querySelectorAll('.gloss-suggestions button')].find(b=>b.textContent==='unfamiliar');check(suggestion,'Autocomplete includes current Document types');await click(suggestion!);check(textarea().value==='unfamiliar: ','Autocomplete inserts prefix');await trusted({type:'composition',text:'解釈'});check(!!textarea(),'IME composition does not commit');await trusted({type:'key',key:'Enter'});check(!!textarea(),'IME confirmation Enter does not commit');await trusted({type:'text',text:'解釈'});check(!!textarea(),'IME text confirmation does not commit');await click([...document.querySelectorAll('.gloss-input button')].find(b=>b.textContent==='Close / Cancel')!);check(!document.querySelector('.gloss-input'),'Close/Cancel discards composition draft');
  // A second mounted occurrence of this same Document retains all markers without copying definitions.
  const duplicate=e.createView('gloss-shared',Object.values(session.projection.state.nodes).find(n=>n.payload.id==='gloss-primary')!.placementKey);check(Object.values(duplicate.state.nodes).some(n=>n.payload.id==='gloss-primary-p0'),'Second occurrence shares content');duplicate.dispose();
  e.commands.replaceInlineRange(key(),0,5,'');check(!!defs()[id],'Last-anchor deletion retains definition');e.repository.undo();
  const snapshot=captureNative(e.repository.readState(),'gloss-primary'),round=decodeNative(new TextEncoder().encode(nativeText(snapshot)));check(JSON.stringify(round).includes('unfamiliar: new type'),'Native save/reload preserves content');
  const fragment=packageFragment(snapshot),copy=materializePackage(fragment,undefined,[],{data:{kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[],provenance:{},selection:{},unresolved:[],excluded:[]} as any,schema:{},source:{}});check(JSON.stringify(copy).includes(defs()[id].metadata.gloss.localId),'Package preserves logical Gloss ID');
  await trusted({type:'screenshot',name:'normal-gloss-markers'});
  return {checks,passed:checks.length,timings,canonicalTimings:authoringTimings,bounded,documents:2,primaryCharacters:27000,seedGlosses:150,note:'Trusted CDP input in the actual Flint shell. Screenshot completion proves rendering and is a conservative latency upper bound including protocol/capture overhead; DOM completion is reported separately. Save transport is isolated in memory.'};
 }finally{cleanup.reverse().forEach(f=>f());input();dispose();session.dispose();host.remove();window.fetch=originalFetch;}
}
