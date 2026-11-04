# Gloss Mode Stage C — investigation and implementation plan

**3 November 2026 · Proposed relational architecture; implementation awaits review.**

Recommendation: store directed, typed, independently identified relationships in the existing **source Gloss's `metadata.gloss.links` map**. Derive incoming/outgoing adjacency and argument exploration from that data. Keep the native Document authoritative; introduce no Block type, SQL table, global Entity or second Gloss store.

Only the separately authorized keyboard increment has been implemented. Following the product clarification, **Cmd-G on macOS / Ctrl-G on Windows and other non-Apple platforms** invokes the existing Gloss authoring operation inside the standoff editing surface. **Ctrl+; then G** remains an alternative. Relational production code, schemas and data have not been changed.

## 1. Established implementation facts

| Area | Actual implementation and implications |
| --- | --- |
| Definition and type | [`model.ts`](src/features/gloss/model.ts), `GLOSS`, `parseGloss`, `glossDefinition`: a `mutable/gloss` linked definition contains raw `value` and `metadata.gloss = {version:1, localId, links, alias?}`. Only the first colon separates the type; later colons remain body text. `links` already exists, but only its object-shaped envelope is checked. |
| Identities | The Document's `payload.linkedAnnotations[definitionId]` owns the definition. `metadata.gloss.localId` is a separate logical Gloss identity. Native standoff segments have their own IDs and reference `annotationId = definitionId`; offsets are not Gloss identities. Runtime NodeKeys and ContentKeys are not portable endpoints. |
| Authoring and ownership | [`GlossController`](src/features/gloss/controller.ts), `target`, `open`, `openDefinition`, `commit`, `deleteDefinition`: selection/word acquisition and the compact editor feed one canonical authoring path. `glossOwner` uses indexed ownership; a viewing occurrence cannot author a foreign Document's borrowed Gloss. Raw text edits preserve other definition metadata. |
| Admission/history | [`glossChangeFor`](src/block-tree/gloss-plan.ts) proves a Document linked-definition edit plus optional affected text-segment records. [`CanonicalRepository.commit`](src/block-tree/repository.ts) recognizes this before broad planners and uses `commitInline`. Inverse history operations use the same proof. The current proof does **not** validate relationship values, endpoint existence, edge-ID uniqueness or Gloss-local-ID uniqueness. |
| Projection | [`BlockTreeProjection`](src/block-tree/projection.ts), the `change.structural?.gloss` branch, reconciles the owning Document payload and affected text payloads without rebuilding child trees. An unrelated projection does not receive a revision-only typing update. |
| Derived inventory | [`GlossSessionIndex`](src/features/gloss/session-index.ts), `definitions`, `readSegments`, `changed`, `publish`, `range`: Document-local membership and native anchor identities; offsets resolved on demand. Its definition signature currently includes raw text, local ID and alias, **not links**. Simply adding links will not produce a working relationship view. |
| Presentation | [`GlossPresentation`, `GlossViews`, `GlossMargin`, `GlossBelow`](src/features/gloss/presentation.tsx) retain the editor and add separate furniture. `GlossViews.navigate` uses `revealMatch`, current ranges and the Stage A editor. The Register owns its filtering/selection signals. Detachment moves this retained session. Mode-off disposes the derived furniture/index; the editor remains mounted. |
| Geometry | [`MeasurementService`](src/runtime/measurements.ts), `retainedRangeRects`/`invalidateRanges`, and the margin observers already supply the needed source geometry. Relationship exploration needs no new range measurements or document-spanning lines. |
| Native persistence | [`captureNative`, `nativeText`, `decodeNative`](src/persistence/native-resource.ts) carry definition metadata. The existing native/manual Save path and Stage B physical roundtrip remain applicable. |
| Copy/package | [`materializeFragment`](src/interchange/materialize.ts) already remaps Gloss local IDs, relationship-map keys and `toGlossId` when copying. It currently **drops links whose target is outside the copied set**. [`packageFragment`/`materializePackage`](src/interchange/package/native.ts) cover full Document packages, including retained definitions; full-package materialization requests preservation of Gloss IDs. Annotation-definition IDs and logical Gloss IDs must not be conflated. |
| Deletion | `GlossController.commit(remove=true)` tombstones the definition but currently **removes its outgoing links and other Glosses' links to it**. Deleting an anchor through text editing instead leaves the Gloss definition intact. These are different lifecycle events. |

