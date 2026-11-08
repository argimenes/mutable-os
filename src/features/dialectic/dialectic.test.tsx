import {registerStandaloneEntityService} from '../../application/entity-service';
import {documentContextInventory} from '../../interchange/package/document-context';
import {ScopedEntities} from '../../application/scoped-entities';
import {LOCAL_ENTITY,LOCAL_ENTITY_RELATION,ENTITY_REFERENCE} from '../../feature-api/scoped-entities';
import {ARGUMENT,ARGUMENT_RELATION} from './arguments';
// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {applicationPresentations} from '../../application/application-presentations';
import {nativeDocumentSession} from '../../persistence/native-session';
import {watchDocumentEntities} from '../../application/document-entity-changes';
import {liveDocumentEntities} from '../../application/live-document-entities';
import * as resourceIdentity from '../../block-tree/resource-identity';
import {captureBlocks,cloneBlocks} from '../../block-tree/clipboard';
import {serializeSelection} from '../../interchange/serializer';
import {materializeFragment} from '../../interchange/materialize';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import {createDialecticController} from './controller';
import {dialecticApplication} from './index';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
async function setup(enabled=true,registry=true,dcp=true,semantics=false,protection=false){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Test has no vault'}),{headers:{'Content-Type':'application/json'}})));
 const session=new WorkspaceSession(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[]}),{features:{dialecticProviderContinuity:false,nativeTextProtection:protection,dialectic:enabled,dialecticDcp:dcp,scopedSemantics:semantics,applicationPresentations:registry,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 const editor=session.editor;cleanup.push(()=>session.dispose());
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><WorkspacePresentationView session={session}/>,host));
 if(!enabled)return {session,editor,host};
 await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});await tick();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 expect(port?.session()).toBeTruthy();
 const c=createRoot(dispose=>{cleanup.push(dispose);return createDialecticController(editor,()=>port);});cleanup.push(()=>c.dispose());
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 const type=(s:string)=>editor.commands.replaceInlineRange(text().key,0,0,s);
 return {session,editor,host,port,c,text,type};
}
it('registers a real Desktop/Textual application and leaves Flint launch ownership intact',async()=>{
 const f=await setup();const r=applicationPresentations(f.editor);
 expect(r.resolve(dialecticApplication,'desktop',f.port!).status).toBe('ready');
 expect(r.resolve(dialecticApplication,'textual',f.port!).status).toBe('ready');
 expect(f.editor.commandRegistry.owner('flint.open')).not.toBe(f.editor.commandRegistry.owner('dialectic.open'));
 expect(f.host.querySelector('.dialectic-app')).toBeTruthy();expect(f.host.querySelector('.reactive-standoff-flow')).toBeTruthy();
});
it('is disabled by its feature flag, and works with the presentation-registry fallback',async()=>{
 const off=await setup(false);expect(off.editor.commandRegistry.owner('dialectic.open')).toBeUndefined();
 const f=await setup(true,false);expect(f.host.querySelector('.dialectic-app')).toBeTruthy();f.type!('Fallback');f.c!.submit();expect(f.c!.committed()).toHaveLength(1);
});
it('submits native compositions without snapshots, keeps identities, history and a cheap typing path',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor,node=f.text!(),mount=editor.mounts.get(node.key);
 const native=nativeDocumentSession(editor);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'conversation.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshots=vi.spyOn(editor.repository,'snapshot'),rebuild=vi.spyOn(c.session()!.projection as any,'build'),builds=c.diagnostics.rowBuilds;
 f.type!('A rich beginning');expect(c.diagnostics.rowBuilds).toBe(builds);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 const id=c.draft()!.id;c.submit();expect(c.notice()).toBe('');expect(c.committed().map(r=>[r.id,r.data.ordinal])).toEqual([[id,1]]);
 expect(editor.mounts.get(node.key)).toBe(mount);expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 editor.repository.undo();expect(c.committed()).toHaveLength(0);expect(c.draft()!.id).toBe(id);
 editor.repository.redo();expect(c.committed()[0].id).toBe(id);expect(editor.mounts.get(node.key)).toBe(mount);
 const saved=captureNative(editor.repository.readState(),c.resourceId());expect(Object.values(saved.contents).filter(c=>c.viewType==='text-cell').map(c=>c.payload.text).join('')).toContain('A rich beginning');expect(JSON.stringify(saved)).toContain('"ordinal":1');
});
it('keeps chronology, inspection, reply target and selected context separate',async()=>{
 const f=await setup(),c=f.c!;f.type!('First');c.submit();const first=c.target(c.committed()[0].id);
 f.type!('Second');c.submit();c.inspect(first);c.pin(first);c.setReply(first);c.present();
 expect(c.inspection()?.blockId).toBe(c.frontier()!.id);expect(c.reply()).toEqual(first);expect(c.context()).toEqual([first]);
 f.type!('A later reply to the first');c.submit();expect(c.committed().map(r=>r.data.ordinal)).toEqual([1,2,3]);expect(c.frontier()!.data.replies).toEqual([first]);
 const n=c.resolve(first)!,text=c.session()!.projection.node(n.children[0])!;f.editor.commands.replaceInlineRange(text.key,0,0,'Edited ');
 expect(c.committed()[0].data.ordinal).toBe(1);expect(c.committed()[0].id).toBe(first.blockId);
 c.navigate(-1);expect(c.context()).toEqual([first]);
});
it('makes one undoable mock composition and rejects stale, cancelled and missing context',async()=>{
 const f=await setup(),c=f.c!;f.type!('One');c.submit();const first=c.target(c.frontier()!.id);c.pin(first);
 const snapshots=vi.spyOn(f.editor.repository,'snapshot');await c.askMock();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const generated=c.resolve(c.target(c.frontier()!.id))!;expect(generated.children.some(k=>c.session()!.projection.node(k)?.viewType==='table-block')).toBe(true);expect(snapshots).not.toHaveBeenCalled();
 f.editor.repository.undo();expect(c.committed()).toHaveLength(1);f.editor.repository.redo();expect(c.committed()).toHaveLength(2);
 c.inspect(first);const stale=c.askMock();const t=c.session()!.projection.node(c.resolve(first)!.children[0])!;f.editor.commands.replaceInlineRange(t.key,0,0,'Changed');await stale;expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(2);
 const pending=c.askMock();c.cancel();await pending;expect(c.committed()).toHaveLength(2);expect(c.busy()).toBe(false);
 c.pin({kind:'block',resourceId:c.resourceId(),blockId:'missing'});await c.askMock();expect(c.notice()).toContain('unavailable');expect(c.context()).toHaveLength(2);
});
it('keeps context per conversation and rejects empty drafts and self-replies',async()=>{
 const f=await setup(),c=f.c!;c.submit();expect(c.notice()).toContain('Write a contribution');
 f.type!('First conversation');c.setReply(c.target(c.draft()!.id));c.submit();expect(c.notice()).toContain('before replying');c.setReply(undefined);c.submit();
 const firstId=c.resourceId(),target=c.target(c.frontier()!.id);c.pin(target);c.inspect(target);c.setReply(target);
 [...f.host.querySelectorAll<HTMLButtonElement>('.dialectic-app button')].find(b=>b.textContent==='New')!.click();await tick();
 expect(c.resourceId()).not.toBe(firstId);expect(c.valid()).toBe(true);expect(c.context()).toHaveLength(0);expect(c.reply()).toBeUndefined();
 f.port!.application.openDocument(firstId);await tick();expect(c.context()).toEqual([target]);expect(c.reply()).toEqual(target);expect(c.inspection()).toEqual(target);
});
it('keeps unrelated annotated Documents outside typing and submission work',async()=>{
 const f=await setup(),c=f.c!,state=f.editor.repository.readState();
 const bank=state.contents[state.placements[state.rootPlacementKey].contentKey].children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block')!;
 f.editor.commands.insert({id:'unrelated',type:'document-block',metadata:{documentId:'unrelated',title:'Unrelated'},children:[{id:'large-text',type:'standoff-editor-block',text:'annotated passage '.repeat(600),standoffProperties:[{id:'unrelated-bold',type:'style/bold',start:0,end:50}]}]},{kind:'at',parentKey:bank,index:1});
 const other=Object.values(f.editor.repository.readState().contents).find(c=>c.payload.id==='large-text')!;
 const revisions=other.revision,builds=c.diagnostics.rowBuilds,snapshots=vi.spyOn(f.editor.repository,'snapshot');
 f.type!('Independent typing');expect(c.diagnostics.rowBuilds).toBe(builds);c.submit();expect(c.committed()).toHaveLength(1);expect(snapshots).not.toHaveBeenCalled();
 expect(f.editor.repository.readState().contents[other.key]).toBe(other);expect(other.revision).toBe(revisions);
});

