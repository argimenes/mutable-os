// Mutable-owned still-image transport. The pinned upstream engine below is unchanged.
import {Renderer} from './6cf93f7d3d2922efdbeb86cafa27f39758be9398/render/src/render.js?v=a8136959';
import {fontList,loadFont} from './6cf93f7d3d2922efdbeb86cafa27f39758be9398/render/src/fonts.js?v=a8136959';
import {need} from './6cf93f7d3d2922efdbeb86cafa27f39758be9398/render/src/kinds.js?v=a8136959';
let renderer,startupMs=0,first=true;
const startup=performance.now();
const ready=fontList().then(()=>{renderer=new Renderer();startupMs=performance.now()-startup;});
// An early rejection must stay handled until the first request arrives.
ready.catch(()=>{});
self.onmessage=async({data:q})=>{
  const started=performance.now();let bitmap;
  try{
    if(!/^[A-Z]$/.test(q.text)||![128,256,512].includes(q.size)||q.settings.font!=='cormorant-garamond-700'||q.settings.lBlob!==0)throw Error('Unsupported still-image request');
    await ready;
    const font=await loadFont(q.settings.font);if(!font)throw Error('Bundled font unavailable');
    const P={...q.settings,text:q.text};await need(P);
    const canvas=new OffscreenCanvas(q.size,q.size),ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
    await renderer.prepare(P,{size:q.size,quality:.6,budget:8000});
    renderer.draw(ctx,P,{quality:.6,budget:8000,time:null,clear:false});
    if(renderer.ink.gl.isContextLost())throw Error('WebGL context lost');
    const blob=await canvas.convertToBlob({type:'image/png'});
    bitmap=canvas.transferToImageBitmap();
    self.postMessage({id:q.id,bitmap,blob,renderMs:performance.now()-started,startupMs:first?startupMs:0},[bitmap]);bitmap=undefined;first=false;
  }catch(error){bitmap?.close();self.postMessage({id:q.id,error:String(error)});}
  finally{
    // Bitmap reuse belongs to Mutable. Retain no upstream scene/last-scene cache.
    if(renderer){renderer.scenes.clear();renderer.last.clear();while(renderer.painters.size>3)renderer.painters.delete(renderer.painters.keys().next().value);}
  }
};
