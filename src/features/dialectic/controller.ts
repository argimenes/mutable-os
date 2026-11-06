import {batch,createMemo,createSignal,untrack,type Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {DocumentApplicationPort} from '../../application/document-application-ports';
import type {BlockNode} from '../../block-tree/types';
import {contribution,draftContribution,isConversation,mockComposition,targetKey,type ReplyTarget,type MockContext} from './model';
const metadata=(n:BlockNode|undefined)=>(n?.payload.metadata??{}) as Record<string,any>;

/** One controller per application owner; workspace views share these session choices. */
export function createDialecticController(editor:ReactiveEditor,port:Accessor<DocumentApplicationPort|undefined>){
 const [inspection,setInspection]=createSignal<ReplyTarget>(),[reply,setReply]=createSignal<ReplyTarget>();
 const [context,setContext]=createSignal<ReplyTarget[]>([]),[notice,setNotice]=createSignal(''),[busy,setBusy]=createSignal(false);
 const [trail,setTrail]=createSignal<ReplyTarget[]>([]),[cursor,setCursor]=createSignal(-1);
 const diagnostics={rowBuilds:0,contextNodes:0,submissions:0};
 let alive=true,generation=0;
 const session=()=>port()?.session(),root=()=>{const s=session();return s?.projection.node(s.rootKey);};
 const resourceId=()=>String(metadata(root()).documentId??root()?.payload.id??'');
 const valid=()=>isConversation(metadata(root()).dialectic);
 const rows=createMemo(()=>{
  const r=root();if(!r||!isConversation(metadata(r).dialectic))return [];
  diagnostics.rowBuilds++;
  return r.children.flatMap(key=>{const n=session()!.projection.node(key),data=contribution(metadata(n).dialectic);return n&&data?[{id:String(n.payload.id),key:n.key,data}]:[];});
 });
 const committed=createMemo(()=>rows().filter(r=>r.data.state==='committed').sort((a,b)=>(a.data.ordinal??0)-(b.data.ordinal??0)));
 const frontier=()=>committed().at(-1),draft=()=>rows().find(r=>r.data.state==='draft');
 const target=(id:string,kind:ReplyTarget['kind']='contribution'):ReplyTarget=>({kind,resourceId:resourceId(),blockId:id});
 const resolve=(t:ReplyTarget|undefined):BlockNode|undefined=>{
  if(!t||t.resourceId!==resourceId())return;
  // Explicit navigation/context capture only, never a per-keystroke subscription.
  const nodes:BlockNode[]=[];const walk=(n:BlockNode)=>{if(n.payload.id===t.blockId)nodes.push(n);for(const key of [...n.children,...Object.values(n.ownedRelations)]){const child=session()?.projection.node(key);if(child)walk(child);}};
  const r=root();if(r)walk(r);
  return nodes.length===1?nodes[0]:undefined;
 };
 const label=(t:ReplyTarget)=>{const row=t.resourceId===resourceId()&&rows().find(r=>r.id===t.blockId);return row?row.data.state==='draft'?'Your draft':`#${row.data.ordinal} · ${row.data.author==='mock'?'Mock assistant':'You'}`:`Block ${t.blockId.slice(0,8)}`;};
 const run=(action:()=>unknown)=>{try{setNotice('');return action();}catch(e){setNotice(String(e));}};
 const reveal=(t:ReplyTarget,focus=false)=>{
  const node=resolve(t);if(!node){setNotice('The target is missing, ambiguous, or belongs to another Document. Its reference has been retained.');return;}
  const mount=editor.mounts.get(node.key);mount?.root.scrollIntoView?.({block:'center',behavior:'auto'});
  if(focus){
   const first=(n:BlockNode):BlockNode|undefined=>n.viewType==='standoff-editor-block'?n:n.children.map(k=>session()!.projection.node(k)).filter(Boolean).map(n=>first(n!)).find(Boolean);
   const text=first(node);if(text)editor.focus.request(text.key,{reason:'dialectic-compose'});
  }
 };
 const inspect=(t:ReplyTarget,record=true)=>{
  setInspection(t);if(record)batch(()=>{const next=trail().slice(0,cursor()+1);if(targetKey(next.at(-1)??t)!==targetKey(t)||!next.length)next.push(t);setTrail(next);setCursor(next.length-1);});
  reveal(t);
 };
 const navigate=(delta:number)=>{const i=cursor()+delta;if(i>=0&&i<trail().length){setCursor(i);inspect(trail()[i],false);}};
 const present=()=>{const row=frontier()??draft();if(row)inspect(target(row.id));};
 const compose=()=>{const d=draft();if(d)reveal(target(d.id),true);};
 const guard=()=>{
  if(!alive||!session()?.current()||!valid())throw Error('Open a Dialectic conversation first.');
  editor.documentSessions?.presentations.check(session()!);
  const focused=editor.focus.state.focusedKey;
  if(focused&&editor.mounts.get(focused)?.composing)throw Error('Finish composing text before submitting.');
  const ordinals=committed().map(r=>r.data.ordinal);
  if(ordinals.some(n=>!Number.isSafeInteger(n)||Number(n)<=0)||new Set(ordinals).size!==ordinals.length)throw Error('Contribution chronology is invalid or duplicated. Restore the original contribution containers before submitting.');
 };
 const focusBlock=()=>{
  const key=[editor.focus.state.focusedKey,editor.focus.state.lastFocusedKey].find(k=>k&&session()?.projection.node(k));
  const n=key&&session()?.projection.node(key);if(!n||n.key===root()?.key)throw Error('Place the caret in a Block first.');
  return target(String(n.payload.id),'block');
 };
 const pin=(t:ReplyTarget)=>{if(context().some(p=>targetKey(p)===targetKey(t)))return;if(context().length>=12)throw Error('Select at most 12 context items.');setContext(v=>[...v,t]);};
 const unpin=(t:ReplyTarget)=>setContext(v=>v.filter(p=>targetKey(p)!==targetKey(t)));
 const nextOrdinal=()=>Math.max(0,...committed().map(r=>r.data.ordinal!))+1;
 const submit=()=>run(()=>{
  guard();if(busy())throw Error('Wait for or cancel the mock response.');
  const d=draft();if(!d||rows().filter(r=>r.data.state==='draft').length!==1)throw Error('The conversation must contain exactly one draft.');
  const n=resolve(target(d.id))!;if(!n.children.length)throw Error('Add a Block to the draft before submitting.');
  const to=reply();if(to&&!resolve(to))throw Error('The reply target is unavailable. Choose a target or clear it before submitting.');
  const ordinal=nextOrdinal();
  editor.commands.structuralTransaction('Submit contribution',()=>{
   editor.commands.setPayloadField(n.key,'metadata',{...structuredClone(unwrap(metadata(n))),dialectic:{...structuredClone(unwrap(d.data)),state:'committed',ordinal,createdUtc:new Date().toISOString(),replies:to?[to]:[]}});
   editor.commands.insert(draftContribution(),{kind:'at',parentKey:root()!.key,index:root()!.children.length});
  });
  diagnostics.submissions++;setReply(undefined);setInspection(target(d.id));queueMicrotask(compose);
 });
 const capture=(targets:ReplyTarget[])=>{
  let remaining=6000,visited=0;const revisions=new Map<string,number>(),items:MockContext[]=[];
  for(const t of targets){
   const node=resolve(t);if(!node)throw Error(`Context target unavailable: ${label(t)}. Remove it or restore its source.`);
   let text='';const walk=(n:BlockNode)=>{
    if(++visited>512)throw Error('Selected context exceeds the 512 Block budget. Select a smaller composition.');
    diagnostics.contextNodes++;const record=editor.repository.readState().contents[n.contentKey];revisions.set(n.contentKey,record.revision);
    if(n.inlineContent.length){for(const k of n.inlineContent){if(remaining<=0)throw Error('Selected context exceeds 6,000 characters. Select fewer or smaller Blocks.');const c=session()!.projection.node(k);const value=c?.viewType==='text-cell'?String(c.payload.text??''):'\ufffc';text+=value;remaining-=value.length;}text+='\n';}
    for(const k of [...n.children,...Object.values(n.ownedRelations)]){const child=session()!.projection.node(k);if(child)walk(child);}
   };walk(node);items.push({target:t,text});
  }
  return {items,revisions};
 };
 const cancel=()=>{generation++;setBusy(false);};
 const askMock=async()=>{
  if(busy())return;
  let ticket=0;
  try{
   setNotice('');guard();const explicit=reply()??inspection(),to=explicit??(frontier()?target(frontier()!.id):undefined);
   if(!to)throw Error('Submit a contribution or select a reply target first.');
   const targets=[to,...context().filter(t=>targetKey(t)!==targetKey(to))],captured=capture(targets),source=session(),requestId=crypto.randomUUID();
   ticket=++generation;setBusy(true);
   await new Promise<void>(resolve=>setTimeout(resolve,80));
   if(!alive||ticket!==generation)return;
   if(session()!==source)throw Error('The conversation changed; the mock response was discarded.');
   guard();for(const [key,revision]of captured.revisions)if(editor.repository.readState().contents[key]?.revision!==revision)throw Error('Selected context changed; request a fresh mock response.');
   const d=draft();if(!d)throw Error('Restore the conversation draft before adding a response.');
   const id=crypto.randomUUID(),ordinal=nextOrdinal();
   editor.commands.structuralTransaction('Add mock response',()=>editor.commands.insert({id,type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'mock',ordinal,createdUtc:new Date().toISOString(),replies:[to],context:targets,requestId}},children:mockComposition(captured.items)},{kind:'before',anchorKey:d.key}));
   diagnostics.submissions++;inspect(target(id));
  }catch(e){if(alive)setNotice(String(e));}finally{if(ticket===generation)setBusy(false);}
 };
 return {editor,port,session,root,resourceId,valid,rows,committed,frontier,draft,diagnostics,inspection,reply,context,notice,busy,trail,cursor,label,target,resolve,run,inspect,navigate,present,compose,pin,unpin,setReply,focusBlock,submit,askMock,cancel,
  dispose(){alive=false;cancel();},capture,
 };
}
export type DialecticController=ReturnType<typeof createDialecticController>;
