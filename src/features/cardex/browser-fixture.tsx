import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
/** Isolated real-SQL functional harness. Never imported by the application. */
import {render} from 'solid-js/web';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {registerApplicationViews} from '../../application/features';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import '../../index.css';import '../../demo/workspace-demo.css';
export function mountCardexFixture(host:HTMLElement){
 host.classList.add('workspace-demo');
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[{type:'canvas-background-block',children:[]},{type:'workspace-object-bank-block',children:Array.from({length:20},(_,i)=>({type:'document-block',id:crypto.randomUUID(),children:[{type:'standoff-editor-block',id:crypto.randomUUID(),text:'Unrelated document '+i,standoffProperties:[{id:crypto.randomUUID(),type:'style/bold',start:0,end:8}]}]}))}]}),{features:{cardexIncrement2:new URLSearchParams(location.search).get('increment2')!=='false',nativeKnowledge:false,entityReferences:false,flint:true,phosphor:false,thesis:false,blockHistory:false}});
 const editor=session.editor;editor.setAssetContext(()=>({cavernId:'cardex-test-cavern',session:'cardex-test-session'}));const view=session.projection;const dispose=render(()=><WorkspacePresentationView session={session}/>,host),gateway=editor.installGateway(document);
 const counts={snapshots:0,workspaceChanges:0,requests:0};const prototype=Object.getPrototypeOf(editor.repository),snapshot=prototype.snapshot;prototype.snapshot=function(){counts.snapshots++;return snapshot.call(this);};editor.repository.subscribeChanges(()=>counts.workspaceChanges++);
 const original=window.fetch.bind(window),timings:any[]=[];window.fetch=async(...args)=>{counts.requests++;const start=performance.now();const response=await original(...args);const body=typeof args[1]?.body==='string'?JSON.parse(args[1].body):null;timings.push({op:body?.request?.op??String(args[0]),ms:performance.now()-start});return response;};
 return {editor,view,counts,timings,open(){editor.commandRegistry.execute('cardex.open',{targetKey:view.state.rootKey,args:undefined});},dispose(){gateway();dispose();session.dispose();prototype.snapshot=snapshot;window.fetch=original;}};
}
