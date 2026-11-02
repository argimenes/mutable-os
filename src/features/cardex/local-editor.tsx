import {makeNameSingleLine} from './name';
import {For,Show,onMount,onCleanup} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {registerCoreViews} from '../../rendering/register-core-views';
import {encodeDocument} from '../../block-tree/codecs';
import {useManagedWindowOwner} from '../../rendering/window-manager';
import {NAME_TYPES} from './validation.mjs';
export interface FieldPort {read():any;focus():void;makeSingleLine():void;editor:ReactiveEditor}
const inputs=new WeakMap<Document,{editor:ReactiveEditor;release:()=>void}>();
/** Record-local repository: never registered with native persistence, Entity services or indexers. */
export function LocalField(props:{kind:'name'|'description';value:any;ready:(port:FieldPort)=>void;changed:()=>void;notice:(s:string)=>void}){
 const isName=props.kind==='name';
 const seed=isName?{type:'standoff-editor-block',text:props.value?.text??'',standoffProperties:props.value?.properties??[]}:props.value;
 const editor=new ReactiveEditor(seed,{features:{nativeDocumentPersistence:false,nativeKnowledge:false,sqliteKnowledge:false,sqliteEntities:false,entityReferences:false,documentInterchange:false,blockHistory:false,thesis:false,cardex:false,flint:false,phosphor:false,managedAssetClipboard:false,initialisCharacterRenderer:false}});
 if(isName)for(const type of NAME_TYPES)onCleanup(editor.visualEffects.registerType({type,renderers:[{id:'name-mark',name:'css-class',params:{classes:['cardex-name-mark']}}]}));
 registerCoreViews(editor);const view=editor.createView();let root!:HTMLDivElement,semantic='given-name';
 const owner=useManagedWindowOwner();
 if(owner){editor.windowManager=owner.manager;editor.focus.permit=key=>{const mount=editor.mounts.get(key);return !mount||owner.manager.lifecycle.permits(mount.focusElement);};editor.commandRegistry.permit=()=>owner.manager.lifecycle.canCommand(owner.windowId);}
 const textNode=()=>{const focused=editor.focus.state.focusedKey,node=focused&&editor.node(focused);return node&&node.viewType==='standoff-editor-block'?node:Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block');};
 const activate=()=>{if(inputs.get(document)?.editor===editor)return;inputs.get(document)?.release();for(const event of ['keydown','beforeinput','paste'])document.addEventListener(event,stopInput,true);const stop=editor.installGateway(document);const release=()=>{stop();for(const event of ['keydown','beforeinput','paste'])document.removeEventListener(event,stopInput,true);if(inputs.get(document)?.editor===editor)inputs.delete(document);};inputs.set(document,{editor,release});};
 const focus=()=>{const node=textNode();if(node){activate();editor.focus.request(node.key);editor.mounts.get(node.key)?.focus();}};
 const annotate=(type:string)=>{
  try{const node=textNode(),mount=node&&editor.mounts.get(node.key),range=mount?.captureInlineSelection?.()??(node&&editor.mounts.inlineSelection(node.key));if(!node||!range||range.anchor===range.head)throw Error('Select text in this field first.');
   const start=Math.min(range.anchor,range.head),end=Math.max(range.anchor,range.head)-1,existing=unwrap((node.payload.standoffProperties??[]) as any[]);
   if(existing.some(p=>!p.isDeleted&&p.type===type&&p.start===start&&p.end===end))return;
   editor.commands.setPayloadField(node.key,'standoffProperties',[...existing,{id:crypto.randomUUID(),type,start,end}],'Annotate field',[...existing.map((_,i)=>i),null]);mount?.restoreInlineSelection?.(range);
  }catch(e){props.notice(String(e));}
 };
 const stopInput=(event:Event)=>{if(!root?.contains(event.target as Node))return;const key=event as KeyboardEvent,input=event as InputEvent;if(isName&&event.type==='paste'&&/[\r\n]/.test((event as ClipboardEvent).clipboardData?.getData('text/plain')??'')){event.preventDefault();event.stopImmediatePropagation();props.notice('Name must remain a single line.');return;}if(isName&&((event.type==='keydown'&&key.key==='Enter'&&!key.isComposing)||(event.type==='beforeinput'&&['insertParagraph','insertLineBreak'].includes(input.inputType)))){event.preventDefault();event.stopImmediatePropagation();}};
 onMount(()=>{
  const label=isName?'Canonical Name':'Entity Description';
  const labelMount=(key:string,handle:any)=>{if(editor.node(key)?.viewType==='standoff-editor-block'){handle.focusElement.setAttribute('aria-label',label);handle.focusElement.setAttribute('aria-multiline',String(!isName));}};
  for(const node of Object.values(view.state.nodes)){const handle=editor.mounts.get(node.key);if(handle)labelMount(node.key,handle);}
  onCleanup(editor.mounts.subscribe(labelMount));onCleanup(editor.repository.subscribeChanges(props.changed));
  root.addEventListener('keydown',stopInput,true);root.addEventListener('beforeinput',stopInput,true);
  props.ready({editor,focus,makeSingleLine(){if(!isName)return;const node=textNode();if(node)makeNameSingleLine(editor,node.key);},read(){const dto=encodeDocument(editor.repository.readState());
   const clean=(b:any)=>{if(b.standoffProperties)b.standoffProperties=b.standoffProperties.filter((p:any)=>!p.isDeleted);for(const child of b.children??[])clean(child);};clean(dto);return dto;}});
 });
 onCleanup(()=>{root?.removeEventListener('keydown',stopInput,true);root?.removeEventListener('beforeinput',stopInput,true);if(inputs.get(document)?.editor===editor)inputs.get(document)?.release();editor.dispose();});
 return <div class={'cardex-local cardex-local--'+props.kind} ref={root} onFocusIn={activate} onFocusOut={()=>queueMicrotask(()=>{if(!root.contains(document.activeElement)&&inputs.get(document)?.editor===editor)inputs.get(document)?.release();})} onPaste={e=>{if(isName&&/[\r\n]/.test(e.clipboardData?.getData('text/plain')??'')){e.preventDefault();e.stopPropagation();props.notice('Name must remain a single line.');}}}>
  <ReactiveTreeView editor={editor} projection={view}/>
  <div class="cardex-field-tools" role="toolbar" aria-label={isName?'Name semantics':'Description formatting'} onPointerDown={e=>{if((e.target as Element).closest('button'))e.preventDefault();}}>
   <Show when={isName} fallback={<><button type="button" onClick={()=>annotate('style/bold')}>Bold</button><button type="button" onClick={()=>annotate('style/italics')}>Italic</button><button type="button" onClick={()=>annotate('style/underline')}>Underline</button></>}>
    <select aria-label="Name semantic type" onChange={e=>semantic=e.currentTarget.value}><For each={NAME_TYPES}>{type=><option value={type}>{type}</option>}</For></select><button type="button" onClick={()=>annotate(semantic)}>Mark selection</button>
    <button type="button" onClick={()=>{const n=textNode();if(n)editor.commands.setPayloadField(n.key,'standoffProperties',[],'Clear Name Strata');}}>Clear marks</button>
   </Show>
   <button type="button" onClick={()=>editor.repository.undo()}>Undo</button><button type="button" onClick={()=>editor.repository.redo()}>Redo</button>
  </div>
  <Show when={isName}><div class="cardex-strata"><For each={(textNode()?.payload.standoffProperties??[]) as any[]}>{p=><Show when={!p.isDeleted}><span>{p.type.replaceAll('-',' ')}</span></Show>}</For></div></Show>
 </div>;
}
