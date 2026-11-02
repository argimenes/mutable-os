# Cardex Increment 2 — review and proposed implementation

Reviewed 2026-11-02 against `CARDEX_INCREMENT_2_BRIEF_AND_ASSETS.zip`, migrations through 0009, the current Cardex implementation, and read-only inspection of the imported Vault. **Investigation only: no Increment 2 application code or database changes have been made.** Existing uncommitted Increment 1 work is preserved.

## Findings and reusable components

| Area | Verified implementation | Increment 2 consequence |
| --- | --- | --- |
| Hosting | `src/application/cardex.tsx`; shared EntityCardInstrument and CardexShell in `src/features/cardex/view.tsx` | Reuse the independent Instrument and managed-window lifecycle; outer Claims/Relationships/Facts remain placeholders. |
| Local authoring | `local-editor.tsx`, `name.ts`, `validation.mjs` | Preserve mounted editors, local Undo/Redo, manual Save, narrow authoring, and dirty/conflict handling. |
| Save errors | Increment 1 qualification records hidden-name-break repair and supported pasted Description annotations | Already fixed and qualified; retain focused regressions rather than repeat the investigation. |
| Description | Rich fragment in `Entity.descriptionDocument`; legacy plain `Entity.description` exists | Current Cardex save does not update the plain projection. Compute both in the same save operation; do not search serialized JSON. Existing plain writers already invalidate a replaced rich fragment. |
| Images | Shared ingestion and cancelable thumbnail binding in `service.ts` | Add an immediate draft object-URL preview, released on replacement/disposal; retain verified asset ingestion for persistence. |
| Entity storage | `Entity`: guid, name/nameKey, typename, description, attributes, revision, provenance/createdUtc/modifiedUtc; migration 0009 adds nameStrata, descriptionDocument, imageRef | Genuine creation time exists but is nullable. There is no soft-delete column. |
| Aliases | `EntityAlias`: entityGuid, alias/aliasKey, origin, revision/provenance; entity and alias-key indexes | Reuse literal alias matching; preserve curated/imported versus inferred alias ownership. |
| Deletion | `src/knowledge-sqlite/cardex.mjs` performs protected physical deletion, refusing dependent records | Soft delete/restore is new work and requires an approved additive migration before 2A. |
| Documents/references | `Resource`, `Block`, `StandoffProperty`, `BlockProperty`; migrations 0001/0008, `reconcile.mjs`, `entity-lookup.mjs` | Query saved SQL projections; never load whole Documents for table metrics or excerpt rows. Canonical Proposition Blocks may have null resourceGuid and must be excluded. |
| Reference identity | `src/knowledge/facts-annotations.ts` groups linked segments into one logical mention | A multi-Block annotation can have several stored ranges but one logicalGuid. Confirm the desired count unit below. |
| Relationships | Relationship(sourceEntityGuid, targetEntityGuid, typename, attributes, revision/provenance); indexed in both directions | Existing `entities.mjs` APIs support list/create/update. No canonical relationship-remove operation was found; removal must remain unavailable unless separately added to that service. No inverse-type registry was found. |
| Claims | Claim(expression, typename, attributes, revision/provenance); ClaimParticipant and ClaimQualifier(claimGuid, entityGuid, role, ordinal); ClaimEvidence stores source passages | `semantics.mjs` and host semantic capability provide canonical reads/mutations. There is no predicateGuid column. Participants and qualifiers have distinct meaning. |
| Claim typing/literals | `type-of` qualifiers require a Concept Entity; Claim typename also exists. DataPoint has valueJson/valueType and dimensions | Do not equate Claim kind, Concept qualification, and a predicate without an agreed mapping. Do not treat DataPoint literals as Claim literals. Generic Property/category tables were not found. |
| Category/Dossier | No canonical category ancestry or Entity–Dossier association/creation API found in current application and SQL services | Exact Entity typename classification is available. Hierarchy and canonical/associated Dossier controls need a confirmed model; do not infer one from arbitrary attributes. |
| Regex | `src/runtime/search-worker.ts` uses a disposable worker, cancellation and a five-second timeout; SQLite has no existing Cardex regex adapter | Reuse the isolation principle with bounded plain-text candidates; do not run untrusted patterns in the authoring worker or UI thread. Existing editor worker is not a complete database-search implementation. |

