# Cardex Increment 1 — repository investigation and implementation plan

The supplied brief authorizes investigation followed by bounded implementation. Only Entities will be functional; Claims, Relationships and Facts remain blank panels.

| Subsystem | Verified repository seam | Decision |
|---|---|---|
| Desktop/eikon | `application/desktop-applications.tsx` maps desktop applications to PNG assets and launch commands | Adapt: Cardex launch/icon; keep approved sources and a derived transparent master |
| Window/Instrument | `application/thesis.tsx` registers an opaque-widget Block inside the normal Window manager; no separate Instrument base class | Reuse: independently mountable EntityCard component; separate `cardex.entity.open` window, instance-owned state |
| Tabs | Canonical TabRows describe document content; application shells also use local navigation | New narrow application tablist with vertical ARIA tabs; no document structure or persistence changes |
| SQL | `Entity(name,nameKey,description,attributes,revision)`; `EntityAlias` with curated/imported/derived origins; v8 migrations | Add v9 nullable `nameStrata`, `descriptionDocument`, `imageRef` columns; retain existing names/aliases/legacy description |
| Search/Scry | `entity-lookup.mjs` searches normalized canonical names and authored aliases, bounded to 100 but without a continuation cursor | Adapt SQL predicates for a lean keyset-paginated card search, 30 rows; no Description/Strata decoding in lists |
| Transactions | `canonical-ledger.mjs` wraps bounded per-record changes and durable operation receipts in one SQLite transaction | Reuse for card fields plus alias changes, expected Entity and alias revisions, retryable operation IDs; no graph snapshots |
| Description | `ReactiveEditor`, `ReactiveTreeView`, `block-tree/codecs.encodeDocument`; Thesis demonstrates local draft editors and input routing | Reuse separate local editor repository and serializer; multiline text Blocks/local formatting only, no entity services, global persistence or indexing |
| Name Strata | Cell offsets and inline replacement already rebase local standoff ranges | Reuse one single-line local TextBlock; versioned JSON containing inclusive Unicode-scalar ranges, no duplicate Name matrix; restricted semantic types |
| Images | `runtime/managed-assets.ts` stages PNG/JPEG through Cavern leases; server validates, content-addresses and serves managed originals | Reuse upload/stage/seal/commit and leased preview URLs; validate references server-side; never delete shared asset bytes on reference removal |
| Close/dirty | `viewCloseGuards`, window lifecycle, `beforeunload`, constant-work repository subscribers | Reuse; guard record/tab/window transitions, preserve drafts on failures; serialize only on explicit Save |
| Tests | Node SQLite tests, Vitest local editors, Vite/browser fixtures | Focused backend transactions/dependencies, Unicode and draft isolation, browser form/image/navigation smoke and bounded timings |

## Proposed contract and flow

A vault-scoped `/api/sqlite/knowledge/cardex` service exposes context, search(query, after), get(id), impact(id), save(id, expected, aliasBaseline, fields, operationId), delete(id, expected, confirmation, operationId). It uses the existing foreground worker and audit ledger. Image admission additionally checks the current Cavern's managed store. Detail DTOs carry full fields and authored alias IDs/revisions; search DTOs carry only ID/name/image reference. SQL remains parameterized.

Name Strata JSON: `{version:1, coordinates:"unicode-scalar-inclusive-v1", properties:[{id,type,start,end}]}`. Allowed types: given-name, family-name, patronymic, toponym, art-name, particle, honorific. No assumptions about name order or mandatory components. Invalid ranges are rejected; normal editor replacements perform the established range rebasing. Description uses the existing serialized Document Block DTO, constrained to local TextBlocks and formatting; imports containing graph references/structural objects are rejected on save, never indexed. Existing plain descriptions are loaded as local text without rewriting the legacy column.

Search → detail/new draft → Save or Cancel. Query survives return to search. Each instance owns its selected entity, local editors and async cancellation. An unresolved write retains its exact operation ID for retry; editing/reloading requires an explicit discard. Delete previews dependencies and blocks referenced Entities; it rechecks inside the transaction. Authored and derived aliases are explicitly removed and audited only when deleting an otherwise unreferenced Entity. Assets remain shared and retained.

Migration is additive and transactional; old rows read as null, empty fields remain valid, and existing indexes/FTS triggers continue to index `name`/aliases. Generic archival extraction includes additive Entity columns; existing publication projections remain unchanged. Downgrade requires a pre-migration backup or an explicit data-preserving migration, not dropping rich fields. No automatic schema rollback or existing-vault mutation is performed by development tests.

## File-change map

New: `features/cardex/{view,local-editor,service,validation}`, `application/cardex.tsx`, `knowledge-sqlite/cardex.mjs`, migration 0009, tests/fixture and icon assets. Adapt: schema migration list, SQLite foundation/worker/client/host routing, Cavern image verification callback, feature flags/application registration/desktop catalogue, SQLite build asset list. No changes to ordinary workspace typing or existing Scry search semantics.

## Risks and acceptance gates

Conflicts include independent alias edits, not just Entity revision. Deletion considers both SQL foreign keys and saved annotation references; unsaved references outside SQL cannot be authoritatively discovered without a workspace scan and will be disclosed in the confirmation. Local editor focus must respect managed-window ownership. Image upload cancellation must release staging leases and stale completions must not change another draft. Browser tests use temporary Vaults and actual SQLite; no user's records will be created or deleted during qualification.

## Implemented compatibility refinements

The final increment retains mounted field editors on Save, uses a shared CSS range renderer for Name marks, and keeps Save actions visible in a sticky footer. Plain Entity/Thesis writers invalidate Name Strata when replacing the name; a changed legacy Description invalidates the corresponding rich fragment. These are narrow updates to existing SQL statements within their existing canonical transactions. The Desktop browser harness now derives icon count from the application catalogue, including Cardex. Qualification and explicit bounds are recorded in `CARDEX_INCREMENT_1_QUALIFICATION.md`.
