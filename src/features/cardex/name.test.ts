import {it,expect,vi} from 'vitest';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {encodeDocument} from '../../block-tree/codecs';
import {makeNameSingleLine} from './name';
import {validateCard,validateDescription} from './validation.mjs';
import {parseClipboardHtml} from '../../interchange/html-ast';
import {importSemanticHtml} from '../../interchange/html-import';
import {materializeFragment} from '../../interchange/materialize';
it('repairs inherited CR/LF as one bounded undoable edit, retaining Cells and Unicode annotation ranges',()=>{
 const text='\r😀 Leonardo\r\nda Vinci\n',props=[{id:'given',type:'given-name',start:3,end:10},{id:'place',type:'toponym',start:16,end:20}];
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'name',type:'standoff-editor-block',text,standoffProperties:props},...Array.from({length:50},(_,i)=>({id:'other'+i,type:'standoff-editor-block',text:'Unrelated'}))]});
 try{const view=editor.createView(),name=Object.values(view.state.nodes).find(n=>n.payload.id==='name')!,cells=[...name.inlineContent],other=Object.values(editor.repository.readState().contents).find(c=>c.payload.id==='other0');
  const snapshot=vi.spyOn(editor.repository,'snapshot'),read=()=>encodeDocument(editor.repository.readState(),name.placementKey);
  expect(makeNameSingleLine(editor,name.key)).toBe(true);expect(snapshot).not.toHaveBeenCalled();expect(read().text).toBe('😀 Leonardo da Vinci');expect(name.inlineContent).toContain(cells[3]);expect(editor.repository.readState().contents[other!.key]).toBe(other);
  expect(read().standoffProperties).toMatchObject([{id:'given',start:2,end:9},{id:'place',start:14,end:18}]);
  editor.repository.undo();expect(read().text).toBe(text);expect(read().standoffProperties).toEqual(props);editor.repository.redo();expect(read().text).toBe('😀 Leonardo da Vinci');
  expect(makeNameSingleLine(editor,name.key)).toBe(false);
 }finally{editor.dispose();}
});
it('reports hidden breaks separately from length and unsupported Description annotations',()=>{
 const card={name:'\r722.\rBelieve me',nameStrata:null,descriptionDocument:null,imageRef:null,aliases:[]};expect(()=>validateCard(card)).toThrow('2 hidden line breaks');expect(()=>validateCard({...card,name:'x'.repeat(1001)})).toThrow('1001 characters');
 const doc={type:'document-block',children:[{type:'standoff-editor-block',text:'L',standoffProperties:[{id:'x',type:'codex/entity-reference',value:'entity',start:0,end:0}]}]};expect(()=>validateDescription(doc)).toThrow('Description does not support annotation "codex/entity-reference"');
});
it('round-trips the actual HTML importer’s links, superscripts and colours as local Description data',()=>{
 const fragment=importSemanticHtml(parseClipboardHtml('<p><b>Leonardo 😀</b><sup><a href="https://example.com/#note">[b]</a></sup> was a <a href="https://example.com/polymath">polymath</a><span style="color:#123456;background-color:rgb(1, 2, 3)">.</span></p>').tree).fragment!;
 const materialized=materializeFragment(fragment),doc={type:'document-block',children:materialized.roots.map(key=>encodeDocument(materialized.state,key))};
 expect(()=>validateDescription(doc)).not.toThrow();expect(doc.children[0].standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({type:'reference/url',value:'https://example.com/#note'}),expect.objectContaining({type:'style/superscript'})]));
 const bad=structuredClone(doc) as any;bad.children[0].standoffProperties.find((p:any)=>p.type==='reference/url').value='javascript:alert(1)';expect(()=>validateDescription(bad)).toThrow('unsupported link URL');
});
