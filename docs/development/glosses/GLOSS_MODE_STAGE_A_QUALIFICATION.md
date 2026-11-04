# Gloss Mode — Stage A qualification

Implemented 2 November 2026; qualification completed 3 November 2026.

Stage A provides Document-local Gloss authoring and durability. `glossMode` is enabled by default. Margin cards, the Register/Local References Instrument, relationship editing and Structure view remain deferred.

## Authoring and native representation

Place the caret inside a word or select text, then use **Ctrl+; followed by G**, the **Gloss/G toolbar button**, or **`/gloss`**. All three invoke `gloss.create` and the same commit pathway. Runtime binding checks found no collision; standalone Cmd-G/Ctrl-G remains available to the browser.

The focused textarea appears beneath the anchor. Enter commits, Shift+Enter inserts a newline, and Escape or Close / Cancel discards the draft. IME confirmation does not commit. Outside clicks retain the draft. Document Save saves committed content while retaining the unfinished draft and displaying a notice.

The first literal colon separates type and body. Raw input remains authoritative and unmodified; subsequent colons, whitespace, empty prefixes, unfinished values and unfamiliar types are accepted. Suggestions combine the starter vocabulary and types in the owning Document.

The native data is:

```json
{
  "linkedAnnotations": {
    "definition-uuid": {
      "id": "definition-uuid",
      "type": "mutable/gloss",
      "value": "claim: A: B",
      "metadata": {
        "gloss": {
          "version": 1,
          "localId": "logical-gloss-uuid",
          "links": {}
        }
      }
    }
  }
}
```

The registry belongs to the Document payload. A TextBlock holds an ordinary native segment:

```json
{"id":"segment-uuid","type":"mutable/gloss","annotationId":"definition-uuid","start":0,"end":4}
```

Segment endpoints are inclusive. Type/body are derived from `value`; `metadata.gloss` preserves optional alias and future link metadata. No global graph or SQL records are created.

Deleting the last textual anchor retains the definition. Explicit Delete Gloss tombstones the definition and removes its incoming/outgoing reserved links in one undoable edit. Native Save/reload preserves native identities. Whole-Document package import preserves the logical Gloss UUID and reserved metadata while using the package system's existing remapping of native definition/segment identities. Ordinary clipboard copies receive independent identities, include only selected definitions, and omit links to excluded Glosses. Plain-text clipboard output contains only source text.

## Implementation and bounded work

| Area | Files / changes |
|---|---|
| Authoring, parsing, presentation | `src/features/gloss/{controller.ts,model.ts,style.css}`; default-on flag in `src/configuration.ts` |
| Canonical admission and projection | `src/block-tree/{gloss-plan.ts,repository.ts,structural-plan.ts,projection.ts}`; local dirty-state handling in `src/persistence/native-session.ts` |
| Commands and lifetime | Binding catalog, Document style bar, autocomplete, ReactiveEditor and ReactiveTreeView |
| Annotation resolution | `src/runtime/linked-annotations.ts`, `src/rendering/standoff-editor-view.tsx`, `src/application/document-entity-changes.ts` |
| Geometry and interchange | `src/runtime/measurements.ts`, `src/interchange/materialize.ts`, `src/interchange/package/native.ts` |
| Qualification | `src/features/gloss/gloss.test.tsx`, `src/application/gloss.browser-fixture.tsx`, `scripts/qualify-gloss-browser.mjs`; paired option in the existing Flint typing benchmark |

Creation updates one Document registry and one TextBlock's segments atomically. Editing/deletion normally update only the registry. Admission checks the actual changed records, including inverse operations, and uses indexed ownership. Failed admission leaves the draft intact and does not fall back to a snapshot transaction. Existing canonical history and persistence remain responsible for Undo/Redo and Save.

Work follows the affected TextBlock, its occurrences and the owning Document's Gloss registry. Registry cloning/validation is proportional to that registry; this is not an O(1) per-Gloss store. It does not enumerate unrelated workspace contents or reconstruct child trees.

Browser profiling found two legacy costs: generic linked-definition resolution repeatedly scanned resource ownership, and Gloss-only changes refreshed entity inventories. Gloss now has bounded definition lookup; proven Gloss-only commits bypass entity-inventory refreshes. A regression test counts repository enumeration and legacy ownership calls, including history replay.

Normal Mode uses the existing **CSS annotation renderer** for a dotted border. It requires no Gloss SVG geometry work during typing. Popup positioning and temporary anchor highlighting share the same measured range rectangles, refreshing for relevant edits, resizing, scrolling and font changes. Click editing also accounts for Chrome collapsing an existing selection after click dispatch.

## Functional qualification

**74 focused tests pass across nine files**, including both direct-DOM and Solid character rendering, existing inline-performance checks, provisional autocomplete, compact toolbar, bindings, linked annotations, annotation range events, package interchange and Document entity-change tracking. The final clipboard test initially used the browser fixture's word rather than its unit fixture's word; its expected value was corrected and the Gloss suite rerun. TypeScript reactive-project checking passes.

**37 browser checks pass** in actual Flint, using trusted CDP keyboard, pointer, drag and composition input. These cover:

