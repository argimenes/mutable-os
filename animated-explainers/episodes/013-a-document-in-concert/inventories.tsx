import React from 'react';
import {ease,hold} from '../../shared/motion';
import {ink} from '../../theme';
import {Label,Words,scale} from '../011-rags-to-riches/art';
import {Sheet,Subject} from './page';
import {entities,entityIds,mentions,sections,type Entity} from './document';

const names=(id:Entity)=>id==='book'?['Alice’s Adventures','in Wonderland']:[entities[id].name];
const rowY=(i:number)=>326+i*66;
export function Opening({t}:{t:number}){
  const spread=ease(t,22,24),links=hold(t,13,21.5,1.2);
  const inventory=ease(t,29.8,30.8),gather=ease(t,33,37);
  const pointFor=(id:Entity)=>{
    if(t<22)return id==='carroll'?{x:776,y:484}:undefined;
    return {x:751,y:rowY(entityIds.indexOf(id))-8};
  };
  return <g opacity={hold(t,2.4,46,.55)}>
    <Words x={76} y={212} size={44} prose>{t<22?'Reading a biographical sketch':'Two inventories of one sketch'}</Words>
    <g opacity={spread}>
      <Label x={76} y={278} size={21} color={ink.narrative}>STRUCTURAL</Label>
      <Label x={76} y={305} size={21} color={ink.narrative}>INVENTORY</Label>
      {sections.map((s,i)=><g key={s}>
        <rect x={71} y={330+i*64} width={211} height={48} rx={3} fill={ink.narrative}
          opacity={i===2?hold(t,25,33,.55)*.17:0}/>
        <Words x={80} y={363+i*64} size={29} prose>{s}</Words></g>)}
    </g>
    <Sheet x={scale(78,283,spread)} y={scale(248,368,spread)} zoom={scale(.99,.66,spread)}
      marks={t<22?hold(t,11.3,21.5,1):ease(t,32,35)*.95}
      active={t<22?'carroll':undefined} light={links}
      reader={t<10?scale(-1,10,ease(t,3,10)):-2}
      section={t>=25.3&&t<32.5?'Photography':undefined}
      links={t<22?links:hold(t,33,43,2.2)} linkTo={pointFor}/>
    <g opacity={links}><Subject x={887} y={484} id="carroll"/></g>
    <g opacity={inventory}>
      <Label x={756} y={260} size={21} color={ink.entity}>SEMANTIC INVENTORY</Label>
      <path d="M752 281H1004" stroke={ink.rule}/>
      {entityIds.map((id,i)=><g key={id} opacity={ease(gather,i*.085,i*.085+.5)}>
        <circle cx={752} cy={rowY(i)-8} r={4.5} fill={ink.entity}/>
        {names(id).map((line,k)=><Words key={line} x={766} y={rowY(i)+29*k} size={28} prose>{line}</Words>)}
      </g>)}
    </g>
  </g>;
}
function Collection({t}:{t:number}){
  const docs=[{x:641,y:336,title:'Sketch'},{x:854,y:376,title:'Notebook'},{x:684,y:652,title:'Letters'}];
  return <g>
    <Label x={628} y={284} size={20}>SAVED COLLECTION</Label>
    {docs.map((d,i)=><g key={d.title}>
      <path d={`M${d.x+57} ${d.y+39} L833 554`} stroke={ink.entity} strokeWidth={2.5} opacity={ease(t,57+i,58+i)}/>
      <g transform={`translate(${d.x} ${d.y})`}>
        <rect x={6} y={-5} width={127} height={79} rx={3} fill="#263235" stroke={ink.rule}/>
        <rect width={127} height={79} rx={3} fill="#233035" stroke={ink.grey}/>
        <Words x={10} y={31} size={22} prose>{d.title}</Words>
        <path d="M12 46h89m-89 10h68" stroke={ink.grey} opacity={.65}/>
      </g></g>)}
    <ellipse cx={836} cy={554} rx={105} ry={46} fill="#302c25" stroke={ink.grammar} strokeWidth={2}/>
    <Words x={836} y={564} size={29} center prose>Lewis Carroll</Words>
  </g>;
}
export function Survey({t}:{t:number}){
  const db=ease(t,55.7,56.7),network=hold(t,55.6,67,1.1),compare=ease(t,67,68);
  const count=Math.min(5,Math.max(0,Math.floor(scale(0,6,ease(t,48.2,53.1)))));
  return <g opacity={hold(t,45.9,77,.55)}>
    <Words x={76} y={212} size={46} prose>Survey the references</Words>
    <Label x={76} y={278} size={19}>ENTITY</Label>
    <Label x={435} y={278} size={19} center>DOCUMENT</Label>
    <Label x={558} y={278} size={19} center>DATABASE</Label>
    {entityIds.map((id,i)=>{
      const y=332+64*i;
      const lit=id==='carroll'?1-compare:id==='photo'||id==='math'?compare:0;
      return <g key={id} data-count={id}>
        <rect x={74} y={y-36} width={539} height={59} rx={4} fill={ink.entity} opacity={lit*.12}/>
        {names(id).map((s,k)=><Words key={s} x={90} y={y+(id==='book'?k*26-5:0)} size={id==='book'?25:32} prose>{s}</Words>)}
        <Words x={435} y={y} size={34} center color={ink.entity}>{mentions(id).length}</Words>
        <g opacity={db}><Words x={558} y={y} size={34} center color={ink.grammar}>{entities[id].db}</Words></g>
        <path d={`M76 ${y+27}h532`} stroke={ink.rule} opacity={.55}/>
      </g>;
    })}
    <g opacity={1-network}>
      <Sheet x={635} y={365} zoom={.54} marks={.7} active={t<66?'carroll':t<71.7?'photo':'math'} light={1} traced={t<56?count:Infinity}/>
      {t<56&&<Words x={824} y={757} size={28} center>{count} of 5 mentions traced</Words>}
      {t<56&&Array.from({length:5},(_,i)=><circle key={i} cx={750+i*37} cy={709} r={8} fill={i<count?ink.entity:ink.rule}/>)}
    </g>
    <g opacity={network}><Collection t={t}/></g>
    <Words x={76} y={809} size={31} color={ink.entity}>Document · live logical mentions</Words>
    <g opacity={db}><Words x={76} y={852} size={31} color={ink.grammar}>Database · saved, indexed annotation segments</Words></g>
  </g>;
}
