// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {retainGlossGraphFrame,isRetainedGlossGraphFrame} from './graph-frame';
it('admits only the exact qualified opaque frame, not copied markup',()=>{const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');expect(isRetainedGlossGraphFrame(frame)).toBe(false);const release=retainGlossGraphFrame(frame);expect(isRetainedGlossGraphFrame(frame)).toBe(true);expect(isRetainedGlossGraphFrame(frame.cloneNode(true) as Element)).toBe(false);frame.setAttribute('sandbox','allow-scripts allow-same-origin');expect(isRetainedGlossGraphFrame(frame)).toBe(false);frame.setAttribute('sandbox','allow-scripts');release();expect(isRetainedGlossGraphFrame(frame)).toBe(false);});
it('rejects non-opaque frames at registration',()=>{const frame=document.createElement('iframe');expect(()=>retainGlossGraphFrame(frame)).toThrow('opaque');});
