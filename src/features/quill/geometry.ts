import type {QuillPath} from './model';
export interface PathPoint {x:number;y:number;angle:number}
export interface PathGeometry {key:string;length:number;d:string;point(distance:number):PathPoint}
/** Local SVG coordinates. Never depends on viewport scroll, CSS zoom or mounted DOM. */
export class PathCache {
 private cache=new Map<string,PathGeometry>();
 builds=0;
 get(path:QuillPath):PathGeometry {
  const key=JSON.stringify(path),old=this.cache.get(key);if(old)return old;
  this.builds++;
  const count=path.kind==='line'?1:Math.max(128,Math.ceil((path.cycles??1)*96));
  const points:Array<{x:number;y:number;s:number}>=[];
  for(let i=0;i<=count;i++){
   const t=i/count,x=path.x+t*path.width,y=path.y+(path.kind==='sine'?(path.amplitude??0)*Math.sin(t*2*Math.PI*(path.cycles??1)+(path.phase??0)):0),last=points.at(-1);
   points.push({x,y,s:last?last.s+Math.hypot(x-last.x,y-last.y):0});
  }
  const length=points.at(-1)!.s;
  const geometry:PathGeometry={key,length,d:points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' '),point(distance){
   const s=Math.max(0,Math.min(length,distance));let lo=1,hi=points.length-1;
   while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].s<s)lo=mid+1;else hi=mid;}
   const a=points[lo-1],b=points[lo],t=(s-a.s)/(b.s-a.s||1);
   return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
  }};
  this.cache.set(key,geometry);if(this.cache.size>512)this.cache.delete(this.cache.keys().next().value!);return geometry;
 }
 clear(){this.cache.clear();}
}
