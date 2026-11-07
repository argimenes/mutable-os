import {DcpSources} from './dcp/sources';
import {request as dcpRequest,prepare as prepareDcp,mockTransport,receive,type DcpTransport} from './dcp/exchange';
import {createSequenceController} from './sequence-controller';
import {batch,createEffect,createMemo,createSignal,onCleanup,untrack,type Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {DocumentApplicationPort} from '../../application/document-application-ports';
import type {BlockNode} from '../../block-tree/types';
import {contribution,draftContribution,isConversation,mockComposition,targetKey,type ReplyTarget,type MockContext,type ConsumedContext} from './model';
import {captureTextSelection} from '../../runtime/selection-snapshot';
import type {TextRangeSnapshot} from '../../runtime/text-ranges';
import {glossOwner} from '../../block-tree/gloss-plan';
import {RANGE_ANCHOR,type RangeDefinition} from './anchors';
import {DialecticReferences,type Resolution} from './references';
const metadata=(n:BlockNode|undefined)=>(n?.payload.metadata??{}) as Record<string,any>;

/** One controller per application owner; workspace views share these session choices. */
export function createDialecticController(editor:ReactiveEditor,port:Accessor<DocumentApplicationPort|undefined>){
 const [inspection,setInspection]=createSignal<ReplyTarget>(),[reply,setReply]=createSignal<ReplyTarget>();
 const [context,setContext]=createSignal<ReplyTarget[]>([]),[notice,setNotice]=createSignal(''),[busy,setBusy]=createSignal(false);
 const [trail,setTrail]=createSignal<ReplyTarget[]>([]),[cursor,setCursor]=createSignal(-1);
 const diagnostics={rowBuilds:0,contextNodes:0,submissions:0};
 let alive=true,generation=0;
 let requestAbort:AbortController|undefined;
 const [dcpPreview,setDcpPreview]=createSignal('');
 let previewTimer:ReturnType<typeof setTimeout>|undefined,previewText='';
 const clearPreview=()=>{if(previewTimer!==undefined)clearTimeout(previewTimer);previewTimer=undefined;previewText='';setDcpPreview('');};
 const streamPreview=(value:string,ticket:number)=>{previewText=value.slice(0,262144);if(previewTimer===undefined)previewTimer=setTimeout(()=>{previewTimer=undefined;if(alive&&ticket===generation)setDcpPreview(previewText);},32);};
 const dcpDiagnostics={exchanges:0,reads:0,searches:0,visited:0,commitMs:0};
 const session=()=>port()?.session(),root=()=>{const s=session();return s?.projection.node(s.rootKey);};
 const resourceId=()=>String(metadata(root()).documentId??root()?.payload.id??'');
 const valid=()=>isConversation(metadata(root()).dialectic);
 const choices=new Map<string,{inspection?:ReplyTarget;reply?:ReplyTarget;context:ReplyTarget[];trail:ReplyTarget[];cursor:number}>();
 let currentResource='';
 createEffect(()=>{const id=resourceId();if(id===currentResource)return;untrack(()=>batch(()=>{
  if(currentResource)choices.set(currentResource,{inspection:inspection(),reply:reply(),context:context(),trail:trail(),cursor:cursor()});
  currentResource=id;generation++;requestAbort?.abort();clearPreview();setBusy(false);const saved=choices.get(id);
  setInspection(saved?.inspection);setReply(saved?.reply);setContext(saved?.context??[]);setTrail(saved?.trail??[]);setCursor(saved?.cursor??-1);setNotice('');
 }));});
 const rows=createMemo(()=>{
  const r=root();if(!r||!isConversation(metadata(r).dialectic))return [];
  diagnostics.rowBuilds++;
  return r.children.flatMap(key=>{const n=session()!.projection.node(key),data=contribution(metadata(n).dialectic);return n&&data?[{id:String(n.payload.id),key:n.key,data}]:[];});
 });
 const committed=createMemo(()=>rows().filter(r=>r.data.state==='committed').sort((a,b)=>(a.data.ordinal??0)-(b.data.ordinal??0)));
 const frontier=()=>committed().at(-1),draft=()=>rows().find(r=>r.data.state==='draft');
 const references=createMemo(()=>{const s=session();if(!s)return;return untrack(()=>{const index=new DialecticReferences(editor,s.projection,s.rootKey);onCleanup(()=>index.dispose());return index;});});
 const pending=new Map<string,{range:TextRangeSnapshot;definition:RangeDefinition}>();
 const preferred=new Map<string,string>();
 const target=(id:string,kind:'contribution'|'block'='contribution'):ReplyTarget=>({kind,resourceId:resourceId(),blockId:id});
 const resolveReference=(t:ReplyTarget|undefined):Resolution=>{
  if(!t)return {status:'missing'};
  const p=t.kind==='range'&&pending.get(t.anchorId);
  if(p){try{editor.textRanges.validate([p.range],'cell');const node=session()?.projection.node(p.range.nodeKey);if(!node||t.resourceId!==resourceId())throw Error('Source unavailable');return {status:'resolved',node,segments:[{...p.range,id:t.anchorId,node}],text:references()!.text(p.range.contentKey,p.range.start,p.range.end),historical:p.definition.metadata.dialecticRange.excerpt};}catch{return {status:'invalid',reason:'Pending selection changed. Select the passage again.',historical:p.definition.metadata.dialecticRange.excerpt};}}
  return references()?.resolve(t,preferred.get(targetKey(t)))??{status:'missing'};
 };
 const resolve=(t:ReplyTarget|undefined):BlockNode|undefined=>{const r=resolveReference(t);return r.status==='resolved'?r.node:undefined;};
 const label=(t:ReplyTarget)=>{
  if(t.kind==='range')return `Passage ${String(t.anchorId??'?').slice(0,8)}`;
  if(t.kind==='gloss')return `Gloss: ${resolveReference(t).text??String(t.definitionId??'?').slice(0,8)}`;
  const row=t.resourceId===resourceId()&&rows().find(r=>r.id===t.blockId);return row?row.data.state==='draft'?'Your draft':`#${row.data.ordinal} · ${row.data.author==='mock'?'Mock assistant':'You'}`:`Block ${String(t.blockId??'?').slice(0,8)}`;
 };
 const preview=editor.decorations.createCollection('dialectic:'+crypto.randomUUID());
 createEffect(()=>{if(!alive)return;const t=inspection(),r=resolveReference(t);preview.replace((r.segments??[]).map((s,i)=>({id:String(i),range:editor.textRanges.snapshot(s.node.key,s.start,s.end),renderers:[{id:'range',name:'svg-highlight',params:{color:'#f3cf7c'}}]})));});
 const run=(action:()=>unknown)=>{try{setNotice('');return action();}catch(e){setNotice(String(e));}};
 const reveal=(t:ReplyTarget,focus=false)=>{
  if(t.kind==='gloss'){editor.gloss.openDefinition(root()!.key,t.definitionId);return;}
  const node=resolve(t);if(!node){setNotice('The target is missing, ambiguous, or belongs to another Document. Its reference has been retained.');return;}
  const mount=editor.mounts.get(node.key);mount?.root.scrollIntoView?.({block:'center',behavior:'auto'});
  if(focus){
   const first=(n:BlockNode):BlockNode|undefined=>n.viewType==='standoff-editor-block'?n:n.children.map(k=>session()!.projection.node(k)).filter(Boolean).map(n=>first(n!)).find(Boolean);
   const text=first(node);if(text)editor.focus.request(text.key,{reason:'dialectic-compose',caret:'end'});
  }
 };
 const inspect=(t:ReplyTarget,record=true)=>{
  t=structuredClone(unwrap(t));
  setInspection(t);if(record)batch(()=>{const next=trail().slice(0,cursor()+1);if(targetKey(next.at(-1)??t)!==targetKey(t)||!next.length)next.push(t);setTrail(next);setCursor(next.length-1);});
  reveal(t);
 };
 const navigate=(delta:number)=>{const i=cursor()+delta;if(i>=0&&i<trail().length){setCursor(i);inspect(trail()[i],false);}};
 const present=()=>{sequences.leave(false);const row=frontier()??draft();if(row)inspect(target(row.id));};
 const compose=()=>{sequences.leave(false);const d=draft();if(d)reveal(target(d.id),true);};
 const guard=()=>{
  if(!alive||!session()?.current()||!valid())throw Error('Open a Dialectic conversation first.');
  editor.documentSessions?.presentations.check(session()!);
  const focused=editor.focus.state.focusedKey;
  if(focused&&editor.mounts.get(focused)?.composing)throw Error('Finish composing text before submitting.');
  const ordinals=committed().map(r=>r.data.ordinal);
  if(ordinals.some(n=>!Number.isSafeInteger(n)||Number(n)<=0)||new Set(ordinals).size!==ordinals.length)throw Error('Contribution chronology is invalid or duplicated. Restore the original contribution containers before submitting.');
 };
 const focusBlock=()=>{
  if(sequences.presenting())throw Error('Open source before choosing an authoring target.');
  const key=[editor.focus.state.focusedKey,editor.focus.state.lastFocusedKey].find(k=>k&&session()?.projection.node(k));
  const n=key&&session()?.projection.node(key);if(!n||n.key===root()?.key)throw Error('Place the caret in a Block first.');
  return target(String(n.payload.id),'block');
 };
 const pin=(t:ReplyTarget)=>{t=structuredClone(unwrap(t));if(context().some(p=>targetKey(p)===targetKey(t)))return;if(context().length>=12)throw Error('Select at most 12 context items.');setContext(v=>[...v,t]);};
 const unpin=(t:ReplyTarget)=>setContext(v=>v.filter(p=>targetKey(p)!==targetKey(t)));
 const nextOrdinal=()=>Math.max(0,...committed().map(r=>r.data.ordinal!))+1;
 const requireCommittedTarget=(t:ReplyTarget)=>{
  let node=resolve(t);if(!node)throw Error('The reply target is unavailable. Choose a target or clear it.');
  while(node){const data=contribution(metadata(node).dialectic);if(data){if(data.state!=='committed')throw Error('Submit the source contribution before replying to it.');return;}node=session()!.projection.parentOf(node.key);}
  throw Error('Choose a Block inside a committed contribution.');
 };
 const submit=()=>run(()=>{
  guard();if(busy())throw Error('Wait for or cancel the mock response.');
  const d=draft();if(!d||rows().filter(r=>r.data.state==='draft').length!==1)throw Error('The conversation must contain exactly one draft.');
  const n=resolve(target(d.id))!;if(!n.children.length)throw Error('Add a Block to the draft before submitting.');
  const only=n.children.length===1?session()!.projection.node(n.children[0]):undefined;
  if(only?.viewType==='standoff-editor-block'&&!only.children.length&&!Object.keys(only.ownedRelations).length&&only.inlineContent.every(k=>{const cell=session()!.projection.node(k);return cell?.viewType==='text-cell'&&!String(cell.payload.text??'').trim();}))throw Error('Write a contribution or add content before submitting.');
  const to=reply();if(to)requireCommittedTarget(to);
  const ordinal=nextOrdinal();
  editor.commands.structuralTransaction('Submit contribution',()=>{
   persistRanges(to?[to]:[]);
   editor.commands.setPayloadField(n.key,'metadata',{...structuredClone(unwrap(metadata(n))),dialectic:{...structuredClone(unwrap(d.data)),state:'committed',ordinal,createdUtc:new Date().toISOString(),replies:to?[to]:[],replyExcerpts:to?.kind==='range'?[{target:to,text:resolveReference(to).text??''}]:[]}});
   editor.commands.insert(draftContribution(),{kind:'at',parentKey:root()!.key,index:root()!.children.length});
  });
  if(to?.kind==='range')pending.delete(to.anchorId);
  diagnostics.submissions++;setReply(undefined);setInspection(target(d.id));queueMicrotask(compose);
 });
 const capture=(targets:ReplyTarget[])=>{
  let remaining=6000,visited=0;const revisions=new Map<string,number>(),items:MockContext[]=[],manifest:ConsumedContext['items']=[];
  for(const t of targets){
   const resolved=resolveReference(t);if(resolved.status!=='resolved')throw Error(`Context target unavailable: ${label(t)}. ${resolved.reason??'Restore its source.'}`);
   const itemRevisions=new Map<string,number>();
   const record=(key:string)=>{const revision=editor.repository.readState().contents[key].revision;revisions.set(key,revision);itemRevisions.set(key,revision);};
   let text='';
   if(t.kind==='range'){text=resolved.text!;for(const s of resolved.segments!)record(s.contentKey);record(root()!.contentKey);remaining-=text.length;}
   else if(t.kind==='gloss'){text=resolved.text!;record(root()!.contentKey);remaining-=text.length;}
   else {
    const seen=new Set<string>();const walk=(n:BlockNode)=>{
     if(seen.has(n.contentKey))return;seen.add(n.contentKey);
     if(editor.features.dialecticDcp&&glossOwner(editor.repository.readState(),n.contentKey,{locationOf:k=>editor.repository.locationOf(k),ownedKeys:k=>editor.repository.ownedPlacementKeys(k)})!==root()!.contentKey)throw Error('Context includes content outside this Symposium');
     if(++visited>512)throw Error('Selected context exceeds the 512 Block budget. Select a smaller composition.');
     diagnostics.contextNodes++;record(n.contentKey);
     if(n.inlineContent.length){if(n.inlineContent.length+1>remaining)throw Error('Selected context exceeds 6,000 characters. Select fewer or smaller Blocks.');const value=references()!.text(n.contentKey);remaining-=value.length+1;if(remaining<0)throw Error('Selected context exceeds 6,000 characters.');text+=value+'\n';}
     for(const k of [...n.children,...Object.values(n.ownedRelations)]){const child=session()!.projection.node(k);if(child)walk(child);}
    };walk(resolved.node!);
   }
   if(remaining<0)throw Error('Selected context exceeds 6,000 characters. Select fewer or smaller Blocks.');
   items.push({target:t,text});manifest.push({target:t,text,origins:[],revisions:[...itemRevisions].map(([contentKey,revision])=>({contentKey,revision}))});
  }
  return {items,revisions,manifest};
 };
 const selectionRange=(provided?:TextRangeSnapshot)=>{
  guard();const ranges=provided?[provided]:captureTextSelection(document,editor.mounts,editor.crossText,editor.textRanges)?.ranges;
  if(ranges?.length!==1)throw Error('Select one nonempty range in one TextBlock.');const range=ranges[0];editor.textRanges.validate([range],'cell');
  const n=session()?.projection.node(range.nodeKey);if(!n||n.viewType!=='standoff-editor-block'||glossOwner(editor.repository.readState(),n.contentKey,{locationOf:k=>editor.repository.locationOf(k),ownedKeys:k=>editor.repository.ownedPlacementKeys(k)})!==root()?.contentKey)throw Error('Select owned text in this conversation.');
  requireCommittedTarget(target(String(n.payload.id),'block'));return range;
 };
 const selectRange=(role:'reply'|'context',provided?:TextRangeSnapshot)=>run(()=>{
  const range=selectionRange(provided),n=session()!.projection.node(range.nodeKey)!,anchorId=crypto.randomUUID();
  const t:ReplyTarget={kind:'range',resourceId:resourceId(),anchorId};
  pending.set(anchorId,{range,definition:{id:anchorId,type:RANGE_ANCHOR,metadata:{dialecticRange:{version:1,excerpt:references()!.text(range.contentKey,range.start,range.end),source:{resourceId:resourceId(),blockId:String(n.payload.id)}}}}});
  preferred.set(targetKey(t),n.key);if(role==='reply')setReply(t);else pin(t);inspect(t);return t;
 });
 const persistRanges=(targets:ReplyTarget[])=>{
  const selected=[...new Set(targets.filter(t=>t.kind==='range').map(t=>t.anchorId!))].flatMap(id=>{const p=pending.get(id);return p?[{id,...p}]:[];});if(!selected.length)return;
  const registry:any=structuredClone(unwrap(root()!.payload.linkedAnnotations??{}));
  const texts=new Map<string,any[]>();
  for(const p of selected){editor.textRanges.validate([p.range],'cell');registry[p.id]=p.definition;const n=session()!.projection.node(p.range.nodeKey)!;
   let properties=texts.get(n.key);if(!properties)texts.set(n.key,properties=structuredClone(unwrap(n.payload.standoffProperties??[])) as any[]);
   properties.push({id:crypto.randomUUID(),type:RANGE_ANCHOR,annotationId:p.id,start:p.range.start,end:p.range.end-1});
  }
  editor.commands.setPayloadField(root()!.key,'linkedAnnotations',registry);
  for(const [key,properties]of texts)editor.commands.setPayloadField(key,'standoffProperties',properties);
 };
 const reattach=(t:ReplyTarget,provided?:TextRangeSnapshot)=>run(()=>{
  if(t.kind!=='range'||t.resourceId!==resourceId()||pending.has(t.anchorId))throw Error('Choose a committed range reference to reattach.');
  const range=selectionRange(provided),old=resolveReference(t),registry=structuredClone(unwrap(root()!.payload.linkedAnnotations??{})) as Record<string,any>;
  if(!registry[t.anchorId]||registry[t.anchorId].isDeleted)throw Error('Restore the missing anchor definition with Undo before reattaching.');
  const texts=new Map<string,any[]>();for(const s of old.segments??[])texts.set(s.node.key,(structuredClone(unwrap(s.node.payload.standoffProperties??[])) as any[]).filter((p:any)=>p.annotationId!==t.anchorId||p.type!==RANGE_ANCHOR));
  const n=session()!.projection.node(range.nodeKey)!;const properties=texts.get(n.key)??structuredClone(unwrap(n.payload.standoffProperties??[])) as any[];properties.push({id:crypto.randomUUID(),type:RANGE_ANCHOR,annotationId:t.anchorId,start:range.start,end:range.end-1});texts.set(n.key,properties);
  editor.commands.structuralTransaction('Reattach reply passage',()=>{for(const [key,p]of texts)editor.commands.setPayloadField(key,'standoffProperties',p);});preferred.set(targetKey(t),n.key);inspect(t);
 });
 const glosses=()=>references()?.overlapping(resolveReference(inspection()).segments??[])??[];
 const createGloss=()=>run(()=>{const segments=resolveReference(inspection()).segments;if(segments?.length!==1)throw Error('Select one passage segment to create a Gloss.');const s=segments[0];void editor.commandRegistry.execute('gloss.create',{targetKey:s.node.key,args:{selection:{anchor:s.start,head:s.end}}});});
 const pinGloss=(id:string)=>pin({kind:'gloss',resourceId:resourceId(),definitionId:id});
 const cancel=()=>{generation++;requestAbort?.abort();clearPreview();setBusy(false);};
 const askDcp=async(transport:DcpTransport)=>{
  if(busy())return;
  let ticket=0,sources:DcpSources|undefined;
  try{
   setNotice('');clearPreview();guard();const to=reply()??inspection()??(frontier()?target(frontier()!.id):undefined);
   if(!to)throw Error('Submit a contribution or select a reply target first.');requireCommittedTarget(to);
   const selectedTargets=structuredClone(unwrap(context())),targets=[to,...selectedTargets.filter(t=>targetKey(t)!==targetKey(to))];
   for(const t of targets)if(t.kind!=='gloss')requireCommittedTarget(t);
   const captured=capture(targets),source=session()!,exchangeId=crypto.randomUUID();
   ticket=++generation;requestAbort=new AbortController();setBusy(true);setDcpPreview('Preparing structured exchange…');
   sources=new DcpSources(editor,resourceId(),function*(){for(const r of committed())yield source.projection.node(r.key)!;},key=>source.projection.node(key),key=>source.projection.parentOf(key),t=>resolveReference(t),requestAbort.signal);
   for(const key of captured.revisions.keys())sources.fence(key);
   const primary=sources.issue(to),selected=selectedTargets.map(t=>sources!.issue(t));
   const request=dcpRequest(exchangeId,primary,selected,captured.items.map(item=>({handle:sources!.issue(item.target),plainTextExcerpt:item.text})),editor.visualEffects);
   const raw=await receive(transport,request,sources,value=>{if(alive&&ticket===generation)streamPreview(value,ticket);},requestAbort);
   if(!alive||ticket!==generation)return;
   if(session()!==source)throw Error('Conversation changed; DCP response discarded');guard();sources.check();
   const prepared=await prepareDcp(raw,exchangeId,resourceId(),editor.visualEffects,sources),d=draft();if(!d)throw Error('Restore the draft before adding a response');
   if(!alive||ticket!==generation||session()!==source)return;guard();sources.check();
   for(const t of targets)if(t.kind==='range'){
    const p=pending.get(t.anchorId);if(!p)continue;editor.textRanges.validate([p.range],'cell');prepared.definitions[t.anchorId]=p.definition;
    let properties=prepared.annotations.get(p.range.nodeKey);if(!properties)prepared.annotations.set(p.range.nodeKey,properties=[]);
    properties.push({id:crypto.randomUUID(),type:RANGE_ANCHOR,annotationId:t.anchorId,start:p.range.start,end:p.range.end-1});
   }
   for(const item of captured.manifest)item.origins=[...(targetKey(item.target)===targetKey(to)?['reply-target' as const]:[]),...(selectedTargets.some(t=>targetKey(t)===targetKey(item.target))?['selected' as const]:[])];
   const id=crypto.randomUUID(),ordinal=nextOrdinal(),data={version:1,kind:'contribution',state:'committed',author:'mock',ordinal,createdUtc:new Date().toISOString(),replies:[to],discursiveReferences:prepared.discursiveReferences,context:targets,requestId:exchangeId,
    replyExcerpts:to.kind==='range'?[{target:to,text:captured.items[0].text}]:[],consumedContext:{version:1,items:captured.manifest,limits:{characters:6000,blocks:512}},
    dcp:{version:1,profile:'4a-1',request,tools:sources.trail,response:raw,identityMap:prepared.aliases,intent:prepared.intent}};
   const started=performance.now();
   editor.commands.boundedStructuralTransaction('Add DCP mock response',()=>{
    if(Object.keys(prepared.definitions).length)editor.commands.setPayloadField(root()!.key,'linkedAnnotations',{...structuredClone(unwrap(root()!.payload.linkedAnnotations??{})),...prepared.definitions});
    for(const [key,added]of prepared.annotations){const n=source.projection.node(key);if(!n)throw Error('Anchor source unavailable');editor.commands.setPayloadField(key,'standoffProperties',[...structuredClone(unwrap(n.payload.standoffProperties??[])) as any[],...added]);}
    editor.commands.insert({id,type:'container-block',metadata:{dialectic:JSON.parse(JSON.stringify(data))},children:prepared.children},{kind:'before',anchorKey:d.key});
   });
   dcpDiagnostics.commitMs=performance.now()-started;dcpDiagnostics.exchanges++;dcpDiagnostics.reads+=sources.diagnostics.reads;dcpDiagnostics.searches+=sources.diagnostics.searches;dcpDiagnostics.visited+=sources.diagnostics.visited;
   for(const t of targets)if(t.kind==='range')pending.delete(t.anchorId);
   diagnostics.submissions++;clearPreview();inspect(target(id));
  }catch(e){if(alive&&ticket===generation)setNotice(String(e));else if(!ticket&&alive)setNotice(String(e));}finally{sources?.dispose();if(ticket===generation)setBusy(false);}
 };
 const askMock=async(transport:DcpTransport=mockTransport)=>{
  if(editor.features.dialecticDcp)return askDcp(transport);
  if(busy())return;
  let ticket=0;
  try{
   setNotice('');guard();const explicit=reply()??inspection(),to=explicit??(frontier()?target(frontier()!.id):undefined);
   if(!to)throw Error('Submit a contribution or select a reply target first.');
   requireCommittedTarget(to);
   const targets=[to,...context().filter(t=>targetKey(t)!==targetKey(to))],captured=capture(targets),source=session(),requestId=crypto.randomUUID();
   for(const item of captured.manifest)item.origins=[...(targetKey(item.target)===targetKey(to)?['reply-target' as const]:[]),...(context().some(t=>targetKey(t)===targetKey(item.target))?['selected' as const]:[])];
   ticket=++generation;setBusy(true);
   await new Promise<void>(resolve=>setTimeout(resolve,80));
   if(!alive||ticket!==generation)return;
   if(session()!==source)throw Error('The conversation changed; the mock response was discarded.');
   guard();for(const [key,revision]of captured.revisions)if(editor.repository.readState().contents[key]?.revision!==revision)throw Error('Selected context changed; request a fresh mock response.');
   const d=draft();if(!d)throw Error('Restore the conversation draft before adding a response.');
   const id=crypto.randomUUID(),ordinal=nextOrdinal();
   editor.commands.structuralTransaction('Add mock response',()=>{persistRanges(targets);editor.commands.insert({id,type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'mock',ordinal,createdUtc:new Date().toISOString(),replies:[to],context:targets,requestId,replyExcerpts:to.kind==='range'?[{target:to,text:captured.items[0].text}]:[],consumedContext:{version:1,items:captured.manifest,limits:{characters:6000,blocks:512}}}},children:mockComposition(captured.items)},{kind:'before',anchorKey:d.key});});
   for(const t of targets)if(t.kind==='range')pending.delete(t.anchorId);
   diagnostics.submissions++;inspect(target(id));
  }catch(e){if(alive)setNotice(String(e));}finally{if(ticket===generation)setBusy(false);}
 };
 const sequences=createSequenceController(editor,{root,resourceId,session,resolve,inspect,requireCommittedTarget,guard});
 return {sequences,editor,port,session,root,resourceId,valid,rows,committed,frontier,draft,diagnostics,inspection,reply,context,notice,busy,trail,cursor,label,target,resolve,run,inspect,navigate,present,compose,pin,unpin,setReply:(t:ReplyTarget|undefined)=>setReply(t&&structuredClone(unwrap(t))),focusBlock,submit,askMock,cancel,
  references,resolveReference,selectRange,reattach,glosses,createGloss,pinGloss,dcpPreview,dcpDiagnostics,
  dispose(){sequences.dispose();alive=false;cancel();choices.clear();pending.clear();preview.dispose();},capture,
 };
}
export type DialecticController=ReturnType<typeof createDialecticController>;
