// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'solid-js';
import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {createDialecticController} from './controller';
import {ComposerProgress} from './view';
import {DialecticProviderSession} from './dcp/live';
import {nativeDocumentSession} from '../../persistence/native-session';
import {ConversationHistory} from './continuity';
import {plainFragment} from '../../interchange/serializer';
import {exportClipboard} from '../../interchange/transport';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
async function setup(titles=false,logging=false,autosave=true){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'No test Vault'}),{headers:{'Content-Type':'application/json'}})));
 const workspace=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dialecticAutomaticTitles:titles,dialecticConversationUpdates:true,dialecticAutosave:autosave,nativeKnowledge:false,sqliteKnowledge:false,dcpTestPhaseLogging:logging,flintProbe:false}}),editor=workspace.editor;cleanup.push(()=>workspace.dispose());
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><WorkspacePresentationView session={workspace}/>,host));
 editor.installGateway(document);await editor.commandRegistry.execute('dialectic.open',{targetKey:workspace.projection.state.rootKey,args:undefined});await Promise.resolve();await Promise.resolve();
 const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
 const save=vi.spyOn(port.application.files! as Required<NonNullable<typeof port.application.files>>,'saveSubmitted').mockResolvedValue(true);
 const c=createRoot(dispose=>{cleanup.push(dispose);return createDialecticController(editor,()=>port);});cleanup.push(()=>c.dispose());
 const text=()=>port.session()!.projection.node(c.resolve(c.target(c.draft()!.id))!.children[0])!;
 return {workspace,editor,host,port,save,c,text};
}
it('defaults to a collapsed numbered rail, toggles panels without remounting the editor, and removes Save',async()=>{
 const {editor,host,c,text}=await setup(),app=host.querySelector('.dialectic-app')!,mount=editor.mounts.get(text().key);
 expect(app.classList.contains('dialectic-chat')).toBe(true);expect(app.querySelector('[data-sidebar-open=false]')).toBeTruthy();
 expect([...app.querySelectorAll('button')].some(b=>b.textContent==='Save')).toBe(false);expect([...app.querySelectorAll('button')].some(b=>b.textContent==='Save as…')).toBe(true);
 const snapshots=vi.spyOn(editor.repository,'snapshot'),revision=editor.repository.state.revision;
 app.querySelector<HTMLButtonElement>('[aria-label="Expand Contributions"]')!.click();expect(app.querySelector('[data-sidebar-open=true]')).toBeTruthy();
 app.querySelector<HTMLButtonElement>('[aria-label="Collapse Contributions"]')!.click();expect(editor.mounts.get(text().key)).toBe(mount);expect(editor.repository.state.revision).toBe(revision);expect(snapshots).not.toHaveBeenCalled();
 editor.commands.replaceInlineRange(text().key,0,0,'A contribution');c.submit();await Promise.resolve();
 expect(app.querySelector('[aria-label="Contribution chronology"] button')?.getAttribute('aria-label')).toContain('Contribution 1:');
});
it('saves only at contribution boundaries, including responses, with captured Document identity',async()=>{
 const {editor,save,c,text}=await setup(),id=c.resourceId(),snapshots=vi.spyOn(editor.repository,'snapshot'),rowBuilds=c.diagnostics.rowBuilds;
 for(let i=0;i<8;i++)editor.commands.replaceInlineRange(text().key,0,0,'word ');
 expect(save).not.toHaveBeenCalled();expect(snapshots).not.toHaveBeenCalled();expect(c.diagnostics.rowBuilds).toBe(rowBuilds);
 c.submit();await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(save.mock.calls[0][0]).toBe(id);expect(save.mock.calls[0][1]).toMatch(/^Conversation on [A-Za-z]+ \d{1,2}, \d{4}\.ink$/);
 await c.askMock();await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1][0]).toBe(id);
});
it('starts and admits the first AI response while its contribution save is pending, without allowing presentation transfer',async()=>{
 const {editor,save,c,text,port}=await setup(),native=nativeDocumentSession(editor);
 let releaseSave!:()=>void;const pendingSave=new Promise<void>(resolve=>releaseSave=resolve);
 const writes:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
  if(String(input)!=='/api/native/save')throw Error('Unexpected test request');
  const body=JSON.parse(String(init?.body));writes.push(body);if(writes.length===1)await pendingSave;
  return new Response(JSON.stringify({Success:true,Data:{result:{phase:'saved',generation:body.generation.generation},baseline:{nativeHash:'saved',markdownHash:null,generation:body.generation.generation}}}),{headers:{'Content-Type':'application/json'}});
 }));
 save.mockImplementation(async(id,filename)=>(await native.save(id,{folder:'isolated',filename}))?.phase==='saved');
 // First-use provider configuration yields while the newly submitted contribution starts saving.
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){await vi.waitFor(()=>expect(writes).toHaveLength(1));this.settings=settings;this.ready=true;return true;});
 const generated=vi.fn(async()=>'<response><p>A native response while saving.</p></response>');
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {run:generated,details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{}};});
 editor.commands.replaceInlineRange(text().key,0,0,'An ordinary first contribution');
 try{
  await c.submitAndAsk();
  expect(c.notice()).toBe('');expect(generated).toHaveBeenCalledTimes(1);expect(c.committed()).toHaveLength(2);
  expect(c.committed()[1].data.author).toBe('ai');expect(native.knowledgeEvidence(c.resourceId()).pending).toBe(true);
  expect(()=>editor.documentSessions!.presentations.check(port.session()!)).toThrow('Finish the Document Save or recovery');
  expect(writes).toHaveLength(1);
 }finally{releaseSave();}
 await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
 await vi.waitFor(()=>expect(c.saveState()?.pending).toBe(false));
 expect(c.saveState()?.error).toBe('');expect(native.isDirty(c.resourceId())).toBe(false);
 expect(writes).toHaveLength(2);expect(writes[1].location).toEqual(writes[0].location);
});
it('reports paste activity only for the native draft and clears it after completion',async()=>{
 const {editor,c,text,host}=await setup(),node=text(),mount=editor.mounts.get(node.key)!;
 const destination=mount.focusElement;mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0);
 let finish!:(value:any)=>void;vi.spyOn(editor.clipboard as any,'prepare').mockImplementationOnce(()=>new Promise(r=>finish=r));
 const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:['text/plain'],getData:(type:string)=>type==='text/plain'?'x'.repeat(10001):''}});destination.dispatchEvent(event);
 expect(c.pasting()).toBe(true);expect(host.querySelector('.dialectic-paste-progress')?.textContent).toContain('Pasting');expect(host.querySelector<HTMLButtonElement>('[aria-label="Submit contribution"]')?.disabled).toBe(true);
 c.submit();expect(c.committed()).toHaveLength(0);expect(c.notice()).toContain('paste');
 finish({fragment:plainFragment('Pasted text')});await vi.waitFor(()=>expect(c.pasting()).toBe(false));expect(host.querySelector('.dialectic-paste-progress')).toBeNull();expect(editor.node(node.key)?.inlineContent.length).toBe(11);
});
it.each(['html','native','html-only'])('pastes %s into the draft as plain text with native Undo/Redo and no save or resource lookup',async format=>{
 const {editor,c,text,save}=await setup(),node=text(),mount=editor.mounts.get(node.key)!;
 mount.focus();mount.restoreInlineSelection?.({anchor:0,head:0});editor.selections.setPrimary(node.key,node.contentKey,node.viewId,0);
 const source='A bold passage\nhttps://example.com/image.png';
 const data:Record<string,string>=format==='native'?exportClipboard(plainFragment('Native structure')):{'text/html':'<p>A <b>bold</b> passage</p><p>https://example.com/image.png</p>'};
 if(format!=='html-only')data['text/plain']=source;
 const snapshots=vi.spyOn(editor.repository,'snapshot'),assets=vi.spyOn(editor.clipboard as any,'availableAssets'),blocks=vi.spyOn(editor.clipboard as any,'availableBlocks');
 vi.mocked(fetch).mockClear();
 const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{types:Object.keys(data),getData:(type:string)=>data[type]??''}});mount.focusElement.dispatchEvent(event);
 const children=()=>c.resolve(c.target(c.draft()!.id))!.children.map(key=>editor.node(key)!);
 const pasted=()=>children().map(child=>editor.mounts.get(child.key)?.captureText?.()).join('\n');
 await vi.waitFor(()=>expect(pasted()).toBe(source));
 expect(children()).toHaveLength(2);for(const child of children()){expect(child.viewType).toBe('standoff-editor-block');expect(child.payload.standoffProperties??[]).toEqual([]);}
 expect(snapshots).not.toHaveBeenCalled();expect(assets).not.toHaveBeenCalled();expect(blocks).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
 editor.repository.undo();expect(pasted()).toBe('');editor.repository.redo();await vi.waitFor(()=>expect(pasted()).toBe(source));
});
it('renders the three-dot status during a pending request and removes it on cancellation',async()=>{
 const {editor,c,text}=await setup();editor.commands.replaceInlineRange(text().key,0,0,'Hello');c.submit();
 const host=document.body.appendChild(document.createElement('div'));cleanup.push(render(()=><ComposerProgress c={c}/>,host));
 let finish!:(raw:string)=>void;
 const pending=c.askMock(async()=>new Promise<string>(r=>finish=r));await vi.waitFor(()=>expect(host.querySelector('[aria-label="Waiting for AI response"]')).toBeTruthy());
 expect(host.querySelectorAll('.dialectic-response-progress i')).toHaveLength(3);c.cancel();expect(host.querySelector('[aria-label="Waiting for AI response"]')).toBeNull();
 finish?.('{}');await pending;expect(c.committed()).toHaveLength(1);
});

