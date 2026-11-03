import {createSignal} from 'solid-js';
import {clone} from '../../block-tree/clone';
import {glossChangeFor,glossOwner} from '../../block-tree/gloss-plan';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {TextRangeSnapshot} from '../../runtime/text-ranges';
import type {RepositoryOperation,JsonObject} from '../../block-tree/types';
import {wordSelection} from '../../input/word-selection';
import {GLOSS,glossDefinition,parseGloss,starterTypes} from './model';
import './style.css';
interface Draft {key:string;owner:string;range?:TextRangeSnapshot;selection?:{anchor:number;head:number};anchorElement?:HTMLElement;id?:string;previous?:string;raw:string;viewId:string}
export class GlossController {
 readonly status=createSignal('');readonly notice=this.status[0];
 private draft?:Draft;private closeUI?:()=>void;private releases:(()=>void)[]=[];
 private evidence={locationOf:(key:string)=>this.editor.repository.locationOf(key),ownedKeys:(key:string)=>this.editor.repository.ownedPlacementKeys(key)};
 constructor(private editor:ReactiveEditor){
  this.releases.push(editor.commandRegistry.register<{selection?:{anchor:number;head:number}}>({id:'gloss.create',label:'Create Gloss',canExecute:({targetKey})=>editor.features.glossMode&&editor.node(targetKey)?.viewType==='standoff-editor-block',execute:({targetKey,args})=>{this.open(targetKey,args?.selection);}},'gloss'));
  if(editor.features.glossMode)this.releases.push(editor.visualEffects.registerType({type:GLOSS,renderers:[{id:'gloss-marker',name:'css-class',params:{classes:['mutable-gloss-anchor']}}]}));
 }
 private owner(key:string){return glossOwner(this.editor.repository.readState(),key,this.evidence);}
 private documentFor(key:string){const seen=new Set<string>();let n=this.editor.node(key);while(n&&!seen.has(n.key)){seen.add(n.key);if(n.viewType==='document-block')return n.contentKey;n=this.editor.projections.get(n.viewId)?.parentOf(n.key);}return;}
 /** Bounded canonical definition lookup, also used by existing annotation consumers. */
 resolveContent(p:JsonObject,contentKey?:string):JsonObject {
  if(!this.editor.features.glossMode)return {...p,isDeleted:true};
  const owner=contentKey&&this.owner(contentKey);
  const d=owner&&(this.editor.repository.state.contents[owner]?.payload.linkedAnnotations as any)?.[String(p.annotationId)];
  return glossDefinition(d)?{...p,...d,id:p.id,annotationId:p.annotationId,start:p.start,end:p.end,isDeleted:!!p.isDeleted||!!d.isDeleted}:{...p,isDeleted:true};
 }
 resolve(p:JsonObject,key:string):JsonObject {
  const n=this.editor.node(key),owner=n&&this.owner(n.contentKey);
  if(!owner||this.documentFor(key)!==owner)return {...p,isDeleted:true};
  return this.resolveContent(p,n?.contentKey);
 }
 target(key:string,selection?:{anchor:number;head:number}) {
  const n=this.editor.node(key),h=this.editor.mounts.get(key);if(!n||!h||n.viewType!=='standoff-editor-block')throw Error('Select text in a Document first.');
  if(this.editor.crossText.range()||(this.editor.selections.sets[key]?.items.length??0)>1)throw Error('Gloss creation currently supports one range in one TextBlock.');
  const owner=this.owner(n.contentKey);if(!owner||this.documentFor(key)!==owner)throw Error('Glosses cannot annotate Blocks borrowed from another Document.');
  const saved=selection??h.captureInlineSelection?.();if(!saved)throw Error('Select text or place the caret inside a word.');
  let start=Math.min(saved.anchor,saved.head),end=Math.max(saved.anchor,saved.head);
  if(start===end){const text=n.inlineContent.map(k=>String(this.editor.node(k)?.payload.text??'')).join(''),word=wordSelection(text)(start);
   const chars=[...text];if(start<word.start||start>=word.end||!/[\p{L}\p{N}\p{Mark}]/u.test(chars[start]??'')||!/[\p{L}\p{N}]/u.test(chars.slice(word.start,word.end).join('')))throw Error('Place the caret inside a word, or select text.');
   start=word.start;end=word.end;
  }
  return {owner,selection:{...saved},range:this.editor.textRanges.snapshot(key,start,end),viewId:n.viewId};
 }
 open(key:string,selection?:{anchor:number;head:number},id?:string) {
  if(!this.editor.features.glossMode)return false;
  if(this.draft){this.status[1]('Commit or cancel the open Gloss first.');document.querySelector<HTMLTextAreaElement>('.gloss-input textarea')?.focus();return false;}
  try {const target=this.target(key,selection),def=id?(this.editor.repository.state.contents[target.owner].payload.linkedAnnotations as any)?.[id]:undefined;
   if(id&&(!glossDefinition(def)||def.isDeleted))throw Error('This Gloss is no longer available.');
   this.draft={key,...target,id,previous:def?JSON.stringify(def):undefined,raw:def?.value??''};this.status[1]('');this.show();return true;
  }catch(error){this.status[1](error instanceof Error?error.message:String(error));return false;}
 }
 click(key:string,event:MouseEvent){
  if(!this.editor.features.glossMode||event.defaultPrevented||event.detail>1||this.draft)return;
  const mount=this.editor.mounts.get(key);if(!mount?.focusElement.contains(event.target as Node))return;
  const openAt=()=>{
   if(this.draft||this.editor.mounts.get(key)!==mount||!mount.root.isConnected)return;
   const selection=mount.captureInlineSelection?.();if(!selection||selection.anchor!==selection.head)return;
   const at=mount.inlinePointAt?.(event.clientX,event.clientY)??selection.head;
   const p=(this.editor.node(key)?.payload.standoffProperties as any[]??[]).find(p=>p.type===GLOSS&&!this.resolve(p,key).isDeleted&&p.start<=at&&p.end>=at);
   if(p){event.stopPropagation();this.open(key,{anchor:p.start,head:p.end+1},p.annotationId);}
  };
  const selection=mount.captureInlineSelection?.();
  // Chrome collapses a previously selected range after dispatching click. Read
  // it after that default action; a real drag selection remains non-collapsed.
  if(selection&&selection.anchor!==selection.head)mount.root.ownerDocument.defaultView?.requestAnimationFrame(openAt);else openAt();
 }
 /** Existing unanchored definitions use the same draft UI and canonical commit. */
 openDefinition(rootKey:string,id:string,invoker?:HTMLElement,show=true){
  if(!this.editor.features.glossMode||this.draft){this.status[1]('Commit or cancel the open Gloss first.');return false;}
  const root=this.editor.node(rootKey),def=root&&(this.editor.repository.readState().contents[root.contentKey]?.payload.linkedAnnotations as any)?.[id];
  if(root?.viewType!=='document-block'||!glossDefinition(def)||def.isDeleted)return false;
  this.draft={key:rootKey,owner:root.contentKey,viewId:root.viewId,id,previous:JSON.stringify(def),raw:def.value,anchorElement:invoker};this.status[1]('');if(show)this.show();return true;
 }
 deleteDefinition(rootKey:string,id:string,invoker?:HTMLElement){return this.openDefinition(rootKey,id,invoker,false)&&this.commit('',true);}
 commit(raw:string,remove=false):boolean {
  const d=this.draft;if(!d)return false;
  try {
   const e=this.editor;if(d.range)e.textRanges.validate([d.range],'cell');if(this.documentFor(d.key)!==d.owner||d.range&&this.owner(d.range.contentKey)!==d.owner)throw Error('The anchor Document changed. Cancel and select it again.');
   const state=e.repository.readState(),root=state.contents[d.owner],registry=clone(root.payload.linkedAnnotations as Record<string,any>??{});
   if(d.id&&JSON.stringify(registry[d.id])!==d.previous)throw Error('This Gloss changed in another view. Copy your draft before cancelling.');
   const id=d.id??crypto.randomUUID();
   if(d.id){registry[id]={...registry[id],value:remove?registry[id].value:raw,...(remove?{isDeleted:true}:{})};
   } else registry[id]={id,type:GLOSS,value:raw,metadata:{gloss:{version:1,localId:crypto.randomUUID(),links:{}}}};
   const operations:RepositoryOperation[]=[{kind:'put-content',record:{...clone(root),payload:{...clone(root.payload),linkedAnnotations:registry}}}];
   if(!d.id&&d.range){const c=state.contents[d.range.contentKey],props=clone(c.payload.standoffProperties as any[]??[]);
    operations.push({kind:'put-content',annotationOrigins:[...props.map((_,i)=>i),null],record:{...clone(c),payload:{...clone(c.payload),standoffProperties:[...props,{id:crypto.randomUUID(),type:GLOSS,annotationId:id,start:d.range.start,end:d.range.end-1}]}}});
   }
   if(d.id&&!remove&&raw===registry[d.id].value&&d.previous===JSON.stringify(registry[d.id])){this.cancel();return true;}
   if(!glossChangeFor(state,operations,this.evidence))throw Error('Gloss edit could not be safely admitted; no changes made.');
   e.repository.commit(remove?'Delete Gloss':d.id?'Edit Gloss':'Create Gloss',operations);this.cancel();return true;
  }catch(error){this.status[1](error instanceof Error?error.message:String(error));return false;}
 }
 cancel(){const d=this.draft;this.closeUI?.();this.closeUI=undefined;this.draft=undefined;if(d){const h=this.editor.mounts.get(d.key);if(d.selection&&h?.root.isConnected){h.focus();h.restoreInlineSelection?.(d.selection);}else if(d.anchorElement?.isConnected)d.anchorElement.focus({preventScroll:true});}}
 releaseView(viewId:string){if(this.draft?.viewId===viewId)this.status[1]('The anchor view closed. Your draft is retained; copy it or cancel.');}
 private show(){
  const d=this.draft!,h=this.editor.mounts.get(d.key)!,doc=h.root.ownerDocument,win=doc.defaultView!;
  const box=doc.createElement('div');box.className='gloss-input';box.setAttribute('role','dialog');box.setAttribute('aria-label',d.id?'Edit Gloss':'Create Gloss');
  const input=doc.createElement('textarea');input.setAttribute('aria-label','Gloss');input.placeholder='type: your thought';input.value=d.raw;input.rows=2;
  const suggestions=doc.createElement('div');suggestions.className='gloss-suggestions';
  const status=doc.createElement('div');status.className='gloss-draft-status';status.setAttribute('role','status');
  const buttons=doc.createElement('div');buttons.className='gloss-buttons';
  const cancel=doc.createElement('button');cancel.textContent='Close / Cancel';cancel.onclick=()=>this.cancel();buttons.append(cancel);
  if(d.id){const del=doc.createElement('button');del.textContent='Delete Gloss';del.onclick=()=>{if(!this.commit(input.value,true))status.textContent=this.notice();};buttons.append(del);}
  if(d.id&&d.range){
   const activeRange=d.range;const props=(this.editor.node(d.key)?.payload.standoffProperties as any[]??[]).filter(p=>p.type===GLOSS&&!this.resolve(p,d.key).isDeleted&&p.start<activeRange.end&&p.end>=activeRange.start);
   const ids=[...new Set(props.map(p=>p.annotationId))];
   if(ids.length>1){const choose=doc.createElement('select');choose.setAttribute('aria-label','Gloss at this passage');for(const id of ids){const def=(this.editor.repository.readState().contents[d.owner].payload.linkedAnnotations as any)[id];const option=doc.createElement('option');option.value=id;option.textContent=def.value.slice(0,70)||'(empty Gloss)';choose.append(option);}choose.value=d.id;choose.onchange=()=>{const p=props.find(p=>p.annotationId===choose.value)!;this.cancel();this.open(d.key,{anchor:p.start,head:p.end+1},p.annotationId);};box.append(choose);}
  }
  box.append(input,suggestions,status,buttons);doc.body.append(box);
  const highlights:HTMLElement[]=[];let frame=0,alive=true,scrolled=false;
  const position=()=>{frame=0;if(!alive)return;if(!h.root.isConnected){highlights.splice(0).forEach(e=>e.remove());status.textContent='The anchor view closed. Your draft is retained; copy it or cancel.';return;}
   if(!d.range){const r=(d.anchorElement?.isConnected?d.anchorElement:h.root).getBoundingClientRect();box.style.left=`${Math.max(8,Math.min(r.left,win.innerWidth-340))}px`;box.style.top=`${Math.max(8,Math.min(r.bottom+7,win.innerHeight-190))}px`;return;}
   try{this.editor.textRanges.validate([d.range]);}catch{highlights.splice(0).forEach(e=>e.remove());status.textContent='The anchor changed. Copy your draft before cancelling and selecting it again.';return;}
   const origin=h.root.getBoundingClientRect(),scale=origin.width/((h.root instanceof HTMLElement?h.root.offsetWidth:origin.width)||origin.width||1);const rects=this.editor.measurements.retainedRangeRects(d.key,d.range.start,d.range.end,this.editor.repository.readState().contents[d.range.contentKey].revision,origin,scale||1);const last=rects.at(-1);if(!last)return;
   if(!scrolled&&last.bottom>win.innerHeight-220){scrolled=true;const boundary=h.inlineBoundary?.(d.range.end);const cell=boundary?.node.childNodes[Math.max(0,(boundary?.offset??1)-1)];if(cell instanceof Element&&typeof cell.scrollIntoView==='function'){cell.scrollIntoView({block:'center'});schedule();return;}}
   box.style.left=`${Math.max(8,Math.min(rects.find(r=>Math.abs(r.top-last.top)<2)?.left??last.left,win.innerWidth-340))}px`;box.style.top=`${last.bottom+7}px`;
   highlights.splice(0).forEach(e=>e.remove());for(const r of rects){const mark=doc.createElement('div');mark.className='gloss-anchor-active';Object.assign(mark.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});doc.body.append(mark);highlights.push(mark);}
  };
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(position);};
  const types=new Map(starterTypes.map(t=>[t.toLowerCase(),t]));for(const p of Object.values(this.editor.repository.readState().contents[d.owner].payload.linkedAnnotations as Record<string,any>??{}))if(glossDefinition(p)&&!p.isDeleted){const t=parseGloss(p.value).type;if(t)types.set(t.toLowerCase(),t);}
  const suggest=()=>{d.raw=input.value;suggestions.replaceChildren();input.rows=Math.min(5,Math.max(2,input.value.split('\n').length));if(input.value.includes(':'))return;const q=input.value.trim().toLowerCase();for(const type of [...types.values()].filter(t=>!q||t.toLowerCase().startsWith(q)).slice(0,5)){const b=doc.createElement('button');b.type='button';b.textContent=type;b.onpointerdown=e=>e.preventDefault();b.onclick=()=>{input.value=type+': ';suggest();input.focus();};suggestions.append(b);}};
  input.oninput=suggest;let composing=false;input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>composing=false);
  box.onkeydown=e=>{if(e.isComposing||composing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.cancel();}else if(e.target===input&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.stopPropagation();if(!this.commit(input.value))status.textContent=this.notice();}};
  const save=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')status.textContent='Gloss draft is not saved. Press Enter to commit, or cancel.';};
  win.addEventListener('keydown',save,true);win.addEventListener('scroll',schedule,true);win.addEventListener('resize',schedule);const fontChanged=()=>{this.editor.measurements.invalidateRanges(d.key);schedule();};doc.fonts?.addEventListener('loadingdone',fontChanged);
  const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(()=>{this.editor.measurements.invalidateRanges(d.key);schedule();});resize?.observe(h.root);
  const stopChanges=this.editor.repository.subscribeChanges(change=>{if(d.range&&change.previousContents.has(d.range.contentKey))schedule();});
  this.closeUI=()=>{stopChanges();alive=false;if(frame)win.cancelAnimationFrame(frame);resize?.disconnect();win.removeEventListener('keydown',save,true);win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',schedule);doc.fonts?.removeEventListener('loadingdone',fontChanged);box.remove();highlights.forEach(e=>e.remove());};
  suggest();position();input.focus({preventScroll:true});
 }
 dispose(){this.cancel();this.releases.splice(0).forEach(f=>f());}
}
