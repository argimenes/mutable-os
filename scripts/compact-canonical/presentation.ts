/** Test-only occurrence-local Cells and run presentation. No repository facade. */
import {DirectCharacterCells,type CharacterCellPresentation} from '../../src/rendering/direct-character-cells';
import {compileCellStyleRuns,cellStyleAt,standoffStyleSchema} from '../../src/rendering/standoff-styles';
import {ReplacePositionMap} from '../../src/block-tree/position-map';
import {CompactDocument,codepoints,length,type Atom,type Block} from './model';
export const allocations={editingCells:0,projections:0,renderVisits:0,readonlyRuns:0};
let serial=0;
const image=(p:Record<string,any>)=>({src:String(p.src??p.url??''),alt:String(p.alt??''),label:String(p.alt??'Image'),width:p.width,height:p.height});
export function cells(atoms:readonly Atom[]):CharacterCellPresentation[]{const out:CharacterCellPresentation[]=[];for(const a of atoms){if(a.kind==='image')out.push({key:`edit:${++serial}`,text:'\uFFFC',image:image(a.properties)});else for(const text of a.text)out.push({key:`edit:${++serial}`,text});}allocations.editingCells+=out.length;return out;}
export class EditingOccurrence {
 cells:CharacterCellPresentation[];selection={anchor:0,head:0};updates=0;
 readonly renderer?:DirectCharacterCells;private unsubscribe:()=>void;
 beforeRender?:()=>void;afterRender?:()=>void;
 constructor(readonly model:CompactDocument,readonly id:string,readonly flow?:HTMLElement){
  this.cells=cells(model.get(id).inline??[]);allocations.projections++;if(flow)this.renderer=new DirectCharacterCells(flow);
  this.render();this.unsubscribe=model.subscribe(n=>{
   if(!n.ids.includes(id))return;
   this.beforeRender?.();
   for(const d of n.deltas.filter(d=>d.id===id)){this.cells.splice(d.start,d.end-d.start,...cells(d.insert));const map=new ReplacePositionMap(d.start,d.end,length(d.insert));this.selection={anchor:map.map(this.selection.anchor,'after'),head:map.map(this.selection.head,'after')};}
   // Structural removal ends this occurrence; reopening is owned by the host.
   if(!model.has(id)){this.dispose();return;}
   this.render();this.afterRender?.();
  },id);
 }
 render(){const b=this.model.get(this.id),styles=compileCellStyleRuns(b.properties.standoffProperties??[]);this.updates++;
  for(let i=0;i<this.cells.length;i++){const c=this.cells[i];c.index=i;c.style=cellStyleAt(styles,i);allocations.renderVisits++;}
  this.renderer?.update(this.cells);
 }
 dispose(){this.unsubscribe?.();this.renderer?.dispose();this.cells=[];}
}
export function readonlyRuns(block:Block){
 const annotations=block.properties.standoffProperties??[],unsupported=new Set<string>();
 const supported=annotations.filter((p:any)=>{
  if(!p||typeof p!=='object')return false;
  const schema=standoffStyleSchema(p.type);
  if(p.isZeroWidth){unsupported.add('zero-width presentation');return false;}
  if(schema&&(schema.cellEffect||schema.regionEffect||schema.noiseEffect||schema.projection||schema.svg||schema.deferred))unsupported.add(String(p.type));
  return schema?.cell||schema?.valueStyle;
 });
 if((block.properties.blockProperties??[]).length)unsupported.add('Block-level appearance / document theme');
 if(block.inline?.some(a=>a.kind==='image'&&!a.properties.src&&!a.properties.url))unsupported.add('managed asset binding / image source resolution');
 if(block.relations&&Object.keys(block.relations.owned).length)unsupported.add('owned relation presentation / active alternatives');
 const styles=compileCellStyleRuns(supported),out:Array<{text?:string;image?:ReturnType<typeof image>;style:Record<string,any>}> = [];let offset=0;
 for(const atom of block.inline??[]){
  if(atom.kind==='image'){out.push({image:image(atom.properties),style:cellStyleAt(styles,offset)});offset++;continue;}
  const n=codepoints(atom.text),ends=[0,...styles.map(r=>r.start-offset).filter(i=>i>0&&i<n),n];
  // One pass over a span, avoiding repeated code-point scans for every style run.
  let part=0,cp=0,utf16=0,begin=0;
  for(const ch of atom.text){cp++;utf16+=ch.length;if(cp===ends[part+1]){out.push({text:atom.text.slice(begin,utf16),style:cellStyleAt(styles,offset+ends[part])});begin=utf16;part++;}}
  offset+=n;
 }
 return {runs:out,unsupported:[...unsupported]};
}
export function mountReadonly(model:CompactDocument,host:HTMLElement){
 const limitations=new Set<string>();let runs=0;
 for(const block of model.all()){
  if(!block.inline)continue;const p=document.createElement('p');p.dataset.block=block.id;p.style.whiteSpace='pre-wrap';
  const result=readonlyRuns(block);result.unsupported.forEach(x=>limitations.add(x));
  for(const run of result.runs){const e=document.createElement('span');for(const [key,value]of Object.entries(run.style))e.style.setProperty(key,String(value));
   if(run.image){const img=document.createElement('img');img.src=run.image.src;img.alt=run.image.alt;if(run.image.width)img.width=run.image.width;if(run.image.height)img.height=run.image.height;e.append(img);}else e.textContent=run.text!;
   p.append(e);runs++;
  }host.append(p);
 }allocations.readonlyRuns+=runs;return {runs,limitations:[...limitations]};
}