it('applies a generated title only to Document metadata, preserving filename, contribution history and counts',async()=>{
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 let finish!:(title:string)=>void;const title=vi.spyOn(DialecticProviderSession.prototype,'title').mockImplementation(()=>new Promise(r=>finish=r));
 const {editor,c,text,port}=await setup(true);editor.setAssetContext(()=>({cavernId:'fixture',session:'fixture'}));
 await c.configureProvider(c.providerSettings());
 const native=nativeDocumentSession(editor),location={folder:'isolated',filename:'My selected filename.ink'};
 (native as any).bind(c.resourceId(),location,{nativeHash:'initial',markdownHash:null,generation:null});
 editor.commands.replaceInlineRange(text().key,0,0,'How can historical interpretations be revised?');c.submit();
 await vi.waitFor(()=>expect(title).toHaveBeenCalledTimes(1));const before=c.committed().map(row=>row.id),keys=c.committed().map(row=>c.resolve(c.target(row.id))!.contentKey);
 const history=new ConversationHistory(editor);cleanup.push(()=>history.dispose());
 const original=await history.build(c.resourceId(),'ai',keys);finish('Revising historical interpretations');
 await vi.waitFor(()=>expect((c.root()!.payload.metadata as any).title).toBe('Revising historical interpretations'));
 expect(c.committed().map(row=>row.id)).toEqual(before);expect(c.diagnostics.submissions).toBe(1);expect(native.location(c.resourceId())).toEqual(location);
 expect(await history.build(c.resourceId(),'ai',keys)).toEqual(original);expect(port.application.properties()?.title).toBe('Revising historical interpretations');
 expect(original.items[0].content).not.toContain('Generate a concise');
});

