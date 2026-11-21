import { For, Show, createSignal, onMount, onCleanup } from 'solid-js';
import type { DocumentApplicationInstance } from '../../feature-api/document-application';
import { DocumentBrowser } from '../../demo/document-browser';
import './quill.css';

export interface QuillContext {
  existing: boolean;
  documentId: string;
  confirm(): void;
  returnToSource(): Promise<void>;
}
export function QuillShell(props: { application: DocumentApplicationInstance; context?: QuillContext }) {
  const app = props.application;
  const activeId = () => app.activeDocumentId?.();
  let root!: HTMLElement;
  onMount(()=>{
    const save=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's' || !(event.target instanceof Node) || !root.contains(event.target))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(app.files && app.properties() && !busy())void run(()=>app.files!.save());
    };
    window.addEventListener('keydown',save,true);onCleanup(()=>window.removeEventListener('keydown',save,true));
  });
  const [error,setError] = createSignal(''), [busy,setBusy] = createSignal(false), [opening,setOpening] = createSignal(false);
  const [confirmed,setConfirmed] = createSignal(!!props.context?.existing);
  const run = async (action:()=>unknown) => { setError(''); setBusy(true); try { await action(); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  return <section ref={root} class="quill-application" aria-label="Quill application">
    <header><strong>Quill</strong><span>Geometric text studio</span>
      <button onClick={()=>void run(()=>app.createDocument?.())}>New Document</button>
      <button disabled={!app.files} onClick={()=>setOpening(true)}>Open Ink…</button>
      <button data-document-save disabled={!app.files || !app.properties() || busy()} onPointerDown={e=>e.preventDefault()} onClick={()=>void run(()=>app.files!.save())}>Save Document</button>
      <Show when={props.context}><button disabled={busy()} onClick={()=>void run(()=>props.context!.returnToSource())}>Return to editor</button></Show>
    </header>
    <Show when={error()}><p role="alert">{error()}</p></Show>
    <Show when={props.context && !confirmed()}><div class="quill-confirm" role="region" aria-label="Confirm Quill conversion">
      <p>Convert this whole paragraph into a composition? Its native text and annotations stay in this Document. Opening Quill has not converted it.</p>
      <button disabled={busy() || activeId() !== props.context?.documentId} onClick={()=>void run(()=>{props.context!.confirm();setConfirmed(true);})}>Convert paragraph</button>
      <button disabled={busy()} onClick={()=>void run(()=>props.context!.returnToSource())}>Cancel and return</button>
    </div></Show>
    <div class="quill-workspace">
      <nav aria-label="Quill Documents"><h2>Documents</h2><For each={app.documents()}>{doc=><button class="quill-document" aria-current={activeId() === doc.id ? 'page' : undefined} onClick={()=>app.openDocument(doc.id)}>{doc.title}</button>}</For>
        <button disabled={!app.vault} onClick={()=>app.vault?.choose?.()}>Choose Vault…</button>
        <Show when={app.vault?.error?.()}><p role="status">{app.vault!.error!()}</p></Show>
      </nav>
      <main><app.tabs/><Show when={!app.properties()}><p class="quill-empty">Create or open an ordinary Ink Document to begin.</p></Show></main>
      <aside aria-label="Quill inspector"><h2>Composition</h2><p>Select text on the canvas to edit or annotate it.</p><p>Choose Paths to reshape a line, or generate three linked waves. Save Document writes your native Ink file.</p>
        <Show when={app.properties()}>{p=><><h3>{p().title}</h3><p role="status">{!app.files ? 'In-memory document' : p().unsaved ? 'Unsaved changes' : 'No unsaved changes'}</p><p>{app.files?.status()}</p></>}</Show>
      </aside>
    </div>
    <Show when={opening()}><DocumentBrowser mode="open" initialLocation={app.files?.location() ?? {folder:'.',filename:''}} busy={busy()} error={error()} onClose={()=>setOpening(false)} onChoose={async location=>{
      let opened=false; await run(async()=>{await app.files!.open(location);opened=true;setOpening(false);});return opened;
    }}/></Show>
  </section>;
}
