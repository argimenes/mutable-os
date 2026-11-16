import {For,Show,createSignal} from 'solid-js';
import type {EntitySearchReader} from '../entity-references/read-only-search';
import {dataKey,occurrence,PipelineRun,type PipeController,type PipeDefinition,type InteractionState} from './runtime';
import {createEntitySearchPipe,EntitySearchContent,type VaultEntityReference} from './entity-search';
import {identitySource} from './identity-contract.mjs';
import type {IdentitySource,IdentityChoices,IdentityPreview,IdentityCommit,IdentityReceipt,IdentityResolutionService} from './identity-service';
import type {PipePresentation} from './carousel';
const stringKey=(v:unknown)=>{if(typeof v!=='string'||v.length>1000)throw Error('Invalid search query');return v;};
const entityRef=(v:any):VaultEntityReference=>{if(!v||typeof v.vaultId!=='string'||typeof v.entityId!=='string'||!Number.isSafeInteger(v.revision))throw Error('Invalid canonical Entity reference');return {...v};};
export interface IdentityDecision{entity:VaultEntityReference;preview:IdentityPreview}
export const identityKeys={query:dataKey('searchName',stringKey),source:dataKey<IdentitySource>('sourceDocumentEntity',identitySource),entity:dataKey('selectedDatabaseEntity',entityRef),decision:dataKey<IdentityDecision>('identityDecision',v=>{const d=v as IdentityDecision;if(!d?.preview?.sourceFingerprint)throw Error('Invalid identity decision');entityRef(d.entity);return d;}),receipt:dataKey<IdentityReceipt>('identityReceipt',v=>{const r=v as IdentityReceipt;if(!r?.entity?.id||!r.association?.guid)throw Error('Invalid identity receipt');return r;})};
export interface IdentityWorkflowContext{
 service:IdentityResolutionService;search:EntitySearchReader;
 /** Revalidates the captured source and originating Cavern; never scans Documents. */
 check():void|Promise<void>;
 unsupported:readonly string[];
 /** Called after a confirmed database outcome. Must not save the Document. */
 linked(receipt:IdentityReceipt):Promise<void>|void;
}
interface CompareInput{source:IdentitySource;entity:VaultEntityReference}
interface CompareOutput{decision:IdentityDecision}
class CompareController implements PipeController<CompareInput,CompareOutput>{
 private data=createSignal<IdentityPreview>();readonly preview=this.data[0];private loading=createSignal(false);private failure=createSignal('');readonly error=this.failure[0];private abort?:AbortController;
 readonly status=():InteractionState=>this.loading[0]()?'busy':this.error()?'error':this.preview()?'ready':'idle';
 readonly actions=()=>[{id:'confirm',label:'Same Identity',enabled:this.status()==='ready',primary:true},{id:'refresh',label:'Refresh comparison',enabled:!this.loading[0]()}];
 constructor(public input:Readonly<CompareInput>,readonly context:IdentityWorkflowContext){void this.load();}
 async load(){this.abort?.abort();const abort=this.abort=new AbortController();this.loading[1](true);this.failure[1]('');this.data[1](undefined);try{await this.context.check();if(this.input.entity.vaultId!==this.context.service.vaultId)throw Error('Entity belongs to another Cavern');const p=await this.context.service.preview(this.input.source,this.input.entity.entityId,abort.signal);if(!abort.signal.aborted)this.data[1](p);}catch(e){if(!abort.signal.aborted)this.failure[1](String(e));}finally{if(this.abort===abort)this.loading[1](false);}}
 update(input:Readonly<CompareInput>){if(JSON.stringify(input)!==JSON.stringify(this.input)){this.input=input;void this.load();}}
 async execute(action:string,signal:AbortSignal){if(action==='refresh'){await this.load();return {};}
  await this.context.check();const p=this.preview();if(!p?.entity)throw Error('Refresh the comparison');const current=await this.context.service.preview(this.input.source,p.entity.id,signal);if(current.entity?.revision!==p.entity.revision||current.aliasSignature!==p.aliasSignature||current.association?.revision!==p.association?.revision)throw Error('Canonical information changed. Refresh the comparison.');
  return {outcome:'confirmed',values:{decision:{entity:{...this.input.entity,revision:p.entity.revision},preview:p}}};
 }
 dispose(){this.abort?.abort();}
}
interface ReviewInput{source:IdentitySource;decision:IdentityDecision}
interface ImportInput{source:IdentitySource}
interface CommitOutput{receipt:IdentityReceipt}
export class ReconcileController implements PipeController<ReviewInput|ImportInput,CommitOutput>{
 private data=createSignal<IdentityPreview>();readonly preview=this.data[0];private loading=createSignal(false);private failure=createSignal('');readonly error=this.failure[0];private noticeState=createSignal('');readonly notice=this.noticeState[0];
 private options=createSignal<IdentityChoices>({name:'keep',aliases:'merge',description:'keep',typename:'keep',enrichment:'keep'});readonly choices=this.options[0];private abort?:AbortController;private request?:IdentityCommit;private confirmed?:IdentityReceipt;private uncertain=createSignal(false);
 readonly status=():InteractionState=>this.loading[0]()?'busy':this.error()?'error':this.preview()?'ready':'idle';
 readonly guard=()=>this.uncertain[0]()?'The database outcome needs recovery. Use Check commit outcome before leaving.':undefined;
 readonly actions=()=>this.confirmed&&this.uncertain[0]()?[{id:'recover',label:'Retry Document association',enabled:!this.loading[0](),primary:true},{id:'acknowledge',label:'Finish without Document update',enabled:!this.loading[0]()}]:this.uncertain[0]()?[{id:'recover',label:'Check commit outcome',enabled:!this.loading[0](),primary:true}]:this.confirmed?[{id:'recover',label:'Finish Document association',enabled:!this.loading[0](),primary:true}]:[{id:'commit',label:this.importing?'Confirm Import':'Confirm Reconciliation',enabled:!!this.preview()&&!this.loading[0]()&&(!this.importing||!this.preview()!.association),primary:true},{id:'refresh',label:'Refresh preview',enabled:!this.loading[0]()}];
 constructor(public input:Readonly<ReviewInput|ImportInput>,readonly context:IdentityWorkflowContext,readonly importing:boolean,private changed:()=>void){if(importing)this.options[1]({name:'import',aliases:'merge',description:'import',typename:'import',enrichment:'merge'});void this.load();}
 choose(field:keyof IdentityChoices,value:string){if(this.request)return;this.options[1](v=>({...v,[field]:value}));this.changed();}
 private async load(){this.abort?.abort();const abort=this.abort=new AbortController();this.loading[1](true);this.failure[1]('');try{await this.context.check();const target='decision'in this.input?this.input.decision.entity.entityId:undefined;const p=await this.context.service.preview(this.input.source,target,abort.signal);if(!abort.signal.aborted){this.data[1](p);if(this.importing&&p.association)this.failure[1]('This Document Entity already has an authentic identity. Return to Scry and choose that identity.');}}catch(e){if(!abort.signal.aborted)this.failure[1](String(e));}finally{if(this.abort===abort)this.loading[1](false);}}
 update(input:Readonly<ReviewInput|ImportInput>){if(JSON.stringify(input)!==JSON.stringify(this.input)){if(this.request)throw Error('Resolve the pending commit first');this.input=input;void this.load();}}
 private async finish(receipt:IdentityReceipt){this.confirmed=receipt;this.uncertain[1](false);try{await this.context.linked(receipt);this.noticeState[1]('Database identity committed. Save the Document manually to retain its local association.');return {outcome:'committed',values:{receipt}};}catch(e){this.uncertain[1](true);this.failure[1]('Database committed; the Document association still needs recovery. '+String(e));throw e;}}
 async execute(action:string,signal:AbortSignal){
  if(action==='refresh'){if(this.request)throw Error('Recover the existing commit first');this.changed();await this.load();return {};}
  this.failure[1]('');
  if(action==='acknowledge'&&this.confirmed){this.uncertain[1](false);this.noticeState[1]('Database changes and association are retained. The Document was not updated; reopen identity resolution to recover its local association.');return {outcome:'committed',values:{receipt:this.confirmed}};}
  if(this.confirmed)return this.finish(this.confirmed);
  if(this.request){const outcome=await this.context.service.outcome(this.request.operationId);if(outcome.status==='committed'&&outcome.result)return this.finish(outcome.result);if(outcome.status!=='not-committed')throw Error('Commit outcome is unavailable. Keep this Pipeline open and retry recovery.');
   // A confirmed non-commit releases the barrier; a fresh preview is required.
   this.uncertain[1](false);this.request=undefined;await this.load();this.noticeState[1]('No database changes were committed. Review and confirm again.');return {};
  }
  await this.context.check();const p=this.preview();if(!p)throw Error('Load the preview first');if(this.importing&&p.association)throw Error('An authentic identity already exists');
  if(!this.importing&&'decision'in this.input&&this.input.decision.preview.sourceFingerprint!==p.sourceFingerprint)throw Error('Source changed since comparison');
  const current=await this.context.service.preview(this.input.source,p.entity?.id,signal);await this.context.check();
  if(current.sourceFingerprint!==p.sourceFingerprint||current.entity?.revision!==p.entity?.revision||current.aliasSignature!==p.aliasSignature||current.association?.revision!==p.association?.revision)throw Error('Preview changed. Refresh and review before confirming.');
  this.request=Object.freeze({op:'identity-commit',operationId:crypto.randomUUID(),associationId:p.association?.guid??crypto.randomUUID(),source:this.input.source,sourceFingerprint:p.sourceFingerprint,targetId:p.entity?.id??crypto.randomUUID(),expectedTargetRevision:p.entity?.revision??null,expectedAssociationRevision:p.association?.revision??null,aliasSignature:p.aliasSignature,choices:{...this.choices()},confirmation:true});
  this.uncertain[1](true);
  // Once dispatched, an abort does not prove the database did not commit.
  const receipt=await this.context.service.commit(this.request,signal);return this.finish(receipt);
 }
 dispose(){this.abort?.abort();}
}
function Unsupported(props:{context:IdentityWorkflowContext;preview?:IdentityPreview}){return <section class="pipeline-field"><h3>Semantic dependencies</h3><For each={props.context.unsupported}>{message=><p class="pipeline-unavailable">{message}</p>}</For><p class="pipeline-unavailable">Claims and Relationships are shown for review. This release does not import them or create missing endpoint Entities.</p><Show when={props.preview}><p>{props.preview!.claims.length} canonical Claims · {props.preview!.relationships.length} canonical Relationships</p><Show when={!props.preview!.complete}><p class="pipeline-unavailable">The bounded preview is incomplete. Open Cardex for further records.</p></Show><For each={[...props.preview!.claims,...props.preview!.relationships]}>{record=><pre style={{'white-space':'pre-wrap','overflow-wrap':'anywhere','font-size':'11px'}}>{JSON.stringify(record,null,2)}</pre>}</For></Show></section>;}
function EntityFields(props:{entity:any}){return <><h3>{props.entity?.name??'No authentic identity selected'}</h3><p>{props.entity?.typename||'Type not supplied'}</p><p>{props.entity?.description||'No description'}</p><small>{props.entity?.aliases?.map((a:any)=>typeof a==='string'?a:a.name).join(' · ')}</small><div class="pipeline-field"><small>Structured attributes and identifiers</small><pre>{JSON.stringify(props.entity?.enrichment??props.entity?.attributes??{},null,2)}</pre></div></>;}
export function CompareContent(props:{controller:CompareController}){const c=props.controller;return <><p>Compare the records before confirming that they represent the same identity. Use Back to reject this match.</p><div class="pipeline-compare"><section><small>DOCUMENT ENTITY</small><EntityFields entity={c.input.source}/></section><section><small>AUTHENTIC ENTITY</small><EntityFields entity={c.preview()?.entity}/></section></div><For each={['name','typename','description'] as const}>{key=><p><strong>{key}: </strong>{!c.preview()?.entity?.[key]?'Missing in authentic Entity':c.input.source[key]===c.preview()!.entity![key]?'Matching':'Different — review required'}</p>}</For><Unsupported context={c.context} preview={c.preview()}/></>;}
export function ReconcileContent(props:{controller:ReconcileController}){const c=props.controller;return <><p>{c.importing?'Create a separate authentic identity while preserving the Document Entity and its references.':'Choose what to import. Existing values are retained unless explicitly selected below.'}</p><EntityFields entity={c.input.source}/>
 <For each={['name','aliases','description','typename','enrichment'] as const}>{field=><label class="pipeline-field">{field}<select value={c.choices()[field]} disabled={!!c.guard()||c.importing} onChange={e=>c.choose(field,e.currentTarget.value)}><option value="keep">Keep authentic value</option><Show when={field==='aliases'||field==='enrichment'} fallback={<option value="import">Import Document value</option>}><option value="merge">Retain both, without exact duplicates</option></Show><Show when={field==='description'}><option value="both">Retain both descriptions</option></Show></select></label>}</For>
 <p class="pipeline-unavailable">Existing canonical images are preserved. External thumbnail downloads and structured semantic conversions are not part of this commit.</p><Unsupported context={c.context} preview={c.preview()}/><Show when={c.notice()}><p role="status">{c.notice()}</p></Show>
 <p>Only the final confirmation writes to the database. Document saving remains manual.</p></>;}
