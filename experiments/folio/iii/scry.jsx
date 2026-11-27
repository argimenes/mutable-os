import {createEffect,createSignal,For,Show,onCleanup,untrack} from 'solid-js';
import {LerSession} from '../../../src/features/entity-references/ler-session';
import {searchEntities} from '../../../src/features/entity-references/read-only-search';
import {chooseEntity} from '../../../src/features/entity-references/entity-search';
import {TextSearch} from '../../../src/runtime/text-search';

export async function lookup(body,signal){
  const r=await fetch('/api/folio/entity',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const v=await r.json();if(!r.ok)throw Error(v.error);return v;
}
export function Scry(p){
  const original=p.selection, api=p.api, editor=p.editor;
  const data={entityQuery:original.text.trim(),entityRanges:original.ranges,entityRevision:editor.repository.state.revision};
  const session=new LerSession(data,original.ranges[0].nodeKey);session.input(data.entityQuery);
  const search=new TextSearch(editor);onCleanup(()=>search.dispose());
  const [entities,setEntities]=createSignal([]),[results,setResults]=createSignal([]),[chosen,setChosen]=createSignal([]),[entity,setEntity]=createSignal(),[error,setError]=createSignal(''),[busy,setBusy]=createSignal(false);
  const reader={async search(query,signal){
    const output=await lookup({op:'search',query:query.query,stream:query.stream,match:query.match},signal),rows=new Map();
    for(const m of output.matches){if(!rows.has(m.id))rows.set(m.id,{id:m.id,name:m.name,evidence:[]});rows.get(m.id).evidence.push({kind:m.kind,text:m.text});}
    if(query.stream==='mention'||query.stream==='all')for(const row of p.inventory.state.rows){
      const hit=row.ranges.find(r=>{const text=p.text(r.contentKey),prop=p.property(r);if(!prop)return false;const value=Array.from(text).slice(prop.start,prop.end+1).join('').toLocaleLowerCase(),q=query.query.toLocaleLowerCase();return query.match==='exact'?value===q:value.includes(q);});
      if(hit&&!rows.has(row.id))rows.set(row.id,{id:row.id,name:row.name,evidence:[{kind:'mention',text:'Current publication'}]});
    }
    return {candidates:[...rows.values()],diagnostics:output.diagnostics,complete:output.complete,current(){signal.throwIfAborted();}};
  }};
  createEffect(()=>{const q=session.query(),stream=session.state.field,match=session.state.match,abort=new AbortController();setChosen([]);setResults([]);setEntities([]);setEntity();setBusy(true);
    const timer=setTimeout(async()=>{try{
      const [resolved,found]=await Promise.all([searchEntities(reader,{query:q,stream,match,scope:'vault'},abort.signal),
        search.searchText({query:q,scope:api.scope(original.ranges[0].nodeKey,'document'),options:{wholeWords:match==='exact'},signal:abort.signal})]);
      abort.signal.throwIfAborted();setEntities(resolved.candidates);setEntity(resolved.candidates[0]);setResults(found.matches.filter(m=>m.capabilities.annotate));setBusy(false);
    }catch(e){if(!abort.signal.aborted){setError(e.message);setBusy(false);}}},120);
    onCleanup(()=>{clearTimeout(timer);abort.abort();});
  });
  const cycle=()=>{const fields=['all','name','alias','mention'];session.field(fields[(fields.indexOf(session.state.field)+1)%4]);};
  let queryInput,dialog;
  function bind(){
    try{if(!entity())throw Error('Choose an entity.');editor.textRanges.validate(original.ranges,'cell');
      const groups=[original.ranges,...chosen().map(m=>m.ranges)];
      const linked=p.inventory.state.rows.find(r=>r.id===entity().id)?.ranges??[];
      const distinct=[...new Map(groups.map(g=>[g.map(r=>r.contentKey+'/'+r.start+'/'+r.end).join(','),g])).values()]
        .filter(g=>!g.every(r=>linked.some(old=>{const prop=p.property(old);return old.contentKey===r.contentKey&&prop?.start===r.start&&prop.end+1===r.end;})));
      for(const group of distinct)editor.textRanges.validate(group,'cell');
      const revision=editor.repository.state.revision;
      if(distinct.length===1)chooseEntity(api,{...data,entityRanges:distinct[0],entityRevision:revision},entity());
      else if(distinct.length)editor.linkedAnnotations.createBatch(distinct,'codex/entity-reference',entity().id,{entityId:entity().id,entityName:entity().name},revision,'Bind selected mentions');
      p.focus(entity().id);p.close();
    }catch(e){setError(e.message);}
  }
  return <section ref={dialog} tabindex='-1' class="folio-scry" role="dialog" aria-label="Scry" onKeyDown={e=>{
    if(e.isComposing)return;
    if(e.key==='Escape'){p.close();return;}
    if((e.metaKey||e.ctrlKey)&&e.key==='.'){e.preventDefault();(document.activeElement===queryInput?dialog:queryInput).focus();return;}
    if(e.key==='F2'){e.preventDefault();queryInput.focus();return;}
    if(e.target===queryInput)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();setChosen(results());return;}
    if(e.target===dialog&&e.key==='Enter'){e.preventDefault();bind();return;}
    if(['ArrowDown','ArrowUp'].includes(e.key)&&entities().length){e.preventDefault();const rows=entities();setEntity(rows[(rows.indexOf(entity())+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length]);return;}
    if(e.key==='@'||e.key==='*'){e.preventDefault();if(e.key==='@')cycle();else session.match(session.state.match==='exact'?'partial':'exact');}
  }}>
    <header><h2>Scry</h2><button onClick={p.close} aria-label="Close Scry">×</button></header>
    <blockquote>{original.text}</blockquote><input ref={queryInput} autofocus aria-label="Scry query" value={session.query()} onInput={e=>session.input(e.currentTarget.value)}/>
    <div><button onClick={cycle}>@ {session.state.field}</button><button onClick={()=>session.match(session.state.match==='exact'?'partial':'exact')}>* {session.state.match}</button></div>
    <h3>Entities</h3><Show when={!busy()} fallback={<p>Searching…</p>}><For each={entities()} fallback={<p>No matching entities.</p>}>{e=><button aria-pressed={entity()?.id===e.id} onClick={()=>setEntity(e)}>{e.name}</button>}</For></Show>
    <h3>Passages ({results().length})</h3><button disabled={!results().length} onClick={()=>setChosen(chosen().length===results().length?[]:results())}>{chosen().length===results().length?'Clear matches':'Select all matches'}</button>
    <ol><For each={results().slice(0,100)}>{m=><li><input type="checkbox" aria-label={'Include '+m.context} checked={chosen().includes(m)} onChange={e=>setChosen(e.currentTarget.checked?[...chosen(),m]:chosen().filter(x=>x!==m))}/><button onClick={()=>p.navigate(m.ranges[0])}>{m.context}</button></li>}</For></ol>
    <button disabled={!entity()||busy()} onClick={bind}>Bind {chosen().length?'selected mentions':'original selection'}</button>
    <button disabled={!entity()} onClick={()=>{p.focus(entity().id);p.close();}}>Focus entity</button>
    <Show when={error()}><output>{error()}</output></Show></section>;
}
