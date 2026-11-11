import {SaxesParser} from 'saxes';
import {compositionLimits} from './limits';
import {DcpValidationError,safeDiagnostic} from './diagnostics';

export const xmlDialect='xml/1' as const;
export interface XmlAuthority { resolve(alias:string):string; revision(alias:string):string; }
type Element={name:string;attrs:Record<string,string>;children:(Element|string)[]};
const fail=():never=>{throw new DcpValidationError(safeDiagnostic({code:'xml',path:'$'}));};
export const xmlEscape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\r','&#13;').replaceAll('\n','&#10;').replaceAll('\t','&#9;');
/** Bounded, non-HTML parser. No provider, repository or persistence dependency. */
function parse(text:string){
 if(typeof text!=='string'||text.length>compositionLimits.responseBytes||new TextEncoder().encode(text).length>compositionLimits.responseBytes||/<!|<\?/.test(text)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))fail();
 let root:Element|undefined,count=0;const stack:Element[]=[];
 // XML normalizes literal CR and attribute whitespace. Preserve text CR, require
 // character references for selector/attribute newlines instead of changing them.
 let encoded='',at=0;const tags=/<[^>]*>/g;let m:RegExpExecArray|null;
 while((m=tags.exec(text))){encoded+=text.slice(at,m.index).replaceAll('\r','&#13;');if(/[\r\n\t]/.test(m[0])||m[0].slice(1).includes('<'))fail();encoded+=m[0];at=tags.lastIndex;}encoded+=text.slice(at).replaceAll('\r','&#13;');
 const parser=new SaxesParser({xmlns:false});parser.on('error',fail);
 parser.on('opentag',n=>{if(++count>4096||stack.length>=48)fail();const e:Element={name:n.name,attrs:n.attributes as Record<string,string>,children:[]};if(stack.length)stack.at(-1)!.children.push(e);else {if(root)fail();root=e;}stack.push(e);});
 parser.on('text',s=>{if(stack.length)stack.at(-1)!.children.push(s);else if(s.trim())fail();});parser.on('closetag',()=>{stack.pop();});
 try{parser.write(encoded).close();}catch{fail();}if(!root||stack.length)fail();return root!;
}
const elements=(e:Element)=>e.children.filter((c):c is Element=>{if(typeof c==='string'){if(c.trim())fail();return false;}return true;});
const attrs=(e:Element,allowed:string[],required:string[]=[])=>{if(Object.keys(e.attrs).some(k=>!allowed.includes(k))||required.some(k=>!e.attrs[k]))fail();return e.attrs;};
const textOnly=(e:Element)=>e.children.map(c=>typeof c==='string'?c:fail()).join('');
const empty=(e:Element)=>{if(e.children.length)fail();};
const classify=['claim','question','speculation','suggestion','objection','qualification'];

