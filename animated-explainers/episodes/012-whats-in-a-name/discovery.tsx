import React from 'react';
import {ink} from '../../theme';
import {ease,hold} from '../../shared/motion';
import {Label,Words,Person,FieldBox,Decision,Frame,Source,Wire,point,switchTerm} from './plate';
import {block,target,biographical,pinned,person,expressions,history,lecture,newMention,lookup,type Field} from './model';

export function Constellation({t,closing=false}:{t:number;closing?:boolean}){
  const start=closing?201.7:2.65,age=t-start;
  const items=closing?[
    ['Writing notes','I returned to Lewis Carroll.','Lewis Carroll'],
    ['Oxford notebook','At Oxford, Dodgson prepared a lesson.','Dodgson'],
    ['Biographical sketch','The mathematician also developed …','The mathematician'],
    ['Writing notes','My notes call him the author of Alice.','the author of Alice'],
  ]:expressions.map(s=>['',s,s]);
  const reveal=ease(age,closing?.3:4.5,closing?1.4:6.7);
  return <g opacity={hold(t,start,closing?208.3:16.2,.65)}>
    <Label x={76} y={220}>{closing?'A PERSON ACROSS DOCUMENTS':'WAYS OF REFERRING TO ONE PERSON'}</Label>
    {items.map(([context,s,phrase],i)=>{
      const y=(closing?340:315)+i*(closing?139:115);
      const show=ease(age,closing?i*.2:i*.78,(closing?i*.2:i*.78)+.65);
      const link=ease(age,(closing?1:6)+i*.35,(closing?2:7)+i*.35);
      const excerpt=block(context||'Opening','expression-'+i,[s]);
      return <g key={s} opacity={show}>
        {context&&<Label x={97} y={y-38} size={20}>{context.toUpperCase()}</Label>}
        <Source source={excerpt} x={97} y={y+8} size={closing?31:s.length>21?39:44}
          mark={{range:target(excerpt,phrase),annotate:link,to:point(746,550+(i-2)*16),edge:closing?655:600,link}}/>
      </g>;
    })}
    <g opacity={reveal}><Person x={850} y={550} lit={reveal}/></g>
  </g>;
}

export function NameTest({t}:{t:number}){
  const trial=hold(t,26.8,32.5,.65), restored=ease(t,32,33.1);
  const name=t<21.7?'Lewis Carroll':t<25.1?'The mathematician':'the author';
  return <g opacity={hold(t,15.7,35.25,.55)}>
    <Frame id="01" heading="BIOGRAPHICAL SKETCH" y={179} h={344}/>
    <Source source={biographical} x={103} y={267} size={37} leading={49} mark={{range:pinned,select:restored*.8}}/>
    <g opacity={1-trial}>
      <FieldBox x={76} y={587} w={531} label="EXACT NAME LOOKUP" query={name} active={false}/>
      <Wire a={point(608,639)} b={point(731,639)} color={ink.grey}/>
      {name===person.name?<Person x={848} y={639}/>:<g><Label x={753} y={638} size={23}>NO NAME MATCH</Label>
        <Words x={750} y={685} size={24} color={ink.grey}>Lewis Carroll on file</Words></g>}
      <Words x={76} y={810} size={32} prose>{restored>.5?'The original phrasing stays on the page.':'What does the exact name recover?'}</Words>
    </g>
    <g opacity={trial}>
      <Label x={76} y={602} color={ink.grammar}>A POSSIBLE REWORDING</Label>
      <Words x={76} y={682} size={36} prose>Lewis Carroll also developed an interest in photography.</Words>
      <Words x={76} y={762} size={29} color={ink.grey}>The writer already chose “The mathematician”.</Words>
    </g>
  </g>;
}

