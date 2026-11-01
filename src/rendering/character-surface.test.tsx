// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {registerCoreViews} from './register-core-views';
import {ReactiveTreeView} from './reactive-tree-view';
import {characterSurfaceDefinition,registerStaticCharacterSurface} from './static-character-surface';
import {VisualEffectRegistry} from '../runtime/visual-effect-registry';
import {CharacterSurfaceHost} from './character-surface-host';
import type {VisualRenderer} from '../runtime/visual-effect-registry';
const cleanup:(()=>void)[]=[];
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=';
const images:{onload:null|(()=>void);onerror:null|(()=>void);src:string}[]=[];
const tick=()=>new Promise(r=>setTimeout(r,45));
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.head.replaceChildren();document.body.replaceChildren();images.length=0;});
function geometry(){
 const css=document.head.appendChild(document.createElement('style'));css.textContent='span{direction:ltr;unicode-bidi:normal;font:14px Arial;color:black}';
 vi.stubGlobal('Image',class{onload=null;onerror=null;src='';constructor(){images.push(this);}});
 vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return new DOMRect(0,0,this.hasAttribute('data-character-measure')?1:48,48);});
 const read=vi.fn(()=>new DOMRect(0,0,9,17));
 for(const [key,value] of [['getBoundingClientRect',read],['getClientRects',()=>[]]] as const){const previous=Object.getOwnPropertyDescriptor(Range.prototype,key);Object.defineProperty(Range.prototype,key,{configurable:true,value});cleanup.push(()=>{if(previous)Object.defineProperty(Range.prototype,key,previous);else Reflect.deleteProperty(Range.prototype,key);});}
 return read;
}
const renderer:Extract<VisualRenderer,{target:'character-surface'}>={name:'test-surface',target:'character-surface',defaults:{},validate(){},surface(){return {image:png,width:48,height:48};}};
const property=(id='surface',start=0,end=start)=>({id,type:'test/surface',start,end});
function mount(direct=true,enabled=true,text='ABC',properties=[property()]){
 const reads=geometry();
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'text',type:'standoff-editor-block',text,standoffProperties:properties},{id:'other',type:'standoff-editor-block',text:'Other document content'}]},{features:{directDomCharacterCells:direct,inlineCharacterSurfaces:enabled}});
 editor.visualEffects.registerRenderer(renderer);editor.visualEffects.registerType({type:'test/surface',renderers:[{id:'surface',name:'test-surface'}]});registerCoreViews(editor);
 const view=editor.createView('test'),node=Object.values(view.state.nodes).find(n=>n.payload.id==='text')!;
 const root=document.body.appendChild(document.createElement('div'));const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,root);
 cleanup.push(()=>{dispose();editor.dispose();});
 const flow=root.querySelector<HTMLElement>('.reactive-standoff-flow')!;
 return {reads,editor,view,node,root,flow,dispose};
}
async function load(){for(const image of images)image.onload?.();await tick();}
it.each([true,false])('retains Cell/Text and bounds presentation/rebasing work (direct=%s)',async direct=>{
 const f=mount(direct),cell=f.flow.firstElementChild!,text=cell.firstChild;
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),commit=vi.spyOn(f.editor.repository,'commit'),build=vi.spyOn(f.view as any,'build');
 await load();expect(cell.hasAttribute('data-character-surface')).toBe(true);expect(cell.firstChild).toBe(text);expect(f.reads).toHaveBeenCalledTimes(1);expect(commit).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 const style=[...document.head.querySelectorAll('style')].find(s=>s.textContent?.includes('data-character-surface'))!,styleText=style.firstChild;
 const other=f.root.querySelectorAll('.reactive-standoff-flow')[1],observer=new MutationObserver(()=>{});observer.observe(other,{subtree:true,childList:true,attributes:true,characterData:true});
 for(let i=0;i<10;i++)f.editor.commands.replaceInlineRange(f.node.key,0,0,'x');await tick();
 expect(f.flow.children[10]).toBe(cell);expect(cell.firstChild).toBe(text);expect(f.reads).toHaveBeenCalledTimes(1);expect(style.firstChild).toBe(styleText);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(observer.takeRecords()).toHaveLength(0);observer.disconnect();
 (cell as HTMLElement).style.font='20px monospace';await tick();expect(f.reads).toHaveBeenCalledTimes(2);
});
it.each([true,false])('suspends composition, restores cancellation, and rejects stale completion (direct=%s)',async direct=>{
 const f=mount(direct);await load();const cell=f.flow.firstElementChild!;
 f.flow.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));expect(cell.hasAttribute('data-character-surface')).toBe(false);
 f.flow.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));await tick();expect(cell.hasAttribute('data-character-surface')).toBe(true);
 f.editor.commands.setPayloadField(f.node.key,'standoffProperties',[]);expect(cell.hasAttribute('data-character-surface')).toBe(false);
 f.editor.commands.setPayloadField(f.node.key,'standoffProperties',[property()]);const late=images.at(-1)!.onload;f.dispose();late?.();await tick();expect(cell.hasAttribute('data-character-surface')).toBe(false);
});
it.each([true,false])('isolates shared occurrences and preserves property history (direct=%s)',async direct=>{
 const f=mount(direct);await load();const original=f.flow.firstElementChild;
 const view=f.editor.createView('second'),root=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><ReactiveTreeView editor={f.editor} projection={view}/>,root));await load();const other=root.querySelector('[data-character-surface]');expect(other).toBeTruthy();expect(other).not.toBe(original);
 f.editor.commands.setPayloadField(f.node.key,'standoffProperties',[]);expect(f.flow.querySelector('[data-character-surface]')).toBeNull();expect(root.querySelector('[data-character-surface]')).toBeNull();f.editor.repository.undo();await load();expect(f.flow.firstElementChild).toBe(original);expect(root.querySelector('[data-character-surface]')).toBe(other);
});
it.each([
 ['lowercase','abc',[property()]],['combining','A\u0301B',[property()]],['wide range','ABC',[property('surface',0,1)]],['zero width','ABC',[{...property(),isZeroWidth:true}]],['conflict','ABC',[property('one'),property('two')]],['adjacent','ABC',[property('one'),property('two',1)]],
] as const)('falls back for %s without mutating the property',async(_,text,properties)=>{
 const f=mount(true,true,text,[...properties]);const revision=f.editor.repository.state.revision;await load();expect(f.flow.querySelector('[data-character-surface]')).toBeNull();expect(f.flow.textContent).toBe(text);expect(f.editor.repository.state.revision).toBe(revision);expect(f.node.payload.standoffProperties).toEqual(properties);
});
it('feature off leaves the renderer dormant',async()=>{const f=mount(true,false);await load();expect(images).toHaveLength(0);expect(f.flow.querySelector('[data-character-surface]')).toBeNull();expect(f.reads).not.toHaveBeenCalled();});
it('missing/error surfaces stay plain and never start a request',()=>{
 geometry();const flow=document.body.appendChild(document.createElement('div')),cell=flow.appendChild(document.createElement('span'));cell.append('A');const host=new CharacterSurfaceHost(flow,()=>{});cleanup.push(()=>host.dispose());
 for(const surface of [()=>undefined,()=>{throw Error('unavailable')},()=>({image:'https://example.com/a.png',width:48,height:48})])host.update([{identity:'x',cell,text:'A',renderer:{...renderer,surface},params:{}}]);host.measure();expect(images).toHaveLength(0);expect(cell.textContent).toBe('A');expect(cell.hasAttribute('data-character-surface')).toBe(false);
});
it.each([true,false])('uses the surface rectangle for an exact-Cell SVG annotation (direct=%s)',async direct=>{
 const f=mount(direct,true,'ABC',[property(),{id:'underline',type:'codex/claim-reference',start:0,end:0}]);await load();
 expect(f.root.querySelector('path[data-property-type="codex/claim-reference"]')?.getAttribute('d')).toBe('M 0 49.5 H 48');
 expect(f.node.payload.standoffProperties).toEqual([property(),{id:'underline',type:'codex/claim-reference',start:0,end:0}]);
});
it('keeps a failed bitmap ordinary and discards late replaced responses',async()=>{
 const f=mount(),first=images[0].onload;images[0].onerror?.();await tick();expect(f.flow.querySelector('[data-character-surface]')).toBeNull();
 f.editor.commands.setPayloadField(f.node.key,'standoffProperties',[]);f.editor.commands.setPayloadField(f.node.key,'standoffProperties',[property()]);first?.();await tick();expect(f.flow.querySelector('[data-character-surface]')).toBeNull();images.at(-1)!.onload?.();await tick();expect(f.flow.querySelector('[data-character-surface]')).not.toBeNull();
});

it.each([null,'invalid',[],{width:null},{width:0},{width:Infinity},{height:'48'},{renderer:42}])('malformed static metadata stays unavailable: %j',metadata=>{
 const registry=new VisualEffectRegistry();registerStaticCharacterSurface(registry);const definition=registry.type('style/character-surface')!;const next=characterSurfaceDefinition({type:definition.type,metadata},definition);const renderer=registry.renderer('static-character-surface')!;
 expect(renderer.target).toBe('character-surface');if(renderer.target==='character-surface')expect(renderer.surface('A',next.renderers[0].params!,document)).toBeUndefined();registry.dispose();
});

it.each([true,false])('falls back for mixed bidi text and restores after its removal without a full text walk (direct=%s)',async direct=>{
 const f=mount(direct);await load();const cell=f.flow.firstElementChild!;
 const walk=vi.spyOn(document,'createTreeWalker');
 f.editor.commands.replaceInlineRange(f.node.key,3,3,'\u202e');await tick();expect(cell.hasAttribute('data-character-surface')).toBe(false);
 expect(walk.mock.calls.every(([root])=>root!==f.flow)).toBe(true);
 f.editor.repository.undo();await tick();expect(cell.hasAttribute('data-character-surface')).toBe(true);
});