The last two behaviours are important compatibility work for C1, not minor UI details. They were tolerable for empty relationship maps; they must be reconsidered before meaningful links are authored.

## 2. Existing primitives evaluated

| Candidate | Finding | Recommendation |
| --- | --- | --- |
| Existing Gloss metadata | Already native-authored, saved, history-backed and copied with a relationship-shaped placeholder. | **Use it.** |
| New relationship Blocks | `ContentRecord`, `PlacementRecord`, `ownedRelations` and `opaqueRelations` in [`block-tree/types.ts`](src/block-tree/types.ts) describe Block content, occurrences, ownership and retained authored relations. Glosses are linked definitions, not independently mounted Blocks. | Do not manufacture Blocks or placements just to connect definitions. |
| Block anchor relationships | [`anchorRecord`, `allowedTarget`, `resolveAnchor`](src/features/anchor-relationships/model.ts) address Block IDs and layout offsets; they reject chains and ancestor-related targets. | Reuse interaction principles, not this geometry/ownership model. It cannot represent a general Gloss graph. |
| SQLite `Relationship` | [`0001-foundation.sql`](src/knowledge-sqlite/migrations/mutable/0001-foundation.sql): stable GUID, directed `sourceEntityGuid`, `typename`, `targetEntityGuid`, JSON attributes, revision/provenance. Both endpoints are Entity foreign keys. [`canonicalEntities`](src/knowledge-sqlite/entities.mjs) validates Entity endpoints and uses canonical SQL/audit writes. | Borrow the conceptual directed-edge model; do not use these records for local Glosses. |
| SQLite Claims nexus | [`0002-semantic-knowledge.sql`](src/knowledge-sqlite/migrations/mutable/0002-semantic-knowledge.sql): Claim expression/type, independently identified participants/qualifiers referencing Entities, and evidence referencing resource/Block/range/generation. [`semantics.mjs`](src/knowledge-sqlite/semantics.mjs) validates writes, including Concept requirements for `type-of` and Time requirements for temporal qualification. | A distinct semantic layer and lifecycle. Do not create Claims, participants or evidence merely to connect Glosses. |
| SQLite `BlockRelation` | A saved-file **derived** projection, with Block endpoints, scope/kind/slot/topology and target descriptors. A missing target does not erase the authored edge. | Reuse the retention principle; it is neither the authoring store nor a ready-made Gloss relation table. |

Existing command registration, binding preferences, native history, retained host context, local selection preservation and native form controls are sufficient. No new UI or keyboard framework is needed.

## 3. Recommended canonical model — proposal

```ts
type GlossId = string;         // metadata.gloss.localId, scoped to its Document
type RelationshipId = string; // map key; newly authored IDs use crypto.randomUUID()

interface GlossRelationshipV1 {
  version: 1;
  type: string;
  toGlossId: GlossId;
  metadata?: Record<string, unknown>; // inert, bounded JSON; future note/qualifiers
  unresolvedTarget?: {
    reason: 'outside-copy';
    originResourceId?: string;
    // toGlossId retains the original ID. This marker prevents accidental
    // resolution against a same-named ID in the destination Document.
  };
}
// Source identity is implicit in the owning definition; do not duplicate it.
type GlossLinks = Record<RelationshipId, GlossRelationshipV1>;
```

Keep the existing Gloss envelope at version 1. New links have their own version; recognize compatible unversioned `{type,toGlossId}` placeholders as legacy input. Unknown versions/fields should survive native roundtrip but remain read-only/diagnosed where their meaning is unsupported. Do not silently reinterpret or discard them.

Recommended rules:

- Directed edges, stable identities and multiple **different typed links** between a pair are supported. Reverse-direction editing moves the same edge ID between source definitions atomically; its type stays unchanged, with a preview of the resulting sentence.
- Avoid accidental duplicate `(source, type, target)` creation in the UI; select the existing edge instead. Preserve imported duplicates with distinct IDs rather than silently merging them. Future independently qualified parallel edges remain possible.
- Permit cycles in stored data. Reject new self-links in the initial UI as unhelpful, but preserve/diagnose imported self-links and traverse them safely.
- Endpoint identity is `(owning Document identity, Gloss local ID)`, never an Entity GUID, a label, an alias, a segment ID or an offset. Inside the local map the Document component is implicit.
- New creation/retargeting requires live, uniquely resolved local definitions. An unanchored but non-deleted Gloss is eligible. Foreign borrowed definitions are not target candidates.
- Validate bounded, nonempty IDs and type strings, safe object keys and unique relationship IDs within a Document. Do not require legacy IDs to be UUIDs. Current Gloss-local-ID ambiguity must be diagnosed, never resolved by “first match.”
- Canonical data may contain well-formed unresolved links. This is necessary for import, repair and history replay. The stricter fresh-authoring rule belongs in the command path; validation must not make Undo unable to restore an already-unresolved link.

Future annotations/qualifiers can use the stable relationship ID and versioned metadata without inventing a Block now. This reserves identity and extension space; it does not implement an edge-annotation engine.

### Illustrative persisted data, not imported historical records

The existing native codec encloses this payload in the Document's normal record:

```json
{
  "linkedAnnotations": {
    "definition-evidence": {
      "id": "definition-evidence",
      "type": "mutable/gloss",
      "value": "evidence: He described money already provided.",
      "metadata": {
        "gloss": {
          "version": 1,
          "localId": "gloss-evidence",
          "links": {
            "relationship-support": {
              "version": 1,
              "type": "supports",
              "toGlossId": "gloss-thesis"
            },
            "relationship-reference": {
              "version": 1,
              "type": "references",
              "toGlossId": "gloss-thesis"
            }
          }
        }
      }
    },
    "definition-thesis": {
      "id": "definition-thesis",
      "type": "mutable/gloss",
      "value": "thesis: He expected greater financial independence.",
      "metadata": {"gloss": {"version": 1, "localId": "gloss-thesis", "links": {}}}
    }
  }
}
```

No edge is duplicated in the target definition. Incoming links are derived.

## 4. Types and autocomplete

Retain free-form Gloss types and first-colon parsing. The current starter list includes `counter-argument`, while this brief uses `counterargument`; `qualification`, `observation` and `reference` are not current starters. Add useful suggestions without rewriting stored text or treating spelling variants as an ontology migration.

Use a **separate relationship-type suggestion list**, initially `supports`, `opposes`, `qualifies`, `elaborates`, `references`, `depends-on`, `answers`, plus types already authored in this Document. Share the small suggestion/filter interaction where useful, not the Gloss raw-text parser: a relationship type has its own field and no colon/body grammar.

Recommend trimmed nonempty type strings, a bounded length (for example 128 Unicode characters) and no line breaks. Preserve custom spelling/case; match suggestions case-insensitively, store the chosen suggestion exactly, and do not silently collapse distinct imported strings. Types do not restrict which Gloss types can be endpoints.

## 5. Canonical commands and incremental indexing

Proposed commands: `gloss.relationship.create`, `.update`, `.delete`, `.reverse`, `.retarget`. They prepare one owning-Document record update and use the existing Gloss admission/history path. They must validate current endpoints and the expected edge value at confirmation, retain unrelated metadata and fail visibly on stale edits. Provisional picker input remains local session state.

Extend `GlossChange` with **proof-derived changed definition IDs and relationship deltas**, including inverse/replay changes. The admission code already compares old/new definitions: collect trustworthy evidence there instead of trusting a UI-supplied “changed IDs” hint. Normal Gloss body edits can preserve the existing conservative draft conflict check initially.

Extend `GlossSessionIndex` with:

