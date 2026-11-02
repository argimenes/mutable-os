# Gloss Mode — investigation and implementation plan

**2 November 2026 · Planning only. No feature code changed.**

## Recommendation and confirmed behaviour

Use **Document-owned linked annotation definitions** for Gloss records and existing native standoff segments for their anchors. Add a small authoring textbox and Document-local presentation/indexing services. Keep all Gloss data in native Document serialization; no Entity, Claim, Relationship or new SQL tables are required.

The foundation exists, but the feature is not just a new annotation renderer. Essential work includes bounded atomic definition/anchor edits, occurrence-scoped presentation, lossless clipboard/package handling, and a shared range-geometry interface. Cross-Document borrowed Blocks present an additional ownership problem described below.

The following decisions are settled:

- The compact textbox opens **below the highlighted text**, captures the Gloss input, and receives focus immediately.
- The **first literal colon** separates type from text; all subsequent colons belong to the text. Existing types autocomplete; unfamiliar prefixes create new types without confirmation. No colon means an untyped note. This supersedes heuristic colon detection in the original brief.
- Enter commits; Shift-Enter inserts a newline. Escape and a visible, accessible Close/Cancel button discard the draft and restore focus to the anchor. Cancelling an edit preserves the existing Gloss.
- Deleting anchored text retains the Gloss and its links, shown as **“anchor removed.”**
- A Gloss appears at every occurrence of its shared Block within its Document and remains Document-local.
- Gloss creation is independent of Gloss Mode. Mode switching is presentation/session work, not a content edit.

Introduce `glossMode: true` in [configuration.ts](src/configuration.ts), covering authoring and presentation. Disabling the feature must preserve stored data and native round trips. Global promotion, AI execution, rich nested editors and cross-Document Gloss graphs remain deferred. `for-ai` is ordinary text.

## 1. Repository findings and reuse map

