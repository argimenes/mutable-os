import React from 'react';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {EntityNode,point} from '../006-where-text-meets-the-graph/graph';
import {Label,Words,Wire,Vector,Passage,scale} from './art';
import {chunk,enrich,guidedSplit,initialSplit,mapAction,mentions,names,napoleon,proposedSplit,readings,splitAt,texts,wording} from './model';

const packet=enrich(chunk('B'));
const bMentions=mentions.filter(m=>m.doc==='B');
const aMentions=mentions.filter(m=>m.doc==='A'&&m.entity===napoleon.id);

export function Boundaries({t}:{t:number}){
  const marks=ease(t,9.1,11.4),guide=ease(t,15.9,17.1);
  const split=scale(scale(initialSplit,proposedSplit,ease(t,15.9,17.65)),guidedSplit,ease(t,19.1,20.9));
  const [first,second]=splitAt(Math.round(split));
  const axis=(offset:number)=>93+894*offset/texts.A.length;
  const boundary=axis(split);
  return <g opacity={hold(t,2.3,23.25,.55)}>
    <Passage doc="A" caption="FICTIONAL MILITARY ACCOUNT" x={76} y={178} w={928} h={245} size={43}
      baseline={91} leading={59} marks={[...aMentions.map((m,i)=>({range:m,color:ink.entity,draw:ease(t,9.1+i,10.1+i)})),
        {range:mapAction,color:ink.narrative,draw:guide,lane:1}]}/>
    <g opacity={ease(t,3.55,5.05)}>
      <Label x={93} y={490}>DERIVED CHUNKS · SOURCE RANGES</Label>
      {[first,second].map((c,i)=>{
        const x=i===0?93:boundary+5,w=i===0?boundary-98:987-x;
        return <g key={i} data-chunk={c.id}>
          <rect x={x} y={515} width={w} height={85} rx={6} stroke={ink.entity} fill="#223335" strokeWidth={2} strokeDasharray="9 6"/>
          <Words x={x+w/2} y={569} size={32} center>Chunk {i+1}</Words>
        </g>;
      })}
      <g opacity={guide}>
        <path d={`M${axis(mapAction.start)} 510V502H${axis(mapAction.end)}V510`} fill="none" stroke={ink.narrative} strokeWidth={4}/>
        <path d={`M${boundary} 493V609`} stroke={ink.cream} strokeWidth={2} strokeDasharray="4 5"/>
        <Words x={540} y={872} size={27} center color={ink.narrative}>
          {t<19.7?'Proposed split crosses the annotated action.':'Adjusted split keeps the annotated action together.'}</Words>
      </g>
    </g>
    <g opacity={hold(t,4.85,9.8,.65)}>
      {[0,1].map((i)=><g key={i} transform={`translate(${i===0?231:711} 0)`}>
        <path d="M0 605V665" stroke={ink.grey} strokeWidth={2}/><Vector x={-53} y={713} alternate={i===1}/>
      </g>)}<Label x={540} y={792} center>ILLUSTRATIVE EMBEDDINGS</Label>
    </g>
    <g opacity={marks}>
      {aMentions.map((m,i)=>{
        const x=axis((m.start+m.end)/2);
        return <g key={m.id}>
          <circle cx={x} cy={600} r={5} fill={ink.entity}/>
          <Wire a={point(x,601)} b={point(490+i*56,704)} pulse={ease(t,11.6+i*.6,12.6+i*.6)}/>
          <Words x={x+(i===0?32:87)} y={650} size={29} center>{wording(m)}</Words>
        </g>;
      })}
      <EntityNode entity={napoleon} center={point(540,768)} opacity={1} light={marks}/>
    </g>
  </g>;
}

