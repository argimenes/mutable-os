// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerApplicationViews} from '../../application/features';
import {registerStandaloneEntityService} from '../../application/entity-service';
import {ScopedEntities} from '../../application/scoped-entities';
import {openSemanticServices} from '../../application/semantic-services';
import {IdentityPipeline} from './identity-pipeline';
import type {DialecticController} from './controller';
vi.mock('../../application/semantic-services',()=>({openSemanticServices:vi.fn()}));
const clean:(()=>void)[]=[];beforeEach(()=>{Element.prototype.scrollTo=vi.fn();});afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.innerHTML='';});
function fixture(invalidEnrichment=false){
 const resourceId=crypto.randomUUID(),editor=new ReactiveEditor({id:resourceId,type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'Draft'}]},{features:{nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,authorityCache:false}});registerApplicationViews(editor);clean.push(()=>editor.dispose());
 const view=editor.createView('pipeline-test'),root=view.node(view.state.rootKey)!,scoped=new ScopedEntities(editor,root.key,resourceId);clean.push(()=>scoped.dispose());
 const definition=scoped.prepare({name:'Leonardo',typename:'Person',description:'Artist',aliases:[]},{actor:'ai'});if(invalidEnrichment)definition.metadata.scopedEntity.entity.attributes={enrichment:{dates:[{type:'birth',startYear:2000,startMonth:13}]}} as any;scoped.commit({[definition.id]:definition});
 const reader={historyScope:vi.fn(async()=>'/vault'),scopeIdentity:vi.fn(async()=>'vault'),get:vi.fn(async()=>undefined),search:vi.fn(async()=>({candidates:[],diagnostics:[],complete:true,current:()=>{}})),dispose:vi.fn()};clean.push(registerStandaloneEntityService(editor,()=>reader as any));
 const preview={sourceFingerprint:'source',aliasSignature:'aliases',entity:null,association:null,claims:[],relationships:[],complete:true};
 const receipt={entity:{id:'authentic',name:'Leonardo',revision:0,aliases:[]},association:{guid:'association',entityGuid:'authentic',revision:0,sourceFingerprint:'source'}};
 const service={vaultGuid:'vault',execute:vi.fn(async(request:any)=>request.op==='identity-preview'?preview:receipt),dispose:vi.fn(),audit:{outcome:vi.fn()}};vi.mocked(openSemanticServices).mockResolvedValue(service as any);
 const c={editor,root:()=>root,resourceId:()=>resourceId,semanticInventory:vi.fn(()=>({definitions:[],properties:[]})),authorityResolution:{resolve:vi.fn(async()=>{})}} as unknown as DialecticController;
 const host=document.body.appendChild(document.createElement('div')),close=vi.fn();clean.push(render(()=><IdentityPipeline c={c} entityId={definition.id} close={close}/>,host));
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('.pipeline-host button')].find(b=>b.textContent?.trim()===label)!;
 return {editor,view,root,scoped,definition,reader,service,c,button,close,current:()=>scoped.registry()[definition.id]};
}
it('does no source reads, full snapshots, inventories, scans or network work for ordinary typing with a live Pipeline',async()=>{
 const f=fixture();await vi.waitFor(()=>expect(f.button('No Matching Identity')?.disabled).toBe(false));const reads=vi.spyOn(f.scoped,'registry'),snapshot=vi.spyOn(f.editor.repository,'snapshot'),allRegistryReads=vi.spyOn(ScopedEntities.prototype,'registry');const requests=f.service.execute.mock.calls.length,queries=f.reader.search.mock.calls.length,inventory=vi.mocked(f.c.semanticInventory).mock.calls.length;
 const values=Object.values;let scans=0;vi.spyOn(Object,'values').mockImplementation((o:any)=>{if(o===f.editor.repository.state.contents||o===f.editor.repository.state.placements)scans++;return values(o);});
 const text=Object.values(f.view.state.nodes).find(n=>n.payload.id==='text')!;for(let i=0;i<30;i++)f.editor.commands.replaceInlineRange(text.key,0,0,'x');
 expect(reads).not.toHaveBeenCalled();expect(allRegistryReads).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(scans).toBe(0);expect(f.service.execute.mock.calls.length).toBe(requests);expect(f.reader.search.mock.calls.length).toBe(queries);expect(vi.mocked(f.c.semanticInventory).mock.calls.length).toBe(inventory);
});
it('commits only association metadata locally, preserving identity and native Undo without a full snapshot',async()=>{
 const f=fixture();await vi.waitFor(()=>expect(f.button('No Matching Identity')?.disabled).toBe(false));f.button('No Matching Identity').click();await vi.waitFor(()=>expect(f.button('Confirm Import')?.disabled).toBe(false));const original=structuredClone(f.current()),snapshot=vi.spyOn(f.editor.repository,'snapshot');
 f.button('Confirm Import').click();await vi.waitFor(()=>expect(f.button('Done')).toBeTruthy());expect(snapshot).not.toHaveBeenCalled();expect(f.current().metadata.scopedEntity.entity).toEqual(original.metadata.scopedEntity.entity);expect(f.current().metadata.scopedEntity.identityAssociation).toMatchObject({entityId:'authentic',method:'user-confirmed'});
 f.editor.repository.undo();expect(f.current().metadata.scopedEntity.identityAssociation).toBeUndefined();f.editor.repository.redo();expect(f.current().metadata.scopedEntity.identityAssociation.entityId).toBe('authentic');expect(f.service.execute.mock.calls.filter(([r])=>r.op==='identity-commit')).toHaveLength(1);
});
it('blocks a commit after the source identity changes and keeps the old selection visible for review',async()=>{
 const f=fixture();await vi.waitFor(()=>expect(f.button('No Matching Identity')?.disabled).toBe(false));f.button('No Matching Identity').click();await vi.waitFor(()=>expect(f.button('Confirm Import')?.disabled).toBe(false));
 const next=structuredClone(f.current());next.metadata.scopedEntity.entity.name='Another person';f.scoped.commit({[next.id]:next});expect(document.querySelector('.pipeline-source-error')?.textContent).toContain('Source Entity changed');expect(f.button('Confirm Import')).toBeUndefined();expect(f.service.execute.mock.calls.filter(([r])=>r.op==='identity-commit')).toHaveLength(0);
});
it('shows unsupported source data as a closable error without crashing the originating workspace',async()=>{
 const f=fixture(true);expect(document.querySelector('.pipeline-host')?.textContent).toContain('Invalid date month');f.button('Close').click();expect(f.close).toHaveBeenCalledOnce();expect(f.service.execute).not.toHaveBeenCalled();
});