| Concern | Actual source/API | Reuse and incompatibility |
|---|---|---|
| Annotation authoring | [RangeAnnotations.apply](src/runtime/range-annotations.ts), [TreeCommands.setPayloadField / editStandoffProperty](src/block-tree/commands.ts), [InitialisController.apply](src/features/initialis/controller.ts) | Initialis demonstrates a bounded single-Block standoff write. `RangeAnnotations` is currently wired to `commands.transaction()` in [ReactiveEditor](src/reactive-editor/editor.ts), so it must not be adopted blindly for Gloss commits. |
| Shared definition and segments | [LinkedAnnotations.createBatch / edit / segments](src/runtime/linked-annotations.ts), [linkedRegistry / linkedDefinitionOwner / resolveLinkedProperty](src/block-tree/linked-annotations.ts) | Definitions reside in the owning Document's `payload.linkedAnnotations`; segments reference `annotationId`. `segments()` enumerates repository contents, and `edit()` uses a general transaction. Reuse the format and resolution rules, not these expensive lookup/edit paths. |
| Selection and words | [TextRanges.snapshot / validate](src/runtime/text-ranges.ts), [wordSelection](src/input/word-selection.ts), [MountRegistry](src/runtime/mounts.ts) | Versioned, half-open selection snapshots and occurrence-local capture/restore exist. Native standoff properties use **inclusive Cell ends**. `wordSelection()` can choose nearby punctuation/words, so require that its result actually contains the caret; do not silently select a distant word at whitespace. |
| Toolbar and commands | [DocumentStyleBar](src/rendering/document-style-bar.tsx), [AnnotationContributions](src/runtime/annotation-contributions.ts), [CommandRegistry](src/block-tree/registry.ts) | Toolbar capture/restore and `ownSelectionToolbar` already protect selection. Keyboard, toolbar and Command Bar should invoke one `gloss.create` operation. |
| Command Bar | [autocomplete integration](src/features/autocomplete/index.tsx), [Tab command candidates](src/runtime/tab-commands.ts) | Existing slash-query dispatch and canonical command execution are reusable. Registering a command alone does not automatically add its slash syntax. The source selection must be captured before slash composition consumes it. |
| Rendering and geometry | [StandoffEditorView](src/rendering/standoff-editor-view.tsx), [EffectContributions](src/runtime/effect-contributions.ts), [MeasurementService](src/runtime/measurements.ts) | Effect callbacks receive measured range fragments for passive SVG output. `StandoffEditorView.measure()` caches identical ranges **within one measurement pass**. This is not yet a persistent shared geometry cache for margin cards. |
| Range events | [AnnotationRangeEvents](src/runtime/annotation-range-events.ts) | Occurrence-local interval queries support caret enter/leave without DOM measurement. They are not a complete mutation inventory or geometry invalidation API. |
| Document hosting/layout | [ContainerBlockView](src/rendering/container-block-view.tsx), [registerCoreViews](src/rendering/register-core-views.ts), [RetainedDocumentHost](src/rendering/retained-document-view.tsx), [DocumentSessionContext](src/rendering/document-session-context.ts) | Keep the mounted editor and retained session. A new presentation wrapper/slot is needed; there is no existing Gloss Mode API to call. Existing caret modes are a different concern. |
| Margins and Instruments | [DocumentMarginContext](src/rendering/document-margins.ts), [core views](src/rendering/core-block-views.tsx), [PanelContributions](src/runtime/panel-contributions.ts) | Existing margins represent owned margin Blocks, not range-anchored cards. Reuse layout/hosting conventions, but do not manufacture a margin Block per Gloss or assume the panel registry supplies fixed docking. |
| Canonical edits and projections | [CanonicalRepository.commit / subscribeChanges](src/block-tree/repository.ts), [structural admission](src/block-tree/structural-plan.ts), [projection updates](src/block-tree/projection.ts) | Bounded commit infrastructure exists. Current structural admission rejects arbitrary Document payload changes; current inline admission does not accept a Document registry update alongside a TextBlock write. A narrowly proven Gloss admission/update path is needed. |
| Persistence | [captureNative / nativeEnvelope / nativeText](src/persistence/native-resource.ts), [NativeDocumentSession](src/persistence/native-session.ts), [DocumentSessions.save](src/application/document-sessions.ts) | Native properties preserve authored data and retained definitions. Save remains manual. Dirty-state and membership handling need to recognise the new bounded change classification without rebuilding Document membership. |
| Export/paste | [serializeSelection](src/interchange/serializer.ts), [materializeFragment](src/interchange/materialize.ts), [packageFragment / materializePackage](src/interchange/package/native.ts) | Whole-package serialization already includes unused linked definitions. Materialization allocates new definition IDs and only activates allowed property types; `mutable/gloss` needs explicit safe admission and logical-ID/link handling. |

## 2. Native data and ownership

### Proposed representation

Use one fixed native annotation type, **`mutable/gloss`**. The author's `thesis`, `question`, `For AI`, etc. are data, not new schema registrations.

- **Definition:** `Document.payload.linkedAnnotations[definitionId]`, containing `id`, `type`, `value` (the exact textbox input), and `metadata.gloss`.
- **Gloss metadata:** `{ version: 1, localId, alias?, links }`. `localId` is a generated UUID, stable within the Document and independent of the native definition ID. `links` is a map from generated link ID to `{ toGlossId, type, note? }`; the source is the containing Gloss. This is the brief's logical edge model without a second authoritative register.
- **Anchor segment:** ordinary standoff property `{ id, type: 'mutable/gloss', annotationId, start, end }` on the TextBlock. Its original Cells and text remain unchanged.
- **Register:** a derived, reactive index over the Document's definitions and segments. No second repository, SQL query or separately persisted range inventory.
- **Type/text:** derive from `value` once when that Gloss changes. Keep raw input intact, including whitespace and subsequent colons. Preserve type spelling; use a separate case-folded/trimmed key for suggestions. An empty prefix has no type. Empty input and `question:` remain valid.

