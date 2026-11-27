// Endpoints are occurrence-local geometry providers. Relationship kind and review status stay independent.
export interface ThreadLink {
  id:string; from:string; to:string;
  kind:'entity-mention'|'correspondence'|'retrieval'|'evidence'|'counter-evidence'|'inference';
  origin:'native-semantic-binding'|'lexical-match'|'retrieval-engine'|'ai-attributed'|'human-authored';
  review:'unverified'|'reviewed'|'not-applicable';
}
interface Rect {left:number;right:number;top:number;bottom:number}
export interface ThreadEndpoint {occurrence:string;rects:readonly Rect[];clip:Rect}
export function resolveThreads(links:readonly ThreadLink[], endpoints:ReadonlyMap<string,ThreadEndpoint[]>,stage:Rect){
  const visible=(e:ThreadEndpoint)=>e.rects.map(r=>({left:Math.max(r.left,e.clip.left,stage.left),right:Math.min(r.right,e.clip.right,stage.right),top:Math.max(r.top,e.clip.top,stage.top),bottom:Math.min(r.bottom,e.clip.bottom,stage.bottom)})).filter(r=>r.right>r.left&&r.bottom>r.top);
  return links.flatMap(link=>(endpoints.get(link.from)??[]).flatMap(a=>(endpoints.get(link.to)??[]).flatMap(b=>{
    const start=visible(a)[0],end=visible(b)[0];if(!start||!end)return [];
    const right=start.left>end.left,x=(right?start.left:start.right)-stage.left,y=(start.top+start.bottom)/2-stage.top;
    const tx=(right?end.right:end.left)-stage.left,ty=(end.top+end.bottom)/2-stage.top,mid=(x+tx)/2;
    return [{...link,occurrences:[a.occurrence,b.occurrence],path:`M${x} ${y} C${mid} ${y} ${mid} ${ty} ${tx} ${ty}`}];
  })));
}
