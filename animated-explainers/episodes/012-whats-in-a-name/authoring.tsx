import React from 'react';
import {ease,hold} from '../../shared/motion';
import {ink,type} from '../../theme';
import {Label,Words,Person,FieldBox,Decision,Frame,Source,Wire,point,typed} from './plate';
import {paragraphs,batch,reviewed,person,people,block,target,complete,current,lecture,newMention,lookup,history} from './model';

const enter=[96,106.3,108.3,110.3];
export function Many({t}:{t:number}){
  const prepared=ease(t,101.6,103.2),commit=ease(t,120.65,122.2);
  const count=enter.filter(n=>t>=n+.42).length;
  const state=t<101.6?'Select the first occurrence':t<105?'Prepare the entity':t<112.5?'Review matching occurrences':t<120.65?'Review the four targets':'Four independent mentions';
  return <g opacity={hold(t,93.7,129.32,.6)}>
    <Words x={76} y={227} size={46} prose>{state}</Words>
    <Frame id="02" x={76} y={268} w={601} h={585} heading="OXFORD NOTEBOOK"/>
    {paragraphs.map((p,i)=>{
      const y=365+i*126,chosen=ease(t,enter[i],enter[i]+.9);
      return <g key={p.id} data-mention-id={batch[i].id}>
        {i>0&&<path d={`M101 ${y-55}H652`} stroke={ink.rule} strokeOpacity={.55}/>}
        <Source source={p} x={105} y={y} size={35} leading={45} mark={{range:reviewed[i],select:chosen*(1-commit),annotate:commit,
          edge:669,to:point(755,556+(i-1.5)*18),link:ease(t,120.72+i*.14,122.9+i*.14)}}/>
      </g>;
    })}
    <g opacity={prepared}>
      <Label x={857} y={421} size={20} center>{commit>.5?'SHARED REFERENT':'PREPARED ENTITY'}</Label>
      <Person x={861} y={556} lit={commit}/>
      <Words x={853} y={694} size={27} center>{commit>.5?'4 mentions':count+' of 4 checked'}</Words>
      <g opacity={hold(t,115.1,121.7,.6)}>
        <rect x={727} y={747} width={264} height={63} rx={6} fill="#323136" stroke={ink.grammar}/>
        <Words x={859} y={788} size={26} center>Bind checked ranges</Words>
      </g>
    </g>
  </g>;
}
const examples=[
  {source:block('A','author',['Carroll wrote about Alice.']),entity:people[0],heading:'A LITERARY NOTE'},
  {source:block('B','visitor',['Carroll, my neighbour, ', 'brought a letter.']),entity:people[1],heading:'AN IMAGINED VISIT'},
];
export function Ambiguity({t}:{t:number}){
  return <g opacity={hold(t,128.75,145.25,.6)}>
    <Words x={76} y={230} size={48} prose>Who is “Carroll” here?</Words>
    {examples.map(({source,entity,heading},i)=>{
      const y=304+i*272,bound=ease(t,135.35+i*2.65,136.8+i*2.65);
      return <g key={source.id} opacity={ease(t,129.25+i*1.75,130.45+i*1.75)}>
        <Frame id={source.doc} x={76} y={y} w={584} h={210} heading={heading}/>
        <Source source={source} x={101} y={y+104} leading={48} size={37}
          mark={{range:target(source,'Carroll'),select:1-bound,annotate:bound,edge:649,to:point(740,y+100)}}/>
        <g opacity={bound}><Person x={851} y={y+102} id={entity.id} name={entity.name}/></g>
      </g>;
    })}
  </g>;
}
function Draft({prefix,phrase,mode,showMarkers,caret}:{prefix:string;phrase:string;mode:'square'|'round';showMarkers:boolean;caret:boolean}){
  return <text data-draft={mode} x={101} y={0} fontSize={43} fontFamily={type.serif} fill={ink.cream}>
    {prefix}{showMarkers&&<tspan fill={ink.narrative}>{mode==='square'?'[[':'(('}</tspan>}{phrase}
    {caret&&<tspan fill={ink.grammar}>│</tspan>}{showMarkers&&<tspan fill={ink.narrative}>{mode==='square'?']]':'))'}</tspan>}.
  </text>;
}
const partial='Dodgson',phrase='the author of Alice';
const square=complete('square',partial),round=complete('round',phrase);
const sqLine=block('05','square',['I returned to '+square.words+'.']),roundLine=block('05','round',['My notes call him '+round.words+'.']);
export function Compose({t}:{t:number}){
  const squareDone=t>=154.9,roundDone=t>=171.5;
  const second=ease(t,157.4,158.8);
  const firstDraft=typed(partial,t,147.2,1.8),nextDraft=typed(phrase,t,158.8,3);
  const search=t<157.4?firstDraft:t<163.8?nextDraft:typed(person.name,t,163.8,1.55);
  const showResult=t<157.4?ease(t,149,150):ease(t,164.75,166);
  const done=ease(t,171.45,172.7);
  return <g opacity={hold(t,144.75,180.35,.6)}>
    <Words x={76} y={228} size={46} prose>{t<157.4?'Complete with the entity’s name':t<171.5?'Keep the phrase you wrote':'Two mentions, one person'}</Words>
    <Frame y={276} h={304} heading="WRITING NOTES" id="05"/>
    <Label x={101} y={349} color={ink.grey} size={20}>SQUARE BRACKETS</Label>
    {!squareDone?<g transform="translate(0 404)"><Draft prefix="I returned to " phrase={firstDraft} mode="square" showMarkers={t>=146.35} caret={true}/></g>:
      <Source source={sqLine} x={101} y={404} size={43} mark={{range:target(sqLine,square.words),annotate:ease(t,154.9,155.8)}}/>}
    <g opacity={second}>
      <Label x={101} y={490} color={ink.grey} size={20}>DOUBLE PARENTHESES</Label>
      {!roundDone?<g transform="translate(0 547)"><Draft prefix="My notes call him " phrase={nextDraft} mode="round" showMarkers={true}
        caret={t<163.8}/></g>:<Source source={roundLine} x={101} y={547} size={43}
          mark={{range:target(roundLine,round.words),annotate:done}}/>}
    </g>
    <g opacity={1-done}>
      <FieldBox x={76} y={639} w={547} label={t<157.4?'SCRY  /  NAMES AND ALIASES':t<163.8?'SCRY  /  SOURCE PHRASE':'SCRY  /  INDEPENDENT QUERY'} query={search} active={t<154.9||t>=157.4}/>
      {showResult>0&&<g opacity={showResult}>
        <Wire a={point(624,691)} b={point(735,691)} color={ink.narrative}/>
        <Person x={848} y={691}/>
        <Label x={848} y={814} center size={19}>{squareDone&&t<157.4?'CHOSEN ENTITY':'CHOOSE ENTITY'}</Label>
      </g>}
    </g>
    <g opacity={done}>
      <Words x={76} y={701} size={33} prose>{square.words}</Words>
      <Words x={76} y={793} size={33} prose>{round.words}</Words>
      {[690,782].map(y=><Wire key={y} a={point(394,y)} b={point(735,738+(y-736)*.37)} draw={done} bend={.5}/>)}
      <Person x={848} y={738} lit={1}/>
    </g>
  </g>;
}

