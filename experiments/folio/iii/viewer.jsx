import {createEffect,createMemo,createSignal,For,Show,onCleanup,onMount,untrack} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../../src/application/workspace-session';
import {WorkspacePresentationView} from '../../../src/application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../../src/reactive-editor/workspace-manifest';
import {nativeDocumentSession} from '../../../src/persistence/native-session';
import {ReactiveViewProvider} from '../../../src/reactive-editor/context';
import {FolioReaders} from '../../../src/rendering/folio-manifestation';
import {SpreadBlockView} from '../../../src/rendering/spread-block';
import {annotationCapabilities} from '../../../src/application/annotation-capabilities';
import {DocumentEntityList} from '../../../src/features/entity-references/document-entity-list';
import {inlineText,logicalInline} from '../../../src/block-tree/inline-sequence';
import {compositionLeaf,pdfLeaf} from '../ii/leaves';
import {legalBreak,spatialSelection} from './ranges.mjs';
import {spatialGeometry} from './geometry';
import {Scry,lookup} from './scry';
import '../../../src/index.css';
import '../../../src/demo/workspace-demo.css';
import '../viewer.css';
import '../ii/viewer.css';
import './viewer.css';

const host=document.querySelector('#folio');
async function start(){
 const settings=await fetch('./session.json').then(r=>r.json()),file=new URLSearchParams(location.search).get('file')??(settings.files.includes('bert.ink')?'bert.ink':settings.files[0]);
 if(!settings.files.includes(file))throw Error('Choose a native file in the reading vault.');
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[]}]}),
  {features:{nativeKnowledge:false,sqliteKnowledge:false,sqliteEntities:false,semanticRetrieval:false,desktopApplicationIcons:false,flintProbe:false,flintMaterialChrome:false}});
 const editor=session.editor;if(!editor.features.folioSemanticReading)throw Error('Folio reading is disabled.');
 editor.setAssetContext(()=>settings);
 const native=nativeDocumentSession(editor),startTime=performance.now(),id=await native.open({folder:'.',filename:file});
 const projection=editor.createView('folio-reader'),state=editor.repository.state;
 const rootNode=Object.values(projection.state.nodes).find(n=>n.payload.id===id),root=state.contents[rootNode.contentKey];
 const spread=rootNode.children.map(k=>projection.state.nodes[k]).find(n=>n.viewType==='spread-block');
 const pub=spread?.children.flatMap(k=>projection.state.nodes[k].children).map(k=>projection.state.nodes[k]).find(n=>n.viewType==='folio-publication-block');
 if(!pub){const label=document.createElement('label');label.textContent='This file has no Folio publication. Open another file ';
   const select=document.createElement('select');for(const f of settings.files)select.add(new Option(f,f,false,f===file));
   select.onchange=()=>{location.search='?file='+encodeURIComponent(select.value);};label.append(select);host.replaceChildren(label);session.dispose();return;}
 const metrics={frameReads:[],record:false,live:0,published:0,received:0,deliveryMs:0,threadFrames:0,rangeReads:0};
 let api;const disposeFeature=editor.featureHost.activate({id:'folio-reader',activate:scope=>{api=annotationCapabilities(editor,scope);}});
 const gateway=editor.installGateway(document);
 function App(){
  const [selection,setSelection]=createSignal(),[scry,setScry]=createSignal(),[notice,setNotice]=createSignal('');
  const [focus,setFocus]=createSignal(''),[active,setActive]=createSignal(''),[zoom,setZoom]=createSignal(1);
  const [gallery,setGallery]=createSignal(false),[filtered,setFiltered]=createSignal(false),[inspector,setInspector]=createSignal(true),[filter,setFilter]=createSignal('');
  const [threads,setThreads]=createSignal(false),[spotlight,setSpotlight]=createSignal(false),[minimap,setMinimap]=createSignal(true),[flint,setFlint]=createSignal(false),[nav,setNav]=createSignal();
  const pages=()=>root.payload.metadata.folio.pages,number=()=>nav()?.page()??1;
  const byKey=createMemo(()=>new Map(projection.state.nodes[pub.key].children.map(k=>[projection.state.nodes[k].payload.id,k])));
  const contentKey=id=>projection.state.nodes[byKey().get(id)]?.contentKey;
  const text=k=>inlineText(logicalInline(state,state.contents[k]));
  const index=createMemo(()=>{const m=new Map();for(const p of pages())for(const f of p.frames){if(!m.has(f.id))m.set(f.id,[]);m.get(f.id).push({page:p.number,f});}return m;});
  const unplaced=createMemo(()=>[...byKey().keys()].filter(id=>!index().has(id)));
  const inventory=new DocumentEntityList(api,async(ids,signal)=>Promise.all(ids.map(async id=>{const {entity}=await lookup({op:'get',id},signal);return {id,name:entity?.name??id};})));
  onMount(()=>inventory.open(pub.key,true));onCleanup(()=>inventory.close(false));
  const geometry=spatialGeometry(editor,byKey,zoom,threads,focus,metrics);
  const row=()=>inventory.state.rows.find(r=>r.id===focus());
  const property=r=>state.contents[r.contentKey]?.payload.standoffProperties?.find(p=>p.id===r.propertyId&&!p.isDeleted);
  function occurrences(r){
    const c=state.contents[r.contentKey];if(!c)return [];
    const frames=index().get(c.payload.id)??[],list=[];let chars;
    for(const {f,page} of frames){const a=f.start?legalBreak(chars??=text(c.key),f.start):0,b=f.end===undefined?Infinity:legalBreak(chars??=text(c.key),f.end);
      if(r.start<b&&r.end>a)list.push({page,f});}return list;
  }
  const currentRange=r=>{
    const p=property(r);
    return p&&{...r,start:p.start,end:p.end+1,version:state.contents[r.contentKey].inlineRevision};
  };
  const mentions=createMemo(()=>{
    const grouped=new Map();
    for(const range of row()?.ranges??[]){
      if(!grouped.has(range.mentionId))grouped.set(range.mentionId,[]);
      grouped.get(range.mentionId).push(range);
    }
    return [...grouped].map(([id,segments])=>{
      const locations=createMemo(()=>segments.flatMap(r=>{
        const frames=index().get(state.contents[r.contentKey]?.payload.id)??[];
        if(frames.length===1&&!frames[0].f.start&&frames[0].f.end===undefined)return frames;
        const current=currentRange(r);return current?occurrences(current):[];
      }),[],{equals:(a,b)=>a.length===b.length&&a.every((loc,i)=>loc.f===b[i].f)});
      return {id,get ranges(){return segments.map(currentRange).filter(Boolean);},get locations(){return locations();}};
    });
  });
  const counts=createMemo(()=>{
    if(metrics.record)metrics.summaryBuilds++;
    const result=new Map();
    for(const mention of mentions())for(const page of new Set(mention.locations.map(l=>l.page)))result.set(page,(result.get(page)??0)+1);
    return result;
  });
  const currentIndex=()=>mentions().findIndex(m=>m.id===active());
  function pin(id){setFocus(id);setActive('');}
  function pageGo(n){if(!nav()){setNotice('Reveal the Mutable Leaf to navigate.');return;}nav().choose(n);}
  let previewPage;
  function navigate(r){
    try{editor.textRanges.validate([r]);const loc=occurrences(r)[0];if(!loc)throw Error('This passage needs a composition frame. Open it in Flint.');
      previewPage=loc.page;pageGo(loc.page);editor.decorations.attachRanges('folio-navigation',[r],{fill:'#edb74c'});
      requestAnimationFrame(()=>host.querySelector('[data-frame="'+CSS.escape(loc.f.id)+'"][data-start]')?.scrollIntoView({block:'center',inline:'nearest'}));
    }catch(e){setNotice(e.message);}
  }
  function removeMention(){const mention=mentions()[currentIndex()],r=mention?.ranges[0],p=r&&property(r);
    if(!p)return;
    try{if(p.annotationId)editor.linkedAnnotations.deleteAll(p.annotationId,p,r.contentKey);
      else{const index=state.contents[r.contentKey].payload.standoffProperties.indexOf(p);editor.commands.editStandoffProperty(r.nodeKey,index,p,'delete');}
      setActive('');
    }catch(e){setNotice(e.message);}
  }
  function visit(m){if(!m)return;setActive(m.id);navigate(m.ranges[0]);}
  const step=d=>{const ms=mentions();if(ms.length)visit(ms[(Math.max(d<0?0:-1,currentIndex())+d+ms.length)%ms.length]);};
  createEffect(()=>{const n=number(),rs=mentions().flatMap(m=>m.locations.some(l=>l.page===n)?m.ranges:[]);untrack(()=>editor.decorations.attachRanges('folio-focus',rs,{fill:'#79a889'}));});
  createEffect(()=>{if(number()!==previewPage)untrack(()=>editor.decorations.clearHighlights('folio-navigation'));});
  const interaction={...geometry,cut:legalBreak,zoom,connect:n=>setNav(n),disconnect:n=>{if(nav()===n)setNav();}};
  const readers={publication:compositionLeaf({state,root,byId:{get:contentKey},editor,interaction},metrics),original:pdfLeaf(metrics,{cacheBytes:8*1024*1024})};
  function capture(){try{const s=spatialSelection(getSelection(),editor,byKey);setSelection(s);setNotice('');}catch(e){setSelection();setNotice(e.message);}}
  function annotate(action){try{const s=selection();if(!s)throw Error('Select a passage on the Mutable page.');editor.textRanges.validate(s.ranges,'cell');
    if(action==='Scry')setScry(s);else if(action==='Gloss'){if(s.ranges.length!==1)throw Error('Select one logical paragraph for a Gloss.');if(!editor.gloss.openSpatial(s.ranges[0],s.anchor))throw Error('Finish the open Gloss first.');}
    else{editor.rangeAnnotations.apply(s.ranges,'style/highlight','#ffe69b');}
  }catch(e){setNotice(e.message);}}
  async function toggleFlint(){if(!flint())await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});setFlint(!flint());}
  const [galleryStart,setGalleryStart]=createSignal(0),galleryPages=createMemo(()=>filtered()?pages().filter(p=>counts().has(p.number)):pages());
  function jumpToPage(n){pageGo(n);setGalleryStart(Math.floor((n-1)/8)*8);}
  const save=()=>native.save(id).then(result=>{if(result?.phase!=='saved')setNotice(result?.error??native.notice??'Check the save status.');}).catch(e=>setNotice(e.message));
  function keys(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();void save();}}
  window.addEventListener('keydown',keys,true);onCleanup(()=>window.removeEventListener('keydown',keys,true));
  window.folioIII={editor,native,id,metrics,projection,inventory,selection,mentions,nav,save,file};
  requestAnimationFrame(()=>requestAnimationFrame(()=>{metrics.openMs=performance.now()-startTime;}));
  return <div class="folio-app"><header class="folio-top"><strong>Folio</strong><h1>{root.payload.metadata.name}</h1><select aria-label="Open publication" value={file} onChange={e=>{location.href='?file='+encodeURIComponent(e.currentTarget.value);}}><For each={settings.files}>{f=><option value={f} selected={file===f}>{f}</option>}</For></select>
    <button onClick={save}>Save{native.isDirty(id)?' *':''}</button><button onClick={toggleFlint}>{flint()?'Close Flint':'Open in Flint'}</button></header>
    <nav class="reading-tools"><For each={['Bind entity','Scry','Gloss','Highlight']}>{label=><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate(label==='Bind entity'?'Scry':label)}>{label}</button>}</For>
    <button disabled={!mentions().length} onClick={()=>step(-1)}>Previous reference</button><button disabled={!mentions().length} onClick={()=>step(1)}>Next reference</button>
    <label>Zoom <select value={zoom()} onChange={e=>setZoom(+e.currentTarget.value)}>{[.8,1,1.25,1.5].map(z=><option value={z}>{z*100}%</option>)}</select></label>
    <For each={[[gallery,setGallery,'Gallery'],[minimap,setMinimap,'Minimap'],[spotlight,setSpotlight,'Spotlight'],[threads,setThreads,'Threads'],[inspector,setInspector,'References']]}>{([v,set,label])=><button aria-pressed={v()} onClick={()=>set(!v())}>{label}</button>}</For></nav>
    <section ref={geometry.setStage} class="reading-stage" classList={{spotlight:spotlight()&&!!focus(),editing:flint()}}>
    <Show when={gallery()}><aside class="page-gallery"><h2>Pages</h2><label><input type="checkbox" checked={filtered()} onChange={e=>{setFiltered(e.currentTarget.checked);setGalleryStart(0);}}/> With mentions</label>
      <For each={galleryPages().slice(galleryStart(),galleryStart()+8)}>{p=><button aria-label={'Gallery page '+p.number} aria-current={p.number===number()?'page':undefined} onClick={()=>pageGo(p.number)}>
      <svg viewBox={'0 0 '+p.width+' '+p.height} aria-hidden="true"><For each={p.frames}>{f=><rect x={f.frame.x} y={f.frame.y} width={f.frame.width} height={f.frame.height} fill={mentions().some(m=>m.locations.some(l=>l.f.id===f.id))?'#70987e':'#c8cec7'}/>}</For></svg>Page {p.number} · {counts().get(p.number)??0}</button>}</For>
      <button disabled={galleryStart()===0} onClick={()=>setGalleryStart(Math.max(0,galleryStart()-8))}>Earlier pages</button><button disabled={galleryStart()+8>=galleryPages().length} onClick={()=>setGalleryStart(galleryStart()+8)}>Later pages</button></aside></Show>
    <div class="reader-spread" onPointerUp={capture} onKeyUp={capture} onClick={e=>{const id=e.target.closest('[data-entity]')?.dataset.entity;if(id)pin(id);}}>
      <ReactiveViewProvider editor={editor} projection={projection}><FolioReaders.Provider value={readers}><SpreadBlockView nodeKey={spread.key}/></FolioReaders.Provider></ReactiveViewProvider>
    </div>
    <nav class="semantic-spine" aria-label="Semantic spine"><For each={pages()}>{p=><button title={'Page '+p.number+' · '+(counts().get(p.number)??0)+' mentions'} aria-label={'Spine page '+p.number} data-marked={counts().has(p.number)} aria-current={number()===p.number?'page':undefined} onClick={()=>jumpToPage(p.number)}>{p.number}</button>}</For></nav>
    <Show when={inspector()}><aside class="semantic-inspector"><h2>Linked references</h2><input aria-label="Filter entities" placeholder="Filter entities" value={filter()} onInput={e=>setFilter(e.currentTarget.value)}/>
      <button onClick={()=>inventory.sortBy('name')}>Name</button><button onClick={()=>inventory.sortBy('document')}>Mentions</button>
      <For each={inventory.sortedRows().filter(r=>r.name.toLowerCase().includes(filter().toLowerCase()))} fallback={<p>No linked entities in this view.</p>}>{r=><button class="entity-row" aria-pressed={focus()===r.id} onClick={()=>pin(r.id)}>{r.name}<b>{r.documentMentions}</b></button>}</For>
      <Show when={row()}>{r=><><h3 ref={geometry.setInspector}>{r().name}</h3><p>{currentIndex()+1} / {mentions().length} references</p><button onClick={()=>pin('')}>Clear focus</button><button disabled={currentIndex()<0} onClick={removeMention}>Remove reference</button></>}</Show>
      <Show when={minimap()}><h3>On this page</h3><div class="page-markers"><For each={mentions().filter(m=>m.locations.some(l=>l.page===number()))}>{m=><button title={'Reference '+(mentions().indexOf(m)+1)} style={{top:100*m.locations.find(l=>l.page===number()).f.frame.y/pages()[number()-1].height+'%'}} onClick={()=>visit(m)}>{mentions().indexOf(m)+1}</button>}</For></div></Show>
    </aside></Show>
    <Show when={threads()&&inspector()}><svg class="folio-threads" aria-hidden="true"><For each={geometry.paths()}>{p=><path d={p.path} data-kind={p.kind}/>}</For></svg></Show></section>
    <Show when={flint()}><div class="folio-flint split workspace-demo workspace-demo--canonical compact-document-workspace" data-window-work-area=""><WorkspacePresentationView session={session}/></div></Show>
    <footer>Page {number()} of {pages().length} · {row()?.name??'No entity focused'} <Show when={selection()}> · Passage selected</Show>
      <Show when={unplaced().length}> · {unplaced().length} blocks need frames <button onClick={()=>!flint()&&toggleFlint()}>Read unplaced content in Flint</button></Show><output>{notice()}</output></footer>
    <Show when={scry()} keyed>{s=><Scry selection={s} editor={editor} api={api} inventory={inventory} text={text} property={property} navigate={navigate} focus={pin} close={()=>setScry()}/>}</Show></div>;
 }
 const dispose=render(App,host);
 const guard=e=>{if(native.isDirty(id)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);
 window.addEventListener('pagehide',()=>{window.removeEventListener('beforeunload',guard);dispose();disposeFeature();gateway();session.dispose();},{once:true});
}
start().catch(e=>{host.textContent=e.message;console.error(e);});
