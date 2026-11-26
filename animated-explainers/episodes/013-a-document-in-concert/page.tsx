import React,{useLayoutEffect,useRef,useState} from 'react';
import {ink,type} from '../../theme';
import {measureSpan,type Span} from '../../shared/TextRun';
import {Label,Words} from '../011-rags-to-riches/art';
import {contains,entities,layout,normalHeight,type Entity,type Passage} from './document';

// Coordinates stay local to one shaped line as the block and the sheet move.
type SheetProps = {
  x:number; y:number; zoom?:number; focus?:Entity; fold?:number; active?:Entity; traced?:number;
  marks?:number; light?:number; reader?:number; section?:string;
  linkTo?:(id:Entity)=>{x:number;y:number}|undefined; links?:number;
};
const width=678;
function Line({block,marks,light,active,links,endpoint}:{block:Passage;marks:number;light:number;active?:Entity;links:number;endpoint:(id:Entity)=>{x:number;y:number}|undefined}){
  const ref=useRef<SVGTextElement>(null);
  const [spans,setSpans]=useState<Record<string,Span>>({});
  useLayoutEffect(()=>{
    const measured:Record<string,Span>={};
    for(const r of block.ranges)measured[r.id]=measureSpan(ref.current!,r.start,r.end);
    setSpans(measured);
  },[block]);
  return <>
    {block.ranges.map(r=>{
      const span=spans[r.id];
      if(!span)return null;
      const lit=active===r.entity?light:0;
      const point=links>0?endpoint(r.entity):undefined;
      return <g key={r.id} data-range={r.id} data-light={lit}>
        {point&&<path d={`M${span.right} 48 H648 C685 48 ${point.x-22} ${point.y} ${point.x} ${point.y}`}
          fill="none" stroke={ink.entity} strokeWidth={1.8} opacity={links*.83} pathLength={1} strokeDasharray="1" strokeDashoffset={1-links}/>}
        <rect x={span.left-2} y={17} width={span.right-span.left+4} height={32} rx={3} fill={ink.grammar} opacity={.32*lit}/>
        <g stroke={ink.entity} fill={ink.entity} opacity={marks}>
          <path d={`M${span.left} 48H${span.right}`} strokeWidth={1.7}/>
          {[span.left,span.right].map(x=><circle key={x} cx={x} cy={48} r={2.5}/>)}
        </g>
      </g>;
    })}
    <text data-prose="" ref={ref} x={57} y={42} fontFamily={type.serif} fontSize={29} fill={ink.cream}>{block.text}</text>
  </>;
}
export function Sheet({x,y,zoom=1,focus,fold=0,active,traced=Infinity,marks=.76,light=0,reader=-3,section,linkTo,links=0}:SheetProps){
  const rows=layout(focus,fold),last=rows[rows.length-1],height=last.y+last.height+14;
  return <g data-sheet="01" transform={`translate(${x} ${y}) scale(${zoom})`}>
    <rect width={width} height={height} rx={6} fill="#202c30" stroke={ink.grey} strokeWidth={2}/>
    <path d="M16 50H662" stroke={ink.rule}/>
    <Words x={20} y={36} size={29} prose>A life in five sections</Words>
    <Label x={506} y={34} size={19}>DOCUMENT 01</Label>
    {rows.map(({block,y:rowY,height},i)=>{
      const proportion=height/normalHeight;
      const selected=block.section===section;
      const visited=rows.slice(0,i+1).filter(row=>contains(row.block,active)).length<=traced;
      const reading=Math.max(0,1-Math.abs(i-reader));
      return <g data-block={block.id} data-height={height} data-y={rowY} key={block.id} transform={`translate(0 ${rowY})`}>
        <g transform={`scale(1 ${proportion})`} opacity={Math.min(1,proportion*2)}>
          <rect x={7} width={width-14} height={normalHeight} fill={ink.narrative} opacity={selected?.19:0}/>
          <path d="M10 4V48" stroke={ink.grammar} strokeWidth={5} opacity={reading}/>
          <Label x={19} y={41} size={19} color={reading>.3?ink.grammar:ink.grey}>{block.id}</Label>
          {i%2===0&&<Label x={57} y={14} size={15} color={ink.grey}>{block.section.toUpperCase()}</Label>}
          <Line block={block} marks={marks} active={active} light={visited?light:0} links={links} endpoint={id=>{
            const point=linkTo?.(id);
            return point&&{x:(point.x-x)/zoom,y:(point.y-y)/zoom-rowY};
          }}/>
          <path d="M17 54H661" stroke={ink.rule} opacity={.5}/>

        </g>
      </g>;
    })}
  </g>;
}
export function IndexStrip({x,y,active,light=1}:{x:number;y:number;active?:Entity;light?:number}){
  return <g transform={`translate(${x} ${y})`}>
    <Label x={0} y={0} size={20}>POSITIONS IN THE FULL DOCUMENT</Label>
    {layout().map(({block},i)=>{
      const lit=contains(block,active);
      return <g key={block.id} transform={`translate(${i*58} 15)`}>
        <rect width={50} height={38} rx={3} fill={lit?ink.grammar:ink.rule} opacity={lit?.78*light+.12:.24}/>
        <Label x={25} y={26} size={20} center color={lit?ink.paper:ink.grey}>{block.id}</Label>
      </g>;
    })}
  </g>;
}
export function Subject({x,y,id}:{x:number;y:number;id:Entity}){
  return <g><ellipse cx={x} cy={y} rx={110} ry={55} fill="#302b25" stroke={ink.grammar} strokeWidth={2}/>
    <Label x={x} y={y-8} center size={17} color={ink.grammar}>ENTITY</Label>
    <Words x={x} y={y+26} center size={31} prose>{entities[id].name}</Words></g>;
}
