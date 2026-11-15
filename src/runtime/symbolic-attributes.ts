import { unwrap, createStore } from 'solid-js/store';
import type { BlockNode } from '../block-tree/types';
import type { ReactiveEditor } from '../reactive-editor/editor';

export const SYMBOLIC_ATTRIBUTE = 'mutable/symbolic-reference';
/** Only this registered type opts in. Omitted contracts retain legacy behaviour. */
export const symbolicContract = Object.freeze({ version: 1, rendering: 'substitute', selection: 'atomic', deletion: 'select-first' } as const);
export interface SymbolicRange {
  id: string; attribute: string; start: number; end: number; // half-open canonical interval
  value?: string; contract: typeof symbolicContract;
}
export type InlineSelection = { anchor: number; head: number };

/** Disposable resolver cache for Stage 1. No I/O, repository subscription or persistence. */
export class SymbolicAttributes {
  private values = createStore<Record<string, string | undefined>>({});
  read(id: string) { return this.values[0][id]; }
  set(id: string, value?: string) {
    if (value !== undefined && (!value.length || value.length > 1000 || /[\r\n]/.test(value))) throw Error('Prototype attributes require a non-empty single-line value (maximum 1000 characters).');
    this.values[1](id, value);
  }
}

export function symbolicRanges(properties: readonly Record<string, any>[], length: number, read: (id: string) => string | undefined): SymbolicRange[] {
  const candidates = properties.filter(p => p.type === SYMBOLIC_ATTRIBUTE && !p.isDeleted && !p.isZeroWidth &&
    typeof p.id === 'string' && typeof p.value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.value) &&
    (p.metadata?.symbolic?.version === undefined || p.metadata.version === 1) && (p.metadata?.symbolic?.format === undefined || p.metadata.format === 'default') &&
    Number.isInteger(p.start) && Number.isInteger(p.end) && p.start >= 0 && p.end >= p.start && p.end < length).sort((a,b) => a.start-b.start);
  // Invalid imported presentation ownership stays readable and inert; never discard authored annotations.
  const conflicts = properties.filter(p => !p.isDeleted && (p.type === 'text/superposition' || p.type === 'style/show-hide'));
  let previousEnd=-1;
  return candidates.filter((p,i) => {
    const overlap=previousEnd>=p.start || i+1<candidates.length&&candidates[i+1].start<=p.end;
    previousEnd=Math.max(previousEnd,p.end);
    return !overlap&&!conflicts.some(q=>q.start<=p.end&&q.end>=p.start);
  }).map(p => ({ id:p.id, attribute:p.value, start:p.start, end:p.end+1, value:read(p.value), contract:symbolicContract }));
}

/** Sorted disjoint intervals: binary point lookup, no DOM or layout reads. */
export function symbolicAt(ranges: readonly SymbolicRange[], at: number): SymbolicRange | undefined {
  let lo=0, hi=ranges.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(ranges[mid].start<=at)lo=mid+1;else hi=mid;}
  const r=ranges[lo-1];return r && at<r.end ? r : undefined;
}
export function symbolicBoundary(ranges: readonly SymbolicRange[], at: number, bias: 'left'|'right'|'nearest' = 'nearest'): number {
  const r=symbolicAt(ranges,at);if(!r||at===r.start)return at;
  return bias==='left'?r.start:bias==='right'?r.end:at-r.start < r.end-at?r.start:r.end;
}
export function symbolicSelection(ranges: readonly SymbolicRange[], selection: InlineSelection): InlineSelection {
  const {anchor,head}=selection;
  if(anchor===head){const at=symbolicBoundary(ranges,head);return {anchor:at,head:at};}
  return {anchor:symbolicBoundary(ranges,anchor,anchor<head?'left':'right'),head:symbolicBoundary(ranges,head,anchor<head?'right':'left')};
}
export function materialisedText(source: string, ranges: readonly SymbolicRange[], start=0, end=[...source].length): string {
  const chars=[...source];let result='',cursor=start;
  for(const r of ranges){if(r.start<start||r.end>end)continue;result+=chars.slice(cursor,r.start).join('')+(r.value??chars.slice(r.start,r.end).join(''));cursor=r.end;}
  return result+chars.slice(cursor,end).join('');
}
export function unwrapSymbolic(editor: ReactiveEditor, node: BlockNode, id: string) {
  const properties=node.payload.standoffProperties as Record<string,unknown>[];
  editor.commands.setPayloadField(node.key,'standoffProperties',unwrap(properties).filter(p=>p.type!==SYMBOLIC_ATTRIBUTE||p.id!==id),'Unwrap symbolic reference');
}
export function literaliseSymbolic(editor: ReactiveEditor, node: BlockNode, range: SymbolicRange) {
  const source=node.inlineContent.slice(range.start,range.end).map(k=>String(editor.node(k)?.payload.text??'')).join('');
  editor.commands.replaceSymbolicRange(node.key,range.id,range.value??source);
}
