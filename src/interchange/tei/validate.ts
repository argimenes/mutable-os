import type { ExistingBlockDto, JsonObject } from '../../block-tree/types';
import { teiModes, teiBlockProperties, teiStandoffProperties } from './definitions';

/** Producer assertions, not source-schema or registry-membership admission. */
export function validateTeiDocument(document: ExistingBlockDto) {
  const fail = (message: string): never => { throw Error(`TEI converter invariant: ${message}`); };
  if (document.type !== 'document-block' || document.children?.length !== 1 || document.children[0].type !== 'page-block') fail('expected Document → one Page');
  const modes = new Map(teiModes.map(d => [d.mode, d])), definitions = document.linkedAnnotations as Record<string, JsonObject>;
  const validateProperty = (property: JsonObject, standoff: boolean) => {
    if (!String(property.type).startsWith('tei/')) return; // Historical generic properties are independent of these partial indexes.
    const definition = (standoff ? teiStandoffProperties : teiBlockProperties).find(d => d.type === property.type);
    if (!definition) fail(`undeclared property ${property.type}`);
    definition!.validate?.(property);
  };
  for (const definition of Object.values(definitions)) validateProperty(definition, true);
  let pages = 0;
  const visit = (b: ExistingBlockDto) => {
    if (b.type === 'page-block') pages++;
    if (b.mode && !modes.get(b.mode)?.appliesTo?.includes(b.type!)) fail(`invalid mode ${b.mode} on ${b.type}`);
    for (const p of b.blockProperties as JsonObject[] ?? []) validateProperty(p, false);
    let length = 0; if (typeof b.text === 'string') for (const _ of b.text) length++;
    for (const p of b.standoffProperties as JsonObject[] ?? []) {
      validateProperty(p, true);
      if (b.type !== 'standoff-editor-block' || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end) || Number(p.start) < 0 || Number(p.end) < Number(p.start) || Number(p.end) >= length || p.isZeroWidth) fail('invalid emitted Cell range');
      if (p.annotationId && !Object.hasOwn(definitions, String(p.annotationId))) fail('missing owned definition');
    }
    b.children?.forEach(visit);
  };
  visit(document); if (pages !== 1) fail('expected exactly one Page');
}
