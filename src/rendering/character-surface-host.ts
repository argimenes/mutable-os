import type { CharacterSurface, CharacterSurfacePresentation, EffectParams, VisualRenderer } from '../runtime/visual-effect-registry';

export interface CharacterSurfaceRequest {
  identity: string;
  cell: HTMLElement;
  text: string;
  renderer: Extract<VisualRenderer,{target:'character-surface'}>;
  params: EffectParams;
}
interface Entry {
  request: CharacterSurfaceRequest;
  token: string;
  signature: string;
  surface?: CharacterSurface;
  image?: HTMLImageElement;
  ready: boolean;
  live: boolean;
  dirty: boolean;
  spacing?: number;
  font?: string;
  color?: string;
  observer: MutationObserver;
  abort:AbortController;
  listeners:Set<(state:CharacterSurfacePresentation)=>void>;
  presentation:CharacterSurfacePresentation;
  visible:boolean;
  nearby:boolean;
  scale:number;
  scaleStale:boolean;
}
let serial=0;
const fontSignature=(s:CSSStyleDeclaration)=>[s.font,s.fontFamily,s.fontSize,s.fontWeight,s.fontStyle,s.fontStretch,s.fontVariant,s.fontFeatureSettings,s.fontVariationSettings,s.textTransform,s.direction,s.unicodeBidi,s.display,s.visibility,s.color].join('|');

/** Occurrence-local DOM presentation owned by existing range bindings. Never
 * edits text, selection or the repository. No paragraph traversal or input listener.
 * Geometry work runs in the caller's existing annotation measurement frame. */
export class CharacterSurfaceHost {
  private entries=new Map<string,Entry>();
  private style:HTMLStyleElement;
  private disposed=false;
  private composing=false;
  private ancestors:MutationObserver;
  private resize?:ResizeObserver;
  private viewport?:IntersectionObserver;
  private vicinity?:IntersectionObserver;
  private dprQuery?:MediaQueryList;
  private fonts:FontFaceSet;
  private textObserver:MutationObserver;
  private bidiNodes=new WeakMap<Node,number>();
  private bidiCount=0;
  private bidi(text:string){return text.match(/[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff\u200e\u200f\u202a-\u202e\u2066-\u2069\u{10800}-\u{10fff}\u{1e800}-\u{1eeff}]/gu)?.length??0;}
  private textNodes(node:Node,visit:(text:Node)=>void){
    if(node.nodeType===3){visit(node);return;}
    const walker=this.flow.ownerDocument.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    for(let text=walker.nextNode();text;text=walker.nextNode())visit(text);
  }
  private invalidate=()=>{for(const e of this.entries.values())e.dirty=true;if(this.entries.size)this.schedule();};
  private attributesChanged=()=>{for(const e of this.entries.values())if(e.listeners.size)e.scaleStale=true;this.invalidate();};
  private watchDpr=()=>{
    this.dprQuery?.removeEventListener('change',this.watchDpr);
    const win=this.flow.ownerDocument.defaultView;
    this.dprQuery=win?.matchMedia?.(`(resolution: ${win.devicePixelRatio}dppx)`);
    this.dprQuery?.addEventListener('change',this.watchDpr);this.invalidate();
  };
  private fontsChanged=()=>{for(const e of this.entries.values())e.font=undefined;this.invalidate();};
  private start=()=>{this.composing=true;for(const e of this.entries.values())this.hide(e);};
  private end=()=>{this.composing=false;queueMicrotask(()=>{if(!this.disposed){for(const e of this.entries.values())e.font=undefined;this.invalidate();}});};

