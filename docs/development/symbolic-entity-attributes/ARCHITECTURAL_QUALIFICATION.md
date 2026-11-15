# Symbolic Entity Attributes and Standoff Materialisation

Architectural Qualification Report — 15 November 2026

Scope: investigation and proposed experiment only. No feature implementation is authorised by the brief or included in this change.

Related investigation: [Character-Cell Architecture Qualification](CHARACTER_CELL_ARCHITECTURE_QUALIFICATION.md). It establishes that the active standoff editor already uses canonical cells as textual authority, distinguishes them from DOM/presentation cells, and recommends a minimal contract-derived range descriptor without a storage migration.

Retained authoring requirements: [Feature Roadmap](FEATURE_ROADMAP.md) records `EntitySymbolicAttribute`, database-enforced per-Entity Key uniqueness, `@` symbolic canonical-name insertion, optional Tab attribute selection, `@:` nomination and inline creation. It supersedes the earlier generic attribute-table/duplicate-label recommendation and deferral of canonical-name authoring. **Undo Option A is settled:** Document Undo removes the insertion and symbolic property in one history entry; the SQLite attribute remains, and Redo restores the same UUID without creating a record. Separate persistence operations retain receipt/recovery coordination; no cross-store compensation or automatic Document save is introduced. The rendering prototype remains unchanged. Ordinary Entity mention annotations are distinct and must not be automatically converted.

**Recommendation.** Proceed to a small prototype when implementation is authorised. Entity-owned attributes and standoff references fit the current content model. Use **selective rendering governed by opt-in range contracts**, with source text remaining canonical. A hidden-source DOM representation is one implementation candidate, not the architectural requirement. The main unproven work is consistent interaction with projected ranges, particularly selection, deletion, IME, and geometry.

**Offset-stability addendum.** Changing an Entity attribute must never mutate the underlying TextBlock, rebase any standoff offset, or create a Document history/dirty-state change. Hidden source text and its separate, non-editable materialisation must resolve to the same canonical source interval. There is no second persistent coordinate system: only source cell positions and transient mappings to mounted DOM boundaries and geometry. Actual authored text edits remain responsible for the ordinary offset updates described below. Section 3 records the six requested findings and their verification limits.

The discussion accompanying this investigation establishes these design requirements:

- Input and selection handlers should consult effective range capabilities, rather than each hard-code symbolic-reference behaviour.
- Contracts are optional: definitions without them retain existing behaviour and require no migration. Omitted capabilities retain the existing behaviour for that operation.
- A broader contract model is an architectural direction, not a requirement to refactor the application during this feature.
- Compatibility tests should establish the principle with representative properties, not exhaustively test every standoff type.

Throughout this report, **Finding** means established by inspection or the explicitly recorded existing tests; **Recommendation** means proposed design; **Prototype question** means not yet demonstrated. Links refer to this checkout; line references identify relevant entry points rather than complete implementations.

## 1. Current architecture

### Entity storage and Cardex

