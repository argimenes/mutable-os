import {XmlContext} from './dcp/xml-context';
import {xmlDialect} from './dcp/xml-authoring';
import {ENTITY_REFERENCE} from '../../feature-api/scoped-entities';
import {emptySemanticFieldsVersion} from './dcp/empty-fields';
import {semanticWorkspace,enableSemanticWorkspace} from './dcp/workspace';
import {conversationalSelection,copyVocabularySelection,vocabularyDescriptors,type VocabularySelection} from './dcp/vocabulary';
import {createSubmissionSave} from './submission-save';
import {createConversationTitle} from './conversation-title';
import {createContributionActivity,repairedNotice,type ActivityCategory,type ActivityItem,type ActivitySummary} from './activity';
import {revealPositionMarker} from '../../runtime/reveal-match';
import {retainedPdfsEnabled} from './dcp/retained-pdfs';
import {managedImagesEnabled} from './dcp/managed-images';
import {composePreparedLeaves} from '../../block-tree/prepared-leaves';
import {compositionLimits} from './dcp/limits';
import {DialecticProviderSession} from './dcp/live';
import {ConversationHistory} from './continuity';
import {liveLimits,type ProviderSettings,type LiveProvenance} from './dcp/provider-contract';
import {DcpSources} from './dcp/sources';
import {request as dcpRequest,prepare as prepareDcp,mockTransport,receive,type DcpTransport} from './dcp/exchange';
import {createSequenceController} from './sequence-controller';
import {batch,createEffect,createMemo,createRoot,createSignal,onCleanup,untrack,type Accessor} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {DocumentApplicationPort} from '../../application/document-application-ports';
import type {BlockNode} from '../../block-tree/types';
import {contribution,defaultParticipant,participantLabel,draftContribution,textBlock,isConversation,mockComposition,targetKey,type ReplyTarget,type MockContext,type ConsumedContext} from './model';
import {captureTextSelection} from '../../runtime/selection-snapshot';
import type {TextRangeSnapshot} from '../../runtime/text-ranges';
import {glossOwner} from '../../block-tree/gloss-plan';
import {RANGE_ANCHOR,type RangeDefinition} from './anchors';
import {DialecticReferences,type Resolution} from './references';
const metadata=(n:BlockNode|undefined)=>(n?.payload.metadata??{}) as Record<string,any>;

