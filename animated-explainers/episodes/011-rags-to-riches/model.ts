import {namedRange} from '../../shared/TextRun';

export const texts={
  A:'Napoleon examined the map. He pointed towards the river. The officers prepared to depart.',
  B:'The Emperor returned to Paris.',
  C:'Our commander was decisive in the face of uncertainty.',
  D:'He was reckless when confronted with opposition.',
  E:'Bonaparte ordered the troops to advance before dawn.',
  F:'The Emperor was renowned for his military leadership.',
} as const;
export type Doc=keyof typeof texts;
export const names={
  napoleon:'Napoleon Bonaparte',augustus:'Augustus',paris:'Paris, France',officers:'Military officers',
  troops:'Military troops',officer:'Officer A',aide:'Aide B',decisive:'Decisive',reckless:'Reckless',
  advance:'Advance',
};
export type Identity=keyof typeof names;
export const napoleon={id:'napoleon',name:['Napoleon','Bonaparte']} as const;
export const question="How did observers characterise Napoleon's military leadership?";
export function target(doc:Doc,id:string,words:string) {
  return {doc,...namedRange(id,texts[doc],words)};
}
export type Target=ReturnType<typeof target>;
export const wording=(r:Target)=>texts[r.doc].slice(r.start,r.end);
function mention(doc:Doc,id:string,words:string,entity:Identity) {
  return {...target(doc,id,words),entity};
}
export const mentions=[
  mention('A','A1','Napoleon','napoleon'),mention('A','A2','He','napoleon'),mention('A','A3','The officers','officers'),
  mention('B','B1','The Emperor','napoleon'),mention('B','B2','Paris','paris'),
  mention('C','C1','Our commander','napoleon'),mention('D','D1','He','napoleon'),
  mention('E','E1','Bonaparte','napoleon'),mention('E','E2','the troops','troops'),
  mention('F','F1','The Emperor','augustus'),
];
export const mapAction=target('A','pointing','He pointed towards the river.');
export function chunk(doc:Doc,start=0,end:number=texts[doc].length):Target {
  if(start<0||end>texts[doc].length||start>=end)throw Error('Invalid chunk bounds');
  return {id:doc+'@'+start+'-'+end,doc,start,end};
}
export function inRange(unit:Target) {
  return mentions.filter(m=>m.doc===unit.doc&&unit.start<=m.start&&m.end<=unit.end);
}
export function splitAt(offset:number){return [chunk('A',0,offset),chunk('A',offset)];}
export const initialSplit=mapAction.start;
export const proposedSplit=texts.A.indexOf('the river');
export const guidedSplit=mapAction.end+1;
export const readings=[
  {name:'Historical',range:target('B','event','returned to Paris'),label:'Return journey'},
  {name:'Rhetorical',range:target('B','title','The Emperor'),label:'Imperial title'},
  {name:'Literary',range:target('B','motif','returned to Paris'),label:'Journey motif'},
];
export const returnClaim={id:'B',type:'Return journey',source:chunk('B'),traveller:'napoleon',destination:'paris'} as const;
function trait(doc:Doc,observer:Identity,concept:Identity,expression:string){
  return {id:doc,kind:'Trait' as const,subject:'napoleon' as Identity,observer,concept,
    expression:target(doc,doc+'-trait',expression),source:chunk(doc)};
}
export const traits=[trait('C','officer','decisive','decisive'),trait('D','aide','reckless','reckless')];
export const order={id:'E',kind:'Claim',type:'Military order',issuer:'napoleon',recipient:'troops',action:'advance',
  time:target('E','time','before dawn'),source:chunk('E')} as const;
export const enrich=(unit:Target)=>({unit,entities:[...new Set(inRange(unit).map(m=>m.entity))],
  claims:unit.doc===returnClaim.source.doc && unit.start<=returnClaim.source.start && unit.end>=returnClaim.source.end?[returnClaim]:[]});
export const candidates:Doc[]=['B','C','F']; // Authored illustration, independent of any embedding model.
export function constrain(docs:Doc[],identity:Identity){return docs.filter(doc=>inRange(chunk(doc)).some(m=>m.entity===identity));}
export function assemble(sources:Target[]){
  return [...new Map(sources.map(r=>[r.doc+'/'+r.start+'/'+r.end,r])).values()];
}
export function expand(seed:Target,mentionId:string){
  const entry=inRange(seed).find(m=>m.id===mentionId);
  if(!entry)throw Error('Entry mention is outside the retrieved passage');
  const judgements=traits.filter(s=>s.subject===entry.entity);
  const orders=entry.entity===order.issuer?[order]:[];
  return {entry,judgements,orders,sources:assemble([seed,...judgements.map(r=>r.source),...orders.map(r=>r.source)])};
}
export const retained=constrain(candidates,'napoleon');
export const seed=chunk(retained.find(doc=>doc==='C')!);
export const context=expand(seed,'C1');

export function serialise(bundle:ReturnType<typeof expand>) {
  const passages=bundle.sources.map(r=>`Document ${r.doc} [${r.start}, ${r.end}): ${wording(r)}`);
  const judgements=bundle.judgements.map(r=>
    `Trait ${r.id}: ${names[r.observer]} describes ${names[r.subject]} as ${names[r.concept]}. Expression: “${wording(r.expression)}”, ${r.source.doc} [${r.expression.start}, ${r.expression.end}).`);
  const claims=bundle.orders.map(r=>
    `Claim ${r.id}: ${r.type}. Issuer: ${names[r.issuer]}. Recipient: ${names[r.recipient]}. Action: ${names[r.action]}. Time: ${wording(r.time)}. Source: ${r.source.doc}.`);
  return [...passages,...judgements,...claims].join('\n');
}
