import {createEffect,createMemo,createSignal,For,onCleanup,onMount,Show} from 'solid-js';
import {useReactiveView} from '../../../src/reactive-editor/context';
import {useSpreadLeaf} from '../../../src/rendering/spread-block';
import {mountPdfViewer} from '../../../src/pdf/viewer';
import {inlineText,logicalInline} from '../../../src/block-tree/inline-sequence';

const px=value=>value+'px';
const assetURL=asset=>'/api/assets/'+encodeURIComponent(asset.assetId)+'/content?cavernId='+encodeURIComponent(asset.cavernId);
const declared=pagination=>[{type:'navigation/progress',version:1},{type:'navigation/page',version:1,pagination}];

// Each occupant interprets progress within its own current page viewport. Browser scroll
// notifications carry no cause. Only a live user gesture may publish, and applying a
// remote position revokes that gesture before touching scrollTop.
function navigation(props,metrics,composition){
  const {editor,projection}=useReactiveView(), node=projection.state.nodes[props.nodeKey], metadata=node.payload.metadata;
  const scope=useSpreadLeaf(props.nodeKey),memory=scope?.memory??new Map();
  const count=()=>composition?composition().pages.length:metadata.pages;
  const pageDomain=createMemo(()=>{
    if(!composition)return metadata.original.assetId==='sha256:'+metadata.pagination?metadata.pagination:undefined;
    const {pages,original}=composition();
    if(original.assetId==='sha256:'+metadata.pagination&&pages.length===metadata.pages&&pages.every((p,i)=>p.number===i+1))return metadata.pagination;
  });
  const [page,setPage]=createSignal(Math.min(count(),memory.get('page')??1));
  let viewport, intent=false, position=memory.get('position')??0, pending=true,appliedTop,root,live=true;
  const max=()=>Math.max(0,viewport.scrollHeight-viewport.clientHeight);
  const apply=()=>{if(!live||!viewport)return;intent=false;viewport.scrollTop=position*max();appliedTop=viewport.scrollTop;pending=false;};
  function select(value){
    if(value===page())return;
    intent=false;position=0;pending=true;setPage(value);
  }
  let lease;
  createEffect(()=>{
    const descriptors=declared(pageDomain()).filter(d=>d.type!=='navigation/page'||d.pagination);
    lease=scope?.register({publishes:descriptors,subscribes:descriptors,
    receive(event){const t=performance.now();metrics.received++;intent=false;
      if(event.type==='navigation/page')select(Math.min(count(),event.page));
      else{position=event.position;if(!pending)apply();}
      metrics.deliveryMs+=performance.now()-t;
    }});
  });
  createEffect(()=>{if(page()>count())select(Math.max(1,count()));});
  const local=()=>{lease?.intent();intent=true;};
  const choose=value=>{local();select(value);lease?.publish({type:'navigation/page',page:value});};
  const scroll=()=>{if(!pending && intent && lease?.currentIntent()){
    const top=viewport.scrollTop;if(top===appliedTop)return;appliedTop=undefined;
    const extent=max();position=extent?top/extent:0;
    metrics.published++;lease.publish({type:'navigation/progress',position});
  }};
  onMount(()=>{metrics.live++;onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:viewport,inputPolicy:'opaque-widget',focus:()=>viewport.focus()}));});
  onCleanup(()=>{live=false;metrics.live--;memory.set('page',page());memory.set('position',position);});
  return {page,choose,metadata,ready:apply,view:(title,contents)=><div class="folio-reader" ref={root} data-runtime-key={props.nodeKey} data-pagination-domain={pageDomain()}>
    <header><strong>{title}</strong><label>Page <select aria-label={title+' page'} value={page()} onChange={e=>choose(+e.currentTarget.value)}>
      <For each={Array.from({length:count()},(_,i)=>i+1)}>{n=><option value={n}>{n}</option>}</For>
    </select> / {count()}</label></header>
    <div tabindex="0" ref={viewport} class="folio-viewport" aria-label={title} onWheel={local} onPointerDown={local}
      onKeyDown={e=>{if(['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(e.key))local();}}
      onScroll={scroll}>{contents}</div></div>};
}
export function pdfLeaf(metrics,{cacheBytes=0}={}){
  let cached; // One verified source per publication reader. PDF.js takes ownership of its input.
  return function Original(props){
  const n=navigation(props,metrics),[viewer,setViewer]=createSignal(),[status,setStatus]=createSignal('Opening source…');
  const abort=new AbortController();let host;
  onCleanup(()=>abort.abort());
  onMount(async()=>{try{
    const asset=n.metadata.original,url=assetURL(asset);
    let bytes;
    if(cached?.url===url)bytes=cached.bytes.slice();
    else{
      const response=await fetch(url,{signal:abort.signal});
      if(!response.ok)throw Error('Managed PDF unavailable');
      bytes=new Uint8Array(await response.arrayBuffer());
      if(cacheBytes&&bytes.length<=cacheBytes){
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
        if(asset.assetId!=='sha256:'+Array.from(digest,v=>v.toString(16).padStart(2,'0')).join(''))throw Error('Managed PDF digest mismatch');
        abort.signal.throwIfAborted();cached={url,bytes:bytes.slice()};
      }
    }
    const instance=await mountPdfViewer(host,bytes,undefined,abort.signal,()=>{});
    if(!abort.signal.aborted)setViewer(instance);
  }catch(error){if(!abort.signal.aborted)setStatus(error.message);}});
  createEffect(()=>{const v=viewer(),page=n.page();if(!v)return;
    let current=true;onCleanup(()=>current=false);setStatus('Rendering page…');
    v.page(page-1,1.15).then(()=>{if(current){setStatus('');n.ready();}}).catch(e=>{if(current)setStatus(e.message);});
  });
  return n.view('Original PDF',<><Show when={status()}><output>{status()}</output></Show><div class="folio-pdf" ref={host}/></>);
};}

// Original whitespace is a minimum gap. A growing frame pushes its lane and following
// bands through normal block flow, without measuring a single character in JavaScript.
function bands(page){
  const rules=page.rules.filter(r=>r.width>0).map(frame=>({kind:'rule',frame:{...frame,height:Math.max(.7,frame.height??0)}}));
  const middle=page.width/2, sorted=[...page.frames,...rules].sort((a,b)=>a.frame.y-b.frame.y||a.frame.x-b.frame.x);
  const groups=[];let group;
  for(const f of sorted){
    const wide=f.frame.x<middle && f.frame.x+f.frame.width>middle;
    if(wide||!group){group={top:f.frame.y,lanes:[[],[]]};groups.push(group);}
    group.lanes[!wide&&f.frame.x>=middle?1:0].push(f);
    if(wide)group=undefined;
  }
  let bottom=0;
  return groups.map(g=>{
    const gap=Math.max(0,g.top-bottom);
    bottom=Math.max(bottom,...g.lanes.flat().map(f=>f.frame.y+f.frame.height));
    return {gap,lanes:g.lanes.map(lane=>{let end=g.top;return lane.map(f=>{
      const gap=Math.max(0,f.frame.y-end);end=f.frame.y+f.frame.height;return {f,gap};
    });})};
  });
}
export function compositionLeaf(publication,metrics){
  // Keep managed figure reads within the store's foreground concurrency limit alongside the PDF.
  let images=Promise.resolve();
  function FigureImage(props){
    const [src,setSrc]=createSignal(),[error,setError]=createSignal('');
    let url,abort=new AbortController();
    function load(){
      setError('');
      images=images.then(async()=>{
        if(abort.signal.aborted)return;
        try{
          const response=await fetch(assetURL(props.c.payload.asset),{signal:abort.signal});
          if(!response.ok)throw Error('Managed figure unavailable');
          const blob=await response.blob();abort.signal.throwIfAborted();
          url=URL.createObjectURL(blob);setSrc(url);
        }catch(e){if(!abort.signal.aborted)setError(e.message);}
      });
    }
    onMount(load);onCleanup(()=>{abort.abort();if(url)URL.revokeObjectURL(url);});
    return <Show when={!error()} fallback={<button onClick={load}>{error()} · Retry</button>}>
      <img width={props.box.width} height={props.box.height} src={src()} alt={props.c.payload.metadata.alt}/>
    </Show>;
  }
  return function Composition(props){
  const {state,root,byId}=publication,nav=navigation(props,metrics,()=>root.payload.metadata.folio);
  if(root.payload.id!==nav.metadata.publicationId)throw Error('Unknown publication identity');
  const interaction=publication.interaction;
  if(interaction){interaction.connect(nav);onCleanup(()=>interaction.disconnect(nav));}
  const current=createMemo(()=>root.payload.metadata.folio.pages[nav.page()-1]);
  const groups=createMemo(()=>current()?bands(current()):[]);
  createEffect(()=>{current();queueMicrotask(nav.ready);});
  function Frame({item,side}){
    const {f,gap}=item,b=f.frame;
    const style={'margin-top':px(gap),'margin-left':px(b.x-side*current().width/2),width:px(b.width+1),'min-height':px(b.height),
      'font-family':f.family,'font-size':px(f.fontSize??12),'line-height':px(f.leading??14),'text-align':f.align};
    if(f.kind==='rule')return <hr class="composed-rule" style={style}/>;
    const key=()=>byId.get(f.id);
    return <Show when={state.contents[key()]} keyed fallback={<aside style={style}>Frame content unavailable</aside>}>
      {c=><ContentFrame c={c} f={f} style={style}/>}</Show>;
  }
  function ContentFrame({c,f,style}){
    const b=f.frame;
    if(c.viewType==='image-block')return <figure class="composed-figure" style={style}>
      <Show when={interaction&&c.payload.asset} fallback={<img width={b.width} height={b.height} src={interaction?undefined:c.payload.asset?assetURL(c.payload.asset):c.payload.metadata.url} alt={c.payload.metadata.alt}/>}>
        <FigureImage c={c} box={b}/>
      </Show>
      <Show when={c.payload.metadata.labels}><details><summary>Figure labels</summary>
        <For each={c.payload.metadata.labels}>{label=><p>{label}</p>}</For>
      </details></Show></figure>;
    const slice=createMemo(()=>{
      void c.revision;const text=inlineText(logicalInline(state,c)),chars=Array.from(text);
      const cut=(value)=>interaction?interaction.cut(text,value):Math.min(chars.length,value??chars.length);
      return {chars,start:cut(f.start??0),end:cut(f.end)};
    });
    const runs=createMemo(()=>{
      if(metrics.record)metrics.frameReads.push(c.key);
      const {chars,start,end}=slice();
      const properties=(c.payload.standoffProperties??[]).filter(p=>!p.isDeleted&&p.end>=start&&p.start<end)
        .map(p=>p.annotationId?publication.editor.linkedAnnotations.resolve(p,c.key):p).filter(p=>!p.isDeleted);
      const cuts=[...new Set([start,end,...properties.flatMap(p=>[Math.max(start,p.start),Math.min(end,p.end+1)])])].sort((a,b)=>a-b);
      return cuts.slice(1).map((stop,i)=>{const active=properties.filter(p=>p.start<=cuts[i]&&p.end>=cuts[i]),entity=active.find(p=>p.type==='codex/entity-reference');
        return {text:chars.slice(cuts[i],stop).join(''),entity,highlight:active.find(p=>p.type==='style/highlight')?.value,gloss:active.find(p=>p.type==='mutable/gloss'),bold:active.some(p=>p.type==='style/bold'),italic:active.some(p=>p.type==='style/italics')};
      });
    });
    let frame;
    if(interaction)onMount(()=>onCleanup(interaction.mount(frame,c,f,slice)));
    return <div ref={frame} class="composed-frame" style={style} data-frame={f.id} data-content={c.key} data-start={slice().start}><span class="folio-ink"><For each={runs()}>{r=>
      <span data-reference={r.entity?.id} data-entity={r.entity?.value} data-gloss={r.gloss?.annotationId} title={r.entity?.metadata?.entityName??r.gloss?.value} style={{'background-color':r.highlight,'font-weight':r.bold?'bold':undefined,'font-style':r.italic?'italic':undefined}}>{r.text}</span>}</For></span><Show when={interaction}>{i=>i().overlay(c,slice)}</Show></div>;
  }
  return nav.view('Mutable Folio',<article class="folio-sheet" style={{zoom:interaction?.zoom(),width:px(current()?.width??0),'min-height':px(current()?.height??0)}}>
    <For each={groups()}>{g=><div class="folio-band" style={{'padding-top':px(g.gap)}}><For each={g.lanes}>{(lane,i)=>
      <div class="folio-lane"><For each={lane}>{item=><Frame item={item} side={i()}/>}</For></div>}</For></div>}</For>
  </article>);
};}
