import {inlineText} from '../../block-tree/inline-sequence';
import {SvgGlyphs} from './svg-glyphs';
import {GeometrySession,linkedWaves} from './geometry-session';
import type {QuillPath} from './model';
import {For,Show,createMemo,createSignal,createEffect,createRenderEffect,onMount,onCleanup,untrack} from 'solid-js';
import {useReactiveView} from '../../reactive-editor/context';
import type {QuillComposition} from './model';
import {sourceRole} from './model';
import {PathCache} from './geometry';
import {LatinMeasurer,type ShapeResult} from './measurement';
import {FlowEngine,caretAt,hitCaret,RangeGeometryCache} from './layout';
import {quillInput} from './input';
import {createRangeRendering,RangeEffectLayer,type RangeEffectSource} from '../../rendering/range-rendering';
import {observeFontLayout} from '../../rendering/font-layout';
import type {StandoffAnnotation} from '../../rendering/standoff-styles';
import {RelationBlocks,ChildBlocks} from '../../rendering/block-outlet';
import './surface.css';

export function QuillSurface(props:{nodeKey:string;compositionKey:string;onNative?:()=>void}){
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey];
 const [sourceRevision,setSourceRevision]=createSignal(0);const sourceContent=node()!.contentKey;
 onCleanup(editor.repository.subscribeChanges(change=>{if(change.previousContents.has(sourceContent))setSourceRevision(n=>n+1);}));
 const release=untrack(()=>projection.acquireCompactInline(props.nodeKey));onCleanup(release);
 const composition=()=>projection.state.nodes[props.compositionKey].payload.quill as unknown as QuillComposition;
 const [tool,setTool]=createSignal<'text'|'path'>('text'),[selectedPath,setSelectedPath]=createSignal(composition().paths[0].id),[preview,setPreview]=createSignal<QuillComposition>();
 const presented=()=>preview()??composition();
 const geometrySession=new GeometrySession(composition,c=>editor.commands.setPayloadField(props.compositionKey,'quill',c,'Change Quill geometry'));
 const selected=createMemo(()=>presented().paths.find(p=>p.id===selectedPath())??presented().paths[0]);
 const cancelGeometry=()=>{geometrySession.cancel();setPreview(undefined);};
 const commitGeometry=()=>{try{geometrySession.commit();}catch(e){setMessage((e as Error).message);}finally{setPreview(undefined);}};
 const changeGeometry=(change:Partial<QuillPath>)=>{try{setPreview(geometrySession.update(selected().id,change));}catch(e){setMessage((e as Error).message);}};
 const numeric=(field:keyof QuillPath,value:string)=>{const n=Number(value);if(Number.isFinite(n))changeGeometry({[field]:n});};
 const setKind=(kind:'line'|'sine')=>{changeGeometry(kind==='line'?{kind,amplitude:undefined,cycles:undefined,phase:undefined}:{kind,amplitude:20,cycles:1,phase:0});commitGeometry();};
 const generate=()=>{try{geometrySession.replace(linkedWaves(composition()));commitGeometry();setSelectedPath(presented().paths[0].id);setTool('path');}catch(e){cancelGeometry();setMessage((e as Error).message);}};
 const addPath=()=>{const c=composition(),last=c.paths.at(-1)!;let id='path-'+(c.paths.length+1);while(c.paths.some(p=>p.id===id))id+='x';const path={...last,id,y:last.y+(c.pathSpacing??76)};try{geometrySession.replace({...c,paths:[...c.paths,path],flows:c.flows.map(f=>({...f,pathIds:[...f.pathIds,id]})),viewport:{...c.viewport,height:Math.max(c.viewport.height,path.y+(path.amplitude??0)+40)}});commitGeometry();setSelectedPath(id);}catch(e){cancelGeometry();setMessage((e as Error).message);}};
 const spacing=(value:string)=>{const spacing=Number(value),c=presented();if(!Number.isFinite(spacing)||spacing<1)return;const first=c.paths[0].y;try{setPreview(geometrySession.replace({...c,pathSpacing:spacing,paths:c.paths.map((p,i)=>({...p,y:first+i*spacing})),viewport:{...c.viewport,height:Math.max(c.viewport.height,first+(c.paths.length-1)*spacing+60)}}));}catch(e){setMessage((e as Error).message);}};
 const text=createMemo(()=>{sourceRevision();const n=node(),compact=editor.repository.readState().contents[sourceContent]?.compactInline;if(compact)return inlineText(compact.spans);return n?.inlineContent.map(k=>{const c=projection.state.nodes[k];return c?.viewType==='text-cell'?String(c.payload.text??''):'\ufffc';}).join('')??'';});
 const annotations=createMemo(()=>{sourceRevision();return ((editor.repository.readState().contents[sourceContent]?.payload.standoffProperties??[]) as any[]).map(p=>editor.linkedAnnotations.resolve(p,sourceContent) as StandoffAnnotation);});
 const [message,setMessage]=createSignal(''),[fontEpoch,setFontEpoch]=createSignal(0),[focused,setFocused]=createSignal(false);
 const paths=new PathCache(),flow=new FlowEngine(),rangeGeometry=new RangeGeometryCache();let canvas:HTMLCanvasElement|undefined,context:CanvasRenderingContext2D|null|undefined;
 const measurer=new LatinMeasurer((text,font)=>{canvas??=document.createElement('canvas');context??=canvas.getContext('2d');if(!context)throw Error('Canvas text measurement is unavailable.');context.font=font;return context.measureText(text).width;});
 const styleRuns=createMemo(()=>{
  const changes=new Map<number,{italic:number;bold:number}>();
  for(const a of annotations())if(!a.isDeleted&&(a.type==='style/italics'||a.type==='style/bold'))for(const [at,delta] of [[Number(a.start),1],[Number(a.end)+1,-1]]){const entry=changes.get(at)??{italic:0,bold:0};entry[a.type==='style/italics'?'italic':'bold']+=delta;changes.set(at,entry);}
  let italic=0,bold=0;return [...changes].sort(([a],[b])=>a-b).map(([start,d])=>{italic+=d.italic;bold+=d.bold;return {start,style:[italic>0?'italic':'',bold>0?'bold':''].filter(Boolean).join(' ')};});
 });
 const shape=createMemo<ShapeResult>(previous=>{fontEpoch();const runs=styleRuns();let cursor=-1;return measurer.shape(text(),i=>{while(cursor+1<runs.length&&runs[cursor+1].start<=i)cursor++;return runs[cursor]?.style??'';},previous);});
 const geometry=createMemo(()=>{
  const c=presented(),role=((projection.state.nodes[props.compositionKey].payload.blockProperties??[]) as any[]).find(p=>p.value===node()?.payload.id&&sourceRole(p))?.metadata.quillRole;
  return c.flows.find(f=>f.sourceRole===role)!.pathIds.map(id=>paths.get(c.paths.find(p=>p.id===id)!));
 });
 const layout=createMemo(()=>flow.layout(shape(),geometry()));
 const input=quillInput(editor,props.nodeKey,layout,text,setMessage);
 let root!:HTMLDivElement,sink!:HTMLDivElement,svg!:SVGSVGElement,glyphRoot!:SVGGElement;let glyphs:SvgGlyphs|undefined;
 const primary=createMemo(()=>input.selection());
 const caret=createMemo(()=>caretAt(layout(),primary().head));
 const selectionRanges=editor.temporaryRanges.createCollection(`quill-selection:${props.nodeKey}`);onCleanup(()=>selectionRanges.dispose());
 createEffect(()=>{const s=primary();text();const start=Math.min(s.anchor,s.head),end=Math.min(text().length,Math.max(s.anchor,s.head));untrack(()=>selectionRanges.replace(end>start?[{id:'selection',range:editor.textRanges.snapshot(props.nodeKey,start,end),renderers:[{id:'selection',name:'svg-highlight',params:{color:'#78a9ff',opacity:.3}}]}]:[]));});
 const sources=createMemo<RangeEffectSource[]>(()=>{
  const result:RangeEffectSource[]=[];
  annotations().forEach((a,index)=>{if(a.isDeleted||!Number.isInteger(a.start)||!Number.isInteger(a.end))return;const base=editor.visualEffects.type(a.type);if(!base)return;const definition=a.type==='mutable/gloss'?{...base,renderers:[...base.renderers,{id:'curve-marker',name:'svg-underline',params:{color:'#a36a16',offset:4}}]}:base;const key=`${props.nodeKey}:${a.id??index}`;result.push({key,owner:{kind:'annotation',key},start:Number(a.start),end:Number(a.end)+1,type:a.type!,definition,data:a,index});});
  for(const d of editor.decorations.nodes[props.nodeKey]??[]){
   if(d.range.coordinate!=='cell')continue;
   const base=d.temporary&&!d.temporary.renderers?editor.visualEffects.type(d.type):undefined;
   result.push({key:d.runtimeKey,owner:{kind:'session',key:d.runtimeKey},start:d.range.start,end:d.range.end,type:d.type,definition:{type:d.type,renderers:d.temporary?.renderers??base?.renderers??d.renderers,states:d.temporary?.states??base?.states,stateOrder:d.temporary?.stateOrder??base?.stateOrder,events:d.temporary?.events??base?.events},data:d.temporary??{id:d.id},index:result.length});
  }
  return result;
 });
 const rendering=createRangeRendering({registry:editor.visualEffects,events:editor.annotationEvents,nodeKey:props.nodeKey,eventsEnabled:editor.features.annotationRangeEvents,sources});
 createEffect(()=>{const l=layout();rendering.layout();untrack(()=>{editor.measurements.invalidateRanges(props.nodeKey);rendering.measure((start,end)=>rangeGeometry.local(l,start,end+1),()=>0);});});
 createEffect(()=>editor.annotationEvents.setRanges(props.nodeKey,rendering.eventRanges()));
 const point=(x:number,y:number)=>{const matrix=svg.getScreenCTM();if(!matrix)return {x,y};const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());return {x:p.x,y:p.y};};
 const viewportBoxes=(boxes:Array<{x:number;y:number;width:number;height:number}>)=>{const m=svg.getScreenCTM();if(!m)return [];return boxes.map(b=>{const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);return new DOMRectReadOnly(Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));});};
 const inspectAnnotations=()=>{const s=primary(),start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head),properties=(node()?.payload.standoffProperties??[]) as StandoffAnnotation[],indexes=properties.flatMap((p,i)=>!p.isDeleted&&Number(p.start)<=(end===start?start:end-1)&&Number(p.end)>=start?[i]:[]),rect=viewportBoxes(rangeGeometry.get(layout(),start,Math.max(start+1,end)))[0]??root.getBoundingClientRect();editor.overlays.open({viewType:'annotation-panel',ownerKey:props.nodeKey,annotationIndexes:indexes,anchor:{x:rect.left,y:rect.bottom+5},title:'Annotations on path'});};
 const annotate=(type:string)=>{const s=primary(),start=Math.min(s.anchor,s.head),end=Math.max(s.anchor,s.head);if(start===end){setMessage('Select a word or range on the curve first.');return;}try{if(type==='style/italics')editor.rangeAnnotations.apply([editor.textRanges.snapshot(props.nodeKey,start,end)],type);else if(type==='mutable/gloss')editor.commandRegistry.execute('gloss.create',{targetKey:props.nodeKey,args:{selection:s}});else editor.annotationUI.get(type)?.apply([{nodeKey:props.nodeKey,start,end}],props.nodeKey);}catch(e){setMessage((e as Error).message);}};
 let drag:number|undefined,gesture:{id:number;handle:string;origin:{x:number;y:number};path:QuillPath}|undefined,moveFrame=0,pendingPoint:{x:number;y:number}|undefined;
 const flushGeometry=()=>{moveFrame=0;if(!gesture||!pendingPoint)return;const {path,origin,handle}=gesture,p=pendingPoint;pendingPoint=undefined;changeGeometry(handle==='position'?{x:path.x+p.x-origin.x,y:path.y+p.y-origin.y}:handle==='length'?{width:Math.max(1,path.width+p.x-origin.x)}:{amplitude:Math.max(0,(path.amplitude??0)+p.y-origin.y)});};
 const beginGeometry=(e:PointerEvent)=>{const target=e.target as Element,id=target.getAttribute('data-path-id');if(id)setSelectedPath(id);const handle=target.getAttribute('data-handle');if(handle){geometrySession.begin();gesture={id:e.pointerId,handle,origin:point(e.clientX,e.clientY),path:{...selected()}};svg.setPointerCapture(e.pointerId);}e.preventDefault();e.stopPropagation();};
 const pointer=(e:PointerEvent)=>{if(tool()==='path'){beginGeometry(e);return;}if(e.button!==0||layout().diagnostic)return;e.preventDefault();e.stopPropagation();const p=point(e.clientX,e.clientY),hit=hitCaret(layout(),p.x,p.y);if(!hit)return;editor.focus.request(props.nodeKey,{reason:'quill-pointer'});input.select(e.shiftKey?primary().anchor:hit.index,hit.index);drag=e.pointerId;svg.setPointerCapture(e.pointerId);};
 const move=(e:PointerEvent)=>{if(gesture?.id===e.pointerId){pendingPoint=point(e.clientX,e.clientY);if(!moveFrame)moveFrame=requestAnimationFrame(flushGeometry);return;}if(drag!==e.pointerId)return;const p=point(e.clientX,e.clientY),hit=hitCaret(layout(),p.x,p.y);if(hit)input.select(primary().anchor,hit.index);};
 const stop=()=>{drag=undefined;if(gesture){if(moveFrame)cancelAnimationFrame(moveFrame);flushGeometry();gesture=undefined;commitGeometry();}};
 const cancel=()=>{drag=undefined;gesture=undefined;if(moveFrame)cancelAnimationFrame(moveFrame);moveFrame=0;pendingPoint=undefined;cancelGeometry();};
 onMount(()=>{
  glyphs=new SvgGlyphs(glyphRoot);createRenderEffect(()=>glyphs!.update(layout(),rendering.classes()));onCleanup(()=>glyphs?.dispose());
  Object.defineProperty(root,'quillDiagnostics',{value:()=>({measurements:measurer.measurements,pathBuilds:paths.builds,fragmentFits:flow.fits,rangeBuilds:rangeGeometry.builds,glyphWrites:glyphs?.writes??0})});
  onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:sink,inputPolicy:'standoff',focus:()=>sink.focus({preventScroll:true}),captureInlineSelection:input.selection,restoreInlineSelection:s=>input.select(s.anchor,s.head),captureText:text,
   interceptInlineInput:event=>{if(event instanceof KeyboardEvent&&event.key==='Escape'&&preview()){cancel();event.preventDefault();return true;}return event.target===sink?input.handle(event):false;},
   inlineRangeRects:(start,end)=>viewportBoxes(rangeGeometry.get(layout(),start,end)),
   inlineCaretRect:index=>{const c=caretAt(layout(),index);return c?viewportBoxes([{x:c.x,y:c.y-20,width:1,height:24}])[0]:undefined;},
   inlinePointAt:(x,y)=>{const p=point(x,y);return hitCaret(layout(),p.x,p.y)?.index??0;},
   invalidateInlineLayout:()=>setFontEpoch(n=>n+1),
  }));
  const refresh=()=>{measurer.invalidate();flow.clear();setFontEpoch(n=>n+1);};
  onCleanup(observeFontLayout(root,refresh));document.fonts?.addEventListener('loadingdone',refresh);onCleanup(()=>document.fonts?.removeEventListener('loadingdone',refresh));
 });
 onCleanup(()=>{cancel();paths.clear();flow.clear();rangeGeometry.clear();editor.measurements.invalidateRanges(props.nodeKey);editor.measurements.releaseCaret(props.nodeKey);editor.annotationEvents.remove(props.nodeKey);});
 return <div ref={root} class="quill-text-surface" onKeyDown={e=>{if(e.key==='Escape'){cancel();e.preventDefault();}}} data-runtime-key={props.nodeKey} data-block-id={String(node()?.payload.id)} data-block-type="standoff-editor-block">
  <div class="quill-text-tools"><button aria-pressed={tool()==='text'} onClick={()=>{cancel();setTool('text');}}>Text</button><button aria-pressed={tool()==='path'} onClick={()=>setTool('path')}>Paths</button><button onClick={generate}>Three linked waves</button><button onClick={addPath}>Add linked path</button><span>Latin</span><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('style/italics')}>Italic</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('codex/entity-reference')}>Entity</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>annotate('mutable/gloss')}>Gloss</button><button onPointerDown={e=>e.preventDefault()} onClick={inspectAnnotations}>Annotations</button><button onClick={()=>props.onNative?.()}>Native text</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>{cancel();editor.repository.undo();}}>Undo</button><button onPointerDown={e=>e.preventDefault()} onClick={()=>{cancel();editor.repository.redo();}}>Redo</button></div>
  <Show when={tool()==='path'}><div class="quill-geometry-inspector" aria-label="Selected path geometry">
   <label>Path<select value={selected().id} onChange={e=>{cancelGeometry();setSelectedPath(e.currentTarget.value);}}><For each={presented().paths}>{p=><option value={p.id}>{p.id}</option>}</For></select></label>
   <label>Shape<select value={selected().kind} onChange={e=>setKind(e.currentTarget.value as 'line'|'sine')}><option value="line">Straight</option><option value="sine">Sine wave</option></select></label>
   <For each={['x','y','width',...(selected().kind==='sine'?['amplitude','cycles','phase']:[])] as const}>{field=><label>{({x:'X',y:'Y',width:'Length',amplitude:'Amplitude',cycles:'Frequency',phase:'Phase'} as Record<string,string>)[field]}<input aria-label={field} type="number" step={field==='cycles'||field==='phase'?'.1':'1'} value={Number(selected()[field as keyof QuillPath]??0)} onInput={e=>numeric(field as keyof QuillPath,e.currentTarget.value)} onChange={commitGeometry}/></label>}</For>
   <label>Spacing<input aria-label="spacing" type="number" min="1" value={presented().pathSpacing??76} onInput={e=>spacing(e.currentTarget.value)} onChange={commitGeometry}/></label>
   <button disabled={!preview()} onClick={cancel}>Cancel preview</button>
  </div></Show>
  <div class="quill-artboard" style={{'aspect-ratio':`${presented().viewport.width}/${presented().viewport.height}`}}>
   <svg ref={svg} class="quill-canvas" viewBox={`0 0 ${presented().viewport.width} ${presented().viewport.height}`} onPointerDown={pointer} onPointerMove={move} onPointerUp={stop} onPointerCancel={cancel} onLostPointerCapture={()=>{if(gesture)cancel();}} aria-label="Editable text on paths">
    <For each={geometry()}>{(g,i)=><path class="quill-guide" classList={{'quill-guide-selected':tool()==='path'&&presented().flows[0].pathIds[i()]===selected().id}} data-path-id={presented().flows[0].pathIds[i()]} d={g.d}/>}</For>
    <g ref={glyphRoot} class="quill-glyphs"/>
    <Show when={tool()==='path'}><g class="quill-handles">
     <circle data-handle="position" cx={selected().x} cy={selected().y} r="7"><title>Drag path position</title></circle>
     <circle data-handle="length" cx={selected().x+selected().width} cy={selected().y} r="7"><title>Drag path length</title></circle>
     <Show when={selected().kind==='sine'}><circle data-handle="amplitude" cx={selected().x+selected().width/4} cy={selected().y+(selected().amplitude??0)} r="7"><title>Drag amplitude</title></circle></Show>
    </g></Show>
    <Show when={focused()&&primary().anchor===primary().head&&caret()}>{c=><path class="quill-caret" transform={`translate(${c().x} ${c().y}) rotate(${c().angle})`} d="M0,-20 V4"/>}</Show>
   </svg>
   <RangeEffectLayer class="quill-range-effects" viewBox={`0 0 ${presented().viewport.width} ${presented().viewport.height}`} bindings={rendering.overlays()}/>
   <div ref={sink} class="quill-input-sink" contentEditable={true} role="textbox" aria-label="Quill path text input" aria-multiline="true" spellcheck={false} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}/>
  </div>
  <Show when={layout().diagnostic}><p role="status">{layout().diagnostic}</p><pre class="quill-preserved-text">{text()}</pre></Show>
  <Show when={!layout().diagnostic&&layout().overflow<text().length}><p role="status" class="quill-overflow">{text().length-layout().overflow} characters overflow the final path. Add paths or increase their length. Text is retained. {primary().head>layout().overflow?`Caret is in overflow at position ${primary().head}.`:''}</p></Show>
  <Show when={message()}><p role="status">{message()}</p></Show>
  <RelationBlocks parentKey={props.nodeKey}/><ChildBlocks parentKey={props.nodeKey}/>
 </div>;
}