export function Vocabulary({t}:{t:number}){
  const stage=switchTerm(t,[{at:35.4,q:person.name},{at:40.5,q:person.aliases[0]},{at:45.65,q:'The mathematician'},
    {at:50.2,q:'Mr Dodgson'}]);
  const field:Field=stage.i===0?'Name':stage.i===1?'Alias':'Mentions';
  const first=1-ease(t,53.1,54.1),write=ease(t,53.4,54.4),bound=ease(t,56.7,58);
  const rows=[['CANONICAL NAME',person.name],['FORMAL ALIAS',person.aliases[0]],['PREVIOUS MENTIONS',history.map(m=>m.range.phrase).join(' · ')]];
  return <g opacity={hold(t,34.75,63.25,.6)}>
    <g opacity={first}>
      <FieldBox y={178} query={stage.text} label={'SCRY  /  '+field.toUpperCase()}/>
      {rows.map(([label,value],i)=>{
        const y=362+i*155,hot=(stage.i<2?stage.i:2)===i;
        return <g key={label} opacity={hot?1:.57}>
          <rect x={76} y={y-15} width={562} height={i===2?168:119} fill={hot?'#293437':'#202a2d'} rx={5} stroke={hot?ink.entity:ink.rule} strokeWidth={2}/>
          <Label x={96} y={y+16} size={20} color={hot?ink.entity:ink.grey}>{label}</Label>
          {i<2?<Words x={96} y={y+77} size={34} prose>{value}</Words>:
            history.map((m,j)=><Words key={m.id} x={96} y={y+61+j*37} size={29} prose>{m.range.phrase}</Words>)}
          {hot&&lookup(stage.text,field).length>0&&<Wire a={point(639,y+48)} b={point(741,554)} draw={ease(t,stage.at+.45,stage.at+1.7)} bend={.5}/>}
        </g>;
      })}
      <Person x={853} y={554} lit={1}/>
    </g>
    <g opacity={write}>
      <Frame id="03" heading="LECTURE NOTES" y={214} h={184}/>
      <Source source={lecture} x={101} y={330} size={40} mark={{range:newMention.range,select:1-bound,annotate:bound}}/>
      <Label x={76} y={495}>AUTHOR’S CHOICE</Label>
      <Words x={76} y={567} size={43} prose>the Oxford lecturer</Words>
      <Wire a={point(463,555)} b={point(734,555)} draw={bound}/><Person x={848} y={555}/>
      <Decision x={107} y={730} text="Mention added to the lecture notes" progress={bound}/>
      <Words x={82} y={802} size={29} color={ink.grey}>Live document mentions · the Oxford lecturer</Words>
    </g>
  </g>;
}

const queries=[{at:64.6,q:pinned.phrase},{at:72.4,q:'Dodgson'},{at:76.6,q:person.aliases[0]},{at:80.7,q:person.name}];
export function FixedTarget({t}:{t:number}){
  const change=switchTerm(t,queries,1.05),field:Field=change.i===0?'Mentions':'Names and aliases';
  const results=lookup(change.text,field),commit=ease(t,86.25,87.65);
  const fixed=ease(t,63.8,65);
  return <g opacity={hold(t,62.75,94.2,.6)}>
    <Frame id="01" heading="BIOGRAPHICAL SKETCH" y={173} h={305}/>
    <Source source={biographical} x={104} y={250} size={33} leading={45}
      mark={{range:pinned,select:fixed*(1-commit),annotate:commit,tether:point(310,512),returnTo:point(849,662)}}/>
    <g opacity={fixed}>
      <FieldBox y={520} w={928-328*commit} query={change.text} label={'SCRY  /  '+field.toUpperCase()} active={commit<.5}/>
      <g opacity={1-commit}>
        <Label x={76} y={691} size={20}>MATCHING ENTITIES</Label>
        {results.map((r,i)=><g key={r.person.id} data-result={r.person.id}>
          <rect x={76} y={710+i*79} width={928} height={66} fill="#253033" stroke={ink.rule} rx={5}/>
          <Words x={95} y={754+i*79} size={34} prose>{r.person.name}</Words>
          <Words x={430} y={753+i*79} color={ink.grey} size={25}>{r.kind} · {r.form}</Words>
        </g>)}
      </g>
      <g opacity={commit}>
        <Decision x={102} y={748} text="Bind the original range to this person" progress={1}/>
        <Wire a={point(595,737)} b={point(734,737)} draw={commit}/>
        <Person x={849} y={737}/>
      </g>
    </g>
  </g>;
}