- Chord, toolbar and `/gloss`; caret-word and selected-range targeting; immediate focus and restoration.
- Raw parsing, current-Document type suggestions, unfamiliar types, Enter, Shift+Enter, Escape and Cancel.
- Outside-click retention, Save with an open draft, exclusion of the draft from saved JSON, and the draft notice.
- Create/edit/delete, keyboard Undo/Redo, marker reopening after history replay, stable Cells and owning-Document dirty state.
- IME composition and confirmation Enter, shared content occurrences, orphan retention, native decoding and package logical-ID preservation.

Unit qualification additionally covers whitespace/punctuation rejection, foreign borrowed-Block rejection, local repeated occurrences, split/merge continuity, conservative clipboard link handling and draft retention when its view closes. Only a single Document-owned TextBlock is eligible at creation; unsupported cross-Block selection is rejected rather than truncated.

Native Save transport was isolated in memory. Native serialization/decoding and package materialization were exercised; this run did not write a user's vault or certify physical disk failure/recovery scenarios. Composition tests use Chrome's CDP IME facilities, not a manual OS-specific IME certification.

## Performance measurements

Chrome on macOS, development build. The browser fixture contains a **27,000-character primary Document with 150 Glosses**, plus an unrelated open **14,400-character Document** and an unrelated projection used to detect updates.

These are individual end-to-end observations, not percentile claims. “DOM ready” waits for the required state, focus or marker change. “Screenshot complete” includes capture/protocol overhead and provides a conservative rendered-output observation; it is not an exact physical-display timestamp or an arbitrary two-frame settling measurement.

| Interaction | Dispatch → DOM ready | Dispatch → screenshot complete |
|---|---:|---:|
| Final chord key → focused textbox | 31.5 ms | 254.3 ms |
| Draft character keystroke | 11.0 ms | 209.9 ms |
| Enter → new marker | 44.9 ms | 282.2 ms |
| Marker click → editing textbox | 57.9 ms | 249.1 ms |
| Edit commit | 18.7 ms | 209.3 ms |
| Undo edit | 10.0 ms | 199.4 ms |
| Redo edit | 9.5 ms | 201.4 ms |
| Delete Gloss | 29.4 ms | 225.3 ms |

Measured synchronous canonical commit time, including its synchronous publication: create **17.7 ms**, edit **8.1 ms**, delete **8.4 ms**, Undo edit **3.8 ms**, Redo edit **3.9 ms**, Undo deletion **3.8 ms**.

Across those authoring/history interactions: **0 repository snapshots, 0 full projection builds, 0 unrelated projection updates and 0 network requests**. Draft input creates no canonical revision or definition. Tests also verify zero repository-content enumerations and no entity-inventory notifications for Gloss authoring/replay. Explicit Save/export and structural split/merge are separate operations, outside these counters. Existing optional full-snapshot observers retain their established behavior if a caller explicitly installs them.

### Ordinary Flint typing

The existing real-Flint benchmark used the same 30-paragraph Document, a 900-character edited paragraph, and **1,001 Explorer rows**. Each run alternated 40 insert/delete events through the input gateway and separately verified a real Chrome character insertion and Undo. The timed loop uses dispatched `beforeinput`; its frame measurements are headless diagnostics.

| Configuration | Handler median / p95 | Through queued caret work median / p95 |
|---|---:|---:|
| Gloss disabled, first baseline | 10.2 / 14.1 ms | 24.9 / 36.3 ms |
| Gloss disabled, repeated baseline | 9.8 / 12.8 ms | 23.9 / 33.3 ms |
| Final CSS Gloss marker enabled | 10.7 / 15.9 ms | 26.0 / 34.9 ms |

All runs recorded zero snapshots, zero service requests, zero worker starts, 40 status reads rather than reads proportional to the 1,001 rows, and exact text restoration. An earlier SVG marker added measurable typing cost and was replaced. Final handler median is 0.5–0.9 ms above the baselines. Headless next-frame timing remains variable (enabled median 43.0 ms, p95 150.3 ms); it must not be presented as guaranteed user-visible typing latency.

## Artifacts, reproduction and limits

- [Browser results](artifacts/gloss-stage-a/qualification.json), [textbox screenshot](artifacts/gloss-stage-a/gloss-textbox.png), [normal markers](artifacts/gloss-stage-a/normal-gloss-markers.png).
- [Final typing results](artifacts/gloss-stage-a/typing-css-on/results.json), [baseline](artifacts/gloss-stage-a/typing-off/results.json), [repeated baseline](artifacts/gloss-stage-a/typing-off-repeat/results.json).
- Reproduce browser checks with `node scripts/qualify-gloss-browser.mjs`.
- Run the existing typing script with `BENCHMARK_DOCUMENT_PATH=artifacts/gloss-stage-a/typing-fixture.mutable.json`, `BENCHMARK_VAULT_SIZE=1000`, and `BENCHMARK_GLOSS=true` or `false`; set `BENCHMARK_OUTPUT` separately for each run.

Orphans are retained but have no Register UI yet. Shared occurrences are supported within the owning Document; foreign borrowed content is deliberately ineligible. Full graph-aware clipboard qualification remains Stage C work. Stage B should reuse the canonical definitions and bounded ownership route, derive its inventory, and avoid reintroducing generic ownership scans or per-keystroke margin geometry work.
