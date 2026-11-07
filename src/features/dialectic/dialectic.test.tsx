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
async function setup(enabled=true,registry=true){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Test has no vault'}),{headers:{'Content-Type':'application/json'}})));
 const session=new WorkspaceSession(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[]}),{features:{dialectic:enabled,applicationPresentations:registry,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
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
