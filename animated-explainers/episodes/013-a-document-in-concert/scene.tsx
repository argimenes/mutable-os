import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {SeriesPlate,Bookend,Caption} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {Opening,Survey} from './inventories';
import {Readings} from './reading';
import episode from './metadata.json';
import scenes from './scenes.json';

export function ADocumentInConcert(){
  const t=useCurrentFrame()/useVideoConfig().fps,volume='Volume '+episode.volume;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<3.2&&<Bookend lead={episode.title} emphasis={episode.subtitle} leadSize={79} emphasisSize={42}
        volumeLabel={volume} spread={ease(t,0,2)} opacity={1-ease(t,2.4,3.15)}/>}
      {t>=2.4&&t<46&&<Opening t={t}/>}
      {t>=45.9&&t<77&&<Survey t={t}/>}
      {t>=76.9&&t<215.3&&<Readings t={t}/>}
      <path d="M76 904H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.7,215.3,.55)}/>
      {scenes.map(s=><Caption key={s.id} text={s.caption} opacity={hold(t,s.start||2.8,s.start+s.duration,.5)}/>)}
      {t>=214.7&&<g opacity={ease(t,214.7,215.6)}>
        <Bookend lead="One document." emphasis="Many readings." leadSize={85} emphasisSize={85}
          volumeLabel={volume} opacity={1} spread={1-ease(t,215,219.8)}/>
        <text x={540} y={866} textAnchor="middle" fontFamily={type.serif} fill={ink.cream} fontSize={40}
          opacity={ease(t,218.6,219.7)}>Change the perspective, not the text.</text>
      </g>}
    </SeriesPlate>
  </>;
}
