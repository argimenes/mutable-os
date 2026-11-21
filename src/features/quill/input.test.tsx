// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {registerApplicationViews} from '../../application/features';
import {defaultComposition,QUILL_TYPE} from './model';
const cleanups:Array<()=>void>=[];
beforeEach(()=>{vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({font:'',measureText:(s:string)=>({width:s.length*10})} as any);});
afterEach(()=>{cleanups.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();});
function setup(text='one two three',extra=0,compact=false){
 const c=defaultComposition();c.paths[0]={...c.paths[0],kind:'sine',amplitude:20,cycles:1};
 const e=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'composition',type:QUILL_TYPE,quill:c,blockProperties:[{type:'codex/block-reference',value:'source',metadata:{quillRole:'body'}}],children:[{id:'source',type:'standoff-editor-block',text,standoffProperties:[{id:'italic',type:'style/italics',start:4,end:6}]}]},...Array.from({length:extra},(_,i)=>({id:'unrelated-'+i,type:'standoff-editor-block',text:'Unrelated native text.'}))]},{features:{compactCanonicalText:compact,nativeKnowledge:false,sqliteKnowledge:false}});
 registerApplicationViews(e);const v=e.createView('test'),n=Object.values(v.state.nodes).find(n=>n.payload.id==='source')!;
 cleanups.push(()=>e.dispose());const host=document.body.appendChild(document.createElement('div'));cleanups.push(render(()=><ReactiveTreeView editor={e} projection={v}/>,host));e.installGateway(document);
 const sink=host.querySelector<HTMLElement>('.quill-input-sink')!,mount=()=>e.mounts.get(n.key)!,value=()=>host.querySelector('.quill-canvas')?.textContent;
 const key=(key:string,opts={})=>sink.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...opts}));
 const input=(data:string)=>sink.dispatchEvent(new InputEvent('beforeinput',{data,inputType:'insertText',bubbles:true,cancelable:true}));
 return {e,n,host,sink,mount,value,key,input};
}
describe('M1 checkpoint 1: mounted native SVG input',()=>{
 it('inserts, navigates, selects, replaces and deletes through the input gateway with native undo/redo',()=>{
  const f=setup();expect(f.sink).toBeTruthy();expect(f.host.querySelector('.reactive-standoff-flow')).toBeNull();
  f.mount().focus();f.mount().restoreInlineSelection!({anchor:4,head:4});f.input('new ');expect(f.value()).toBe('one new two three');
  f.key('ArrowRight',{shiftKey:true});f.key('ArrowRight',{shiftKey:true});f.input('X');expect(f.value()).toBe('one new Xo three');
  f.key('Backspace');expect(f.value()).toBe('one new o three');f.key('Delete');expect(f.value()).toBe('one new  three');
  f.e.repository.undo();expect(f.value()).toBe('one new o three');f.e.repository.redo();expect(f.value()).toBe('one new  three');
  expect(f.e.node(f.n.key)?.contentKey).toBe(f.n.contentKey);
 });
 it('preserves unsupported input and IME without committing or corrupting native text',()=>{
  const f=setup(),revision=f.e.repository.state.revision;f.input('🙂');f.sink.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'字'}));f.sink.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertCompositionText',data:'字',isComposing:true,bubbles:true,cancelable:true}));f.sink.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'字'}));
  expect(f.e.repository.state.revision).toBe(revision);expect(f.value()).toBe('one two three');expect(f.host.textContent).toContain('IME');
 });
 it('uses native range selection for clipboard and word navigation',()=>{
  const f=setup();f.mount().restoreInlineSelection!({anchor:0,head:0});f.key('ArrowRight',{altKey:true,shiftKey:true});expect(f.mount().captureInlineSelection!()).toEqual({anchor:0,head:4});
  const data={getData:()=> 'new ',setData:vi.fn()};const clipboard=(type:string)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:data});f.sink.dispatchEvent(e);};clipboard('copy');expect(data.setData).toHaveBeenCalledWith('text/plain','one ');clipboard('paste');expect(f.value()).toBe('new two three');
 });
 it('diagnoses pre-existing unsupported text without flattening it',()=>{const f=setup('a🙂b');expect(f.host.textContent).toContain('a🙂b');expect(f.host.textContent).toContain('Unicode');});
});

it('previews numeric geometry, cancels it, and commits a single native undo/redo step',()=>{
 const f=setup();const button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 button('Three linked waves').click();const wrapper=Object.values(f.e.repository.state.contents).find(c=>c.payload.id==='composition')!,before=JSON.stringify(wrapper.payload.quill);
 const field=f.host.querySelector<HTMLInputElement>('input[aria-label="amplitude"]')!;
 const preview=(n:string)=>{field.value=n;field.dispatchEvent(new Event('input',{bubbles:true}));};
 preview('40');preview('50');expect(JSON.stringify(f.e.repository.state.contents[wrapper.key].payload.quill)).toBe(before);button('Cancel preview').click();expect(field.value).toBe('20');
 preview('45');field.dispatchEvent(new Event('change',{bubbles:true}));expect((f.e.repository.state.contents[wrapper.key].payload.quill as any).paths[0].amplitude).toBe(45);
 f.e.repository.undo();expect(JSON.stringify(f.e.repository.state.contents[wrapper.key].payload.quill)).toBe(before);f.e.repository.redo();expect((f.e.repository.state.contents[wrapper.key].payload.quill as any).paths[0].amplitude).toBe(45);
});

