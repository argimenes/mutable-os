import {createSignal,For,Show} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../../src/application/workspace-session';
import {WorkspacePresentationView} from '../../../src/application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../../src/reactive-editor/workspace-manifest';
import {ReactiveViewProvider} from '../../../src/reactive-editor/context';
import {BlockOutlet} from '../../../src/rendering/block-outlet';
import {nativeDocumentSession} from '../../../src/persistence/native-session';
import {chooseEntity} from '../../../src/features/entity-references/entity-search';
import {compositionLeaf,pdfLeaf} from './leaves';
import {corpus} from '../corpus.mjs';
import '../../../src/index.css';
import '../../../src/demo/workspace-demo.css';
import '../viewer.css';
import './viewer.css';

const host=document.querySelector('#folio');
async function start(){
  const started=performance.now();
  const settings=await fetch('./session.json').then(r=>r.json());
  const paper=corpus.find(p=>p.id===new URLSearchParams(location.search).get('paper'))??corpus[2];
  const workspace=()=>new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[]}]}),
    {features:{nativeKnowledge:false,sqliteKnowledge:false,sqliteEntities:false,semanticRetrieval:false,desktopApplicationIcons:false,flintProbe:false,flintMaterialChrome:false}});
  const publication=workspace(),layout=workspace(),editor=publication.editor;
  editor.setAssetContext(()=>settings);
  const native=nativeDocumentSession(editor),layouts=nativeDocumentSession(layout.editor);
  const [id,layoutId]=await Promise.all([native.open({folder:'.',filename:paper.id+'.ink'}),layouts.open({folder:'.',filename:paper.id+'-spread.ink'})]);
  const state=editor.repository.state, byId=new Map(Object.values(editor.repository.readState().contents).map(c=>[c.payload.id,c.key]));
  const root=state.contents[byId.get(id)];
  const metrics={record:false,frameReads:[],received:0,published:0,deliveryMs:0,live:0};
  layout.editor.registry.register({type:'folio/pdf-leaf',view:pdfLeaf(metrics),capabilities:['opaque-widget']});
  layout.editor.registry.register({type:'folio/composition-leaf',view:compositionLeaf({state,root,byId,editor},metrics),capabilities:['opaque-widget']});
  const spread=Object.values(layout.projection.state.nodes).find(n=>n.viewType==='spread-block');
  const [flint,setFlint]=createSignal(false),[notice,setNotice]=createSignal('');
  let opened=false;
  async function toggle(){
    if(!opened){await editor.commandRegistry.execute('flint.open',{targetKey:publication.projection.state.rootKey,args:undefined});opened=true;}
    setFlint(!flint());
  }
  function bind(){
    try{
      const mount=editor.mounts.resolveElement(document.activeElement), selection=mount?.handle.captureInlineSelection?.();
      if(!selection||selection.anchor===selection.head)throw Error('Select a mention in Flint first.');
      const range=editor.textRanges.snapshot(mount.nodeKey,Math.min(selection.anchor,selection.head),Math.max(selection.anchor,selection.head));
      chooseEntity({revision:()=>state.revision,annotate:(...args)=>editor.linkedAnnotations.createBatch(...args)},
        {entityRevision:state.revision,entityRanges:[range]},settings.entity);setNotice('');
    }catch(error){setNotice(error.message);}
  }
  const releaseGateway=editor.installGateway(document);
  const shortcut=e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'&&!e.altKey && !e.target.closest('.folio-flint')){
      e.preventDefault();e.stopImmediatePropagation();void layouts.save(layoutId).catch(error=>setNotice(error.message));
    }
  };
  window.addEventListener('keydown',shortcut,true);
  const beforeUnload=e=>{if(native.isDirty(id)||layouts.isDirty(layoutId)){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  const beforeMount=performance.now();
  const dispose=render(()=><><header class="folio-bar"><strong>Folio II</strong>
    <select aria-label="Publication" value={paper.id} onChange={e=>{location.href='?paper='+e.currentTarget.value;}}>
      <For each={corpus}>{p=><option value={p.id}>{p.title}</option>}</For></select>
    <nav><a class="folio-import-notes" href={'generated/'+paper.id+'.diagnostics.json'} target="_blank" rel="noreferrer">Import notes</a><button aria-pressed={flint()} onClick={toggle}>{flint()?'Close Flint':'Open Flint'}</button>
      <Show when={flint()}><button onPointerDown={e=>e.preventDefault()} onClick={bind}>Bind selection to BERT</button></Show>
      <button onClick={()=>layouts.save(layoutId).catch(e=>setNotice(e.message))}>Save spread{layouts.isDirty(layoutId)?' *':''}</button></nav></header>
    <main class="folio-spread-host" classList={{editing:flint()}}>
      <ReactiveViewProvider editor={layout.editor} projection={layout.projection}><BlockOutlet nodeKey={spread.key}/></ReactiveViewProvider>
    </main>
    <div class="folio-flint split workspace-demo workspace-demo--canonical compact-document-workspace" data-window-work-area="" hidden={!flint()}>
      <Show when={flint()}><WorkspacePresentationView session={publication}/></Show>
    </div><Show when={notice()}><output class="folio-notice">{notice()}</output></Show></>,host);
  metrics.mountMs=performance.now()-beforeMount;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{metrics.openMs=performance.now()-started;}));
  window.folioII={publication,layout,native,layouts,id,layoutId,metrics,entity:settings.entity};
  window.addEventListener('pagehide',()=>{dispose();releaseGateway();publication.dispose();layout.dispose();
    window.removeEventListener('keydown',shortcut,true);window.removeEventListener('beforeunload',beforeUnload);},{once:true});
}
start().catch(error=>{host.textContent='Could not open publication. '+error.message;console.error(error);});
