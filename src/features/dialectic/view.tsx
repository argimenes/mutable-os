import {For,Show,createEffect,createSignal,onCleanup,onMount,untrack,type JSX} from 'solid-js';
import type {DocumentApplicationInstance} from '../../feature-api/document-application';
import type {DocumentApplicationPort} from '../../application/document-application-ports';
import {DocumentBrowser} from '../../demo/document-browser';
import {useTextualApplicationHost} from '../textual/applications';
import {TextualSavePrompt} from '../textual/flint';
import type {DialecticController} from './controller';
import {targetKey} from './model';

function Chrome(props:{c:DialecticController;children:JSX.Element;actions?:JSX.Element;textual?:boolean}){
 const c=props.c;
 let root!:HTMLElement;
 const act=(fn:()=>unknown)=>()=>c.run(fn);
 const save=async()=>{try{await c.port()?.application.files?.save();}catch(e){c.run(()=>{throw e;});}};
 onMount(()=>{
  const shortcut=(e:KeyboardEvent)=>{if(!root.contains(e.target as Node)||e.isComposing||e.altKey||e.shiftKey||!(e.metaKey||e.ctrlKey)||e.key.toLowerCase()!=='s'||(e.target as Element)?.closest('[role="dialog"]'))return;e.preventDefault();e.stopPropagation();void save();};
  window.addEventListener('keydown',shortcut,true);onCleanup(()=>window.removeEventListener('keydown',shortcut,true));
 });
 const selected=()=>c.inspection(),row=()=>c.rows().find(r=>r.id===selected()?.blockId);
 const selectedTarget=()=>c.reply()??selected()??(c.frontier()?c.target(c.frontier()!.id):undefined);
 return <section ref={root} class="dialectic-app" aria-label="Dialectic conversation">
  <header class="dialectic-bar" data-cross-text-controls>
   <div><strong>Dialectic</strong><span class="dialectic-subtitle"> Compositions in conversation</span></div>
   <nav aria-label="Conversation actions" onPointerDown={e=>e.preventDefault()}>{props.actions}<button onClick={()=>void save()}>Save</button><button onClick={()=>void c.port()?.saveAs?.().catch(e=>c.run(()=>{throw e;}))}>Save as…</button><button onClick={act(()=>c.editor.repository.undo())}>Undo</button><button onClick={act(()=>c.editor.repository.redo())}>Redo</button></nav>
  </header>
  <Show when={c.notice()}><div class="dialectic-notice" role="alert">{c.notice()}</div></Show>
  <div class="dialectic-body">
   <aside class="dialectic-sidebar" aria-label="Contributions">
    <div class="dialectic-eyebrow">CHRONOLOGY</div>
    <p class="dialectic-muted">{c.committed().length} contributions · {c.frontier()?`Present #${c.frontier()!.data.ordinal}`:'Ready to begin'}</p>
    <For each={c.committed()}>{r=><button class="dialectic-entry" aria-current={selected()?.blockId===r.id?'true':undefined} onClick={act(()=>c.inspect(c.target(r.id)))}><span class="dialectic-number">{String(r.data.ordinal).padStart(2,'0')}</span><span>{r.data.author==='mock'?'Mock assistant':'You'}<small>{r.data.replies.length?`↳ ${r.data.replies.map(t=>c.label(t)).join(', ')}`:'New contribution'}</small></span></button>}</For>
    <button class="dialectic-entry" onClick={c.compose}>＋ Your draft</button>
    <div class="dialectic-history"><button disabled={c.cursor()<=0} onClick={()=>c.navigate(-1)}>← Back</button><button disabled={c.cursor()>=c.trail().length-1} onClick={()=>c.navigate(1)}>Forward →</button></div>
    <button class="dialectic-present" onClick={c.present}>Return to present</button>
   </aside>
   <main class="dialectic-main">
    <div class="dialectic-reading-header"><span>{c.port()?.application.properties()?.title??'Conversation'}</span><span class="dialectic-muted">Native Mutable Document</span></div>
    {props.children}
    <div class="dialectic-compose-bar" data-cross-text-controls onPointerDown={e=>e.preventDefault()}>
     <div><strong>Your next contribution</strong><small>{c.reply()?`Replying to ${c.label(c.reply()!)}`:'New contribution at the chronological frontier'} <Show when={c.reply()}><button onClick={()=>c.setReply(undefined)}>Clear target</button></Show></small></div>
     <button onClick={c.compose}>Go to draft</button><button class="dialectic-primary" disabled={!c.valid()||c.busy()} onClick={c.submit}>Submit</button>
    </div>
   </main>
   <aside class="dialectic-inspector" aria-label="Conversation context">
    <div class="dialectic-eyebrow">INSPECTION</div>
    <h3>{selected()?c.label(selected()!):'Explore a contribution'}</h3>
    <Show when={row()}>{r=><p class="dialectic-muted">{r().data.createdUtc?new Date(r().data.createdUtc!).toLocaleString():'Draft'} · Content stays editable.</p>}</Show>
    <button disabled={!selected()} onClick={act(()=>{if(selected())c.setReply(selected());})}>Reply to this</button>
    <button onPointerDown={e=>e.preventDefault()} onClick={act(()=>{const t=c.focusBlock();c.setReply(t);c.inspect(t);})}>Reply to caret Block</button>
    <hr/><div class="dialectic-eyebrow">NEXT MOCK INTERACTION</div>
    <p class="dialectic-muted">Target: {selectedTarget()?c.label(selectedTarget()!):'Select a contribution'}. Selected context remains when you return to the present.</p>
    <button disabled={!selected()} onClick={act(()=>{if(selected())c.pin(selected()!);})}>Include in context</button>
    <button onPointerDown={e=>e.preventDefault()} onClick={act(()=>c.pin(c.focusBlock()))}>Include caret Block</button>
    <ul class="dialectic-pins"><For each={c.context()}>{t=><li><button onClick={act(()=>c.inspect(t))}>{c.label(t)}</button><button aria-label={`Remove context ${c.label(t)}`} onClick={()=>c.unpin(t)}>×</button></li>}</For></ul>
    <Show when={!c.context().length}><p class="dialectic-muted">No additional context selected.</p></Show>
    <button class="dialectic-primary" disabled={!c.valid()||c.busy()} onClick={()=>void c.askMock()}>Ask mock assistant</button><Show when={c.busy()}><button onClick={c.cancel}>Cancel response</button></Show>
    <p class="dialectic-footnote">Deterministic example. No AI service or network request. Target plus up to 12 selected items; 6,000 characters maximum.</p>
    <Show when={row()?.data.context?.length}><details><summary>Response provenance</summary><For each={row()?.data.context}>{t=><p>{c.label(t)}</p>}</For></details></Show>
   </aside>
  </div>
  <footer class="dialectic-status"><span>{c.busy()?'Preparing mock composition…':c.port()?.application.files?.status()??'Ready'}{c.port()?.application.properties()?.unsaved?' · Unsaved changes':''}</span><span>Chronology ≠ context ≠ presentation</span></footer>
 </section>;
}