export function Cumulative({t}:{t:number}){
  const fresh=ease(t,188.75,190.25),indexed=ease(t,184.6,186.05);
  const search=typed(newMention.range.phrase,t,192.15,2.15);
  const matches=lookup(search,'Mentions',indexed===1?[...history,newMention]:history);
  const confirmed=ease(t,197.2,198.8);
  return <g opacity={hold(t,179.75,202.4,.65)}>
    <g opacity={1-fresh}>
      <Words x={76} y={221} size={46} prose>One person across saved sources</Words>
      {[['01','The mathematician'],['02','Dodgson'],['03',newMention.range.phrase]].map(([id,form],i)=>{
        const y=286+i*173;
        return <g key={id}><Frame id={id} x={76} y={y} w={512} h={123} heading={i===2?'LECTURE NOTES':'ANNOTATED PASSAGE'}/>
          <Words x={95} y={y+91} size={36} prose>{form}</Words>
          <Wire a={point(589,y+62)} b={point(735,529+i*17)} bend={.55}/></g>;
      })}
      <Person x={848} y={546}/><Decision x={110} y={837} text="Lecture notes saved and indexed" progress={indexed}/>
    </g>
    <g opacity={fresh}>
      <Frame id="04" y={182} h={181} heading="A NEW DOCUMENT"/>
      <Source source={current} x={100} y={302} size={44} mark={{range:target(current,'His'),select:1-confirmed,annotate:confirmed}}/>
      <FieldBox y={420} query={search} label="SCRY  /  PREVIOUS MENTIONS IN THE VAULT" active={confirmed<.5}/>
      {matches.some(r=>r.person.id===person.id)&&<g opacity={ease(t,193.7,195.2)}>
        <Label x={77} y={612} size={21}>MATCH IN DOCUMENT 03</Label>
        <Words x={77} y={685} size={37} prose>“{newMention.range.phrase}”</Words>
        <Wire a={point(461,674)} b={point(735,674)} draw={1}/><Person x={848} y={674}/>
      </g>}
      <g opacity={ease(t,190.1,191.1)}>
        {['Write','Discover','Annotate','Enrich future discovery'].map((label,i)=>{
          const x=[76,264,482,704][i],on=t>=[189.6,192.15,197.2,199.65][i];
          return <g key={label}>
            <Words x={x} y={877} size={25} color={on?ink.entity:ink.grey}>{label}</Words>
            {i<3&&<path d={`M${x+[78,119,134][i]} 870h48m-7 -5 7 5 -7 5`} stroke={ink.grey} strokeWidth={1.7} fill="none"/>}
          </g>;
        })}
      </g>
      <Decision x={103} y={819} text="The author links “His” in the new document" progress={confirmed}/>
    </g>
  </g>;
}
