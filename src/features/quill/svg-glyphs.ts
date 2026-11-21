import type {FlowLayout,Glyph} from './layout';
import {classesAt,type ClassRun} from '../../rendering/range-rendering';
const ns='http://www.w3.org/2000/svg';
interface Cell {element:SVGTextElement;glyph?:Glyph;classes?:string;offset?:number}
/** One SVG DOM owner, mirroring the native direct-character presenter. Retains
 * glyph elements by line/slot; no reactive owner per glyph and no DOM measurement.
 * Canonical positions are fragment start + explicit cluster offset. Rebasing a
 * converged fragment therefore updates one group, not every downstream glyph. */
export class SvgGlyphs {
 private lines:Array<{group:SVGGElement;cells:Cell[];start?:number}>=[];
 writes=0;
 constructor(private root:SVGGElement){}
 update(layout:FlowLayout,classes:readonly ClassRun[]){
  const doc=this.root.ownerDocument;
  for(let i=0;i<layout.fragments.length;i++){
   const fragment=layout.fragments[i];let line=this.lines[i];
   if(!line){const group=doc.createElementNS(ns,'g');this.lines.push(line={group,cells:[]});}
   if(line.start!==fragment.start){line.group.setAttribute('data-quill-fragment',String(fragment.start));line.start=fragment.start;}
   const updates:Array<{cell:Cell;g:Glyph;style:string;offset:number;text:boolean;position:boolean;font:boolean;classes:boolean;mapping:boolean;fresh:boolean}>=[];
   for(let j=0;j<fragment.glyphs.length;j++){
    const g=fragment.glyphs[j],style=classesAt(classes,g.cluster.start),offset=g.cluster.start-fragment.start;let c=line.cells[j],fresh=!c;
    if(!c){const element=doc.createElementNS(ns,'text');element.setAttribute('text-anchor','middle');line.cells.push(c={element});}
    const old=c.glyph;
    const change={cell:c,g,style,offset,fresh,text:old?.cluster.text!==g.cluster.text,position:!old||old.point.x!==g.point.x||old.point.y!==g.point.y||old.point.angle!==g.point.angle,font:old?.cluster.style!==g.cluster.style,classes:c.classes!==style,mapping:c.offset!==offset};
    if(change.text||change.position||change.font||change.classes||change.mapping)updates.push(change);
    c.glyph=g;c.classes=style;c.offset=offset;
   }
   if(!updates.length&&line.cells.length===fragment.glyphs.length)continue;
   // Batch only changed lines off-tree. Connected SVG text mutation can trigger
   // expensive ancestor invalidation. The same nodes return synchronously;
   // input, selection, viewport and range-decoration layer remain mounted.
   const parent=line.group.parentNode,next=line.group.nextSibling;if(parent)line.group.remove();
   try {
    const added=doc.createDocumentFragment();
    for(const u of updates){const {element}=u.cell,g=u.g;
     if(u.mapping){element.setAttribute('data-quill-offset',String(u.offset));this.writes++;}
     if(u.text){element.textContent=g.cluster.text==='\n'?'':g.cluster.text;this.writes++;}
     if(u.position){element.setAttribute('transform',`translate(${g.point.x} ${g.point.y}) rotate(${g.point.angle})`);this.writes++;}
     if(u.font){element.style.fontStyle=g.cluster.style.includes('italic')?'italic':'normal';element.style.fontWeight=g.cluster.style.includes('bold')?'bold':'normal';this.writes++;}
     if(u.classes){element.setAttribute('class',u.style);this.writes++;}
     if(u.fresh)added.append(element);
    }
    if(added.childNodes.length)line.group.append(added);
    while(line.cells.length>fragment.glyphs.length)line.cells.pop()!.element.remove();
   } finally {if(parent)parent.insertBefore(line.group,next);else this.root.append(line.group);}
  }
  while(this.lines.length>layout.fragments.length)this.lines.pop()!.group.remove();
 }
 dispose(){for(const line of this.lines)line.group.remove();this.lines=[];}
}