export function createIdentityWorkflow(source:IdentitySource,context:IdentityWorkflowContext){
 const search=createEntitySearchPipe(context.search,context.service.vaultId),compare:PipeDefinition<CompareInput,CompareOutput,CompareController>={id:'entity-compare',title:'Entity Comparer',create:input=>new CompareController(input,context)};
 const reconcile:PipeDefinition<ReviewInput,CommitOutput,ReconcileController>={id:'entity-reconcile',title:'Entity Reconciler',create:(input,c)=>new ReconcileController(input,context,false,c.changed)};
 const importing:PipeDefinition<ImportInput,CommitOutput,ReconcileController>={id:'entity-import',title:'Entity Import',create:(input,c)=>new ReconcileController(input,context,true,c.changed)};
 // Each branch has its own receipt key, retaining single-producer ownership.
 const importReceipt=dataKey<IdentityReceipt>('importReceipt',identityKeys.receipt.parse);
 const run=new PipelineRun({id:'resolve-entity-identity',version:1,title:'Resolve Entity Identity',start:'search',pipes:[
  occurrence(search,{id:'search',label:'Find Authentic Identity',requires:{query:identityKeys.query},produces:{entity:identityKeys.entity}}),
  occurrence(compare,{id:'compare',label:'Compare Identities',width:620,requires:{source:identityKeys.source,entity:identityKeys.entity},produces:{decision:identityKeys.decision}}),
  occurrence(reconcile,{id:'reconcile',label:'Enrich Authentic Entity',requires:{source:identityKeys.source,decision:identityKeys.decision},produces:{receipt:identityKeys.receipt}}),
  occurrence(importing,{id:'import',label:'Import Authentic Entity',requires:{source:identityKeys.source},produces:{receipt:importReceipt}})
 ],connectors:[{from:'search',outcome:'selected',to:'compare',default:true},{from:'search',outcome:'no-match',to:'import'},{from:'compare',outcome:'confirmed',to:'reconcile'}]},[{key:identityKeys.query,value:source.name},{key:identityKeys.source,value:source}]);
 const presentations:Record<string,PipePresentation>={'entity-search-select':{view:EntitySearchContent},'entity-compare':{view:CompareContent},'entity-reconcile':{view:ReconcileContent},'entity-import':{view:ReconcileContent}};
 return {run,presentations};
}
