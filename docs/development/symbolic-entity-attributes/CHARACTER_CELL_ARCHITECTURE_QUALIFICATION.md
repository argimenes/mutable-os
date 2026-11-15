# Character-Cell Architecture Qualification

15 November 2026 · Investigation only; no implementation or refactoring.

Companion to the [Architectural Qualification Report](ARCHITECTURAL_QUALIFICATION.md), incorporating the additional brief on character cells as textual authority.

**Recommendation:** preserve the existing canonical model. The active standoff editor is **already cell-authoritative**: its ordered canonical cell records supply the text; a parent text string is not independently maintained. Add only a small, contract-derived range presentation descriptor to distinguish concealed source from transient materialisation. Do not promote DOM cells to authority, introduce another authoritative sequence, or persist presentation roles.

## 1. What character cells actually are

**Established by code inspection:** the word “cell” currently refers to several different layers.

| Layer | Actual representation and responsibility |
|---|---|
| Canonical source | `ContentRecord.inlineContent` is an ordered **array of placement keys**. Each placement refers to a content record, normally `text-cell` with `payload.text`. Repository dictionaries store both kinds of record. This is not a linked list. |
| View occurrence | `BlockNode.inlineContent` contains occurrence-specific node keys. Projections expose the same canonical content in different views; these nodes are not a second editing authority. |
| Character presentation | `CharacterCellPresentation` is a transient descriptor carrying text, styling, visibility, optional image/alternative and provisional state. Its meaning depends on its rendering context. |
| DOM | `DirectCharacterCells` retains a map of keys to span/Text-node entries, updates/reuses them, and disposes removed entries. It owns DOM reconciliation, not canonical text or history. |
| Older editor | `src/library/cell.ts` defines a different `Cell` class with `previous`, `next`, `index`, text, DOM and geometry fields. That linked structure must not be mistaken for the active reactive editor's representation. |

