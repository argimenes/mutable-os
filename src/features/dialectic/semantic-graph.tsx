import {createEffect,createMemo,createSignal,onCleanup,onMount} from 'solid-js';
import {diagramFrame} from '../../structured/mermaid-view';
import {mermaidLabel} from '../gloss/mermaid';
export interface SemanticGraphNode {id:string;label:string}
export interface SemanticGraphEdge {id:string;from:string;to:string;label:string}
/** Relationship pills are selectable edge labels; only recorded endpoints produce arrows. */
export function semanticGraph(nodes:SemanticGraphNode[],edges:SemanticGraphEdge[],limit=60){
 const included=nodes.slice(0,limit),tokens=new Map(included.map((n,i)=>[n.id,'G'+i])),navigation:Record<string,string>={},identities:Record<string,string>={};
 const lines=['flowchart TB'];
 for(const n of included){const token=tokens.get(n.id)!;lines.push(`${token}["${mermaidLabel(n.label,90)}"]`);navigation[token]=n.label;identities[token]=n.id;}
 const eligible=edges.filter(e=>tokens.has(e.from)&&tokens.has(e.to)),shown=eligible.slice(0,120);
 shown.forEach((e,i)=>{const token='G'+(included.length+i);lines.push(`${token}(["${mermaidLabel(e.label)}"])`,`${tokens.get(e.from)} --> ${token} --> ${tokens.get(e.to)}`);navigation[token]=e.label;identities[token]=e.id;});
 lines.push('classDef entity fill:#faf8ff,stroke:#b8a4ee,color:#262033,rx:12,ry:12','classDef relation fill:#eee8ff,stroke:#d8ccf7,color:#3c257d,font-size:12px');if(included.length)lines.push('class '+included.map(n=>tokens.get(n.id)).join(',')+' entity');if(shown.length)lines.push('class '+shown.map((_,i)=>'G'+(included.length+i)).join(',')+' relation');
 return {source:lines.join('\n'),navigation,identities,truncated:included.length<nodes.length||shown.length<edges.length};
}
export function SemanticGraph(props:{nodes:SemanticGraphNode[];edges:SemanticGraphEdge[];active:boolean;selected?:string;select:(id:string)=>void}){
 let host!:HTMLDivElement;const [status,setStatus]=createSignal(''),[zoom,setZoom]=createSignal(1),[control,setControl]=createSignal<{selectNode:(id?:string)=>void}>();
 const graph=createMemo(()=>semanticGraph(props.nodes,props.edges));
 createEffect(()=>control()?.selectNode(Object.keys(graph().identities).find(token=>graph().identities[token]===props.selected)));
 onMount(()=>createEffect(()=>{if(!props.active)return;const g=graph(),abort=new AbortController();let dispose:Awaited<ReturnType<typeof diagramFrame>>|undefined;
  setStatus(g.truncated?'Showing up to 60 objects and 120 relationships. Use search to narrow the graph.':'');
  if(props.nodes.length)void diagramFrame(host,g.source,abort.signal,error=>{if(!abort.signal.aborted&&error)setStatus(error);},{fit:true,title:'Interactive semantic relationship diagram',numericLabelEntities:true,navigation:{nodes:g.navigation,onSelect:token=>{if(!abort.signal.aborted&&props.active)props.select(g.identities[token]);}}}).then(d=>{dispose=d;if(abort.signal.aborted)d();else setControl(()=>d);}).catch(e=>{if(!abort.signal.aborted)setStatus(String(e));});
  else host.replaceChildren();
  onCleanup(()=>{abort.abort();dispose?.();setControl(undefined);});
 }));
 return <div class="semantics-graph"><p role="status">{status()}</p><div class="semantics-graph-scroll"><div ref={host} style={{width:`${zoom()*100}%`,height:`${zoom()*100}%`}}/></div><div class="semantics-zoom"><button aria-label="Zoom graph in" onClick={()=>setZoom(v=>Math.min(3,v+.25))}>+</button><button aria-label="Zoom graph out" onClick={()=>setZoom(v=>Math.max(1,v-.25))}>−</button><button onClick={()=>setZoom(1)}>Reset</button></div></div>;
}