/** One controller per application owner; workspace views share these session choices. */
export function createDialecticController(editor:ReactiveEditor,port:Accessor<DocumentApplicationPort|undefined>){
 const providers=new DialecticProviderSession(editor.features.dcpTestPhaseLogging);
 const history=new ConversationHistory(editor);
 const [vocabularySelection,storeVocabulary]=createSignal<Readonly<VocabularySelection>>(conversationalSelection);
 const configureVocabulary=(input:VocabularySelection)=>{if(!editor.features.dcpVocabularySelection)throw Error('DCP vocabulary selection disabled');const next=copyVocabularySelection(input),ids=new Set(vocabularyDescriptors(editor).map(d=>d.id));for(const id of [...next.enable??[],...next.disable??[]])if(!ids.has(id))throw Error('Unknown DCP capability: '+id);if(next.disable?.includes('composition.paragraph'))throw Error('Paragraphs are required');storeVocabulary(next);};
 const [selectedAi,setSelectedAi]=createSignal<string>();
 const [providerMode,setProviderMode]=createSignal<'mock'|'live'>(editor.features.dialecticProviders&&editor.features.dialecticDcp?'live':'mock'),[providerReady,setProviderReady]=createSignal(false),[providerSettings,setProviderSettings]=createSignal({...providers.settings}),[providerNotice,setProviderNotice]=createSignal(''),[providerConfiguring,setProviderConfiguring]=createSignal(false);
 const configureProvider=async(settings:ProviderSettings,key?:string)=>{if(busy()||providerConfiguring())return;setProviderConfiguring(true);try{const ready=await providers.configure(settings,key);if(!alive)return;setProviderReady(ready);setProviderSettings({...providers.settings});setProviderNotice(ready?'Session provider ready.':'Enter a session key; no server environment key is configured.');if(ready)setProviderMode('live');}catch(e){if(alive){setProviderReady(providers.ready);setProviderNotice(String(e));}}finally{if(alive)setProviderConfiguring(false);}};
 const forgetProvider=async()=>{cancel();await providers.forget();setProviderReady(false);setProviderNotice('Session keys forgotten.');};
 const [inspection,setInspection]=createSignal<ReplyTarget>(),[reply,setReply]=createSignal<ReplyTarget>();
 const [activityInspection,setActivityInspection]=createSignal<{id:string;category:ActivityCategory|'notices'}>();
 const [context,setContext]=createSignal<ReplyTarget[]>([]),[notice,setNotice]=createSignal(''),[busy,setBusy]=createSignal(false);
 const [trail,setTrail]=createSignal<ReplyTarget[]>([]),[cursor,setCursor]=createSignal(-1);
 const diagnostics={rowBuilds:0,contextNodes:0,submissions:0};
 let alive=true,generation=0;
 let requestAbort:AbortController|undefined;
 const [dcpPreview,setDcpPreview]=createSignal('');
 const [lastProviderExchange,setLastProviderExchange]=createSignal<LiveProvenance>();
 let previewTimer:ReturnType<typeof setTimeout>|undefined,previewText='';
 const clearPreview=()=>{if(previewTimer!==undefined)clearTimeout(previewTimer);previewTimer=undefined;previewText='';setDcpPreview('');};
 const streamPreview=(value:string,ticket:number)=>{previewText=value.slice(0,262144);if(previewTimer===undefined)previewTimer=setTimeout(()=>{previewTimer=undefined;if(alive&&ticket===generation)setDcpPreview(previewText);},32);};
 const dcpDiagnostics={exchanges:0,reads:0,searches:0,visited:0,commitMs:0};
 const session=()=>port()?.session(),root=()=>{const s=session();return s?.projection.node(s.rootKey);};
 const resourceId=()=>String(metadata(root()).documentId??root()?.payload.id??'');
 const valid=()=>isConversation(metadata(root()).dialectic);
 const submissionSave=createSubmissionSave(async(id,name)=>{
  const files=port()?.application.files;
  if(!files?.saveSubmitted)throw Error('Native Document saving is unavailable.');
  return files.saveSubmitted(id,name);
 },()=>editor.features.dialecticConversationUpdates);
 const saveState=()=>submissionSave.state(resourceId());
 const retrySave=()=>submissionSave.request(resourceId());
 const choices=new Map<string,{inspection?:ReplyTarget;reply?:ReplyTarget;context:ReplyTarget[];trail:ReplyTarget[];cursor:number}>();
 let currentResource='';
 createEffect(()=>{const id=resourceId();if(id===currentResource)return;untrack(()=>batch(()=>{
  if(currentResource)choices.set(currentResource,{inspection:inspection(),reply:reply(),context:context(),trail:trail(),cursor:cursor()});
  currentResource=id;generation++;requestAbort?.abort();clearPreview();setBusy(false);const saved=choices.get(id);
  setInspection(saved?.inspection);setActivityInspection(undefined);setReply(saved?.reply);setContext(saved?.context??[]);setTrail(saved?.trail??[]);setCursor(saved?.cursor??-1);setNotice('');
 }));});
 const rows=createMemo(()=>{
  const r=root();if(!r||!isConversation(metadata(r).dialectic))return [];
  diagnostics.rowBuilds++;
  return r.children.flatMap(key=>{const n=session()!.projection.node(key),data=contribution(metadata(n).dialectic);return n&&data?[{id:String(n.payload.id),key:n.key,data}]:[];});
 });
 const committed=createMemo(()=>rows().filter(r=>r.data.state==='committed').sort((a,b)=>(a.data.ordinal??0)-(b.data.ordinal??0)));
 const frontier=()=>committed().at(-1),draft=()=>rows().find(r=>r.data.state==='draft');
 const titles=createConversationTitle({
  enabled:()=>editor.features.dialecticAutomaticTitles&&editor.features.dialecticProviders&&providerMode()==='live',
  ready:providerReady,idle:()=>!busy()&&!providerConfiguring(),
  current:()=>{const first=committed()[0];return valid()&&first?{id:resourceId(),firstId:first.id,title:String(metadata(root()).title??'')}:undefined;},
  generate:(text,signal)=>providers.title(text,signal),
  apply:(id,title)=>{port()!.application.renameDocument(id,title);submissionSave.request(id);},
 });
 const pasting=()=>{
  const pending=editor.clipboard.pasting();if(!pending||!editor.features.dialecticConversationUpdates)return false;
  const s=session(),d=draft();if(!s||!d||pending.viewId!==s.projection.viewId)return false;
  for(let node=s.projection.node(pending.nodeKey);node;node=s.projection.parentOf(node.key))if(node.key===d.key)return true;
  return false;
 };
 const references=createMemo(()=>{const s=session();if(!s)return;return untrack(()=>{const index=new DialecticReferences(editor,s.projection,s.rootKey);onCleanup(()=>index.dispose());return index;});});
 const activityDiagnostics={candidates:0,resolutions:0};
 const activities=new Map<string,{summary:Accessor<ActivitySummary>;dispose:()=>void}>();
 const contributionActivity=(id:string)=>{
  let entry=activities.get(id);if(!entry){entry=createRoot(dispose=>{const data=createMemo(()=>editor.features.dialecticContributionActivity?rows().find(r=>r.id===id)?.data:undefined);return {dispose,summary:createContributionActivity(data,references,activityDiagnostics)};});activities.set(id,entry);}return entry.summary;
 };
 createEffect(()=>{const ids=new Set(rows().map(r=>r.id));untrack(()=>{for(const [id,entry]of activities)if(!ids.has(id)){entry.dispose();activities.delete(id);}if(activityInspection()&&!ids.has(activityInspection()!.id))setActivityInspection(undefined);});});
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
  if(t.kind==='argument-relation'||t.kind==='entity-relation')return resolveReference(t).text??`Relationship ${t.definitionId.slice(0,8)}`;
  if(t.kind==='argument')return `Argument ${t.argumentId.slice(0,8)}`;
  if(t.kind==='entity')return `Entity: ${resolveReference(t).text??t.entity.entityId.slice(0,8)}`;
  if(t.kind==='range')return `Passage ${String(t.anchorId??'?').slice(0,8)}`;
  if(t.kind==='gloss')return `Gloss: ${resolveReference(t).text??String(t.definitionId??'?').slice(0,8)}`;
  const row=t.resourceId===resourceId()&&rows().find(r=>r.id===t.blockId);return row?row.data.state==='draft'?'New contribution':`#${row.data.ordinal} · ${participantLabel(row.data)}`:`Block ${String(t.blockId??'?').slice(0,8)}`;
 };
 const [annotationInspection,setAnnotationInspection]=createSignal<{resourceId:string;blockId:string;propertyId:string}>();
 const annotationDetails=(ref:{blockId:string;propertyId:string})=>{
  const found=resolveReference(target(ref.blockId,'block')),node=found.node;
  if(found.status!=='resolved'||!node)return undefined;
  const property=(node.payload.standoffProperties as any[]??[]).find(p=>p.id===ref.propertyId&&!p.isDeleted);
  if(!property||!Number.isInteger(property.start)||!Number.isInteger(property.end)||property.start<0||property.end<property.start||property.end>=node.inlineContent.length)return undefined;
  return {node,property,text:references()!.text(node.contentKey,property.start,Math.min(property.end+1,property.start+180))};
 };
 const inspectedAnnotation=createMemo(()=>{const ref=annotationInspection();return ref?.resourceId===resourceId()?annotationDetails(ref):undefined;});
 const preview=editor.decorations.createCollection('dialectic:'+crypto.randomUUID());
 createEffect(()=>{if(!alive)return;const t=inspection(),r=resolveReference(t),a=inspectedAnnotation();const ranges=a?[{node:a.node,start:a.property.start,end:a.property.end+1}]:(r.segments??[]);preview.replace(ranges.map((s,i)=>({id:String(i),range:editor.textRanges.snapshot(s.node.key,s.start,s.end),renderers:[{id:'range',name:'svg-highlight',params:{color:'#f3cf7c'}}]})));});
 const run=(action:()=>unknown)=>{try{setNotice('');return action();}catch(e){setNotice(String(e));}};
 let revealGeneration=0;
 const reveal=(t:ReplyTarget,focus=false)=>{
  const revealTicket=++revealGeneration;
  if(['entity','argument-relation','entity-relation'].includes(t.kind))return;
  if(t.kind==='gloss'){editor.gloss.openDefinition(root()!.key,t.definitionId);return;}
  const node=resolve(t);if(!node){setNotice('The target is missing, ambiguous, or belongs to another Document. Its reference has been retained.');return;}
  const sourceSession=session();void revealPositionMarker(editor,{id:'dialectic-inspection',anchor:{kind:'block',nodeKey:node.key}},()=>alive&&session()===sourceSession&&revealTicket===revealGeneration);
  if(focus){
   const first=(n:BlockNode):BlockNode|undefined=>n.viewType==='standoff-editor-block'?n:n.children.map(k=>session()!.projection.node(k)).filter(Boolean).map(n=>first(n!)).find(Boolean);
   const text=first(node);if(text)editor.focus.request(text.key,{reason:'dialectic-compose',caret:'end'});
  }
 };
 const inspect=(t:ReplyTarget,record=true)=>{
  t=structuredClone(unwrap(t));
  setActivityInspection(undefined);setAnnotationInspection(undefined);setInspection(t);if(record)batch(()=>{const next=trail().slice(0,cursor()+1);if(targetKey(next.at(-1)??t)!==targetKey(t)||!next.length)next.push(t);setTrail(next);setCursor(next.length-1);});
  reveal(t);
 };
 // Inspect only the clicked occurrence and its local properties. No search,
 // Document scan, canonical transaction or focus/reveal is needed for Entities.
 const inspectEntityMention=(nodeKey:string,index:number)=>{
  if(!editor.features.dcpProactiveSemanticAuthoring||!Number.isInteger(index)||index<0)return false;
  const projection=session()?.projection,node=projection?.node(nodeKey);if(!node||node.viewType!=='standoff-editor-block')return false;
  let ancestor=projection!.parentOf(nodeKey);while(ancestor&&ancestor.key!==root()?.key)ancestor=projection!.parentOf(ancestor.key);
  if(!ancestor)return false;
  const property=(node.payload.standoffProperties as any[]??[]).find(p=>!p.isDeleted&&p.type===ENTITY_REFERENCE&&p.start<=index&&p.end>=index&&p.metadata?.entityReference);
  if(!property)return false;
  inspect({kind:'entity',resourceId:resourceId(),entity:property.metadata.entityReference});return true;
 };
 const inspectAnnotation=(ref:{blockId:string;propertyId:string})=>run(()=>{inspect(target(ref.blockId,'block'));setAnnotationInspection({...ref,resourceId:resourceId()});if(!annotationDetails(ref))setNotice('This annotation is unavailable; its authored reference is retained.');});
 const inspectActivity=(id:string,category:ActivityCategory|'notices')=>run(()=>{inspect(target(id));setActivityInspection({id,category});});
 const inspectActivityItem=(item:ActivityItem)=>run(()=>{const selected=activityInspection();if(item.target)inspect(item.target);else if(item.annotation)inspectAnnotation(item.annotation);setActivityInspection(selected);});
 const navigate=(delta:number)=>{const i=cursor()+delta;if(i>=0&&i<trail().length){setCursor(i);inspect(trail()[i],false);}};
 const present=()=>{sequences.leave(false);const row=frontier()??draft();if(row)inspect(target(row.id));};
 const compose=()=>{sequences.leave(false);const d=draft();if(d)reveal(target(d.id),true);};
 const guard=()=>{
  if(!alive||!session()?.current()||!valid())throw Error('Open a Dialectic conversation first.');
  editor.documentSessions?.presentations.checkInteraction(session()!);
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
 const loggedContributions=new Map<string,Map<string,string>>();
 const logNative=async(documentId:string,keys:string[],kind:string)=>{
  if(!editor.features.dcpTestPhaseLogging)return;
  const asset=editor.readAssetContext();if(!asset.cavernId||!asset.session)return;
  try{
   const native=await history.build(documentId,documentId+':ai',keys),seen=loggedContributions.get(documentId)??new Map<string,string>();
   const items=native.items.filter((_item,i)=>seen.get(native.manifest.history[i].id)!==native.manifest.history[i].digest);
   if(await providers.diagnostic({kind,documentId,manifest:native.manifest,items})){for(const stamp of native.manifest.history)seen.set(stamp.id,stamp.digest);loggedContributions.set(documentId,seen);}
  }catch{if(alive)setProviderNotice('DCP diagnostic logging failed. Check the local server and log directory.');}
 };
 const submit=()=>run(()=>{
  if(pasting())throw Error('Wait for the paste to finish before submitting.');
  guard();if(busy())throw Error('Wait for or cancel the mock response.');
  const d=draft();if(!d||rows().filter(r=>r.data.state==='draft').length!==1)throw Error('The conversation must contain exactly one draft.');
  const n=resolve(target(d.id))!;if(!n.children.length)throw Error('Add a Block to the draft before submitting.');
  const only=n.children.length===1?session()!.projection.node(n.children[0]):undefined;
  if(only?.viewType==='standoff-editor-block'&&!only.children.length&&!Object.keys(only.ownedRelations).length&&only.inlineContent.every(k=>{const cell=session()!.projection.node(k);return cell?.viewType==='text-cell'&&!String(cell.payload.text??'').trim();}))throw Error('Write a contribution or add content before submitting.');
  const to=reply();if(to)requireCommittedTarget(to);
  const ordinal=nextOrdinal();
  editor.commands.structuralTransaction('Submit contribution',()=>{
   persistRanges(to?[to]:[]);
   editor.commands.setPayloadField(n.key,'metadata',{...structuredClone(unwrap(metadata(n))),dialectic:{...structuredClone(unwrap(d.data)),state:'committed',participant:d.data.participant?structuredClone(unwrap(d.data.participant)):defaultParticipant(resourceId(),'human'),ordinal,createdUtc:new Date().toISOString(),replies:to?[to]:[],replyExcerpts:to?.kind==='range'||to?.kind==='argument'?[{target:to,text:resolveReference(to).text??''}]:[]}});
   editor.commands.insert(draftContribution(),{kind:'at',parentKey:root()!.key,index:root()!.children.length});
  });
  if(to?.kind==='range')pending.delete(to.anchorId);
  submissionSave.request(resourceId());
  if(committed().length===1&&editor.features.dialecticAutomaticTitles&&editor.features.dialecticProviders&&providerMode()==='live'){try{titles.request(capture([target(d.id)]).items[0]?.text??'');}catch{/* A non-text first contribution can retain its default title. */}}
  void logNative(resourceId(),[n.contentKey],'contribution.committed');diagnostics.submissions++;setReply(undefined);setInspection(target(d.id));queueMicrotask(compose);return target(d.id);
 });
 const capture=(targets:ReplyTarget[])=>{
  let remaining=6000,visited=0;const revisions=new Map<string,number>(),items:MockContext[]=[],manifest:ConsumedContext['items']=[];
  for(const t of targets){
   const resolved=resolveReference(t);if(resolved.status!=='resolved')throw Error(`Context target unavailable: ${label(t)}. ${resolved.reason??'Restore its source.'}`);
   const itemRevisions=new Map<string,number>();
   const record=(key:string)=>{const revision=editor.repository.readState().contents[key].revision;revisions.set(key,revision);itemRevisions.set(key,revision);};
   let text='';
   if(t.kind==='range'||t.kind==='argument'){text=resolved.text!;for(const s of resolved.segments!)record(s.contentKey);record(root()!.contentKey);remaining-=text.length;}
   else if(t.kind==='gloss'||t.kind==='entity'||t.kind==='argument-relation'||t.kind==='entity-relation'){text=resolved.text!;record(root()!.contentKey);remaining-=text.length;}
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
  const registry:any=structuredClone(unwrap(root()!.payload.linkedAnnotations??{})) as Record<string,unknown>;
  const texts=new Map<string,any[]>();
  for(const p of selected){editor.textRanges.validate([p.range],'cell');registry[p.id]=p.definition;const n=session()!.projection.node(p.range.nodeKey)!;
   let properties=texts.get(n.key);if(!properties)texts.set(n.key,properties=structuredClone(unwrap(n.payload.standoffProperties??[])) as any[]);
   properties.push({id:crypto.randomUUID(),type:RANGE_ANCHOR,annotationId:p.id,start:p.range.start,end:p.range.end-1});
  }
  editor.commands.setPayloadField(root()!.key,'linkedAnnotations',registry);
  for(const [key,properties]of texts)editor.commands.setPayloadField(key,'standoffProperties',properties);
 };
 const reattach=(t:ReplyTarget,provided?:TextRangeSnapshot)=>run(()=>{
  if(t.kind==='argument'){const d=(root()!.payload.linkedAnnotations as any)?.[t.argumentId];if(!d)throw Error('Argument unavailable');t={kind:'range',...d.metadata.dialecticArgument.anchor};}
  if(t.kind!=='range'||t.resourceId!==resourceId()||pending.has(t.anchorId))throw Error('Choose a committed range reference to reattach.');
  const range=selectionRange(provided),old=resolveReference(t),registry=structuredClone(unwrap(root()!.payload.linkedAnnotations??{})) as Record<string,unknown> as Record<string,any>;
  if(!registry[t.anchorId]||registry[t.anchorId].isDeleted)throw Error('Restore the missing anchor definition with Undo before reattaching.');
  const texts=new Map<string,any[]>();for(const s of old.segments??[])texts.set(s.node.key,(structuredClone(unwrap(s.node.payload.standoffProperties??[])) as any[]).filter((p:any)=>p.annotationId!==t.anchorId||p.type!==RANGE_ANCHOR));
  const n=session()!.projection.node(range.nodeKey)!;const properties=texts.get(n.key)??structuredClone(unwrap(n.payload.standoffProperties??[])) as any[];properties.push({id:crypto.randomUUID(),type:RANGE_ANCHOR,annotationId:t.anchorId,start:range.start,end:range.end-1});texts.set(n.key,properties);
  editor.commands.structuralTransaction('Reattach reply passage',()=>{for(const [key,p]of texts)editor.commands.setPayloadField(key,'standoffProperties',p);});preferred.set(targetKey(t),n.key);inspect(t);
 });
 const glosses=()=>references()?.overlapping(resolveReference(inspection()).segments??[])??[];
 const createGloss=()=>run(()=>{const segments=resolveReference(inspection()).segments;if(segments?.length!==1)throw Error('Select one passage segment to create a Gloss.');const s=segments[0];void editor.commandRegistry.execute('gloss.create',{targetKey:s.node.key,args:{selection:{anchor:s.start,head:s.end}}});});
 const pinGloss=(id:string)=>pin({kind:'gloss',resourceId:resourceId(),definitionId:id});
 const cancel=()=>{generation++;requestAbort?.abort();clearPreview();setBusy(false);};
 const exchangeTarget=()=>reply()??(inspection()&&!['entity','argument-relation','entity-relation'].includes(inspection()!.kind)?inspection():undefined)??(frontier()?target(frontier()!.id):undefined);
 const askDcp=async(transport:DcpTransport,explicit?:ReplyTarget,live?:LiveProvenance,lifecycle?:{commit():Promise<void>;cancel():Promise<void>})=>{
  if(busy())return;
  const participant={...aiParticipant()};let ticket=0,sources:DcpSources|undefined,requestForInspection:unknown;
  try{
   setNotice('');clearPreview();guard();const to=explicit??exchangeTarget();
   if(!to)throw Error('Submit a contribution or select a reply target first.');requireCommittedTarget(to);
   const selectedTargets=structuredClone(unwrap(context())),targets=[to,...selectedTargets.filter(t=>targetKey(t)!==targetKey(to))];
   for(const t of targets)if(!['gloss','entity','argument-relation','entity-relation'].includes(t.kind))requireCommittedTarget(t);
   const captured=capture(targets),source=session()!,exchangeId=crypto.randomUUID();
   ticket=++generation;requestAbort=new AbortController();setLastProviderExchange(undefined);setBusy(true);setDcpPreview('Preparing structured exchange…');
   sources=new DcpSources(editor,resourceId(),function*(fromOrdinal=1){const rows=committed();let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if((rows[mid].data.ordinal??0)<fromOrdinal)lo=mid+1;else hi=mid;}for(let i=lo;i<rows.length;i++)yield source.projection.node(rows[i].key)!;},key=>source.projection.node(key),key=>source.projection.parentOf(key),t=>resolveReference(t),requestAbort.signal,id=>references()!.relationsFor(id),live?liveLimits.deadlineMs:30000,id=>references()!.argumentsFor(id),vocabularySelection(),references());
   for(const key of captured.revisions.keys())sources.fence(key);
   const primary=sources.issue(to),selected=selectedTargets.map(t=>sources!.issue(t));
   const structuralContext=await sources.manifest([primary,...selected],editor.features.dcpSemanticWorkspace&&editor.features.scopedSemantics?64000-8192:64000);
   if(!alive||ticket!==generation||session()!==source)return;sources.check();
   const request=dcpRequest(exchangeId,primary,selected,captured.items.map(item=>({handle:sources!.issue(item.target),plainTextExcerpt:item.text})),editor.visualEffects,editor.features.scopedSemantics,sources.capabilities,editor.features.dcpNativeAuthoringStage1,editor.features.dcpNativeAuthoringStage2Text,editor.features.dcpNativeAuthoringStage2Layouts,editor.features.dcpNativeAuthoringStage2Compounds,editor.features.dcpNativeAuthoringStage2Widgets,managedImagesEnabled(editor),editor.features.dcpNativeAuthoringStage3ExternalMedia,retainedPdfsEnabled(editor),sources.vocabulary);
   const proactiveSemantics=editor.features.dcpProactiveSemanticAuthoring?1 as const:undefined;
   Object.assign(request.authoring,{emptySemanticFields:emptySemanticFieldsVersion,...(proactiveSemantics?{proactiveSemantics}: {})});
   requestForInspection=request;Object.assign(request,{structuralContext,task:{action:'respond',focus:primary,participantRequest:structuralContext.sources[0]?.sourceAuthor==='human'?{handle:primary,text:captured.items[0].text}:null}});
   if(editor.features.dcpSemanticWorkspace&&editor.features.scopedSemantics){enableSemanticWorkspace(request);Object.assign(request,{semanticWorkspace:await semanticWorkspace(sources,participant.id,structuralContext.sources.map((s:any)=>s.target).filter(Boolean))});}
   if(!alive||ticket!==generation||session()!==source)return;sources.check();
   if(live){request.cadence=live.settings.cadence;request.protocolKey={...request.protocolKey,version:request.protocolKey.version+'-c1'};}
   if(live&&editor.features.dcpXmlAuthoring){sources.xmlAuthoring=new XmlContext(sources,exchangeId);Object.assign(request,{dialect:xmlDialect,xmlContext:sources.xmlAuthoring.request(request)});}
   let prepared:Awaited<ReturnType<typeof prepareDcp>>|undefined;
   const validate=async(raw:string)=>{sources!.check();prepared=await prepareDcp(sources!.xmlAuthoring?JSON.stringify(sources!.xmlAuthoring.lower(raw)):raw,exchangeId,resourceId(),editor.visualEffects,sources!,editor.features.scopedSemantics,live?'ai':'mock',participant.id,emptySemanticFieldsVersion,proactiveSemantics,!!sources!.xmlAuthoring);};
   if(live)await logNative(resourceId(),committed().map(row=>source.projection.node(row.key)!.contentKey),'exchange.native-context');
   const raw=await receive(transport,request,sources,value=>{if(alive&&ticket===generation)streamPreview(value,ticket);},requestAbort,live?validate:undefined,live?liveLimits.deadlineMs:30000);
   if(!alive||ticket!==generation)return;
   if(session()!==source)throw Error('Conversation changed; DCP response discarded');guard();sources.check();
   if(!prepared)await validate(raw);const result=prepared!,d=draft();if(!d)throw Error('Restore the draft before adding a response');
   if(!alive||ticket!==generation||session()!==source)return;guard();sources.check();
   for(const t of targets)if(t.kind==='range'){
    const p=pending.get(t.anchorId);if(!p)continue;editor.textRanges.validate([p.range],'cell');result.definitions[t.anchorId]=p.definition;
    let properties=result.annotations.get(p.range.nodeKey);if(!properties)result.annotations.set(p.range.nodeKey,properties=[]);
    properties.push({id:crypto.randomUUID(),type:RANGE_ANCHOR,annotationId:t.anchorId,start:p.range.start,end:p.range.end-1});
   }
   for(const item of captured.manifest)item.origins=[...(targetKey(item.target)===targetKey(to)?['reply-target' as const]:[]),...(selectedTargets.some(t=>targetKey(t)===targetKey(item.target))?['selected' as const]:[])];
   const repaired=editor.features.dialecticContributionActivity?repairedNotice(live):undefined;
   const id=crypto.randomUUID(),ordinal=nextOrdinal(),data={version:1,kind:'contribution',state:'committed',author:live?'ai':'mock',participant:{...participant,name:live?participant.name:'Mock assistant'},ordinal,createdUtc:new Date().toISOString(),replies:[to],discursiveReferences:result.discursiveReferences,context:targets,requestId:exchangeId,...(repaired?{notices:[repaired]}:{}),
    replyExcerpts:to.kind==='range'||to.kind==='argument'?[{target:to,text:captured.items[0].text}]:[],consumedContext:{version:1,items:captured.manifest,limits:{characters:6000,blocks:512}},
    dcp:{version:1,profile:request.profile,request,tools:sources.trail,response:raw,...(sources.xmlAuthoring?{xmlBindings:sources.xmlAuthoring.bindings()}:{}),identityMap:result.aliases,annotationRefs:result.annotationRefs,intent:result.intent,...(live?{provider:live}:{})}};
   const started=performance.now();
   editor.commands.boundedStructuralTransaction(live?'Add DCP AI response':'Add DCP mock response',()=>{
    result.preparedResources.check();
    if(Object.keys(result.definitions).length)editor.commands.setPayloadField(root()!.key,'linkedAnnotations',{...structuredClone(unwrap(root()!.payload.linkedAnnotations??{})) as Record<string,unknown>,...result.definitions});
    for(const [key,added]of result.annotations){const n=source.projection.node(key);if(!n)throw Error('Anchor source unavailable');editor.commands.setPayloadField(key,'standoffProperties',[...structuredClone(unwrap(n.payload.standoffProperties??[])) as any[],...added]);}
    const dto={id,type:'container-block',metadata:{dialectic:JSON.parse(JSON.stringify(data))},children:result.children};
    if(result.preparedResources.leaves.size)editor.commands.insertFragment(composePreparedLeaves(dto,result.preparedResources.leaves,compositionLimits.nodes+1,compositionLimits.outputCells),{kind:'before',anchorKey:d.key});
    else editor.commands.insert(dto,{kind:'before',anchorKey:d.key});
   });
   dcpDiagnostics.commitMs=performance.now()-started;dcpDiagnostics.exchanges++;dcpDiagnostics.reads+=sources.diagnostics.reads;dcpDiagnostics.searches+=sources.diagnostics.searches;dcpDiagnostics.visited+=sources.diagnostics.visited;
   submissionSave.request(resourceId());
   for(const t of targets)if(t.kind==='range')pending.delete(t.anchorId);
   if(live)await providers.diagnostic({kind:'exchange.materialised',documentId:resourceId(),exchangeId,contributionId:id,identityMap:result.aliases,annotationRefs:result.annotationRefs,discursiveReferences:result.discursiveReferences,definitions:result.definitions}).catch(()=>{if(alive)setProviderNotice('DCP diagnostic logging failed.');});
   const authored=source.projection.node(resolve(target(id))!.key)!;await logNative(resourceId(),[authored.contentKey],'contribution.committed');
   diagnostics.submissions++;clearPreview();inspect(target(id));
   try{await lifecycle?.commit();}catch{setNotice('Contribution committed locally. Provider memory acknowledgement is pending; the next Ask will reconcile or rebuild from this Document.');}
  }catch(e){if(live){live.failure??={message:String(e).slice(0,1000)};live.request??=requestForInspection;live.tools??=sources?.trail;}if(alive&&ticket===generation)setNotice(String(e));else if(!ticket&&alive)setNotice(String(e));}finally{await lifecycle?.cancel();sources?.dispose();if(ticket===generation){if(live){setLastProviderExchange(structuredClone(unwrap(live)));await providers.diagnostic({kind:'exchange.outcome',documentId:live.resourceId,exchangeId:live.exchangeId,details:structuredClone(unwrap(live))}).catch(()=>{if(alive)setProviderNotice('DCP diagnostic logging failed.');});}setBusy(false);}}
 };
 const askMock=async(transport:DcpTransport=mockTransport,explicit?:ReplyTarget)=>{
  if(editor.features.dialecticDcp)return askDcp(transport,explicit);
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
   editor.commands.structuralTransaction('Add mock response',()=>{persistRanges(targets);editor.commands.insert({id,type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'committed',author:'mock',participant:defaultParticipant(resourceId(),'ai'),ordinal,createdUtc:new Date().toISOString(),replies:[to],context:targets,requestId,replyExcerpts:to.kind==='range'||to.kind==='argument'?[{target:to,text:captured.items[0].text}]:[],consumedContext:{version:1,items:captured.manifest,limits:{characters:6000,blocks:512}}}},children:mockComposition(captured.items)},{kind:'before',anchorKey:d.key});});
   for(const t of targets)if(t.kind==='range')pending.delete(t.anchorId);
   submissionSave.request(resourceId());diagnostics.submissions++;inspect(target(id));
  }catch(e){if(alive)setNotice(String(e));}finally{if(ticket===generation)setBusy(false);}
 };
 const sequences=createSequenceController(editor,{root,resourceId,session,resolve,inspect,requireCommittedTarget,guard});
 const relationshipDetails=(t:ReplyTarget)=>{
  if(t.kind!=='argument-relation'&&t.kind!=='entity-relation')return undefined;
  const d=(root()?.payload.linkedAnnotations as any)?.[t.definitionId];if(!d||d.isDeleted)return undefined;
  const r=t.kind==='argument-relation'?d.metadata?.dialecticArgumentRelation:d.metadata?.scopedEntityRelation;if(!r)return undefined;
  const endpoint=(v:any):ReplyTarget=>t.kind==='argument-relation'?{kind:'argument',...v}:{kind:'entity',resourceId:resourceId(),entity:v};
  return {relation:r.relation,from:endpoint(r.from),to:endpoint(r.to)};
 };
 const entityDetails=(t:ReplyTarget)=>t.kind==='entity'&&t.entity.scope==='document'?(root()?.payload.linkedAnnotations as any)?.[t.entity.entityId]?.metadata?.scopedEntity?.entity:undefined;
 const aiParticipants=()=>{const initial={...defaultParticipant(resourceId(),'ai'),name:'AI participant'},entries=new Map([[initial.id,initial]]);for(const row of committed())if(row.data.author==='ai'&&row.data.participant?.kind==='ai')entries.set(row.data.participant.id,row.data.participant);return [...entries.values()];};
 const aiParticipant=()=>aiParticipants().find(p=>p.id===selectedAi())??aiParticipants()[0];
 const ask=async(explicit?:ReplyTarget)=>{if(providerConfiguring())return;if(providerMode()==='mock'||!editor.features.dialecticProviders||!editor.features.dialecticDcp)return askMock(mockTransport,explicit);if(!providerReady()){const doc=resourceId();await configureProvider(providerSettings());if(!alive||doc!==resourceId())return;if(!providerReady()){setNotice(providerNotice()||'Configure the AI provider in AI settings.');return;}}const participant=aiParticipant().id,doc=resourceId();const live=providers.transport(editor.features.dialecticProviderContinuity&&providerSettings().provider==='openai'?()=>{if(resourceId()!==doc)throw Error('Conversation changed');return history.build(doc,participant,committed().map(row=>session()!.projection.node(row.key)!.contentKey));}:undefined);return askDcp(live.run,explicit,live.details,live);};
 const [resending,setResending]=createSignal(false);
 const resend=async(id:string)=>{
  if(busy()||providerConfiguring()||resending())return;
  const row=rows().find(r=>r.id===id);if(!row)return;
  if(row.data.state==='draft'){await submitAndAsk();return;}
  setResending(true);
  try{
   guard();const captured=capture([target(id)]),text=captured.items[0].text.replace(/\n$/,'');if(!text.trim())throw Error('This contribution has no text to resend.');
   const current=draft();if(!current)throw Error('Restore the draft before resending.');
   const copy=draftContribution();copy.children=[textBlock(text)];copy.metadata={dialectic:{version:1,kind:'contribution',state:'committed',author:'human',participant:structuredClone(unwrap(current.data.participant??defaultParticipant(resourceId(),'human'))),ordinal:nextOrdinal(),createdUtc:new Date().toISOString(),replies:[]}};
   editor.commands.boundedStructuralTransaction('Resend contribution',()=>editor.commands.insert(copy,{kind:'before',anchorKey:current.key}));
   submissionSave.request(resourceId());
   const fresh=target(String(copy.id)),node=resolve(fresh)!;void logNative(resourceId(),[node.contentKey],'contribution.resent');diagnostics.submissions++;inspect(fresh);await ask(fresh);
  }catch(error){if(alive)setNotice(String(error));}finally{setResending(false);}
 };
 const submitAndAsk=async(transport?:DcpTransport)=>{if(providerConfiguring()||resending())return;const submitted=submit();if(submitted){if(transport)await askMock(transport,submitted as ReplyTarget);else await ask(submitted as ReplyTarget);}};
 return {inspectEntityMention,titleNotice:titles.notice,titlePending:titles.pending,saveState,retrySave,pasting,activityInspection,inspectActivity,inspectActivityItem,contributionActivity,activityDiagnostics,vocabularySelection,configureVocabulary,vocabularyDescriptors:()=>vocabularyDescriptors(editor),resend,resending,annotationDetails,inspectedAnnotation,inspectAnnotation,lastProviderExchange,ask,providerMode,setProviderMode,providerReady,providerSettings,providerNotice,providerConfiguring,configureProvider,forgetProvider,exchangeTarget,relationshipDetails,entityDetails,submitAndAsk,sequences,editor,port,session,root,resourceId,valid,rows,committed,frontier,draft,diagnostics,inspection,reply,context,notice,busy,trail,cursor,label,target,resolve,run,inspect,navigate,present,compose,pin,unpin,setReply:(t:ReplyTarget|undefined)=>setReply(t&&structuredClone(unwrap(t))),focusBlock,submit,askMock,cancel,argumentRelations:(id:string)=>references()?.relationsFor(id)??[],
  references,resolveReference,selectRange,reattach,glosses,createGloss,pinGloss,dcpPreview,dcpDiagnostics,aiParticipants,aiParticipant,setSelectedAi,historyDiagnostics:history.diagnostics,
  dispose(){titles.dispose();submissionSave.dispose();sequences.dispose();alive=false;cancel();providers.dispose();history.dispose();choices.clear();pending.clear();preview.dispose();for(const entry of activities.values())entry.dispose();activities.clear();},capture,
 };
}
export type DialecticController=ReturnType<typeof createDialecticController>;
