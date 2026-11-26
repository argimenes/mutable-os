import React from 'react';
import {ease,hold} from '../../shared/motion';
import {StatementPlate} from '../../shared/StatementPlate';
import {ink} from '../../theme';
import {EntityNode,MentionNode,between,point,type Point} from '../006-where-text-meets-the-graph/graph';
import {Label,Words,Wire,Vector,Passage,scale} from './art';
import {candidates,chunk,context,inRange,names,napoleon,retained,wording,type Doc} from './model';

const dots:Record<Doc,[number,number]>={A:[195,625],B:[574,549],C:[654,596],D:[888,517],E:[324,802],F:[508,701]};
export function Similarity({t}:{t:number}){
  const inspect=ease(t,58.65,59.65),shown=ease(t,53.1,54.3);
  return <g opacity={hold(t,51.05,66.25,.55)}>
    <g opacity={1-inspect}>
      <g opacity={ease(t,51.7,52.6)}>
        <Words x={90} y={356} size={32}>Question</Words><Wire a={point(243,345)} b={point(324,345)} draw={shown}/>
        <rect x={325} y={309} width={307} height={71} fill={ink.paper} stroke={ink.grey} rx={6}/>
        <Words x={478} y={354} size={30} center>Embedding model</Words>
        <Wire a={point(632,345)} b={point(751,345)} draw={shown}/><g opacity={shown}><Vector x={766} y={345}/></g>
      </g>
      <g opacity={shown}>
        <rect x={76} y={414} width={928} height={451} rx={8} fill="url(#points)" stroke={ink.rule}/>
        <Label x={98} y={452} size={23}>ILLUSTRATIVE PROJECTION · PRESET CANDIDATES</Label>
        <ellipse cx={581} cy={622} rx={130} ry={113} stroke={ink.entity} fill={ink.entity} fillOpacity={.055}
          strokeDasharray="7 8" opacity={ease(t,54.8,55.8)} />
        <g transform={`translate(${scale(825,566,ease(t,53.65,54.95))} ${scale(345,626,ease(t,53.65,54.95))})`}>
          <path d="m0 -12 12 12 -12 12 -12 -12Z" fill={ink.cream}/>
        </g>
        <Words x={587} y={659} size={27}>Question</Words>
        {Object.entries(dots).map(([doc,[x,y]])=>{
          const selected=candidates.includes(doc as Doc);
          return <g key={doc}><circle cx={x} cy={y} r={selected?10:7} fill={selected&&t>54.95?ink.entity:ink.grey}/>
            <Label x={x+15} y={y-10} color={selected?ink.cream:ink.grey}>{doc}</Label></g>;
        })}
      </g>
    </g>
    <g opacity={inspect}>
      <Label x={76} y={341}>IDENTITY CONSTRAINT</Label>
      <Words x={76} y={399} size={42} prose>Keep mentions of Napoleon Bonaparte.</Words>
      {candidates.map((doc,i)=>{
        const m=inRange(chunk(doc))[0],y=488+i*133,match=retained.includes(doc);
        return <g key={doc} data-filter={doc} data-match={match}>
          <rect x={76} y={y-45} width={928} height={107} rx={6} fill={match?'#213233':'#272c2e'} stroke={match?ink.entity:ink.grey}/>
          <Label x={97} y={y+18} color={match?ink.entity:ink.grey}>CHUNK {doc}</Label>
          <Words x={250} y={y+18} size={31} prose>“{wording(m)}”</Words>
          <Wire a={point(489,y+8)} b={point(557,y+8)} color={ink.grey}/>
          <Words x={585} y={y+18} size={30}>{names[m.entity]}</Words>
          <Label x={890} y={y+18} size={20} color={match?ink.entity:ink.grey}>{match?'KEEP':'EXCLUDE'}</Label>
        </g>;
      })}
    </g>
  </g>;
}

