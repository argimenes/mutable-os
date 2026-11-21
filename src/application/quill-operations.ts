import { contentLength } from '../block-tree/inline-sequence';
import type { ReactiveEditor } from '../reactive-editor/editor';
import { QUILL_TYPE, SOURCE_REFERENCE, defaultComposition, sourceRole, validQuill } from '../features/quill/model';

export interface QuillInvocation {
  documentId: string; documentPlacement: string; sourcePlacement: string; sourceId: string;
  sourceContent: string; sourceRevision: number; parent: string | undefined;
  occurrence: string; viewId: string; selection?: {anchor:number;head:number};
  existingComposition?: string;
}
export function quillRecord(editor: ReactiveEditor, placement: string) {
  const s = editor.repository.readState(), p = s.placements[placement];
  if (!p || p.externalReference || !s.contents[p.contentKey]) throw Error('Quill source is unavailable.');
  return s.contents[p.contentKey];
}
/** Validate just this owned closure, never unrelated Document payloads. */
export function quillSources(editor: ReactiveEditor, placement: string): string[] {
  const c = quillRecord(editor, placement);
  if (c.viewType !== QUILL_TYPE || !validQuill(c.payload.quill)) throw Error('Unsupported Quill composition version or geometry.');
  const props = c.payload.blockProperties as unknown;
  if (!Array.isArray(props)) throw Error('Composition source references are missing.');
  const references = props.filter(p => sourceRole(p));
  if (references.length !== c.payload.quill.sources.length) throw Error('Composition source references are ambiguous.');
  const sources = c.payload.quill.sources.map(({role}) => {
    const matches = references.filter(p => sourceRole(p) === role);
    const children = c.children.filter(k => quillRecord(editor,k).payload.id === matches[0]?.value);
    if (matches.length !== 1 || children.length !== 1) throw Error('Composition source is missing or ambiguous.');
    const p = editor.repository.state.placements[children[0]], source = quillRecord(editor, p.key);
    if (p.kind !== 'owned' || p.resolvedReference || source.viewType !== 'standoff-editor-block' || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Composition text must be independently owned.');
    return p.key;
  });
  if (new Set(sources).size !== sources.length) throw Error('Each source role must own a separate TextBlock.');
  return sources;
}
export function invokeQuill(editor: ReactiveEditor, key: string): QuillInvocation {
  if (!editor.features.quill) throw Error('Quill is disabled.');
  const node = editor.node(key);
  if (!node) throw Error('Select a native TextBlock or composition.');
  const ancestors = editor.blockQueries.ancestorPath(key);
  const document = ancestors.filter(n => n.viewType === 'document-block').at(-1);
  if (!document) throw Error('Quill requires an ordinary native Document.');
  const wrapper = [...ancestors].reverse().find(n => n.viewType === QUILL_TYPE);
  const sources = wrapper ? quillSources(editor,wrapper.placementKey) : undefined;
  const sourcePlacement = sources?.includes(node.placementKey) ? node.placementKey : sources?.[0] ?? node.placementKey;
  const source = quillRecord(editor,sourcePlacement), edge = editor.repository.state.placements[sourcePlacement];
  if (source.viewType !== 'standoff-editor-block') throw Error('Select a native TextBlock.');
  if (edge.kind !== 'owned' || edge.resolvedReference || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Shared text requires an explicit reference policy.');
  const cross = editor.crossText.range();
  if (!wrapper && cross && (cross.anchor.occurrenceKey !== key || cross.head.occurrenceKey !== key)) throw Error('Quill converts one whole TextBlock. Partial-range conversion is a later milestone.');
  const selection = editor.mounts.get(key)?.captureInlineSelection?.() ?? editor.mounts.inlineSelection(key);
  if (!wrapper && selection && selection.anchor !== selection.head && (Math.min(selection.anchor,selection.head) !== 0 || Math.max(selection.anchor,selection.head) !== contentLength(source))) throw Error('Quill converts a whole TextBlock. Collapse the selection or select the entire paragraph.');
  return {documentId:String((document.payload.metadata as any)?.documentId ?? document.payload.id),documentPlacement:document.placementKey,
    sourcePlacement,sourceId:String(source.payload.id),sourceContent:source.key,sourceRevision:source.revision,parent:editor.repository.locationOf(sourcePlacement)?.ownerContentKey,
    occurrence:key,viewId:node.viewId,selection,existingComposition:wrapper?.placementKey};
}
export function convertQuill(editor: ReactiveEditor, invocation: QuillInvocation): string {
  if (!editor.features.quill) throw Error('Quill is disabled.');
  if (invocation.existingComposition) { quillSources(editor,invocation.existingComposition); return invocation.existingComposition; }
  const source = quillRecord(editor,invocation.sourcePlacement), edge = editor.repository.state.placements[invocation.sourcePlacement];
  if (source.key !== invocation.sourceContent || source.payload.id !== invocation.sourceId || source.revision !== invocation.sourceRevision || editor.repository.locationOf(invocation.sourcePlacement)?.ownerContentKey !== invocation.parent) throw Error('Source changed. Return and invoke Quill again.');
  if (edge.kind !== 'owned' || edge.resolvedReference || editor.repository.contentReferenceCount(source.key) !== 1) throw Error('Source ownership changed.');
  // Check the current ownership chain, not the whole Document/repository.
  const documentContent = quillRecord(editor, invocation.documentPlacement);
  if (String((documentContent.payload.metadata as any)?.documentId ?? documentContent.payload.id) !== invocation.documentId) throw Error('Source Document identity changed.');
  let current: string | undefined = invocation.sourcePlacement;
  while (current && current !== invocation.documentPlacement) {
    const owner: string | undefined = editor.repository.locationOf(current)?.ownerContentKey;
    if (owner === documentContent.key) { current = invocation.documentPlacement; break; }
    const placements: string[] = owner ? [...editor.repository.ownedPlacementKeys(owner)] : [];
    current = placements.length === 1 ? placements[0] : undefined;
  }
  if (!current) throw Error('Source moved to another Document.');
  let wrapper = '';
  editor.commands.structuralTransaction('Convert paragraph to Quill', () => {
    wrapper = editor.commands.insert({type:QUILL_TYPE,quill:defaultComposition(),blockProperties:[{id:crypto.randomUUID(),type:SOURCE_REFERENCE,value:invocation.sourceId,metadata:{quillRole:'body'}}],children:[]}, {kind:'before',anchorKey:invocation.sourcePlacement});
    editor.commands.move(invocation.sourcePlacement,{kind:'at',parentKey:wrapper,index:0});
  });
  return wrapper;
}
