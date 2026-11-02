import {describe,it,expect,vi} from 'vitest';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import {bindCardThumbnail} from './service';
describe('Cardex thumbnail admission',()=>{
 it('bounds preview work across instances, releases slots on failure, and cancels queued work',async()=>{
  const released=vi.fn(),bind=vi.fn((_image:HTMLImageElement,_asset:unknown)=>released),host={features:{managedAssetClipboard:true},readAssetContext:()=>({cavernId:'cavern',session:'session'}),assets:{bind}} as unknown as ReactiveEditor;
  const asset={kind:'managed' as const,cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)},images=Array.from({length:4},()=>document.createElement('img'));
  const stops=images.map(image=>bindCardThumbnail(host,image,asset));await Promise.resolve();expect(bind).toHaveBeenCalledTimes(1);
  stops[1]();images[0].dispatchEvent(new Event('load'));await Promise.resolve();expect(bind).toHaveBeenCalledTimes(2);expect(bind.mock.calls[1][0]).toBe(images[2]);
  images[2].title='Image unavailable in this Cavern';await Promise.resolve();await Promise.resolve();expect(bind).toHaveBeenCalledTimes(3);expect(bind.mock.calls[2][0]).toBe(images[3]);
  stops[0]();stops[2]();stops[3]();expect(released).toHaveBeenCalledTimes(3);
 });
});
