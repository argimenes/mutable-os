// DOM Range offsets are UTF-16 code units. Native annotation endpoints count code points.
export function selectionInFrame(selection) {
  if(!selection || selection.isCollapsed || selection.rangeCount!==1) return;
  const range=selection.getRangeAt(0);
  const enclosing=node=>(node.nodeType===1?node:node.parentElement)?.closest('[data-frame]');
  const frame=enclosing(range.startContainer);
  if(!frame || frame!==enclosing(range.endContainer)) return;
  const prefix=range.cloneRange();
  prefix.selectNodeContents(frame);
  prefix.setEnd(range.startContainer,range.startOffset);
  const start=[...prefix.toString()].length;
  return {id:frame.dataset.frame,key:frame.dataset.content,start,end:start+[...range.toString()].length,
    text:range.toString()};
}

export async function readSource(url, expectedHash) {
  const response=await fetch(url);
  if(!response.ok) throw Error('Source evidence unavailable');
  let bytes=await response.arrayBuffer();
  const signature=new Uint8Array(bytes,0,2);
  if(signature[0]===0x1f && signature[1]===0x8b)
    bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if(Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')!==expectedHash) throw Error('Source evidence version mismatch');
  return JSON.parse(new TextDecoder().decode(bytes));
}