```ts
definitionByLocalId: Map<GlossId, DefinitionState>; // includes tombstones/ambiguity
edgeById: Map<RelationshipId, EdgeState>;
outgoing: Map<GlossId, Set<RelationshipId>>;
incoming: Map<GlossId, Set<RelationshipId>>;
// Per-Gloss reactive summaries / adjacency revisions, separate from body signals.
```

Initial construction is Document-local O(G + E), in addition to Stage B's Block/anchor inventory. On a proven link delta, remove its old adjacency, insert its new adjacency, and publish only the source, old/new targets, affected type buckets and open dependent branches. Changing an endpoint's deleted/missing state touches incident edges via adjacency. A body/alias edit updates labels without rebuilding adjacency. Offset rebasing does **no relationship parsing, graph traversal or graph-row publication**.

Foreign/unrelated Document changes remain irrelevant. Preserve the existing live row identities. Do not route a links-only update through Stage B's generic root-layout invalidation: relationship badges can resize a visible card through its existing ResizeObserver, without invalidating source range geometry.

### Important cost boundary

The current authoring/projection path clones, compares and reconciles the owning Document's linked-annotation registry. Therefore a one-edge commit is **not presently O(1) in registry size**, even if derived UI publication is limited to its endpoints. Canonical payload copying, validation, projection reconciliation and history storage may scale with that Document's registry, including its links.

C1 should expose this honestly in measurements. Reuse that bounded Document-record path first, emit incremental evidence for consumers, and measure registry/history costs at representative sizes. Do not introduce a new repository, generic patch engine or broad transaction refactor speculatively. If this specific cost becomes material, bring back a narrowly scoped proposal before enlarging C1.

## 6. Register authoring and presentation

```text
GlossPresentation (existing retained host; editor always mounted)
└─ LocalReferencesRegister
   ├─ Existing text/type filters + optional relationship filter
   ├─ GlossRow
   │  ├─ Existing body, source navigation, edit/delete
   │  ├─ Incoming groups: supports / opposes / …
   │  ├─ Outgoing groups: supports / references / …
   │  └─ Add Relationship
   ├─ RelationshipEditor (one compact form)
   │  ├─ Source preview → type → target preview
   │  ├─ Search current Document Glosses (type, text, alias; orphan badge)
   │  └─ Confirm / Cancel; edit, reverse and delete existing edge
   └─ Optional ArgumentExplorer (C3)
```

A selected Register Gloss supplies the source. Picking a target changes only the draft; it does not move the text selection. Enter confirms when not composing; Escape and a visible Cancel close the form. Use existing selection-preserving button patterns and return focus to the invoking row. Prevent stale targets, double submission and silent replacement of another draft.

Use explicit incoming/outgoing arrows and readable sentences: “Evidence A **supports →** Thesis” versus “**← supported by** Evidence A.” For custom types show the actual directed sentence, not an invented grammatical inverse. Clicking a connected Gloss selects its Register row; its existing Navigate action reveals the source. An orphan opens its definition rather than attempting to navigate to nonexistent text.

Margin cards may add small relationship-count buttons which open the appropriate Register group. Count distinct connected Glosses for “3 supporting”; expose separate edge counts where parallel links would otherwise be ambiguous. No permanent connector lines or new geometry consumers.

Defer drag-to-link, multi-selection/bulk links, relationship-specific shortcuts, permanent canvas graphs and a separate Instrument. A browser search input, native select/suggestion list and existing command dispatch suffice for C2.

## 7. Lifecycle and referential integrity