it('commits a range with its reply atomically, retains editor/Cell identity and incrementally rebases it',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();
 const mount=e.mounts.get(source.key),cells=[...source.inlineContent],revision=e.repository.state.revision;
 c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));const t=c.reply()!;
 expect(e.repository.state.revision).toBe(revision);expect(c.resolveReference(t).text).toBe('beta');
 f.type!('Reply to beta');const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');c.submit();
 expect(c.notice()).toBe('');expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');expect(c.resolveReference(t).status).toBe('resolved');
 expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(e.mounts.get(source.key)).toBe(mount);expect(source.inlineContent).toEqual(cells);
 e.repository.undo();expect(c.resolveReference(t).status).toBe('missing');expect(c.committed()).toHaveLength(1);
 e.repository.redo();expect(c.resolveReference(t).text).toBe('beta');expect(c.committed()).toHaveLength(2);
 const notify=vi.fn(),watch=watchDocumentEntities(e,source.key,notify),inventory=liveDocumentEntities(e,c.root()!.contentKey);cleanup.push(watch.dispose,()=>inventory.dispose());await tick();notify.mockClear();
 const index=c.references()!,counts={...index.diagnostics},owners=vi.spyOn(resourceIdentity,'resourceOwner');
 e.commands.replaceInlineRange(source.key,7,7,'X');expect(c.resolveReference(t)).toMatchObject({text:'bXeta',historical:'beta',changed:true});
 await tick();expect(notify).not.toHaveBeenCalled();expect(inventory.read().rows).toHaveLength(0);expect(owners).not.toHaveBeenCalled();expect(index.diagnostics.treeVisits).toBe(counts.treeVisits);expect(index.diagnostics.propertyReads-counts.propertyReads).toBe(1);expect(index.diagnostics.recordUpdates-counts.recordUpdates).toBe(1);
 expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const saved=captureNative(e.repository.readState(),c.resourceId());expect(JSON.stringify(decodeNative(nativeBytes(saved)))).toContain('dialectic/range-anchor');
});

it('follows split/join, keeps an orphan excerpt, and explicitly reattaches with Undo',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));const t=c.reply()!;f.type!('Reply');c.submit();
 const right=e.commands.splitStandoff(source.key,8);expect(c.resolveReference(t).segments).toHaveLength(2);expect(c.resolveReference(t).text).toBe('be\nta');
 e.commands.joinStandoff(source.key,right);expect(c.resolveReference(t).text).toBe('beta');
 e.commands.replaceInlineRange(source.key,6,10,'');expect(c.resolveReference(t)).toMatchObject({status:'unanchored',historical:'beta'});
 e.repository.undo();expect(c.resolveReference(t).text).toBe('beta');e.repository.redo();
 c.reattach(t,e.textRanges.snapshot(source.key,0,5));expect(c.notice()).toBe('');expect(c.resolveReference(t)).toMatchObject({text:'Alpha',historical:'beta',changed:true});
 expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');e.repository.undo();expect(c.resolveReference(t).status).toBe('unanchored');
 e.repository.redo();expect(c.resolveReference(t).text).toBe('Alpha');
});

it('does not author stale/cancelled selections and records precisely supplied range and Gloss context',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();
 c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));e.commands.replaceInlineRange(source.key,0,0,'!');f.type!('Reply');c.submit();expect(c.notice()).toContain('unavailable');expect(c.committed()).toHaveLength(1);
 c.selectRange('reply',e.textRanges.snapshot(source.key,7,11));const t=c.reply()!;c.pin(t);
 const revision=e.repository.state.revision,pending=c.askMock();c.cancel();await pending;expect(e.repository.state.revision).toBe(revision);
 expect(e.gloss.open(source.key,{anchor:7,head:11})).toBe(true);expect(e.gloss.commit('entity: Beta')).toBe(true);
 const id=Object.keys(c.root()!.payload.linkedAnnotations as any)[0];c.pinGloss(id);
 // Gloss authoring may change the snapshot revision; explicitly select again.
 c.selectRange('reply',e.textRanges.snapshot(source.key,7,11));c.unpin(t);c.pin(c.reply()!);
 await c.askMock();expect(c.notice()).toBe('');const manifest=c.frontier()!.data.consumedContext!;
 expect(manifest.items.map(i=>i.text)).toEqual(['beta','entity: Beta']);expect(manifest.items[0].origins).toEqual(['reply-target','selected']);
 e.commands.replaceInlineRange(source.key,8,8,'X');expect(manifest.items[0].text).toBe('beta');expect(c.frontier()!.data.replyExcerpts?.[0].text).toBe('beta');
});


it('copies ordinary anchored compositions through both paths and rejects wrappers before mutation',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));const t=c.reply()!;f.type!('Reply');c.submit();
 const revision=e.repository.state.revision,state=e.repository.readState();
 const native=cloneBlocks(captureBlocks(state,[source.placementKey]));
 const sliced=materializeFragment(serializeSelection(state,[{placementKey:source.placementKey,start:7,end:9}],{resourceId:c.resourceId()}),{resourceId:c.resourceId()});
 for(const fragment of [native,sliced]){
  const text=fragment.state.contents[fragment.state.placements[fragment.roots[0]].contentKey],p=(text.payload.standoffProperties as any[])[0];
  expect(p.type).toBe('dialectic/range-anchor');expect(p.annotationId).not.toBe(t.anchorId);expect(fragment.linkedAnnotations?.[p.annotationId].metadata).toBeTruthy();
  expect(text.payload.id).not.toBe(source.payload.id);
 }
 const wrapper=c.resolve(c.target(c.frontier()!.id))!;
 expect(()=>cloneBlocks(captureBlocks(state,[wrapper.placementKey]))).toThrow('content Blocks');
 expect(()=>materializeFragment(serializeSelection(state,[{placementKey:wrapper.placementKey}],{resourceId:c.resourceId()}))).toThrow('content Blocks');
 expect(()=>(e.clipboard as any).write({slices:[{placementKey:wrapper.placementKey}],scope:{}},true)).toThrow('content Blocks');
 expect(e.repository.state.revision).toBe(revision);
 const placement=e.commands.insertFragment(native,{kind:'at',parentKey:c.resolve(c.target(c.draft()!.id))!.key,index:1})[0];
 const copied=c.session()!.projection.nodeForPlacement(placement)!;
 const p=(copied.payload.standoffProperties as any[])[0];expect(c.resolveReference({kind:'range',resourceId:c.resourceId(),anchorId:p.annotationId}).text).toBe('beta');
 expect(c.resolveReference(t).text).toBe('beta');
});

it('rejects stale async range context and leaves cancelled anchors unauthored',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));
 const pending=c.askMock();e.commands.replaceInlineRange(source.key,7,7,'X');await pending;
 expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 expect(c.resolveReference({...c.reply()!,resourceId:'foreign'}).status).not.toBe('resolved');
});

it('uses a persisted reactive reply descriptor after history replay without leaking proxies into authoring',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,source=f.text!();f.type!('Alpha beta gamma');c.submit();c.selectRange('reply',e.textRanges.snapshot(source.key,6,10));f.type!('Reply');c.submit();e.repository.undo();e.repository.redo();
 c.inspect(c.frontier()!.data.replies[0]);await c.askMock();expect(c.notice()).toBe('');expect(c.frontier()!.data.consumedContext?.items[0].text).toBe('beta');
});

