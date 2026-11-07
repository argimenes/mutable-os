import {canonicalSearchSource} from '../../../runtime/canonical-search-source';
import {keys} from './markup';
import type {ReactiveEditor} from '../../../reactive-editor/editor';
import type {BlockNode,ContentRecord} from '../../../block-tree/types';
import type {ReplyTarget} from '../model';
import {targetKey,contribution} from '../model';
import type {Resolution} from '../references';
function* edges(n:BlockNode){yield* n.children;for(const name in n.ownedRelations)yield n.ownedRelations[name];}
export type SourceStatus='complete'|'truncated'|'missing'|'ambiguous'|'unavailable'|'unauthorized';
export class DcpSources {
 readonly handles=new Map<string,ReplyTarget>();
 readonly fences=new Map<string,ContentRecord>();
 readonly revisions=new Map<string,string>();
 readonly diagnostics={visited:0,characters:0,reads:0,searches:0};
 readonly trail:any[]=[];
 private callIds=new Set<string>();
 private glossValues=new Map<string,string>();
 private textCache=new Map<string,ReturnType<typeof canonicalSearchSource>>();
 private text(n:BlockNode){let pending=this.textCache.get(n.contentKey);if(!pending){pending=canonicalSearchSource(this.editor.repository.readState(),n.contentKey,0,this.signal,24000);this.textCache.set(n.contentKey,pending);}return pending;}
 private stale=false;private calls=0;private bytes=0;private deadline=Date.now()+30000;private stop:()=>void;
 constructor(readonly editor:ReactiveEditor,readonly owner:string,readonly roots:()=>Iterable<BlockNode>,readonly node:(key:string)=>BlockNode|undefined,readonly parent:(key:string)=>BlockNode|undefined,readonly resolve:(t:ReplyTarget)=>Resolution,readonly signal:AbortSignal){
  this.stop=editor.repository.subscribeChanges(change=>{for(const key of change.previousContents.keys())if(this.fences.has(key))this.stale=true;});
 }
 check(){if(this.signal.aborted)throw Error('DCP cancelled');if(Date.now()>this.deadline)throw Error('DCP deadline exceeded');if(this.stale)throw Error('Selected context changed; request a fresh DCP response.');for(const [h,text]of this.glossValues)if(this.resolve(this.target(h)).text!==text)throw Error('Selected context changed');for(const [key,record]of this.fences)if(this.editor.repository.readState().contents[key]!==record)throw Error('Selected context changed; request a fresh DCP response.');}
 fence(key:string){const c=this.editor.repository.readState().contents[key];if(!c)throw Error('Source unavailable');if(!this.fences.has(key))this.fences.set(key,c);this.check();}
 issue(target:ReplyTarget){if(target.resourceId!==this.owner)throw Error('Outside Symposium');const handle=targetKey(target);this.handles.set(handle,target);return handle;}
 target(handle:string){const target=this.handles.get(handle);if(!target)throw Error('Unauthorized source handle');return target;}
 private committed(n:BlockNode){let cur:BlockNode|undefined=n;for(let depth=0;cur&&depth<128;depth++,cur=this.parent(cur.key)){const c=contribution((cur.payload.metadata as any)?.dialectic);if(c)return c.state==='committed';}return false;}
 async source(handle:string):Promise<any> {
  this.check();const target=this.handles.get(handle);if(!target)return {status:'unauthorized',handle};
  const found=this.resolve(target);if(found.status!=='resolved')return {status:found.status==='ambiguous'?'ambiguous':found.status==='missing'?'missing':'unavailable',handle,reason:found.reason};
  const n=found.node;
  if(n&&!this.committed(n))return {status:'unauthorized',handle};
  let sourceAuthor='unknown';
  if(n){this.fence(n.contentKey);let ancestor:BlockNode|undefined=n;for(let i=0;ancestor&&i<128;i++,ancestor=this.parent(ancestor.key)){const c=contribution((ancestor.payload.metadata as any)?.dialectic);if(c){this.fence(ancestor.contentKey);sourceAuthor=c.author;break;}}}
  if(target.kind==='gloss')this.glossValues.set(handle,found.text??'');
  for(const s of found.segments??[])this.fence(s.contentKey);
  const revision=this.revisions.get(handle)??crypto.randomUUID();this.revisions.set(handle,revision);
  const base={handle,owner:this.owner,revision,kind:target.kind,sourceAuthor};
  if(target.kind==='gloss'||target.kind==='range')return {status:'complete',...base,text:found.text??'',historical:found.historical};
  if(!n)return {status:'missing',...base};
  if(n.inlineContent.length>12000)return {status:'truncated',...base,reason:'Source Cell budget; select a smaller passage',omissions:['text']};
  const cached=await this.text(n);this.check();const objects=cached.runs.length>1,text=cached.runs.map(r=>r.text).join('\uFFFC');
  const children:string[]=[];let omitted=false;
  for(const key of edges(n)){if(children.length>=64){omitted=true;break;}const child=this.node(key);if(!child)continue;const t:ReplyTarget={kind:'block',resourceId:this.owner,blockId:String(child.payload.id)};const resolved=this.resolve(t);if(resolved.status!=='resolved'||resolved.node?.contentKey!==child.contentKey){omitted=true;continue;}children.push(this.issue(t));}
  const properties=n.payload.standoffProperties as any[]??[];
  const annotations=properties.slice(0,128).map(p=>({id:p.id,type:p.type,start:p.start,end:p.end,isDeleted:!!p.isDeleted,...(p.metadata?.dcp?{provenance:{actor:p.metadata.dcp.actor,exchangeId:p.metadata.dcp.exchangeId,protocol:p.metadata.dcp.protocol,sourceAuthor:p.metadata.dcp.sourceAuthor,appliedTo:p.metadata.dcp.appliedTo}}:{}),...(p.metadata?.unknownSemantic?{unknownSemantic:{type:String(p.metadata.unknownSemantic.type).slice(0,128),inert:true}}:{})}));
  const supported=['standoff-editor-block','container-block','table-block','table-row-block','table-cell-block','indented-list-block'].includes(n.viewType);
  return {...base,status:omitted||properties.length>128?'truncated':supported?'complete':'unavailable',nativeType:n.viewType,text,children,annotations,omissions:[...(!supported?['native view needs a DCP adapter']:[]),...(omitted?['children beyond budget or ownership']:[]),...(properties.length>128?['annotations beyond budget']:[]),...(objects?['inline objects: nontext placeholders; exact selectors unavailable']:[]),...(properties.some(p=>p.value||p.metadata?.unknownSemantic)?['annotation values/attributes are not exported by the 4A profile']:[])],hasInlineObjects:objects};
 }
 private record(call:any,result:any){const size=JSON.stringify(result).length;if((this.bytes+=size)>48000)throw Error('DCP retrieval result budget exceeded');this.trail.push({call,result});return result;}
 async tool(call:any){
  keys(call,['id','tool','arguments']);if(typeof call.id!=='string'||call.id.length>128||this.callIds.has(call.id))throw Error('Invalid/duplicate tool call');this.callIds.add(call.id);
  keys(call.arguments,call.tool==='read_source'?['handle']:['query','limit']);
  this.check();if(++this.calls>6)throw Error('DCP tool-call budget exceeded');
  if(call.tool==='read_source'){this.diagnostics.reads++;return this.record(call,await this.source(call.arguments.handle));}
  if(call.tool!=='search_symposium')throw Error('Unavailable DCP tool');
  const {query,limit}=call.arguments;if(typeof query!=='string'||!query.length||query.length>512||!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid search arguments');
  this.diagnostics.searches++;const items:any[]=[];let visited=0,characters=0,truncated=false;
  // A bounded lazy DFS, not a full scope enumeration before applying result limits.
  const stack:Iterator<BlockNode>[]=[this.roots()[Symbol.iterator]()],seen=new Set<string>();
  while(stack.length){this.check();const next=stack.at(-1)!.next();if(next.done){stack.pop();continue;}const n=next.value;
   if(++visited>512||this.diagnostics.visited>=512||this.diagnostics.characters>=100000){truncated=true;break;}this.diagnostics.visited++;
   if(seen.has(n.contentKey))continue;seen.add(n.contentKey);
   const t:ReplyTarget={kind:'block',resourceId:this.owner,blockId:String(n.payload.id)};const resolved=this.resolve(t);if(resolved.status!=='resolved'||resolved.node?.contentKey!==n.contentKey||!this.committed(n))continue;
   if(n.inlineContent.length){if(n.inlineContent.length>12000){truncated=true;continue;}const handle=this.issue(t),source=await this.source(handle);characters+=source.text?.length??0;this.diagnostics.characters+=source.text?.length??0;
    if(characters>100000){truncated=true;break;}if(source.text?.includes(query))items.push({...source,excerpt:source.text.slice(Math.max(0,source.text.indexOf(query)-50),source.text.indexOf(query)+query.length+100)});
    if(items.length>=limit){truncated=true;break;}}
   if(stack.length>=32){truncated=true;continue;}
   const self=this;stack.push((function*(){for(const key of edges(n)){const child=self.node(key);if(child)yield child;}})());
   if(visited%32===0)await new Promise(r=>setTimeout(r,0));
  }
  return this.record(call,{status:truncated?'truncated':'complete',items,coverage:{visited:Math.min(visited,512),characters},omissions:truncated?['Search result, traversal or character budget']:[]});
 }
 async exact(handle:string,revision:string,selector:{exact:string;prefix:string;suffix:string}){
  const source=await this.source(handle),target=this.target(handle),n=this.resolve(target).node;
  if(source.status!=='complete'||!n||n.viewType!=='standoff-editor-block'||source.hasInlineObjects||source.revision!==revision||target.kind!=='block')throw Error('Exact anchor source unavailable or stale');
  const {exact,prefix,suffix}=selector;if(typeof exact!=='string'||!exact.length||exact.length>8192||typeof prefix!=='string'||prefix.length>2048||typeof suffix!=='string'||suffix.length>2048)throw Error('Invalid exact selector');
  const matches:number[]=[];for(let at=source.text.indexOf(exact);at>=0;at=source.text.indexOf(exact,at+1))if(source.text.slice(0,at).endsWith(prefix)&&source.text.slice(at+exact.length).startsWith(suffix))matches.push(at);
  if(matches.length!==1)throw Error(matches.length?'Ambiguous exact anchor':'Missing exact anchor');
  const boundaries=(await this.text(n)).runs[0].boundaries!;
  const start=boundaries[matches[0]],end=boundaries[matches[0]+exact.length];if(start===undefined||end===undefined||start<0||end<0)throw Error('Selector splits a Cell');
  return {node:n,start,end,text:exact,sourceAuthor:source.sourceAuthor};
 }
 dispose(){this.stop();}
}
