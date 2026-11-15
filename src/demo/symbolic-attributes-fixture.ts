import type { ExistingBlockDto } from '../block-tree/types';
import { SYMBOLIC_ATTRIBUTE } from '../runtime/symbolic-attributes';
export const fixtureAttribute='11111111-1111-4111-8111-111111111111';
export const symbolicFixture: ExistingBlockDto={id:'symbolic-fixture',type:'document-block',children:[
  {id:'symbolic-source',type:'standoff-editor-block',text:'Lewis Carroll wrote Alice.',children:[],standoffProperties:[
    {id:'symbolic-pen-name',type:SYMBOLIC_ATTRIBUTE,value:fixtureAttribute,start:0,end:12,metadata:{symbolic:{version:1,format:'default'}}},
    {id:'alice',type:'style/underline',start:20,end:24},
    {id:'alice-overlay',type:'style/rectangle',start:20,end:24},
    {id:'symbolic-bold',type:'style/bold',start:0,end:12},
  ]},
  {id:'symbolic-next',type:'standoff-editor-block',text:'An ordinary paragraph for cross-block selection.',children:[],standoffProperties:[]},
]};
