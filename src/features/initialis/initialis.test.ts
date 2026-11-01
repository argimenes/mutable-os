// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {defaultInitialisMetadata,initialisKey,resolution,validateInitialis} from './settings';
import {InitialisService} from './service';
import {characterSurfaceDefinition} from '../../rendering/static-character-surface';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();});
function editor(text='A test',enabled=true){
  const e=new ReactiveEditor({type:'document-block',children:[{id:'text',type:'standoff-editor-block',text,standoffProperties:[{id:'existing',type:'style/italics',start:0,end:2}]}]},{features:{initialisCharacterRenderer:enabled}});
  const view=e.createView('initialis-test'),node=Object.values(view.state.nodes).find(n=>n.payload.id==='text')!;
  cleanup.push(()=>e.dispose());return {e,view,node};
}
it('pins a complete, deterministic text-free preset and validates before rendering',()=>{
  const p=defaultInitialisMetadata();expect(validateInitialis(p)).toBe(true);expect(p.settings).not.toHaveProperty('text');expect(Object.keys(p.settings)).toHaveLength(156);
  for(const mutate of [(p:any)=>delete p.settingsVersion,(p:any)=>p.assetVersion='new',(p:any)=>p.settings.font='url(https://remote)',(p:any)=>p.settings.text='X',(p:any)=>p.settings.size=Infinity,(p:any)=>p.settings.seed=-1,(p:any)=>p.settings.inkA='red',(p:any)=>p.settings.lBlob=1,(p:any)=>p.settings.oLeaf='unbundled',(p:any)=>p.width=1024]){const copy=structuredClone(p);mutate(copy);expect(validateInitialis(copy)).toBe(false);}
  expect(initialisKey('A',p)).toBe(initialisKey('A',defaultInitialisMetadata()));expect(initialisKey('B',p)).not.toBe(initialisKey('A',p));
  expect(resolution(48,48,1)).toEqual({dpr:1,size:128});expect(resolution(48,48,2)).toEqual({dpr:2,size:256});expect(resolution(128,128,20)).toEqual({dpr:4,size:512});
  const missing={...p} as any;delete missing.rendererVersion;
  expect(characterSurfaceDefinition({type:'style/character-surface',metadata:missing},{type:'style/character-surface',renderers:[]}).renderers[0].params?.renderer).toBe('unavailable');
});
it('authors once through bounded admission, preserves Cells/annotations, and undoes/redoes',()=>{
  const {e,node,view}=editor(),cells=[...node.inlineContent],original=JSON.parse(JSON.stringify(node.payload.standoffProperties));
  const snapshot=vi.spyOn(e.repository,'snapshot'),build=vi.spyOn(view as any,'build'),commit=vi.spyOn(e.repository,'commit'),inline=vi.spyOn(e.repository as any,'commitInline');
  expect(e.initialis.apply(node.key,{anchor:0,head:1})).toBe(true);
  expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(commit).toHaveBeenCalledTimes(1);expect(inline).toHaveBeenCalledTimes(1);
  expect(node.inlineContent).toEqual(cells);expect((node.payload.standoffProperties as any[])[0]).toEqual(original[0]);expect((node.payload.standoffProperties as any[])[1].metadata).toEqual(defaultInitialisMetadata());
  const revision=e.repository.state.revision;
  expect(e.initialis.apply(node.key,{anchor:1,head:0})).toBe(false);expect(e.repository.state.revision).toBe(revision);
  e.repository.undo();expect(node.payload.standoffProperties).toEqual(original);e.repository.redo();expect((node.payload.standoffProperties as any[])).toHaveLength(2);
  expect(node.inlineContent).toEqual(cells);expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(e.initialis.service.stats.workersStarted).toBe(0);
});
it.each(['a','É','1','😀','A\u0301'])('rejects unsupported source %s without an edit',text=>{
 const {e,node}=editor(text),commit=vi.spyOn(e.repository,'commit');expect(e.initialis.apply(node.key,{anchor:0,head:1})).toBe(false);expect(commit).not.toHaveBeenCalled();
});
it('rejects collapsed, multiple-Cell, adjacent, conflicting and disabled authoring',()=>{
  const {e,node}=editor('AB C');expect(e.initialis.apply(node.key,{anchor:0,head:0})).toBe(false);expect(e.initialis.apply(node.key,{anchor:0,head:2})).toBe(false);
  e.commands.setPayloadField(node.key,'standoffProperties',[{type:'style/character-surface',start:0,end:0}]);const revision=e.repository.state.revision;
  expect(e.initialis.apply(node.key,{anchor:0,head:1})).toBe(false);expect(e.initialis.apply(node.key,{anchor:1,head:2})).toBe(false);expect(e.repository.state.revision).toBe(revision);
  const disabled=editor('A',false);expect(disabled.e.initialis.apply(disabled.node.key,{anchor:0,head:1})).toBe(false);
});
function service(maxBytes=16*1024*1024){
  const worker={postMessage:vi.fn(),terminate:vi.fn(),onmessage:null as any,onerror:null as any,onmessageerror:null as any};
  const create=vi.fn(()=>worker as unknown as Worker);
  const url=vi.fn(()=>`blob:http://localhost/${Math.random()}`),revoke=vi.fn();
  vi.stubGlobal('URL',class extends URL {static createObjectURL=url;static revokeObjectURL=revoke;});
  const s=new InitialisService(create,maxBytes);cleanup.push(()=>s.dispose());
  const complete=()=>{const id=worker.postMessage.mock.calls.at(-1)![0].id,bitmap={width:128,height:128,close:vi.fn()};worker.onmessage({data:{id,bitmap,blob:new Blob(['png']),renderMs:4}});return bitmap;};
  return {s,worker,create,complete,url,revoke};
}
const visible={visibility:'visible' as const,pixelRatio:1},offscreen={visibility:'offscreen' as const,pixelRatio:1};
it('deduplicates occurrences, reuses cached bitmaps, and creates no worker/hash on visibility-only updates',()=>{
  const {s,worker,create,complete}=service(),p=defaultInitialisMetadata(),a=vi.fn(),b=vi.fn();
  const first=s.acquire('A',p,visible,a),second=s.acquire('A',p,visible,b);expect(create).toHaveBeenCalledTimes(1);expect(worker.postMessage).toHaveBeenCalledTimes(1);
  const bitmap=complete();expect(a.mock.calls.at(-1)![0].image).toBe(b.mock.calls.at(-1)![0].image);expect(s.stats.deduplicated).toBe(1);
  const hashes=s.stats.hashes;for(let i=0;i<20;i++){first.update(offscreen);first.update(visible);}expect(s.stats.hashes).toBe(hashes);expect(worker.postMessage).toHaveBeenCalledTimes(1);
  first.dispose();second.dispose();const third=s.acquire('A',p,visible,a);expect(s.stats.cacheHits).toBe(1);third.dispose();s.dispose();expect(bitmap.close).toHaveBeenCalledTimes(1);expect(s.stats.bytes).toBe(0);
});
it('defers offscreen requests, admits explicit work before nearby work, and keeps one active job',()=>{
 const {s,worker,complete}=service(),p=defaultInitialisMetadata();const deferred=s.acquire('D',p,offscreen,()=>{});expect(worker.postMessage).not.toHaveBeenCalled();
 const a=s.acquire('A',p,visible,()=>{}),b=s.acquire('B',p,{...visible,visibility:'nearby'},()=>{});s.prioritize('C',p);const c=s.acquire('C',p,offscreen,()=>{});
 expect(worker.postMessage).toHaveBeenCalledTimes(1);complete();expect(worker.postMessage.mock.calls.at(-1)![0].text).toBe('C');complete();expect(worker.postMessage.mock.calls.at(-1)![0].text).toBe('B');complete();
 expect(s.stats.active).toBe(0);deferred.update(visible);expect(worker.postMessage.mock.calls.at(-1)![0].text).toBe('D');for(const lease of [a,b,c,deferred])lease.dispose();
});
it('discards cancelled running work and removes queued jobs without stale publication',()=>{
 const {s,worker,complete,url}=service(),p=defaultInitialisMetadata(),publish=vi.fn();const a=s.acquire('A',p,visible,publish),b=s.acquire('B',p,visible,publish);a.dispose();b.dispose();publish.mockClear();const bitmap=complete();
 expect(bitmap.close).toHaveBeenCalledTimes(1);expect(url).not.toHaveBeenCalled();expect(publish).not.toHaveBeenCalled();expect(worker.postMessage).toHaveBeenCalledTimes(1);expect(s.stats.staleResults).toBe(1);expect(s.stats.queuedCancelled).toBe(1);
});
it('evicts only unleased entries and closes/revokes resources within its byte budget',()=>{
 const {s,complete,revoke}=service(70000),p=defaultInitialisMetadata();const a=s.acquire('A',p,visible,()=>{}),bitmap=complete();a.dispose();const b=s.acquire('B',p,visible,()=>{});complete();expect(bitmap.close).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledTimes(1);expect(s.stats.bytes).toBeLessThanOrEqual(70000);
 const c=s.acquire('C',p,visible,()=>{}),refused=complete();expect(refused.close).toHaveBeenCalledTimes(1);expect(s.stats.failures).toBe(1);expect(s.stats.peakBytes).toBeLessThanOrEqual(70000);b.dispose();c.dispose();
});
it('bounds admitted queue and trips a failure circuit instead of restarting workers',()=>{
 const {s,worker,create}=service(),leases=[];for(let i=0;i<100;i++){const p=defaultInitialisMetadata();p.settings.seed=i+1;leases.push(s.acquire('A',p,visible,()=>{}));}
 expect(s.stats.active).toBe(1);expect(s.stats.queued).toBeLessThanOrEqual(64);worker.onerror({preventDefault(){}});expect(create).toHaveBeenCalledTimes(1);expect(worker.terminate).toHaveBeenCalledTimes(1);expect(s.stats.active).toBe(0);expect(s.stats.queued).toBe(0);leases.forEach(l=>l.dispose());
});
