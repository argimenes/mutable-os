// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {applicationPresentations} from '../../application/application-presentations';
import {nativeDocumentSession} from '../../persistence/native-session';
import {captureNative} from '../../persistence/native-resource';
import {createDialecticController} from './controller';
import {dialecticApplication} from './index';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
async function setup(enabled=true,registry=true){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Test has no vault'}),{headers:{'Content-Type':'application/json'}})));
 const session=new WorkspaceSession(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[]}),{features:{dialectic:enabled,applicationPresentations:registry,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 const editor=session.editor;cleanup.push(()=>session.dispose());
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><WorkspacePresentationView session={session}/>,host));
 if(!enabled)return {session,editor,host};
 await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});await tick();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 expect(port?.session()).toBeTruthy();
 const c=createRoot(dispose=>{cleanup.push(dispose);return createDialecticController(editor,()=>port);});cleanup.push(()=>c.dispose());
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 const type=(s:string)=>editor.commands.replaceInlineRange(text().key,0,0,s);
 return {session,editor,host,port,c,text,type};
}
it('registers a real Desktop/Textual application and leaves Flint launch ownership intact',async()=>{
 const f=await setup();const r=applicationPresentations(f.editor);
 expect(r.resolve(dialecticApplication,'desktop',f.port!).status).toBe('ready');
 expect(r.resolve(dialecticApplication,'textual',f.port!).status).toBe('ready');
 expect(f.editor.commandRegistry.owner('flint.open')).not.toBe(f.editor.commandRegistry.owner('dialectic.open'));
 expect(f.host.querySelector('.dialectic-app')).toBeTruthy();expect(f.host.querySelector('.reactive-standoff-flow')).toBeTruthy();
});
it('is disabled by its feature flag, and works with the presentation-registry fallback',async()=>{
 const off=await setup(false);expect(off.editor.commandRegistry.owner('dialectic.open')).toBeUndefined();
 const f=await setup(true,false);expect(f.host.querySelector('.dialectic-app')).toBeTruthy();f.type!('Fallback');f.c!.submit();expect(f.c!.committed()).toHaveLength(1);
});
it('submits native compositions without snapshots, keeps identities, history and a cheap typing path',async()=>{
 const f=await setup(),c=f.c!,editor=f.editor,node=f.text!(),mount=editor.mounts.get(node.key);
 const native=nativeDocumentSession(editor);(native as any).bind(c.resourceId(),{folder:'isolated',filename:'conversation.ink'},{nativeHash:'initial',markdownHash:null,generation:null});
 const snapshots=vi.spyOn(editor.repository,'snapshot'),rebuild=vi.spyOn(c.session()!.projection as any,'build'),builds=c.diagnostics.rowBuilds;
 f.type!('A rich beginning');expect(c.diagnostics.rowBuilds).toBe(builds);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 const id=c.draft()!.id;c.submit();expect(c.notice()).toBe('');expect(c.committed().map(r=>[r.id,r.data.ordinal])).toEqual([[id,1]]);
 expect(editor.mounts.get(node.key)).toBe(mount);expect(native.isDirty(c.resourceId())).toBe(true);expect(snapshots).not.toHaveBeenCalled();expect(rebuild).not.toHaveBeenCalled();
 editor.repository.undo();expect(c.committed()).toHaveLength(0);expect(c.draft()!.id).toBe(id);
 editor.repository.redo();expect(c.committed()[0].id).toBe(id);expect(editor.mounts.get(node.key)).toBe(mount);
 const saved=captureNative(editor.repository.readState(),c.resourceId());expect(Object.values(saved.contents).filter(c=>c.viewType==='text-cell').map(c=>c.payload.text).join('')).toContain('A rich beginning');expect(JSON.stringify(saved)).toContain('"ordinal":1');
});
it('keeps chronology, inspection, reply target and selected context separate',async()=>{
 const f=await setup(),c=f.c!;f.type!('First');c.submit();const first=c.target(c.committed()[0].id);
 f.type!('Second');c.submit();c.inspect(first);c.pin(first);c.setReply(first);c.present();
 expect(c.inspection()?.blockId).toBe(c.frontier()!.id);expect(c.reply()).toEqual(first);expect(c.context()).toEqual([first]);
 f.type!('A later reply to the first');c.submit();expect(c.committed().map(r=>r.data.ordinal)).toEqual([1,2,3]);expect(c.frontier()!.data.replies).toEqual([first]);
 const n=c.resolve(first)!,text=c.session()!.projection.node(n.children[0])!;f.editor.commands.replaceInlineRange(text.key,0,0,'Edited ');
 expect(c.committed()[0].data.ordinal).toBe(1);expect(c.committed()[0].id).toBe(first.blockId);
 c.navigate(-1);expect(c.context()).toEqual([first]);
});
it('makes one undoable mock composition and rejects stale, cancelled and missing context',async()=>{
 const f=await setup(),c=f.c!;f.type!('One');c.submit();const first=c.target(c.frontier()!.id);c.pin(first);
 const snapshots=vi.spyOn(f.editor.repository,'snapshot');await c.askMock();expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const generated=c.resolve(c.target(c.frontier()!.id))!;expect(generated.children.some(k=>c.session()!.projection.node(k)?.viewType==='table-block')).toBe(true);expect(snapshots).not.toHaveBeenCalled();
 f.editor.repository.undo();expect(c.committed()).toHaveLength(1);f.editor.repository.redo();expect(c.committed()).toHaveLength(2);
 c.inspect(first);const stale=c.askMock();const t=c.session()!.projection.node(c.resolve(first)!.children[0])!;f.editor.commands.replaceInlineRange(t.key,0,0,'Changed');await stale;expect(c.notice()).toContain('context changed');expect(c.committed()).toHaveLength(2);
 const pending=c.askMock();c.cancel();await pending;expect(c.committed()).toHaveLength(2);expect(c.busy()).toBe(false);
 c.pin({kind:'block',resourceId:c.resourceId(),blockId:'missing'});await c.askMock();expect(c.notice()).toContain('unavailable');expect(c.context()).toHaveLength(2);
});
