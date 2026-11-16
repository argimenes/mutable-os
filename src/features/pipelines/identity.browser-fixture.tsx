import {semanticsWorkspaceFixture} from '../dialectic/semantics-workspace.browser-fixture';
import {registerStandaloneEntityService} from '../../application/entity-service';
import {openSemanticServices} from '../../application/semantic-services';
import type {EntityService,EntityResolutionQuery} from '../../feature-api/entities';
/** Synthetic browser qualification against an isolated real SQLite service. Never opens the user's Cavern. */
export async function identityPipelineFixture(){
 await semanticsWorkspaceFixture();const f=(globalThis as any).semanticsFixture;
 const services=await openSemanticServices({vault:'.'}),id=crypto.randomUUID();await services.execute({recordType:'Entity',op:'create',id,operationId:crypto.randomUUID(),name:'Leonardo da Vinci',typename:'Person',description:'A curated canonical record.'});
 const release=registerStandaloneEntityService(f.editor,()=>({
  historyScope:async()=>'.',scopeIdentity:async()=>services.vaultGuid,dispose:()=>{},
  get:async(id:string,signal?:AbortSignal)=>(await services.execute({recordType:'Entity',op:'get',operationId:crypto.randomUUID(),id},signal) as any).entity,
  search:async(query:EntityResolutionQuery,signal:AbortSignal)=>{const r=await services.execute({recordType:'Entity',op:'search',operationId:crypto.randomUUID(),query:query.query,stream:query.stream==='mention'?'all':query.stream,match:query.match},signal) as any;return {candidates:r.matches.map((r:any)=>({id:r.id,name:r.name,evidence:[{kind:r.kind,text:r.text}]})),diagnostics:[],complete:r.complete,current:()=>signal.throwIfAborted()};}
 } as unknown as EntityService));
 const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
 (globalThis as any).identityFixture={...f,button,canonicalId:id,services,dispose:async()=>{release();await services.dispose();f.dispose();}};
 button('Resolve Entity Identity…').click();return {canonicalId:id};
}