it('anchors nested table content with shared occurrences without rebuilding either editor',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;
 const wrapper=c.resolve(c.target(c.draft()!.id))!;
 e.commands.insert({id:'nested-table',type:'table-block',children:[{type:'table-row-block',children:[{type:'table-cell-block',children:[{id:'nested-source',type:'standoff-editor-block',text:'Nested source',standoffProperties:[{id:'bold-source',type:'style/bold',start:0,end:5}]}]}]}]},{kind:'at',parentKey:wrapper.key,index:1});c.submit();
 let source=Object.values(c.session()!.projection.state.nodes).find(n=>n.payload.id==='nested-source')!;
 e.commands.transclude(source.key,{kind:'at',parentKey:wrapper.key,index:2});
 source=c.session()!.projection.nodesForContent(source.contentKey)[0];const occurrences=c.session()!.projection.nodesForContent(source.contentKey),mounts=occurrences.map(n=>e.mounts.get(n.key)),cells=occurrences.map(n=>[...n.inlineContent]);
 expect(occurrences).toHaveLength(2);c.selectRange('reply',e.textRanges.snapshot(source.key,0,6));const t=c.reply()!;f.type!('Nested reply');
 const build=vi.spyOn(c.session()!.projection as any,'build'),snapshots=vi.spyOn(e.repository,'snapshot');c.submit();expect(c.notice()).toBe('');
 expect(c.resolveReference(t).segments).toHaveLength(1);expect(c.resolveReference(t).text).toBe('Nested');expect(build).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();
 occurrences.forEach((n,i)=>{expect(e.mounts.get(n.key)).toBe(mounts[i]);expect(n.inlineContent).toEqual(cells[i]);expect((n.payload.standoffProperties as any[])[0]).toMatchObject({id:'bold-source',type:'style/bold'});});
 e.repository.undo();e.repository.redo();expect(c.resolveReference(t).segments).toHaveLength(1);expect(build).not.toHaveBeenCalled();
});

it('rejects oversized supplied context before reading its complete text',async()=>{
 const f=await setup(),c=f.c!;f.type!('x'.repeat(6000));c.submit();
 const read=vi.spyOn(c.references()!,'text'),revision=f.editor.repository.state.revision;
 await c.askMock();expect(c.notice()).toContain('6,000 characters');expect(read).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);
});
it('authors Sequence metadata locally with Undo, native persistence and unchanged chronology',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor;f.type!('First perspective');c.submit();f.type!('Second perspective');c.submit();
 const order=c.committed().map(r=>r.id),s=c.sequences,source=c.committed()[0],mount=editor.mounts.get(source.key)!.root;
 const native=nativeDocumentSession(editor);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'sequence.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshot=vi.spyOn(editor.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 const refs={...c.references()!.diagnostics};s.create();const g=s.draft()!.groups[0].id;s.add(g,c.target(order[0]));s.add(g,c.target(order[1]));s.save();
 expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(c.references()!.diagnostics).toEqual(refs);expect(s.saved()).toHaveLength(1);expect(native.isDirty(c.resourceId())).toBe(true);expect(c.committed().map(r=>r.id)).toEqual(order);expect(editor.mounts.get(source.key)!.root).toBe(mount);
 const saved=captureNative(editor.repository.readState(),c.resourceId());expect(JSON.stringify(saved)).toContain('New Sequence');
 editor.repository.undo();expect(s.saved()).toHaveLength(0);editor.repository.redo();expect(s.saved()).toHaveLength(1);expect(snapshot).not.toHaveBeenCalled();
});
it('keeps Sequence navigation/reveal and repeated-member state out of canonical history/context',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor;f.type!('Evidence');c.submit();const s=c.sequences,t=c.target(c.committed()[0].id);s.create();const g=s.draft()!.groups[0].id;s.add(g,t);s.add(g,t);s.change(d=>{d.groups[0].presentation={reveal:'in-order'};d.groups.push({id:crypto.randomUUID(),title:'Alternative',members:[]});});s.save();
 const seq=s.saved()[0],members=seq.groups[0].members,before=editor.repository.state.revision;
 s.duplicate(seq.id);expect(s.draft()!.id).not.toBe(seq.id);expect(s.draft()!.groups[0].id).not.toBe(seq.groups[0].id);expect(s.draft()!.groups[0].members[0].id).not.toBe(members[0].id);expect(s.draft()!.groups[0].members[0].source).toEqual(members[0].source);s.cancel();
 s.present(seq.id);expect(s.visible(members[0].id)).toBe(true);expect(s.visible(members[1].id)).toBe(false);s.show(members[1].id);expect(s.visible(members[1].id)).toBe(true);s.reset();expect(s.visible(members[1].id)).toBe(false);s.reveal();expect(s.visible(members[1].id)).toBe(true);
 expect(s.memberState(members[0].id)).not.toBe(s.memberState(members[1].id));expect(c.context()).toEqual([]);expect(c.reply()).toBeUndefined();s.chooseGroup(seq.groups[1].id);expect(s.group()!.id).toBe(seq.groups[1].id);s.chooseGroup(seq.groups[0].id);expect(s.visible(members[1].id)).toBe(true);s.leave(false);expect(editor.repository.state.revision).toBe(before);
 editor.commands.remove(c.resolve(t)!.key);expect(c.resolve(t)).toBeUndefined();expect(s.saved()[0].groups[0].members).toHaveLength(2);editor.repository.undo();expect(c.resolve(t)).toBeTruthy();
});