/** Lower intentions to existing DCP input. This never generates native DTOs. */
export function lowerXml(text:string,exchange:string,authority:XmlAuthority){
 const root=parse(text);if(root.name!=='response')fail();attrs(root,['intent','reply']);
 const rows=elements(root),defs=rows.at(-1)?.name==='definitions'?rows.pop()!:undefined;
 if(!rows.length||rows.some(e=>e.name==='definitions'))fail();if(defs)attrs(defs,[]);
 const symbols=new Map<string,{id:string;kind:string}>(),allocated=new WeakMap<Element,string>(),counts:Record<string,number>={};
 const kind=(e:Element):string|undefined=>/^(p|h[1-6]|ul|ol|table|grid|group|code)$/.test(e.name)?'b':/^(span|mark|b|i|e|range)$/.test(e.name)?'s':({boundary:'pos',entity:'e',passage:'r',mention:'m',classify:'m',argument:'arg',gloss:'g',relation:'rel'} as Record<string,string>)[e.name];
 const allocate=(e:Element)=>{const k=kind(e);if(!k){if(e.attrs.id)fail();return;}const id='new:'+k+(counts[k]=(counts[k]??0)+1);allocated.set(e,id);if(e.attrs.id){const name=e.attrs.id;if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)||symbols.has(name))fail();symbols.set(name,{id,kind:k});}};
 const walk=(e:Element)=>{allocate(e);for(const c of e.children)if(typeof c!=='string')walk(c);};rows.forEach(walk);if(defs)for(const e of elements(defs))walk(e);
 const id=(e:Element)=>allocated.get(e)??fail();
 const ref=(name:string,kinds?:string[])=>{if(typeof name!=='string')fail();if(name.startsWith('@'))return authority.resolve(name);const s=symbols.get(name);if(!s||kinds&&!kinds.includes(s.kind))fail();return s!.id;};
 const target=(e:Element):any=>{const a=e.attrs,name=a.target;if(!name)fail();const selection=['quote','whole','prefix','suffix'].some(k=>k in a);
  if(!selection)return ref(name,['s','r']);if((a.whole!==undefined&&(a.whole!=='true'||a.quote!==undefined||a.prefix!==undefined||a.suffix!==undefined))||a.whole===undefined&&!a.quote)fail();
  const block=ref(name,['b']),revision=name.startsWith('@')?authority.revision(name):null;
  return a.whole?{block,revision,whole:true}:{block,revision,quote:a.quote,prefix:a.prefix??'',suffix:a.suffix??''};};
 const output:any={protocol:'dcp/1.0',kind:'contribution',exchange,intent:root.attrs.intent??'reply',replyTargets:root.attrs.reply?root.attrs.reply.split(/\s+/).map(r=>ref(r)):[],composition:[],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]};
 const inline=(items:(Element|string)[]):string=>items.map(e=>{if(typeof e==='string')return xmlEscape(e);
  if(e.name==='boundary'){attrs(e,['id'],['id']);empty(e);return `<boundary id="${id(e)}"/>`;}
  if(!['b','i','e','span','mark'].includes(e.name))fail();attrs(e,['id',...(e.name==='e'?['ref']:e.name==='mark'?['kind']:[])],e.name==='span'?['id']:e.name==='e'?['ref']:e.name==='mark'?['kind']:[]);
  if(e.name==='mark'&&!classify.includes(e.attrs.kind))fail();const tag=e.name==='mark'?'annotation':e.name;
  return `<${tag}${e.attrs.id?` id="${id(e)}"`:''}${e.name==='e'?` ref="${ref(e.attrs.ref,['e'])}"`:e.name==='mark'?` type="dialectic/${e.attrs.kind}"`:''}>${inline(e.children)}</${tag}>`;
 }).join('');
 const blocks=new Map<string,any>();
 const block=(e:Element):any=>{const a=e.attrs;let result:any;
  if(e.name==='p'||/^h[1-6]$/.test(e.name)){attrs(e,['id']);result={id:id(e),kind:e.name==='p'?'paragraph':'heading',...(e.name==='p'?{}:{level:Number(e.name[1])}),markup:inline(e.children),ranges:[]};}
  else if(['ul','ol'].includes(e.name)){attrs(e,['id',...(e.name==='ol'?['start']:[])]);const items=elements(e).map(li=>{if(li.name!=='li')fail();attrs(li,[]);return elements(li).map(block);});result={id:id(e),kind:'list',style:e.name==='ul'?'bullet':'ordered',items};if(a.start!==undefined){if(!/^-?\d+$/.test(a.start)||!Number.isSafeInteger(Number(a.start)))fail();result.configuration={start:Number(a.start),reversed:false,items:items.map(()=>({value:null,checked:null}))};}}
  else if(['table','grid'].includes(e.name)){attrs(e,['id']);result={id:id(e),kind:e.name,rows:elements(e).map(row=>{if(row.name!=='tr')fail();attrs(row,[]);return elements(row).map(cell=>{if(cell.name!=='td')fail();attrs(cell,[]);return elements(cell).map(block);});})};}
  else if(e.name==='group'){attrs(e,['id']);result={id:id(e),kind:'group',children:elements(e).map(block)};}
  else if(e.name==='code'){attrs(e,['id','language']);result={id:id(e),kind:'code',language:a.language??'plain',text:textOnly(e)};}
  else return fail();blocks.set(result.id,result);return result;
 };
 output.composition=rows.map(block);
 const targetAttrs=['target','quote','prefix','suffix','whole'];
 for(const e of defs?elements(defs):[]){const a=e.attrs;
  if(e.name==='entity'){attrs(e,['id','name','type'],['id','name','type']);const children=elements(e);if(children.some(c=>!['description','alias'].includes(c.name))||children.filter(c=>c.name==='description').length>1)fail();children.forEach(c=>attrs(c,[]));output.entities.push({id:id(e),name:a.name,typename:a.type,description:children.find(c=>c.name==='description')?textOnly(children.find(c=>c.name==='description')!):'',aliases:children.filter(c=>c.name==='alias').map(textOnly)});}
  else if(e.name==='passage'){attrs(e,['id','target','quote','prefix','suffix'],['id','target','quote']);empty(e);if(!a.target.startsWith('@'))fail();output.anchors.push({id:id(e),source:authority.resolve(a.target),revision:authority.revision(a.target),selector:{exact:a.quote,prefix:a.prefix??'',suffix:a.suffix??''}});}
  else if(e.name==='mention'||e.name==='classify'){attrs(e,['id',...targetAttrs,e.name==='mention'?'ref':'kind'],['target',e.name==='mention'?'ref':'kind']);empty(e);if(e.name==='classify'&&!classify.includes(a.kind))fail();output.interpretations.push({id:id(e),target:target(e),type:e.name==='mention'?'mutable/entity-reference':'dialectic/'+a.kind,ref:e.name==='mention'?ref(a.ref,['e']):null,attributes:[]});}
  else if(e.name==='argument'){attrs(e,['id',...targetAttrs],['id','target']);empty(e);output.arguments.push({id:id(e),anchor:target(e)});}
  else if(e.name==='gloss'){attrs(e,['id',...targetAttrs,'kind'],['target','kind']);output.glosses.push({id:id(e),target:target(e),type:a.kind,text:textOnly(e)});}
  else if(e.name==='relation'){attrs(e,['id','kind','type','from','to'],['kind','type','from','to']);empty(e);if(!['entity','argument'].includes(a.kind))fail();output.relations.push({id:id(e),kind:a.kind,type:a.type,from:ref(a.from,[a.kind==='entity'?'e':'arg']),to:ref(a.to,[a.kind==='entity'?'e':'arg'])});}
  else if(e.name==='range'){attrs(e,['id','block','from','to'],['id','block','from','to']);empty(e);const b=blocks.get(ref(a.block,['b']));if(!b||!Array.isArray(b.ranges))fail();b.ranges.push({id:id(e),type:'dcp/passage',from:ref(a.from,['pos']),to:ref(a.to,['pos']),ref:null,attributes:[]});}
  else fail();
 }
 return output;
}
