import { encodeDocument } from '../block-tree/codecs';
import { unwrap } from 'solid-js/store';
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from '../rendering/register-core-views';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import { fixtureAttribute, symbolicFixture } from '../demo/symbolic-attributes-fixture';
import { SYMBOLIC_ATTRIBUTE, symbolicRanges, unwrapSymbolic, literaliseSymbolic, symbolicBoundary } from './symbolic-attributes';
import { captureNative, decodeNative, nativeText } from '../persistence/native-resource';
import { materializeFragment } from '../interchange/materialize';
import { serializeSelection } from '../interchange/serializer';
import { NATIVE_MIME } from '../interchange/transport';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
const authored=(s:ReturnType<typeof setup>)=>encodeDocument(s.editor.repository.readState());
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function setup(enabled=true, direct=true, extras=0) {
  const dto=JSON.parse(JSON.stringify(symbolicFixture));
  for(let i=0;i<extras;i++)dto.children.push({id:'unrelated-'+i,type:'standoff-editor-block',text:'x'.repeat(100),children:[]});
  const editor=new ReactiveEditor(dto,{features:{symbolicEntityAttributes:enabled,directDomCharacterCells:direct}});
  editor.symbolicAttributes.set(fixtureAttribute,'L. Carroll');editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);
  const projection=editor.createView('symbolic-test'), host=document.body.appendChild(document.createElement('div'));
  const dispose=render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host);const stop=editor.installGateway(document);
  cleanup.push(()=>{stop();dispose();editor.dispose();});
  const node=projection.state.nodes[projection.state.nodes[projection.state.rootKey].children[0]], mount=editor.mounts.get(node.key)!,flow=mount.focusElement;
  const select=(anchor:number,head=anchor)=>{mount.focus();mount.restoreInlineSelection!({anchor,head});const s=mount.captureInlineSelection!()!;editor.selections.setPrimary(node.key,node.contentKey,node.viewId,s.anchor,s.head);};
  const input=(inputType:string,data:string|null=null)=>{const event=new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType,data});flow.dispatchEvent(event);return event;};
  const key=(key:string,shiftKey=false)=>flow.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));
  const clipboard=(type:string,initial:Record<string,string>={})=>{const values={...initial},event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:Object.keys(values),getData:(t:string)=>values[t]??'',setData:(t:string,v:string)=>values[t]=v}});flow.dispatchEvent(event);return values;};
  return {editor,projection,node,mount,flow,host,select,input,key,clipboard};
}
it.each([true,false])('keeps source hosts, offsets, revision and history unchanged on all resolver transitions (direct=%s)', direct=>{
  const s=setup(true,direct), before=authored(s), keys=[...s.node.inlineContent], hosts=[...s.flow.children], revision=s.editor.repository.state.revision;
  const changes=vi.fn(), stop=s.editor.repository.subscribeCommits(changes,error=>{throw error;});cleanup.push(stop);
  const replace=vi.spyOn(s.editor.commands,'replaceInlineRange'), snapshot=vi.spyOn(s.editor.repository,'snapshot'), invalidation=vi.spyOn(s.editor.measurements,'invalidateRanges');
  for(const value of ['Lewis Carroll','L. Carroll','Charles Lutwidge Dodgson','iiiiiiiiiiiii','WWWWWWWWWWWWW',undefined]){
    s.editor.symbolicAttributes.set(fixtureAttribute,value);
    expect(s.flow.querySelector('[data-symbolic-display]')?.textContent).toBe(value??'Lewis Carroll');
    expect(s.mount.captureText!()).toBe('Lewis Carroll wrote Alice.');expect([...s.flow.children]).toEqual(hosts);
    expect(authored(s)).toEqual(before);expect([...s.node.inlineContent]).toEqual(keys);
    expect(s.editor.repository.state.revision).toBe(revision);
  }
  expect(changes).not.toHaveBeenCalled();expect(replace).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(invalidation).toHaveBeenCalled();
});
it('maps display descendants and selection restoration only to atomic boundaries',()=>{
  const s=setup(), display=s.flow.querySelector('[data-symbolic-display]')!;
  expect(s.mount.inlinePoint!(display.firstChild!,0)).toBe(0);expect(s.mount.inlinePoint!(display.firstChild!,4)).toBe(13);
  s.select(3);expect(s.mount.captureInlineSelection!()).toEqual({anchor:0,head:0});
  s.select(7,2);expect(s.mount.captureInlineSelection!()).toEqual({anchor:13,head:0});
  s.select(0);s.key('ArrowRight');expect(s.mount.captureInlineSelection!()).toEqual({anchor:13,head:13});
  s.key('ArrowLeft',true);expect(s.mount.captureInlineSelection!()).toEqual({anchor:13,head:0});
});
it('selects on first deletion, deletes canonically on second, and restores exact reference via Undo/Redo',async()=>{
  const s=setup(), before=authored(s);s.select(13);s.input('deleteContentBackward');
  expect(authored(s)).toEqual(before);expect(s.mount.captureInlineSelection!()).toEqual({anchor:13,head:0});
  s.input('deleteContentBackward');await tick();expect(s.mount.captureText!()).toBe(' wrote Alice.');
  expect((s.node.payload.standoffProperties as any[]).some(p=>p.type===SYMBOLIC_ATTRIBUTE)).toBe(false);
  s.editor.repository.undo();expect(authored(s)).toEqual(before);s.editor.repository.redo();expect(s.mount.captureText!()).toBe(' wrote Alice.');
});
it('replaces atomic selection and rebases ordinary edits before and after through canonical machinery',async()=>{
  const s=setup();s.select(0);s.input('insertText','😀');await tick();expect(s.node.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({id:'alice',start:21,end:25}),expect.objectContaining({id:'symbolic-pen-name',start:1,end:13})]));
  s.select(14);s.input('insertText','!');await tick();expect(s.mount.captureText!()).toBe('😀Lewis Carroll! wrote Alice.');
  s.select(2,9);s.input('insertText','Literal');await tick();expect(s.mount.captureText!()).toBe('😀Literal! wrote Alice.');
});
it('unwraps and converts in single undoable operations with no repository snapshot',()=>{
  const s=setup(),before=authored(s), snapshot=vi.spyOn(s.editor.repository,'snapshot');
  unwrapSymbolic(s.editor,s.node,'symbolic-pen-name');expect(s.mount.captureText!()).toBe('Lewis Carroll wrote Alice.');expect(s.flow.querySelector('[data-symbolic-display]')).toBeNull();
  s.editor.repository.undo();expect(authored(s)).toEqual(before);
  const range=symbolicRanges(s.node.payload.standoffProperties as any[],26,id=>s.editor.symbolicAttributes.read(id))[0];literaliseSymbolic(s.editor,s.node,range);
  expect(s.mount.captureText!()).toBe('L. Carroll wrote Alice.');expect(s.node.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({id:'alice',start:17,end:21})]));
  s.editor.repository.undo();expect(authored(s)).toEqual(before);s.editor.repository.redo();expect(s.mount.captureText!()).toBe('L. Carroll wrote Alice.');expect(snapshot).not.toHaveBeenCalled();
});
it('round trips native source, UUID, original offsets and formatting without resolved text',()=>{
  const s=setup(), saved=nativeText(captureNative(s.editor.repository.readState(),'symbolic-fixture'));
  expect(saved).toContain('Lewis Carroll');expect(saved).not.toContain('L. Carroll');expect(saved).toContain(fixtureAttribute);
  expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
});
it('uses materialised external text but scoped native source/identity for copy, cut and paste',async()=>{
  const s=setup();s.select(0,13);const copied=s.clipboard('copy');expect(copied['text/plain']).toBe('L. Carroll');
  const fragment=JSON.parse(copied[NATIVE_MIME]);expect(fragment.blocks[0].inline.atoms[0].text).toBe('Lewis Carroll');
  const same=materializeFragment(fragment,{cavernId:'fixture'}),foreign=materializeFragment(fragment,{cavernId:'elsewhere'});
  const props=(f:any)=>Object.values(f.state.contents).flatMap((c:any)=>c.payload.standoffProperties??[]);
  expect(props(same)).toEqual(expect.arrayContaining([expect.objectContaining({type:SYMBOLIC_ATTRIBUTE,value:fixtureAttribute})]));
  expect(props(foreign)).toEqual(expect.arrayContaining([expect.objectContaining({type:'mutable/opaque-property'})]));
  s.clipboard('cut');await tick();expect(s.mount.captureText!()).toBe(' wrote Alice.');s.editor.repository.undo();
  s.select(0,13);s.clipboard('paste',{'text/plain':'replacement'});await tick();expect(s.mount.captureText!()).toBe('replacement wrote Alice.');s.editor.repository.undo();
  s.select(26);s.clipboard('paste',copied);await vi.waitFor(()=>expect(s.mount.captureText!()).toBe('Lewis Carroll wrote Alice.Lewis Carroll'));
});
it('stages IME outside source, defers display changes, and commits once or cancels cleanly',async()=>{
  const s=setup();s.select(0,13);const before=authored(s);
  s.flow.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));s.editor.symbolicAttributes.set(fixtureAttribute,'Updated');
  expect(s.flow.querySelector('[data-symbolic-display]')?.textContent).toBe('L. Carroll');expect(authored(s)).toEqual(before);
  s.flow.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'漢字'}));await tick();expect(s.mount.captureText!()).toBe('漢字 wrote Alice.');
  s.editor.repository.undo();expect(authored(s)).toEqual(before);s.select(13);
  s.flow.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));s.flow.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));expect(authored(s)).toEqual(before);
});
it.each([false,true])('preserves legacy formatting and mentions; flag=%s',enabled=>{
  const s=setup(enabled);expect(s.editor.features.textSuperposition).toBe(false);
  if(!enabled){expect(s.flow.querySelector('[data-symbolic-display]')).toBeNull();expect(s.flow.textContent).toBe('Lewis Carroll wrote Alice.');}
  else expect((s.flow.querySelector('[data-symbolic-display]') as HTMLElement).style.fontWeight).toBe('600');
  const props=unwrap(s.node.payload.standoffProperties) as any[];
  s.editor.commands.setPayloadField(s.node.key,'standoffProperties',[...props,{id:'partial',type:'style/italics',start:0,end:3},{id:'mention',type:'codex/entity-reference',value:'entity',start:0,end:12}]);
  if(enabled){expect((s.flow.querySelector('[data-symbolic-display]') as HTMLElement).style.fontStyle).toBe('');expect(s.mount.projectInlineRange!(0,4)).toEqual([]);}
});
it('rejects overlapping symbolic owners and superposition conflicts without losing annotation data',()=>{
  const s=setup(), props=unwrap(s.node.payload.standoffProperties) as any[];
  s.editor.commands.setPayloadField(s.node.key,'standoffProperties',[...props,{...props[0],id:'overlap',start:3,end:14}]);expect(s.flow.querySelector('[data-symbolic-display]')).toBeNull();expect(s.mount.captureText!()).toBe('Lewis Carroll wrote Alice.');
  expect(symbolicRanges([...props,{type:'text/superposition',start:2,end:4}],26,()=>'?')).toEqual([]);
});
it.each([0,150])('typing is bounded with %s unrelated paragraphs and never resolves attributes per key',async extras=>{
  const s=setup(true,true,extras), snapshot=vi.spyOn(s.editor.repository,'snapshot'), read=vi.spyOn(s.editor.symbolicAttributes,'read');
  const other=s.projection.state.nodes[s.projection.state.nodes[s.projection.state.rootKey].children[1]], state=s.editor.repository.readState().contents[other.contentKey];
  s.select(13);s.input('insertText','!');await tick();s.input('deleteContentBackward');await tick();
  expect(snapshot).not.toHaveBeenCalled();expect(s.editor.repository.readState().contents[other.contentKey]).toBe(state);
  // Reading the local resolved cache is allowed; resolution must have no I/O.
  expect(read.mock.calls.length).toBeLessThanOrEqual(4);
});
it('keeps cross-block selection endpoints outside atoms and restores authored source after replacement',()=>{
  const s=setup();s.editor.crossText.enable(true);
  const next=s.projection.state.nodes[s.projection.state.nodes[s.projection.state.rootKey].children[1]];
  s.editor.crossText.set(s.editor.crossText.position(s.node.key,3),s.editor.crossText.position(next.key,3));
  expect(s.editor.crossText.segments[s.node.key]!.start).toBe(0);
  const before=authored(s);s.editor.crossText.replace('Cross');s.editor.repository.undo();expect(authored(s)).toEqual(before);
});
it('shares canonical cells across two mounted occurrences with distinct DOM and no presentation commit',()=>{
  const s=setup();s.editor.commands.transclude(s.node.key,{kind:'at',parentKey:s.projection.state.rootKey,index:2});
  const second=s.projection.state.nodes[s.projection.state.nodes[s.projection.state.rootKey].children[2]],m=s.editor.mounts.get(second.key)!;
  expect(second.contentKey).toBe(s.node.contentKey);expect(m.focusElement).not.toBe(s.flow);
  const revision=s.editor.repository.state.revision;s.editor.symbolicAttributes.set(fixtureAttribute,'Longer display name');
  expect(m.focusElement.querySelector('[data-symbolic-display]')?.textContent).toBe('Longer display name');
  expect(s.flow.querySelector('[data-symbolic-display]')?.textContent).toBe('Longer display name');expect(s.editor.repository.state.revision).toBe(revision);
});
it('has a cheap no-contract bypass without resolver or geometry invalidation work',async()=>{
  const s=setup();unwrapSymbolic(s.editor,s.node,'symbolic-pen-name');
  const read=vi.spyOn(s.editor.symbolicAttributes,'read'),invalidate=vi.spyOn(s.editor.measurements,'invalidateRanges');
  s.select(7);s.input('insertText','a');await tick();expect(read).not.toHaveBeenCalled();expect(invalidate).not.toHaveBeenCalled();
});
it('handles adjacent atoms and rejects nested overlap chains and unsupported contracts',()=>{
  const p={type:SYMBOLIC_ATTRIBUTE,id:'a',value:fixtureAttribute,start:0,end:1};
  const ranges=symbolicRanges([p,{...p,id:'b',start:2,end:4}],5,()=>'?');
  expect(symbolicBoundary(ranges,1,'right')).toBe(2);expect(symbolicBoundary(ranges,3,'left')).toBe(2);
  expect(symbolicRanges([{...p,end:20},{...p,id:'b',start:2,end:3},{...p,id:'c',start:5,end:6}],21,()=>'?')).toEqual([]);
  expect(symbolicRanges([{...p,metadata:{symbolic:{version:2}}}],5,()=>'?')).toEqual([]);
});
it('supports unwrap/re-enable in the alternate Solid cell renderer',()=>{
  const s=setup(true,false),properties=JSON.parse(JSON.stringify(s.node.payload.standoffProperties));
  unwrapSymbolic(s.editor,s.node,'symbolic-pen-name');expect(s.flow.textContent).toBe('Lewis Carroll wrote Alice.');
  s.editor.commands.setPayloadField(s.node.key,'standoffProperties',properties);expect(s.flow.querySelectorAll('[data-symbolic-display]')).toHaveLength(1);
  expect(s.mount.captureText!()).toBe('Lewis Carroll wrote Alice.');
});
