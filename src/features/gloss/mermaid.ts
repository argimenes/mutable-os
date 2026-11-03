import type {GlossGraphIndex,GlossEdge,GlossNode} from './relationship-index';
import {parseGloss} from './model';
export interface GlossMermaidOptions {
 scope:'document'|'selected';rootGlossId?:string;direction:'TD'|'LR';maxDepth:number;maxNodes:number;maxEdges:number;
 relationshipTypes?:readonly string[];includeOrphans?:boolean;anchoredGlossIds?:ReadonlySet<string>;
}
export interface GlossMermaidResult {source:string;nodeToGlossId:Map<string,string>;includedNodes:number;includedEdges:number;truncated:boolean;warnings:string[];excludedRelationships:number;visitedEdges:number}
type Graph=Pick<GlossGraphIndex,'nodes'|'relations'|'allEdges'>;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const edgeOrder=(a:GlossEdge,b:GlossEdge)=>compare(a.sourceGlossId,b.sourceGlossId)||compare(a.targetGlossId??'',b.targetGlossId??'')||compare(a.type??'',b.type??'')||compare(a.id,b.id);
const bounded=(v:number,fallback:number,max:number)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):fallback;
/** Quoted Mermaid text, with syntax/control characters encoded as Mermaid entities.
 * Encode reserved guard words too; source never contains user-supplied directives. */
