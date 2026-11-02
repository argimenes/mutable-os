import {safeUrl,safeColor} from '../../interchange/inline-values.mjs';
export const NAME_TYPES=['given-name','family-name','patronymic','toponym','art-name','particle','honorific'];
export const DESCRIPTION_TYPES=['style/bold','style/italics','style/underline','style/highlight','style/strikethrough','style/strike','style/superscript','style/subscript','reference/url','text/colour','text/background-colour','style/color'];
export const coordinate='unicode-scalar-inclusive-v1';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function validateRanges(text,properties,types,field='Local field'){
 if(typeof text!=='string'||!Array.isArray(properties)||properties.length>200)throw Error(`${field} has invalid text or too many annotations (maximum 200)`);
 const length=[...text].length,ids=new Set();
 for(const p of properties){
  if(!object(p)||typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error(`${field} has an invalid or duplicate annotation identity`);
  if(!types.includes(p.type))throw Error(`${field} does not support annotation "${String(p.type)}" yet`);
  if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end<p.start||p.end>=length)throw Error(`${field} annotation "${p.type}" falls outside its text`);
  ids.add(p.id);const url=p.type==='reference/url',color=['text/colour','text/background-colour','style/color'].includes(p.type);
  const allowed=['id','type','start','end','isDeleted',...(url||color?['value']:[])];
  if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error(`${field} annotation "${p.type}" contains unsupported data; graph references and shared definitions are not supported`);
  if(url&&!safeUrl(p.value))throw Error(`${field} contains an unsupported link URL`);
  if(color&&!safeColor(p.value))throw Error(`${field} contains an unsupported text colour`);
 }
}
export function validateCard(input){
 if(!object(input)||typeof input.name!=='string')throw Error('Name could not be read from the editor');
 if(!input.name.trim())throw Error('Name cannot be empty');
 const breaks=input.name.match(/\r\n|[\r\n]/g);if(breaks)throw Error(`Name contains ${breaks.length} hidden line break${breaks.length===1?'':'s'}. Choose “Make Name single-line” before saving`);
 if(input.name.length>1000)throw Error(`Name contains ${input.name.length} characters; the maximum is 1000`);
 if(input.nameStrata!==null){const s=input.nameStrata;if(!object(s)||s.version!==1||s.coordinates!==coordinate||Object.keys(s).some(k=>!['version','coordinates','properties'].includes(k)))throw Error('Unsupported Name Strata encoding');validateRanges(input.name,s.properties,NAME_TYPES,'Name');}
 if(input.descriptionDocument!==null)validateDescription(input.descriptionDocument);
 if(input.imageRef!==null){const a=input.imageRef;if(!object(a)||a.kind!=='managed'||typeof a.cavernId!=='string'||!a.cavernId||!/^sha256:[a-f0-9]{64}$/.test(a.assetId)||Object.keys(a).some(k=>!['kind','cavernId','assetId'].includes(k)))throw Error('Invalid managed image reference');}
 if(!Array.isArray(input.aliases)||input.aliases.length>100)throw Error('At most 100 authored aliases are supported');
 const ids=new Set(),names=new Set();for(const a of input.aliases){if(!object(a)||typeof a.id!=='string'||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>1000||/[\r\n]/.test(a.name)||!['curated','imported'].includes(a.origin))throw Error('Invalid alias');const key=a.origin+':'+a.name.normalize('NFKC').toLowerCase();if(names.has(key))throw Error('Duplicate alias');ids.add(a.id);names.add(key);}
 return input;
}
export function validateDescription(doc){
 if(!object(doc)||doc.type!=='document-block'||!Array.isArray(doc.children)||doc.children.length>40||JSON.stringify(doc).length>150000)throw Error('Description must be a bounded Mutable document fragment');
 const allowed=['id','type','children','text','standoffProperties','blockProperties','metadata','relation'];let characters=0;
 const shape=(b,root=false)=>{if(Object.keys(b).some(k=>!allowed.includes(k))||b.relation&&Object.keys(b.relation).length||b.metadata&&Object.keys(b.metadata).length||b.blockProperties?.length)throw Error('Description contains unsupported document data');if(!root&&(b.children?.length||b.type!=='standoff-editor-block'||typeof b.text!=='string'))throw Error('Description supports local text paragraphs only');};
 shape(doc,true);if(doc.text||doc.standoffProperties?.length)throw Error('Description root cannot carry text or annotations');
 for(const b of doc.children){if(!object(b))throw Error('Invalid Description paragraph');shape(b);characters+=[...b.text].length;validateRanges(b.text,b.standoffProperties??[],DESCRIPTION_TYPES,'Description');}
 if(characters>20000)throw Error('Description exceeds 20,000 characters');return doc;
}