| Event | Recommended behaviour |
| --- | --- |
| Create/edit/delete relationship | One canonical operation; stable ID for edits/reversal. Deleting an edge removes that map entry; Undo restores its exact ID and value. |
| Delete a participating Gloss | Keep the existing definition tombstone **and retain incident relationships**. Explain this in the delete action; show deleted-endpoint links separately from active counts. Undo restores the Gloss and connectivity. This replaces today's incident-link pruning. |
| Repair after save/reopen | Provide restoration of a referenced tombstoned Gloss, retargeting to an existing local Gloss, or explicit link deletion. Do not rely on pre-reload Undo history being available. Unknown missing definitions cannot be fabricated from an ID. |
| Remove anchor / cut source text | Keep the definition and relationships. Display `anchor removed`; allow relational work and definition editing. |
| Split/join TextBlocks; repeated local occurrences | Segment IDs/offsets and occurrence counts may change; logical Gloss endpoints and relationship IDs do not. One relationship graph, not one graph per occurrence. |
| Borrowed foreign Block | Retain Stage A/B ownership restrictions. Do not expose its owner's Glosses as local targets or write through the borrowed occurrence. |
| Detach/return or change presentation | Retain current editing session and graph view state during host transfer; no canonical writes. Mode-off may release derived caches and rebuild them when enabled, just as Stage B does. |
| Native Save/reopen; full native package | Preserve all identities, links, tombstones, unresolved targets and supported/opaque extension metadata. Normal manual Save/dirty tracking applies. No SQL synchronization or autosave. |
| Independent fragment copy | Remap copied Gloss IDs and edge IDs; retarget internal edges through the same map. For an outgoing target outside the copy, retain an explicit `outside-copy` descriptor and original target ID instead of dropping the edge. Do not silently bind it to an identically named destination ID. Incoming edges owned by uncopied source Glosses are outside the selected fragment; do not mutate or copy the source graph implicitly. |
| Full-document duplication | Fresh Document, Gloss and edge identities, with all internal endpoints remapped. Distinguish this from reopening/importing a complete native Document with its identity retained. |
| Missing/ambiguous/unsupported endpoint | Keep data and show a diagnostic row. Resolve local unique IDs only; no network/global search, label matching or cross-Document auto-binding. Retargeting is an explicit canonical edit. |
| Lossy export | Test every supported transport before calling it lossless. Plain text/ordinary Markdown are not graph storage; communicate omitted relational data or supply an explicitly requested relational export. Never add an automatic sidecar. |

Retained unresolved links are inert data. Their presence must not break unrelated text editing or native Save. Unsupported versions should not be “repaired” by destructive normalization.

## 8. Argument exploration: a derived graph view

Choose the root explicitly, normally the selected Gloss. Offer thesis Glosses as suggestions, but allow any live/orphan Gloss to be a root. Root, expansion paths and filters are session presentation state, not a second authored hierarchy. A Gloss may participate in any number of arguments.

For the supplied example, **incoming** edges explain a thesis: Evidence → supports → Thesis becomes an Evidence child. Traverse incoming edges by default; provide a separately labelled outgoing group. This matters for `depends-on`: Claim → depends-on → Premise must not be displayed with reversed semantics. Custom predicates retain their real arrows.

```ts
function* expand(nodeId, edgePath, ancestors, budget) {
  // Called only for an expanded row; subscribe to this node's adjacency.
  for (const edge of page(filteredIncoming(nodeId), budget)) {
    if (budget.remaining <= 0) { yield moreRow(nodeId, edgePath); return; }
    budget.remaining--;
    const childId = edge.source;
    const key = [...edgePath, edge.id]; // row identity is a PATH, not Gloss ID
    if (!resolvable(childId)) yield missingRow(key, edge);
    else if (ancestors.has(childId)) yield cycleReferenceRow(key, edge);
    else {
      yield glossRow(key, childId, edge, 'incoming');
      if (isExpanded(key) && budget.remaining > 0)
        yield* expand(childId, key, new Set([...ancestors, childId]), budget);
    }
  }
  // Outgoing relationships are available as their own explicitly directed group.
}
```

Use a path-local ancestor set, **not a global visited set**: shared evidence should appear under each parent, while a cycle terminates in a clickable back-reference. Seed ancestors with the root. Multiple edge types remain distinct edges/rows. Identify repeated Glosses without duplicating their canonical definitions.

Paginate large adjacency groups, cap visible rows/depth with “Show more,” and perform no traversal of collapsed branches. Order using current Document occurrence order, with a stable ID tie-breaker and orphans last; do not store ordering as another argument tree. Source text rebasing must not re-sort/rebuild the graph. Expanded occurrences of an affected shared Gloss may all update; unrelated branches should retain identity.

