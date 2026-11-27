const splitter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export function legalBreak(text,preferred){
  if(preferred===0)return 0;
  if(preferred===undefined)return Array.from(text).length;
  let offset=0,best=0,distance=Infinity,nearest=0,nearDistance=Infinity;
  for(const {segment} of splitter.segment(text)){
    offset+=Array.from(segment).length;
    const delta=Math.abs(offset-preferred);
    if(delta<nearDistance){nearest=offset;nearDistance=delta;}
    if(delta<=32 && delta<distance && /[\s\-\u2010]/u.test(segment)){best=offset;distance=delta;}
    if(offset>preferred+32)break;
  }
  return distance<Infinity?best:nearest;
}
export function spatialSelection(selection,editor,byId){
  if(!selection?.rangeCount||selection.isCollapsed)return;
  const range=selection.getRangeAt(0),element=n=>n.nodeType===1?n:n.parentElement;
  const start=element(range.startContainer)?.closest('.folio-ink'),end=element(range.endContainer)?.closest('.folio-ink');
  if(!start||!end||start.closest('.folio-sheet')!==end.closest('.folio-sheet'))return;
  const fragments=[];
  for(const ink of start.closest('.folio-sheet').querySelectorAll('.folio-ink')){
    if(!range.intersectsNode(ink))continue;
    const frame=ink.closest('[data-frame]'),key=byId().get(frame.dataset.frame);if(!key)throw Error('This passage is unavailable.');
    const piece=range.cloneRange();if(ink!==start)piece.setStart(ink,0);if(ink!==end)piece.setEnd(ink,ink.childNodes.length);
    const prefix=document.createRange();prefix.selectNodeContents(ink);prefix.setEnd(piece.startContainer,piece.startOffset);
    const from=prefix.toString().length,to=from+piece.toString().length;if(from===to)continue;
    const text=ink.textContent,edges=new Set([0,text.length,...Array.from(splitter.segment(text),s=>s.index)]);
    if(!edges.has(from)||!edges.has(to))throw Error('Select complete characters.');
    const at=Number(frame.dataset.start),a=at+Array.from(text.slice(0,from)).length,b=at+Array.from(text.slice(0,to)).length;
    const snap=editor.textRanges.snapshot(key,a,b),previous=fragments.at(-1);
    if(previous?.contentKey===snap.contentKey&&previous.end===a)previous.end=b;else fragments.push(snap);
  }
  return fragments.length?{ranges:fragments,text:range.toString(),anchor:start}:undefined;
}
