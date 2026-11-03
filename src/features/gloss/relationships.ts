import {clone} from '../../block-tree/clone';
export const relationshipTypes=['supports','opposes','qualifies','elaborates','references','depends-on','answers'];
export interface UnresolvedGlossTarget {version:1;reason:'outside-copy';originGlossId:string;originResourceId?:string}
export interface GlossRelationship {version?:1;type:string;toGlossId:string;metadata?:Record<string,unknown>;unresolvedTarget?:UnresolvedGlossTarget;[key:string]:unknown}
export const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const safeId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=512&&!['__proto__','prototype','constructor'].includes(v);
export function relationshipType(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||[...value.trim()].length>128||/[\r\n\u0000-\u001f]/.test(value))throw Error('Use a nonempty, single-line relationship type of at most 128 characters.');
 return value.trim();
}
export function decodeRelationship(raw:unknown):{value?:GlossRelationship;diagnostic?:string}{
 if(!object(raw))return{diagnostic:'invalid-relationship'};
 if(raw.version!==undefined&&raw.version!==1)return{diagnostic:'unsupported-version'};
 try{if(relationshipType(raw.type)!==raw.type||!safeId(raw.toGlossId))return{diagnostic:'invalid-relationship'};}catch{return{diagnostic:'invalid-relationship'};}
 if(raw.unresolvedTarget!==undefined){const d=raw.unresolvedTarget;if(!object(d)||d.version!==1||d.reason!=='outside-copy'||!safeId(d.originGlossId)||d.originResourceId!==undefined&&!safeId(d.originResourceId))return{diagnostic:'invalid-unresolved-descriptor'};}
 return{value:raw as GlossRelationship};
}
/** Independent copies never bind outside their copied, uniquely identified closure.
 * Opaque payloads survive untouched except for an additive provenance descriptor. */
export function copyGlossIdentities(definitions:any[],originResourceId?:string){
 const counts=new Map<string,number>(),mapping=new Map<string,string>();
 for(const d of definitions){const id=d.metadata.gloss.localId;counts.set(id,(counts.get(id)??0)+1);}
 for(const d of definitions){const g=d.metadata.gloss,old=g.localId;g.localId=crypto.randomUUID();if(counts.get(old)===1)mapping.set(old,g.localId);}
 for(const d of definitions){const g=d.metadata.gloss;g.links=Object.fromEntries(Object.entries(g.links).map(([,raw])=>{
  const next=clone(raw),decoded=decodeRelationship(next);
  if(decoded.value&&!decoded.value.unresolvedTarget&&mapping.has(decoded.value.toGlossId))decoded.value.toGlossId=mapping.get(decoded.value.toGlossId)!;
  else if(object(next)&&next.unresolvedTarget===undefined&&safeId(next.toGlossId))next.unresolvedTarget={version:1,reason:'outside-copy',originGlossId:next.toGlossId,...(originResourceId?{originResourceId}:{})};
  return[crypto.randomUUID(),next];
 }));}
}