const records=[
  ...context.judgements.map(r=>({source:r.source,kind:r.kind,title:names[r.concept],credit:names[r.observer],
    expression:r.expression})),
  ...context.orders.map(r=>({source:r.source,kind:r.kind,title:r.type,credit:names[r.recipient],expression:r.time})),
];
const order=context.orders[0];
function rectanglePort(center:Point,target:Point,halfWidth:number,halfHeight:number) {
  const dx=target.x-center.x,dy=target.y-center.y;
  const distance=Math.max(Math.abs(dx)/halfWidth,Math.abs(dy)/halfHeight)||1;
  return point(center.x+dx/distance,center.y+dy/distance);
}
export function ConnectedChunk({t}:{t:number}){
  const unfold=ease(t,72.6,75.5),collect=ease(t,92.55,95.6);
  const person=between(between(point(284,778),point(193,602),unfold),point(220,252),collect);
  const cMark=ease(t,66.7,68),mReveal=ease(t,68.15,69.45)*(1-ease(t,72.45,73.15)),who=ease(t,69.4,70.9);
  return <g opacity={hold(t,65.7,109.4,.65)}>
    <g opacity={collect}>
      <rect x={76} y={167} width={928} height={714} rx={13} fill="#1c282b" stroke={ink.entity} strokeWidth={2}/>
      <Label x={375} y={220} color={ink.entity}>SELECTED CONTEXT</Label>
      <Words x={375} y={275} size={40} prose>Three passages with their sources</Words>
      <path d="M97 325H984" stroke={ink.rule}/>
    </g>
    <g opacity={mReveal}>
      <MentionNode id={context.entry.id} center={point(284,589)} opacity={1} light={mReveal}/>
      <Wire a={point(284,615)} b={point(284,703)} draw={who} pulse={ease(t,69.4,70.8)}/>
    </g>
    {records.map((r,i)=>{
      const intro=[66.05,75,82.1][i],visible=ease(t,intro,intro+1.4);
      const graphY=385+i*180,finalY=406+i*173;
      const card=between(point(459,graphY),point(296,finalY),collect);
      const initialCard=point(scale(754,card.x,ease(t,72.6,74.05)),scale(649,card.y,ease(t,73.95,75.55)));
      const st=i===0?initialCard:card;
      const plateOpacity=i===0?ease(t,70.85,72.15):visible;
      const growth=i===0?ease(t,72.6,74.15):1;
      const dest=between(point(600,graphY-75),point(548,finalY-68),collect);
      const src=i===0?between(point(76,309),dest,growth):dest;
      const w=i===0?scale(928,scale(404,433,collect),growth):scale(404,433,collect);
      const h=i===0?scale(191,143,growth):143;
      const m=inRange(r.source).find(ref=>ref.entity===context.entry.entity)!;
      const pulse=ease(t,intro+1.25,intro+2.55);
      const marks=[
        {range:m,draw:i===0?cMark:pulse,color:ink.entity,
          gutter:true,to:i===0 && unfold<.03 && t>68?point(284-src.x,562-src.y):undefined},
        {range:r.expression,draw:i===0?ease(t,67.65,68.75):pulse,color:ink.narrative},
      ];
      const radius=scale(111,155,collect);
      const docCenter=point(src.x+w/2,src.y+h/2);
      const start=rectanglePort(st,docCenter,radius,49),end=rectanglePort(docCenter,st,w/2,h/2);
      return <g key={r.source.id} data-record={r.kind+'/'+r.source.doc}>
        <g opacity={plateOpacity*(1-collect)}>
          <Wire a={point(person.x+99,person.y+(i-1)*24)} b={point(st.x-radius,st.y)}
            color={ink.narrative} draw={i===0?who:visible} pulse={ease(t,[71,75.7,82.7][i],[72,77,84.1][i])}/>
        </g>
        <g opacity={plateOpacity}>
          <path d={`M${start.x} ${start.y} L${end.x} ${end.y}`} stroke={ink.entity}
            strokeWidth={2.5} strokeDasharray="7 6" fill="none"/>
          <g transform={`translate(${st.x} ${st.y})`}>
            <StatementPlate width={radius*2} label={r.kind.toUpperCase()+' STATEMENT · '+r.source.doc} title={r.title} titleSize={31}/>
            <Words x={0} y={79} center size={25} color={ink.grey}>{r.kind==='Trait'?r.credit:'To '+r.credit}</Words>
          </g>
        </g>
        <g opacity={visible}>
          <Passage doc={r.source.doc} x={src.x} y={src.y} w={w} h={h}
            size={scale(43,26,growth)} baseline={scale(93,79,growth)} leading={scale(57,40,growth)}
            caption={i===0 && growth<.55?'RETRIEVED CHUNK C · FICTIONAL ACCOUNT':i===0?'VIA SIMILARITY':'VIA GRAPH'}
            derived={i===0 && growth<.55} marks={marks}/>
        </g>
      </g>;
    })}
    <EntityNode entity={napoleon} center={person} opacity={who} light={ease(t,70,71)}/>
    <g opacity={hold(t,86.4,92.8,.5)}>
      <Label x={76} y={870} size={21}>OPTIONAL FILTER · BY OBSERVER OR ANNOTATED RANGE</Label>
    </g>
    <g opacity={collect}>
      <Words x={345} y={313} size={23} color={ink.grey}>Subject of both traits · Issuer of the order</Words>
      <Words x={552} y={857} size={23}>Action · {names[order.action]}　 Time · {wording(order.time)}</Words>
    </g>
  </g>;
}
