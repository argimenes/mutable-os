export const GLOSS = 'mutable/gloss';
export const starterTypes = ['entity','thesis','claim','counter-argument','evidence','premise','assumption','definition','distinction','analogy','inference','question','uncertainty','objection','note','for-ai','for-reader'];
export function parseGloss(raw:string) { const i=raw.indexOf(':'); return {type:i<0?'':raw.slice(0,i).trim(),text:i<0?raw:raw.slice(i+1)}; }
export function glossDefinition(p:any):boolean { return p?.type===GLOSS && typeof p.value==='string' && p.metadata?.gloss?.version===1 && typeof p.metadata.gloss.localId==='string' && !!p.metadata.gloss.localId && !!p.metadata.gloss.links && typeof p.metadata.gloss.links==='object' && !Array.isArray(p.metadata.gloss.links); }
