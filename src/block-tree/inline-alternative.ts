import type { ContentRecord, JsonObject } from './types';

export const INLINE_READING = 'inline-reading:';
/** One host position. Relation names address owned reading Blocks; their text
 * and annotations are authoritative only in those Blocks' coordinate spaces. */
export interface InlineAlternativeProperties extends JsonObject {
  version: 1;
  id: string;
  readings: readonly string[];
  metadata?: JsonObject;
}
export interface InlineAlternativeAtom { kind: 'alternative'; properties: InlineAlternativeProperties }
export const isReadingRelation = (name: string) => name.startsWith(INLINE_READING);
export const alternativeSlots = (c: ContentRecord) => c.compactInline?.spans.filter((a): a is InlineAlternativeAtom => a.kind === 'alternative') ?? [];

export function validateAlternativeSlot(value: InlineAlternativeProperties): void {
  if (!value || typeof value !== 'object' || value.version !== 1 || typeof value.id !== 'string' || !value.id.trim() ||
    !Array.isArray(value.readings) || !value.readings.length || value.readings.some(r => typeof r !== 'string' || !isReadingRelation(r) || r.length === INLINE_READING.length) ||
    new Set(value.readings).size !== value.readings.length || Object.keys(value).some(k => !['version', 'id', 'readings', 'metadata'].includes(k)) ||
    value.metadata !== undefined && (!value.metadata || typeof value.metadata !== 'object' || Array.isArray(value.metadata))) throw Error('Invalid versioned inline alternative slot');
}

/** Graph-shape checks augment, never bypass, the native ownership validator. */
export function validateAlternativeReadings(c: ContentRecord, target: (placement: string) => { owned: boolean; content?: ContentRecord } | undefined) {
  for (const slot of alternativeSlots(c)) for (const name of slot.properties.readings) {
    const reading = target(c.ownedRelations[name]);
    if (!reading?.owned || reading.content?.viewType !== 'standoff-editor-block' || !reading.content.compactInline || reading.content.children.length ||
      Object.keys(reading.content.ownedRelations).some(name => !isReadingRelation(name)) || Object.keys(reading.content.opaqueRelations).length)
      throw Error('Inline alternatives require uniquely owned compact inline reading TextBlocks');
  }
}

export function validateReadingOwnership(readings: ReadonlySet<string>, owners: Iterable<{ kind: string; contentKey?: string }>) {
  if (!readings.size) return;
  const counts = new Map<string, number>();
  for (const p of owners) if (p.kind === 'owned' && p.contentKey && readings.has(p.contentKey)) counts.set(p.contentKey, (counts.get(p.contentKey) ?? 0) + 1);
  for (const key of readings) if (counts.get(key) !== 1) throw Error('An inline reading must have exactly one owned placement');
}
