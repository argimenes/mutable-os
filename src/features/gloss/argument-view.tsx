import {For,Show,createComputed,createEffect,createMemo,createSignal,onCleanup,untrack,type Accessor} from 'solid-js';
import type {GlossSessionIndex} from './session-index';
import type {GlossRegisterState} from './relationship-authoring';
import {parseGloss} from './model';
import {ARGUMENT_LIMITS,argumentChildren,argumentPath,argumentRootPath,createArgumentDiagnostics,type ArgumentDirection,type ArgumentLink,type ArgumentState} from './argument';
import './argument-view.css';
export function GlossArgumentView(props:{index:GlossSessionIndex;state:ArgumentState;registerState:GlossRegisterState;diagnostics:ReturnType<typeof createArgumentDiagnostics>;inspect:(id:string)=>void;reveal:(id:string)=>void;definition:(id:string,invoker:HTMLElement)=>void;limits?:typeof ARGUMENT_LIMITS}){
 const {index,state:s,diagnostics:d}=props,graph=index.relationships!,limits=props.limits??ARGUMENT_LIMITS;
 const selectedPathGloss=createMemo(()=>{const path=s.selectedPath[0]();if(!path)return;const last=JSON.parse(path).at(-1);return typeof last==='string'?last:last?.[2];});
 const entries=createMemo(()=>new Map(index.rows[0]().map(row=>[row.localId,row])));
 const eligible=createMemo(()=>index.rows[0]().filter(row=>{const nodes=graph.nodes(row.localId);return nodes.length===1&&!nodes[0].deleted;}));
 const suggestions=createMemo(()=>{const query=s.query[0]().trim().toLocaleLowerCase();return eligible().filter(row=>{const data=row.data();return !query||`${data.raw} ${data.alias}`.toLocaleLowerCase().includes(query);}).sort((a,b)=>Number(b.data().type.toLowerCase()==='thesis')-Number(a.data().type.toLowerCase()==='thesis'));});
 if(!s.root[0]())s.root[1](untrack(()=>{const selected=props.registerState.selected[0]();return eligible().some(row=>row.localId===selected)?selected:eligible().find(row=>row.data().type.toLowerCase()==='thesis')?.localId??eligible()[0]?.localId??'';}));
 // Source order already maintained by the session index. Publish only changed ranks;
 // offset rebasing never changes rows, so it cannot invalidate branch adjacency.
 const ranks=new Map<string,ReturnType<typeof createSignal<number>>>();
 const rank=(id:string)=>{let value=ranks.get(id);if(!value){value=createSignal(Infinity);ranks.set(id,value);}return value;};
 createComputed(()=>{const rows=index.rows[0]();d.rankPasses++;const keep=new Set(rows.map(row=>row.localId));rows.forEach((row,i)=>rank(row.localId)[1](i));for(const [id,value]of ranks)if(!keep.has(id))value[1](Infinity);});
 const used=new Set<string>(),denied=new Set<string>(),[count,setCount]=createSignal(0),[blocked,setBlocked]=createSignal(0),[retry,setRetry]=createSignal(0);
 const acquire=(path:string)=>{if(used.has(path))return true;if(used.size>=limits.rows){denied.add(path);setBlocked(denied.size);return false;}used.add(path);denied.delete(path);setCount(used.size);setBlocked(denied.size);return true;};
 const release=(path:string)=>{used.delete(path);denied.delete(path);setCount(used.size);setBlocked(denied.size);};
 function Slot(p:{id:string;path:string;ancestors:readonly string[];depth:number;link?:Accessor<ArgumentLink>}){
  const [admitted,setAdmitted]=createSignal(acquire(p.path));onCleanup(()=>release(p.path));
  createEffect(()=>{if(!admitted()){retry();setAdmitted(acquire(p.path));}});
  return <Show when={admitted()}><Row {...p}/></Show>;
 }
 function Row(p:{id:string;path:string;ancestors:readonly string[];depth:number;link?:Accessor<ArgumentLink>}){
  d.rowMounts++;const cycle=p.ancestors.includes(p.id),ancestors=[...p.ancestors,p.id];
  let branch=s.branches.get(p.path);if(!branch){branch={open:createSignal(p.depth===0),limit:createSignal(limits.page)};s.branches.set(p.path,branch);}const [open,setOpen]=branch.open,[limit,setLimit]=branch.limit;
  const node=createMemo(()=>{const nodes=graph.nodes(p.id);return nodes.length===1?nodes[0]:undefined;}),active=createMemo(()=>!!node()&&!node()!.deleted),label=createMemo(()=>parseGloss(node()?.raw??'')),entry=()=>entries().get(p.id);
  const relevant=createMemo(()=>{if(!open()||cycle||p.depth>=limits.depth||!active())return;const a=graph.relations(p.id),direction=s.direction[0]();return{incoming:direction==='outgoing'?[]:a.incoming,outgoing:direction==='incoming'?[]:a.outgoing,activeIncoming:[],activeOutgoing:[]};},undefined,{equals:(a,b)=>a===b||!!a&&!!b&&a.incoming.length===b.incoming.length&&a.outgoing.length===b.outgoing.length&&a.incoming.every((e,i)=>e===b.incoming[i])&&a.outgoing.every((e,i)=>e===b.outgoing[i])});
  const adjacency=createMemo(()=>{const adjacent=relevant();if(!adjacent)return{links:[] as ArgumentLink[],excluded:0,inspected:0};d.branchReads++;d.byPath[p.path]=(d.byPath[p.path]??0)+1;const result=argumentChildren({relations:()=>adjacent},p.id,s.direction[0](),s.predicate[0](),id=>rank(id)[0]());d.edgesInspected+=result.inspected;return result;});
  const byKey=createMemo(()=>new Map(adjacency().links.map(link=>[link.key,link]))),keys=createMemo(()=>adjacency().links.slice(0,limit()).map(link=>link.key));
  const selected=()=>props.registerState.selected[0]()===p.id&&(selectedPathGloss()!==p.id||s.selectedPath[0]()===p.path);
  const select=()=>{s.selectedPath[1](p.path);props.registerState.selected[1](p.id);};
  return <li class="gloss-argument-row" data-argument-path={p.path} data-gloss-id={p.id} data-cycle={cycle?'true':undefined}>
   <div class="gloss-argument-line" classList={{'argument-selected':selected()}}>
    <button type="button" class="argument-expand" aria-label={open()?'Collapse argument branch':'Expand argument branch'} aria-expanded={open()&&!cycle&&p.depth<limits.depth} disabled={cycle||!active()||p.depth>=limits.depth} onPointerDown={e=>e.preventDefault()} onClick={()=>setOpen(v=>!v)}>{cycle?'↩':open()?'▾':'▸'}</button>
    <button type="button" class="argument-label" onPointerDown={e=>e.preventDefault()} onClick={select} aria-pressed={selected()}>
     <Show when={p.link}><small class="argument-predicate">{p.link!().direction==='incoming'?'← ':''}{p.link!().type}{p.link!().direction==='outgoing'?' →':''} <span>({p.link!().direction})</span></small></Show>
     <strong>{active()?(label().type||'Note'):'Unavailable Gloss'}</strong><span class="argument-body">{active()?(label().text||'(unfinished Gloss)'):p.id}</span><Show when={cycle}><small>↩ Cycle reference — already on this path</small></Show>
    </button>
   </div>
   <div class="argument-actions"><Show when={active()}><Show when={entry()?.occurrences().length} fallback={<><small>Unanchored</small><button type="button" onPointerDown={e=>e.preventDefault()} onClick={e=>{select();props.definition(p.id,e.currentTarget);}}>Definition</button></>}><button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>{select();props.reveal(p.id);}}>Passage</button></Show></Show><button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>{select();props.inspect(p.id);}}>References</button></div>
   <Show when={p.depth>=limits.depth&&!cycle}><p class="argument-notice">Depth limit ({limits.depth}). Choose this Gloss as root to explore further.</p></Show>
   <Show when={open()&&!cycle&&p.depth<limits.depth&&active()}>
    <Show when={adjacency().excluded}><p class="argument-notice">{adjacency().excluded} inactive/unresolved relationship(s) omitted. <button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>{select();props.inspect(p.id);}}>Review in References</button></p></Show>
    <Show when={!adjacency().links.length}><p class="argument-empty">No matching {s.direction[0]()==='both'?'':s.direction[0]()+' '}relationships.</p></Show>
    <ul class="argument-children"><For each={keys()}>{key=>{const initial=untrack(()=>byKey().get(key)!);const link=()=>byKey().get(key)??initial;return <Slot id={initial.id} path={argumentPath(p.path,initial)} ancestors={ancestors} depth={p.depth+1} link={link}/>;}}</For></ul>
    <Show when={adjacency().links.length>limit()}><button type="button" class="argument-more" disabled={count()>=limits.rows} onPointerDown={e=>e.preventDefault()} onClick={()=>setLimit(n=>n+limits.page)}>Show more ({adjacency().links.length-limit()} remaining)</button></Show>
   </Show>
  </li>;
 }
 return <section class="gloss-argument" aria-label="Argument Explorer" on:keydown={e=>{if((e.target as Element).closest('input,select'))e.stopPropagation();}}>
  <div class="argument-controls"><label>Find root<input aria-label="Find argument root" placeholder="Type, text or alias" value={s.query[0]()} onInput={e=>s.query[1](e.currentTarget.value)}/></label>
   <Show when={s.query[0]()&&!suggestions().length}><small role="status">No matching roots.</small></Show><label class="argument-root-picker">Root<select aria-label="Argument root" value={s.root[0]()} onChange={e=>{s.root[1](e.currentTarget.value);props.registerState.selected[1](e.currentTarget.value);s.selectedPath[1](argumentRootPath(e.currentTarget.value));}}>
    <Show when={!suggestions().some(row=>row.localId===s.root[0]())}><option value={s.root[0]()}>{entries().get(s.root[0]())?.data().raw??'Select a Gloss (current root unavailable)'}</option></Show>
    <For each={suggestions()}>{row=><option value={row.localId}>{row.data().alias||row.data().raw.slice(0,120)}</option>}</For>
   </select></label><small>Thesis Glosses listed first · any active Gloss can be a root</small>
   <label>Direction<select aria-label="Argument direction" value={s.direction[0]()} onChange={e=>s.direction[1](e.currentTarget.value as ArgumentDirection)}><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option><option value="both">Both (incoming first)</option></select></label>
   <label>Relationships<select aria-label="Argument relationship filter" value={s.predicate[0]()} onChange={e=>s.predicate[1](e.currentTarget.value)}><option value="">All types</option><Show when={s.predicate[0]()&&!graph.types().includes(s.predicate[0]())}><option value={s.predicate[0]()}>{s.predicate[0]()} (unavailable)</option></Show><For each={graph.types()}>{type=><option value={type}>{type}</option>}</For></select></label>
  </div>
  <p class="argument-summary">{count()} visible rows · Incoming: child → parent · Outgoing: parent → child</p>
  <Show when={graph.issues().length}><p class="argument-notice">{graph.issues().length} problem relationship(s) in this Document. <button type="button" onClick={()=>props.inspect(s.root[0]())}>Review in References</button></p></Show>
  <Show when={blocked()}><p role="status" class="argument-notice">Row limit ({limits.rows}) reached. Collapse branches, then <button type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>setRetry(n=>n+1)}>Retry hidden rows</button>.</p></Show>
  <Show when={s.root[0]()} keyed fallback={<p>No active Glosses. Add a Gloss to begin.</p>}>{id=><ul class="argument-roots"><Slot id={id} path={argumentRootPath(id)} ancestors={[]} depth={0}/></ul>}</Show>
 </section>;
}
