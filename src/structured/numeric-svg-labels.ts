/** Mermaid 12's non-HTML labels can retain escaped numeric entities, including
 * entities split over wrapped tspans. Decode once into Text nodes only. */
export function decodeNumericSvgLabels(root:Element){
 for(const label of root.querySelectorAll('text')){
  const walker=document.createTreeWalker(label,NodeFilter.SHOW_TEXT),parts:{node:Text;start:number;end:number}[]=[];let node:Node|null,original='';
  while(node=walker.nextNode()){const start=original.length;original+=node.textContent;parts.push({node:node as Text,start,end:original.length});}
  for(const match of [...original.matchAll(/&#(\d{1,7});/g)].reverse()){
   const cp=Number(match[1]);if(cp<32||cp>0x10ffff||cp>=0xd800&&cp<=0xdfff)continue;
   const start=match.index!,end=start+match[0].length;let first=true;
   for(const part of parts){if(part.end<=start||part.start>=end)continue;const a=Math.max(0,start-part.start),b=Math.min(part.end,end)-part.start;
    part.node.data=part.node.data.slice(0,a)+(first?String.fromCodePoint(cp):'')+part.node.data.slice(b);first=false;}
  }
 }
}
