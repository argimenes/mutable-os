import React from 'react';
import {Html5Audio,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {Bookend,SeriesPlate,Caption} from '../../shared/SeriesPlate';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {Constellation,NameTest,Vocabulary,FixedTarget} from './discovery';
import {Many,Ambiguity,Compose,Cumulative} from './authoring';
import episode from './metadata.json';
import scenes from './scenes.json';

export function WhatsInAName(){
  const t=useCurrentFrame()/useVideoConfig().fps,volume='Volume '+episode.volume;
  return <>
    <Html5Audio src={staticFile(episode.id+'.m4a')}/>
    <SeriesPlate number={episode.number} seriesAttribution productBranding={false}>
      {t<3.15&&<Bookend lead={episode.title} emphasis={episode.subtitle} leadSize={88} emphasisSize={54}
        volumeLabel={volume} spread={ease(t,0,2)} opacity={1-ease(t,2.45,3.1)}/>}
      {t>=2.65&&t<16.2&&<Constellation t={t}/>}
      {t>=15.7&&t<35.25&&<NameTest t={t}/>}
      {t>=34.75&&t<63.25&&<Vocabulary t={t}/>}
      {t>=62.75&&t<94.2&&<FixedTarget t={t}/>}
      {t>=93.7&&t<129.32&&<Many t={t}/>}
      {t>=128.75&&t<145.25&&<Ambiguity t={t}/>}
      {t>=144.75&&t<180.35&&<Compose t={t}/>}
      {t>=179.75&&t<202.4&&<Cumulative t={t}/>}
      {t>=201.7&&t<208.3&&<Constellation t={t} closing/>}
      <path d="M76 904H1004" stroke={ink.rule} strokeWidth={1.5} opacity={hold(t,2.7,208.15,.6)}/>
      {scenes.filter(s=>s.caption).map(s=><Caption key={s.id} text={s.id==='names'?['Different expressions can identify','the same person.']:s.id==='discovery'?['Earlier language opens a new route','to the person.']:s.caption}
        opacity={hold(t,s.start||2.85,s.start+s.duration,.5)}/>)}
      {t>=207.75&&<g opacity={ease(t,207.75,208.65)}>
        <Bookend lead="Many expressions." emphasis="Shared identities." leadSize={76} emphasisSize={79}
          volumeLabel={volume} opacity={1} spread={1-ease(t,208,213.8)}/>
        <text x={540} y={864} textAnchor="middle" fontFamily={type.serif} fontSize={41} fill={ink.cream}
          opacity={ease(t,214.7,215.4)}>Write naturally. Connect semantically.</text>
      </g>}
    </SeriesPlate>
  </>;
}
