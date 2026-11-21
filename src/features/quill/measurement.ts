/** Shaping boundary: clusters carry explicit canonical/UTF-16 spans and caret
 * stops. M2 can supply many glyphs per cluster and bidi visual runs here. */
export interface Cluster {start:number;end:number;utf16Start:number;utf16End:number;text:string;advance:number;style:string;direction:'ltr'|'rtl';carets:readonly number[]}
export interface ShapeResult {clusters:Cluster[];generation?:number;change?:{start:number;oldEnd:number;newEnd:number};diagnostic?:string}
export const supportedLatin=(text:string)=>/^[\x20-\x7e\n]*$/.test(text);
export const FONT='20px Georgia';
export class LatinMeasurer {
 private generation=0;
 private widths=new Map<string,number>();
 measurements=0;
 constructor(private measure:(text:string,font:string)=>number){}
 shape(text:string,styleAt:(index:number)=>string=()=>'',previous?:ShapeResult):ShapeResult {
  if(!supportedLatin(text))return {clusters:[],diagnostic:'Direct SVG editing currently supports printable ASCII Latin and line breaks. This text is preserved; Unicode shaping and IME editing require the native text surface.'};
  const clusters:Cluster[]=[];
  for(let i=0;i<text.length;i++){
   const style=styleAt(i),old=previous?.generation===this.generation?previous.clusters[i]:undefined;
   if(old?.text===text[i]&&old.style===style){clusters.push(old);continue;}
   const font=`${style.includes('italic')?'italic ':''}${style.includes('bold')?'bold ':''}${FONT}`,key=font+'\0'+text[i];
   let advance=this.widths.get(key);
   if(advance===undefined){advance=text[i]==='\n'?0:this.measure(text[i],font);this.widths.set(key,advance);this.measurements++;}
   clusters.push({start:i,end:i+1,utf16Start:i,utf16End:i+1,text:text[i],advance,style,direction:'ltr',carets:[i,i+1]});
  }
  const before=previous?.clusters??[];let start=0,suffix=0;
  const equal=(a:Cluster,b:Cluster)=>a.text===b.text&&a.style===b.style&&a.advance===b.advance;
  while(start<before.length&&start<clusters.length&&equal(before[start],clusters[start]))start++;
  while(suffix<before.length-start&&suffix<clusters.length-start&&equal(before[before.length-1-suffix],clusters[clusters.length-1-suffix]))suffix++;
  return {clusters,generation:this.generation,change:{start,oldEnd:before.length-suffix,newEnd:clusters.length-suffix}};
 }
 invalidate(){this.generation++;this.widths.clear();}
}