it.each(['exchange.materialised','contribution.committed'])('reveals admitted AI content while %s logging is pending',async kind=>{
 const {editor,c,text}=await setup(false,true);
 editor.setAssetContext(()=>({cavernId:'test',session:'test'}));
 let block=false,release!:()=>void;
 const pending=new Promise<void>(resolve=>release=resolve);
 const diagnostic=vi.spyOn(DialecticProviderSession.prototype,'diagnostic').mockImplementation(async(event:any)=>{
  if(block&&event.kind===kind)await pending;
  return true;
 });
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {
  details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},
  run:async()=>'<response><p>Visible before diagnostic uploads finish.</p></response>',commit:async()=>{},cancel:async()=>{},
 };});
 editor.commands.replaceInlineRange(text().key,0,0,'Hello');c.submit();
 await vi.waitFor(()=>expect(diagnostic).toHaveBeenCalled());
 diagnostic.mockClear();block=true;
 const ensure=vi.spyOn(editor.focus,'ensureRendered');
 const snapshot=vi.spyOn(editor.repository,'snapshot'),commit=vi.spyOn(editor.repository,'commit');
 const exchange=c.ask();
 try{
  await vi.waitFor(()=>expect(diagnostic.mock.calls.some(([event]:any)=>event.kind===kind)).toBe(true));
  const response=c.committed().at(-1)!;
  expect(response.data.author).toBe('ai');
  expect(c.inspection()).toEqual(c.target(response.id));
  expect(c.dcpPreview()).toBe('');
  await vi.waitFor(()=>expect(ensure).toHaveBeenCalledWith(response.key,expect.any(Function)));
  expect(editor.mounts.get(response.key)?.root.textContent).toContain('Visible before diagnostic uploads finish.');
  expect(snapshot).not.toHaveBeenCalled();expect(commit).toHaveBeenCalledTimes(1);
 }finally{release();await exchange;}
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const timings=c.lastProviderExchange()?.localTimings;expect(timings?.validationAttempts).toBe(1);
 for(const name of ['lowerMs','prepareMs','admissionMs','postAdmissionDiagnosticsMs','acknowledgementMs'] as const)expect(timings?.[name]).toBeGreaterThanOrEqual(0);
});