export function mermaidLabel(text:string,max=64):string {
 const chars=[...text.replace(/\s+/gu,' ').trim()],short=chars.length>max?chars.slice(0,max-1).join('')+'…':chars.join('');
 return [...short].map(c=>/[\p{L}\p{N} .,_:;!?()'’·—–-]/u.test(c)?c:`#${c.codePointAt(0)};`).join('').replace(/(https?|data|javascript):/gi,word=>`#${word.codePointAt(0)};${word.slice(1)}`).replace(/\b(click|href|image|img|icon)\b/gi,word=>`#${word.codePointAt(0)};${word.slice(1)}`);
}
/** Pure conversion over the existing derived C1 graph. No repository or DOM access. */
export function glossGraphToMermaid(graph:Graph,options:GlossMermaidOptions):GlossMermaidResult {
 const maxNodes=bounded(options.maxNodes,60,100),maxEdges=bounded(options.maxEdges,120,160),depth=bounded(options.maxDepth,2,6),warnings=new Set<string>(),nodes=new Map<string,GlossNode>(),edges=new Map<string,GlossEdge>(),excluded=new Set<string>(),inspected=new Set<string>();let truncated=false;
 const types=options.relationshipTypes===undefined?undefined:new Set(options.relationshipTypes);
 const eligible=(id:string)=>{const values=graph.nodes(id);return values.length===1&&!values[0].deleted&&(options.includeOrphans!==false||options.anchoredGlossIds?.has(id))?values[0]:undefined;};
 const addNode=(id:string)=>{if(nodes.has(id))return true;const node=eligible(id);if(!node)return false;if(nodes.size===maxNodes){truncated=true;warnings.add(`Node limit (${maxNodes}) reached. Narrow the scope, depth or relationship types.`);return false;}nodes.set(id,node);return true;};
 const consider=(edge:GlossEdge)=>{
  inspected.add(edge.key);if(!edge.active){excluded.add(edge.key);return false;}if(types&&!types.has(edge.type!))return false;
  if(!eligible(edge.sourceGlossId)||!eligible(edge.targetGlossId!))return false;
  if(edges.has(edge.key))return true;
  if(edges.size===maxEdges){truncated=true;warnings.add(`Edge limit (${maxEdges}) reached. Narrow the scope, depth or relationship types.`);return false;}
  const needed=[...new Set([edge.sourceGlossId,edge.targetGlossId!])].filter(id=>!nodes.has(id)).length;
  if(nodes.size+needed>maxNodes){truncated=true;warnings.add(`Node limit (${maxNodes}) reached. Narrow the scope, depth or relationship types.`);return false;}
  addNode(edge.sourceGlossId);addNode(edge.targetGlossId!);edges.set(edge.key,edge);return true;
 };
 if(options.scope==='document'){
  // Explicit Document view only; the local index inventory is independent of repository size.
  for(const edge of graph.allEdges().slice().sort(edgeOrder))consider(edge);
 }else if(options.rootGlossId&&addNode(options.rootGlossId)){
  const distances=new Map([[options.rootGlossId,0]]),queue=[options.rootGlossId];
  for(let at=0;at<queue.length;at++){
   const id=queue[at],distance=distances.get(id)!;if(distance>=depth)continue;
   const adjacent=graph.relations(id),candidates=[...new Map([...adjacent.incoming,...adjacent.outgoing].map(e=>[e.key,e])).values()].sort(edgeOrder);
   for(const edge of candidates){if(inspected.size>=2000){truncated=true;warnings.add('Traversal limit (2,000 relationships) reached. Narrow the scope.');break;}if(!consider(edge))continue;
    for(const next of [edge.sourceGlossId,edge.targetGlossId!])if(!distances.has(next)){distances.set(next,distance+1);queue.push(next);}
   }
   if(inspected.size>=2000)break;
  }
  // Preserve links between discovered frontier nodes, including cycles at the boundary.
  for(const id of [...nodes.keys()].sort(compare))for(const edge of graph.relations(id).outgoing.slice().sort(edgeOrder)){if(inspected.size>=2000){truncated=true;warnings.add('Traversal limit (2,000 relationships) reached. Narrow the scope.');break;}if(nodes.has(edge.targetGlossId!))consider(edge);}
 }else if(options.rootGlossId)warnings.add('The selected Gloss is unavailable or excluded by the current filters.');
 else warnings.add('Select a root Gloss to explore its relationships.');
 const mapping=new Map<string,string>(),tokens=new Map<string,string>(),lines=[`flowchart ${options.direction==='LR'?'LR':'TD'}`];
 [...nodes].sort(([a],[b])=>compare(a,b)).forEach(([id,node],i)=>{const token='G'+i;mapping.set(token,id);tokens.set(id,token);const parsed=parseGloss(node.raw),kind=parsed.type.toLowerCase(),style=kind==='thesis'?'thesis':kind==='evidence'?'evidence':['counterargument','counter-argument','objection'].includes(kind)?'counter':'neutral';lines.push(`    ${token}["${mermaidLabel(node.raw)}"]:::${style}`);});
 for(const edge of [...edges.values()].sort(edgeOrder))lines.push(`    ${tokens.get(edge.sourceGlossId)} -->|"${mermaidLabel(edge.type!,36)}"| ${tokens.get(edge.targetGlossId!)}`);
 if(nodes.size)lines.push('    classDef thesis fill:#eee2c7,stroke:#8b6a32,color:#30291f','    classDef evidence fill:#dcebe3,stroke:#527565,color:#243b30','    classDef counter fill:#f0dfe0,stroke:#94595e,color:#42282a','    classDef neutral fill:#f3f0e8,stroke:#8c8475,color:#34312b');
 // Adversarial labels can expand when entity-encoded; preserve topology by shortening
 // all labels deterministically before exceeding the existing renderer's source guard.
 let source=lines.join('\n');if(source.length>19500){warnings.add('Labels shortened to fit the renderer source limit.');source=source.replace(/"[^"\n]*"/g,label=>{const content=label.slice(1,-1),pieces=content.match(/#\d+;|./gu)??[];return '"'+pieces.slice(0,4).join('')+'…"';});}
 return{source,nodeToGlossId:mapping,includedNodes:nodes.size,includedEdges:edges.size,truncated,warnings:[...warnings],excludedRelationships:excluded.size,visitedEdges:inspected.size};
}
