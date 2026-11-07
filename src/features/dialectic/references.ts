import {createSignal,untrack,type Accessor} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {BlockTreeProjection} from '../../block-tree/projection';
import type {BlockNode,ContentRecord} from '../../block-tree/types';
import {glossOwner} from '../../block-tree/gloss-plan';
import {glossDefinition,GLOSS} from '../gloss/model';
import {RANGE_ANCHOR,rangeDefinition} from './anchors';
import {contribution,type ReplyTarget} from './model';
export interface Segment {contentKey:string;id:string;start:number;end:number;node:BlockNode}
export interface Resolution {status:'resolved'|'unanchored'|'missing'|'ambiguous'|'invalid'|'outside-document';reason?:string;node?:BlockNode;segments?:Segment[];text?:string;historical?:string;changed?:boolean}
type Entry={record:ContentRecord;edges:Map<string,string>;anchors:Set<string>};
/** One derived index per retained Document session. Only affected canonical
 * records and inserted/removed subtrees are read after initialisation. */
export class DialecticReferences {
 readonly diagnostics={treeVisits:0,propertyReads:0,recordUpdates:0};
 private entries=new Map<string,Entry>();private blocks=new Map<string,Set<string>>();private anchors=new Map<string,Set<string>>();
 private stamps=new Map<string,{get:Accessor<number>;bump:()=>void}>();private stop:()=>void;
 private evidence={locationOf:(k:string)=>this.editor.repository.locationOf(k),ownedKeys:(k:string)=>this.editor.repository.ownedPlacementKeys(k)};
 readonly owner:string;readonly resourceId:string;
 constructor(readonly editor:ReactiveEditor,readonly projection:BlockTreeProjection,readonly rootKey:string){
  const root=projection.node(rootKey)!;this.owner=root.contentKey;this.resourceId=String((root.payload.metadata as any)?.documentId??root.payload.id);
  this.visit(this.owner);
  this.stop=editor.repository.subscribeChanges(change=>untrack(()=>{
   if(change.structural?.sequenceMetadataOwner)return;
   for(const [key,old]of change.previousContents){
    const next=editor.repository.readState().contents[key];
    if(next?.viewType==='text-cell'||next?.viewType==='image-cell'||!next&&['text-cell','image-cell'].includes(old?.viewType??''))continue;
    if(this.entries.has(key)||this.belongs(key))this.update(key);
   }
  }));
 }
 private stamp(id:string){let s=this.stamps.get(id);if(!s){const [get,set]=createSignal(0);s={get,bump:()=>set(n=>n+1)};this.stamps.set(id,s);}return s;}
 private belongs(key:string){return !!this.projection.nodesForContent(key).length&&glossOwner(this.editor.repository.readState(),key,this.evidence)===this.owner;}
 private edgeMap(c:ContentRecord){const state=this.editor.repository.readState();return new Map([...c.children,...Object.values(c.ownedRelations)].flatMap(k=>{const p=state.placements[k];return p&&!p.externalReference?[[k,p.contentKey] as const]:[];}));}
 private visit(key:string){if(this.entries.has(key)||!this.belongs(key))return;this.diagnostics.treeVisits++;this.update(key);}
 private remove(key:string){const old=this.entries.get(key);if(!old)return;this.entries.delete(key);this.blocks.get(String(old.record.payload.id))?.delete(key);this.stamp('b:'+String(old.record.payload.id)).bump();for(const id of old.anchors){this.anchors.get(id)?.delete(key);this.stamp('a:'+id).bump();}for(const child of old.edges.values())if(!this.belongs(child))this.remove(child);}
 private update(key:string){
  const old=this.entries.get(key),c=this.editor.repository.readState().contents[key];if(!c||!this.belongs(key)){this.remove(key);return;}
  this.diagnostics.recordUpdates++;
  const edges=this.edgeMap(c),ids=new Set<string>();
  if(c.inlineKind==='standoff'){this.diagnostics.propertyReads++;for(const p of (c.payload.standoffProperties??[]) as any[])if(p.type===RANGE_ANCHOR&&!p.isDeleted&&typeof p.annotationId==='string')ids.add(p.annotationId);}
  for(const id of new Set([...old?.anchors??[],...ids])){let keys=this.anchors.get(id);if(!keys)this.anchors.set(id,keys=new Set());ids.has(id)?keys.add(key):keys.delete(key);this.stamp('a:'+id).bump();}
  const id=String(c.payload.id);if(old&&old.record.payload.id!==id)this.blocks.get(String(old.record.payload.id))?.delete(key);
  let keys=this.blocks.get(id);if(!keys)this.blocks.set(id,keys=new Set());keys.add(key);
  this.entries.set(key,{record:c,edges,anchors:ids});this.stamp('b:'+id).bump();
  if(key===this.owner){const before:any=old?.record.payload.linkedAnnotations??{},after:any=c.payload.linkedAnnotations??{};if(before!==after)for(const id of new Set([...Object.keys(before),...Object.keys(after)]))if(JSON.stringify(before[id])!==JSON.stringify(after[id]))this.stamp('a:'+id).bump();}
  for(const [pk,child]of old?.edges??[])if(!edges.has(pk)&&!this.belongs(child))this.remove(child);
  for(const [pk,child]of edges)if(!old?.edges.has(pk))this.visit(child);
 }
 node(contentKey:string,preferred?:string){const nodes=this.projection.nodesForContent(contentKey);return nodes.find(n=>n.key===preferred)??nodes[0];}
 text(contentKey:string,start=0,end?:number){const state=this.editor.repository.readState(),c=state.contents[contentKey];return c?.inlineContent.slice(start,end).map(pk=>{const cell=state.contents[state.placements[pk]?.contentKey];return cell?.viewType==='text-cell'?String(cell.payload.text??''):'\ufffc';}).join('')??'';}
 resolve(t:ReplyTarget,preferred?:string):Resolution {
  if(!t||typeof t.resourceId!=='string'||!['range','gloss','block','contribution'].includes(t.kind)||
   typeof (t.kind==='range'?t.anchorId:t.kind==='gloss'?t.definitionId:t.blockId)!=='string')return {status:'invalid',reason:'Unsupported reference descriptor.'};
  if(t.resourceId!==this.resourceId)return {status:'outside-document',reason:'Target belongs to another Document.'};
  if(t.kind==='range'||t.kind==='gloss'){
   const id=t.kind==='range'?t.anchorId:t.definitionId;this.stamp('a:'+id).get();
   const registry=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations as Record<string,any>|undefined;
   const d=registry?.[id];
   if(!d)return {status:'missing',reason:'Definition is unavailable.'};
   if(t.kind==='gloss')return glossDefinition(d)&&!d.isDeleted?{status:'resolved',text:String(d.value)}:{status:'invalid',reason:'Gloss is unavailable.'};
   if(!rangeDefinition(d))return {status:'invalid',reason:'Unsupported range anchor.'};
   const historical=d.metadata.dialecticRange.excerpt,segments:Segment[]=[];
   if(d.isDeleted)return {status:'unanchored',historical,reason:'The anchor definition is deleted.'};
   for(const key of this.anchors.get(id)??[]){const c=this.editor.repository.readState().contents[key],node=this.node(key,preferred);if(!c||!node)continue;
    for(const p of (c.payload.standoffProperties??[]) as any[])if(p.type===RANGE_ANCHOR&&p.annotationId===id&&!p.isDeleted){
     if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<p.start||p.end>=c.inlineContent.length||p.externalDefinition)return {status:'invalid',reason:'Range coordinates or ownership are invalid.',historical};
     segments.push({contentKey:key,id:String(p.id),start:p.start,end:p.end+1,node});
    }
   }
   // Document order from ancestry, without traversing text or unrelated Blocks.
   const path=(n:BlockNode)=>{const result:number[]=[];let child=n;for(let p=this.projection.parentOf(child.key);p;p=this.projection.parentOf(child.key)){result.unshift([...p.children,...Object.values(p.ownedRelations)].indexOf(child.key));child=p;}return result;};
   segments.sort((a,b)=>{const x=path(a.node),y=path(b.node);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length||a.start-b.start;});
   if(!segments.length)return {status:'unanchored',reason:'The source passage has no surviving segments.',historical};
   // A join can retain adjacent segments; their source text has no artificial separator.
   let text='';segments.forEach((s,i)=>{const prior=segments[i-1];if(prior&&(prior.contentKey!==s.contentKey||prior.end!==s.start))text+='\n';text+=this.text(s.contentKey,s.start,s.end);});
   return {status:'resolved',segments,node:segments[0].node,text,historical,changed:text!==historical};
  }
  this.stamp('b:'+t.blockId).get();const keys=[...this.blocks.get(t.blockId)??[]];if(keys.length!==1)return {status:keys.length?'ambiguous':'missing',reason:'Block identity is missing or ambiguous.'};
  const node=this.node(keys[0],preferred);if(!node)return {status:'missing'};
  if(t.kind==='contribution'&&!contribution((node.payload.metadata as any)?.dialectic))return {status:'invalid',reason:'Target is no longer a contribution.'};
  return {status:'resolved',node};
 }
 overlapping(segments:Segment[]){const definitions:any=this.editor.repository.readState().contents[this.owner]?.payload.linkedAnnotations??{},ids=new Set<string>();for(const s of segments)for(const p of (this.editor.repository.readState().contents[s.contentKey]?.payload.standoffProperties??[]) as any[])if(p.type===GLOSS&&!p.isDeleted&&p.start<s.end&&p.end>=s.start&&glossDefinition(definitions[p.annotationId])&&!definitions[p.annotationId].isDeleted)ids.add(p.annotationId);return [...ids].map(id=>({id,value:String(definitions[id].value)}));}
 dispose(){this.stop();this.entries.clear();this.blocks.clear();this.anchors.clear();this.stamps.clear();}
}
