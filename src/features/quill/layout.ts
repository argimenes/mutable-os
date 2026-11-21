import type {Cluster,ShapeResult} from './measurement';
import type {PathGeometry,PathPoint} from './geometry';
export interface Glyph {cluster:Cluster;distance:number;point:PathPoint}
export interface LineFragment {start:number;end:number;geometry:PathGeometry;glyphs:Glyph[];width:number}
export interface FlowLayout {fragments:LineFragment[];overflow:number;length:number;diagnostic?:string}
/** Derived flow only: line breaks consume canonical positions, never edit text.
 * Overlong words split at supported cluster boundaries. Final overflow is retained. */
export class FlowEngine {
 private previous?:FlowLayout;
 fits=0;
 layout(shape:ShapeResult,paths:PathGeometry[]):FlowLayout {
  if(shape.diagnostic)return {fragments:[],overflow:0,length:0,diagnostic:shape.diagnostic};
  const cs=shape.clusters,fragments:LineFragment[]=[];let start=0;
  for(let line=0;line<paths.length;line++){
   const geometry=paths[line],old=this.previous?.fragments[line];
   if(start>=cs.length&&line>0)break;
   const change=shape.change,delta=this.previous?cs.length-this.previous.length:0;
   let affected=change?.start??0;
   // Editing the following word can make it fit on the preceding line.
   while(affected>0&&cs[affected-1]?.text!==' '&&cs[affected-1]?.text!=='\n')affected--;
   if(old&&old.geometry===geometry&&change&&(
      old.start===start&&(old.end<affected||old.end===affected&&old.glyphs.at(-1)?.cluster.text==='\n') ||
      start>=change.newEnd&&old.start>=change.oldEnd&&start===old.start+delta)){
    const retained=delta&&start!==old.start?{...old,start,end:old.end+delta,glyphs:old.glyphs.map(g=>({...g,cluster:cs[g.cluster.start+delta]}))}:old;
    fragments.push(retained);start=retained.end;continue;
   }
   this.fits++;
   let end=start,width=0,lastBreak=-1;
   while(end<cs.length){const c=cs[end];if(c.text==='\n'){end++;break;}
    if(width+c.advance>geometry.length){if(lastBreak>start)end=lastBreak;break;}
    width+=c.advance;end++;if(c.text===' ')lastBreak=end;
   }
   // A path too short for even one cluster exposes overflow; do not loop or discard.
   const glyphs:Glyph[]=[];width=0;
   for(let i=start;i<end;i++){const c=cs[i];glyphs.push({cluster:c,distance:width,point:geometry.point(width+c.advance/2)});width+=c.advance;}
   fragments.push({start,end,geometry,glyphs,width});start=end;
  }
  return this.previous={fragments,overflow:start,length:cs.length};
 }
 clear(){this.previous=undefined;}
}
export interface CaretPoint extends PathPoint {index:number;affinity:'before'|'after';height:number}
export function caretAt(layout:FlowLayout,index:number,affinity:'before'|'after'='after'):CaretPoint|undefined {
 const f=(affinity==='before'?layout.fragments.find(f=>index>=f.start&&index<=f.end):layout.fragments.find(f=>index>=f.start&&index<f.end))??layout.fragments.at(-1);
 if(!f)return;const g=f.glyphs.find(g=>g.cluster.start>=index),distance=g?.distance??f.width;
 return {...f.geometry.point(distance),index,affinity,height:24};
}
export function hitCaret(layout:FlowLayout,x:number,y:number):CaretPoint|undefined {
 let best:CaretPoint|undefined,score=Infinity;
 for(const f of layout.fragments){
  const stops=[...f.glyphs.map(g=>({index:g.cluster.start,d:g.distance})),{index:f.end,d:f.width}];
  for(const s of stops){const p=f.geometry.point(s.d),d=(x-p.x)**2+(y-p.y+7)**2;if(d<score){score=d;best={...p,index:s.index,affinity:s.index===f.end?'before':'after',height:24};}}
 }
 return best;
}
/** Shared range fragments for native annotation/temporary-range renderers. */
export function rangeBoxes(layout:FlowLayout,start:number,end:number){
 return layout.fragments.flatMap(f=>f.glyphs.filter(g=>g.cluster.end>start&&g.cluster.start<end&&g.cluster.text!=='\n').map(g=>{
  const r=g.point.angle*Math.PI/180,w=g.cluster.advance,h=24,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r));
  return {x:g.point.x-w*c/2-18*s,y:g.point.y-18*c-w*s/2,width:w*c+h*s,height:h*c+w*s};
 }));
}

/** Local range geometry shared by carets/popups/decorations. Unchanged fragments
 * retain boxes, even when another path in this source reflows. */
export class RangeGeometryCache {
 private cache=new Map<string,{fragments:LineFragment[];boxes:ReturnType<typeof rangeBoxes>;local:import('../../rendering/decorations').VisualFragment[]}>();
 builds=0;
 get(layout:FlowLayout,start:number,end:number){
  const key=`${start}:${end}`,fragments=layout.fragments.filter(f=>f.end>start&&f.start<end),old=this.cache.get(key);
  if(old&&old.fragments.length===fragments.length&&old.fragments.every((f,i)=>f===fragments[i]))return old.boxes;
  this.builds++;const boxes=rangeBoxes({...layout,fragments},start,end);const local=fragments.flatMap(f=>f.glyphs.filter(g=>g.cluster.end>start&&g.cluster.start<end&&g.cluster.text!=='\n').map(g=>({x:-g.cluster.advance/2,y:-18,width:g.cluster.advance,height:24,matrix:[Math.cos(g.point.angle*Math.PI/180),Math.sin(g.point.angle*Math.PI/180),-Math.sin(g.point.angle*Math.PI/180),Math.cos(g.point.angle*Math.PI/180),g.point.x,g.point.y]})));this.cache.set(key,{fragments,boxes,local});if(this.cache.size>256)this.cache.delete(this.cache.keys().next().value!);return boxes;
 }
 local(layout:FlowLayout,start:number,end:number){this.get(layout,start,end);return this.cache.get(`${start}:${end}`)!.local;}
 clear(){this.cache.clear();}
}