Storing raw input in `value`, not an annotation's `text` field, avoids confusion with source excerpts that the native serializer refreshes on Save. A record such as `claim: A: B` has type `claim` and body ` A: B`; no extra splitting or command interpretation occurs. There is no automatic “ordinary prose colon” exception under the confirmed rule.

### Small proposed saved example

Illustrative native `.ink` envelope using the current serialization shape. IDs are shortened for readability; generated production identities are not shown in the authoring UI. The proposed Gloss fields are new data, not an already implemented feature.

```json
{
  "format": "mutable-document",
  "version": 1,
  "resourceId": "doc-1",
  "valueEncoding": "codex-authored-value-v1",
  "definitionOwnerBlockIds": ["doc-1", "paragraph-1"],
  "document": {
    "format": "codex-portable-resource-gate",
    "version": 2,
    "resourceId": "doc-1",
    "root": {
      "placementId": "root-1", "kind": "owned",
      "target": {"kind": "local", "blockId": "doc-1"}
    },
    "blocks": [
      {
        "id": "doc-1", "type": "document-block",
        "properties": {
          "linkedAnnotations": {
            "definition-1": {
              "id": "definition-1", "type": "mutable/gloss",
              "value": "thesis: One range: several readings.",
              "metadata": {
                "gloss": {"version": 1, "localId": "gloss-1", "links": {}}
              }
            }
          }
        },
        "children": [{
          "placementId": "paragraph-placement-1", "kind": "owned",
          "target": {"kind": "local", "blockId": "paragraph-1"}
        }]
      },
      {
        "id": "paragraph-1", "type": "standoff-editor-block",
        "properties": {
          "standoffProperties": [{
            "id": "segment-1", "type": "mutable/gloss",
            "annotationId": "definition-1", "start": 0, "end": 7
          }]
        },
        "inline": [{"kind": "text", "text": "Standoff overlaps."}]
      }
    ]
  }
}
```

`start: 0, end: 7` anchors the eight Cells of “Standoff”. Removing those Cells removes the consumed segment through native range mapping; the definition, logical Gloss ID and links survive unchanged. “Anchor removed” is derived, not a second canonical write on each text edit.

### Ownership boundary requiring review

Repeated **local references to Document-owned content** can share the same segment and definition, with a separate presentation per occurrence. Filter by the enclosing Document resource; never infer ownership merely from whichever viewer is focused.

**A Block borrowed from another Document is different.** `linkedDefinitionOwner()` resolves canonical content ownership, and native capture excludes foreign reference targets. Writing a new property onto that Block can mutate the other Document. Hiding it in other viewers would not make the edit Document-local.

Recommended initial scope: Document-owned native TextBlocks, including their repeated occurrences, tables, tabs and containers. Do not claim support for local Gloss creation on foreign borrowed content until a Document-owned anchor overlay is designed and qualified using the existing range transformations. This is a proposed scope limitation needing approval, not a change to the agreed locality rule. No automatic copying or detachment of borrowed Blocks.

## 3. Authoring, history and anchor continuity

### Compact textbox

`gloss.create` captures the active occurrence, Document owner and `TextRangeSnapshot` before focus changes. For a collapsed caret, resolve the containing word from the touched TextBlock only. For an empty Block or whitespace without an eligible word, show a brief selection hint; do not invent a zero-width anchor.

Use a lightweight Document-scoped DOM/Solid overlay containing a plain textarea and Close/Cancel button. Position below the final highlighted line using shared range fragments; scroll the anchor into adequate view if necessary rather than opening above it. Keep a transient source highlight while the textarea owns focus. This is not a managed window or second standoff editor.

Retain the original range, direction, occurrence and scroll context. Validate them again on commit. If the source version changes in another viewer, retain the draft and explain that its anchor must be reselected; never guess a new target. On success/cancel restore the valid captured selection and focus. Dispose the overlay with its Document session and remove stale geometry subscriptions.