function dcpResponse(exchange:string){return {protocol:'dcp/1.0',kind:'contribution',exchange,intent:'qualify',replyTargets:[] as string[],composition:[{id:'p',kind:'paragraph',markup:'<annotation type="dialectic/claim" id="generated">A😀</annotation>',ranges:[]}],anchors:[] as any[],entities:[],interpretations:[] as any[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]};}
it('materialises DCP atomically with independent reply/discursive references and AI provenance',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,n=f.text!();f.type!('Alpha beta gamma');c.submit();const primary=c.target(c.frontier()!.id),mount=e.mounts.get(n.key),cells=[...n.inlineContent];
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(request,sources,chunk)=>{
  const parent=await sources.tool({id:'one',tool:'read_source',arguments:{handle:request.primaryReply}});
  const source=await sources.tool({id:'two',tool:'read_source',arguments:{handle:parent.children[0]}});
  const search=await sources.tool({id:'three',tool:'search_symposium',arguments:{query:'beta',limit:5}});expect(search.status).toBe('complete');expect(search.items).toHaveLength(1);
  const value=dcpResponse(request.exchange);value.composition.push({id:'group',kind:'group',children:[{id:'list',kind:'list',style:'ordered',items:[[{id:'item',kind:'paragraph',markup:'Item',ranges:[]}]]}]} as any);value.replyTargets=['human'];value.anchors=[{id:'human',source:source.handle,revision:source.revision,selector:{exact:'beta',prefix:'Alpha ',suffix:' gamma'}}];value.interpretations=[{id:'interpretation',target:'human',type:'dialectic/qualification',ref:null,attributes:[]}];
  chunk(JSON.stringify(value));expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);return JSON.stringify(value);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);const data=c.frontier()!.data;
 expect(c.resolve(c.target(c.frontier()!.id))!.children.map(k=>c.session()!.projection.node(k)!.viewType)).toEqual(['standoff-editor-block','container-block']);expect(data.replies).toEqual([primary]);expect(data.discursiveReferences).toHaveLength(1);expect(c.resolveReference(data.discursiveReferences![0]).text).toBe('beta');
 expect(data.dcp?.tools).toHaveLength(3);expect(data.dcp?.request).toMatchObject({protocolKey:{version:'4a-1'}});
 const properties=n.payload.standoffProperties as any[];expect(properties.find(p=>p.type==='dialectic/qualification')).toMatchObject({start:6,end:9,metadata:{dcp:{actor:'mock',exchangeId:data.requestId,sourceAuthor:'human',appliedTo:'existing-source'}}});
 expect(Object.values(c.root()!.payload.linkedAnnotations as any).every((d:any)=>d.type==='dialectic/range-anchor')).toBe(true);
 expect(e.mounts.get(n.key)).toBe(mount);expect(n.inlineContent).toEqual(cells);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(1);expect((n.payload.standoffProperties??[])).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(2);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const saved=JSON.stringify(decodeNative(nativeBytes(captureNative(e.repository.readState(),c.resourceId()))));expect(saved).toContain('discursiveReferences');expect(saved).toContain('existing-source');expect(saved).not.toContain('dialectic/argument');
});
it('rejects ambiguous selectors, unavailable Stage 4B and malformed output without orphan content',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('same same');c.submit();const before=e.repository.state.revision,snapshots=vi.spyOn(e.repository,'snapshot');
 await c.askMock(async(request,sources)=>{const parent=await sources.tool({id:'p',tool:'read_source',arguments:{handle:request.primaryReply}}),source=await sources.tool({id:'b',tool:'read_source',arguments:{handle:parent.children[0]}});const v=dcpResponse(request.exchange);v.anchors=[{id:'ambiguous',source:source.handle,revision:source.revision,selector:{exact:'same',prefix:'',suffix:''}}];return JSON.stringify(v);});
 expect(c.notice()).toContain('Ambiguous');expect(e.repository.state.revision).toBe(before);
 await c.askMock(async request=>JSON.stringify({...dcpResponse(request.exchange),arguments:[{id:'arg',anchor:'generated'}]}));expect(c.notice()).toContain('Stage 4B');
 await c.askMock(async()=>'<p>not DCP</p>');expect(c.notice()).not.toBe('');expect(e.repository.state.revision).toBe(before);expect(()=>e.commands.boundedStructuralTransaction('Reject broad edit',()=>e.commands.setPayloadField(c.root()!.key,'metadata',{...JSON.parse(JSON.stringify(c.root()!.payload.metadata)),title:'Must not commit'}))).toThrow(/bounded|broad/);expect(e.repository.state.revision).toBe(before);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);expect(snapshots).not.toHaveBeenCalled();
});
it('rejects edit/Undo ABA and releases a cancelled transport that never settles',async()=>{
 const f=await setup(),c=f.c!,e=f.editor,n=f.text!();f.type!('Original');c.submit();
 let release!:()=>void;const waiting=new Promise<void>(r=>release=r);
 const pending=c.askMock(async request=>{await waiting;return JSON.stringify(dcpResponse(request.exchange));});
 e.commands.replaceInlineRange(n.key,0,0,'change');e.repository.undo();release();await pending;expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(1);
 const cancelled=c.askMock(async()=>new Promise<string>(()=>{}));c.cancel();await cancelled;expect(c.busy()).toBe(false);expect(c.committed()).toHaveLength(1);expect(c.dcpPreview()).toBe('');
});
it('keeps retrieval authorized, bounded, cancellable and absent from typing',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('Visible source');c.submit();f.type!('Private draft');
 const state=e.repository.readState(),bank=state.contents[state.placements[state.rootPlacementKey].contentKey].children.find(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block')!;
 e.commands.insert({id:'dcp-unrelated',type:'document-block',metadata:{documentId:'dcp-unrelated'},children:[{id:'foreign-text',type:'standoff-editor-block',text:'SECRET '.repeat(2000)}]},{kind:'at',parentKey:bank,index:1});
 const other=Object.values(e.repository.readState().contents).find(n=>n.payload.id==='foreign-text')!;const snapshots=vi.spyOn(e.repository,'snapshot');
 const before={...c.dcpDiagnostics};f.type!('typing');expect(c.dcpDiagnostics).toEqual(before);
 await c.askMock(async(request,sources)=>{
  expect((await sources.tool({id:'unauthorized',tool:'read_source',arguments:{handle:'foreign-text'}})).status).toBe('unauthorized');
  const found=await sources.tool({id:'search',tool:'search_symposium',arguments:{query:'Private',limit:1}});expect(found.items).toHaveLength(0);expect(sources.diagnostics.visited).toBeLessThan(5);
  const limited=await sources.tool({id:'limit',tool:'search_symposium',arguments:{query:'Visible',limit:1}});expect(limited.status).toBe('truncated');expect(limited.items).toHaveLength(1);
  expect(JSON.stringify(sources.trail)).not.toContain('SECRET');return JSON.stringify(dcpResponse(request.exchange));
 });
 expect(c.notice()).toBe('');expect(e.repository.readState().contents[other.key]).toBe(other);expect(snapshots).not.toHaveBeenCalled();expect(c.dcpDiagnostics.searches).toBe(2);
});
it('retains the accepted mock fallback when DCP is disabled',async()=>{
 const f=await setup(true,true,false),c=f.c!;f.type!('Legacy mock');c.submit();await c.askMock();expect(c.notice()).toBe('');expect(c.frontier()!.data.dcp).toBeUndefined();expect(c.committed()).toHaveLength(2);
});
it('captures selected-context provenance at request time and rejects draft context',async()=>{
 const f=await setup(),c=f.c!;f.type!('Committed');c.submit();const target=c.target(c.frontier()!.id);c.pin(target);
 await c.askMock(async request=>{c.unpin(target);return JSON.stringify(dcpResponse(request.exchange));});
 expect(c.notice()).toBe('');expect(c.frontier()!.data.consumedContext!.items[0].origins).toEqual(['reply-target','selected']);expect(c.context()).toHaveLength(0);
 c.pin(c.target(c.draft()!.id));const revision=f.editor.repository.state.revision;await c.askMock();expect(c.notice()).toContain('before replying');expect(f.editor.repository.state.revision).toBe(revision);
});

