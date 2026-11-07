import {RANGE_ANCHOR,rangeDefinition} from '../features/dialectic/anchors';
import {glossOwner} from './gloss-plan';
import type {StructuralEvidence} from './structural-plan';
import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';
const dcpProperty=(p:any)=>typeof p?.type==='string'&&/^dialectic\/(claim|question|speculation|suggestion|objection|qualification|unknown-semantic)$/.test(p.type)&&p.metadata?.dcp?.protocol==='dcp/1.0'&&p.metadata.dcp.actor==='mock'&&typeof p.metadata.dcp.exchangeId==='string';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function dialecticRangePayloadOnly(old:ContentRecord|undefined,next:ContentRecord):boolean {
 if(!old||next.inlineKind!=='standoff')return false;
 const strip=(r:ContentRecord)=>({...r,revision:0,payload:{...r.payload,standoffProperties:undefined}});
 if(!same(strip(old),strip(next)))return false;
 const p=old.payload.standoffProperties??[],q=next.payload.standoffProperties??[];
 return Array.isArray(p)&&Array.isArray(q)&&!same(p,q)&&same(p.filter(x=>x.type!==RANGE_ANCHOR&&!dcpProperty(x)),q.filter(x=>x.type!==RANGE_ANCHOR&&!dcpProperty(x)));
}
/** Permit only valid range-definition deltas on one existing Document. Remaining
 * structure is independently proved by structuralChangeFor, including inverses. */
export function dialecticRangeRoot(state:RepositoryState,ops:RepositoryOperation[],e:StructuralEvidence):ContentRecord|undefined {
 const roots=ops.filter(o=>o.kind==='put-content'&&o.record.viewType==='document-block') as Extract<RepositoryOperation,{kind:'put-content'}>[];
 if(roots.length!==1)return;
 const root=roots[0].record,prior=state.contents[root.key];if(!prior)return;
 const a:any=prior.payload.linkedAnnotations??{},b:any=root.payload.linkedAnnotations??{};
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return;
 const resourceId=String((root.payload.metadata as any)?.documentId??root.payload.id);
 const records=new Map(ops.flatMap(o=>o.kind==='put-content'?[[o.record.key,o.record] as const]:[]));
 const placements=new Map(ops.flatMap(o=>o.kind==='put-placement'?[[o.record.key,o.record] as const]:[]));
 const parents=new Map<string,string>();
 for(const c of records.values())for(const pk of [...c.children,...c.inlineContent,...Object.values(c.ownedRelations)]){const p=placements.get(pk)??state.placements[pk];if(p)parents.set(p.contentKey,c.key);}
 const owned=(key:string)=>{const seen=new Set<string>();while(key!==root.key){if(seen.has(key))return false;seen.add(key);const parent=parents.get(key);if(!parent)return !!state.contents[key]&&glossOwner(state,key,e)===root.key;if((records.get(parent)??state.contents[parent])?.viewType==='document-block'&&parent!==root.key)return false;key=parent;}return true;};
 let changed=false;
 for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[id],b[id])){
  changed=true;if(a[id]&&!rangeDefinition(a[id])||b[id]&&(!rangeDefinition(b[id])||b[id].id!==id||b[id].metadata.dialecticRange.source.resourceId!==resourceId))return;
 }
 if(!changed)return;
 for(const op of ops)if(op.kind==='put-content'&&op.record.inlineKind==='standoff'){
  const c=op.record,old=state.contents[c.key];
  const p=c.payload.standoffProperties??[],q=old?.payload.standoffProperties??[];
  if(!Array.isArray(p)||!Array.isArray(q))return;
  for(const x of p.filter(dcpProperty))if(!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end<x.start||x.end>=c.inlineContent.length)return;
  const anchors=p.filter(x=>x.type===RANGE_ANCHOR);
  if(!anchors.length&&!q.some(x=>x.type===RANGE_ANCHOR))continue;
  if(!owned(c.key))return;
  for(const x of anchors)if(!rangeDefinition(b[x.annotationId])||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end<x.start||x.end>=c.inlineContent.length||x.isZeroWidth)return;
 }
 // Strip only the independently validated registry change for structural proof.
 return {...root,payload:{...root.payload,linkedAnnotations:prior.payload.linkedAnnotations}};
}
