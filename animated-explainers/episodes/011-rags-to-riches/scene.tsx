import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Bookend,SeriesPlate,Caption} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {EntityNode,point} from '../006-where-text-meets-the-graph/graph';
import {Label,Words,Question,Wire,Passage} from './art';
import {Boundaries,Enrichment} from './preparation';
import {ConnectedChunk,Similarity} from './retrieval';
import {context,names,napoleon,serialise} from './model';
import episode from './metadata.json';
import scenes from './scenes.json';

function Generation({t}:{t:number}){
  const printed=ease(t,112.65,113.85), [officer,aide]=context.judgements;
  return <g opacity={hold(t,108.7,120.25,.5)}>
    <Question/>
    <g data-serialisation=""><title>{serialise(context)}</title>
    <rect x={76} y={359} width={453} height={169} rx={8} fill="#213235" stroke={ink.entity} strokeWidth={2}/>
    <Label x={97} y={401} color={ink.entity}>SERIALISED CONTEXT</Label>
    <Words x={97} y={458} size={33} prose>Evidence {context.sources.map(s=>s.doc).join(' · ')}</Words>
    <Words x={97} y={499} size={25}>Entities, statements and sources</Words>
    </g>
    <Wire a={point(533,446)} b={point(704,446)} pulse={ease(t,110.1,111.55)}/>
    <path d="M769 281V380" stroke={ink.grey} strokeDasharray="6 6" fill="none" strokeWidth={2}/>
    <Label x={785} y={334} size={20}>QUESTION</Label>
    <rect x={705} y={382} width={298} height={126} rx={9} fill="#242b31" stroke={ink.cream} strokeWidth={2}/>
    <Words x={854} y={455} center size={31}>Language model</Words>
    <g opacity={printed}>
      <Wire a={point(854,509)} b={point(854,586)} draw={printed}/>
      <rect x={76} y={588} width={928} height={253} fill="#232a2e" stroke={ink.grey} rx={7}/>
      <Label x={99} y={633} size={23}>ILLUSTRATIVE RESPONSE</Label>
      <Words x={99} y={696} size={38} prose>The accounts differ in their judgements.</Words>
      <Words x={99} y={754} size={33} prose>{names[officer.observer]} calls him {names[officer.concept].toLowerCase()}.</Words><Label x={837} y={754}>DOC {officer.source.doc}</Label>
      <Words x={99} y={805} size={33} prose>{names[aide.observer]} describes him as {names[aide.concept].toLowerCase()}.</Words><Label x={837} y={805}>DOC {aide.source.doc}</Label>
    </g>
  </g>;
}
export function RagsToRiches() {
  const t=useCurrentFrame()/useVideoConfig().fps,volume='Volume '+episode.volume;
  const question=hold(t,50.85,93.3,.6),finish=ease(t,123.85,125.4);
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number="011" seriesAttribution productBranding={false}>
      {t<3 && <Bookend lead={episode.title} emphasis={episode.subtitle} leadSize={92} emphasisSize={61}
        volumeLabel={volume} spread={ease(t,0,1.8)} opacity={1-ease(t,2.2,2.9)}/>}
      {t>=2.3 && t<23.25 && <Boundaries t={t}/>}
      {t>=22.85 && t<51.3 && <Enrichment t={t}/>}
      {question>0 && <g opacity={question}><Question/></g>}
      {t>=51.05 && t<66.25 && <Similarity t={t}/>}
      {t>=65.7 && t<109.4 && <ConnectedChunk t={t}/>}
      {t>=108.7 && t<120.25 && <Generation t={t}/>}
      <path d="M76 904H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.65,120.25,.55)}/>
      {scenes.filter(s=>s.caption).map(s=><Caption key={s.id} text={s.id==='enrich'?['One passage to read.','A derived representation to embed.']:s.caption}
        opacity={hold(t,s.start||2.7,s.start+s.duration,.45)}/>)}
      {t>=119.8 && <g opacity={ease(t,119.8,120.55)}>
        <Bookend lead="" emphasis="" volumeLabel={volume} opacity={1} spread={1-ease(t,124,129)} folioOpacity={finish}/>
        <g textAnchor="middle" fontFamily={type.serif}>
          <text x={540} y={679} fontSize={68} fill={ink.cream} opacity={1-ease(t,123.8,124.6)}>A chunk is not an island.</text>
          <g opacity={ease(t,124.6,125.5)}>
            <text x={540} y={679} fontSize={68} fill={ink.cream}>A fragment of text can be</text>
            <text x={540} y={782} fontSize={48} fill={ink.entity} fontStyle="italic">a doorway into a network of knowledge.</text>
          </g>
        </g>
        {finish<1 && <g opacity={1-finish}>
          <Passage doc="C" x={196} y={203} w={688} h={143} caption="RETRIEVED CHUNK C" size={31} derived
            baseline={78} leading={40} marks={[{range:context.entry,draw:1,color:ink.entity}]}/>
          <Wire a={point(540,347)} b={point(540,394)}/>
          <EntityNode entity={napoleon} center={point(540,466)} opacity={1} light={0}/>
        </g>}
      </g>}
    </SeriesPlate>
  </>;
}
