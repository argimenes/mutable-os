import {namedRange} from '../../shared/TextRun';

export const people=[
  {id:'carroll',name:'Lewis Carroll',aliases:['Charles Lutwidge Dodgson']},
  {id:'neighbour',name:'Nora Carroll',aliases:[]},
  {id:'other-dodgson',name:'E. Dodgson',aliases:[]},
];
export const person=people[0];
export const expressions=[person.name,person.aliases[0],'Dodgson','The mathematician','The author of Alice'];
export const proseLines=['Dodgson taught mathematics at Oxford. ', 'The mathematician also developed an ',
  'interest in photography. ', "In 1865, the author published Alice's ", 'Adventures in Wonderland.'];
export type Block={doc:string;id:string;lines:string[];text:string};
export function block(doc:string,id:string,lines:string[]):Block {return {doc,id,lines,text:lines.join('')};}
export const biographical=block('01','life',proseLines);
export function target(source:Block,phrase:string){
  return {...namedRange(source.doc+'/'+source.id+'/'+phrase,source.text,phrase),doc:source.doc,block:source.id,phrase};
}
export const pinned=target(biographical,'The mathematician');
export const paragraphs=[
  ['At Oxford, Dodgson prepared ', 'a lesson for the morning.'],
  ['The notebook lay where ', 'Dodgson had left it.'],
  ['Dodgson returned to the ', 'same problem after lunch.'],
  ['At the foot of the page ', 'he signed it Dodgson.'],
].map((lines,i)=>block('02','p'+(i+1),lines));
export const reviewed=paragraphs.map(b=>target(b,'Dodgson'));
export type Target=ReturnType<typeof target>;
export type Mention={id:string;range:Target;entity:string};
export function bind(ranges:Target[],entity:string):Mention[]{
  return ranges.map(r=>({id:r.doc+'/'+r.block+'@'+r.start+'-'+r.end,range:r,entity}));
}
export const batch=bind(reviewed,person.id);
const previous=[
  ['Earlier notes','a','The mathematician kept a notebook.','The mathematician'],
  ['Reading notes','b','The author of Alice wrote under a pen name.','The author of Alice'],
  ['A letter','c','The envelope was addressed to Mr Dodgson.','Mr Dodgson'],
];
export const history=previous.flatMap(([doc,id,text,phrase])=>bind([target(block(doc,id,[text]),phrase)],person.id));
export const lecture=block('03','lecture',['At the lectern stood the Oxford lecturer.']);
export const newMention=bind([target(lecture,'the Oxford lecturer')],person.id)[0];
export const current=block('04','new',['His letter lay open on my desk.']);
export type Field='Name'|'Alias'|'Mentions'|'Names and aliases';
export function lookup(query:string,field:Field,index=history) {
  const q=query.trim().toLowerCase();
  if(!q)return [];
  return people.flatMap(p=>{
    const evidence=field==='Mentions'?index.filter(m=>m.entity===p.id).map(m=>({form:m.range.phrase,kind:'Previous mention'})):
      [...(field==='Alias'?[]:[{form:p.name,kind:'Canonical name'}]),...(field==='Name'?[]:p.aliases.map(form=>({form,kind:'Alias'})))];
    const match=evidence.find(e=>e.form.toLowerCase().includes(q));
    return match?[{person:p,...match}]:[];
  });
}
export function complete(mode:'square'|'round',source:string,chosen=person){
  return {words:mode==='square'?chosen.name:source,entity:chosen.id};
}