The current Vault contains 15,311 Entities, 1,972 Claims, 4,185 Relationships and 2,291 Resources. Of the Resources, 2,287 are complete Documents, two incomplete Documents, one stale Document, and one complete workspace. Inspection was read-only; no individual record contents are included here.

## Count and navigation contract proposed

- Qualifying source: Resource typename `document-block`, saved index status complete/incomplete, nondeleted `codex/entity-reference` StandoffProperty, direct/resolved target. This follows existing lookup eligibility while restricting to Documents. Report saved-index scope and incomplete coverage explicitly. Exclude stale/missing/ambiguous/unavailable sources, workspace Resources, null-resource Proposition annotations, BlockProperty references, and local Entity fields.
- No canonical Document archived/deleted flag was found. Do not invent one or infer it from a filename/tag. Missing resources are excluded by index eligibility; an explicit archive convention needs qualification if supplied.
- Proposed Mentions count: distinct logicalGuid, grouping segments of one linked annotation. Distinct independently authored mentions in one Document still count separately. Confirm this versus counting every stored segment before implementation.
- Documents: distinct qualifying resourceGuid. Claims: distinct ClaimParticipant.claimGuid, not participant-row count. Qualifier filters remain explicit. Relationships: union source/target incidences and deduplicate relationship guid, including self-relations.
- Mentions tab: one logical occurrence with its constituent ranges, compact bounded excerpts from indexed Block text, and exact source navigation. Preserve Cell versus UTF-16 coordinates; verify source identity/hash before selecting stale offsets. `openThesisSource` in `src/application/thesis.tsx` demonstrates current identity/ownership validation, but any shared helper should be narrowly extracted rather than copying a second navigation system.

## Query feasibility and measured baseline

Read-only SQL experiment on the existing 15,311-Entity / 46,300-StandoffProperty Vault, three executions per query, returning at most 31 rows:

| Query | First execution | Next executions |
| --- | ---: | ---: |
| Name order, existing index | 3.78 ms | 0.05 / 0.03 ms |
| Global Document-count order | 833.19 ms | 71.07 / 69.94 ms |
| Global logical-mention-count order | 72.29 ms | 79.06 / 75.63 ms |

These are synchronous SQLite query timings, **not HTTP or browser responsiveness measurements**, and not controlled cold-cache benchmarks. No new indexes or query caches were installed. The count queries deliberately used a shared aggregate computing both metrics; they are a baseline, not the final implementation.

`EXPLAIN QUERY PLAN`: name order scans `IX_Entity_Name`. Count sorts materialize the aggregate, use `IX_Standoff_Type`, look up Resources by guid, and allocate temporary B-trees for grouping/distinct counts and global ordering. Global count sorting cannot be implemented by sorting the visible page.

Proposed query strategy:

1. Name/created sorts select a keyset page first; batch counts for those Entity IDs using existing target/participant/relationship indexes. No per-row HTTP or SQL requests.
2. Global count sorts aggregate over the entire qualifying matched set before taking a page. Add and measure a covering partial reference index before considering persisted count tables. Keep SQL off the editor thread and outside typing paths.
3. Stable order ends with Entity guid. Cursor includes query/sort identity; canonical/index changes invalidate obsolete result state rather than silently combining incompatible pages. Preserve the search state when returning from View.
4. Shared parameterized AND-filter compiler, independent of Cardex JSX. Literal name/alias/plain Description, relationship direction/type, verified Claim roles, image/date filters first. No invented predicate or literal schema.
5. Regex phase must cap pattern length, total candidate bytes/rows and execution time; cancel stale requests and terminate pathological evaluation in an isolated reader worker. Limit exhaustion returns an explicit incomplete/refine-query result, never a supposedly complete globally sorted page. If this cannot meet the budget, propose a narrower phase for approval. No new regex engine is approved by this review.

## Migration proposal requiring approval

