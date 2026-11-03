import {createSignal} from 'solid-js';
import type {GlossEdge,GlossGraphIndex} from './relationship-index';
export type ArgumentDirection='incoming'|'outgoing'|'both';
export const ARGUMENT_LIMITS={rows:300,depth:8,page:20};
export interface ArgumentLink {key:string;id:string;direction:'incoming'|'outgoing';edgeId:string;type:string}
export const argumentRootPath=(id:string)=>JSON.stringify([id]);
export const argumentPath=(parent:string,link:ArgumentLink)=>JSON.stringify([...JSON.parse(parent),[link.direction,link.edgeId,link.id]]);
/** One adjacency only. Never follows a child, inspects a repository, or measures DOM. */
export function argumentChildren(graph:Pick<GlossGraphIndex,'relations'>,id:string,direction:ArgumentDirection,predicate:string,rank:(id:string)=>number){
 const adjacency=graph.relations(id),links:ArgumentLink[]=[];const excluded=new Set<string>();let inspected=0;
 const collect=(edges:GlossEdge[],side:ArgumentLink['direction'])=>{for(const edge of edges){inspected++;if(!edge.active){excluded.add(edge.key);continue;}if(predicate&&edge.type!==predicate)continue;const child=side==='incoming'?edge.sourceGlossId:edge.targetGlossId!;links.push({key:JSON.stringify([side,edge.id,child]),id:child,direction:side,edgeId:edge.id,type:edge.type!});}};
 if(direction!=='outgoing')collect(adjacency.incoming,'incoming');if(direction!=='incoming')collect(adjacency.outgoing,'outgoing');
 const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
 links.sort((a,b)=>(direction==='both'?(a.direction===b.direction?0:a.direction==='incoming'?-1:1):0)||(rank(a.id)-rank(b.id)||0)||compare(a.id,b.id)||compare(a.edgeId,b.edgeId));
 return{links,excluded:excluded.size,inspected};
}
export function createArgumentState(){return{root:createSignal(''),direction:createSignal<ArgumentDirection>('incoming'),predicate:createSignal(''),query:createSignal(''),selectedPath:createSignal(''),branches:new Map<string,{open:ReturnType<typeof createSignal<boolean>>;limit:ReturnType<typeof createSignal<number>>}>()};}
export type ArgumentState=ReturnType<typeof createArgumentState>;
export const createArgumentDiagnostics=()=>({branchReads:0,edgesInspected:0,rowMounts:0,rankPasses:0,byPath:{} as Record<string,number>});
