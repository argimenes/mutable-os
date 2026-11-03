import {batch,createSignal,type Accessor,type Setter} from 'solid-js';
import {clone} from '../../block-tree/clone';
import {glossDefinition} from './model';
import {decodeRelationship,safeId} from './relationships';
import type {GlossChange} from '../../block-tree/gloss-plan';
export interface GlossNode {definitionId:string;localId:string;raw:string;alias?:string;deleted:boolean}
export interface GlossEdge {key:string;id:string;sourceDefinitionId:string;sourceGlossId:string;targetGlossId?:string;type?:string;raw:unknown;token:string;diagnostics:string[];active:boolean}
export interface GlossRelations {incoming:GlossEdge[];outgoing:GlossEdge[];activeIncoming:GlossEdge[];activeOutgoing:GlossEdge[]}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const address=(definitionId:string,id:string)=>JSON.stringify([definitionId,id]);
/** Disposable, Document-local derived data. No canonical writes or DOM work. */
export class GlossGraphIndex {
 readonly diagnostics={definitionReads:0,edgeDecodes:0,edgeEvaluations:0,nodePublications:0,summaryPublications:0};
 private problemEdges=new Map<string,GlossEdge>();
 private problemSignal=createSignal<GlossEdge[]>([]);
 readonly issues=this.problemSignal[0];
 private typeCounts=new Map<string,number>();
 private typesSignal=createSignal<string[]>([]);
 readonly types=this.typesSignal[0];
 private changeType(type:string|undefined,delta:number){if(!type)return;const count=(this.typeCounts.get(type)??0)+delta;if(count)this.typeCounts.set(type,count);else this.typeCounts.delete(type);}
 private definitions=new Map<string,GlossNode>();
 private local=new Map<string,Set<string>>();
 private edges=new Map<string,GlossEdge>();
 private decoded=new Map<string,ReturnType<typeof decodeRelationship>>();
 private edgeIds=new Map<string,Set<string>>();
 private sources=new Map<string,Set<string>>();
 private incoming=new Map<string,Set<string>>();private outgoing=new Map<string,Set<string>>();
 private nodeSignals=new Map<string,[Accessor<GlossNode[]>,Setter<GlossNode[]>]>();
 private summaries=new Map<string,[Accessor<GlossRelations>,Setter<GlossRelations>]>();
 private nodeState(id:string){return [...this.local.get(id)??[]].map(k=>this.definitions.get(k)!);}
 nodes(id:string){let signal=this.nodeSignals.get(id);if(!signal){signal=createSignal(this.nodeState(id));this.nodeSignals.set(id,signal);}return signal[0]();}
 private summary(id:string):GlossRelations {const incoming=[...this.incoming.get(id)??[]].map(k=>this.edges.get(k)!),outgoing=[...this.outgoing.get(id)??[]].map(k=>this.edges.get(k)!);return{incoming,outgoing,activeIncoming:incoming.filter(e=>e.active),activeOutgoing:outgoing.filter(e=>e.active)};}
 relations(id:string){let signal=this.summaries.get(id);if(!signal){signal=createSignal(this.summary(id));this.summaries.set(id,signal);}return signal[0]();}
 allEdges(){return [...this.edges.values()];} // Explicit inventory/export, never used by typing.
 allNodes(){return [...this.definitions.values()];}
 edge(id:string){const keys=this.edgeIds.get(id);if(!keys?.size)throw Error('Relationship is missing.');if(keys.size!==1)throw Error('Relationship identity is ambiguous.');return this.edges.get([...keys][0])!;}
 unique(id:string,live=true){const nodes=this.nodeState(id);if(nodes.length!==1)throw Error(nodes.length?'Gloss identity is ambiguous.':'Gloss is not in this Document.');if(live&&nodes[0].deleted)throw Error('Gloss is deleted. Restore it first.');return nodes[0];}
 constructor(registry:Record<string,unknown>){this.apply(registry);}
 private add(map:Map<string,Set<string>>,id:string,key:string){const values=map.get(id)??new Set();values.add(key);map.set(id,values);}
 private remove(map:Map<string,Set<string>>,id:string,key:string){const values=map.get(id);values?.delete(key);if(!values?.size)map.delete(id);}
 apply(registry:Record<string,any>,proof?:GlossChange){
  const ids=proof?.definitions??[...new Set([...this.definitions.keys(),...Object.keys(registry)])],affected=new Set<string>(),identityChanges=new Set<string>(),evaluate=new Set<string>(),changedEdgeIds=new Set<string>(),problemCandidates=new Set<string>();
  batch(()=>{
   for(const id of ids){this.diagnostics.definitionReads++;const prior=this.definitions.get(id),raw=registry[id],next:GlossNode|undefined=glossDefinition(raw)?{definitionId:id,localId:raw.metadata.gloss.localId,raw:raw.value,alias:raw.metadata.gloss.alias,deleted:!!raw.isDeleted}:undefined;
    if(prior)affected.add(prior.localId);if(next)affected.add(next.localId);
    if(prior?.localId!==next?.localId||prior?.deleted!==next?.deleted){if(prior)identityChanges.add(prior.localId);if(next)identityChanges.add(next.localId);}
    if(!equal(prior,next)){if(prior)this.remove(this.local,prior.localId,id);if(next){this.definitions.set(id,next);this.add(this.local,next.localId,id);}else this.definitions.delete(id);}
    const changes=proof?.edges.filter(e=>e.definitionId===id).map(e=>e.id);
    const edgeKeys=changes&&prior&&next&&prior.localId===next.localId?changes:[...new Set([...[...this.sources.get(id)??[]].map(k=>this.edges.get(k)!.id),...Object.keys(next?raw.metadata.gloss.links:{})])];
    for(const edgeId of edgeKeys){const key=address(id,edgeId),old=this.edges.get(key);changedEdgeIds.add(edgeId);
     problemCandidates.add(key);if(old){this.changeType(old.type,-1);affected.add(old.sourceGlossId);if(old.targetGlossId)affected.add(old.targetGlossId);this.remove(this.edgeIds,edgeId,key);this.remove(this.sources,id,key);this.remove(this.outgoing,old.sourceGlossId,key);if(old.targetGlossId)this.remove(this.incoming,old.targetGlossId,key);this.edges.delete(key);this.decoded.delete(key);}
     if(!next||!Object.hasOwn(raw.metadata.gloss.links,edgeId))continue;
     this.diagnostics.edgeDecodes++;const value=clone(raw.metadata.gloss.links[edgeId]),decoded=decodeRelationship(value),edge:GlossEdge={key,id:edgeId,sourceDefinitionId:id,sourceGlossId:next.localId,targetGlossId:decoded.value?.toGlossId,type:decoded.value?.type,raw:value,token:JSON.stringify([id,value]),diagnostics:[],active:false};
     this.changeType(edge.type,1);this.decoded.set(key,decoded);this.edges.set(key,edge);this.add(this.edgeIds,edgeId,key);this.add(this.sources,id,key);this.add(this.outgoing,next.localId,key);if(edge.targetGlossId){this.add(this.incoming,edge.targetGlossId,key);affected.add(edge.targetGlossId);}evaluate.add(key);
    }
   }
   for(const id of identityChanges)for(const key of [...this.incoming.get(id)??[],...this.outgoing.get(id)??[]])evaluate.add(key);
   for(const id of changedEdgeIds)for(const key of this.edgeIds.get(id)??[])evaluate.add(key);
   for(const key of evaluate){const edge=this.edges.get(key);if(!edge)continue;problemCandidates.add(key);this.diagnostics.edgeEvaluations++;const problems:string[]=[],decoded=this.decoded.get(key)!;
    if(!safeId(edge.id))problems.push('invalid-identity');if((this.edgeIds.get(edge.id)?.size??0)>1)problems.push('ambiguous-relationship');if(decoded.diagnostic)problems.push(decoded.diagnostic);
    for(const [side,id]of [['source',edge.sourceGlossId],['target',edge.targetGlossId]] as const){if(!id)continue;const nodes=this.nodeState(id);if(!nodes.length)problems.push('missing-'+side);else if(nodes.length!==1)problems.push('ambiguous-'+side);else if(nodes[0].deleted)problems.push('deleted-'+side);}
    if(decoded.value?.unresolvedTarget)problems.push('outside-copy');
    if(!equal(problems,edge.diagnostics)){this.edges.set(key,{...edge,diagnostics:problems,active:!problems.length});}else if(!edge.active&&!problems.length)this.edges.set(key,{...edge,active:true});
    affected.add(edge.sourceGlossId);if(edge.targetGlossId)affected.add(edge.targetGlossId);
   }
   let issuesChanged=false;
   for(const key of problemCandidates){const edge=this.edges.get(key),old=this.problemEdges.get(key);if(edge&&!edge.active){if(!equal(old,edge)){this.problemEdges.set(key,edge);issuesChanged=true;}}else if(this.problemEdges.delete(key))issuesChanged=true;}
   if(issuesChanged)this.problemSignal[1]([...this.problemEdges.values()]);
   const types=[...this.typeCounts.keys()].sort();if(!equal(types,this.typesSignal[0]()))this.typesSignal[1](types);
   for(const id of affected){const nodes=this.nodeSignals.get(id),value=this.nodeState(id);if(nodes&&!equal(nodes[0](),value)){nodes[1](value);this.diagnostics.nodePublications++;}const summary=this.summaries.get(id),next=this.summary(id);if(summary&&!equal(summary[0](),next)){summary[1](next);this.diagnostics.summaryPublications++;}}
  });
 }
 dispose(){this.problemEdges.clear();this.typeCounts.clear();this.problemSignal[1]([]);this.typesSignal[1]([]);this.nodeSignals.clear();this.summaries.clear();this.edges.clear();this.decoded.clear();this.edgeIds.clear();this.definitions.clear();this.local.clear();this.sources.clear();this.incoming.clear();this.outgoing.clear();}
}
