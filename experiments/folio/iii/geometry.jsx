import {createSignal,createEffect,onCleanup,For,batch} from 'solid-js';
import {Region} from '../../../src/rendering/visual-effect-renderers';
import {resolveThreads} from '../../../src/features/folio/threads';
export function spatialGeometry(editor,nodeKeys,zoom,enabled,focus,instrument){
  const mounted=new Map(),[paths,setPaths]=createSignal([]),[version,bump]=createSignal(0);
  let stage,inspector,frame=0,closed=false;
  function invalidate(){if(!closed&&!frame)frame=requestAnimationFrame(refresh);}
  function refresh(){
    frame=0;const updates=[],endpoints=new Map(),links=[],thread=enabled()&&focus()&&inspector?.isConnected&&stage;
    const origins=new Map(),clips=new Map();
    for(const entry of mounted.values()){
      const {el}=entry;if(!el.isConnected)continue;
      if(entry.dirty){
        entry.dirty=false;
        const rangeDecorations=editor.decorations.nodes[nodeKeys().get(entry.id)]??[],parts=[],scale=zoom();
        if(rangeDecorations.length){
          const origin=el.getBoundingClientRect();origins.set(el,origin);
          const spans=[...el.querySelectorAll(':scope > .folio-ink > span')];
          for(const d of rangeDecorations){
            const start=Math.max(entry.slice().start,d.range.start),end=Math.min(entry.slice().end,d.range.end);
            if(start>=end)continue;
            let at=entry.slice().start;const fragments=[];
            for(const span of spans){const chars=Array.from(span.textContent),last=at+chars.length;
              if(at<end&&last>start&&span.firstChild){const r=document.createRange();r.setStart(span.firstChild,chars.slice(0,Math.max(0,start-at)).join('').length);r.setEnd(span.firstChild,chars.slice(0,end-at).join('').length);
                instrument.rangeReads++;for(const b of r.getClientRects())fragments.push({x:(b.left-origin.left)/scale,y:(b.top-origin.top)/scale,width:b.width/scale,height:b.height/scale});}
              at=last;if(at>=end)break;
            }
            parts.push({key:d.runtimeKey,fill:d.fill,fragments,range:d.range});
          }
        }
        entry.cache=parts;updates.push(entry);
      }
      if(thread&&entry.cache.length){
        const origin=origins.get(el)??el.getBoundingClientRect(),viewport=el.closest('.folio-viewport');
        if(!clips.has(viewport))clips.set(viewport,viewport.getBoundingClientRect());
        for(const part of entry.cache){if(part.fill!=='#79a889')continue;
          const to=part.key+entry.id;
          endpoints.set(to,[{occurrence:entry.id,clip:clips.get(viewport),rects:part.fragments.map(f=>({left:origin.left+f.x*zoom(),top:origin.top+f.y*zoom(),right:origin.left+(f.x+f.width)*zoom(),bottom:origin.top+(f.y+f.height)*zoom()}))}]);
          links.push({id:to,from:focus(),to,kind:'entity-mention',origin:'native-semantic-binding',review:'not-applicable'});
        }
      }
    }
    let next=[];
    if(thread){instrument.threadFrames++;const bounds=stage.getBoundingClientRect();endpoints.set(focus(),[{occurrence:'inspector',clip:bounds,rects:[inspector.getBoundingClientRect()]}]);next=resolveThreads(links,endpoints,bounds);}
    batch(()=>{for(const e of updates)e.set(e.cache);setPaths(next);});
  }
  const placement=new MutationObserver(()=>{if(enabled())invalidate();});
  const resize=new ResizeObserver(entries=>{for(const e of entries){const item=mounted.get(e.target);if(item)item.dirty=true;}invalidate();});
  function dirty(){for(const e of mounted.values())e.dirty=true;invalidate();}
  function scroll(){if(enabled())invalidate();}
  document.addEventListener('scroll',scroll,true);document.fonts?.addEventListener('loadingdone',dirty);
  createEffect(()=>{zoom();dirty();});createEffect(()=>{enabled();focus();invalidate();});
  onCleanup(()=>{closed=true;cancelAnimationFrame(frame);resize.disconnect();placement.disconnect();document.removeEventListener('scroll',scroll,true);document.fonts?.removeEventListener('loadingdone',dirty);});
  return {paths,invalidate,setStage(el){stage=el;resize.observe(el);placement.observe(el,{subtree:true,attributes:true,attributeFilter:['data-leaf']});},setInspector(el){inspector=el;invalidate();},
    mount(el,c,f,slice){
      const [shapes,set]=createSignal([]),entry={el,id:f.id,slice,shapes,set,dirty:true,cache:[]};mounted.set(el,entry);bump(n=>n+1);resize.observe(el);
      createEffect(()=>{c.revision;editor.decorations.nodes[nodeKeys().get(f.id)];entry.dirty=true;invalidate();});
      return ()=>{mounted.delete(el);resize.unobserve(el);invalidate();};
    },
    overlay(c,slice){
      const shapes=()=>{version();return [...mounted.values()].find(e=>e.id===c.payload.id&&e.slice===slice)?.shapes()??[];};
      return <svg class="folio-range-layer" aria-hidden="true"><For each={shapes()}>{p=><Region identity={p.key} tag="editor/folio-preview" geometry={()=>({fragments:p.fragments,offset:0})} params={()=>({color:p.fill,opacity:.34})}/>}</For></svg>;
    }};
}