Add nullable `Entity.deletedUtc TEXT`: null means active; an ISO UTC value means deleted. Existing records remain active. Soft delete and restore update this field plus existing revision/provenance in the normal canonical ledger/receipt transaction. Preserve Entity identity, aliases, references, Claims, Relationships, assets, names and Document text. Bulk operations cover explicitly selected page IDs and expected revisions, with individual success/conflict reporting and retry-safe operation IDs.

Proposed index shapes to qualify in a temporary database:

```sql
ALTER TABLE Entity ADD COLUMN deletedUtc TEXT;
CREATE INDEX IX_Entity_Active_Name ON Entity(nameKey, guid)
  WHERE deletedUtc IS NULL;
CREATE INDEX IX_Entity_Deleted_Name ON Entity(nameKey, guid)
  WHERE deletedUtc IS NOT NULL;
CREATE INDEX IX_Entity_Created ON Entity(createdUtc, guid);
CREATE INDEX IX_Standoff_Entity_Document_Logical
  ON StandoffProperty(targetEntityGuid, resourceGuid, logicalGuid)
  WHERE typename='codex/entity-reference' AND isDeleted=0
    AND resolution IN ('direct','resolved');
```

Use the shared resolved-display path to append ` [deleted]`; keep canonical names and editable fields unchanged. Deletion state must remain intelligible outside Cardex and when the new UI flag is disabled. Existing reference targets remain resolvable; new selection defaults to active Entities. This requires reviewing shared readers, not merely hiding rows in Cardex.

Description projection needs no new column. New saves derive plain text atomically from rich content; clearing rich content clears the corresponding projection. Before historical reconciliation, audit rich/plain differences and prepare a narrow, recoverable reconciliation proposal rather than silently overwriting existing legacy descriptions during a schema migration.

No count-rollup tables, category tables, predicate schema, Dossier links or archive flags are proposed for automatic creation.

## Implementation sequence and focused qualification

1. Resolve migration approval and missing domain conventions. Keep the increment behind a default-on feature flag; do not change existing feature defaults.
2. **2A:** soft-delete/read compatibility, compact search table, cancellable thumbnails, batched metrics, whole-result sorts, keyset cursors, selection/bulk conflicts, preserved navigation state. Retain explicit search submission. Profile the proposed indexes before expanding scope.
3. **2B:** compact sticky identity header; lazy horizontal tabs with independent state; six-line expandable Description; contextual Name controls; immediate image preview. Documents/Mentions use indexed data and validated navigation. Claims creation/attachment explicitly prefill context GUID and role through the semantic API; Relationships use existing create/update APIs. Unsupported Dossier/predicate/literal/removal actions stay visibly unavailable.
4. **2C:** reusable advanced query service and bounded regex after safety qualification; implement hierarchy only against an approved canonical model. No textual DSL.
5. Focused SQL tests cover count units, source eligibility, global sort/cursors, parameterization, deletion/restore/revisions and retries. Browser checks cover search→View→Back, lazy tabs, independent Instruments, selected Name marks, rich Description save/reload, image failure/cancellation, source navigation and explicit context actions. Add bounded-work assertions: no workspace snapshots, unrelated projections, source loading, indexing or network requests on local typing.
6. Record SQL/HTTP timings separately from actual Chrome input-to-visible-result latency. Use a representative ≥10k-Entity fixture plus multiple Documents. Retain the established main regression scenarios rather than rerun every historical benchmark. Complete `CARDEX_INCREMENT_2_QUALIFICATION.md` only after implementation; investigate the earlier build-memory issue separately from accepting a larger heap as a diagnosis.

## Decisions requested

1. Approve the additive deletedUtc/index migration and shared soft-delete display semantics above, replacing Cardex's current protected physical delete.
2. Supply an existing category hierarchy / Dossier association convention if one exists. Otherwise, keep those actions unavailable in this increment, using only existing exact typename classification and verified graph APIs.
3. Confirm logical mentions versus individual stored ranges as the Mentions count unit. Recommendation: logical mentions, matching the existing annotation collector's grouping.
