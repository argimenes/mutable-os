import { createSignal, onCleanup, onMount } from 'solid-js';
import { ReactiveEditor } from '../reactive-editor/editor';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import { registerApplicationViews } from '../application/features';
import { symbolicRanges, unwrapSymbolic, literaliseSymbolic } from '../runtime/symbolic-attributes';
import { fixtureAttribute, symbolicFixture } from './symbolic-attributes-fixture';
import './text-superposition-demo.css';

export function SymbolicAttributesDemo() {
  const editor=new ReactiveEditor(symbolicFixture);registerApplicationViews(editor);
  editor.clipboard.setContext(()=>({cavernId:'symbolic-fixture',session:'symbolic-fixture'}));
  editor.symbolicAttributes.set(fixtureAttribute,'Lewis Carroll');
  const projection=editor.createView('symbolic-fixture');
  const owner=()=>projection.state.nodes[projection.state.nodes[projection.state.rootKey].children[0]];
  const [value,setValue]=createSignal<string|undefined>('Lewis Carroll');
  const update=(next?:string)=>{editor.symbolicAttributes.set(fixtureAttribute,next);setValue(next);};
  onMount(()=>{const stop=editor.installGateway(document);onCleanup(stop);});
  onCleanup(()=>editor.dispose());
  return <main class="text-superposition-demo"><header><h1>Symbolic materialisation prototype</h1>
    <p>Lewis Carroll · pen-name · {value()??'Unavailable (source fallback)'}</p>
    <p>The source remains “Lewis Carroll wrote Alice.” Attribute changes affect presentation only.</p>
    <nav>{['Lewis Carroll','L. Carroll','Charles Lutwidge Dodgson','iiiiiiiiiiiii','WWWWWWWWWWWWW'].map(v=><button onClick={()=>update(v)}>{v}</button>)}
      <button onClick={()=>update()}>Unavailable</button></nav>
    <button onClick={()=>unwrapSymbolic(editor,owner(),'symbolic-pen-name')}>Unwrap</button>
    <button onClick={()=>{const range=symbolicRanges(owner().payload.standoffProperties as any[],owner().inlineContent.length,id=>editor.symbolicAttributes.read(id))[0];if(range)literaliseSymbolic(editor,owner(),range);}}>Convert to Literal</button>
    <button onClick={()=>editor.repository.undo()}>Undo</button><button onClick={()=>editor.repository.redo()}>Redo</button>
  </header><section class="text-superposition-demo__document"><ReactiveTreeView editor={editor} projection={projection}/></section></main>;
}
