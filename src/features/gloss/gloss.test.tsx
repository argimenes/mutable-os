// @vitest-environment jsdom
import {it,expect,afterEach,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerCoreViews} from '../../rendering/register-core-views';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {serializeSelection} from '../../interchange/serializer';
import {exportClipboard} from '../../interchange/transport';
import {watchDocumentEntities} from '../../application/document-entity-changes';
import * as resourceIdentity from '../../block-tree/resource-identity';
import {parseGloss,GLOSS} from './model';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import {packageFragment,materializePackage} from '../../interchange/package/native';
import {materializeFragment} from '../../interchange/materialize';
import {glossChangeFor} from '../../block-tree/gloss-plan';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
function setup(direct=true,glossMode=true){
 const e=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'doc',type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'Hello world: again.',standoffProperties:[{id:'bold',type:'style/bold',start:0,end:3}]}]},{id:'other',type:'document-block',children:[{id:'q',type:'standoff-editor-block',text:'Unrelated '.repeat(50)}]}]},{features:{directDomCharacterCells:direct,glossMode}});registerCoreViews(e);const v=e.createView('test'),host=document.body.appendChild(document.createElement('main'));const dispose=render(()=><ReactiveTreeView editor={e} projection={v}/>,host);cleanup.push(()=>e.dispose(),dispose);const key=Object.values(v.state.nodes).find(n=>n.payload.id==='p')!.key;const owner=Object.values(e.repository.readState().contents).find(c=>c.payload.id==='doc')!.key;
 const select=(a=2,b=a)=>{const h=e.mounts.get(key)!;h.focus();h.restoreInlineSelection!({anchor:a,head:b});return key;};
 const registry=()=>e.repository.readState().contents[owner].payload.linkedAnnotations as any;
 return {e,v,key,owner,select,registry};
}
it('parses only the first colon losslessly',()=>{expect(parseGloss(' claim : A: B')).toEqual({type:'claim',text:' A: B'});expect(parseGloss('question:')).toEqual({type:'question',text:''});expect(parseGloss(': unfinished')).toEqual({type:'',text:' unfinished'});expect(parseGloss('note')).toEqual({type:'',text:'note'});});
it.each([true,false])('authors, edits, cancels, deletes and replays without snapshots or projection rebuilds (direct %s)',direct=>{
 const f=setup(direct),{e,key,owner}=f;f.select();const cells=[...e.node(key)!.inlineContent],other=JSON.stringify(e.repository.readState().contents[Object.values(e.repository.readState().contents).find(c=>c.payload.id==='other')!.key]);
 const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(f.v as any,'build'),changes:any[]=[];const stop=e.repository.subscribeChanges(c=>changes.push(c));cleanup.push(stop);
 expect(e.gloss.open(key)).toBe(true);expect(document.activeElement?.tagName).toBe('TEXTAREA');expect(e.gloss.commit('claim: A: B')).toBe(true);
 expect(e.mounts.get(key)!.root.querySelectorAll('.mutable-gloss-anchor')).toHaveLength(5);expect(e.mounts.get(key)!.root.querySelectorAll('path[data-property-type="mutable/gloss"]')).toHaveLength(0);
 const id=Object.keys(f.registry())[0],props=e.node(key)!.payload.standoffProperties as any[];expect(props[1]).toMatchObject({type:GLOSS,start:0,end:4,annotationId:id});expect(e.node(key)!.inlineContent).toEqual(cells);
 expect(e.gloss.open(key,{anchor:0,head:5},id)).toBe(true);(document.activeElement as HTMLTextAreaElement).value='lost';e.gloss.cancel();expect(f.registry()[id].value).toBe('claim: A: B');
 e.gloss.open(key,{anchor:0,head:5},id);expect(e.gloss.commit('question:')).toBe(true);e.repository.undo();expect(f.registry()[id].value).toBe('claim: A: B');e.repository.redo();expect(f.registry()[id].value).toBe('question:');
 e.gloss.open(key,{anchor:0,head:5},id);expect(e.gloss.commit('',true)).toBe(true);expect(f.registry()[id].isDeleted).toBe(true);e.repository.undo();expect(f.registry()[id].isDeleted).toBeUndefined();e.repository.redo();
 expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(changes.every(c=>c.structural?.gloss?.owner===owner)).toBe(true);expect(changes.every(c=>c.previousContents.size<=2)).toBe(true);expect(JSON.stringify(e.repository.readState().contents[Object.values(e.repository.readState().contents).find(c=>c.payload.id==='other')!.key])).toBe(other);
});
it('rejects whitespace and punctuation; Escape, IME, Save and draft typing do not author',()=>{const f=setup();expect(f.e.gloss.open(f.key,{anchor:5,head:5})).toBe(false);expect(f.e.gloss.open(f.key,{anchor:11,head:11})).toBe(false);f.select();const rev=f.e.repository.state.revision;f.e.gloss.open(f.key);const input=document.activeElement as HTMLTextAreaElement;input.value='custom: one: two';input.dispatchEvent(new InputEvent('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));expect(document.activeElement).toBe(input);input.dispatchEvent(new KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true}));expect(document.querySelector('.gloss-draft-status')?.textContent).toContain('not saved');expect(f.e.repository.state.revision).toBe(rev);input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(document.querySelector('.gloss-input')).toBeNull();expect(f.e.mounts.get(f.key)?.captureInlineSelection?.()).toEqual({anchor:2,head:2});});
it('retains orphan definition through text deletion, native serialization and package; copies remap identities',()=>{const f=setup();f.select();f.e.gloss.open(f.key);f.e.gloss.commit('thesis: kept');const id=Object.keys(f.registry())[0],local=f.registry()[id].metadata.gloss.localId;f.e.commands.replaceInlineRange(f.key,0,5,'');expect((f.e.node(f.key)!.payload.standoffProperties as any[]).some(p=>p.type===GLOSS)).toBe(false);expect(f.registry()[id].value).toBe('thesis: kept');
 const snapshot=captureNative(f.e.repository.readState(),'doc'),decoded=decodeNative(nativeBytes(snapshot));expect(JSON.stringify(decoded)).toContain(local);
 const fragment=packageFragment(snapshot);const copied=materializeFragment(fragment);expect(JSON.stringify(copied.linkedAnnotations)).not.toContain(local);
 const imported=materializePackage(fragment,undefined,[],{data:{kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[],provenance:{},selection:{},unresolved:[],excluded:[]} as any,schema:{},source:{}});const root=imported.state.contents[imported.state.placements[imported.roots[0]].contentKey];expect(JSON.stringify(root.payload.linkedAnnotations)).toContain(local);expect(Object.values(root.payload.linkedAnnotations as any).some((p:any)=>p.type===GLOSS)).toBe(true);
});
it('does not admit an unrelated root payload change',()=>{const f=setup(),r=f.e.repository.readState().contents[f.owner];expect(glossChangeFor(f.e.repository.readState(),[{kind:'put-content',record:{...r,payload:{...r.payload,bad:1}}}],{ownedKeys:k=>f.e.repository.ownedPlacementKeys(k),locationOf:k=>f.e.repository.locationOf(k)})).toBeUndefined();});
it('supports local repeated occurrences, rejects foreign borrowed content, and preserves split/merge identity',()=>{
 const f=setup(),{e,v,key}=f;const doc=Object.values(v.state.nodes).find(n=>n.payload.id==='doc')!,other=Object.values(v.state.nodes).find(n=>n.payload.id==='other')!;
 const local=e.commands.transclude(key,{kind:'at',parentKey:doc.key,index:1}),foreign=e.commands.transclude(key,{kind:'at',parentKey:other.key,index:1});
 const localNode=e.nodeForPlacementInView(local,v.viewId)!,foreignNode=e.nodeForPlacementInView(foreign,v.viewId)!;
 expect(e.gloss.open(foreignNode.key,{anchor:0,head:5})).toBe(false);expect(e.gloss.notice()).toContain('borrowed');
 expect(e.gloss.open(localNode.key,{anchor:0,head:5})).toBe(true);expect(e.gloss.commit('note: shared')).toBe(true);
 const id=Object.keys(f.registry())[0];expect((e.node(key)!.payload.standoffProperties as any[]).at(-1).annotationId).toBe(id);expect(e.gloss.resolve((e.node(key)!.payload.standoffProperties as any[]).at(-1),foreignNode.key).isDeleted).toBe(true);
 const right=e.commands.splitStandoff(key,2),rightNode=e.nodeForPlacementInView(right,v.viewId)!;
 expect((e.node(key)!.payload.standoffProperties as any[]).filter(p=>p.type===GLOSS)[0].annotationId).toBe(id);expect((rightNode.payload.standoffProperties as any[]).filter(p=>p.type===GLOSS)[0].annotationId).toBe(id);
 e.commands.joinStandoff(key,rightNode.key);expect((e.node(key)!.payload.standoffProperties as any[]).filter(p=>p.type===GLOSS)).toHaveLength(2);e.repository.undo();e.repository.redo();expect(Object.keys(f.registry())).toEqual([id]);
});
it('preserves clipboard source metadata, remaps copies and retains omitted targets with explicit provenance',()=>{
 const f=setup();f.select();f.e.gloss.open(f.key);f.e.gloss.commit('note: copied');const id=Object.keys(f.registry())[0];const snapshot=structuredClone(captureNative(f.e.repository.readState(),'doc'));const root=snapshot.contents[snapshot.placements[snapshot.rootPlacementKey].target.kind==='local'?(snapshot.placements[snapshot.rootPlacementKey].target as any).contentKey:''];const defs=root.payload.linkedAnnotations as any;defs[id].metadata.gloss.links={missing:{toGlossId:'not-copied',type:'supports',note:'retain original'}};
 const source=JSON.stringify(snapshot),fragment=packageFragment(snapshot),copy=materializeFragment(fragment);const copied=Object.values(copy.linkedAnnotations as any)[0] as any;expect(Object.values(copied.metadata.gloss.links)).toEqual([{toGlossId:'not-copied',type:'supports',note:'retain original',unresolvedTarget:{version:1,reason:'outside-copy',originGlossId:'not-copied',originResourceId:'doc'}}]);expect(copied.metadata.gloss.localId).not.toBe(defs[id].metadata.gloss.localId);expect(JSON.stringify(snapshot)).toBe(source);const full=materializeFragment(fragment,undefined,undefined,undefined,undefined,true,true);expect((Object.values(full.linkedAnnotations as any)[0] as any).metadata.gloss.links).toEqual(defs[id].metadata.gloss.links);
});

it('never enumerates repository contents or refreshes entity inventory for Gloss authoring and replay',async()=>{
 const f=setup();const changed=vi.fn(),watch=watchDocumentEntities(f.e,f.key,changed);cleanup.push(watch.dispose);
 const owners=vi.spyOn(resourceIdentity,'resourceOwner'),values=Object.values,contents=new Set([f.e.repository.readState().contents,f.e.repository.state.contents]);let scans=0;
 vi.spyOn(Object,'values').mockImplementation((o:any)=>{if(contents.has(o))scans++;return values(o);});
 f.select();f.e.gloss.open(f.key);expect(f.e.gloss.commit('note: bounded')).toBe(true);
 const p=(f.e.node(f.key)!.payload.standoffProperties as any[]).at(-1);expect(f.e.linkedAnnotations.resolve(p,f.e.node(f.key)!.contentKey).value).toBe('note: bounded');
 f.e.repository.undo();f.e.repository.redo();await Promise.resolve();await Promise.resolve();
 expect(owners).not.toHaveBeenCalled();expect(scans).toBe(0);expect(changed).not.toHaveBeenCalled();
});
it('retains a provisional draft when its view closes',()=>{const f=setup();f.select();f.e.gloss.open(f.key);const input=document.activeElement as HTMLTextAreaElement;input.value='retained';f.e.gloss.releaseView(f.v.viewId);expect(document.querySelector('.gloss-input textarea')).toBe(input);expect(input.value).toBe('retained');f.e.gloss.cancel();});

it('copies only selected Gloss definitions through the native clipboard with plain text unchanged',()=>{
 const f=setup();f.select();f.e.gloss.open(f.key);f.e.gloss.commit('note: selected');f.e.gloss.open(f.key,{anchor:6,head:10});f.e.gloss.commit('note: excluded');
 const fragment=serializeSelection(f.e.repository.readState(),[{placementKey:f.e.node(f.key)!.placementKey,start:0,end:5}]);
 expect(fragment.definitions).toHaveLength(1);expect(exportClipboard(fragment)['text/plain']).toBe('Hello');
 const copied=materializeFragment(fragment);expect(Object.values(copied.linkedAnnotations as any)).toHaveLength(1);expect(JSON.stringify(copied.linkedAnnotations)).toContain('note: selected');expect(JSON.stringify(copied.linkedAnnotations)).not.toContain('note: excluded');
});
it.each([['MacIntel','metaKey',true],['MacIntel','metaKey',false],['Win32','ctrlKey',true],['Win32','ctrlKey',false]] as const)('primary G authors through the existing path on %s via %s (direct %s)',(platform,modifier,direct)=>{
 vi.spyOn(navigator,'platform','get').mockReturnValue(platform);
 const f=setup(direct),{e,key}=f;cleanup.push(e.installGateway(document));f.select(0,5);
 const mount=e.mounts.get(key)!,cells=[...mount.focusElement.children],revision=e.repository.state.revision,snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(f.v as any,'build'),owners=vi.spyOn(resourceIdentity,'resourceOwner');
 mount.focusElement.parentElement!.setAttribute('contenteditable','false'); // An explicit inner editor overrides its outer widget boundary.
 const event=new KeyboardEvent('keydown',{key:'g',[modifier]:true,bubbles:true,cancelable:true});mount.focusElement.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(true);expect(document.activeElement?.matches('.gloss-input textarea')).toBe(true);expect(e.repository.state.revision).toBe(revision);
 expect(e.gloss.commit('evidence: Keyboard-created')).toBe(true);expect(Object.values(f.registry())).toHaveLength(1);expect((e.node(key)!.payload.standoffProperties as any[]).at(-1)).toMatchObject({type:GLOSS,start:0,end:4});
 e.repository.undo();expect(Object.keys(f.registry()??{})).toHaveLength(0);e.repository.redo();expect(Object.values(f.registry())).toHaveLength(1);
 expect(e.mounts.get(key)).toBe(mount);expect([...mount.focusElement.children]).toEqual(cells);expect(mount.captureInlineSelection?.()).toEqual({anchor:0,head:5});expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(owners).not.toHaveBeenCalled();
});
it('keeps primary G outside text, during composition and with Gloss disabled; retains the old chord',()=>{
 vi.spyOn(navigator,'platform','get').mockReturnValue('MacIntel');const f=setup(),{e,key}=f;cleanup.push(e.installGateway(document));f.select(0,5);const mount=e.mounts.get(key)!;
 const press=(target:Element,extra:KeyboardEventInit={})=>{const event=new KeyboardEvent('keydown',{key:'g',metaKey:true,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;};
 const field=document.createElement('input');mount.focusElement.append(field);field.focus();expect(press(field).defaultPrevented).toBe(false);expect(press(document.body).defaultPrevented).toBe(false);field.remove();f.select(0,5);expect(press(mount.focusElement,{isComposing:true}).defaultPrevented).toBe(false);
 expect(document.querySelector('.gloss-input')).toBeNull();
 press(mount.focusElement,{key:';',ctrlKey:true,metaKey:false});press(mount.focusElement,{metaKey:false});expect(document.querySelector('.gloss-input')).not.toBeNull();e.gloss.cancel();expect(mount.captureInlineSelection?.()).toEqual({anchor:0,head:5});
 const disabled=setup(true,false);cleanup.push(disabled.e.installGateway(document));disabled.select(0,5);expect(press(disabled.e.mounts.get(disabled.key)!.focusElement).defaultPrevented).toBe(false);expect(document.querySelector('.gloss-input')).toBeNull();
});
