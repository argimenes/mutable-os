# Symbolic Entity Attributes — Feature Roadmap

15 November 2026. Updated with the Symbolic Reference Authoring and Entity Nomination addendum. This document authorises no implementation. The rendering prototype remains scoped to the [qualification report](ARCHITECTURAL_QUALIFICATION.md#7-smallest-useful-prototype).

**Settled distinction:** `@` authors a symbolic reference, with canonical-name insertion on Enter; it is not an ordinary Entity mention command. Tab optionally opens attributes. `@:` continues with the explicitly referenced or nominated Entity. Existing mention annotations remain separate, can coexist with symbolic properties, and must not be migrated or automatically converted—including the Michelangelo Letters and other scholarly corpora.

## 1. Accepted direction: dedicated attribute storage

Use **`EntitySymbolicAttribute`** as the proposed canonical SQLite table name, replacing the earlier working name `EntityAttribute`. It follows the existing singular PascalCase convention (`Entity`, `EntityAlias`, `ClaimParticipant`) and distinguishes these addressable values from aggregate JSON `Entity.attributes`. The longer name accurately expresses its purpose; no naming conflict was found in the inspected schema.

The requested logical fields `Guid`, `EntityGuid`, `Key`, and `Value` map naturally to existing lower-camel-case SQL conventions. Proposed fields, not a migration:

| Column | Meaning and constraint |
|---|---|
| `id` | Internal integer primary key, consistent with canonical tables |
| `guid` | Immutable unique attribute UUID; sole attribute identity stored in references |
| `entityGuid` | Foreign key to `Entity(guid)`; ownership fixed initially |
| `key` | User-editable attribute name, not an identifier; quote the SQL identifier consistently |
| `value` | User-editable string initially |
| `valueType` | Initially `string`; later typed values require a versioned validation/formatting contract |
| `revision` | Nonnegative optimistic concurrency revision |
| `deletedUtc` | Nullable retirement/soft-deletion timestamp, following Cardex's lifecycle convention |
| `createdByActorGuid`, `createdUtc` | Creation attribution |
| `lastUpdatedByActorGuid`, `modifiedUtc` | Latest mutation attribution |

**Required:** enforce Key uniqueness within the owning Entity in SQLite; Values need not be unique. **Recommended normalization:** retain the user-facing `key`, derive `keyNormalized` using Unicode NFKC, then trim, then locale-independent lowercase, and enforce `UNIQUE(entityGuid, keyNormalized)` plus a nonempty check. Use one versioned server-side normalizer on create/rename/import and lookup; do not rely on SQLite's built-in ASCII-oriented case conversion or accept a caller-supplied normalized key unchecked. No predefined user Key vocabulary is required.

Recommend reserving Keys across retired as well as active rows initially, making restoration unambiguous; expose an existing retired record for explicit restoration rather than silently creating another identity. Reject normalized collisions on create, rename and import, preserving the user's draft; do not merge records, replace Values or add suffixes automatically. Concurrent creation must be decided by the database constraint, not a preceding availability query. Migration/import collisions require an explicit report and resolution. Reserve normalized `canonical-name` for the virtual attribute described below and reject that Key for user-defined records. These are schema requirements/recommendations for the later storage phase; no constraint or migration is implemented by this document.

Changing Key or Value preserves `guid` and all Document references. Value changes affect presentation only, never source text, standoff offsets, Document dirty state or history. Attribute retirement or Entity unavailability reveals source fallback without deleting annotations. Prefer preventing accidental hard deletion of an owning Entity over cascading away attribute identities; define hard-purge behaviour separately.

Integrate create/update/retire/restore with expected revisions, stable operation IDs, canonical before/after audit events and retry/outcome recovery. Extend the canonical ledger, package/restore allowlists and attribute-reference projection/index deliberately. Add bounded owner-scoped list/filter and bulk UUID-resolution capabilities; do not expose SQL rows directly to the editor.

Evidence: [Entity and alias schema](../../../src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L14), [Cardex soft deletion](../../../src/knowledge-sqlite/migrations/mutable/0010-cardex-soft-delete.sql#L1), [canonical mutation ledger](../../../src/knowledge-sqlite/canonical-ledger.mjs#L3).

### Virtual canonical-name attribute

**Requirement:** `Entity.name` remains the only authoritative canonical-name value. Do not create a separately editable `canonical-name` value in `EntitySymbolicAttribute`. This virtual attribute is required for the later `@` authoring phase, superseding the earlier suggestion to defer canonical-name binding indefinitely; it is not required to enlarge the rendering fixture.

**Recommended identity:** add an immutable unique UUID-v4 field such as `Entity.canonicalNameAttributeGuid`. It identifies the virtual attribute, not another stored name. Provision it once for existing Entities in an explicit auditable migration/backfill and for new Entities in their creation transaction. Preserve it through rename, retirement/restoration, backup, package export/import and retries. Ordinary rendering, selection and typing must not create identities as a side effect of a read.

The symbolic resolver accepts an attribute UUID and performs bounded indexed lookups against `EntitySymbolicAttribute.guid` and `Entity.canonicalNameAttributeGuid`. For the virtual target, return a normal attribute descriptor with owner UUID, fixed Key `canonical-name`, Value from `Entity.name`, `valueType: string`, Entity revision and Entity lifecycle status. Treat display labels such as `[deleted]` as UI status, not part of the canonical value. Cardex rename invalidates that virtual attribute's cached value; references and source offsets remain unchanged. Generic user-attribute rename/value/delete commands must not accept a virtual target; canonical-name editing routes to the existing Entity rename service with expected Entity revision.

Keep the two attribute identity sets disjoint, including explicit/imported GUIDs: add cross-table collision guards on allocation/import (with SQLite triggers if these tables are independently writable), and reject ambiguous results rather than preferring one table. Each lookup column must have a unique index. A partially migrated/missing identity is unavailable until provisioning succeeds; never generate a different UUID on each read or rebind by name. Native package dependency discovery must resolve virtual target UUIDs to their owning Entities and retain the identity field; bare Document export still permits source fallback when semantic records are absent.

Why this approach: a single identity field uses existing Entity persistence/lifecycle without a second value or a new identity-registry table. An identity-only binding row in the attribute table is an alternative, but requires discriminating virtual versus editable records and changes its Key/Value invariants. A deterministic UUID-v5 avoids storing the identity but needs a reverse lookup scheme and changes to the current UUID-v4 validators; do not fabricate v4-shaped hashes. Using `Entity.guid` plus a field selector avoids an extra UUID but changes the agreed attribute-UUID-only reference contract. None is simpler for the current requirements than one persisted virtual-attribute identity.

## 2. Retained keyboard-first workflow

Reuse Scry Entity discovery, ranking, aliases and keyboard navigation, with an explicit **authoring intent** distinguishing ordinary mention annotation from symbolic insertion. Do not create a second Entity search service or change the default commit behaviour for every Scry caller.

| Syntax | Intended authoring behaviour | Inspected current behaviour |
|---|---|---|
| `[[...]]` | Entity lookup and textual mention annotation | Opens `autocomplete` bracket mode; confirmed selection uses `Entity.name` as the phrase and writes an ordinary `codex/entity-reference` |
| `((...))` | Entity mention recognition/annotation | Opens `mention` bracket mode and preserves source wording when an Entity is confirmed. Automatic candidate discovery/review is available, but the inspected path does not automatically commit annotation solely on recognition |
| `@...` | Symbolic insertion; Enter defaults to canonical name | Currently Entity lookup with an ordinary annotation; it may preserve the typed mention/query text rather than force canonical name |
| `@:` | Attributes of the explicitly referenced/nominated Entity | Currently parsed as an `@` Entity query with a leading colon; no dedicated attribute intent |

The bracket findings come from [mode selection](../../../src/features/autocomplete/index.tsx#L215), [completion](../../../src/features/autocomplete/session.ts#L86), [draft completion](../../../src/features/autocomplete/index.tsx#L45), and [LER binding](../../../src/features/entity-references/ler-view.tsx#L74). The intended syntax table is not evidence of existing automatic annotation, nor authorization to redesign bracket behaviour during this work. Preserve those mention paths and all persisted Entity annotations.

**Default `@`:** typing `@Mich` opens the existing Entity results. Enter on Michelangelo Buonarroti resolves `Entity.name` and its virtual attribute UUID, inserts the full canonical name as ordinary source text, and adds a symbolic-reference property targeting that UUID. It materialises the current name and establishes the explicit Entity context. There is **no mandatory attribute-selection stage**. Alias or partial-query matches affect discovery, not the canonical name inserted by this default action.

**Alternative through `@`:** Tab on a selected Entity opens that Entity's attribute picker instead of inserting text. Include the virtual `canonical-name` row alongside user-defined attributes, labelled `Key: Value`. Enter in that picker inserts the chosen attribute's value and UUID reference. A mere highlighted search result is not an implicit context nomination. Opening the picker through Tab is an explicit nomination within the authoring session; recommend promoting it to the continuing context on successful insertion or a distinct explicit nomination action, restoring prior context on cancellation.

**Continuation through `@:`:** select the most recently explicitly referenced or nominated Entity in the current authoring context. Display that Entity prominently beneath the caret and filter its attributes by both Key and Value. Repeated successful insertions retain the nominated owner. If none is available, offer Entity selection; in this continuation flow, selecting an Entity opens its attributes rather than silently taking the default `@` canonical-name insertion path.

Required interactions:

- Typing filters by Key or Value.
- Up/Down navigates matches; Enter inserts the selected attribute's current Value and a symbolic-reference property targeting its UUID.
- A missing value can be created through an explicit keyboard action without leaving the editor.
- In the proposed creation flow, `@:Maestro`, followed by Tab, opens Key entry with Value `Maestro` preserved. Typing `title` and pressing Enter creates `title: Maestro` and inserts the value plus its reference.
- Escape cancels without modifying the Document: discard the symbolic authoring draft and restore the pre-invocation source and selection, without creating a history entry or changing dirty state. Keep invocation/query/Key entry provisional so cancellation does not require a compensating authored edit. Cancellation after SQLite dispatch still requires the outcome handling in section 4; it cannot promise that the database rolled back.

Tab has two proposed state-specific meanings: Entity results → attributes, and attributes with an explicit missing-value action → Key-entry creation. It is not a global shortcut change. Within Key/Value form fields, preserve ordinary keyboard focus navigation. Do not infer “missing” from a failed, incomplete or still-loading result set; creation requires an explicit action and successful server validation. A matching Value under another Key may still warrant a different attribute, but the shortcut's precise eligibility for that case remains a UX decision. Up/Down merely navigates; Enter commits only the selected stage's action.

On acceptance, remove the invocation/query syntax and insert ordinary source text plus the annotation in one Document history entry. The displayed/current value used at acceptance becomes that occurrence's fallback text. Later attribute edits must not refresh it silently. An existing attribute selected by UUID must be revalidated against the current Cavern, owner and lifecycle; pin the accepted value/revision for the operation. If a concurrent update arrives afterward, presentation may change while that fallback remains intact.

### Explicit Entity context

Recommend a transient context keyed by Cavern and Document editing session, shared only by presentations of that session. It should survive movement between TextBlocks within that context but not borrow a different Document tab's last Entity. Track successful explicit reference commits and explicit nominations, including the existing Entity picker and symbolic `@` authoring route. Search highlighting, hovering, inspections, automatically detected mentions, pronouns/natural-language context and loading existing annotations do not nominate the Entity. Record the Entity UUID, not its name or nearest textual occurrence.

The context needs a small history-aware record so Undo of the nominating operation can restore the previous nomination, and Redo can restore it, without scanning the Document. Define how detached/embedded editors and ambiguous shared occurrences select a context. If no valid Entity has been nominated, offer an explicit Entity choice; never guess from global recents. Retired/deleted Entities require resolution before opening or committing attributes. Repeated `@:` accepts can retain the same nominated owner.

These context boundaries and nomination-history behaviour are architectural recommendations to settle before authoring implementation; the requirement is an explicit, local nomination, not a global “last used” preference. The separate Document-versus-attribute Undo policy is settled in section 4.

## 3. Existing integration points and specific gaps

| Existing mechanism | Finding and required adaptation |
|---|---|
| [Bounded invocation parser](../../../src/features/autocomplete/model.ts#L6) | Recognises `@`; currently `@:Maestro` is an Entity query whose input begins with `:`. Add symbolic-name/attribute intents and `@:` prefix precedence while preserving literal colon/spaced-query syntax, escapes, and code/literal exclusions. |
| [Autocomplete input routing](../../../src/features/autocomplete/index.tsx#L295) | Ordinary unrelated typing checks the new cell before scanning a bounded suffix. Preserve this bypass. Tab currently cancels/passes through outside the workstation; its new meaning must be confined to attribute discovery. |
| [Completion selection](../../../src/features/autocomplete/session.ts#L96) | Resolves an Entity and validates the source before committing. Attribute selection needs corresponding UUID/owner/revision checks and cancellation generations. |
| [Usage history](../../../src/features/autocomplete/history.ts#L1) | Existing session/localStorage recents support suggestions, not the required per-editing-context nomination. Do not simply choose the first recent row. |
| [Provisional cells](../../../src/features/autocomplete/provisional-cells.ts#L4) | Useful precedent for query/markers remaining local until commit. Reuse the session/input infrastructure; do not add per-keystroke canonical annotations or DB mutations. Current `@` routing observes committed typing, so making this flow provisional is an explicit integration task, not an existing guarantee. |
| [Entity creation UI](../../../src/features/entity-references/ler-view.tsx#L100) | Retains stable IDs for retry and distinguishes unknown creation outcomes. Reuse that discipline for attribute creation, not only a generic error toast. |
| [Replace and annotate](../../../src/block-tree/commands.ts#L157) | Provides an existing single-Document-edit precedent, but currently wraps a generic transaction. Qualify bounded assembly before reusing it; do not assume it avoids snapshots. |

**Keyboard/cancellation conflicts verified:** Scry registers Up/Down, Enter and Escape through its binding registry. Its Tab branch currently cancels outside the workstation and passes through; native fields and LER have their own routing. LER Enter links an Entity, Shift+Enter prepares, and Ctrl/Command+Enter creates an Entity from the query—none should accidentally become “create attribute.” Route symbolic intent through the Entity results' actual commit/control callbacks as well as the outer popup handler. Query-field text editing, Tab focus traversal, IME and modifier shortcuts retain their scope. Check registered/customized shortcut conflicts instead of adding an unconditional document-level key listener.

Current bracket cancellation calls `finishDraft()` and can publish the typed phrase literally: [cancel](../../../src/features/autocomplete/index.tsx#L62). The existing integration test explicitly verifies “Escape publishes once.” Symbolic Escape's no-Document-change requirement therefore needs a separate discard policy in the reused provisional-input infrastructure. Do not alter bracket cancellation globally to achieve it. The current `@` route also observes already-committed typing; new symbolic invocation must be intercepted provisionally from its start, preserving a cheap ordinary-typing bypass. Resolving this ownership transition is part of the subsequent UX phase.

**Minimum integration work:** add an invocation/commit intent and a small state machine (`Entity results → attributes → create`, with direct Enter from Entity results), reuse the existing search/ranking service and cancellable source bookmark, supply the virtual/user attribute resolver, and bind one symbolic source-plus-property command. Add a context nomination service and explicit discard/recovery handling. Keep ordinary `codex/entity-reference` commits intact; do not automatically add one to every symbolic occurrence or count attribute UUIDs as Entity UUIDs. Aggregate owner-Entity reference discovery can resolve the owner explicitly while preserving the two semantics.

Place the popup using the existing caret/range geometry and mounted-occurrence lifecycle, preferring beneath the caret and fitting above when viewport space requires it. The current autocomplete workstation has larger layout constraints; the attribute list needs a compact presentation, not another geometry-measurement system. Reuse existing SVG decorations for source highlighting. Preserve native fields, IME, selection and screen-reader/combobox navigation semantics.

Filtering should use a bounded cached owner-specific list where practical. Larger lists need bounded server paging/filtering, cancellation and stale-result checks. Neither case justifies Document/Cavern scans on each typed character. Value changes invalidate the relevant attribute consumers, not aggregate Document revisions or Explorer rows.

## 4. Coherent authoring, SQLite persistence and Undo

**Requirement:** creation followed by insertion must feel like one coherent, undoable authoring operation. **Finding:** SQLite and the in-memory Document repository do not share an atomic transaction. Manual Document Save is a third lifecycle event. The canonical SQLite audit outbox does not turn these into one distributed Undo transaction.

Proposed operation sequence:

1. Capture the source occurrence/version and nominated Cavern/Entity; validate permissions, Key/Value and source range. Keep unfinished input in the authoring session.
2. Allocate one attribute UUID and one creation operation ID. Create through the canonical service; retry uncertain results with the same exact request, never a new UUID.
3. After confirmed creation, validate that the source/session and intended insertion are still current. Commit source text and symbolic annotation together through a bounded canonical operation. Mark only that Document dirty; do not save it automatically.
4. Retain an authoring receipt correlating the database operation with the Document commit/outcome. It must distinguish “attribute created, insertion pending/failed” from completion and prevent duplicate insertion on retry. Specify recovery across popup closure and application restart; do not confuse an unsaved in-memory insertion with durable Document persistence.

If creation is rejected, leave the Document untouched. If the database commits but the response is lost, keep the outcome unresolved until the existing receipt can be checked. If the source changes or insertion fails after creation, retain the created attribute and offer deliberate recovery/reinsertion; do not insert at a newly focused caret or delete the attribute automatically. Closing or cancelling after dispatch cannot promise database rollback.

### Settled — Undo Option A accepted

**Accepted product decision:** Document Undo reverses Document authorship. It does not reverse independent changes to the Cavern's Entity records.

1. Inserting the fallback text and its symbolic-reference standoff property constitutes **one Document Undo/Redo history entry**. Undo removes both and restores the Document's previous authored state.
2. The created `EntitySymbolicAttribute` remains in SQLite. Document Undo leaves its UUID, Key, Value and Entity ownership untouched; it remains available in Cardex and subsequent autocomplete searches.
3. Redo restores the original Document insertion, including its captured fallback text and reference to the **same attribute UUID**. It must not create another attribute record or replay the database creation request.
4. Undo of an insertion referencing an existing attribute likewise affects only the Document, never the attribute itself.
5. Attribute creation and Document insertion remain separate persistence operations, coordinated through the operation receipts and recovery mechanisms above. If creation succeeds but insertion fails, retain the attribute and provide recovery/reinsertion. Creating an attribute must not automatically save the Document.
6. If the attribute is subsequently retired or unavailable, retain the symbolic reference and display its readable source fallback. Redo must not require successful live attribute resolution or replace the captured fallback with a newly fetched value.

Redo follows the existing history rules after subsequent Document edits: replay the retained Document history operation when eligible, rather than revalidate the original autocomplete source bookmark or rerun authoring. Normal history ordering and redo-branch invalidation still apply; this policy does not preserve a redo entry that existing history rules discard. Independent attribute edits are not reversed by Document history.

Do not introduce cross-store compensating transactions, automatic attribute retirement or deletion as part of ordinary Document Undo. Receipts must distinguish a failed/pending insertion from a completed insertion later deliberately undone, so recovery does not silently reinsert an undone reference. Manual Document saving and the existing source-offset invariants remain unchanged.

This decision applies to the subsequent inline attribute-creation phase and does **not** expand the rendering prototype.

## 5. Roadmap and implementation gates

| Stage | Scope |
|---|---|
| Rendering proof of concept — unchanged | One fixture attribute, selective rendering, optional contracts, atomic source boundaries, fallback, offset stability, geometry and representative bounded-work checks. No new authoring UX or production table migration. |
| Canonical storage and Cardex | `EntitySymbolicAttribute`, normalized database Key uniqueness, revisions/lifecycle/audit, virtual canonical-name identity on Entity, CRUD, resolver, indexed references and package/restore support. |
| Keyboard selection | Reuse Scry discovery; `@` Enter inserts virtual canonical name, Tab optionally opens attributes, `@:` reuses context or offers nomination; provisional cancellation and one-step Document insertion/Undo. |
| Inline creation | Key-entry workflow, stable request receipts, separate database/document persistence, settled Option A Document-only Undo/Redo and recovery/reinsertion. |
| Later enhancements | Live broadcasts, richer types/formatting and broader reusable contracts only after the core is qualified. |

Before authoring implementation, confirm the proposed normalizer/retired-Key reservation and virtual-UUID provisioning; editing-context boundaries and nomination promotion/cancellation history; scoped/customizable Tab bindings and literal-input fallback; and concurrent Value handling. `@` Enter's symbolic canonical-name default, per-Entity Key uniqueness, absence of automatic annotation migration, symbolic Escape's no-Document-change behaviour, and Option A's Document-only Undo are settled requirements, not open alternatives. The remaining decisions do not block the existing rendering experiment.

When implementation is authorised, retain the separate feature flag convention, legacy behaviour for non-opted-in definitions, and representative rather than exhaustive compatibility tests. Test default canonical-name insertion, optional attributes, no-context nomination, Escape discard, one normalized-Key race, one uncertain-create retry, one stale-source failure and bounded typing work. Verify Option A with one Document history entry, an unchanged attribute row on Undo, the same UUID and no database creation on Redo, ordinary history behaviour after later edits, and readable fallback when the target is retired/unavailable. Include canonical-name rename preserving UUID/source/offsets and one ordinary bracket mention compatibility case. Feature-off retains existing behaviour and persisted data. No feature code, database migrations or new tests were added for this roadmap update.

**Prior authoring-investigation verification:** `npx vitest run src/features/autocomplete/autocomplete.test.ts src/features/autocomplete/provisional-integration.test.ts` passed **47 tests in 2 files**. These are existing tests validating current Scry behaviour, including word-preserving mention mode, canonical-name completion mode, cancellation and bounded work. They do not test the proposed symbolic authoring behaviour or the proposed SQL constraints. The subsequent Undo Option A decision is a documentation-only update; these tests were not rerun for that update.
