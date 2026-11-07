import {RANGE_ANCHOR,rangeDefinition} from '../features/dialectic/anchors';
import {glossOwner} from './gloss-plan';
import type {StructuralEvidence} from './structural-plan';
import type {ContentRecord,RepositoryOperation,RepositoryState} from './types';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function dialecticRangePayloadOnly(old:ContentRecord|undefined,next:ContentRecord):boolean {
 if(!old||next.inlineKind!=='standoff')return false;
 const strip=(r:ContentRecord)=>({...r,revision:0,payload:{...r.payload,standoffProperties:undefined}});
 if(!same(strip(old),strip(next)))return false;
 const p=old.payload.standoffProperties??[],q=next.payload.standoffProperties??[];
 return Array.isArray(p)&&Array.isArray(q)&&!same(p,q)&&same(p.filter(x=>x.type!==RANGE_ANCHOR),q.filter(x=>x.type!==RANGE_ANCHOR));
}
/** Permit only valid range-definition deltas on one existing Document. Remaining
 * structure is independently proved by structuralChangeFor, including inverses. */
export function dialecticRangeRoot(state:RepositoryState,ops:RepositoryOperation[],e:StructuralEvidence):ContentRecord|undefined {
 const roots=ops.filter(o=>o.kind==='put-content'&&o.record.viewType==='document-block') as Extract<RepositoryOperation,{kind:'put-content'}>[];
 if(roots.length!==1)return;
 const root=roots[0].record,prior=state.contents[root.key];if(!prior)return;
 const a:any=prior.payload.linkedAnnotations??{},b:any=root.payload.linkedAnnotations??{};
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return;
 let changed=false;
 for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[id],b[id])){
  changed=true;if(a[id]&&!rangeDefinition(a[id])||b[id]&&(!rangeDefinition(b[id])||b[id].id!==id))return;
 }
 if(!changed)return;
 for(const op of ops)if(op.kind==='put-content'&&op.record.inlineKind==='standoff'){
  const c=op.record,old=state.contents[c.key];
  const p=c.payload.standoffProperties??[],q=old?.payload.standoffProperties??[];
  if(!Array.isArray(p)||!Array.isArray(q))return;
  const anchors=p.filter(x=>x.type===RANGE_ANCHOR);
  if(!anchors.length&&!q.some(x=>x.type===RANGE_ANCHOR))continue;
  if(!old||glossOwner(state,c.key,e)!==root.key)return;
  for(const x of anchors)if(!rangeDefinition(b[x.annotationId])||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end<x.start||x.end>=c.inlineContent.length||x.isZeroWidth)return;
 }
 // Strip only the independently validated registry change for structural proof.
 return {...root,payload:{...root.payload,linkedAnnotations:prior.payload.linkedAnnotations}};
}
