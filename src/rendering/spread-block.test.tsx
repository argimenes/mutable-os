import {expect,it,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../reactive-editor/editor';
import {ReactiveTreeView} from './reactive-tree-view';
import {registerCoreViews} from './register-core-views';
import {useSpreadLeaf} from './spread-block';
import type {ExistingBlockDto} from '../block-tree/types';
const progress={type:'navigation/progress',version:1} as const;
const terminal=(id:string)=>({id,type:'study-participant'});
const spread=(id:string,children:ExistingBlockDto[])=>({id,type:'spread-block',children,metadata:{spread:{bindings:[
  {type:progress.type,enabled:true,direction:'bidirectional'}]}}});
it('routes between direct occupants of each mounted occurrence and isolates nested and static content',async()=>{
 const doc={id:'doc',type:'document-block',children:[spread('outer',[terminal('a'),spread('inner',[terminal('b'),terminal('c')])]),
   spread('other',[terminal('x'),terminal('y'),terminal('additional')]),spread('static',[{type:'container-block',children:[terminal('descendant')]},{type:'plain-text-block',text:'independent'}])]};
 const editor=new ReactiveEditor(doc);registerCoreViews(editor);
 const projection=editor.createView('spread-test'),second=editor.createView('spread-again');
 const leases=new Map<string,any>(),received=vi.fn();
 editor.registry.register({type:'study-participant',capabilities:[],view:props=>{
   const scope=useSpreadLeaf(props.nodeKey);
   if(scope)leases.set(props.nodeKey,scope.register({publishes:[progress],subscribes:[progress],receive:e=>received(props.nodeKey,e)}));
   return <button>Participant</button>;
 }});
 const host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><><ReactiveTreeView editor={editor} projection={projection}/><ReactiveTreeView editor={editor} projection={second}/></>,host);
 try{
   const key=(id:string,p=projection)=>Object.values(p.state.nodes).find(n=>n.payload.id===id)!.key;
   const deliver=async(id:string)=>{leases.get(key(id)).publish({type:progress.type,position:.4});await new Promise(r=>requestAnimationFrame(r));};
   expect(leases.has(key('descendant'))).toBe(false);expect(leases.has(key('additional'))).toBe(false);expect(host.querySelector('textarea')?.value).toBe('independent');
   await deliver('a');expect(received).not.toHaveBeenCalled();
   await deliver('b');expect(received.mock.calls.map(c=>c[0])).toEqual([key('c')]);expect(key('c')).not.toBe(key('c',second));
   await deliver('x');expect(received.mock.calls.at(-1)?.[0]).toBe(key('y'));
   const y=leases.get(key('y'));const other=editor.mounts.get(key('other'))!.root;
   other.querySelectorAll('button')[1].click();expect(other.querySelector('[data-leaf=right]')).toBeNull();
   y.publish({type:progress.type,position:.3});await deliver('x');expect(received).toHaveBeenCalledTimes(2);
 }finally{dispose();editor.dispose();host.remove();}
});