it('4B commits distinct semantic identities atomically and resolves live/unresolved passages without rebuilding inventories',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Human evidence');c.submit();const original=c.committed()[0],source=c.session()!.projection.node(c.resolve(c.target(original.id))!.children[0])!,mount=e.mounts.get(source.key)!.root;
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(request,sources)=>{
  const p=await sources.tool({id:'p',tool:'read_source',arguments:{handle:request.primaryReply}}),source=await sources.tool({id:'s',tool:'read_source',arguments:{handle:p.children[0]}});
  const v:any=dcpResponse(request.exchange);v.anchors=[{id:'human',source:source.handle,revision:source.revision,selector:{exact:'Human evidence',prefix:'',suffix:''}}];
  v.interpretations=[{id:'classification',target:'human',type:'dialectic/claim',ref:null,attributes:[]}];
  v.arguments=[{id:'human-argument',anchor:'human'},{id:'answer-argument',anchor:'generated'}];v.relations=[{id:'edge',kind:'argument',type:'supports',from:'answer-argument',to:'human-argument'},{id:'entity-edge',kind:'entity',type:'related-to',from:'e1',to:'e2'}];
  v.entities=[{id:'e1',name:'Evidence',typename:'Concept',description:'',aliases:['Support']},{id:'e2',name:'Inference',typename:'Concept',description:'',aliases:[]}];
  v.glosses=[{id:'gloss',target:'human',type:'clarification',text:'An independent clarification'}];v.composition.push({id:'entity-text',kind:'paragraph',markup:'<annotation type="mutable/entity-reference" ref="e1">Evidence</annotation>',ranges:[]});v.replyTargets=['human-argument','e1'];return JSON.stringify(v);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(e.mounts.get(source.key)!.root).toBe(mount);
 const definitions:any=c.root()!.payload.linkedAnnotations,values:any[]=Object.values(definitions),data=c.frontier()!.data,aliases:any=data.dcp!.identityMap,arg=aliases['human-argument'];
 expect(values.filter(d=>d.type===ARGUMENT)).toHaveLength(2);expect(values.filter(d=>d.type===LOCAL_ENTITY)).toHaveLength(2);expect(values.filter(d=>d.type==='mutable/gloss')).toHaveLength(1);
 expect(values.find(d=>d.type===ARGUMENT_RELATION).metadata.dialecticArgumentRelation).toMatchObject({relation:'supports',from:{argumentId:aliases['answer-argument'].argumentId},to:{argumentId:arg.argumentId}});
 expect(c.resolveReference(arg)).toMatchObject({status:'resolved',identityExists:true,text:'Human evidence'});expect(c.argumentRelations(arg.argumentId)).toHaveLength(1);expect(c.resolveReference(aliases.e1).text).toBe('Evidence');c.inspect(aliases.e1);expect(c.exchangeTarget()?.kind).toBe('contribution');
 const defsReads=c.references()!.diagnostics.definitionReads;e.commands.replaceInlineRange(source.key,5,5,'New ');await tick();expect(c.references()!.diagnostics.definitionReads).toBe(defsReads);expect(c.resolveReference(arg).changed).toBe(true);expect(c.committed()).toHaveLength(2);
 e.repository.undo();e.repository.undo();expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);e.repository.redo();expect(c.resolveReference(arg).status).toBe('resolved');
 expect(()=>captureBlocks(e.repository.readState(),[source.placementKey])).toThrow(/dependency remapping/);expect(()=>serializeSelection(e.repository.readState(),[{placementKey:source.placementKey}])).toThrow(/dependency remapping/);
 // Removing classifications and the independent Gloss never removes the argument.
 e.commands.setPayloadField(source.key,'standoffProperties',JSON.parse(JSON.stringify(source.payload.standoffProperties)).filter((p:any)=>p.type==='dialectic/range-anchor'));
 expect(c.resolveReference(arg).status).toBe('resolved');
 e.commands.remove(source.key);expect(c.resolveReference(arg)).toMatchObject({status:'unanchored',identityExists:true,historical:'Human evidence'});expect((c.root()!.payload.linkedAnnotations as any)[arg.argumentId].type).toBe(ARGUMENT);
 const snapshot=captureNative(e.repository.readState(),c.resourceId());const reloaded=decodeNative(nativeBytes(snapshot));expect(JSON.stringify(reloaded)).toContain(arg.argumentId);expect(JSON.stringify(reloaded)).toContain('entityReference');
});
it('4B Submit & Ask captures after a multi-Block human commit; Ask does not resubmit edits or force alternation',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('First');const d=c.resolve(c.target(c.draft()!.id))!;e.commands.insert({type:'container-block',children:[{type:'standoff-editor-block',text:'Nested'}]},{kind:'at',parentKey:d.key,index:1});
 await c.submitAndAsk(async(req)=>{expect(c.committed()).toHaveLength(1);expect(req.context[0].plainTextExcerpt).toContain('Nested');return JSON.stringify(dcpResponse(req.exchange));});
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(c.committed()[0].data.participant?.kind).toBe('human');expect(c.committed()[1].data.participant?.kind).toBe('ai');
 f.type!('Second human');c.submit();f.type!('Third human');c.submit();expect(c.committed()).toHaveLength(4);
 const first=c.resolve(c.target(c.committed()[0].id))!,a=c.session()!.projection.node(first.children[0])!,b=c.session()!.projection.node(c.session()!.projection.node(first.children[1])!.children[0])!;
 e.commands.replaceInlineRange(a.key,0,0,'Edit ');e.commands.replaceInlineRange(b.key,0,0,'Also ');c.setReply(c.target(c.committed()[0].id));
 await c.askMock(async(req)=>{expect(c.committed()).toHaveLength(4);expect(req.context[0].plainTextExcerpt).toContain('Edit First');expect(req.context[0].plainTextExcerpt).toContain('Also Nested');return JSON.stringify(dcpResponse(req.exchange));});
 expect(c.committed()).toHaveLength(5);expect(c.frontier()!.data.replies[0].blockId).toBe(c.committed()[0].id);
});
it('4B rejects wrong-kind/foreign semantic endpoints and cancellation without partial definitions',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('Source');c.submit();
 await c.askMock(async(req)=>{const v:any=dcpResponse(req.exchange);v.entities=[{id:'e',name:'Entity',typename:'Concept',description:'',aliases:[]}];v.arguments=[{id:'a',anchor:'generated'}];v.relations=[{id:'r',kind:'argument',type:'supports',from:'a',to:'e'}];return JSON.stringify(v);});
 expect(c.notice()).toMatch(/argument/);expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 const waiting=c.askMock(()=>new Promise(()=>{}));c.cancel();await waiting;expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
 const service=new ScopedEntities(f.editor,c.root()!.key,c.resourceId());const e=service.prepare({name:'Local',typename:'Concept',description:'',aliases:[]},{actor:'human'});service.commit({[e.id]:e});expect(service.local({scope:'document',resourceId:c.resourceId(),entityId:e.id})?.name).toBe('Local');expect(()=>service.prepareRelation('supports',{scope:'document',resourceId:'foreign',entityId:e.id},{scope:'document',resourceId:c.resourceId(),entityId:e.id},{})).toThrow(/owned/);service.dispose();
});

it('4B shared Entity service admits local/Vault relationships through read-only scope-qualified resolution',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Source');c.submit();const get=vi.fn(async()=>({id:'global',name:'Global concept',revision:3,aliases:[]})),write=vi.fn(()=>{throw Error('SQL mutation forbidden');});cleanup.push(registerStandaloneEntityService(e,()=>({get,historyScope:async()=>'directory-A',scopeIdentity:async()=>'vault-A',create:write,rename:write,alias:write,dispose(){}} as any)));
 const original=c.session()!.projection.node(c.resolve(c.target(c.committed()[0].id))!.children[0])!;e.commands.setPayloadField(original.key,'standoffProperties',[{id:'global-mention',type:'codex/entity-reference',value:'global',start:0,end:5}]);
 await c.askMock(async(req,sources)=>{const parent=await sources.tool({id:'parent',tool:'read_source',arguments:{handle:req.primaryReply}}),source=await sources.tool({id:'text',tool:'read_source',arguments:{handle:parent.children[0]}}),global=source.annotations[0].entityHandle;expect(global).toBeTruthy();expect(global.length).toBeLessThanOrEqual(128);expect((await sources.tool({id:'entity',tool:'read_source',arguments:{handle:global}})).entity.name).toBe('Global concept');const v:any=dcpResponse(req.exchange);v.entities=[{id:'local',name:'Local concept',typename:'Concept',description:'Document owned',aliases:[]}];v.relations=[{id:'r',kind:'entity',type:'related-to',from:'local',to:global}];return JSON.stringify(v);});
 expect(c.notice()).toBe('');expect(write).not.toHaveBeenCalled();expect(get).toHaveBeenCalled();const values:any[]=Object.values(c.root()!.payload.linkedAnnotations??{}),r=values.find(d=>d.type===LOCAL_ENTITY_RELATION).metadata.scopedEntityRelation;expect(r.to).toEqual({scope:'vault',vaultId:'vault-A',entityId:'global'});
 const inventory=documentContextInventory(captureNative(e.repository.readState(),c.resourceId()));expect(inventory.entities).not.toContain(r.from.entityId);expect(inventory.localEntities).toHaveLength(1);expect(JSON.stringify(inventory.unresolved)).toContain('vault-A');
 const service=new ScopedEntities(e,c.root()!.key,c.resourceId());const local=JSON.parse(JSON.stringify(values.find(d=>d.type===LOCAL_ENTITY)));service.commit({[local.id]:{...local,isDeleted:true}});expect(service.local(r.from)).toBeUndefined();expect((c.root()!.payload.linkedAnnotations as any)[values.find(d=>d.type===LOCAL_ENTITY_RELATION).id]).toBeTruthy();e.repository.undo();expect(service.local(r.from)?.name).toBe('Local concept');await expect(service.resolve({scope:'vault',vaultId:'another',entityId:'global'})).rejects.toThrow(/another Vault/);expect(await service.resolve({scope:'document',resourceId:'another',entityId:r.from.entityId})).toBeUndefined();service.dispose();
});
it('4B reuses older argument handles without conflating classifications, and preserves unresolved incident edges',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Earlier source');c.submit();await c.askMock();expect(c.notice()).toBe('');
 const registry=()=>c.root()!.payload.linkedAnnotations as any,all:any[]=Object.values(registry()),a=all.find(d=>d.type===ARGUMENT),target:any={kind:'argument',resourceId:c.resourceId(),argumentId:a.id};c.setReply(target);
 await c.askMock(async(req,sources)=>{const result=await sources.tool({id:'old',tool:'read_source',arguments:{handle:req.primaryReply}});expect(result.kind).toBe('argument');expect(result.identityExists).toBe(true);const v:any=dcpResponse(req.exchange);v.arguments=[{id:'new',anchor:'generated'}];v.relations=[{id:'r',kind:'argument',type:'depends-on',from:'new',to:req.primaryReply}];return JSON.stringify(v);});
 expect(c.notice()).toBe('');expect(c.frontier()!.data.replies[0]).toEqual(target);expect(c.argumentRelations(a.id).length).toBeGreaterThan(0);
 const before=c.argumentRelations(a.id).map(d=>d.id);e.commands.boundedStructuralTransaction('Delete argument',()=>e.commands.setPayloadField(c.root()!.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(registry())),[a.id]:{...JSON.parse(JSON.stringify(registry()[a.id])),isDeleted:true}}));expect(c.resolveReference(target).status).toBe('missing');expect(c.argumentRelations(a.id).map(d=>d.id)).toEqual(before);e.repository.undo();expect(c.resolveReference(target).status).toBe('resolved');
});