export function Enrichment({t}:{t:number}){
  const layers=ease(t,29.35,31.45),views=ease(t,41.7,43.6),y=scale(398,482,layers);
  const derived=1-views,model=ease(t,25.2,26.35);
  const xs=[215,540,854],colors=[ink.grammar,ink.narrative,ink.entity];
  const fields=[names[packet.entities[0]],packet.claims[0].type,names[packet.entities[1]]];
  const marks=[
    {range:bMentions[0],color:colors[0],draw:layers,to:point(xs[0]-76,194)},
    {range:readings[0].range,color:colors[1],draw:layers,lane:1,to:point(xs[1]-76,194)},
    {range:bMentions[1],color:colors[2],draw:layers,to:point(xs[2]-76,194)}];
  return <g opacity={hold(t,22.85,51.3,.55)}>
    <Passage doc="B" x={76} y={178} w={928} h={154} size={52} baseline={105} caption="FICTIONAL RETURN JOURNEY"
      marks={views<.5?marks:readings.map((r,i)=>({range:r.range,color:colors[i],draw:views,lane:i}))}/>
    <g opacity={derived}>
      <g opacity={layers}>
        {fields.map((f,i)=><g key={f}>
          <rect x={xs[i]-137} y={372} width={274} height={64} rx={8} fill="#263236" stroke={colors[i]} strokeWidth={2}/>
          <Words x={xs[i]} y={413} center size={27}>{f}</Words>
          <Wire a={point(xs[i],436)} b={point(xs[i],480)} color={colors[i]} pulse={ease(t,31.5+i*.3,32.4+i*.3)}/>
        </g>)}
      </g>
      <rect x={91} y={y} width={898} height={scale(124,198,layers)} rx={8} stroke={ink.entity} strokeWidth={2} strokeDasharray="9 6" fill="#203033"/>
      <Label x={114} y={y+34} color={ink.entity}>{layers>.5?'ENRICHED RETRIEVAL REPRESENTATION':'TEXT-ONLY RETRIEVAL CHUNK'}</Label>
      <Words x={114} y={y+89} size={40} prose>{wording(packet.unit)}</Words>
      <g opacity={layers}>
        <Words x={114} y={y+141} size={29}>Person · {fields[0]}</Words><Words x={620} y={y+141} size={29}>Place · {fields[2]}</Words>
        <Words x={114} y={y+181} size={29}>Claim · {fields[1]}</Words>
      </g>
      <g opacity={model}>
        <Wire a={point(540,y+scale(124,198,layers))} b={point(540,732)} pulse={Math.max(ease(t,25.4,26.4)*(1-layers),ease(t,35.2,36.6))}/>
        <rect x={387} y={733} width={306} height={66} rx={7} fill={ink.paper} stroke={ink.grey} strokeWidth={2}/>
        <Words x={540} y={778} center size={32}>Embedding model</Words>
        <Wire a={point(696,766)} b={point(791,766)} pulse={layers>.5?ease(t,36.6,37.7):ease(t,26.5,27.3)}/>
        <Vector x={801} y={765} alternate={layers>.5}/><Label x={840} y={838} size={20} center>ABSTRACT VECTOR</Label>
      </g>
    </g>
    <g opacity={views}>
      <Label x={150} y={399}>THREE POSSIBLE RETRIEVAL REPRESENTATIONS</Label>
      {readings.map((r,i)=>{
        const row=470+i*134;
        return <g key={r.name} opacity={ease(t,42+i*.56,43.4+i*.56)}>
          <path d={`M85 335V${row+10}H150`} stroke={colors[i]} fill="none" strokeWidth={2}/>
          <rect x={150} y={row-37} width={839} height={102} fill="#222e31" stroke={colors[i]} strokeDasharray="8 6" rx={7}/>
          <Words x={177} y={row+7} size={33}>{r.name}</Words>
          <Words x={177} y={row+46} size={26} color={ink.grey}>“{wording(r.range)}”</Words>
          <Words x={630} y={row+25} size={33} prose color={colors[i]}>{r.label}</Words>
        </g>;
      })}
    </g>
  </g>;
}