Textbox typing, suggestions, resizing and cancellation are session-local. Native textarea Undo/Redo edits the draft; after Enter, Document Undo/Redo operates on one canonical Gloss edit. IME composition must not commit on its confirmation Enter; Escape must respect an active IME candidate interaction. Outside clicks do not silently commit or discard the draft. A proposed Save integration commits a valid active draft through the same Enter operation before the existing manual Save; a stale draft prevents that implicit commit and remains visible.

### Shortcut

Recommend **Ctrl+; followed by G**, on both platforms, using `BindingRegistry` and editor scope. The current [binding catalog](src/input/binding-catalog.ts) already uses this prefix for Initialis and other authoring actions; no G continuation was found in the inspected registrations. User-customised bindings still need conflict checking at registration.

Avoid default Cmd-G/Ctrl-G because these are browser Find Next bindings. [Chrome's documented shortcuts](https://support.google.com/chrome/answer/157179?hl=en-G) confirm that conflict. This is a proposed binding, not a browser-tested guarantee. Provide the toolbar action and `/gloss` Command Bar entry from Stage A; source-selection handling must be qualified rather than allowing slash text to replace the selected passage. A later `/gloss link` may reuse Stage C's link action.

### Bounded canonical operations

Do not wrap authoring in `commands.transaction()`: its general draft takes a repository snapshot. `structuralTransaction()` avoids that draft, but its name does not guarantee final admission; Document registry changes currently fail the relevant structural proof.

Add a narrowly classified **Gloss definition/segment batch** to the existing canonical commit mechanism:

1. Validate the changed definition(s), link endpoints and eligible TextBlock segment(s), using the known Document owner and indexed membership. Preserve all unrelated payload fields, identities, Cells and graph edges.
2. Publish root registry and segment changes atomically, with inverses and annotation-origin information, as one history operation. Explicit Gloss deletion removes incident links in that same operation; merely losing an anchor does not delete anything in the registry.
3. Prove local admission from the actual changed records, including undo and redo, rather than trusting a command label. General repository fallback remains available for other operations. The Gloss command must not silently pass through a broad fallback if this proof fails.
4. Extend incremental projection and cheap dirty-state dispatch for that classification. Update matching payloads and affected annotation consumers without rebuilding child trees, replaying selections or recapturing Documents.

Root registry edits still copy a Document-owned record/map. Their cost can grow with that Document's Gloss inventory; this is not constant-time per Gloss. Keep those edits at commit boundaries, measure the cost, and do not place root-map copying on ordinary prose keystrokes. No broad history/projection refactor is proposed.

### Text and structure edits

Reuse [mapStandoffPropertiesForReplacement](src/interchange/ranges.ts): insertion inside a range expands it; insertion at its boundary stays outside; complete replacement consumes it. Existing [split/merge commands](src/block-tree/commands.ts) retain annotation data and adjust offsets. Splitting through a segment creates two segment IDs with the same `annotationId`.

Therefore “one anchor” initially means **one selected logical passage**, which may subsequently acquire multiple native segments through editing. It must not mean permanently one physical Block. Defer selection across multiple Blocks at creation unless the existing cross-text route can be admitted in the same bounded batch; never truncate such a selection silently.

Keep one register row per logical Gloss, deduplicating repeated occurrences and split fragments. Losing the last authored in-Document occurrence makes navigation unavailable while retaining the note. A hidden Tab, offscreen anchor or temporarily unmounted viewer is not an “anchor removed” event. Reordering preserves identity; moving content to another Document must leave the original Gloss local and must not create a cross-Document graph by accident. Native linked-definition move logic preserves provenance generally, so Gloss scope filtering and move tests are required.

## 4. Gloss Mode and Local References

Keep mode state per retained Document viewing session; toggling it does not mark content dirty. Add the layout around the existing editor subtree so toggling, resizing and transferring the host do not unmount editors. Reuse host activity and coordinate transforms for Flint tabs, detached Documents and live viewers.

Normal Mode supplies a subtle underline/marker with click-to-edit. Gloss Mode adds compact margin cards and a fixed Local References area with its own scroll container. At narrow widths, place cards beneath their source passages and put management into a usable compact section/drawer rather than forcing three columns. Coordinate with existing authored margin lanes rather than overlapping or replacing them. Do not change authored pagination to store this furniture.

Within the visible region, sort anchors by document position and stack cards at `max(anchorY, previousCardBottom + gap)`. Expanded cards invalidate only dependent downstream positions. Account for tall-note clusters crossing viewport boundaries so newly visible cards do not overlap prior cards. Retain measured heights and local stack summaries; collapsing/virtualising offscreen cards must not discard a focused draft. Connectors can be short, simple lines.

### Geometry work that is actually needed

Expose shared range fragments from the existing standoff renderer/measurement boundary, keyed by **occurrence, mount generation, range and layout validity**. The current pass-local fragment map and frame-local caret cache are useful but insufficient for cards, markers and popups to share retained measurements.

Refresh only invalidated visible ranges and reflow dependencies in animation-frame batches: read before writing. Invalidation must include text/annotation changes, wrapping, fonts, container resize, zoom/transforms, scroll coordinate changes, host transfers and unmount. Reuse relative geometry where scrolling permits it; do not remeasure unchanged Cell ranges for every consumer. Cover both direct-DOM and Solid Cell paths. This is a focused extension to existing measurement ownership, not a second text-layout engine.

### Unsaved register and graph projection

Maintain one session index per Document, initially seeded from that Document's owned definitions/content, then updated through `repository.subscribeChanges()` and affected membership. Track Gloss identity/content, segment membership, current ranges and occurrences separately. An offset rebase may update navigation/geometry, but must not reparse all notes, rebuild link counts or refilter every register row.

The Register supports text/type/alias filtering, position order and navigation using current ranges. Suggestions combine the starter list with live local type counts. The Structure view reads outgoing/incoming link indexes, preserves multiple parents, and renders repeated references and cycle/back-edge markers; it must not convert the graph into an authoritative tree. Relation labels remain open vocabulary. Select source, relation and searchable target without exposing IDs; provide edit/unlink. Reject exact duplicate edges rather than manufacturing duplicates on repeated confirmation.

`AnnotationRangeEvents` can highlight the active note; it does not replace this mutation index. Do not copy the repository-wide enumeration in `LinkedAnnotations.segments()`, or subscribe the panel to generic revision events that rebuild its contents on every keystroke.

## 5. Save, export and paste

Use the existing native envelope and manual save destination. New annotations mark only their owning Document dirty; mode, focus, filters and provisional input do not. Full native validation/serialization remains Save/export work.

Whole-package export already requests all linked definitions, including orphans. Package import currently remaps native definition IDs; keep **logical Gloss IDs** stable in `metadata.gloss.localId` within the newly imported Document namespace, and keep Gloss links addressed to those logical IDs. Rebind native segment `annotationId` through the existing definition map. Validate the complete local Gloss graph and explicitly allow the passive `mutable/gloss` property so it is not converted to an opaque annotation.

For clipboard paste, preserve native offset clipping/remapping. A separate copy into an existing Document needs fresh Gloss/link IDs when necessary, with one mapping applied to all copied references. Recommended semantics: copied passages create independent Gloss copies; copied links connect only copied endpoints. Omitted targets must not leave a live dangling edge or cause the rest of the graph to be imported silently. Preserve omitted-link information inertly and report it through existing interchange diagnostics. This clipboard policy needs review.

Full package round trips preserve all Glosses, including orphan notes and links. Native save/reload preserves logical IDs exactly. Copying is a distinct identity operation; plain-text clipboard output contains prose, not hidden Gloss metadata. Malformed/unknown-version Gloss data is preserved inertly and reported, never silently discarded or used to activate links.

## 6. Focused qualification plan

No performance results are claimed at this planning stage. Use a small correctness suite plus a bounded browser qualification, not a prolonged soak run.

| Area | Required checks |
|---|---|
| Authoring | Toolbar, chord and Command Bar with trusted input; selection/current word; empty/unfinished notes; first-colon parsing; later colons; Unicode; autocomplete/new type; no selection truncation. |
| Focus/history | Enter, Shift-Enter, Escape, Close/Cancel, click-to-edit, native draft undo, one canonical commit/undo/redo, IME, stale range and Document close; mounted editors/Cells survive. |
| Continuity | Insert/delete/replace, split/merge, undo, reorder, local repeated Blocks, nested tables/tabs, hidden anchors, last-anchor removal, explicit deletion with incident links, and foreign-Document ownership barriers. |
| Persistence/graph | Save/reload and full package round trip; orphan retention; logical ID stability; copied definitions/links; duplicate paste/collision; unsupported version; multiple parents and cycles. |
| Bounded work | Assert zero repository snapshots, broad planning/validation, full projection builds, SQL/network requests and unrelated Document updates during draft typing and eligible Gloss commits. Count changed records/property reads, parser calls, DOM/layout reads and live register updates during prose edits. Include Undo/Redo and open history observers. |
| Browser responsiveness | Compare the same Document before/after using [the real Flint typing benchmark](scripts/benchmark-flint-typing-browser.mjs). Measure invocation-to-textbox-painted-and-focused, keystroke-to-visible-input, Enter-to-visible-marker/card, mode-open cost and scrolling with crowded anchors. Report median/p95, fixture sizes, long tasks and actual paint/interaction evidence; two arbitrary frames are not proof of usability. |

Use a normal fixture plus a long annotated Document (approximately 25–30K characters, several hundred Glosses, a deliberately crowded paragraph), then add unrelated open Documents to check scaling. These sizes are proposed test inputs, not a mandated long-running test. Include both renderer paths, narrow/wide windows, font/wrap/zoom changes and shared occurrences. Initial load may index the active Document once; subsequent typing must not repeat that work. If root-registry copies or crowded layout cause material latency, report the measured limit before expanding scope.

## 7. Stages and approval points

**A — Native authoring and durability (moderate-to-high complexity).** Add the feature flag, definition/segment format, bounded canonical admission and projection/dirty handling, compact textbox, shared command activation, parser/autocomplete, Normal Mode marker and click-to-edit. Qualify orphan retention and native save/undo immediately. Bring minimal full-package recognition/identity preservation into A so an exported Document does not silently lose active Gloss semantics while awaiting Stage C.

**B — Gloss Mode and Register (moderate complexity).** Add retained-session presentation, shared visible-range geometry, stacking/underneath layout, inline editing, local register/filter/navigation and occurrence coverage. Qualify typing, mode opening and crowded scrolling before adding graph presentation.

**C — Links and Structure (moderate complexity).** Add open relation vocabulary, source/target picker, edge edit/unlink, incident-link cleanup on explicit deletion, cycle-safe graph projection and full graph/copy/package qualification. Optional link slash entry invokes the same operation.

Review these architectural/scope decisions before implementation:

1. Document-owned linked definitions, independent logical Gloss IDs and the narrowly bounded atomic metadata/anchor path.
2. Initial authoring on Document-owned TextBlocks, including their repeated local occurrences; foreign borrowed Blocks require further ownership work and cannot be claimed as supported by this plan's first increments.
3. Initially one selected Block at creation, while preserving native split-generated fragments; cross-Block creation can follow once bounded admission is proven.
4. Proposed Ctrl+; then G binding, active-draft manual Save behaviour, and clipboard copy/link policy above.

The confirmed textbox placement, first-colon rule, cancellation, orphan retention and Document-local semantics are not reopened by these recommendations. Implementation starts only after this plan is reviewed.