it('4B cancellation during asynchronous global-reference validation leaves no local semantic records',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('Human source');c.submit();let entered=false;cleanup.push(registerStandaloneEntityService(f.editor,()=>({scopeIdentity:async()=>'vault',get:()=>{entered=true;return new Promise(()=>{});},dispose(){}} as any)));
 const task=c.askMock(async(req,sources)=>{const global=sources.issue({kind:'entity',resourceId:c.resourceId(),entity:{scope:'vault',vaultId:'vault',entityId:'global'}}),v:any=dcpResponse(req.exchange);v.entities=[{id:'local',name:'Never committed',typename:'Concept',description:'',aliases:[]}];v.arguments=[{id:'a',anchor:'generated'}];v.relations=[{id:'r',kind:'entity',type:'related-to',from:'local',to:global}];return JSON.stringify(v);});
 for(let i=0;i<20&&!entered;i++)await tick();expect(entered).toBe(true);c.cancel();await task;expect(c.committed()).toHaveLength(1);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);
});

it('commits ordinary live replies with no semantic records, distinct provider provenance and one Undo',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('Shall we have a family picnic?');c.submit();const source=f.text!(),mount=e.mounts.get(source.key),snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 let request:any,provider='openai',round=0;
 const receipt=()=>({provider,model:'fixture-'+provider,startedUtc:'start',completedUtc:'end',usage:{input_tokens:20,output_tokens:10},stop:'completed',cost:{status:'unknown'}});
 const fetcher=vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));if(url.endsWith('/settings')){provider=body.settings.provider;return new Response(JSON.stringify({settings:body.settings,ready:true}));}if(url.endsWith('/exchange')){request=body.request;round=0;return new Response(JSON.stringify({id:'e',settings:c.providerSettings(),system:'fixture protocol'}));}if(url.endsWith('/turn')){round++;const text=JSON.stringify({protocol:'dcp/1.0',kind:'contribution',exchange:request.exchange,intent:'acknowledge',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'Sounds lovely!',ranges:[]}],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});return new Response(JSON.stringify({type:'delta',text:text.slice(0,10)})+'\n'+JSON.stringify({type:'result',text,calls:[],receipt:receipt()})+'\n');}return new Response('{}');});vi.stubGlobal('fetch',fetcher);
 for(const provider of ['openai','anthropic'] as const){await c.configureProvider({provider,model:'configured-'+provider,maxOutputTokens:1024,repair:true,cadence:'conversational'},'test-secret');await c.ask();expect(c.notice()).toBe('');const row=c.committed().at(-1)!;expect(row.data.author).toBe('ai');expect(row.data.participant?.name).toBe('AI participant');expect(row.data.dcp?.provider?.settings.provider).toBe(provider);expect(row.data.dcp?.intent).toBe('acknowledge');expect(row.data.dcp?.provider?.attempts).toHaveLength(1);expect(row.data.dcp?.provider?.attempts[0].receipt.usage).toEqual({input_tokens:20,output_tokens:10});expect(row.data.discursiveReferences).toEqual([]);expect(Object.keys(c.root()!.payload.linkedAnnotations??{})).toHaveLength(0);expect(JSON.stringify(captureNative(e.repository.readState(),c.resourceId()))).not.toContain('test-secret');expect(round).toBe(1);}
 expect(c.committed()).toHaveLength(3);const participant=c.committed()[1].data.participant!.id;expect(c.committed()[2].data.participant!.id).toBe(participant);e.repository.undo();expect(c.committed()).toHaveLength(2);e.repository.redo();expect(c.committed()).toHaveLength(3);expect(e.mounts.get(source.key)).toBe(mount);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();const calls=fetcher.mock.calls.length,reads=c.dcpDiagnostics.reads;f.type!('Typing remains local.');expect(fetcher.mock.calls).toHaveLength(calls);expect(c.dcpDiagnostics.reads).toBe(reads);
});

it('live validation repair stays transient, bounded and cancellable without duplicate commits',async()=>{
 const f=await setup(true,true,true,true),c=f.c!;f.type!('Share a story.');c.submit();let request:any,turn=0,mode='repair';
 const receipt={provider:'openai',model:'m',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));if(url.endsWith('/settings'))return new Response(JSON.stringify({settings:body.settings,ready:true}));if(url.endsWith('/exchange')){request=body.request;turn=0;return new Response(JSON.stringify({id:'e',settings:c.providerSettings()}));}if(url.endsWith('/turn')){turn++;if(mode==='cancel'){queueMicrotask(c.cancel);throw Error('cancelled');}const text=turn===1||mode==='invalid'?'not JSON':JSON.stringify({protocol:'dcp/1.0',kind:'contribution',exchange:request.exchange,intent:'create',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'Once upon a time…',ranges:[]}],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});expect(c.committed()).toHaveLength(mode==='repair'?1:2);return new Response(JSON.stringify({type:'result',text,calls:[],receipt})+'\n');}return new Response('{}');}));
 await c.configureProvider({provider:'openai',model:'m',maxOutputTokens:1024,repair:true,cadence:'conversational'},'test-secret');await c.ask();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);expect(c.committed()[1].data.dcp?.provider?.attempts[0].rejectedResponse).toBe('not JSON');expect(turn).toBe(2);
 mode='invalid';await c.ask();expect(c.committed()).toHaveLength(2);expect(turn).toBe(2);expect(c.notice()).not.toBe('');mode='cancel';await c.ask();expect(c.committed()).toHaveLength(2);expect(c.busy()).toBe(false);
});

it('live source classifications retain human authorship and AI exchange provenance with bounded admission',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;f.type!('We could share a picnic.');const original=f.text!();c.submit();let request:any;const snapshots=vi.spyOn(e.repository,'snapshot');
 const receipt={provider:'openai',model:'m',startedUtc:'start',completedUtc:'end',usage:null,stop:'completed',cost:{status:'unknown'}};
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{const body=init?.body&&JSON.parse(init.body);if(url.endsWith('/session'))return new Response(JSON.stringify({token:'token'}));if(url.endsWith('/settings'))return new Response(JSON.stringify({settings:body.settings,ready:true}));if(url.endsWith('/exchange')){request=body.request;return new Response(JSON.stringify({id:'e',settings:c.providerSettings()}));}if(url.endsWith('/turn')){
  let calls:any[]=[],text='';if(body.round===0)calls=[{id:'first',tool:'read_source',arguments:{handle:request.primaryReply}}];else if(body.round===1)calls=[{id:'second',tool:'read_source',arguments:{handle:body.results[0].result.children[0]}}];else{const source=body.results[0].result;text=JSON.stringify({protocol:'dcp/1.0',kind:'contribution',exchange:request.exchange,intent:'reply',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'I’d like that.',ranges:[]}],anchors:[{id:'source',source:source.handle,revision:source.revision,selector:{exact:source.text,prefix:'',suffix:''}}],interpretations:[{id:'mark',target:'source',type:'dialectic/suggestion',ref:null,attributes:[]}],entities:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});}return new Response(JSON.stringify({type:'result',text,calls,receipt})+'\n');}return new Response('{}');}));
 await c.configureProvider({provider:'openai',model:'m',maxOutputTokens:1024,repair:false,cadence:'conversational'},'test-secret');await c.ask();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);const property=(original.payload.standoffProperties as any[]).find(p=>p.type==='dialectic/suggestion');expect(property.metadata.dcp).toMatchObject({actor:'ai',sourceAuthor:'human',appliedTo:'existing-source',exchangeId:c.committed()[1].data.requestId});expect(c.committed()[0].data.author).toBe('human');expect(Object.values(c.root()!.payload.linkedAnnotations??{}).map((d:any)=>d.type)).toEqual(['dialectic/range-anchor']);expect(snapshots).not.toHaveBeenCalled();e.repository.undo();expect((original.payload.standoffProperties as any[]??[]).filter(p=>p.type==='dialectic/suggestion')).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(2);
});

