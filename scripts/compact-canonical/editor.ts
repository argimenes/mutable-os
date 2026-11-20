/** Bounded gateway adapter. Intentionally NOT a ReactiveEditor implementation.
 * The nominal casts below mark the exact unqualified production service boundary.
 * Unsupported structural/overlay/multicaret commands fail explicitly. */
import {InputGateway} from '../../src/input/gateway';
import {MountRegistry} from '../../src/runtime/mounts';
import {FocusService} from '../../src/runtime/focus';
import {SelectionService} from '../../src/runtime/selections';
import {MeasurementService} from '../../src/runtime/measurements';
import {BindingRegistry} from '../../src/input/bindings';
import {registerInputActions} from '../../src/input/binding-catalog';
import {ProvisionalCells} from '../../src/features/autocomplete/provisional-cells';
import {EditingOccurrence} from './presentation';
import {CompactDocument,plain} from './model';
const unsupported=()=>{throw Error('Outside compact gateway qualification: structural input, overlays, clipboard and multicaret require production service contracts');};
export function mountEditor(model:CompactDocument,host:HTMLElement,ids=model.all().filter(b=>b.inline).map(b=>b.id)){
 const mounts=new MountRegistry(),focus=new FocusService(mounts),selections=new SelectionService(),measurements=new MeasurementService(mounts),bindings=new BindingRegistry();registerInputActions(bindings,'MacIntel');
 const cellLookup=new Map<string,EditingOccurrence['cells'][number]>();
 const occurrences=new Map<string,EditingOccurrence>(),releases:Array<()=>void>=[];let serial=0;
 const node=(key:string):any=>{
  const o=occurrences.get(key);if(o)return {key,contentKey:o.id,viewId:'compact-test',viewType:'standoff-editor-block',payload:model.get(o.id).properties,inlineContent:o.cells.map(c=>c.key)};
  const cell=cellLookup.get(key);if(cell)return {key,viewType:cell.image?'image-cell':'text-cell',payload:cell.image??{text:cell.text}};
 };
 let gatewayMutation=false;
 const commands={replaceInlineRange:(key:string,start:number,end:number,text:string)=>{gatewayMutation=true;try{model.replace(occurrences.get(key)!.id,start,end,text?[{kind:'text',text}]:[]);}finally{gatewayMutation=false;}},splitStandoff:unsupported,joinStandoff:unsupported,insertEmptyStandoffSibling:unsupported,transaction:unsupported,remove:unsupported};
 const unsubscribe=model.subscribe(n=>{if(!gatewayMutation)for(const d of n.deltas)selections.mapContentEdit(d.id,d.start,d.end,d.insert.reduce((n,a)=>n+(a.kind==='text'?[...a.text].length:1),0));});
 const gateway=new InputGateway(document,mounts,focus,commands as any,{replace:unsupported} as any,selections,
  {overlays:[],isOverlayKey:()=>false,open:unsupported} as any,node,()=>undefined,()=>undefined,()=>undefined,()=>undefined,bindings,()=>false,()=>false,
  {prefix:()=>false,exitEmpty:()=>false},{state:{items:[]},clear:()=>{}} as any,direction=>{model[direction]();},()=>false);
 const uninstall=gateway.install();
 for(const id of ids){
  const flow=document.createElement('div');flow.className='compact-editor';flow.contentEditable='true';flow.spellcheck=false;flow.dataset.block=id;flow.style.whiteSpace='pre-wrap';flow.style.minHeight='1.5em';host.append(flow);
  const key=`occurrence:${++serial}`,o=new EditingOccurrence(model,id,flow);occurrences.set(key,o);let known=o.cells.map(c=>c.key);o.cells.forEach(c=>cellLookup.set(c.key,c));
  const point=(node:Node|null,offset:number):number|undefined=>{
   if(!node||!flow.contains(node))return;
   if(node===flow)return Math.min(offset,o.cells.length);
   const el=(node instanceof Element?node:node.parentElement)?.closest<HTMLElement>('[data-inline-index]');if(!el)return;
   return Number(el.dataset.inlineIndex)+(node.nodeType===Node.TEXT_NODE?[...(node.textContent??'').slice(0,offset)].length:offset>0?1:0);
  };
  const capture=()=>{const s=document.getSelection();if(!s)return;const anchor=point(s.anchorNode,s.anchorOffset),head=point(s.focusNode,s.focusOffset);return anchor===undefined||head===undefined?undefined:{anchor,head};};
  const restore=(s:{anchor:number;head:number})=>{o.selection={...s};const sel=document.getSelection();sel?.setBaseAndExtent(flow,Math.max(0,Math.min(s.anchor,flow.childNodes.length)),flow,Math.max(0,Math.min(s.head,flow.childNodes.length)));};
  const unregister=mounts.register(key,{root:flow,focusElement:flow,inputPolicy:'standoff',focus:()=>flow.focus(),captureInlineSelection:capture,restoreInlineSelection:restore,inlinePoint:(n,i)=>point(n,i),inlineBoundary:index=>({node:flow,offset:Math.min(index,flow.childNodes.length)}),captureText:()=>flow.textContent??''});
  o.beforeRender=()=>{const s=capture();if(s)o.selection=s;};
  o.afterRender=()=>{known.forEach(k=>cellLookup.delete(k));known=o.cells.map(c=>c.key);o.cells.forEach(c=>cellLookup.set(c.key,c));measurements.invalidateRanges(key);measurements.releaseCaret(key);if(document.activeElement===flow)restore(o.selection);};
  releases.push(()=>{unregister();mounts.releaseOccurrence(key);measurements.invalidateRanges(key);measurements.releaseCaret(key);o.dispose();flow.remove();});
 }
 return {occurrences,mounts,focus,selections,measurements,
  focusAt(key:string,index:number){focus.request(key);mounts.get(key)!.restoreInlineSelection!({anchor:index,head:index});},
  provisional(key:string,text:string,commit:boolean){
   const o=occurrences.get(key)!;if(o.cells.some(c=>c.image))throw Error('Provisional mixed object editing not qualified');
   const version=model.version(o.id),start=o.selection.head,draft=new ProvisionalCells(o.cells,start,start,'mention');draft.replace(start,start,text);o.renderer!.update(draft.present(o.cells));
   if(commit)model.replace(o.id,start,start,[{kind:'text',text}],version);else o.render();
   return {draft:plain(model.get(o.id).inline!),committed:commit};
  },
  dispose(){uninstall();unsubscribe();releases.forEach(f=>f());occurrences.clear();cellLookup.clear();bindings.dispose();focus.dispose();}
 };
}
