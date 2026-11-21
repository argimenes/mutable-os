import type { MutableFragment } from '../../interchange/fragment';
import { QUILL_TYPE, sourceRole, validQuill } from './model';

/** Admission only; serializer/materializer still own allocation and reference remapping. */
export function admittedQuillBlocks(fragment: MutableFragment): Set<string> {
  const admitted = new Set<string>();
  if (!fragment.blocks.some(b => b.type === QUILL_TYPE)) return admitted;
  const blocks = new Map(fragment.blocks.map(b => [b.localId,b]));
  const placements = new Map(fragment.placements.map(p => [p.localId,p]));
  const uses = new Map<string,number>();
  for (const p of fragment.placements) if(p.target.kind === 'local') uses.set(p.target.id,(uses.get(p.target.id)??0)+1);
  for (const b of fragment.blocks) {
    if (b.type !== QUILL_TYPE || b.inline || !validQuill(b.data.quill)) continue;
    const refs = b.blockProperties.filter(p => sourceRole({...p.attributes,type:p.type}));
    if (refs.length !== b.data.quill.sources.length) continue;
    const targets = new Set<string>();
    const valid = b.data.quill.sources.every(({role}) => {
      const matching = refs.filter(p => sourceRole({...p.attributes,type:p.type}) === role);
      const target = matching[0]?.target;
      if (matching.length !== 1 || target?.kind !== 'local' || target.object !== 'block' || targets.has(target.id)) return false;
      targets.add(target.id);
      const source = blocks.get(target.id);
      return source?.type === 'standoff-editor-block' && !!source.inline && uses.get(target.id) === 1 && b.children.some(k => {
        const p=placements.get(k);return p?.kind === 'owned' && p.target.kind === 'local' && p.target.id === target.id;
      });
    });
    if (valid) admitted.add(b.localId);
  }
  return admitted;
}