Sources: [canonical and view types](../../../src/block-tree/types.ts#L22), [projection updates](../../../src/block-tree/projection.ts#L274), [presentation descriptors and DOM owner](../../../src/rendering/direct-character-cells.ts#L4), [older Cell class](../../../src/library/cell.ts#L7).

**Authority and identity.** Legacy import explicitly deletes the standoff parent's `payload.text`, then creates one content record and inline placement per Unicode code point: [decodeBlockTree](../../../src/block-tree/codecs.ts#L43). Export joins those cells to derive `text`: [encodeBlock](../../../src/block-tree/codecs.ts#L140). Cell content and placement keys are independent of array position. Inserting before a surviving cell changes its position, not its identity. Projection keys identify mounted occurrences and DOM keys preserve nodes where possible; neither should be used as a portable annotation target.

These are canonical model objects in JavaScript, not just DOM nodes. Their textual content is persistent, but their individual runtime keys are **not durable authored character IDs**. Native save calls the [portable encoder](../../../src/persistence/native-resource.ts#L102), which packs adjacent text cells into runs and requires text-cell payloads to contain only one code point of text. Native load allocates new cells from those runs: [encode/decode grammar](../../../src/history/stage-c-gates/portable.ts#L77). Despite that module's historical “candidate” header, the current native codec imports and calls it. The `PlacementRecord` contract likewise distinguishes authored placement identity from cells: [placement type](../../../src/block-tree/types.ts#L40).

**Coordinates.** Array positions are canonical cell offsets; ordinary annotation ends are inclusive, editing/selection intervals are half-open. A Unicode code point occupies one text cell, while a grapheme can span several cells. Inline images also occupy canonical slots, so “every canonical cell is a character” is only accurate for text-only sequences. Existing [grapheme navigation](../../../src/input/graphemes.ts#L1) derives suitable boundaries from strings assembled from cells. No migration to UTF-16 offsets, grapheme indexes or display offsets is proposed. PlainText/source editors remain separate `payload.text` authorities; this finding applies to standoff TextBlocks.

**Editing and lifecycle.** [replaceInlineRange](../../../src/block-tree/commands.ts#L877) allocates inserted cell records, splices the source sequence, maps standoff ranges and removes unreferenced deleted records. Source positions and repository location indexes update; identities are not positional counters. [Repository history](../../../src/block-tree/repository.ts#L636) replays forward/inverse operations through canonical commit. DOM input becomes an authored change only after the input gateway reconciles it through these commands. A live composition may temporarily differ from canonical text; this is pending input, not permission for DOM text to become a competing authority.

**Which operations use another representation?** Grapheme navigation, text search, extraction, legacy export, native compact encoding and clipboard serialization derive strings/runs from cells. Browser selection uses DOM endpoints which the mount translates into source boundaries. IME reconciliation compares captured browser text with source text and commits the difference. These representations are adapters or transient inputs, not independently authoritative copies. The main gap for symbolic text is their interpretation of rendered descendants, already documented in the [offset-stability addendum](ARCHITECTURAL_QUALIFICATION.md#offset-stability-addendum-six-findings).

## 2. Existing noncanonical presentation mechanisms

**Finding:** two useful precedents already separate visibility from source membership.

- [ProvisionalCells](../../../src/features/autocomplete/provisional-cells.ts#L4) has temporary keys, role labels, marker cells, and session-only mappings between source/draft/presentation boundaries. Its bracket markers are visible but excluded from draft text extraction and canonical indexing. Draft text becomes canonical only through an explicit commit. It owns no repository or DOM itself.
- Superposition renders an alternative at a source range and hides other source hosts. Its nested `CharacterCellPresentation` entries do not add slots to the parent's canonical sequence. However, the alternative text belongs to another **canonical owned TextBlock**. It is not a precedent for keeping an Entity attribute value as transient document data.

Neither is a general symbolic contract implementation. Reuse their separation of responsibilities; do not route readonly attribute values through the editable provisional-draft machinery or create alternative Blocks to store them. Their boundary adapters and conflict handling still need qualification when features overlap.

## 3. Where contract-derived roles should reside

**Recommended modest extension:** associate one source interval with one derived presentation descriptor, owned by the mounted occurrence and linked to the effective registered contract. Conceptually it holds property identity, source `start/endExclusive`, chosen source/materialised presentation, resolved display content and the boundary/interaction policy. It is disposable, version-checked session state. It must not duplicate the source string as a second editable truth.

Canonical participation is determined by membership in `ContentRecord.inlineContent`, **not by filtering cell role flags**. A contract may conceal canonical cells but must never remove them from indexing. Generated display text is excluded because it never enters that sequence. The contract governs its rendering/lifecycle and interpretation; only canonical editing commands create or remove source cells.

| Possible location | Assessment |
|---|---|
| Persistent role on each canonical Cell | Reject. It duplicates contract state, mixes occurrence visibility with shared content, and violates the current native text-cell payload grammar. |
| Separate mutable canonical/presentational collections | Canonical storage already exists. Avoid a second editable collection or flattening both into a sequence whose indexing depends on scattered filters. A derived display list is acceptable only as disposable renderer output. |
| Range-to-presentation descriptor | Preferred. One owner supplies source capture, boundary routing and visible fragments; roles follow the effective contract. |
| Existing rendering fields only | Useful starting point, but `hiddenSource`/`alternative` alone do not make input, extraction and geometry agree. Extend their descriptor contract minimally rather than introduce a parallel Cell class. |

Thus a small extension of existing presentation descriptors, centred on a range object, is preferable to a new general cell hierarchy. The materialisation can be a text node or styled runs; a ten-character display does **not** require ten persistent objects or even ten transient cell wrappers. Allocate per-character display descriptors only if an existing renderer demonstrably needs them. Hidden source and separate non-editable materialisation remain the first DOM experiment from the preceding addendum.

## 4. Options comparison

The brief's Option A assumes cells are projections of another canonical text representation. That premise is incorrect for active standoff text. The comparison below uses the actual architecture: A retains it; B extends its presentation descriptors; C considers changing authority beyond what already exists.

| Criterion | A — Existing canonical model plus range-specific adapters | B — Minimal contract-derived presentation descriptor | C — New cell-authoritative architecture |
|---|---|---|---|
| Architectural complexity | No storage change; risk of separate special cases in consumers | Small shared range abstraction interpreting existing cells | Canonical model is already cell-authoritative; making DOM/another Cell class authoritative adds competing state |
| Implementation scope | Renderer, input, geometry and external extraction adapters | Same areas, sharing one descriptor/resolver and existing interval machinery | A distinct replacement would touch commands, validation, history, projections, codecs and consumers broadly |
| Performance | Keeps existing source costs; duplicated range lookup is a risk | Potentially shares lookup/work; cache by affected ranges, not every document revision | No demonstrated typing benefit; migration and synchronization could add work |
| Memory | Per-range state and display DOM | Per-range descriptor; avoid per-character reactive objects or copied source arrays | Additional Cell graph/roles would increase overhead unless existing records were replaced |
| Compatibility | Legacy definitions unchanged | Opt-in only; missing contracts/fields delegate to legacy behaviour | High risk if identity, coordinates or edit authority changes |
| Persistence | Existing native runs and annotation data | Same; presentation roles never serialize | No change if C merely describes today's model; broad change if durable per-character identity is introduced |
| Reliability | Source invariants already exist; scattered adapters can disagree | Central source/display distinction reduces duplication risk, subject to validation | New synchronization/authority rules introduce failure modes without resolving browser mapping automatically |
| Maintainability | Lowest initial abstraction cost | Preferred if the same descriptor actually serves multiple consumers | No demonstrated simplification warranting a rewrite |
| Reversibility | Easy: disable rendering feature | Easy: disable contract, preserve source and native data | Hard if storage/history identities or command semantics migrate |

**Decision:** preserve A's canonical storage and editing machinery; use a narrowly scoped B for presentation. If the prototype shows that existing descriptors plus a range resolver are sufficient, stop there. C interpreted as canonical model-cell authority is already satisfied. C interpreted as DOM authority, a new linked Cell graph, or durable character identities is rejected for this feature: it would be a broad migration without demonstrated benefit.

## 5. Code impact, advantages and risks

**Expected production touchpoints, not implemented:**

| Area | Smallest relevant scope |
|---|---|
| Contract/descriptor | Property registration and a range resolver; reuse `annotation-range-events.ts` indexing where appropriate |
| Rendering | `standoff-editor-view.tsx`, `direct-character-cells.ts`; source versus materialised content, both direct and Solid fallback renderers |
| Selection/input | Mount boundary/capture functions, `input/gateway.ts`, cross-block and multi-selection routes; normalize atoms before existing commands |
| Geometry | Existing measurement invalidation and SVG fragment consumers; presentation change invalidates layout without source revision changes |
| Extraction | Native/external clipboard distinction and semantic export; canonical save/history remain source-only |
| Canonical model/codecs | No cell-authority refactor, new cell payload fields or format migration required |

The potential benefit is consistency across selection, DOM capture and display extraction—not simpler standoff indexing, which already has a single authoritative sequence. Multiple presentations already share canonical content through projections; occurrence-local roles preserve that advantage. Superposition may later share the adapter, but do not refactor its owned content model during this experiment. Copy/paste still needs explicit source/display semantics, and DOM reconciliation still needs to preserve pending input. Cell authority alone solves neither.

Current costs are not constant-time: source replacement copies/splices the affected paragraph's inline array and maps its annotations; projection and DOM updates iterate affected sequences. Retain those bounds and avoid multiplying them by the number of ranges. Do not turn every attribute refresh into a canonical commit or every caret movement into descriptor reconstruction. No new whole-document snapshots, unrelated reference scans or Cavern queries belong in typing. Reuse geometry caches with explicit presentation invalidation.

Other risks are stale interval descriptors after real edits, confusion between occurrence keys and portable identity, materialised descendants being captured as source, and attributes changing during composition. Contract changes must never deindex canonical cells. Disabled/absent contracts retain current behaviour; representative compatibility cases remain sufficient.

## 6. Verification and prototype implications

**Executed:** a read-only probe of the actual legacy codec confirmed that `A😀é` becomes four canonical text cells (five UTF-16 code units), the standoff parent has no `text` field, export preserves text/annotations semantically, and decoding again allocates fresh cell keys. This is a semantic round trip, not byte-identical JSON: object-key ordering changes during encoding.

Also ran:

```text
npx vitest run src/persistence/native-resource.test.ts \
  src/features/autocomplete/provisional-cells.test.ts \
  src/features/autocomplete/provisional-integration.test.ts
3 files, 30 tests passed
```

These existing tests cover native persistence, noncanonical markers, source/draft mapping, commit/cancellation, history and stale input. They supplement the previously recorded bounded-inline and DOM tests; they do not demonstrate symbolic-contract performance or native browser behaviour. No new tests or application implementation were added.

**Prototype plan adjustment:** remove any “make cells authoritative” work item. Keep the existing atomic input, geometry, fallback, persistence and bounded-work checks. First try one contract-derived range descriptor consumed by source capture, boundary routing and visible-fragment lookup. Display values must create no canonical cell records, history entries or persistent identities. Retain surviving source/DOM identities where the presentation permits, and verify two mounted occurrences can choose different presentations without changing shared source.

**Still requires a small experiment:** whether a text node/run is sufficient versus nested display-cell descriptors; whether one descriptor actually reduces duplicate lookup and measurement; native IME/selection correctness with hidden source; and interaction with provisional editing or other replacement owners. Start by rejecting conflicting owners deterministically rather than composing two presentation coordinate mappings. Measure any claimed performance improvement in the real Flint benchmark. No architecture rewrite is justified by the inspection findings.
