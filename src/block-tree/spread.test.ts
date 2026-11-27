import {expect,it} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {migrateSpreadWire} from './spread';

it('preserves all legacy occupants and admits only complete owned Leaf pairs',()=>{
 const editor=new ReactiveEditor({type:'document-block',children:[{type:'spread-block',id:'spread',children:['a','b','c'].map(id=>({type:'plain-text-block',id,text:id}))}]});
 try{
  const view=editor.createView('pair'),node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
  const leaf=node('spread-recto'),dest={kind:'before' as const,anchorKey:leaf.key};
  expect(leaf.children.map(k=>view.state.nodes[k].payload.id)).toEqual(['b','c']);
  expect(()=>editor.commands.insert({type:'plain-text-block'},dest)).toThrow();
  expect(()=>editor.commands.insert({type:'leaf-block',placement:'recto'},dest)).toThrow();
  expect(()=>editor.commands.remove(leaf.key)).toThrow();
  expect(()=>editor.commands.setPayloadField(leaf.key,'placement','verso')).toThrow();
  editor.commands.remove(node('a').key);expect(node('spread-verso').children).toHaveLength(0);
  const empty=editor.repository.readState().contents[node('spread-verso').contentKey];
  expect(()=>editor.repository.commit('Retype Leaf',[{kind:'put-content',record:{...empty,viewType:'container-block'}}])).toThrow();
  expect(node('spread').children).toHaveLength(2);
 }finally{editor.dispose();}
});
it('rejects a third Leaf and a duplicated physical side in versioned wire input',()=>{
 const target=(blockId:string)=>({placementId:'p-'+blockId,kind:'owned' as const,target:{kind:'local' as const,blockId}});
 const leaf=(id:string,placement:string)=>({type:'leaf-block',id,properties:{placement}});
 const spread={id:'spread',type:'spread-block',properties:{metadata:{spread:{version:3}}},children:[target('a'),target('b')]};
 expect(()=>migrateSpreadWire({blocks:[spread,leaf('a','verso'),leaf('b','verso')]})).toThrow(/two owned/);
 expect(()=>migrateSpreadWire({blocks:[{...spread,children:[...spread.children,target('c')]},leaf('a','verso'),leaf('b','recto'),leaf('c','recto')]})).toThrow(/two owned/);
});