**Finding.** SQLite already supplies canonical UUID-addressed Entities, revisions, attribution, aliases, and JSON `attributes`. `Entity.attributes` is an extensible aggregate field, not a collection of independently identified attribute records. Aliases have UUIDs, but represent names with origin and uniqueness semantics; they are not arbitrary typed values. See [foundation schema](../../../src/knowledge-sqlite/migrations/mutable/0001-foundation.sql#L14).

Claims are UUID-addressed assertions with `expression`, `typename`, JSON attributes, participants, qualifiers, and evidence. Participants associate Entities with roles; a Claim is not currently an Entity-owned label/value slot. See [semantic schema](../../../src/knowledge-sqlite/migrations/mutable/0002-semantic-knowledge.sql#L29). Using Claims would require defining ownership, selecting an assertion, extracting its value, and resolving competing assertions. None is necessary for a directly editable pen name.

Canonical mutations already use expected revisions and an idempotent audit/outbox mechanism. Its table allowlist would need extension for a new record type: [canonical ledger](../../../src/knowledge-sqlite/canonical-ledger.mjs#L3). Entity renames preserve GUIDs. Cardex soft deletion preserves identity and references: [migration 0010](../../../src/knowledge-sqlite/migrations/mutable/0010-cardex-soft-delete.sql#L1), [Cardex mutations](../../../src/knowledge-sqlite/cardex.mjs#L47).

Cardex currently has Identity, Documents, Mentions, Claims, Relationships, and Dossier tabs; Dossier is a placeholder. Its card record does not expose a dedicated attribute collection: [detail panes](../../../src/features/cardex/details.tsx#L6), [service record and request](../../../src/features/cardex/service.ts#L5). Adding Attributes therefore requires UI and service work, not just a schema field. Reuse its cancellation, optimistic revision checks, and retained operation receipts.

Entity operations are Cavern/Vault-scoped. The existing [Entity service](../../../src/application/entity-service.ts#L22) distinguishes source-bound operations from lightweight lookup. Attribute resolution should use the latter principle; it must not require a saved Document, prepare all Vault facts, or scan the Vault to render an unsaved reference.

### Canonical text, standoff data, and persistence

**Finding.** The active editor uses canonical content/placement records, occurrence projections, `StandoffEditorView`, and `DirectCharacterCells`. The older `StandoffProperty` class is not the principal implementation target.

The canonical standoff `inlineContent` cell sequence is itself the authoritative text representation. Import removes the parent's text string; extraction derives text from cells. Native files compact cells into text/image runs and recreate runtime keys on load. `DirectCharacterCells` owns derived DOM, not a replacement text model. Contract-derived visibility must therefore never change canonical membership or introduce persistent cell roles; see the companion qualification for the options comparison.

Standoff data resides in `payload.standoffProperties`. An annotation can already have an `id`, `type`, `value`, and metadata. A UUID string in `value` follows the Entity-reference convention. Text cells are allocated from `[...text]`; ordinary standoff `start`/`end` identify cells with an **inclusive end**. Replacement commands and selection boundaries use an **exclusive end**. See [inline replacement](../../../src/block-tree/commands.ts#L877). Unicode code points are not always grapheme clusters, and native textarea offsets are a different coordinate space.

The saved SQLite projection converts authored `end` to `end + 1`, retaining the raw annotation in JSON `attributes` and scalar/JSON values separately. Its `targetEntityGuid` is currently populated specifically for `codex/entity-reference`: [saved projection](../../../src/knowledge-sqlite/saved-projection.ts#L130). SQL `resolution` describes linked annotation-definition resolution; it should not be reused to mean attribute-value availability.

Native resource capture preserves authored content and annotations independently of DOM presentation: [native codec](../../../src/persistence/native-resource.ts#L1), [native export](../../../src/runtime/export-document.ts#L7). No fundamental native document-format change is indicated merely to store the proposed reference. New validation and interoperability support are still required. Existing native codecs should be round-trip tested with the new fields; generic JSON preservation does not prove supported copy/paste semantics.

Document dirty state is maintained per resource from repository changes: [native session](../../../src/persistence/native-session.ts#L43). Attribute resolution and rendering must not publish repository changes. Document saving remains manual, to the opened Mutable JSON filename; no background saves or Markdown sidecars are proposed.

### Existing selective rendering and interaction infrastructure

**Finding.** Text superposition already projects an alternative reading at a source range. The first source-cell position displays a `contentEditable=false` replacement and remaining source cells are hidden. This preserves source content canonically, but does **not** retain every original character as hidden DOM text: the first position becomes the replacement. See [projected alternative](../../../src/rendering/standoff-editor-view.tsx#L310), [character-flow rendering](../../../src/rendering/standoff-editor-view.tsx#L737), [direct DOM owner](../../../src/rendering/direct-character-cells.ts#L93), and [CSS](../../../src/index.css#L245).

Superposition owns a separate alternative TextBlock through a relation. Symbolic values should reuse the presentation pattern, not that content ownership model: [superposition operations](../../../src/runtime/text-superposition.ts#L42). Creating a hidden alternative Block for each attribute reference would duplicate externally owned values and add unnecessary persistence/history work.

The editor has useful contract precedents, but no inspected interface already supplies the proposed complete range interaction contract:

- [Mount handles](../../../src/runtime/mounts.ts#L9) declare editor-level `inputPolicy`, selection capture/restoration, hit testing, and source-text capture.
- [Property definitions](../../../src/runtime/visual-effect-registry.ts#L65) register renderers, visual states, and named caret-enter/leave handlers. These events are observational; they do not intercept editing operations.
- [Annotation range events](../../../src/runtime/annotation-range-events.ts#L22) already use an occurrence-local interval index. Caret queries avoid DOM reads; the index is built when ranges change. Reuse or extract this mechanism for capability queries instead of adding a separate document-scanning service. It currently answers caret containment; boundary affinity and interval-intersection queries need additional design.
- [Range rendering](../../../src/rendering/range-rendering.tsx#L152) composes style classes by intervals and supplies SVG overlays. It is not a general HTML wrapper tree.

Textual presents the existing Flint Document session through its presentation host: [Textual Flint](../../../src/features/textual/flint.tsx#L91). This offers shared implementation, with separate validation for Textual's sizing, scaling, focus restoration, and secondary views. Native PlainText/source editors should retain source text unless they explicitly opt into a future presentation contract.

## 2. Feasibility and the proposed contracts

**Assessment: viable, with medium-to-high interaction risk.** The data model does not require a new inline Block hierarchy, placeholder character, or interior character-offset translation. A rendered atom maps to two canonical boundaries, `start` and `end + 1`. It still requires explicit boundary-to-DOM mapping, including direction and affinity.

### Selective rendering

**Recommendation.** A standoff occurrence selects one of two presentations: readable source or resolved attribute value. The selection is session state; it does not edit the text, offsets, annotation definition, or Undo history. Begin by resolving at load/open and explicit refresh; live updates are a later increment.

Compare two DOM strategies in the fixture:

1. Preserve source character positions, hide the source, and add the materialisation within the existing first-cell host. Retain one outer child per source cell so existing direct-child indexing remains usable. This can preserve all source DOM text if that proves useful.
2. Follow the existing superposition approach: render the value at the first position, hide subsequent source positions, and retrieve the canonical source during input reconciliation.

Both preserve canonical text. The second has a closer existing implementation; the first may help inspection but adds DOM structure. Do not wrap arbitrary crossing annotation ranges or add an extra unaccounted direct child: current selection and geometry code frequently indexes `flow.children`. Omitting all hidden cells would require a larger source-boundary/DOM-boundary mapping change and is not the first experiment.

**Prototype question.** Does physically retaining every source text node reduce complexity? The code does not establish that it does. Hidden DOM content alone provides neither atomic editing nor correct copy behaviour. Following the offset-stability addendum, begin with the hidden-source/separate-materialisation variant; use the existing superposition variant as a comparison if the proposed structure proves unnecessarily complex. Neither permits source-offset rewrites for display-length differences.

### Opt-in contracts and handler routing

**Recommendation.** Separate three concerns, initially within the existing standoff infrastructure:

| Contract | Responsibility | Symbolic-reference example |
|---|---|---|
| Presentation | Visible content, layout ownership, source boundaries | Select source or attribute text; occupy the source interval visually |
| Interaction | Caret, navigation, selection, edit and clipboard routing | Boundaries only; whole-range selection; attribute activation |
| Mutation | Allowed authored operations and their invariants | Unwrap or replace source explicitly through canonical commands |

A conceptual declaration could specify `caret: boundaries`, `navigation: atomic`, `selection: whole-range`, `textInput: replace-whole`, and separate copy/activation policies. These are illustrative values, not a committed API. Use structured policies rather than a single `editable` flag or a bitmask that cannot express operation differences.

Resolve effective capabilities from the registered property definition, occurrence presentation, operation, boundary affinity, and enclosing editor permissions. Existing Document readonly restrictions take precedence; a range contract cannot grant editing rights. Resolve overlapping opt-in policies deterministically, not by whichever property happens to be last in an array. Ordinary formatting contributes no interaction restriction.

Handlers should follow one shared route:

1. Establish the existing mounted editor/input policy and source selection.
2. Query only relevant opted-in ranges at the caret or intersecting the operation.
3. Produce a normalized selection and a permitted action, rejection, or explicit inspector action.
4. Execute content changes through existing canonical commands; restore selection through the presentation's boundary adapter.

Consult this route for keyboard navigation, mouse/drag selection, selection restoration, Backspace/Delete, cut/paste, selection replacement, and composition commit. Search/replacement and programmatic commands must also preserve range invariants; handling only DOM events leaves bypasses. Undo/Redo replays canonical operations and then normalizes selection for the current presentation—it must not reinterpret the historical content edit using a newer attribute value.

During composition, retain the active DOM and defer disruptive materialisation changes. Provisional input and presentation toggles remain local. Validate the source version before a delayed commit or resolution result takes effect.

### Backward compatibility

**Required by the discussion.** No contract means the current renderer and input behaviour. No definition migration, persisted default fields, or blanket reinterpretation of existing annotations. Omitted capabilities delegate to the old path for that operation. Ordinary blocks with no opted-in ranges should take a cheap bypass without capability scans or resolution work.

Unknown contract versions preserve the authored data and use readable source presentation; they must not activate an unknown replacement renderer with unrestricted editing. This is distinct from a known legacy definition that has no contract and retains its current behaviour. Contract configuration is declarative and versioned; implementations and named handlers come from the registry, not arbitrary executable metadata.

A general application-wide contract framework is **optional future work**. Existing mount policies, block capabilities, renderer registrations, and application ports are reasons to investigate shared conventions later, not reasons to merge all of them into one universal interface now.

## 3. Compatibility and interaction policies

### Concrete gaps in the current replacement precedent

**Findings.** These are reasons to prototype, not claims that a CSS change completes the feature:

- [Selection capture](../../../src/rendering/standoff-editor-view.tsx#L32) recognises a superposition end, but restoration largely uses direct-child positions. Descendant hit targets need reliable lookup of the owning atom, including nested styled text.
- [Pointer hit testing](../../../src/rendering/standoff-editor-view.tsx#L642) measures flow children and chooses `index` or `index + 1`. For a multi-cell replacement, the latter can be inside its source range. Shared geometry and atom-aware boundaries are required.
- [Backspace/Delete](../../../src/input/gateway.ts#L213) compute neighbouring source grapheme boundaries. They do not currently expand deletion to a projected range. Multi-selection deletion has its own path in the same gateway.
- [Cross-block input](../../../src/input/cross-block-input.ts#L260) has additional movement/selection paths. Normalizing only the main gateway is insufficient.
- [Source capture](../../../src/rendering/standoff-editor-view.tsx#L663) already protects superposition source text from DOM reconciliation. Symbolic selective rendering needs the same guarantee through a shared contract; otherwise [composition reconciliation](../../../src/input/gateway.ts#L728) may mistake materialised text for an authored edit.

### Offset-stability addendum: six findings

**1. Distinguishing hidden source and materialisation: possible, but not automatic in the current implementation.** The active equivalent of the text matrix is the canonical `inlineContent` sequence. The renderer normally has one direct flow child per source cell. `pointBoundary` first uses `data-inline-index` and has a special case for `data-superposition-end`, but its other branches count `textContent` or `Range.toString()` code points. CSS `display: none` and `contenteditable=false` do not exclude text from those strings. Ordinary `captureText` reads each flow child's `textContent`; only existing superposition ranges explicitly substitute canonical source instead.

A two-span host therefore cannot safely be inserted without adapting these paths. The smallest change is an opt-in presentation owner for the source interval. Its source-capture branch returns the original canonical cells exactly once and excludes materialised descendants. Its DOM-point branch identifies the enclosing atom **before** inspecting descendant text or nested `data-inline-index` values. Existing definitions without the contract continue down their current paths. Outside the atom, genuine browser edits still need capture and reconciliation; returning canonical text for the entire paragraph would incorrectly discard those edits.

**Executed diagnostic.** A read-only Node/jsdom probe evaluated the actual `pointBoundary` function extracted from the current renderer, with one outer host per source cell. The first host contained a hidden `L` source span and a separate non-editable `L. Carroll` span; the remaining twelve source hosts were hidden. The complete source was `Lewis Carroll wrote Alice.`. Unadapted per-child `textContent` capture produced **36 characters rather than the canonical 26**, counting the ten materialised characters in addition to the source. A synthetic DOM point at the materialisation's end mapped to **10 rather than source boundary 13**. The downstream `Alice` cell still mapped to source boundary **20**. This verifies the specific duplication and endpoint hazards; it does not simulate native browser caret movement or layout.

**2. Atomic caret and selection: supported by the proposed boundary contract, not yet guaranteed by the existing editor.** For the symbolic source range `0..12`, permitted ordinary caret positions are `0` and `13`; there is no caret-to-character mapping inside `L. Carroll`. The registered range contract must normalize pointer endpoints, keyboard/word/vertical movement, reverse/shift selections, selection restoration, cross-block and multiple selections. A selected interval intersecting the atom expands to its full source interval. Boundary affinity determines insertion before or after it.

Current `restoreBoundary`, `inlineBoundary`, and `inlinePointAt` can still target hidden interior children or choose `start + 1`, as documented above. `contenteditable=false` alone cannot govern the editor's own computed selections or source-grapheme deletion. The smallest adaptation is the shared operation/boundary resolver, invoked by existing mount and input routes, rather than a new selection model. Keep its indexes session-local and keyed to the source range; never persist display-character offsets.

**3. Subsequent annotations: logical offsets remain stable; pixel positions must follow reflow.** With no source edit, these source ranges are invariant:

| Attribute presentation | Symbolic source range, inclusive | `Alice` source range, inclusive | Layout consequence |
|---|---|---|---|
| `Lewis Carroll` | `0..12` | `20..24` | Original layout |
| `L. Carroll` | `0..12` | `20..24` | Following text moves with the shorter rendered run |
| `Charles Lutwidge Dodgson` | `0..12` | `20..24` | Following text moves or wraps with the longer rendered run |

Never apply a length delta of `-3` or `+10` to any authored annotation for these value changes. Downstream hosts retain their source indexes, and normal DOM flow supplies their new physical positions. A downstream SVG annotation should measure those same source hosts at their **new** positions. Correct visual positioning does not mean retaining its old `x/y`.

There are two concrete limitations. First, `rangeFragments` uses `firstChild` endpoints. With a hidden-source child followed by a visible materialisation, a full symbolic range—especially a single-cell source range—may measure the hidden child rather than the visible materialisation. The geometry adapter must explicitly return the atom's visible fragments for whole-atom coverage, and normal source fragments outside it. Second, the [retained range cache](../../../src/runtime/measurements.ts#L59) is stamped by mount generation, supplied revision, container width and scale. A same-length attribute replacement can change glyph widths while leaving **all those stamps and even paragraph height unchanged**. A `ResizeObserver` or source revision dependency is therefore insufficient. Explicitly call the existing occurrence-local geometry invalidation on changed materialisation, release affected caret geometry, and schedule the affected layout consumers. A transient presentation epoch is also possible; it is a cache-validity token, not another coordinate system or a Document revision.

Use shared measured fragments and previous/current comparisons, preserving read-before-write frame batching. Invalidate reflow dependencies only where their local geometry actually changes; a translated later block can retain local SVG coordinates. Do not compensate for changed layout by rewriting source offsets, forcing a whole-document measurement pass, or storing pixel positions in annotations. Native wrapping and visual SVG alignment remain browser-prototype questions; the existing superposition tests mock rectangle measurements.

**4. Ordinary edits before/after the region: the current source mapper is suitable.** [mapStandoffPropertiesForReplacement](../../../src/interchange/ranges.ts#L30) uses source cell counts, not visible strings. Insertion at a range's start shifts the entire range; insertion at `end + 1` leaves that range unchanged. Insertion strictly inside a range expands it, so the interaction contract must prevent accidental interior insertion in atomic mode. The existing edge policy already implements outside insertion; the adaptation must deliver the correct boundary rather than change this legacy policy.

A read-only probe executed that existing mapper against the symbolic `0..12` and downstream bold `20..24` properties. Results were:

| Authored operation, starting from the original source | Symbolic range after edit | Downstream range after edit |
|---|---|---|
| Insert `Sir ` at source boundary `0` | `4..16` | `24..28` |
| Insert two source cells at boundary `13` | `0..12` | `22..26` |
| Delete source interval `[14,20)` (`wrote `) | `0..12` | `14..18` |
| Append one source cell at boundary `26` | `0..12` | `20..24` |

The input annotation objects were unchanged by this pure planning call. Committed edits use the [existing inline command and annotation mapping](../../../src/block-tree/commands.ts#L929), with validation, Undo/Redo and dirty tracking. Selection must first be normalized to source boundaries, including deletion crossing an atom. These tests verify ordinary source rebasing, not an implemented symbolic interaction handler. Attribute-only changes must never call this mapper or text replacement command at all.

**5. Partially overlapping properties: preserve source semantics and suppress misleading projected interiors.** Keep every property's original range and metadata while switching materialisation. A property covering the whole symbolic range may style or decorate the entire displayed atom. A property covering only `Carroll`, for example, must not be mapped to arbitrary letters of `L. Carroll`. If a property starts inside the hidden source and extends beyond it, render its supported effect on the visible source portion outside the atom and suppress the inside portion. These are ephemeral rendering fragments, not newly persisted split annotations. Revealing source restores its original full rendering. Resolve semantic activation conflicts separately from formatting; preserve inspection access to the hidden-source annotations. Apply the same rule to SVG highlights and previews so an effect touching only the first source cell does not accidentally claim the entire atom.

**6. Native browser operations: require explicit handling.** Native selection does not provide a universal source-coordinate contract across hidden content, non-editable descendants and nested DOM. Normalize before committing operations and on restoration, while avoiding disruption of active composition. For copy, use source-based selection to produce two intentional representations: native source plus references, and materialised external text/HTML. Do not rely on `Selection.toString()` or hidden DOM text for this distinction. Cut uses the same source interval and deletes only after a successful clipboard write; paste replaces a normalized source interval through the current insertion machinery.

During composition, keep the active host stable, defer attribute-driven DOM replacement, and reconcile browser changes only outside protected source intervals. Current [composition handling](../../../src/input/gateway.ts#L312) and [reconciliation](../../../src/input/gateway.ts#L728) depend on the mount's source capture and boundary mapping. A text-only diff cannot independently distinguish an atom's display text from committed authored input. Autocorrect/replacement input and drop paths likewise cannot be allowed to bypass the contract merely because they are not ordinary `insertText`. Route supported operations through the same normalization or reject an unsupported atom-intersecting operation locally and restore the canonical presentation. Do not silently literalise the displayed value. Representative browser validation should cover actual composition, selection and clipboard paths; jsdom is insufficient to certify their native behaviour.

**Smallest viable adaptation.** Keep one source-indexed outer host per canonical cell, place hidden source and the separate materialisation inside the atom's first host, and hide remaining source hosts without changing their canonical identities. Add an opt-in range presentation adapter for source capture, boundary/operation routing and visible fragments; explicitly invalidate existing geometry on materialisation changes. Reuse canonical edits and existing SVG layers. Do not add a second persistent text matrix, a display-offset annotation store, per-attribute Document transactions, or downstream-offset translation. This is a bounded extension of the proposed contracts; it remains unimplemented.

### Recommended initial behaviour, subject to product decisions

| Operation | Proposed policy |
|---|---|
| Arrow movement | Jump between the two source boundaries; normalize word/vertical movement that lands inside |
| Shift selection or dragging | Include the entire atomic interval when intersected; preserve direction |
| Click | Select the reference; boundary hit testing still supports placement immediately before/after |
| Double-click / explicit activation | Open the Entity attribute inspector |
| Backspace after / Delete before | Select the atom first; a subsequent delete removes source and reference in one undoable edit |
| Replace or cut an already selected atom | Operate on the entire source range and remove its symbolic reference |
| Insert at a boundary | Insert outside the atom; explicit affinity must prevent inadvertent expansion of its source range |
| Unwrap | Remove only the symbolic property; reveal original text and existing annotations |
| Convert to Literal | Capture the currently displayed resolved value, replace source, and remove the reference in one canonical edit |

These deletion/click choices are recommendations, not existing behaviour. Alternative single-action whole-atom deletion is feasible; choose before implementing. For unavailable targets, recommend retaining atomic interaction around the visible fallback until Unwrap or an explicit source-edit mode is chosen, avoiding silent edits to hidden semantics. Disabling the feature restores source presentation and legacy handling while retaining data; re-enable must revalidate ranges and conflicts.

Convert to Literal is an explicit authored edit: the ordinary annotation remapping policy applies, and partially intersecting annotations may change or disappear. Do not imply that the preservation guarantee for presentation-only changes also covers this destructive operation. Undo must restore the original source and properties. Full-range formatting should survive conversion where the canonical mapping supports it; test the agreed result.

### Annotation composition

**Recommendation.** Fully covering formatting may apply to the entire materialisation. Partially intersecting properties remain attached to the underlying source, without arbitrary projection onto characters of the attribute value. Preserve their data and expose them in source/annotation inspection; suppress the misleading part of their visual effect inside the atom. A semantic link or Entity annotation should not automatically override the symbolic reference's activation action merely because it covers the range.

Existing `classesAt(start)` reuse is insufficient for this rule: a property covering only the first source character could otherwise style the entire materialisation. Compute eligible covering properties for the range. SVG fragments must similarly resolve full-range coverage to the materialised box, retaining any unaffected fragments outside it.

Reject nested or intersecting symbolic references initially, while permitting adjacent ranges. Apply the same conflict rule to overlap with another layout-replacing feature such as active superposition, concealed-source behaviour, or character surfaces. On malformed import, preserve the annotations and render source for the conflicting component with a diagnostic; do not silently choose an arbitrary winner. Ordinary overlapping bold/italic/semantic annotations remain supported.

### Geometry, views, and lifecycle

**Finding.** The renderer has frame scheduling, a per-measurement fragment cache, visibility gating, and cleanup: [measurement](../../../src/rendering/standoff-editor-view.tsx#L456), [scheduling](../../../src/rendering/standoff-editor-view.tsx#L575). This is not evidence of a complete retained shared cell-geometry cache. Current pointer hit testing still independently reads rectangles.

**Recommendation.** Reuse valid geometry across hit testing, caret placement, selection and SVG consumers. Cache per mounted occurrence, with explicit validity for source edits, changed materialisation, wrapping, fonts, resize, scale/transforms, and remount. Measure invalidated regions and reflow dependencies in a frame, read layout before writes, compare previous/current results, and release removed elements. Scrolling should move annotation-container-relative SVG natively; do not build fixed highlight DIVs. Use `editor.decorations` / `editor.temporaryRanges` for transient focus and preview highlights.

The inspected renderer gates work by visibility but does not establish a full virtualized text-document implementation. Regardless of later virtualization, resolution cannot depend on the source DOM being mounted. Share values independently of mounts, attach geometry and interaction state per occurrence, cancel stale work on disposal, and hydrate new mounts from the current cache. A reference can have multiple mounted occurrences with different geometry and presentation context.

## 4. Recommended data model and alternatives

**Updated storage direction.** Add a canonical `EntitySymbolicAttribute` record in the same Cavern database. The name follows existing singular PascalCase table names; columns below follow existing lower-camel-case conventions. See the [roadmap](FEATURE_ROADMAP.md#1-accepted-direction-dedicated-attribute-storage) for the full field and lifecycle assessment:

```text
id                    internal integer primary key
guid                  UUID, unique and immutable
entityGuid            owning Entity UUID, immutable initially
key                   user-editable attribute name, not a reference identifier
valueType             initially "string"
value                 string initially; typed representation versioned later
revision              optimistic concurrency token
deletedUtc            nullable retirement/soft-deletion timestamp
created/modified      existing actor and timestamp conventions
```

Index by `entityGuid` for Cardex. Reference `guid` for resolution. Keys must be unique within an Entity at the database level; Values need not be unique, and no predefined user Key vocabulary is required. The roadmap recommends NFKC/trim/locale-independent lowercase normalization, a unique owner/normalized-Key constraint including retired records, and explicit collision handling. Reserve `canonical-name` for the virtual attribute. These constraints are specified, not yet implemented. Initially limit user-defined materialised values to bounded, non-empty single-line strings, with a stated validation error for unsupported values. Empty/multiline support is an explicit later decision, not an accidental blank rendering or a missing-value truthiness check.

**Canonical-name resolution:** the later authoring requirements make a virtual attribute mandatory for default `@` insertion. Recommend an immutable UUID-v4 `Entity.canonicalNameAttributeGuid`, whose resolved Value is always `Entity.name`, with Entity revision/lifecycle. Provision and preserve this identity explicitly; do not duplicate the name in `EntitySymbolicAttribute`. A shared resolver looks up virtual and user-defined attribute UUIDs through indexed, unambiguous paths. Cardex Entity rename updates materialisation without rewriting source. See the [virtual-attribute assessment](FEATURE_ROADMAP.md#virtual-canonical-name-attribute) for migration, collision, package and alternative-identity implications.

Use expected revisions, operation IDs, and the canonical ledger/outbox. Add the new record to migration, canonical-table, archive/package and restore validation paths. Existing package extraction has an explicit [table list](../../../src/knowledge-sqlite/package-data.mjs#L1); a new SQLite table is not automatically portable.

Suggested authored reference:

```json
{
  "id": "occurrence-uuid",
  "type": "mutable/symbolic-reference",
  "start": 9,
  "end": 21,
  "value": "attribute-uuid",
  "metadata": {
    "symbolic": { "version": 1, "format": "default" }
  }
}
```

Here `9..21` is a 13-cell inclusive range. These IDs illustrate field roles; production IDs must satisfy the UUID validators. The owner can be obtained from the attribute rather than copied into every reference. If owner information is cached for UI or indexing, treat the record's owner as authoritative. Cavern identity comes from the opened resource/service context and must be represented explicitly in portable interchange provenance.

Keep current resolution status, fetched value, errors, request generations, and effective capabilities outside authored metadata. A new Value or Key must not rewrite Documents or mark their tabs dirty. Entity rename and attribute-Key rename preserve the target GUID. Recommend fallback when an attribute is retired or its owner soft-deleted; restoration reuses the same GUID. Hard purge must not cascade into source Documents, and reference discovery must disclose coverage limits.

Initially support only `format: default`. A later allowlisted formatter registry may add case conversion or locale-aware typed formatting. Attribute value and occurrence presentation remain separate. No executable expressions.

| Alternative | Benefit | Material drawback / conclusion |
|---|---|---|
| UUID entries within `Entity.attributes` | Avoids an initial table; existing aggregate update path | Must invent nested identity/lookup/indexing and contend on the whole Entity revision. Acceptable fixture shortcut, weaker production model |
| Claim or ClaimParticipant | Reuses assertion identity, provenance and evidence | Adds assertion-selection and ownership semantics to a mutable value slot. Use for evidence-backed assertions later, not simple attribute storage |
| EntityAlias | Existing UUID-addressed names | Origin, uniqueness and lifecycle semantics are alias-specific; not arbitrary dates, versions, or values |
| Superposition-owned alternative Block | Existing replacement renderer | Duplicates Entity-owned data and changes the document graph; reuse presentation concepts only |
| Virtual attribute for `Entity.name` | Avoids duplicate canonical-name truth; required for default `@` | Use one stable UUID identity on Entity and resolve its existing name; implement in the later storage/authoring phase, without enlarging the rendering fixture |

For the example, prototype `Pen name` independently. Do not silently duplicate `Entity.name` into a separately editable “Canonical name” attribute and allow the two to diverge.

## 5. Persistence, interoperability, indexing and immutability

### Copy, export and import

**Findings.** Native JSON and portable clipboard fragments are different paths. [Selection serialization](../../../src/interchange/serializer.ts#L25) recognises Entity, Block and URL targets specifically. [Fragment materialisation](../../../src/interchange/materialize.ts#L39) uses supported-property and scoped-target checks; unknown properties become inert opaque data. A new type will not automatically paste back as an active symbolic reference. [Semantic export](../../../src/interchange/export-plan.ts#L24) emits authored tokens and supported marks, not arbitrary DOM materialisations. The clipboard method named `copyProjectionEvent` is an explicit projection-copy intent mechanism, not automatic superposition copying: [clipboard service](../../../src/runtime/mutable-clipboard.ts#L134).

**Recommendation.** Use one pure materialisation traversal with a supplied resolution snapshot for external text/HTML/Markdown output. It substitutes whole intervals, with source fallback, and never edits the canonical model. This traversal should also serve ordinary external clipboard representations. Readable output must not depend on an offscreen DOM or browser hidden-text copying behaviour.

| Path | Required result |
|---|---|
| Manual native save/reload | Original text, source offsets, attribute UUID, formatting metadata; no cached presentation state |
| Native copy/paste within the same Cavern | Source plus active symbolic target; new occurrence identities, same attribute UUID |
| External clipboard | Materialised plain/HTML text where resolved; fallback otherwise |
| Plain text / HTML / Markdown export | Consistent resolved snapshot plus fallback; no live database dependency in ordinary external output |
| HTML/Markdown import | Ordinary authored text unless a supported native envelope supplies references |
| Foreign-Cavern paste or missing provenance | Readable fallback and inert retained target metadata; no accidental rebinding by bare UUID |
| Native package export/import | Preserve reference metadata; explicitly include attribute records when packaging semantic dependencies, or report unresolved dependencies |

Native and external clipboard representations can intentionally differ: native preserves source, external contains the reading the user copied. Normalize partial selections to whole atoms before producing either. Synchronous copy should use the current resolved cache or fallback, not start a network request. An explicit export may bulk-resolve a bounded set first and freeze that result for consistency.

### Resolution and open Documents

**Recommendation.** On admission/open, collect distinct attribute IDs from applicable annotations, then resolve in bounded batches. Cache by Cavern identity plus attribute GUID, sharing in-flight work and values across references and open Documents. Use per-record revisions, bounded response sizes, cancellation, stale-result generations, and explicit unavailable/retired/invalid states. Unknown type or format uses fallback with diagnostics. Failed requests must not leave a perpetually blank region or be retried on each keystroke.

Reload or explicit refresh is enough for the first feature increment. Later Cardex change notifications should invalidate only the changed attributes and their consumers; changed width invalidates local layout/reflow, not all open Documents. Defer presentation replacement during IME. Do not subscribe resolution to aggregate document revision or save status.

### Find All References, search and RAG

**Finding.** Existing Cardex Mentions queries are explicitly restricted to `codex/entity-reference`: [query eligibility and pagination](../../../src/knowledge-sqlite/cardex-query.mjs#L2). Generic saved standoff rows retain enough raw data to inspect symbolic references, but the current mention service does not expose them. [Live facts](../../../src/knowledge/facts-annotations.ts#L23) also only promote Entity/Block references into mentions.

**Recommendation.** Reuse the saved `StandoffProperty` projection and navigation infrastructure. For the prototype, query by new type and scalar `value`. For production, add a targeted composite/partial index on symbolic type/attribute value plus resource/logical occurrence, or a projected `targetAttributeGuid` column if typed target columns become the established convention. A second authoritative reference table is unnecessary. Keep broken targets discoverable: do not require an inner join to an existing active attribute to return their occurrences.

Merge saved references with an in-memory overlay of open unsaved Documents, replacing saved rows for those resources and deduplicating by resource/block/property identity. Fetch current ranges when navigating, validate resource identity and saved coverage, and distinguish saved-index results from live ones. Reuse the Entity watcher principle: [document Entity changes](../../../src/application/document-entity-changes.ts#L46) excludes automatic offset rebasing from inventory invalidation. Only add/remove/retarget/lifecycle changes should refresh attribute reference inventories.

Current [native text search](../../../src/runtime/text-search.ts#L62) and [saved search projection](../../../src/knowledge-sqlite/saved-projection.ts#L152) operate on canonical source text. This inspection does not establish a separate materialisation-aware RAG contract. Recommend retaining source indexing initially and labelling source matches. A later optional derived index can search materialised values too, mapping a hit to the **whole source range**, with attribute revision provenance. Do not rewrite authored search text or re-embed every referencing Document synchronously when an attribute changes. Any RAG export must state whether it used source or resolved presentation and record the resolution snapshot if historical reproducibility matters.

### Dialectic

**Finding.** In this checkout Dialectic is present as a [desktop application entry without an implementation command](../../../src/application/desktop-applications.tsx#L24). Inspection did not locate an implemented contribution immutability contract. Compatibility with an existing enforcement mechanism therefore cannot be certified from this code.

**Recommendation.** Immutable bytes do not guarantee immutable apparent meaning. Default historical/immutable contributions to source presentation until their product contract is defined. An alternative is an explicit publication-time frozen materialisation recorded with the contribution. Dynamic materialisation should require an explicit policy and visible provenance; do not infer it from the continued presence of fallback text. Do not introduce temporal Claim resolution for this feature.

## 6. Performance qualification

**Findings.** There is a bounded native inline path, but generic transactions are not automatically cheap. [Command transactions](../../../src/block-tree/commands.ts#L270) distinguish a bounded structural draft from `transaction`, whose setup takes a repository snapshot. The [inline planner](../../../src/block-tree/commands.ts#L901) also changes behaviour when wrapped in a generic transaction. Copying superposition's transaction calls into routine input handling would therefore be a material risk.

**Required design constraints.** Capability lookup and rendering changes must not invoke repository-wide planning, validation, snapshots, document change publication, Vault discovery or indexing. Committed text/annotation edits still use canonical validation, history and dirty tracking, with work bounded to affected records and dependencies. For combined operations such as Convert to Literal, choose a demonstrated bounded assembly path and verify it; do not assume a transaction label proves bounded work.

Use a content-local range index and occurrence-local presentation state. A range edit may require updating the affected TextBlock's intervals; that does not justify inspecting unrelated blocks, files or views. Cache values independently of offsets. Resolve capability point/intersection queries without geometry reads. Separate semantic-reference membership changes from source offset shifts.

The current direct renderer already iterates the affected paragraph's presentation. Do not multiply that work by the number of symbolic ranges through repeated linear searches when building presentation runs. Maintain or derive sorted non-overlapping ranges once per relevant change. Zero opted-in ranges should preserve the old path with negligible overhead.

**Existing checks executed for this investigation:**

```text
npx vitest run src/runtime/text-superposition.test.tsx \
  src/rendering/direct-character-cells.test.tsx \
  src/application/document-entity-changes.test.ts \
  src/interchange/clipboard.test.ts
4 files, 42 tests passed

npx vitest run src/block-tree/inline-performance.test.ts
1 file, 14 tests passed
```

The 56 passing tests establish useful baseline behaviour: replacement rendering, stable character DOM, existing clipboard semantics, reference-change filtering, and bounded inline editing including Undo/Redo. They do **not** validate a symbolic feature or native browser atomic selection. No new feature code or tests were added, and no Flint before/after timing is claimed for this investigation.

**Addendum verification, 15 November 2026.** Re-ran the existing inline-performance, text-superposition and direct-character-cell suites together with `src/rendering/cross-block-selection.test.tsx`: **4 files, 56 tests passed**. This batch overlaps the earlier baseline; it is not 56 additional distinct tests. The read-only diagnostics described in section 3 executed the existing offset mapper and extracted DOM-point function without changing application code. They establish source-edge rebasing and expose unadapted hidden-source/materialisation mapping failures. No new persistent tests or feature implementation were added. Real browser geometry, native atomic selection, clipboard materialisation and symbolic IME remain prototype validation items.

## 7. Smallest useful prototype

**Proposed only.** Build an isolated fixture using the real editor and input gateway, a disposable one-Entity/one-attribute store, and a range with different source and display lengths. Reuse the superposition demo/test structure, without modifying its existing default or requiring its feature flag.

The character-cell investigation adds no authority migration to this plan. Test one derived source-range/presentation descriptor across source capture, interaction boundaries and geometry, using existing renderer abstractions. Generated display text must not create canonical cells or persistent character identities; it need not be split into per-character presentation objects. Include two mounted occurrences with distinct presentation state over the same canonical cells.

Add a separate `symbolicEntityAttributes` feature flag when implementation is authorised, enabled by default under the repository convention. Feature-off preserves reference data and readable source. Existing defaults, including `textSuperposition: false`, remain unchanged: [configuration](../../../src/configuration.ts#L243).

Sequence the experiment to answer the hard question before building full Cardex CRUD:

1. Register one opt-in property contract and a shared operation resolver. Use existing interval-index infrastructure where possible; retain a no-contract fast path.
2. Begin with hidden source and a separate non-editable materialisation within the existing cell-host structure. Exercise shorter, longer and same-length/different-width values. Assert that source text, **all** annotation offsets (including a downstream annotation), canonical inline revision, Document history and dirty state remain unchanged on attribute updates. Compare the superposition DOM strategy only if needed, using the same fixture and handlers. Any full captures used to assert invariants belong to test setup/assertion, never the input path.
3. Route arrows, shift selection, pointer hit testing, delete, selection replacement, paste and IME through the contract. Include start/end-of-block, adjacent atoms, Unicode, and two mounted occurrences. Keep cases focused on distinct pathways, not exhaustive permutations.
4. Modify the fixture attribute and reload; verify the new materialisation. Retire it and simulate unavailable lookup; verify readable source and preserved metadata. Confirm rename keeps identity.
5. Save/reload native JSON; exercise Unwrap, Convert to Literal and their Undo/Redo. Verify external copy versus same-Cavern native paste. Include one foreign-scope fallback case.
6. Add a small representative compatibility set: legacy bold, legacy Entity reference, and overlap of those with the opted-in range. Verify no-contract behaviour and omitted-capability delegation. Add one invalid overlap/unsupported-version case.
7. Instrument bounded work: ordinary typing beside the range, caret movement, source-mode changes, and resolver completion must not scan unrelated Documents, take full snapshots, rebuild reference inventories, fetch repeatedly, or dirty Documents from presentation alone. For a committed edit, assert only the affected records/dependencies are inspected. Repeat with unrelated document size increased and confirm the counters remain bounded.
8. Measure the real Flint browser typing benchmark before/after for flag-on/no-ranges and a representative opted-in paragraph. Inspect input responsiveness and actual browser selection/IME; headless frame timing is supplementary. Verify downstream annotation geometry after materialisation changes, including unchanged container dimensions, and one partial-overlap case. Verify font/width changes, Textual scaling, scrolling and disposal without stale geometry.

**Go/no-go criterion.** Proceed only if the contract yields consistent boundaries across real input paths, no presentation value leaks into canonical source, native data round trips, and unrelated work remains bounded. If preserving hidden source DOM provides no measurable simplification, retain canonical source and use the simpler selective rendering strategy. If broad input changes are required, qualify that scope before extending production UI.

## 8. Relative estimate, risks and open decisions

| Workstream | Relative complexity | Main risk |
|---|---|---|
| UUID attribute model, migration and scoped CRUD | Medium | Audit, archive/restore and optimistic concurrency omissions |
| Cardex Attributes section and navigation | Medium | Unsaved state, retirement UX and partial reference coverage |
| Reference storage and native round trip | Low–medium | Coordinate conventions and unsupported metadata |
| Selective rendering plus range contracts | High | DOM boundaries, all input routes, overlapping presentation ownership |
| Geometry and multiple presentations | Medium–high | Reflow, stale caches, nested hit targets and IME disruption |
| Clipboard, semantic export and package support | Medium–high | Source/display mismatch and cross-Cavern target handling |
| Bulk resolver and indexed references | Medium | Overbroad invalidation and incomplete saved/live coverage |
| Immutable contribution integration | Undetermined | No implemented Dialectic enforcement contract found |

Overall this is a medium-to-large cross-cutting editor feature, despite the small standoff payload. The isolated prototype is substantially smaller than the full feature and should establish the input/geometry effort before calendar estimates. Advanced formatting, live broadcasts, temporal resolution, RAG materialisation, and application-wide contract unification are excluded from the initial estimate.

The following decisions remain before implementation; they do not prevent this report:

1. The dedicated `EntitySymbolicAttribute` direction is now favoured by the storage addendum. Settle Key normalization and lifecycle uniqueness before its production migration; embedded fixture data does not alter that direction.
2. Confirm first-delete-selects versus immediate whole-atom deletion, and click versus double-click activation. Recommendation: the explicit policies in section 3.
3. Confirm unavailable/retired fallback interaction and any source-edit mode. Recommendation: fallback remains atomic while the contract is active; Unwrap explicitly removes it.
4. Confirm rejection of overlapping replacement owners, including superposition/concealment conflicts. Recommendation: source fallback for invalid imported conflicts, with authored data retained.
5. Confirm the initial value constraints and `default` formatting only. Empty or multiline values need deliberate layout/interaction rules.
6. Decide whether copying native fragments should preserve live references by default; recommendation: yes within verified same-Cavern scope, with materialised external representations.
7. Define immutable-contribution presentation when Dialectic is implemented. Recommendation: source-only initially or explicit frozen publication, never silent dynamic historical presentation.
8. Canonical-name binding is now required for the later `@` authoring phase; confirm the recommended virtual identity mechanism. Materialised search remains deferred. Neither expands the initial rendering fixture.

The later `@:`/inline-creation workflow has remaining context and keyboard decisions recorded in the [roadmap](FEATURE_ROADMAP.md#5-roadmap-and-implementation-gates). Its [Undo Option A policy is settled](FEATURE_ROADMAP.md#settled--undo-option-a-accepted): Document history never reverses independent attribute changes. Redo uses the same UUID and captured fallback under existing history rules; a retired/unavailable target preserves its reference and displays source fallback. Attribute-created/insertion-failed recovery remains required. These authoring-phase requirements do not expand or block the rendering prototype.

The core invariant is unchanged: **source text is durable authored content; materialisation is derived presentation.** Optional contracts make the relationship explicit without changing existing standoff definitions that do not opt in.
