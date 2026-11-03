import type {ReactiveEditor} from '../../reactive-editor/editor';
import {clone} from '../../block-tree/clone';
import {glossChangeFor,glossOwner} from '../../block-tree/gloss-plan';
import {GlossGraphIndex,type GlossEdge} from './relationship-index';
import {decodeRelationship,relationshipType,safeId} from './relationships';
/** Canonical foundation commands shared by the Register relationship editor. */
export class GlossRelationshipController {
 private graphs=new Map<string,GlossGraphIndex>();private stop:()=>void;private releases:(()=>void)[]=[];
 readonly timing={copyMs:0,validationMs:0,commitMs:0,totalMs:0};
 private evidence={ownedKeys:(k:string)=>this.editor.repository.ownedPlacementKeys(k),locationOf:(k:string)=>this.editor.repository.locationOf(k)};
 constructor(private editor:ReactiveEditor){
  this.stop=editor.repository.subscribeChanges(change=>{for(const [owner]of change.previousContents){const graph=this.graphs.get(owner);if(!graph)continue;const root=editor.repository.readState().contents[owner];if(!root){graph.dispose();this.graphs.delete(owner);continue;}const proof=change.structural?.gloss;if(proof?.owner===owner)graph.apply(root.payload.linkedAnnotations as any??{},proof);else if(JSON.stringify(change.previousContents.get(owner)?.payload.linkedAnnotations)!==JSON.stringify(root.payload.linkedAnnotations))graph.apply(root.payload.linkedAnnotations as any??{});}});
  for(const action of ['create','update','reverse','retarget','remove','restore'] as const)this.releases.push(editor.commandRegistry.register<any>({id:'gloss.relationship.'+action,label:'Gloss relationship '+action,canExecute:()=>editor.features.glossMode&&editor.features.glossRelationships,execute:({targetKey,args})=>{
   let n=editor.node(targetKey);const original=n;while(n&&n.viewType!=='document-block')n=editor.projections.get(n.viewId)?.parentOf(n.key);
   if(!n||!original||glossOwner(editor.repository.readState(),original.contentKey,this.evidence)!==n.contentKey)throw Error('Select a Gloss in its owning Document.');
   const owner=n.contentKey;if(action==='create')this.create(owner,args.sourceGlossId,args.type,args.targetGlossId);else if(action==='restore')this.restore(owner,args.glossId,args.expected);else if(action==='update')this.update(owner,args.id,args.expected,args.type);else if(action==='retarget')this.retarget(owner,args.id,args.expected,args.targetGlossId);else this[action](owner,args.id,args.expected);
  }},'gloss-relationships'));
 }
 private root(owner:string){if(!this.editor.features.glossMode||!this.editor.features.glossRelationships)throw Error('Gloss relationships are disabled.');const r=this.editor.repository.readState().contents[owner];if(r?.viewType!=='document-block')throw Error('Gloss relationships require their owning Document.');return r;}
 document(owner:string){const root=this.root(owner);let graph=this.graphs.get(owner);if(!graph){graph=new GlossGraphIndex(root.payload.linkedAnnotations as any??{});this.graphs.set(owner,graph);}return graph;}
 private write(owner:string,label:string,edit:(registry:Record<string,any>)=>void){
  const start=performance.now(),root=clone(this.root(owner));root.payload.linkedAnnotations??={};edit(root.payload.linkedAnnotations as any);const copied=performance.now(),operations=[{kind:'put-content' as const,record:root}];
  if(!glossChangeFor(this.editor.repository.readState(),operations,this.evidence))throw Error('Relationship edit could not be locally admitted; no changes made.');const validated=performance.now();
  this.editor.repository.commit(label,operations);const end=performance.now();Object.assign(this.timing,{copyMs:copied-start,validationMs:validated-copied,commitMs:end-validated,totalMs:end-start});
 }
 private endpoints(owner:string,source:string,type:string,target:string,except?:string){if(!safeId(source)||!safeId(target))throw Error('Invalid Gloss identity.');const graph=this.document(owner),from=graph.unique(source),to=graph.unique(target);if(source===target)throw Error('A new relationship cannot target its own Gloss.');if(graph.relations(source).outgoing.some(e=>e.key!==except&&e.type===type&&e.targetGlossId===target&&!decodeRelationship(e.raw).value?.unresolvedTarget))throw Error('That relationship already exists.');return{graph,from,to};}
 create(owner:string,sourceGlossId:string,type:string,targetGlossId:string){type=relationshipType(type);const{from}=this.endpoints(owner,sourceGlossId,type,targetGlossId),id=crypto.randomUUID();this.write(owner,'Create Gloss relationship',r=>{r[from.definitionId].metadata.gloss.links[id]={version:1,type,toGlossId:targetGlossId};});return id;}
 private current(owner:string,id:string,expected:string){const edge=this.document(owner).edge(id);if(!expected||edge.token!==expected)throw Error('Relationship changed. Refresh it before editing.');return edge;}
 private supported(edge:GlossEdge){const decoded=decodeRelationship(edge.raw);if(!decoded.value)throw Error('This relationship version or payload is not editable.');return decoded.value;}
 update(owner:string,id:string,expected:string,type:string){type=relationshipType(type);const edge=this.current(owner,id,expected),value=this.supported(edge);this.endpoints(owner,edge.sourceGlossId,type,value.toGlossId,edge.key);if(value.type===type)return;this.write(owner,'Change Gloss relationship type',r=>{r[edge.sourceDefinitionId].metadata.gloss.links[id].type=type;});}
 retarget(owner:string,id:string,expected:string,targetGlossId:string){const edge=this.current(owner,id,expected),value=this.supported(edge);this.endpoints(owner,edge.sourceGlossId,value.type,targetGlossId,edge.key);if(value.toGlossId===targetGlossId&&!value.unresolvedTarget)return;this.write(owner,'Retarget Gloss relationship',r=>{const link=r[edge.sourceDefinitionId].metadata.gloss.links[id];link.toGlossId=targetGlossId;delete link.unresolvedTarget;});}
 reverse(owner:string,id:string,expected:string){const edge=this.current(owner,id,expected),value=this.supported(edge);if(value.unresolvedTarget)throw Error('Resolve the copied target before reversing.');const{from}=this.endpoints(owner,value.toGlossId,value.type,edge.sourceGlossId,edge.key);this.write(owner,'Reverse Gloss relationship',r=>{const link=r[edge.sourceDefinitionId].metadata.gloss.links[id];delete r[edge.sourceDefinitionId].metadata.gloss.links[id];r[from.definitionId].metadata.gloss.links[id]={...link,toGlossId:edge.sourceGlossId};});}
 remove(owner:string,id:string,expected:string){const edge=this.current(owner,id,expected);this.write(owner,'Delete Gloss relationship',r=>{delete r[edge.sourceDefinitionId].metadata.gloss.links[id];});}
 restore(owner:string,glossId:string,expected:string){const node=this.document(owner).unique(glossId,false),raw=(this.root(owner).payload.linkedAnnotations as any)[node.definitionId];if(!expected||JSON.stringify(raw)!==expected)throw Error('Gloss changed. Refresh it before restoring.');if(!raw.isDeleted)return;this.write(owner,'Restore Gloss',r=>{delete r[node.definitionId].isDeleted;});}
 dispose(){this.stop();for(const graph of this.graphs.values())graph.dispose();this.graphs.clear();this.releases.splice(0).forEach(release=>release());}
}