it('native authoring sends selected hierarchy and participant context, materialises multiple addresses and inspected semantics with Undo and persistence',async()=>{
 const {authoringExamples}=await import('./dcp/authoring');
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;
 f.type!('Rain is forecast.');c.submit();const first=c.target(c.frontier()!.id),original=c.session()!.projection.node(c.resolve(first)!.children[0])!,mount=e.mounts.get(original.key);
 f.type!('We could meet at the library.');c.submit();const second=c.target(c.frontier()!.id);c.pin(first);c.pin(second);
 f.type!('Address both earlier contributions, annotate the forecast, and explicitly relate the forecast argument to an indoor proposal.');c.submit();const requestTarget=c.target(c.frontier()!.id);
 const snapshots=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.task.participantRequest.text).toContain('Address both');expect(req.task.focus).toBe(req.primaryReply);
  const manifest=req.structuralContext;expect(manifest.status).toBe('complete');expect(manifest.sources.length).toBe(6);
  const a=manifest.sources.find((s:any)=>s.target.blockId===first.blockId&&s.kind==='contribution');expect(a.contribution).toMatchObject({ordinal:1,author:'human',participant:{kind:'human'}});expect(a.contribution.createdUtc).toBeTruthy();
  const b=manifest.sources.find((s:any)=>s.target.blockId===second.blockId&&s.kind==='contribution');
  const text=manifest.sources.find((s:any)=>s.target.blockId===original.payload.id);expect(text.exactAnchorEligible).toBe(true);expect(a.children).toContain(text.handle);
  expect(sources.diagnostics.reads).toBe(0);expect(req.authoring.instructions).toContain('Discursive addressing does NOT require an argument');
  const response=JSON.parse(JSON.stringify(authoringExamples[1].response));response.exchange=req.exchange;response.replyTargets=[a.handle,b.handle];response.anchors[0].source=text.handle;response.anchors[0].revision=text.revision;
  const {prepare}=await import('./dcp/exchange'),{validationDiagnostic}=await import('./dcp/diagnostics');
  const invalid=structuredClone(response);invalid.anchors[0].selector.exact='Not in the source';
  let diagnostic;try{await prepare(JSON.stringify(invalid),req.exchange,c.resourceId(),e.visualEffects,sources,true);}catch(error){diagnostic=validationDiagnostic(error);}
  expect(diagnostic).toMatchObject({code:'source',path:'$.anchors[0]'});expect(JSON.stringify(diagnostic)).not.toContain('Not in the source');
  return JSON.stringify(response);
 });
 expect(c.notice()).toBe('');const result=c.frontier()!,dcp=result.data.dcp!;
 expect(result.data.replies).toEqual([requestTarget]);expect(result.data.discursiveReferences).toEqual([first,second]);expect(dcp.annotationRefs).toHaveLength(2);
 const definitions=Object.values(c.root()!.payload.linkedAnnotations??{}) as any[];expect(definitions.filter(d=>d.type===ARGUMENT)).toHaveLength(2);expect(definitions.filter(d=>d.type===ARGUMENT_RELATION)[0].metadata.dialecticArgumentRelation.relation).toBe('supports');
 const ref=dcp.annotationRefs!.find(r=>r.blockId===original.payload.id)!;c.inspectAnnotation(ref);expect(c.inspectedAnnotation()?.property.type).toBe('dialectic/claim');expect(c.inspectedAnnotation()?.text).toBe('Rain is forecast.');
 const rowButton=[...f.host.querySelectorAll<HTMLButtonElement>('.dialectic-entry')].find(b=>b.querySelector('.dialectic-number')?.textContent==='04')!;rowButton.click();await tick();
 expect(f.host.querySelector('.dialectic-native-structures')?.textContent).toContain('2 discursive addresses · 2 annotations · 1 relationships');
 const annotationButton=[...f.host.querySelectorAll<HTMLButtonElement>('.dialectic-annotation-link')].find(b=>b.textContent?.includes('dialectic/claim'))!;annotationButton.click();await tick();expect(f.host.querySelector('[aria-label="Annotation inspection"]')?.textContent).toContain('Rain is forecast.');
 expect(e.mounts.get(original.key)).toBe(mount);expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(c.committed()).toHaveLength(3);expect((original.payload.standoffProperties as any[]??[])).toHaveLength(0);e.repository.redo();expect(c.committed()).toHaveLength(4);expect(c.annotationDetails(ref)?.property.type).toBe('dialectic/claim');
 const saved=JSON.stringify(decodeNative(nativeBytes(captureNative(e.repository.readState(),c.resourceId()))));expect(saved).toContain(ref.propertyId);expect(saved).toContain('annotationRefs');expect(saved).toContain('structuralContext');expect(saved).toContain('dialectic/argument-relation');
 const reads={...c.dcpDiagnostics};f.type!('Ordinary typing');expect(c.dcpDiagnostics).toEqual(reads);
 c.setReply(c.target(result.id));await c.askMock(async req=>{const sources=req.structuralContext.sources;expect(sources.some((s:any)=>s.kind==='argument')).toBe(true);expect(sources.some((s:any)=>s.kind==='argument-relation'&&s.definition.metadata.dialecticArgumentRelation.relation==='supports')).toBe(true);return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
});

it('bounds the selected structural manifest without fetching unselected history or unrelated Documents',async()=>{
 const f=await setup(true,true,true,true),c=f.c!,e=f.editor;
 f.type!('Unselected private history');c.submit();f.type!('Selected content');
 const draft=c.resolve(c.target(c.draft()!.id))!;
 for(let i=0;i<75;i++)e.commands.insert({type:'standoff-editor-block',text:'Small '+i},{kind:'at',parentKey:draft.key,index:i+1});c.submit();
 await c.askMock(async req=>{expect(req.structuralContext.status).toBe('truncated');expect(req.structuralContext.sources).toHaveLength(64);expect(JSON.stringify(req.structuralContext)).not.toContain('Unselected private history');return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toBe('');
});

it('protects submitted base text canonically while retaining annotations, drafts and history',async()=>{
 const f=await setup(true,true,true,true,true),e=f.editor,c=f.c!,n=f.text!();f.type!('Protected evidence');c.submit();await tick();
 const native=nativeDocumentSession(e);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'protected.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const before=e.repository.state.revision,mount=e.mounts.get(n.key)!,snapshots=vi.spyOn(e.repository,'snapshot'),rebuild=vi.spyOn(c.session()!.projection as any,'build'),changes=vi.fn(),stop=e.repository.subscribeChanges(changes);cleanup.push(stop);
 expect(mount.focusElement?.getAttribute('contenteditable')).toBe('false');
 expect(()=>e.commands.replaceInlineRange(n.key,0,1,'X')).toThrow(/protected/);
 expect(()=>e.commands.completeProvisionalText(n.key,e.repository.readState().contents[n.contentKey].inlineRevision,[{start:0,end:1,text:'X'}])).toThrow(/protected/);
 expect(()=>e.commands.remove(n.key)).toThrow(/protected/);
 const cell=e.repository.readState().contents[e.repository.readState().placements[e.repository.readState().contents[n.contentKey].inlineContent[0]].contentKey];
 expect(()=>e.repository.commit('Direct cell edit',[{kind:'put-content',record:{...cell,payload:{text:'X'}}}])).toThrow(/protected/);
 expect(e.repository.state.revision).toBe(before);expect(changes).not.toHaveBeenCalled();expect(native.isDirty(c.resourceId())).toBe(false);
 const input=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'X'});mount.focusElement!.dispatchEvent(input);expect(input.defaultPrevented).toBe(true);
 e.rangeAnnotations.apply([e.textRanges.snapshot(n.key,0,9)],'style/bold');expect(n.payload.standoffProperties).toHaveLength(1);e.repository.undo();expect(n.payload.standoffProperties??[]).toHaveLength(0);e.repository.redo();expect(n.payload.standoffProperties).toHaveLength(1);
 f.type!('Draft remains editable');expect(f.text!().inlineContent.length).toBeGreaterThan(0);expect(e.mounts.get(n.key)).toBe(mount);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 e.repository.undo();e.repository.undo();e.repository.undo();expect(c.draft()!.id).toBe(c.rows()[0].id);expect(e.textProtection.isProtected(n.contentKey)).toBe(false);e.repository.redo();expect(e.textProtection.isProtected(n.contentKey)).toBe(true);
});

