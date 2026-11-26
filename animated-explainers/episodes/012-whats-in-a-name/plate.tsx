import React,{useLayoutEffect,useRef,useState} from 'react';
import {ink,type} from '../../theme';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {measureSpan,type Span} from '../../shared/TextRun';
import {EntityNode,point,type Point} from '../006-where-text-meets-the-graph/graph';
import {Label,Words,Wire} from '../011-rags-to-riches/art';
import {person,type Block,type Target} from './model';
export {Label,Words,Wire,point};
export function Person({x,y,name=person.name,id=person.id,lit=0}:{x:number;y:number;name?:string;id?:string;lit?:number}){
  return <EntityNode entity={{id,name:[name]}} center={point(x,y)} opacity={1} light={lit}/>;
}
export function Frame({x=76,y,w=928,h,id,heading}:{x?:number;y:number;w?:number;h:number;id:string;heading:string}){
  return <g><DocumentFrame id={id} x={x} y={y} width={w} height={h}/>
    <Label x={x+20} y={y+31} size={20}>{heading}</Label></g>;
}
type Mark={range:Target;select?:number;annotate?:number;to?:Point;edge?:number;link?:number;returnTo?:Point;tether?:Point};
export function Source({source,x,y,size=37,leading=45,mark}:{source:Block;x:number;y:number;size?:number;leading?:number;mark?:Mark}) {
  const ref=useRef<SVGTextElement>(null);
  const [span,setSpan]=useState<Span>();
  const range=mark?.range;
  useLayoutEffect(()=>{
    if(range)setSpan(measureSpan(ref.current!,range.start,range.end));
  },[source,range?.start,range?.end,size,x]);
  let n=0;
  const row=source.lines.findIndex(s=>{n+=s.length;return (range?.start??0)<n;});
  const baseline=y+row*leading,select=mark?.select??0,annotate=mark?.annotate??0;
  const start=span?.left??x,end=span?.right??x;
  return <g data-block={source.id}>
    {range&&span&&<>
      <g data-selection={range.id} opacity={select} fill={ink.grammar}>
        <rect x={start-3} y={baseline-size*.86} width={end-start+6} height={size*1.12} rx={3} opacity={.24}/>
        <path d={`M${start-3} ${baseline-size*.86}v${size*1.12} M${end+3} ${baseline-size*.86}v${size*1.12}`} stroke={ink.grammar} strokeWidth={2}/>
      </g>
      {mark?.tether&&<path d={`M${start} ${baseline+10} H${x-10} V${mark.tether.y-16} Q${x-10} ${mark.tether.y} ${x+5} ${mark.tether.y} H${mark.tether.x}`}
        fill="none" stroke={ink.grammar} strokeDasharray="6 6" strokeWidth={2} opacity={select}/>}
      {mark?.returnTo&&<path d={`M${end} ${baseline+10} H974 Q985 ${baseline+10} 985 ${baseline+22} V${mark.returnTo.y-26} Q985 ${mark.returnTo.y-12} 970 ${mark.returnTo.y-12} H${mark.returnTo.x+10} Q${mark.returnTo.x} ${mark.returnTo.y-12} ${mark.returnTo.x} ${mark.returnTo.y}`}
        fill="none" stroke={ink.entity} strokeWidth={2} pathLength={1} strokeDasharray="1" strokeDashoffset={1-annotate} opacity={annotate}/>}
      {mark?.to&&<path d={`M${end} ${baseline+10} H${mark.edge??end} C${(mark.edge??end)+35} ${baseline+10} ${mark.to.x-45} ${mark.to.y} ${mark.to.x} ${mark.to.y}`}
        fill="none" stroke={ink.entity} strokeWidth={2.5} opacity={(mark.link??annotate)*.83}
        pathLength={1} strokeDasharray="1" strokeDashoffset={1-(mark.link??annotate)}/>}
      <g data-annotation={range.id} opacity={annotate}><RangeUnderline span={span} y={baseline+10} color={ink.entity} draw={annotate}/></g>
    </>}
    <text data-prose="" ref={ref} xmlSpace="preserve" style={{whiteSpace:'pre'}} fontSize={size} fontFamily={type.serif} fill={ink.cream}>
      {source.lines.map((s,i)=><tspan key={i} x={x} y={y+i*leading}>{s}</tspan>)}
    </text>
  </g>;
}
export const typed=(words:string,t:number,start:number,duration:number)=>words.slice(0,Math.floor(words.length*Math.max(0,Math.min(1,(t-start)/duration))));
export function FieldBox({x=76,y,w=928,query,label,active=true}:{x?:number;y:number;w?:number;query:string;label:string;active?:boolean}){
  return <g data-query={query}>
    <rect x={x} y={y} width={w} height={106} rx={6} fill="#253034" stroke={active?ink.narrative:ink.grey} strokeWidth={2}/>
    <Label x={x+20} y={y+29} size={20} color={ink.narrative}>{label}</Label>
    <Words x={x+20} y={y+81} size={37}>{query}{active&&<tspan fill={ink.narrative}>│</tspan>}</Words>
  </g>;
}
export function Decision({x,y,text,progress}:{x:number;y:number;text:string;progress:number}){
  return <g opacity={progress}><circle cx={x} cy={y-9} r={14} fill={ink.entity}/>
    <path d={`M${x-7} ${y-9}l5 5 9 -10`} fill="none" stroke={ink.paper} strokeWidth={3}/>
    <Words x={x+25} y={y} size={28} color={ink.entity}>{text}</Words></g>;
}
export function switchTerm(t:number,stages:{at:number;q:string}[],time=1.2){
  const i=stages.reduce((last,s,k)=>t>=s.at?k:last,0);
  return {...stages[i],i,text:typed(stages[i].q,t,stages[i].at,time)};
}
