// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { ReactiveEditor } from '../../reactive-editor/editor';
import { createTeiImportFeature } from '../../features/tei-import';
import { nativeDocumentSession } from '../../persistence/native-session';
import { captureNative, nativeBytes, decodeNative } from '../../persistence/native-resource';
import { runInterchange } from '../../runtime/interchange-worker';
import { prepareTeiDocument } from './native';
import { convertTei } from './convert';
import { decodeTei } from './parse';
import { encodeDocument } from '../../block-tree/codecs';
import { resourceToRepository } from '../../history/durable-core';
import { Diagnostics } from './model';
import { detectFormat } from '../formats';
import { readSelectedFile } from '../file-input';
import { documentFragment, convertSource, prepareFiles } from '../document-import';
import { plainFragment } from '../serializer';
import { validateFragment } from '../fragment';
import type { ReactiveEditorConfiguration } from '../../configuration';
const cleanups:(()=>void)[]=[];afterEach(()=>{cleanups.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();vi.unstubAllGlobals();});
const file=(name:string,text:string)=>({name,blob:new NodeBlob([text]) as unknown as Blob});
function setup(config:ReactiveEditorConfiguration={}){
 vi.stubGlobal('crypto',webcrypto);const e=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]},{id:'existing',type:'document-block',children:[{id:'old',type:'standoff-editor-block',text:'untouched'}]}]},config);cleanups.push(()=>e.dispose());return e;
}
it('imports directly to a canonical native candidate without confirmation, source writes or network',async()=>{
 const e=setup(),open=vi.fn(),fetch=vi.spyOn(globalThis,'fetch'),save=vi.spyOn(e.persistence,'saveDocument');
 await e.interchange.importNew([file('letter.xml','<TEI><text><p><persName ref="#missing">Mary</persName></p></text></TEI>')],{current:()=>true,open},'tei');
 expect(open).toHaveBeenCalledTimes(1);expect(e.interchange.question()).toBeUndefined();expect(e.interchange.message()).toContain('Imported successfully with warnings');expect(e.interchange.details().join(' ')).toContain('Unresolved');
 const id=open.mock.calls[0][0];expect(nativeDocumentSession(e).isCandidate(id)).toBe(true);expect(nativeDocumentSession(e).isDirty(id)).toBe(true);expect(nativeDocumentSession(e).location(id)).toBeUndefined();
 const bytes=nativeBytes(captureNative(e.repository.readState(),id));expect(Object.values(decodeNative(bytes).contents).filter(c=>c.viewType==='page-block')).toHaveLength(1);
 expect(JSON.stringify(decodeNative(bytes))).toContain('tei/semantic');expect(JSON.stringify(decodeNative(bytes))).not.toContain('opaque-property');expect(fetch).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
 const old=Object.values(e.repository.state.contents).find(c=>c.payload.id==='old')!;expect(old.inlineContent.map(k=>e.repository.state.contents[e.repository.state.placements[k].contentKey].payload.text).join('')).toBe('untouched');
});
it('owns declarations independently and disposes them without changing stored Ink',()=>{
 const e=setup(),before=e.encodeDocument(),stop=e.featureHost.activate(createTeiImportFeature(e));
 expect(e.blockModes.get('tei/verse-line')?.appliesTo).toEqual(['standoff-editor-block']);expect(e.standoffPropertyTypes.owner('tei/semantic')).toBe('tei/import');expect(e.blockPropertyTypes.owner('tei/semantic')).toBe('tei/import');
 stop();expect(e.standoffPropertyTypes.get('tei/semantic')).toBeUndefined();expect(e.encodeDocument()).toEqual(before);
});
it('enforces the feature flag and keeps existing documents unchanged on disabled, oversized, cancelled and stale imports',async()=>{
 for(const kind of ['disabled','oversize','cancel','stale'] as const){
  const e=setup(kind==='disabled'?{features:{teiImport:false}}:kind==='oversize'?{teiImportLimits:{bytes:3}}:{}),before=e.encodeDocument(),open=vi.fn();let current=true;
  const work=e.interchange.importNew([file('x.tei','<TEI><p>new</p></TEI>')],{current:()=>current,open});
  if(kind==='cancel')e.interchange.cancel();if(kind==='stale')current=false;await work;
  expect(open).not.toHaveBeenCalled();expect(e.encodeDocument()).toEqual(before);expect(e.interchange.message()).toMatch(/disabled|limit|cancelled|changed/);
 }
});
it('leaves the workspace unchanged on native admission failure',async()=>{
 vi.stubGlobal('crypto',webcrypto);const e=new ReactiveEditor({type:'workspace-block',children:[]});cleanups.push(()=>e.dispose());const before=e.encodeDocument(),open=vi.fn();
 await e.interchange.importNew([file('x.tei','<TEI><p>new</p></TEI>')],{current:()=>true,open});expect(e.encodeDocument()).toEqual(before);expect(open).not.toHaveBeenCalled();expect(e.interchange.message()).toContain('object bank');
});
it('reports and persists unmistakable partial conversion',async()=>{
 const e=setup({teiImportLimits:{cells:3}}),open=vi.fn();await e.interchange.importNew([file('x.tei','<TEI><p>abcdef</p></TEI>')],{current:()=>true,open});
 expect(e.interchange.message()).toContain('INCOMPLETE IMPORT');const saved=decodeNative(nativeBytes(captureNative(e.repository.readState(),open.mock.calls[0][0])));expect(JSON.stringify(encodeDocument(resourceToRepository(saved)))).toContain('configured resource limit');
});
it('decodes explicit encodings, isolates the TEI operation and never changes clipboard admission',async()=>{
 const d=new Diagnostics(10);expect(decodeTei(new Uint8Array([255,254,65,0]),d)).toBe('A');expect(decodeTei(new Uint8Array([254,255,0,65]),d)).toBe('A');
 expect(()=>decodeTei(new TextEncoder().encode('<?xml version="1.0" encoding="latin-1"?><TEI/>'),d)).toThrow(/encoding/);
 expect(decodeTei(new Uint8Array([195,40]),d)).toContain('�');expect(()=>decodeTei(new Uint8Array([0]),d)).toThrow(/NUL/);
 expect(detectFormat('x.xml','application/xml',new Uint8Array(),'tei')).toBe('tei');expect(detectFormat('x.tei','',new Uint8Array())).toBe('tei');
 await expect(readSelectedFile(file('x.tei','<TEI/>'))).rejects.toThrow(/full-document/);
 const abort=new AbortController();abort.abort();await expect(runInterchange({kind:'tei-document',file:file('x.tei','<TEI/>')},abort.signal)).rejects.toThrow(/cancelled/);
});
it.each(['html','markdown','text'] as const)('wraps the %s full-document converter once and leaves its fragments alone',format=>{
 const fragment=convertSource(format==='html'?'<p>content</p>':'content',format).fragment;
 expect(fragment.blocks.some(b=>b.type==='page-block'||b.type==='document-block')).toBe(false);
 const wrapped=validateFragment(documentFragment(fragment,'Title','Title.ink'));expect(wrapped.blocks.filter(b=>b.type==='page-block')).toHaveLength(1);
 const doc=wrapped.blocks.find(b=>b.type==='document-block')!,page=wrapped.blocks.find(b=>b.type==='page-block')!;expect(doc.children).toHaveLength(1);expect(page.children).toEqual(fragment.roots.map(r=>r.placement));
});
it.each(['image-block','mutable/structured-resource-block','mutable/academic-resource-block'])('wraps already prepared %s without inventing another page',type=>{
 const fragment=plainFragment('payload');fragment.blocks[0].type=type;const wrapped=documentFragment(fragment,'Title','Title.ink');expect(wrapped.blocks.filter(b=>b.type==='page-block')).toHaveLength(1);expect(wrapped.blocks.find(b=>b.type===type)).toBeTruthy();
});