  constructor(private flow:HTMLElement,private schedule:()=>void){
    this.style=flow.ownerDocument.createElement('style');flow.ownerDocument.head.appendChild(this.style);
    this.ancestors=new MutationObserver(this.attributesChanged);
    // Only ancestor attributes, never subtree mutations or text changes.
    for(let ancestor:HTMLElement|null=flow;ancestor;ancestor=ancestor.parentElement)this.ancestors.observe(ancestor,{attributes:true,attributeFilter:['style','class','dir','hidden']});
    if(typeof ResizeObserver!=='undefined'){this.resize=new ResizeObserver(this.invalidate);this.resize.observe(flow);}
    // One local text walk at attachment, then only changed/added/removed text.
    // Mixed bidi falls back without a paragraph scan on every keystroke.
    this.textNodes(flow,node=>{const count=this.bidi(node.nodeValue??'');if(count)this.bidiNodes.set(node,count);this.bidiCount+=count;});
    this.textObserver=new MutationObserver(records=>{
      const changed=new Set<Node>(),before=this.bidiCount;
      for(const record of records)if(record.type==='characterData')changed.add(record.target);
      else for(const node of [...record.addedNodes,...record.removedNodes])this.textNodes(node,text=>changed.add(text));
      for(const node of changed){const old=this.bidiNodes.get(node)??0,next=flow.contains(node)?this.bidi(node.nodeValue??''):0;this.bidiCount+=next-old;if(next)this.bidiNodes.set(node,next);else this.bidiNodes.delete(node);}
      if(!!before!==!!this.bidiCount){for(const e of this.entries.values()){e.font=undefined;if(this.bidiCount)this.hide(e);}this.invalidate();}
    });
    this.textObserver.observe(flow,{subtree:true,childList:true,characterData:true});
    this.fonts=flow.ownerDocument.fonts;
    this.fonts?.addEventListener('loadingdone',this.fontsChanged);
    this.fonts?.ready.then(()=>{if(!this.disposed)this.fontsChanged();});
    flow.addEventListener('compositionstart',this.start);flow.addEventListener('compositionend',this.end);
    flow.ownerDocument.defaultView?.addEventListener('resize',this.invalidate);
  }
  update(requests:readonly CharacterSurfaceRequest[]){
    if(this.disposed)return;
    let changed=false;
    const retained=new Set(requests.map(r=>r.identity));
    for(const [id,e] of this.entries)if(!retained.has(id)){this.release(e);this.entries.delete(id);changed=true;}
    for(const request of requests){
      const previous=this.entries.get(request.identity);
      if(previous?.request.cell===request.cell&&previous.request.text===request.text&&previous.request.params===request.params&&previous.request.renderer===request.renderer)continue;
      const signature=JSON.stringify([request.text,request.params]);
      if(previous?.request.cell===request.cell&&previous.signature===signature&&previous.request.renderer===request.renderer){previous.request=request;continue;}
      changed=true;
      if(previous)this.release(previous);
      const e:Entry={request,signature,token:`character-${++serial}`,ready:false,live:true,dirty:true,observer:new MutationObserver(()=>{e.dirty=true;e.scaleStale=true;this.schedule();}),
        abort:new AbortController(),listeners:new Set(),presentation:{visibility:'offscreen',pixelRatio:this.flow.ownerDocument.defaultView?.devicePixelRatio??1},visible:false,nearby:false,scale:1,scaleStale:true};
      this.entries.set(request.identity,e);
      e.observer.observe(request.cell,{attributes:true,attributeFilter:['style','class','dir','hidden']});
      try{
        const surface=request.renderer.surface(request.text,request.params,this.flow.ownerDocument,{
          signal:e.abort.signal,presentation:e.presentation,ready:surface=>this.ready(e,surface),
          observe:listener=>{e.listeners.add(listener);this.observeVisibility(e);return ()=>e.listeners.delete(listener);},
        });
        if(surface)this.ready(e,surface);
      }catch{/* Ordinary source text remains available. */}
    }
    if(changed)this.rules();
  }
  private ready(e:Entry,surface:CharacterSurface|undefined){
    if(!this.current(e))return;
    if(surface&&e.surface?.image===surface.image)return;
    const wasReady=e.ready;
    if(e.image){e.image.onload=e.image.onerror=null;e.image.removeAttribute?.('src');e.image=undefined;}
    e.ready=false;e.surface=undefined;this.hide(e);
    if(wasReady)this.schedule();
    const local=surface&&(/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(surface.image)||surface.image.startsWith(`blob:${this.flow.ownerDocument.location.origin}/`));
    if(!surface||!local||![surface.width,surface.height].every(n=>Number.isFinite(n)&&n>=16&&n<=128)){this.rules();return;}
    e.surface=surface;const image=new Image();e.image=image;
    image.onload=()=>{if(!this.current(e)||e.image!==image)return;e.ready=true;e.dirty=true;e.font=undefined;this.rules();this.schedule();};
    image.onerror=()=>{if(this.current(e)&&e.image===image){e.ready=false;this.hide(e);}};
    image.src=surface.image;
  }
  private presentation(e:Entry){
    const next:CharacterSurfacePresentation={visibility:e.visible?'visible':e.nearby?'nearby':'offscreen',pixelRatio:(this.flow.ownerDocument.defaultView?.devicePixelRatio??1)*e.scale};
    if(next.visibility===e.presentation.visibility&&next.pixelRatio===e.presentation.pixelRatio)return;
    e.presentation=next;for(const listener of e.listeners)listener(next);
  }
  private observeVisibility(e:Entry){
    if(!this.dprQuery)this.watchDpr();
    if(typeof IntersectionObserver==='undefined'){e.visible=true;this.presentation(e);return;}
    const notify=(nearby:boolean)=>(observations:IntersectionObserverEntry[])=>{for(const observation of observations){const entry=[...this.entries.values()].find(e=>e.request.cell===observation.target);if(!entry)continue;if(nearby)entry.nearby=observation.isIntersecting;else entry.visible=observation.isIntersecting;this.presentation(entry);}};
    this.viewport??=new IntersectionObserver(notify(false));
    this.vicinity??=new IntersectionObserver(notify(true),{rootMargin:'300px'});
    this.viewport.observe(e.request.cell);this.vicinity.observe(e.request.cell);
  }
  private current(e:Entry){return !this.disposed&&e.live&&e.request.cell.childNodes.length===1&&e.request.cell.firstChild?.nodeType===3&&this.entries.get(e.request.identity)===e&&e.request.cell.parentElement===this.flow&&e.request.cell.textContent===e.request.text;}
  private hide(e:Entry){e.request.cell.removeAttribute('data-character-surface');e.request.cell.removeAttribute('data-character-measure');}
  private rules(){this.style.textContent=[...this.entries.values()].filter(e=>e.surface&&e.ready).map(e=>{
    const s=e.surface!;
    return `[data-character-surface="${e.token}"]{display:inline-block!important;width:${s.width}px!important;height:${s.height}px!important;line-height:${s.height}px!important;letter-spacing:${e.spacing??0}px!important;color:transparent!important;caret-color:${e.color??'#111'}!important;background:url("${s.image}") center/100% 100% no-repeat!important;vertical-align:baseline!important;}\n[data-character-measure="${e.token}"]{display:inline-block!important;width:1px!important;height:auto!important;letter-spacing:0!important;}`;
  }).join('\n');}
  /** Called only from the shared local measurement frame. Unchanged typing does
   * not remeasure the source glyph. Probe all dirty entries, then read, then paint. */
  measure(){
    if(this.disposed||this.composing)return;
    for(const e of this.entries.values())if(e.listeners.size)this.presentation(e);
    const probes:Entry[]=[];
    let supported=this.bidiCount===0;
    if([...this.entries.values()].some(e=>e.dirty&&e.ready))for(let ancestor:HTMLElement|null=this.flow;ancestor;ancestor=ancestor.parentElement){
      const css=getComputedStyle(ancestor);
      if(css.display==='none'||css.visibility==='hidden'||css.direction==='rtl'||['bidi-override','isolate-override','plaintext'].includes(css.unicodeBidi))supported=false;
      if(css.transform!=='none'&&css.transform&&typeof DOMMatrix!=='undefined'){
        const matrix=new DOMMatrix(css.transform);
        if(!matrix.is2D||matrix.b!==0||matrix.c!==0||matrix.a<=0||matrix.d<=0)supported=false;
      }
    }
    for(const e of this.entries.values()){
      if(!e.dirty||!e.ready||!this.current(e))continue;
      e.dirty=false;
      // Temporarily remove only our rules, never source styles or Text nodes.
      this.hide(e);
      const computed=getComputedStyle(e.request.cell),font=fontSignature(computed);
      if(!supported||computed.direction!=='ltr'||computed.unicodeBidi!=='normal'||computed.visibility==='hidden'||computed.display==='none'){e.font=undefined;continue;}
      if(e.font===font&&e.spacing!==undefined&&!e.scaleStale){e.request.cell.dataset.characterSurface=e.token;continue;}
      e.font=font;e.color=computed.color==='rgba(0, 0, 0, 0)'?'#111':computed.color;
      e.request.cell.dataset.characterMeasure=e.token;probes.push(e);
    }
    const results=probes.map(e=>{
      const cell=e.request.cell,range=this.flow.ownerDocument.createRange();range.selectNodeContents(cell);
      const scale=cell.getBoundingClientRect().width; // 1 CSS px probe, including zoom/scale.
      const advance=scale>0?range.getBoundingClientRect().width/scale:0;
      e.scaleStale=false;return {e,advance,scale};
    });
    for(const {e,advance} of results){
      e.request.cell.removeAttribute('data-character-measure');
      if(!Number.isFinite(advance)||advance<=0||advance>e.surface!.width){e.font=undefined;continue;}
      e.spacing=e.surface!.width-advance;
    }
    if(results.length)this.rules();
    for(const {e,advance} of results)if(e.spacing!==undefined&&advance>0&&advance<=e.surface!.width&&this.current(e))e.request.cell.dataset.characterSurface=e.token;
    for(const {e,scale} of results)if(e.listeners.size&&scale>0){e.scale=scale;this.presentation(e);}
  }
  private release(e:Entry){e.live=false;e.abort.abort();e.listeners.clear();this.viewport?.unobserve(e.request.cell);this.vicinity?.unobserve(e.request.cell);this.hide(e);e.observer.disconnect();if(e.image){e.image.onload=e.image.onerror=null;e.image.removeAttribute?.('src');e.image=undefined;}}
  dispose(){if(this.disposed)return;this.disposed=true;for(const e of this.entries.values())this.release(e);this.entries.clear();this.style.remove();this.ancestors.disconnect();this.textObserver.disconnect();this.resize?.disconnect();this.viewport?.disconnect();this.vicinity?.disconnect();this.dprQuery?.removeEventListener('change',this.watchDpr);this.fonts?.removeEventListener('loadingdone',this.fontsChanged);this.flow.removeEventListener('compositionstart',this.start);this.flow.removeEventListener('compositionend',this.end);this.flow.ownerDocument.defaultView?.removeEventListener('resize',this.invalidate);}
}
