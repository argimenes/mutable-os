import {For,Show,createMemo,createEffect} from 'solid-js';
import type {DialecticController} from './controller';
import {activityCategories,activityLimits,type ActivityCategory,type ActivityItem} from './activity';
const categories=Object.keys(activityCategories) as ActivityCategory[];
const noticeLabel=(code:string)=>({'validation-repaired':'Response repaired','markdown-fallback':'Markdown fallback','partial-conversion':'Partial conversion','unsupported-media':'Unsupported media','incomplete-operation':'Incomplete operation'}[code]??code);
export function ContributionActivityBar(props:{c:DialecticController;id:string}){
 const c=props.c,summary=c.contributionActivity(props.id),visible=()=>summary().items.length||summary().notices.length||summary().limited;
 return <Show when={visible()}><div class="dialectic-contribution-activity" data-contribution-activity={props.id} contentEditable={false} data-cross-text-controls onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <div class="dialectic-activity-controls" role="group" aria-label="Contribution activity">
   <For each={categories.filter(key=>summary().counts[key]>0)}>{key=>{
    const meta=activityCategories[key],label=()=>`${summary().limited?'At least ':''}${summary().counts[key]} ${summary().counts[key]===1?meta.singular:meta.label}`;
    return <button data-activity-category={key} aria-label={label()} title={label()} onClick={e=>{e.stopPropagation();c.inspectActivity(props.id,key);}}><span class="dialectic-activity-full">{meta.symbol} {summary().limited?'≥':''}{summary().counts[key]} {summary().counts[key]===1?meta.singular:meta.label}</span><span class="dialectic-activity-compact" aria-hidden="true">[{meta.short}:{summary().limited?'≥':''}{summary().counts[key]}]</span></button>;
   }}</For>
   <Show when={summary().limited}><button onClick={()=>c.inspectActivity(props.id,'unavailable')} title="Activity provenance is incomplete; counts may be incomplete">More activity may be recorded</button></Show>
  </div>
  <Show when={summary().notices.length}><div class="dialectic-contribution-notices" role="group" aria-label="Contribution notices"><For each={summary().notices}>{notice=><button data-notice-code={notice.code} title={notice.detail} onClick={e=>{e.stopPropagation();c.inspectActivity(props.id,'notices');}}>! {noticeLabel(notice.code)}</button>}</For></div></Show>
 </div></Show>;
}
export function ContributionActivityInspector(props:{c:DialecticController}){
 const c=props.c;
 return <Show when={c.activityInspection()}>{selection=>{
  const summary=createMemo(()=>c.contributionActivity(selection().id)());
  const filtered=createMemo(()=>summary().items.filter(item=>selection().category==='unavailable'?!item.active:item.active&&item.category===selection().category));
  let section!:HTMLElement;
  createEffect(()=>{const selected=selection();queueMicrotask(()=>{if(c.activityInspection()===selected&&section?.isConnected){section.focus({preventScroll:true});section.scrollIntoView?.({block:'nearest'});}});});
  const source=(item:ActivityItem)=>item.annotation?c.annotationDetails(item.annotation)?.text:undefined;
  return <section ref={section} tabIndex={-1} class="dialectic-activity-inspection" aria-label="Contribution activity inspection">
   <h4>{selection().category==='notices'?'Historical notices':activityCategories[selection().category as ActivityCategory].label} · {c.label(c.target(selection().id))}</h4>
   <Show when={selection().category==='notices'} fallback={<>
    <Show when={!filtered().length}><p>No current effects in this category.</p></Show>
    <For each={filtered().slice(0,activityLimits.inspector)}>{item=><div class="dialectic-activity-item">
     <button onClick={()=>c.inspectActivityItem(item)}>{item.label}{item.target?` · ${c.label(item.target)}`:''}</button>
     <Show when={!item.active}><small>Unavailable: {item.reason}</small></Show>
     <Show when={source(item)}>{text=><blockquote>{text()}</blockquote>}</Show>
     <For each={item.sources}>{ref=><button onClick={()=>c.inspectActivityItem({...item,target:undefined,annotation:ref})}>Inspect Gloss source</button>}</For>
    </div>}</For>
    <Show when={filtered().length>activityLimits.inspector}><small>Showing the first {activityLimits.inspector} effects. The contribution's exchange record retains the recorded identities.</small></Show>
   </>}>
    <For each={summary().notices}>{notice=><div><strong>{noticeLabel(notice.code)}</strong><p>{notice.detail}</p><small>{notice.severity} · Historical authoring condition</small><Show when={notice.target}>{target=><button onClick={()=>c.inspectActivityItem({key:notice.code,category:'references',active:true,label:noticeLabel(notice.code),target:target()})}>Inspect notice target</button>}</Show></div>}</For>
   </Show>
   <Show when={summary().limited}><p>Some activity provenance is unavailable or exceeds inspection limits. Counts are lower bounds, not a complete inventory.</p></Show>
  </section>;
 }}</Show>;
}
