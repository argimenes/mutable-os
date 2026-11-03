import {For,Show,createMemo,createSignal,onCleanup,onMount,type Accessor} from 'solid-js';
import type {GlossSessionIndex,GlossEntry} from './session-index';
import type {GlossEdge} from './relationship-index';
import {relationshipTypes,decodeRelationship} from './relationships';
import './relationship-authoring.css';

/** Session presentation state; shared by Register navigation and future derived views. */
export function createGlossRegisterState(){return{selected:createSignal(''),query:createSignal(''),type:createSignal(''),expanded:new Set<string>()};}
export type GlossRegisterState=ReturnType<typeof createGlossRegisterState>;
type Action='create'|'update'|'retarget'|'reverse'|'remove'|'restore';
interface Draft {action:Action;source:string;edge?:GlossEdge;restoreId?:string;expected?:string;invoker:HTMLElement;row?:HTMLElement;register?:HTMLElement;selection?:{key:string;revision:number;range:{anchor:number;head:number}}}
const issueNames:Record<string,string>={'deleted-source':'Deleted source','deleted-target':'Deleted target','missing-source':'Missing source','missing-target':'Missing target','ambiguous-source':'Ambiguous source','ambiguous-target':'Ambiguous target','outside-copy':'Target outside copied fragment','unsupported-version':'Unsupported version','invalid-relationship':'Unsupported relationship record','invalid-unresolved-descriptor':'Unsupported target descriptor','ambiguous-relationship':'Ambiguous relationship identity','invalid-identity':'Invalid relationship identity'};
export function createRelationshipAuthoring(index:GlossSessionIndex,state:GlossRegisterState,select:(id:string,reveal?:boolean)=>void){
 const editor=index.editor,graph=index.relationships!,service=editor.glossRelationships;
 const [draft,setDraft]=createSignal<Draft>(),[error,setError]=createSignal('');
 let alive=true;onCleanup(()=>{alive=false;});
 const label=(id?:string)=>{if(!id)return 'Unknown Gloss';const nodes=graph.nodes(id);return nodes.length===1?(nodes[0].alias?nodes[0].alias+' · ':'')+nodes[0].raw:nodes.length?'Ambiguous Gloss · '+id:'Missing Gloss · '+id;};
 const live=(id?:string)=>!!id&&graph.nodes(id).length===1&&!graph.nodes(id)[0].deleted;
 let preservedSelection:Draft['selection'];
 const capture=()=>{const key=editor.focus.state.focusedKey,h=key&&editor.mounts.get(key),anchor=document.getSelection()?.anchorNode;
  if(key&&h&&index.containsOccurrence(key)){
   const set=editor.selections.sets[key],primary=set?.items.find(item=>item.id===set.primaryId);
   const range=anchor&&h.root.contains(anchor)?h.captureInlineSelection?.():primary?{anchor:primary.anchor.boundary.index,head:primary.head.boundary.index}:undefined;
   const node=editor.node(key);if(range&&node)preservedSelection={key,revision:editor.repository.readState().contents[node.contentKey].revision,range};
  }
  return preservedSelection;
 };
 const close=()=>{const d=draft();setDraft(undefined);setError('');queueMicrotask(()=>{if(!alive||!d)return;const s=d.selection;if(s&&editor.repository.readState().contents[editor.node(s.key)?.contentKey??'']?.revision===s.revision)editor.mounts.get(s.key)?.restoreInlineSelection?.(s.range);const target=d.invoker.isConnected?d.invoker:d.row?.isConnected?d.row:d.register?.isConnected?d.register:undefined;target?.focus({preventScroll:true});});};
 const begin=(action:Action,source:string,invoker:HTMLElement,edge?:GlossEdge,restoreId?:string)=>{
  if(draft()){setError('Finish or cancel the open relationship editor first.');return;}
  let expected:string|undefined;if(restoreId){const node=graph.unique(restoreId,false);expected=JSON.stringify((editor.repository.readState().contents[index.owner].payload.linkedAnnotations as any)[node.definitionId]);}
  setError('');state.selected[1](source);setDraft({action,source,edge,restoreId,expected,invoker,row:invoker.closest<HTMLElement>('.gloss-register-row')??undefined,register:invoker.closest<HTMLElement>('.gloss-register')??undefined,selection:capture()});
 };
 const retain=(e:PointerEvent)=>e.preventDefault();
 const Panel=()=> <Show when={draft()} keyed>{d=>{
  const [type,setType]=createSignal(d.edge?.type??'supports'),[query,setQuery]=createSignal(''),[target,setTarget]=createSignal(d.action==='create'||d.action==='retarget'?'':d.edge?.targetGlossId??''),[busy,setBusy]=createSignal(false);
  let composing=false,submitted=false,form!:HTMLFormElement;
  const picker=()=>d.action==='create'||d.action==='retarget';
  const candidates=createMemo(()=>{if(!picker())return[];const q=query().trim().toLocaleLowerCase();return index.rows[0]().filter(row=>{const data=row.data();return row.localId!==d.source&&live(row.localId)&&(!q||`${data.type} ${data.body} ${data.alias}`.toLocaleLowerCase().includes(q));});});
  const suggestions=createMemo(()=>[...new Set([...relationshipTypes,...graph.types()])]);
  const source=()=>d.action==='reverse'?d.edge?.targetGlossId:d.source,destination=()=>d.action==='reverse'?d.source:target();
  const title={create:'Add Relationship',update:'Change relationship type',retarget:'Retarget relationship',reverse:'Reverse relationship',remove:'Delete relationship',restore:'Restore Gloss'}[d.action];
  const confirm={create:'Create Link',update:'Save Type',retarget:'Save Target',reverse:'Confirm Reverse',remove:'Delete Link',restore:'Restore Gloss'}[d.action];
  const submit=()=>{if(composing||busy()||submitted)return;if(picker()&&!target()){setError('Choose a target Gloss.');return;}submitted=true;setBusy(true);setError('');try{
   const edge=d.edge;if(d.action==='create')service.create(index.owner,d.source,type(),target());
   else if(d.action==='update')service.update(index.owner,edge!.id,edge!.token,type());
   else if(d.action==='retarget')service.retarget(index.owner,edge!.id,edge!.token,target());
   else if(d.action==='reverse')service.reverse(index.owner,edge!.id,edge!.token);
   else if(d.action==='remove')service.remove(index.owner,edge!.id,edge!.token);
   else service.restore(index.owner,d.restoreId!,d.expected!);
   close();
  }catch(reason){setError(reason instanceof Error?reason.message:String(reason));submitted=false;setBusy(false);}};
  onMount(()=>{form.scrollIntoView?.({block:'nearest'});(form.querySelector('input')??form.querySelector('button'))?.focus({preventScroll:true});});
  return <form ref={form} class="gloss-relationship-editor" role="dialog" aria-label={title} onSubmit={e=>{e.preventDefault();submit();}} onCompositionStart={()=>composing=true} onCompositionEnd={()=>composing=false} on:keydown={e=>{e.stopPropagation();if(e.isComposing||composing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Enter'&&e.target instanceof HTMLInputElement){e.preventDefault();submit();}}}>
   <strong>{title}</strong>
   <Show when={d.action!=='restore'} fallback={<p>{label(d.restoreId)}</p>}>
    <p class="gloss-relationship-preview" aria-label="Relationship direction">{label(source())} <b>{type()} →</b> {destination()?label(destination()):'Choose a target'}</p>
   </Show>
   <Show when={d.action==='create'||d.action==='update'}><label>Relationship<input aria-label="Relationship type" value={type()} list={'gloss-types-'+index.rootKey} onInput={e=>setType(e.currentTarget.value)}/></label><datalist id={'gloss-types-'+index.rootKey}><For each={suggestions()}>{value=><option value={value}/>}</For></datalist></Show>
   <Show when={picker()}><label>To<input aria-label="Search target Glosses" placeholder="Search type, text or alias" value={query()} onInput={e=>setQuery(e.currentTarget.value)}/></label>
    <div class="gloss-targets" role="group" aria-label="Target Glosses"><For each={candidates().slice(0,30)}>{row=><button type="button" class="gloss-target" aria-pressed={target()===row.localId} data-target-gloss={row.localId} onClick={()=>setTarget(row.localId)}><span>{label(row.localId)}</span><small>{row.occurrences().length?`${row.occurrences().length} occurrence(s)`:'Unanchored'} · {row.definitionId.slice(0,8)}</small></button>}</For><Show when={!candidates().length}><p>No eligible local Glosses.</p></Show><Show when={candidates().length>30}><small>Showing 30 of {candidates().length}. Refine your search.</small></Show></div>
   </Show>
   <Show when={d.action==='reverse'}><p>Reversing changes the meaning. Confirm the direction shown above.</p></Show>
   <Show when={d.action==='remove'}><p>Delete this link? Undo can restore it.</p></Show>
   <Show when={error()}><p role="alert">{error()} Cancel and reopen to refresh changed relationships.</p></Show>
   <div class="gloss-relationship-actions"><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={busy()||(picker()&&!target())}>{confirm}</button></div>
  </form>;
 }}</Show>;
 const Edge=(p:{edge:GlossEdge;incoming?:boolean})=>{
  const related=()=>p.incoming?p.edge.sourceGlossId:p.edge.targetGlossId;
  const relatedEntry=createMemo(()=>index.rows[0]().find(row=>row.localId===related()));
  const safe=()=>!p.edge.diagnostics.includes('ambiguous-relationship')&&!p.edge.diagnostics.includes('invalid-identity');
  const supported=()=>!!decodeRelationship(p.edge.raw).value;
  return <li class="gloss-relationship" data-relationship-id={p.edge.id}>
   <span>{p.incoming?'←':'→'} {p.edge.type??'Unknown type'} — </span><button type="button" class="gloss-related" disabled={!live(related())} onPointerDown={retain} onClick={()=>select(related()!)}>{label(related())}</button>
   <Show when={live(related())}><button type="button" onPointerDown={retain} onClick={()=>select(related()!,true)}>{relatedEntry()?.occurrences().length?'Passage':'Definition'}</button></Show>
   <Show when={!p.edge.active}><small>{p.edge.diagnostics.map(d=>issueNames[d]??d).join(' · ')}</small></Show>
   <div class="gloss-relationship-actions">
    <Show when={safe()&&p.edge.active&&supported()}><button type="button" onPointerDown={retain} onClick={e=>begin('update',p.edge.sourceGlossId,e.currentTarget,p.edge)}>Type</button><button type="button" onPointerDown={retain} onClick={e=>begin('reverse',p.edge.sourceGlossId,e.currentTarget,p.edge)}>Reverse</button></Show>
    <Show when={safe()&&supported()&&live(p.edge.sourceGlossId)}><button type="button" onPointerDown={retain} onClick={e=>begin('retarget',p.edge.sourceGlossId,e.currentTarget,p.edge)}>Retarget</button></Show>
    <Show when={safe()}><button type="button" onPointerDown={retain} onClick={e=>begin('remove',p.edge.sourceGlossId,e.currentTarget,p.edge)}>Delete Link</button></Show>
    <For each={[...new Set([p.edge.sourceGlossId,p.edge.targetGlossId].filter((id):id is string=>!!id))]}>{id=><Show when={graph.nodes(id).length===1&&graph.nodes(id)[0].deleted}><button type="button" onPointerDown={retain} onClick={e=>begin('restore',p.edge.sourceGlossId,e.currentTarget,p.edge,id)}>Restore {id===p.edge.sourceGlossId?'source':'target'}</button></Show>}</For>
   </div>
  </li>;
 };
 const Groups=(p:{entry:GlossEntry})=>{
  const relations=()=>graph.relations(p.entry.localId);
  const Group=(q:{incoming:boolean})=>{const edges=()=>q.incoming?relations().activeIncoming:relations().activeOutgoing,groupKey=p.entry.localId+(q.incoming?':in':':out');const[expanded,setExpanded]=createSignal(state.expanded.has(groupKey));const counts=createMemo(()=>{const values=new Map<string,number>();for(const e of edges())values.set(e.type!,1+(values.get(e.type!)??0));return [...values].map(([type,n])=>`${type} ${n}`).join(' · ');});return <details open={expanded()} onToggle={e=>{const open=e.currentTarget.open;setExpanded(open);if(open)state.expanded.add(groupKey);else state.expanded.delete(groupKey);}}><summary>{q.incoming?'Incoming':'Outgoing'} ({edges().length})<small>{counts()}</small></summary><Show when={expanded()}><ul><For each={edges()}>{edge=><Edge edge={edge} incoming={q.incoming}/>}</For><Show when={!edges().length}><li>No links.</li></Show></ul></Show></details>;};
  return <section class="gloss-relationship-groups" aria-label="Gloss relationships"><Group incoming={true}/><Group incoming={false}/><button type="button" disabled={!live(p.entry.localId)} onPointerDown={retain} onClick={e=>begin('create',p.entry.localId,e.currentTarget)}>Add Relationship</button></section>;
 };
 const Diagnostics=()=>{const[expanded,setExpanded]=createSignal(false);return <details class="gloss-relationship-issues" onToggle={e=>setExpanded(e.currentTarget.open)}><summary>Relationships needing attention ({graph.issues().length})</summary><Show when={expanded()}><ul><For each={graph.issues()}>{edge=><li><small>From {label(edge.sourceGlossId)}</small><ul><Edge edge={edge}/></ul></li>}</For><Show when={!graph.issues().length}><li>No relationship issues.</li></Show></ul></Show></details>;};
 return {Panel,Groups,Diagnostics,draft};
}