it('keeps the conversational layout and manual Save while autosave and diagnostic logging are off',async()=>{
 const {editor,c,text,save,port,host}=await setup(false,false,false);
 const manual=vi.spyOn(port.application.files!,'save').mockResolvedValue(undefined);
 const diagnostic=vi.spyOn(DialecticProviderSession.prototype,'diagnostic');
 const history=vi.spyOn(ConversationHistory.prototype,'build');
 editor.commands.replaceInlineRange(text().key,0,0,'Manual-save conversation');c.submit();await c.askMock();
 expect(c.committed()).toHaveLength(2);expect(save).not.toHaveBeenCalled();expect(c.saveState()).toBeUndefined();
 expect(diagnostic).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();
 expect(host.querySelector('.dialectic-chat')).toBeTruthy();
 expect(host.textContent).toContain('Save with ⌘S / Ctrl+S');expect(host.textContent).not.toContain('Contributions save automatically');
 const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Save');expect(button).toBeTruthy();button!.click();
 expect(manual).toHaveBeenCalledTimes(1);
});


it('keeps semantic failures quiet and toggles a persisted contribution warning without document work',async()=>{
 const {editor,host,c,text}=await setup(false,false,false);
 vi.spyOn(DialecticProviderSession.prototype,'configure').mockImplementation(async function(this:DialecticProviderSession,settings){this.settings=settings;this.ready=true;return true;});
 const xml='<p id="p">A readable answer.</p><gloss target="missing" kind="scope">Cannot resolve.</gloss><gloss target="p" whole="true" kind="scope">A valid Gloss after the unresolved one.</gloss>';
 vi.spyOn(DialecticProviderSession.prototype,'transport').mockImplementation(function(this:DialecticProviderSession){return {run:async(_r,_s,chunk,_signal,validate)=>{chunk(xml,'text');await validate?.(xml);return xml;},details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{}};});
 editor.commands.replaceInlineRange(text().key,0,0,'Please explain.');await c.submitAndAsk();
 expect(c.notice()).toBe('');expect(c.committed()).toHaveLength(2);
 const row=c.committed()[1];expect(row.data.notices).toMatchObject([{version:1,severity:'warning',loss:true,detail:expect.stringContaining('missing')}]);
 expect(c.contributionActivity(row.id)().counts.glosses).toBe(1);
 await vi.waitFor(()=>expect(host.querySelector('[aria-label="Contribution warnings"]')).toBeTruthy());
 const toggle=host.querySelector<HTMLElement>('[aria-label="Contribution warnings"]')!,details=toggle.parentElement as HTMLDetailsElement;
 expect(details.open).toBe(false);expect(toggle.textContent?.trim()).toBe('');expect(toggle.querySelector('svg')).toBeTruthy();
 const revision=editor.repository.state.revision,snapshots=vi.spyOn(editor.repository,'snapshot');
 toggle.click();expect(details.open).toBe(true);expect(details.textContent).toContain('missing');toggle.click();expect(details.open).toBe(false);
 expect(editor.repository.state.revision).toBe(revision);expect(snapshots).not.toHaveBeenCalled();
 const {captureNative,nativeBytes,decodeNative}=await import('../../persistence/native-resource');
 const restored=decodeNative(nativeBytes(captureNative(editor.repository.readState(),c.resourceId())));
 expect(JSON.stringify(restored)).toContain('1 semantic operation was skipped');
 editor.repository.undo();expect(c.committed()).toHaveLength(1);editor.repository.redo();expect(c.committed()[1].data.notices).toEqual(row.data.notices);
});
