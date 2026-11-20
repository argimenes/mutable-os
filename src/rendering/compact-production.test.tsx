// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import {decodeBlockTree} from '../block-tree/codecs';
import {admitNative,captureNative,nativeText,decodeNative} from '../persistence/native-resource';
const clean:(()=>void)[]=[];afterEach(()=>{while(clean.length)clean.pop()!();document.body.replaceChildren();vi.restoreAllMocks();});
function fixture(){
 const editor=new ReactiveEditor({type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block'}]},{features:{autocompleteWorkstation:false}});registerCoreViews(editor);
 const source=decodeBlockTree({id:'doc',type:'document-block',children:[{id:'a',type:'standoff-editor-block',text:'A😀éBCD',standoffProperties:[{type:'style/bold',start:1,end:4}]},{id:'b',type:'standoff-editor-block',text:'Other'}]}).state;
 const bank=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='bank')!;admitNative(editor.repository,new TextEncoder().encode(nativeText(captureNative(source,'doc'))),bank.key);
 const doc=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='doc')!,pk=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===doc.key)!.key;
 const projection=editor.createView('first',pk);expect(Object.values(projection.state.nodes).some(n=>n.viewType==='text-cell')).toBe(false);
 const mount=(p=projection)=>{const host=document.body.appendChild(document.createElement('div'));clean.push(render(()=><ReactiveTreeView editor={editor} projection={p}/>,host));return host;};
 clean.push(()=>editor.dispose());const host=mount();clean.push(editor.installGateway(document));
 const node=()=>Object.values(projection.state.nodes).find(n=>n.payload.id==='a')!;
 return {editor,projection,host,node,mount,pk,flow:()=>host.querySelector<HTMLElement>('.reactive-standoff-flow')!};
}
it('real renderer uses occurrence-local Cells, broadcasts edits, preserves unaffected identity and native reopen',()=>{
 const f=fixture(),{editor,projection}=f;const second=editor.createView('second',f.pk),other=f.mount(second);const before=f.flow().firstChild,otherBefore=other.querySelector('.reactive-standoff-flow')!.firstChild;
 const unrelated=f.host.querySelectorAll('.reactive-standoff-flow')[1];const observer=new MutationObserver(()=>{});observer.observe(unrelated,{subtree:true,childList:true,attributes:true,characterData:true});
 const snapshot=vi.spyOn(editor.repository,'snapshot').mockImplementation(()=>{throw Error('global snapshot');});
 editor.commands.replaceInlineRange(f.node().key,1,2,'XY');expect(f.flow().textContent).toBe('AXYéBCD');expect(other.querySelector('.reactive-standoff-flow')!.textContent).toBe('AXYéBCD');expect(f.flow().firstChild).toBe(before);expect(other.querySelector('.reactive-standoff-flow')!.firstChild).toBe(otherBefore);
 editor.repository.undo();expect(f.flow().textContent).toBe('A😀éBCD');editor.repository.redo();expect(f.flow().textContent).toBe('AXYéBCD');expect(snapshot).not.toHaveBeenCalled();expect(observer.takeRecords()).toHaveLength(0);observer.disconnect();snapshot.mockRestore();
 expect(Object.values(editor.repository.readState().contents).filter(c=>c.viewType.endsWith('-cell'))).toHaveLength(0);
 const saved=nativeText(captureNative(editor.repository.readState(),'doc'));expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
 expect(new Set(f.node().inlineContent).size).toBe(8);expect(projection.state.nodes[f.node().inlineContent[0]].editingInlineOwner).toBe(f.node().key);
});
it('retains mounted compact editing atoms when an authored metadata change rebuilds the projection',()=>{
 const f=fixture(),before=[...f.node().inlineContent],first=f.flow().firstChild;
 expect(()=>f.editor.commands.setPayloadField(f.projection.state.rootKey,'metadata',{reviewed:true})).not.toThrow();
 expect(f.node().inlineContent).toEqual(before);expect(f.flow().firstChild).toBe(first);expect(f.flow().textContent).toBe('A😀éBCD');
 f.editor.repository.undo();expect(f.node().inlineContent).toEqual(before);expect(f.flow().textContent).toBe('A😀éBCD');
 expect(Object.values(f.editor.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);
});
it('compact Enter split, join and cross-block replacement preserve text and history',()=>{
 const f=fixture(),{editor}=f;const snapshot=vi.spyOn(editor.repository,'snapshot').mockImplementation(()=>{throw Error('structural snapshot');});const right=editor.commands.splitStandoff(f.node().key,4);
 expect([...f.host.querySelectorAll('.reactive-standoff-flow')].map(e=>e.textContent)).toEqual(['A😀é','BCD','Other']);
 editor.commands.joinStandoff(f.node().key,right);expect(f.flow().textContent).toBe('A😀éBCD');editor.repository.undo();expect(f.host.querySelectorAll('.reactive-standoff-flow')).toHaveLength(3);editor.repository.redo();
 const b=Object.values(f.projection.state.nodes).find(n=>n.payload.id==='b')!;
 editor.commands.replaceAcrossBlocks([{placementKey:f.node().key,start:2,end:7},{placementKey:b.key,start:0,end:2}],'Z');expect(f.flow().textContent).toBe('A😀Zher');editor.repository.undo();expect(f.flow().textContent).toBe('A😀éBCD');
 expect(Object.values(editor.repository.readState().contents).some(c=>c.viewType==='text-cell')).toBe(false);expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
});

it('typed images survive edits and mixed-object composition through the production gateway',()=>{
 const f=fixture(),{editor}=f;editor.commands.insertInlineImage(f.node().key,2,{assetId:'image',src:'',alt:'picture',status:'failed'});
 expect(f.flow().querySelector('img')).not.toBeNull();const imageKey=f.node().inlineContent[2];editor.commands.updateInlineImage(imageKey,{alt:'updated'});expect(f.flow().querySelector('img')!.alt).toBe('updated');
 const mount=editor.mounts.get(f.node().key)!;mount.focus();mount.restoreInlineSelection!({anchor:3,head:3});
 f.flow().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
 const loose=document.createTextNode('漢');f.flow().insertBefore(loose,f.flow().children[3]);
 f.flow().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'漢'}));
 expect(f.flow().textContent).toBe('A😀漢éBCD');expect(f.flow().querySelectorAll('img')).toHaveLength(1);expect(editor.repository.readState().contents[f.node().contentKey].compactInline!.spans.filter(a=>a.kind==='image')).toHaveLength(1);
 editor.repository.undo();expect(f.flow().textContent).toBe('A😀éBCD');editor.repository.redo();expect(f.flow().textContent).toBe('A😀漢éBCD');
 const saved=nativeText(captureNative(editor.repository.readState(),'doc'));expect(nativeText(decodeNative(new TextEncoder().encode(saved)))).toBe(saved);
});
it('Undo/Redo restores backward selections, affinities and the original occurrence',async()=>{
 const f=fixture(),{editor}=f,m=editor.mounts.get(f.node().key)!;m.focus();editor.selections.setPrimary(f.node().key,f.node().contentKey,f.node().viewId,4,1);
 const set=JSON.parse(JSON.stringify(editor.selections.sets[f.node().key]));set.items[0].anchor.boundary.affinity='before';editor.selections.setSelectionSet(f.node().key,set);m.restoreInlineSelection!({anchor:4,head:1});
 f.flow().dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'X'}));await Promise.resolve();await Promise.resolve();await Promise.resolve();
 expect(f.flow().textContent).toBe('AXBCD');editor.repository.undo();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(f.flow().textContent).toBe('A😀éBCD');expect(m.captureInlineSelection!()).toEqual({anchor:4,head:1});expect(editor.selections.sets[f.node().key].items[0].anchor.boundary.affinity).toBe('before');
 editor.repository.redo();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(m.captureInlineSelection!()).toEqual({anchor:2,head:2});
});
it('Backspace deletes a whole grapheme and composition over an image is rejected without DOM or canonical loss',()=>{
 const f=fixture(),{editor}=f,m=editor.mounts.get(f.node().key)!;m.focus();m.restoreInlineSelection!({anchor:4,head:4});f.flow().dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));expect(f.flow().textContent).toBe('A😀BCD');editor.repository.undo();
 editor.commands.insertInlineImage(f.node().key,1,{assetId:'image',src:'',alt:'picture',status:'failed'});m.restoreInlineSelection!({anchor:1,head:2});const before=nativeText(captureNative(editor.repository.readState(),'doc')),image=f.flow().children[1];
 f.flow().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));image.remove();f.flow().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'draft'}));
 expect(f.flow().children[1]).toBe(image);expect(nativeText(captureNative(editor.repository.readState(),'doc'))).toBe(before);
});
