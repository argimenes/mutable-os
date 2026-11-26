import React from 'react';
import {ink} from '../../theme';
import {ease,hold} from '../../shared/motion';
import {Label,Words,scale} from '../011-rags-to-riches/art';
import {entities,contains,mentions,passages,type Entity} from './document';
import {IndexStrip,Sheet} from './page';

type Reading={id?:Entity;light:number;fold:number};
function readingAt(t:number):Reading{
  // Each fold reaches its endpoint before the next subject takes over.
  if(t>=188){
    const fold=ease(t,201.5,204.5)*(1-ease(t,208.6,213.4));
    return {id:'carroll',light:ease(t,198.5,199.4)*(1-ease(t,212.8,214.2)),fold};
  }
  if(t>=176.8)return {id:'alice',light:hold(t,176.9,187.9,.7),fold:ease(t,178.6,180.9)*(1-ease(t,185.3,187.9))};
  if(t>=166.2)return {id:'oxford',light:hold(t,166.2,176.7,.65),fold:ease(t,167.6,169.9)*(1-ease(t,173.0,176.5))};
  if(t>=123.8)return {id:'photo',light:hold(t,129.4,166,.9),fold:ease(t,144.9,151.4)*(1-ease(t,161.4,165.4))};
  if(t>=107){
    if(t<114.4)return {id:'carroll',light:hold(t,107,114.4,.45),fold:0};
    if(t<119.3)return {id:'photo',light:hold(t,114.4,119.3,.4),fold:0};
    return {id:'oxford',light:hold(t,119.3,123.8,.45),fold:0};
  }
  if(t<99)return {id:'carroll',light:hold(t,80.5,98.6,.85),fold:0};
  if(t<103.3)return {id:'photo',light:hold(t,99.1,103.3,.45),fold:0};
  return {id:'oxford',light:hold(t,103.3,106.95,.45),fold:0};
}
const rows:Entity[]=['carroll','photo','oxford','alice','math','book'];
const panelY=332;
function Inventory({t,reading,x}:{t:number;reading:Reading;x:number}){
  const {id,light,fold}=reading;
  const hovered=t<107, selected=!!id && (fold>.001||light>.01);
  return <g transform={`translate(${x} 0)`}>
    <Label x={3} y={282} size={20}>SEMANTIC INVENTORY</Label>
    {rows.map((item,i)=>{
      const y=panelY+65*i;
      const active=id===item?light:0;
      return <g key={item} data-inventory={item}>
        <rect x={0} y={y-32} width={231} height={55} rx={4} fill={fold>.02?ink.grammar:ink.entity} opacity={active*.19}/>
        <path d={`M1 ${y+24}H231`} stroke={ink.rule}/>
        {item==='book'?<>
          <Words x={9} y={y-4} size={24} prose>Alice’s Adventures</Words>
          <Words x={9} y={y+20} size={24} prose>in Wonderland</Words></>:
          <Words x={9} y={y+5} size={29} prose>{entities[item].name}</Words>}
        {selected&&id===item&&hovered&&<path d={`M202 ${y-7}l0 27 7 -7 6 12 6 -3 -6 -12 10 -1z`}
          fill={ink.cream} stroke={ink.paper} strokeWidth={2} opacity={light}/>}
      </g>;
    })}
    {selected&&id&&<g opacity={light}>
      <Label x={5} y={759} size={19} color={ink.grammar}>{fold>.02?'FOCUSED PASSAGES':'LIT MENTIONS'}</Label>
      <Words x={5} y={798} size={34} prose>{fold>.02?passages.filter(p=>contains(p,id)).length:mentions(id).length}
        <tspan fill={ink.grey} fontSize={23}>{fold>.02?' of 10 passages':' in this sketch'}</tspan></Words>
    </g>}
  </g>;
}
function Landscape({id,light}:{id?:Entity;light:number}){
  const displayed:Entity[]=['carroll','photo','oxford'];
  return <g transform="translate(639 324)">
    <Label x={0} y={0} size={19}>ACROSS TEN PASSAGES</Label>
    {displayed.map((entity,i)=><g key={entity} transform={`translate(0 ${68+i*111})`}>
      <Words x={0} y={0} size={33} prose color={id===entity?ink.cream:ink.grey}>{entities[entity].name}</Words>
      {passages.map((p,k)=><rect key={p.id} x={k*32} y={20} width={24} height={26} rx={2}
        fill={contains(p,entity)?ink.grammar:ink.rule} opacity={contains(p,entity)&&id===entity?.6+.4*light:.42}/>)}
    </g>)}
    <Label x={0} y={401} size={17}>FIRST</Label><Label x={260} y={401} size={17}>LAST</Label>
  </g>;
}
const titleAt=(t:number)=>t<107?'Illuminate the references':t<124?'From words to patterns':t<161?'Concentrate on photography':t<188?'One sketch, several readings':t<195.5?'From writing to reading':t<198.5?'Survey':t<201.5?'Illuminate':t<208?'Concentrate':'The complete sketch returns';

export function Readings({t}:{t:number}){
  const reading=readingAt(t);
  const landscape=ease(t,107,110)*(1-ease(t,121.8,124.3));
  const strip=hold(t,144.8,165,.9)+hold(t,167.5,176.5,.8)+hold(t,178.4,187,.8)+hold(t,201.5,213,.8);
  const stripOpacity=Math.min(1,strip)*ease(reading.fold,.34,.70);
  const linking=hold(t,188.5,196,1.4);
  return <g opacity={hold(t,76.9,215.3,.55)}>
    <Words x={76} y={210} size={45} prose>{titleAt(t)}</Words>
    <Sheet x={scale(76,120,landscape)} y={scale(244,328,landscape)} zoom={scale(.989,.69,landscape)}
      focus={reading.id} fold={reading.fold} active={reading.id} light={reading.light}
      marks={.78} links={linking} linkTo={id=>id==='carroll'?{x:772,y:panelY-8}:undefined}/>
    <g opacity={1-landscape}><Inventory t={t} x={770} reading={reading}/></g>
    <g opacity={landscape}><Landscape id={reading.id} light={reading.light}/></g>
    <g opacity={stripOpacity}><IndexStrip x={88} y={779} active={reading.id}/></g>
  </g>;
}