/** Label existing container mounts without replacing children or creating a renderer fork. */
function decorate(c:DialecticController){
 createEffect(()=>{
  const session=c.session(),rows=c.rows().map(r=>({key:r.key,label:r.data.state==='draft'?'YOUR DRAFT':`${r.data.author==='mock'?'MOCK ASSISTANT':'YOU'} · ${r.data.ordinal}`,draft:r.data.state==='draft'}));
  let alive=true;const mounts:HTMLElement[]=[];
  queueMicrotask(()=>{if(!alive||session!==c.session())return;for(const r of rows){const element=c.editor.mounts.get(r.key)?.root as HTMLElement|undefined;if(!element)continue;element.dataset.dialecticContribution=r.label;element.dataset.dialecticDraft=String(r.draft);mounts.push(element);}});
  onCleanup(()=>{alive=false;for(const e of mounts){delete e.dataset.dialecticContribution;delete e.dataset.dialecticDraft;}});
 });
}
export function DialecticDesktop(props:{application:DocumentApplicationInstance;controller:DialecticController;create:()=>void}){
 const [open,setOpen]=createSignal(false),[opening,setOpening]=createSignal(false),[error,setError]=createSignal('');
 decorate(props.controller);
 return <><Chrome c={props.controller} actions={<><button onClick={()=>props.controller.run(props.create)}>New</button><button onClick={()=>setOpen(true)}>Open…</button><button onClick={()=>void props.application.vault?.choose?.()}>Vault…</button></>}>
  <div class="dialectic-canvas"><props.application.tabs/></div>
 </Chrome><Show when={open()}><DocumentBrowser mode="open" initialLocation={props.application.files?.location()} busy={opening()} error={error()} onClose={()=>setOpen(false)} onChoose={async location=>{setOpening(true);setError('');try{await props.application.files?.open(location);setOpen(false);return true;}catch(e){setError(String(e));return false;}finally{setOpening(false);}}}/></Show></>;
}
export function DialecticTextual(props:{controller:DialecticController;port:DocumentApplicationPort;active:()=>boolean}){
 const host=useTextualApplicationHost(),c=props.controller,editor=c.editor;
 let slot!:HTMLDivElement,surface!:HTMLDivElement,viewport!:HTMLDivElement,root!:HTMLDivElement;
 const [mounted,setMounted]=createSignal(false);
 onMount(()=>{props.port.presented(true);setMounted(true);onCleanup(()=>props.port.presented(false));});
 createEffect(()=>{if(!mounted())return;const s=props.port.session();if(!s)return;untrack(()=>{
  const restore=editor.documentSessions!.presentations.present(s,{container:slot,scrollport:viewport,surfaceContainer:surface,activity:()=>({mounted:true,visible:props.active(),active:props.active()})});
  onCleanup(restore);queueMicrotask(()=>editor.documentSessions?.presentations.restorePosition(s,true));
 });});
 return <div ref={root} class="dialectic-textual" data-mwm-window={props.port.windowId()} inert={!props.active()} style={{'--tw-prose-width':`${Math.max(20,host.grid().columns-58)}ch`}}>
  <Chrome c={c} textual actions={<For each={props.port.tabs()}>{t=><button onClick={()=>props.port.selectTab(t.key)}>{t.title}{t.dirty?' *':''}</button>}</For>}>
   <div ref={viewport} class="dialectic-canvas tw-flint-editor"><div ref={slot} class="tw-flint-slot"/><div ref={surface}/></div>
  </Chrome><Show when={props.port.prompt()} keyed>{prompt=><TextualSavePrompt prompt={prompt} grid={host.grid()}/>}</Show>
 </div>;
}