const inventoryArgs={cursor:null,limit:20,contributionId:null,participantId:null,fromOrdinal:null};
it('discovers earlier native TextBlocks after twelve contributions, pages and resolves a protected source for a remark',async()=>{
 const f=await setup(true,true,true,true,true),c=f.c!,e=f.editor,ids:string[]=[];
 for(let i=0;i<12;i++){ids.push(String(f.text!().payload.id));f.type!(i===0?'First garden sample.':`Sample ${i+1}.`);if(i===4){const n=c.resolve(c.target(c.draft()!.id))!;e.commands.setPayloadField(n.key,'metadata',{dialectic:{...JSON.parse(JSON.stringify(n.payload.metadata)).dialectic,participant:{id:'guest',kind:'human',name:'Guest'}}});}c.submit();expect(c.notice(), 'submit '+i).toBe('');}
 const original=c.resolve(c.target(ids[0],'block'))!,mount=e.mounts.get(original.key),cells=[...original.inlineContent],before=e.repository.state.revision,snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(c.session()!.projection as any,'build');
 await c.askMock(async(req,sources)=>{
  expect(req.legend.tools).toContain('list_text_blocks');expect(req.structuralContext.sources.some((s:any)=>s.target.blockId===ids[0])).toBe(false);
  const a=await sources.tool({id:'page1',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:5}});expect(a.items.map((i:any)=>i.blockId)).toEqual(ids.slice(0,5));const expired=await sources.tool({id:'expired-read',tool:'read_source',arguments:{handle:'source-from-an-earlier-exchange'}});expect(expired).toMatchObject({status:'unauthorized',recovery:{tool:'list_text_blocks'}});expect(expired.text).toBeUndefined();expect(expired.revision).toBeUndefined();expect(expired.recovery.inventory.items).toHaveLength(5);expect(expired.recovery.inventory.items[0].blockId).toBe(ids[0]);
  expect(a.items[0]).toMatchObject({position:1,preview:'First garden sample.',readRequired:true,contribution:{ordinal:1,author:'human'}});expect(a.items[0].revision).toBeUndefined();
  const b=await sources.tool({id:'page2',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:20,cursor:a.nextCursor}});expect(b.items.map((i:any)=>i.blockId)).toEqual(ids.slice(5));expect(b.status).toBe('complete');
  const guest=await sources.tool({id:'guest',tool:'list_text_blocks',arguments:{...inventoryArgs,participantId:'guest'}});expect(guest.items.map((i:any)=>i.blockId)).toEqual([ids[4]]);
  const later=await sources.tool({id:'position',tool:'list_text_blocks',arguments:{...inventoryArgs,fromOrdinal:11}});expect(later.items.map((i:any)=>i.blockId)).toEqual(ids.slice(10));expect(later.coverage.visited).toBe(4);
  const source=await sources.tool({id:'read',tool:'read_source',arguments:{handle:a.items[0].handle}});expect(source.target.blockId).toBe(ids[0]);expect(e.repository.state.revision).toBe(before);
  const v:any=dcpResponse(req.exchange);v.replyTargets=[source.handle];v.anchors=[{id:'first',source:source.handle,revision:source.revision,selector:{exact:source.text,prefix:'',suffix:''}}];v.glosses=[{id:'remark',target:'first',type:'remark',text:'This is a test remark.'}];return JSON.stringify(v);
 });
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(13);const mark=(original.payload.standoffProperties as any[]).find(p=>p.type==='mutable/gloss');expect(mark).toBeTruthy();expect((c.root()!.payload.linkedAnnotations as any)[mark.annotationId].value).toBe('remark: This is a test remark.');expect(original.inlineContent).toEqual(cells);expect(e.mounts.get(original.key)).toBe(mount);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 e.repository.undo();expect(original.payload.standoffProperties??[]).toHaveLength(0);e.repository.redo();expect((original.payload.standoffProperties as any[]).some(p=>p.type==='mutable/gloss')).toBe(true);
});
it('bounds inventory previews and layout traversal, excludes drafts and foreign Documents, and rejects stale/foreign cursors',async()=>{
 const f=await setup(),c=f.c!,e=f.editor;f.type!('First '+ 'x'.repeat(200));const draft=c.resolve(c.target(c.draft()!.id))!;
 for(let i=0;i<135;i++)e.commands.insert({type:'container-block',children:[]},{kind:'at',parentKey:draft.key,index:i+1});c.submit();f.type!('Private draft');
 const root=e.repository.readState(),bank=root.contents[root.placements[root.rootPlacementKey].contentKey].children.find(k=>root.contents[root.placements[k].contentKey].viewType==='workspace-object-bank-block')!;
 e.commands.insert({id:'inventory-other',type:'document-block',metadata:{documentId:'inventory-other'},children:[{id:'inventory-secret',type:'standoff-editor-block',text:'Other Document text'}]},{kind:'at',parentKey:bank,index:0});
 let cursor:string;
 await c.askMock(async(req,sources)=>{
  const p=await sources.tool({id:'bounded',tool:'list_text_blocks',arguments:inventoryArgs});cursor=p.nextCursor;expect(p.coverage.visited).toBe(128);expect(p.coverage.previewCells).toBe(160);expect(p.items).toHaveLength(1);expect(p.items[0].previewTruncated).toBe(true);expect(JSON.stringify(p)).not.toMatch(/Private draft|Other Document text/);expect(sources.diagnostics.reads).toBe(0);
  await expect(sources.tool({id:'changed-filter',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor,participantId:'different'}})).rejects.toThrow(/cursor/);
  const scoped=await sources.tool({id:'scope',tool:'list_text_blocks',arguments:{...inventoryArgs,contributionId:'inventory-other'}});expect(scoped.items).toEqual([]);
  const end=await sources.tool({id:'resume',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor}});expect(end.status).toBe('complete');expect(end.items).toEqual([]);
  await expect(sources.tool({id:'repeat',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor}})).rejects.toThrow(/cursor/);
  return JSON.stringify(dcpResponse(req.exchange));
 });expect(c.notice()).toBe('');
 await c.askMock(async(req,sources)=>{await expect(sources.tool({id:'foreign',tool:'list_text_blocks',arguments:{...inventoryArgs,cursor}})).rejects.toThrow(/cursor/);const p=await sources.tool({id:'new',tool:'list_text_blocks',arguments:{...inventoryArgs,limit:1}});const n=c.resolve(c.target(p.items[0].blockId,'block'))!;e.commands.replaceInlineRange(n.key,0,0,'changed');await expect(sources.tool({id:'stale',tool:'read_source',arguments:{handle:p.items[0].handle}})).rejects.toThrow(/changed/);return JSON.stringify(dcpResponse(req.exchange));});expect(c.notice()).toMatch(/changed/);
});
