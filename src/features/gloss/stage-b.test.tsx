// @vitest-environment jsdom
import {it,expect,afterEach,vi} from 'vitest';
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {registerCoreViews} from '../../rendering/register-core-views';
import {GlossSessionIndex} from './session-index';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
function setup(){
 const definition=(id:string,value:string)=>({id,type:'mutable/gloss',value,metadata:{gloss:{version:1,localId:'local-'+id,links:{}}}});
 const e=new ReactiveEditor({type:'workspace-block',children:[{id:'doc',type:'document-block',linkedAnnotations:{g:definition('g','claim: One: two'),orphan:definition('orphan','note: Retained')},children:[{id:'p',type:'standoff-editor-block',text:'Hello world.',standoffProperties:[{id:'anchor',type:'mutable/gloss',annotationId:'g',start:0,end:4}]}]},{id:'other',type:'document-block',children:[{id:'q',type:'standoff-editor-block',text:'Unrelated'}]}]});registerCoreViews(e);const v=e.createView(),host=document.body.appendChild(document.createElement('div'));cleanup.push(()=>e.dispose(),render(()=><ReactiveTreeView editor={e} projection={v}/>,host));const node=(id:string)=>Object.values(v.state.nodes).find(n=>n.payload.id===id)!;const index=new GlossSessionIndex(e,v,node('doc').key);cleanup.push(()=>index.dispose());return{e,v,node,index};
}
it('rebases current anchors without rebuilding rows, re-parsing definitions or scanning the Document',()=>{
 const {e,node,index}=setup(),row=index.rows[0]()[0],rows=index.rows[0](),before={...index.diagnostics};const contents=new Set([e.repository.readState().contents,e.repository.state.contents]);const original=Object.values;let scans=0;vi.spyOn(Object,'values').mockImplementation((o:any)=>{if(contents.has(o))scans++;return original(o);});
 const unrelated=e.createView('unrelated-only',node('other').placementKey),writes=vi.spyOn(unrelated as any,'setState');const p=node('p');expect(index.containsOccurrence(p.key)).toBe(true);expect(index.containsOccurrence(p.inlineContent[0])).toBe(false);expect(index.containsOccurrence(node('q').key)).toBe(false);e.commands.replaceInlineRange(p.key,0,0,'x');
 expect(index.rows[0]()).toBe(rows);expect(index.rows[0]()[0]).toBe(row);expect(index.diagnostics.treeVisits).toBe(before.treeVisits);expect(index.diagnostics.definitionReads).toBe(before.definitionReads);expect(index.diagnostics.rowPublications).toBe(before.rowPublications);expect(index.diagnostics.segmentReads-before.segmentReads).toBe(1);expect(scans).toBe(0);expect(writes).not.toHaveBeenCalled();
 expect(index.range(row.occurrences()[0])?.end).toBe((e.node(p.key)!.payload.standoffProperties as any[])[0].end+1);
 const after={...index.diagnostics};e.commands.replaceInlineRange(node('q').key,0,0,'z');expect(index.diagnostics).toEqual(after);
});
it('updates and deletes orphan definitions through the Stage A editor and canonical history',()=>{
 const {e,node,index}=setup(),snapshot=vi.spyOn(e.repository,'snapshot'),root=node('doc');
 expect(index.rows[0]().find(r=>r.localId==='local-orphan')?.occurrences()).toEqual([]);
 expect(e.gloss.openDefinition(root.key,'orphan')).toBe(true);expect(document.activeElement?.tagName).toBe('TEXTAREA');expect(e.gloss.commit('question: Updated: note')).toBe(true);
 expect(index.rows[0]().find(r=>r.localId==='local-orphan')?.data()).toMatchObject({type:'question',body:' Updated: note'});
 expect(e.gloss.deleteDefinition(root.key,'orphan')).toBe(true);expect(index.rows[0]().some(r=>r.localId==='local-orphan')).toBe(false);e.repository.undo();expect(index.rows[0]().some(r=>r.localId==='local-orphan')).toBe(true);e.repository.undo();expect(index.rows[0]().find(r=>r.localId==='local-orphan')?.data().type).toBe('note');expect(snapshot).not.toHaveBeenCalled();
});
it('retains orphan rows after text removal, restores native anchors on Undo, and indexes split/merge',async()=>{
 const {e,node,index}=setup(),p=node('p');e.commands.replaceInlineRange(p.key,0,5,'');expect(index.rows[0]().find(r=>r.definitionId==='g')?.occurrences()).toEqual([]);e.repository.undo();expect(index.rows[0]().find(r=>r.definitionId==='g')?.occurrences()).toHaveLength(1);
 const right=e.commands.splitStandoff(p.key,2);await Promise.resolve();expect(index.rows[0]().find(r=>r.definitionId==='g')?.occurrences()).toHaveLength(2);e.commands.joinStandoff(p.key,right);await Promise.resolve();expect(index.rows[0]().find(r=>r.definitionId==='g')?.occurrences()).toHaveLength(2);
});
it('deduplicates logical Glosses across local occurrences and excludes foreign borrowing',async()=>{
 const {e,v,node,index}=setup();e.commands.transclude(node('p').key,{kind:'at',parentKey:node('doc').key,index:1});await Promise.resolve();expect(index.rows[0]().filter(r=>r.definitionId==='g')).toHaveLength(1);expect(index.rows[0]().find(r=>r.definitionId==='g')?.occurrences()).toHaveLength(2);
 e.commands.transclude(node('p').key,{kind:'at',parentKey:node('other').key,index:1});await Promise.resolve();const foreign=new GlossSessionIndex(e,v,node('other').key);cleanup.push(()=>foreign.dispose());expect(foreign.rows[0]()).toHaveLength(0);expect(index.rows[0]().find(r=>r.definitionId==='g')?.occurrences()).toHaveLength(2);
});
it('reuses local range geometry on scrolling and invalidates revision, width, scale and explicit font changes',()=>{
 const {e,node}=setup(),key=node('p').key,range=vi.spyOn(e.measurements,'rangeRects').mockReturnValue([new DOMRectReadOnly(15,25,40,12)]),box=new DOMRectReadOnly(10,20,100,30);
 const first=e.measurements.retainedRangeRects(key,0,5,1,box,1);expect(first[0].top).toBe(25);
 const moved=e.measurements.retainedRangeRects(key,0,5,1,new DOMRectReadOnly(10,0,100,30),1);expect(moved[0].top).toBe(5);expect(range).toHaveBeenCalledTimes(1);
 e.measurements.retainedRangeRects(key,0,5,2,box,1);e.measurements.retainedRangeRects(key,0,5,2,new DOMRectReadOnly(10,20,90,30),1);e.measurements.retainedRangeRects(key,0,5,2,box,2);e.measurements.invalidateRanges(key);e.measurements.retainedRangeRects(key,0,5,2,box,2);expect(range).toHaveBeenCalledTimes(5);
});
