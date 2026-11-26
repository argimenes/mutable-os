import React,{useLayoutEffect,useRef,useState} from 'react';
import {ink,type} from '../../theme';
import {DocumentFrame} from '../../shared/DocumentFrame';
import {RangeUnderline} from '../../shared/AnnotationLayer';
import {measureSpan,type Span} from '../../shared/TextRun';
import {Link,point,between,type Point} from '../006-where-text-meets-the-graph/graph';
import {question,texts,type Doc,type Target} from './model';

export function Label({x,y,children,size=23,color=ink.grey,center=false}:{x:number;y:number;children:React.ReactNode;size?:number;color?:string;center?:boolean}) {
  return <text x={x} y={y} textAnchor={center?'middle':'start'} fontFamily={type.mono} fontSize={size} fill={color}>{children}</text>;
}
export function Words({x,y,children,size=34,center=false,color=ink.cream,prose=false}:{x:number;y:number;children:React.ReactNode;size?:number;center?:boolean;color?:string;prose?:boolean}) {
  return <text x={x} y={y} textAnchor={center?'middle':'start'} fontFamily={prose?type.serif:type.sans} fontSize={size} fill={color}>{children}</text>;
}
export const scale=(a:number,b:number,p:number)=>a+(b-a)*p;

export function Wire({a,b,draw=1,pulse,color=ink.entity,bend=0}:{a:Point;b:Point;draw?:number;pulse?:number;color?:string;bend?:number}) {
  const u=between(a,b,.34),v=between(a,b,.66);
  return <Link curve={[a,point(u.x,u.y+(a.y-u.y)*bend),point(v.x,v.y+(b.y-v.y)*bend),b]} color={color} draw={draw} pulse={pulse}/>;
}
export function Vector({x,y,alternate=false}:{x:number;y:number;alternate?:boolean}) {
  const heights=alternate?[18,40,29,14,35,23,42,26,16,31,37,21]:[31,18,38,21,42,31,14,26,35,17,29,40];
  return <g transform={`translate(${x} ${y})`} fill={ink.entity}>
    {heights.map((h,i)=><rect key={i} x={i*9} y={-h/2} width={5} height={h} rx={2}/>)}
  </g>;
}
export function Question() {
  const split=question.indexOf('Napoleon');
  return <g aria-label={question}><Words x={76} y={209} size={43} prose>{question.slice(0,split).trimEnd()}</Words>
    <Words x={76} y={263} size={43} prose>{question.slice(split)}</Words>
    <Label x={805} y={262} size={19}>FICTIONAL CORPUS</Label></g>;
}

// A sentence stays in one shaped SVG element. The trailing wrap spaces keep
// its UTF-16 character offsets identical to those in the source document.
const lines:Record<Doc,string[]>={A:['Napoleon examined the map. ','He pointed towards the river. ','The officers prepared to depart.'],
  B:[texts.B],C:['Our commander was decisive ','in the face of uncertainty.'],
  D:['He was reckless when ','confronted with opposition.'],E:['Bonaparte ordered the troops ','to advance before dawn.'],
  F:['The Emperor was renowned ','for his military leadership.']};
export type Mark={range:Target;color:string;draw:number;lane?:number;to?:Point;gutter?:boolean};
export function Passage({doc,x,y,w,h,size,caption,marks=[],derived=false,baseline=80,leading=42}:{doc:Doc;x:number;y:number;w:number;h:number;size:number;
  caption:string;marks?:Mark[];derived?:boolean;baseline?:number;leading?:number}) {
  const ref=useRef<SVGTextElement>(null);
  const [spans,setSpans]=useState<Record<string,Span>>({});
  const key=marks.map(m=>[m.range.id,m.range.start,m.range.end].join('/')).join('|');
  useLayoutEffect(()=>{
    const span:Record<string,Span>={};
    for(const {range} of marks)span[range.id]=measureSpan(ref.current!,range.start,range.end);
    setSpans(span);
  },[key,doc,size]);
  const lineOf=(start:number)=>{
    let offset=0;
    return lines[doc].findIndex(line=>{offset+=line.length;return start<offset;});
  };
  return <g data-source={doc} transform={`translate(${x} ${y})`}>
    {derived?<rect width={w} height={h} rx={8} fill="#1d2c30" stroke={ink.entity} strokeWidth={2} strokeDasharray="9 6"/>:
      <DocumentFrame x={0} y={0} width={w} height={h} id={doc}/>}
    <Label x={18} y={31} size={w<500?18:22} color={derived?ink.entity:ink.grey}>{caption}</Label>
    <text ref={ref} data-passage="" xmlSpace="preserve" style={{whiteSpace:'pre'}} fontFamily={type.serif} fontSize={size} fill={ink.cream}>
      {lines[doc].map((line,i)=><tspan key={i} x={18} y={baseline+leading*i}>{line}</tspan>)}
    </text>
    {marks.map(({range,color,draw,lane=0,to,gutter})=>{
      const span=spans[range.id];
      if(!span)return null;
      const y=baseline+lineOf(range.start)*leading+8+lane*8;
      return <g key={range.id} data-mark={range.id}>
        {to && <path d={gutter?`M${span.left} ${y} H8 V${h+10} Q8 ${h+20} ${to.x} ${to.y}`:
          `M${span.left} ${y} Q${span.left} ${y+28} ${to.x} ${to.y}`} fill="none"
          stroke={color} strokeWidth={1.8} strokeDasharray="5 6" opacity={draw*.78}/>}
        <RangeUnderline span={span} y={y} color={color} draw={draw}/></g>;
    })}
  </g>;
}