it.each([false,true])('applies native formatting, entity and Gloss ranges on the SVG selection and displays overlaps (compact=%s)',compact=>{
 const f=setup('one two three',0,compact),button=(label:string)=>[...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 f.mount().restoreInlineSelection!({anchor:0,head:7});button('Italic').click();expect(f.e.node(f.n.key)?.payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'style/italics',start:0,end:6})]));
 f.e.rangeAnnotations.apply([f.e.textRanges.snapshot(f.n.key,4,7)],'codex/entity-reference','entity-id');
 f.mount().restoreInlineSelection!({anchor:4,head:7});button('Gloss').click();expect(document.querySelector('[aria-label="Create Gloss"]')).not.toBeNull();expect(f.e.gloss.commit('note: a native Gloss')).toBe(true);
 expect(f.host.querySelector('.quill-range-effects [data-property-type="codex/entity-reference"]')).not.toBeNull();expect(f.host.querySelector('.quill-range-effects [data-property-type="mutable/gloss"]')).not.toBeNull();expect(f.host.querySelector('text.mutable-gloss-anchor')).not.toBeNull();
 f.mount().restoreInlineSelection!({anchor:0,head:0});f.input('New ');const props=f.e.node(f.n.key)?.payload.standoffProperties as any[];expect(props.find(p=>p.type==='mutable/gloss')).toMatchObject({start:8,end:10});expect(props.find(p=>p.type==='codex/entity-reference')).toMatchObject({start:8,end:10});
 f.e.repository.undo();expect((f.e.node(f.n.key)?.payload.standoffProperties as any[]).find(p=>p.type==='mutable/gloss')).toMatchObject({start:4,end:6});
});
it('native fallback and return are local presentation changes with no canonical work',()=>{
 const f=setup('a🙂b'),revision=f.e.repository.state.revision,snapshot=vi.spyOn(f.e.repository,'snapshot');
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Native text')!.click();expect(f.host.querySelector('.reactive-standoff-flow')).not.toBeNull();
 [...f.host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Return to SVG')!.click();expect(f.host.querySelector('.quill-canvas')).not.toBeNull();expect(f.e.repository.state.revision).toBe(revision);expect(snapshot).not.toHaveBeenCalled();
});

it.each([0,500])('mounted SVG input/undo with %s unrelated Blocks reads no unrelated payloads or snapshots',extra=>{
 const f=setup('one two three',extra),state=f.e.repository.readState(),restores:Array<()=>void>=[];let reads=0;
 for(const c of Object.values(state.contents))if(String(c.payload.id).startsWith('unrelated-')){const d=Object.getOwnPropertyDescriptor(c,'payload')!;Object.defineProperty(c,'payload',{configurable:true,get(){reads++;return d.value;}});restores.push(()=>Object.defineProperty(c,'payload',d));}
 const snapshot=vi.spyOn(f.e.repository,'snapshot'),changes:number[]=[],stop=f.e.repository.subscribeChanges(c=>changes.push(c.previousContents.size));
 try{f.mount().restoreInlineSelection!({anchor:4,head:4});f.input('new ');f.e.repository.undo();f.e.repository.redo();expect(reads).toBe(0);expect(snapshot).not.toHaveBeenCalled();expect(changes).toEqual([5,5,5]); /* Four inserted legacy Cells plus their source; bounded independently of unrelated Blocks. */ }finally{stop();restores.forEach(f=>f());}
});
it('retains glyph DOM and performs no glyph writes for caret-only movement',()=>{
 const f=setup(),glyph=f.host.querySelector('[data-quill-offset="0"]'),root=f.host.querySelector('.quill-text-surface') as HTMLElement&{quillDiagnostics():{glyphWrites:number}};
 f.mount().focus();f.mount().restoreInlineSelection!({anchor:4,head:4});const before=root.quillDiagnostics().glyphWrites;f.key('ArrowRight');expect(root.quillDiagnostics().glyphWrites).toBe(before);f.input('X');expect(f.host.querySelector('[data-quill-offset="0"]')).toBe(glyph);
});

it('unsupported-source select-all and clipboard remain non-destructive in canonical coordinates',()=>{
 const f=setup('a🙂b'),revision=f.e.repository.state.revision;f.mount().restoreInlineSelection!({anchor:0,head:3});f.key('a',{metaKey:true});f.key('Backspace');f.input('x');
 expect(f.mount().captureInlineSelection!()).toEqual({anchor:0,head:3});expect(f.e.repository.state.revision).toBe(revision);expect(f.host.textContent).toContain('a🙂b');
});