## 9. Keyboard increment — implemented, separately authorized

`registerInputActions` in [`binding-catalog.ts`](src/input/binding-catalog.ts) now registers platform-primary G plus the old chord for `gloss.create`. Mutable's default catalog had no conflicting primary-G action. Chrome does use this chord for Find next ([official shortcut reference](https://support.google.com/chrome/answer/157179?hl=en)); the user explicitly approved overriding it **inside TextBlocks only**.

The narrow `InputGateway.runBinding` guard requires the actual standoff editing surface and rejects nested native fields/non-editable widgets. Dialogs, ordinary controls, composition and feature-disabled execution retain existing handling. Outside the editing surface, this binding does not suppress the browser action. Selection acquisition, word fallback, compact editor, first-colon parsing and canonical commit remain `GlossController` operations.

Toolbar labels now come from the binding registry instead of a hard-coded chord. Existing saved overrides remain authoritative. If another already-registered action has a conflicting saved primary-G assignment, the new Gloss default falls back to the old chord without rewriting preferences. No keyboard framework or relational command shortcuts were added.

## 10. Performance expectations and risks

Let G be Document Glosses, E its relationships, and d the affected endpoints' incident edges.

- First relational index activation: O(G + E), without visiting character Cells or unrelated Documents. Cache lifetime is the retained presentation session, not the workspace repository.
- Ordinary typing/offset rebasing: **zero relationship inventory work**, no extra row publications, snapshots, SQL/network activity or geometry consumers.
- Edge edit: targeted adjacency/publication work proportional to changed sources' edge comparison and affected endpoints/visible branches; separately measure the existing Document-registry canonical costs described above.
- Gloss deletion/restore: update incident adjacency/status through indexes, preserving unrelated rows. Do not scan the workspace for incoming edges.
- Expansion: bounded by requested adjacency pages and visible paths. Cycles and shared subgraphs must not cause an exponential eager rendering pass.
- No new source-geometry invalidation for links-only changes. Card-height changes use existing observers.

Stage B's roughly 324 ms activation and 256 ms deactivation include document reflow and UI construction/disposal; its measured margin-layout work while scrolling was around 0.4 ms median. Obvious future opportunities are retaining more derived UI/cache state or reducing offscreen row construction. They carry lifecycle/memory tradeoffs and are **not part of this proposal's implementation scope**. Crowded-margin condensation remains deferred.

## 11. Feasibility evidence and qualification strategy

A disposable in-memory probe verified that the existing root-record Gloss path can add link-shaped metadata, Undo/Redo it without repository snapshots, roundtrip it through the native codec, and copy both endpoints with fresh logical/edge IDs while preserving a future metadata field. It also confirmed that current admission accepts a missing target: **transport feasibility is not referential-integrity implementation**. Separate default-catalog probes found no primary-G application conflict on macOS/Windows configurations. No relational production mutation or schema change was made by these experiments.

Keyboard qualification: 29 maintained focused tests (Gloss authoring/shortcut, Stage B index, binding registry), plus the three disposable feasibility checks; direct-DOM/Solid and macOS/Windows binding cases. Chrome's existing actual-Flint qualification passed 37 assertions with the new primary shortcut used for authoring and the legacy chord exercised subsequently. Selection, canonical creation, Undo/Redo, native metadata roundtrip and bounded-work checks remain covered. Browser counters: zero snapshots, projection builds, unrelated projection updates and requests in the measured authoring/presentation path. The browser save transport in this shortcut run is in-memory; Stage B's physical-save proof is not relabelled as a new disk test.

Artifacts: [shortcut browser results](artifacts/gloss-stage-c-shortcut/qualification.json), [focused tests](artifacts/gloss-stage-c-shortcut/unit-tests.txt), [disposable feasibility checks](artifacts/gloss-stage-c-shortcut/feasibility-tests.txt). Reactive TypeScript and `git diff --check` passed. Windows binding dispatch is unit-tested; this run does not claim a separate Windows-browser run.

For relational increments, use focused checks:

1. **C1:** edge IDs/direction, several types between a pair, duplicate/self-link policy, unknown versions, ambiguous IDs, missing targets, deleting/restoring Glosses, anchor removal, split/join, local repeats/foreign borrowing, stale edits, inverse history, native/package/copy policies and history memory cost.
2. **C2:** trusted source/target selection, filtering, custom type, cancellation, IME, double-confirm prevention, edit/reverse/delete/repair; original text/Cells/annotations retained; incoming/outgoing display agrees with canonical state. Native controls do not acquire editor shortcuts accidentally.
3. **C3:** root selection, incoming versus outgoing semantics, cycles, diamonds/shared evidence, multiple types, missing targets, pagination/budgets, stable path keys and affected-branch publication counts.
4. **Performance:** extend the existing Stage B fixture with hundreds of Glosses and escalating edge counts/high-degree nodes, plus unrelated Documents. Count registry reads, graph deltas, reactive publications, geometry reads, snapshots, projection builds and network/SQL calls. Run the real Flint typing benchmark paired with relational UI on/off; measure command-to-usable UI separately from protocol/screenshot overhead. Report median/p95 only where samples support them.
5. **Durability/lifecycle:** one isolated on-disk Vault roundtrip with active, orphan, tombstoned and missing endpoints; real manual Save, full session disposal and reopen. Verify detachment/return and two simultaneous local viewing occurrences. Do not touch a user Vault.

## 12. Implementation increments and acceptance gates

| Increment | Scope | Acceptance gate |
| --- | --- | --- |
| **C1 — Foundation** | Versioned link decoder/validation, native authoring commands, proof-derived change evidence, local adjacency, deletion/repair data semantics, copy/export policy. Feature flag `glossRelationships`, default on when implemented; disabled views still preserve data. | Identity, lifecycle and import/export tests pass; one operation is one Undo step and dirties only its Document; no broad snapshots/rebuilds; explicit registry/history-cost measurements; typing has zero graph work. Review this evidence before adding UI. |
| **C2 — Authoring** | One Register relationship form, local target search, separate type suggestions, incoming/outgoing groups, navigation, reverse/delete/retarget and referenced-tombstone restoration. Optional small card counts. | Trusted browser authoring/repair and selection retention pass; targeted endpoint updates; physical Save/reopen and host transfer qualified; no accidental loss of unresolved data. |
| **C3 — Exploration** | Expandable Register view, root and relationship filters, path-based lazy expansion, cycle/shared-evidence handling and budgets. | Correct direction, cycles and multiple parents; work bounded by expanded branches; no authored hierarchy, lines across the Document or new geometry subsystem. |
| **Keyboard** | Platform-primary G plus retained old chord through existing command/binding infrastructure. | Independently implemented and qualified as described above. |

These are reviewable functional increments, not a mandate for extra sub-phases. The proposed representation and lifecycle policies must be reviewed **before C1 begins**.

## 13. Product decisions for architecture review

No remaining decision blocks this investigation. Recommended defaults for approval before relational implementation:

1. **Gloss deletion:** retain incident edges against a tombstone, with restore/retarget/delete repair actions, instead of current cascading pruning.
2. **Copy boundary:** keep outgoing links beyond an independent copy as explicit unresolved descriptors; do not silently drop or auto-link them. Full native import/reopen retains identity; duplication remaps it.
3. **Multiplicity:** allow different predicates between a pair; prevent accidental exact duplicates and new self-links in authoring, while preserving imported records.
4. **Argument presentation:** selected Gloss as initial root, incoming explanation branches by default, outgoing links in their own labelled group. Roots/expansion remain session state.
5. **Vocabulary:** open relationship types with suggestions separate from Gloss types; preserve spelling and avoid automatic `counter-argument`/`counterargument` migration.

Keyboard behaviour is already resolved by the user's explicit approval. Future promotion to Claims/Entities should use separately typed mappings between local `(Document, Gloss ID)` and global identities, with explicit authoring/persistence boundaries. Stable edge IDs and preserved extension data leave that route open; they do not initiate graph synchronization. **Stage C relationships and argument views remain unimplemented pending review.**
