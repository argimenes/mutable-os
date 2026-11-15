import type { ReactiveEditor } from '../reactive-editor/editor';
import { symbolicAt, symbolicBoundary, symbolicSelection, type InlineSelection, type SymbolicRange } from '../runtime/symbolic-attributes';

/** Occurrence adapter used by the real input gateway; no independent selection state. */
export function symbolicInput(editor: ReactiveEditor, key: string, flow: () => HTMLElement, ranges: () => readonly SymbolicRange[],
  capture: () => InlineSelection | undefined, restore: (selection: InlineSelection) => void, composing: (value: boolean) => void) {
  let composition: { selection: InlineSelection; staging: HTMLElement } | undefined;
  let direction: 'left'|'right'|'nearest' = 'nearest';
  const select = (s: InlineSelection) => {
    restore(s); const node=editor.node(key)!;
    editor.selections.setPrimary(key,node.contentKey,node.viewId,s.anchor,s.head);
  };
  const consume = (event: Event) => { if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();return true; };
  return {
    key(event: KeyboardEvent) {
      if(!ranges().length||event.isComposing||composition)return false;
      if(['ArrowLeft','ArrowUp','Home','PageUp'].includes(event.key))direction='left';
      else if(['ArrowRight','ArrowDown','End','PageDown'].includes(event.key))direction='right';
      else direction='nearest';
      if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.metaKey||event.ctrlKey||event.altKey)return false;
      const s=capture();if(!s)return false;
      const backward=event.key==='ArrowLeft', at=s.head;
      const r=symbolicAt(ranges(),backward?at-1:at);
      if(!r || (backward?at!==r.end:at!==r.start))return false;
      const next=backward?r.start:r.end;
      select({anchor:event.shiftKey?s.anchor:next,head:next});return consume(event);
    },
    beforeInput(event: InputEvent) {
      if(!ranges().length||composition)return false;
      const s=capture();if(!s||s.anchor!==s.head)return false;
      const backward=event.inputType==='deleteContentBackward', forward=event.inputType==='deleteContentForward';
      if(!backward&&!forward)return false;
      const r=symbolicAt(ranges(),backward?s.head-1:s.head);
      if(!r || (backward?s.head!==r.end:s.head!==r.start))return false;
      select(backward?{anchor:r.end,head:r.start}:{anchor:r.start,head:r.end});return consume(event);
    },
    normalize(s: InlineSelection) {
      if(s.anchor===s.head){const at=symbolicBoundary(ranges(),s.head,direction);return {anchor:at,head:at};}
      return symbolicSelection(ranges(),s);
    },
    composition(event: CompositionEvent, phase: 'start'|'end') {
      if(phase==='start'){
        if(!ranges().length)return false;
        const selection=capture();if(!selection)return false;
        composing(true);
        // Native IME edits only this temporary staging node. Canonical hosts and
        // the selected atom remain untouched until the committed input arrives.
        const staging=flow().ownerDocument.createElement('span');staging.dataset.symbolicComposition='true';
        staging.appendChild(flow().ownerDocument.createTextNode(''));
        flow().insertBefore(staging,flow().children[Math.min(selection.anchor,selection.head)]??null);
        const native=flow().ownerDocument.getSelection()!, range=flow().ownerDocument.createRange();
        range.setStart(staging.firstChild!,0);range.collapse(true);native.removeAllRanges();native.addRange(range);
        composition={selection,staging};return true;
      }
      if(!composition)return false;
      const {selection,staging}=composition;composition=undefined;staging.remove();
      const start=Math.min(selection.anchor,selection.head), end=Math.max(selection.anchor,selection.head);
      if(event.data){editor.commands.replaceInlineRange(key,start,end,event.data,'Compose symbolic range');}
      composing(false);
      const next=event.data?{anchor:start+[...event.data].length,head:start+[...event.data].length}:selection;select(next);queueMicrotask(()=>select(next));return true;
    },
    dispose(){composition?.staging.remove();composition=undefined;},
  };
}
