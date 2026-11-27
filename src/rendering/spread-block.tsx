import {createContext, createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, useContext} from 'solid-js';
import type {BlockViewProps} from '../block-tree/types';
import {ReactiveViewProvider,useReactiveView} from '../reactive-editor/context';
import {LeafGateway,type Binding,type LeafEndpoint,type LeafSide} from '../runtime/leaf-events';
import {BlockOutlet} from './block-outlet';
import './spread-block.css';

interface LeafScope {
  key:string; side:LeafSide; gateway:LeafGateway; memory:Map<string,number>;
}
// Only the designated direct occupant can acquire a lease. Nested spreads shadow the scope.
const Scope=createContext<LeafScope>();
export function useSpreadLeaf(key:string) {
  const scope=useContext(Scope);
  if(scope?.key!==key)return;
  return {memory:scope.memory, register(endpoint:LeafEndpoint) {
    const lease=scope.gateway.register(scope.side,endpoint);onCleanup(lease.release);return lease;
  }};
}
interface Layout {ratio?:number; collapsed?:Partial<Record<LeafSide,boolean>>; bindings?:Binding[]}
const sides:LeafSide[]=['left','right'];
const clamp=(ratio:number)=>Number.isFinite(ratio)?Math.max(.15,Math.min(.85,ratio)):.5;
export function SpreadBlockView(props:BlockViewProps) {
  const context=useReactiveView(), {editor,projection}=context;
  const node=()=>projection.state.nodes[props.nodeKey];
  const metadata=()=>(node()?.payload.metadata??{}) as Record<string,unknown>;
  const config=()=>(metadata().spread??{}) as Layout;
  const bindings=createMemo<Binding[]>(()=>Array.isArray(config().bindings)?config().bindings!:[]);
  const [registration,setRegistration]=createSignal(0);
  const gateway=new LeafGateway(undefined,undefined,()=>setRegistration(n=>n+1));
  const available=(type:Binding['type'])=>{registration();return sides.some(side=>gateway.compatible(side,type));};
  onCleanup(()=>gateway.dispose());
  createEffect(()=>gateway.configure(bindings()));
  const [collapsed,setCollapsed]=createSignal({...config().collapsed});
  const [preview,setPreview]=createSignal<number>();
  const ratio=()=>preview()??clamp(config().ratio??.5);
  const write=(patch:Partial<Layout>)=>{
    const content=editor.repository.readState().contents[node().contentKey];
    const stored=(content.payload.metadata??{}) as Record<string,unknown>;
    editor.commands.setPayloadField(props.nodeKey,'metadata',
      {...stored,spread:{...(stored.spread as Layout),...patch}},'Configure spread');
  };
  let root!:HTMLElement, grid!:HTMLDivElement;
  onMount(()=>onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'container',focus:()=>root.focus()})));
  const leaf=(side:LeafSide)=>{
    const key=()=>node()?.children[side==='left'?0:1];
    return <Show when={key()} keyed>{occupant=>{
      const memory=new Map<string,number>();
      return <Show when={!collapsed()[side]}><section class="spread-leaf" data-leaf={side} aria-label={side+' leaf'}>
        <ReactiveViewProvider {...context}><Scope.Provider value={{key:occupant,gateway,side,memory}}>
          <BlockOutlet nodeKey={occupant}/>
          <Show when={side==='right'}><For each={node()?.children.slice(2)}>{key=><BlockOutlet nodeKey={key}/>}</For></Show>
        </Scope.Provider></ReactiveViewProvider>
      </section></Show>;
    }}</Show>;
  };
  const drag=(e:PointerEvent)=>{
    if(!e.currentTarget || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId))return;
    const box=grid.getBoundingClientRect();setPreview(clamp((e.clientX-box.left)/box.width));
  };
  return <section ref={root} tabindex="-1" class="mutable-spread" data-block-type="spread-block" data-runtime-key={props.nodeKey}>
    <div class="spread-controls"><For each={sides}>{side=><button aria-expanded={!collapsed()[side]}
      onClick={()=>setCollapsed({...collapsed(),[side]:!collapsed()[side]})}>{collapsed()[side]?'Reveal':'Collapse'} {side} leaf</button>}</For>
      <button onClick={()=>write({collapsed:{...collapsed()}})}>Remember open leaves</button>
      <label>Link <select aria-label="Navigation binding" value={bindings().find(b=>b.enabled)?.type??''}
        onChange={e=>{const type=e.currentTarget.value as Binding['type'];write({bindings:type?[{type,enabled:true,direction:'bidirectional'}]:[]});}}>
        <option value="">Independent</option><option disabled={!available('navigation/page')} value="navigation/page">Page</option><option disabled={!available('navigation/progress')} value="navigation/progress">Progress</option>
      </select></label>
    </div>
    <div class="spread-grid" ref={grid} style={{'grid-template-columns':!collapsed().left&&!collapsed().right?
      'minmax(0,'+ratio()+'fr) 10px minmax(0,'+(1-ratio())+'fr)':'minmax(0,1fr)'}}>
      {leaf('left')}<Show when={!collapsed().left&&!collapsed().right}><div class="spread-gutter" role="separator" tabindex="0"
        aria-label="Leaf width" aria-orientation="vertical" aria-valuemin="15" aria-valuemax="85" aria-valuenow={Math.round(ratio()*100)}
        onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={drag} onPointerCancel={()=>setPreview(undefined)} onPointerUp={e=>{drag(e);if(preview()!==undefined)write({ratio:ratio()});setPreview(undefined);}}
        onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();write({ratio:clamp(ratio()+(e.key==='ArrowLeft'?-.05:.05))});}}}/></Show>{leaf('right')}
    </div>
  </section>;
}
