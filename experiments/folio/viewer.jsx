import { For, Show, createMemo, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { WorkspaceSession } from '../../src/application/workspace-session';
import { WorkspacePresentationView } from '../../src/application/workspace-presentation-view';
import { nativeDocumentSession } from '../../src/persistence/native-session';
import { materializeLocalWorkspace } from '../../src/reactive-editor/workspace-manifest';
import { inlineText, logicalInline } from '../../src/block-tree/inline-sequence';
import { selectionInFrame, readSource } from './selection.mjs';
import { corpus } from './corpus.mjs';
import '../../src/index.css';
import '../../src/demo/workspace-demo.css';
import './viewer.css';

const params=new URLSearchParams(location.search);
const paper=corpus.find(p=>p.id===params.get('paper'))??corpus[0];
const px=v=>v+'px';
const metrics={frameReads:new Map()};
const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[]}]}),
  {features:{nativeKnowledge:false,sqliteKnowledge:false,sqliteEntities:false,semanticRetrieval:false,
    desktopApplicationIcons:false,flintProbe:false,flintMaterialChrome:false}});
const editor=session.editor, repo=editor.repository, state=repo.state;
const host=document.querySelector('#folio');
const started=performance.now();

function runs(content) {
  metrics.frameReads.set(content.key,(metrics.frameReads.get(content.key)??0)+1);
  // Subscribe to just this canonical block, including resident-backed splices.
  void content.revision;
  const chars=Array.from(inlineText(logicalInline(state,content)));
  const styles=(content.payload.standoffProperties??[]).filter(p=>!p.isDeleted &&
    (p.type==='style/bold'||p.type==='style/italics'||p.type==='mutable/gloss'));
  const cuts=[...new Set([0,chars.length,...styles.flatMap(p=>[p.start,p.end+1])])].sort((a,b)=>a-b);
  return cuts.slice(1).map((end,i)=>{
    const start=cuts[i], active=styles.filter(p=>p.start<=start&&p.end>=start);
    const gloss=active.find(p=>p.type==='mutable/gloss' && !editor.gloss.resolveContent(p,content.key).isDeleted);
    return {text:chars.slice(start,end).join(''), bold:active.some(p=>p.type==='style/bold'),
      italic:active.some(p=>p.type==='style/italics'),gloss:gloss?.annotationId,
      title:gloss?editor.gloss.resolveContent(gloss,content.key).value:undefined};
  });
}
function Frame(props) {
  const content=()=>state.contents[props.contentKey];
  const meta=()=>content()?.payload.metadata;
  const layout=()=>meta()?.folio;
  const style=()=>{const f=layout().frame;return {left:px(f.x),top:px(f.y),width:px(f.width+0.8),
    'white-space':layout().lineCount===1?'nowrap':'normal','font-family':layout().family,'font-size':px(layout().fontSize),'text-align':layout().align,'line-height':px(layout().leading)};};
  if(content().viewType==='image-block') return <img class="folio-image" style={{...style(),height:px(layout().frame.height)}} src={meta().url} alt={meta().alt}/>;
  const segments=createMemo(()=>runs(content()));
  return <div class="folio-frame" data-content={content().key} data-frame={content().payload.id} data-kind={layout().kind}
    data-height={layout().frame.height} style={style()}>
    <For each={segments()}>{run=><span data-gloss={run.gloss} title={run.title}
      style={{'font-weight':run.bold?'bold':undefined,'font-style':run.italic?'italic':undefined}}>{run.text}</span>}</For>
  </div>;
}
async function start(){
  const native=nativeDocumentSession(editor);
  const id=await native.open({folder:'.',filename:paper.id+'.ink'});
  const root=Object.values(repo.readState().contents).find(c=>c.payload.id===id);
  const pages=createMemo(()=>state.contents[root.key].children.map(p=>state.placements[p].contentKey)
    .filter(key=>state.contents[key]?.payload.metadata?.folio?.number));
  const [number,setNumber]=createSignal(Math.max(1,Math.min(pages().length,Number(params.get('page'))||1)));
  const [view,setView]=createSignal('Folio'), [flint,setFlint]=createSignal(false);
  const spatial=()=>view()==='Folio'||view()==='Compare';
  const page=()=>state.contents[pages()[number()-1]??pages()[0]], layout=()=>page()?.payload.metadata.folio;
  const [selection,setSelection]=createSignal(), [notice,setNotice]=createSignal('');
  let evidence;
  const capture=()=>{
    const picked=selectionInFrame(window.getSelection());
    setSelection(picked);
    setNotice('');
  };
  async function trace(){
    const picked=selection();
    if(!picked) return;
    const pageNumber=number();
    const provenance=root.payload.metadata.folio;
    try {
      evidence??=await readSource('generated/'+provenance.evidence,provenance.evidenceSha256);
      if(picked!==selection() || pageNumber!==number()) return;
      const content=state.contents[picked.key];
      if(!content || [...inlineText(logicalInline(state,content))].slice(picked.start,picked.end).join('')!==picked.text)
        throw Error('The passage changed. Select the current text to trace it.');
      const links=content.payload.standoffProperties.filter(p=>p.type==='spatial/source-run'&&!p.isDeleted&&p.start<picked.end&&p.end>=picked.start);
      const locations=links.map(p=>{
        const [,pageNo,itemNo]=/^p(\d+)-i(\d+)$/.exec(p.value);
        const item=evidence.pages[Number(pageNo)-1].items[Number(itemNo)];
        return 'p. '+pageNo+' · item '+itemNo+' · ('+[item.x,item.y,item.width,item.height].map(n=>n.toFixed(1)).join(', ')+') pt';
      });
      setNotice(locations.join(' | ') || 'This selection has no surviving source range.');
    }catch(error){setNotice(error.message);}
  }
  const source=()=> 'sources/'+paper.id+'.pdf#page='+number();
  const gateway=editor.installGateway(document);
  const openFlint=async(mode)=>{
    if(!flint()){
      await editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
      setFlint(true);
    }
    setView(mode);
  };
  async function reveal(){
    const picked=selection();
    if(!picked) return;
    await openFlint('Compare');
    const block=document.querySelector('.folio-flint [data-block-id="'+CSS.escape(picked.id)+'"] .reactive-standoff-flow');
    const key=block&&editor.mounts.resolveElement(block)?.nodeKey;
    const mount=key&&editor.mounts.get(key);
    if(!mount || [...mount.captureText()].slice(picked.start,picked.end).join('')!==picked.text){
      setNotice('The selected passage is unavailable in this Flint occurrence.'); return;
    }
    block.scrollIntoView({block:'center'});mount.focus();
    mount.restoreInlineSelection({anchor:picked.start,head:picked.end});
    setNotice('');setSelection();
  }
  const dispose=render(()=><>
    <header class="folio-bar"><strong>Folio</strong>
      <select aria-label="Publication" value={paper.id} onChange={e=>{location.href='?paper='+e.currentTarget.value;}}>
        <For each={corpus}>{p=><option value={p.id}>{p.title}</option>}</For></select>
      <label hidden={view()==='Flint'}>Page <select aria-label="Source page" value={number()} onChange={e=>{setNumber(+e.currentTarget.value);setSelection();setNotice('');}}>
        <For each={pages()}>{(_,i)=><option value={i()+1}>{i()+1}</option>}</For></select></label>
      <nav aria-label="Manifestation"><For each={['Folio','Flint','Compare','Source PDF']}>{v=>
        <button aria-pressed={view()===v} onClick={()=>v==='Flint'||v==='Compare'?openFlint(v):setView(v)}>{v}</button>}</For></nav>
    </header>
    <Show when={spatial() && page()}><section class="folio-stage" classList={{split:view()==='Compare'}} onPointerUp={capture} onKeyUp={capture}>
      <Show when={selection()}><aside class="folio-selection">
        <button onClick={reveal}>Select in Flint</button><button onClick={trace}>Trace to source</button>
      </aside></Show>
      <article aria-label={'Composed page '+number()} style={{width:px(layout().width),height:px(layout().height)}}>
        <For each={layout().rules}>{box=><div class="folio-rule" style={{left:px(box.x),top:px(box.y),width:px(box.width)}}/>}</For>
        <For each={page().children}>{placement=><Show when={state.contents[state.placements[placement].contentKey]?.payload.metadata?.folio?.frame}><Frame contentKey={state.placements[placement].contentKey}/></Show>}</For>
      </article>
    </section></Show>
    <div class="folio-flint workspace-demo workspace-demo--canonical compact-document-workspace" data-window-work-area="" classList={{split:view()==='Compare'}} hidden={view()!=='Flint'&&view()!=='Compare'}>
      <Show when={flint()}><WorkspacePresentationView session={session}/></Show>
    </div>
    <Show when={notice()}><output class="folio-notice">{notice()}</output></Show>
    <Show when={view()==='Source PDF'}><iframe class="folio-source" title="Original publication" src={source()}/></Show>
  </>,host);
  // Instrumentation for the disposable browser qualification only.
  window.folio={session,editor,native,id,metrics,number,view};
  window.addEventListener('beforeunload',event=>{if(native.isDirty(id)){event.preventDefault();event.returnValue='';}});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{metrics.openAndSpatialMs=performance.now()-started;}));
  window.addEventListener('pagehide',()=>{gateway?.();dispose();session.dispose();},{once:true});
}
start().catch(error=>{host.textContent='Unable to open publication. '+error.message;console.error(error);});
