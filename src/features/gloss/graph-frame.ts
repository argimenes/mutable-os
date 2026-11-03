// Only frames actually created by the retained Gloss view qualify. A DOM attribute
// or a copied class cannot admit an authored/foreign iframe for Document transfer.
const frames=new WeakSet<Element>();
export function retainGlossGraphFrame(frame:HTMLIFrameElement){
 if(frame.getAttribute('sandbox')?.trim()!=='allow-scripts')throw Error('Gloss diagram must remain opaque');
 frames.add(frame);return()=>frames.delete(frame);
}
export function isRetainedGlossGraphFrame(element:Element){return frames.has(element)&&element.getAttribute('sandbox')?.trim()==='allow-scripts';}
