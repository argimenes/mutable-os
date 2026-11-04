# Gloss Mode C5 — Mermaid navigation qualification

3 November 2026. **C5 implemented.** Direct diagram navigation is enabled by default through `glossGraphNavigation`. No subsequent Gloss stage, canonical storage change or general iframe framework was introduced.

## Behaviour and integration

Clicking a recognised node, including its nested SVG text, selects its canonical Gloss through the retained C2 Register selection signal. It does not reveal a passage or scroll the source. The separate Graph-only `choice` state was removed. The existing Gloss dropdown remains available and synchronises after dynamic options mount.

Graph, References and Argument share selection. Existing Argument roots and filters remain unchanged; visible occurrences reflect external selection, while a locally selected Argument path retains its individual highlight. **Show in References**, **Reveal passage**, and **Open Definition** for unanchored Glosses are explicit C2 actions. Ranges are resolved from the current session index when navigating; no offsets enter the diagram mapping. Losing an anchor disables passage navigation without invalidating the selected Gloss or regenerating the default orphan-inclusive diagram.

A selected node has a gold outline; keyboard focus has a separate blue outline. The selected outline remains when focus moves to another node. Styling changes locally in the frame, without Mermaid source generation or layout. Recognised nodes have `tabindex=0`, `role=button`, `aria-pressed` and plain-text accessible names capped at 1,000 UTF-16 units. Native Tab reaches nodes; Enter/Space selects, with repeat/scroll prevention for those activation keys. Keyboard events remain inside the sandbox. No global shortcut or spatial navigation framework was added.

## Frame protocol and lifecycle

The narrowly scoped adapter recognises allowlisted `data-id` tokens or the pinned renderer's `…flowchart-Gn-number` IDs on `g.node` elements. It never matches labels to identities. Duplicate and unrecognised node identities fail closed; the parent Gloss dropdown remains the accessible fallback.

Frame to parent:

```json
{"kind":"gloss-node-select","token":"per-render nonce","node":"G1","sequence":1}
```

Parent to frame:

```json
{"kind":"gloss-node-selected","token":"per-render nonce","node":"G1"}
```

The second message permits `node: null` to clear the highlight. Neither message contains a canonical Gloss ID, offset, URL, arbitrary text or executable payload.

Admission checks the exact current iframe `contentWindow`, a connected/non-aborted ready frame, exact field schema, current random nonce, allowlisted token and strictly increasing safe-integer sequence. The Gloss view additionally checks that it remains alive/visible, the current render mapping still resolves that token to the same ID, and the Document-local C1 index resolves exactly one active Gloss. Duplicate/replayed, stale, malformed and unmapped messages are ignored. The frame validates the exact parent source, nonce, schema and token before applying selection styling. Origin `null` is never used as authentication.

Render identity includes both source and canonical token mapping: even identical Mermaid text with different canonical identities replaces the bridge. Root/filter changes, hidden tabs, Normal Mode, host transfers and disposal abort the old listener. Failure or timeout removes the frame and disables activation; **Retry diagram** creates a fresh nonce and frame. Render completion messages are validated separately from activation and can no longer be confused with it.

The existing opaque `sandbox="allow-scripts"`, nonce-only scripts, denied network/images/fonts, strict Mermaid configuration, sanitisation and non-HTML labels remain intact. No same-origin access or Mermaid JavaScript click directives were introduced.

## Files

- `src/structured/mermaid-navigation.ts`: SVG adapter, keyboard/pointer delegation, fixed message validation and local selection styling.
- `mermaid-frame.ts`, `mermaid-view.ts`: optional bridge wiring and lifecycle; ordinary structured diagrams remain read-only.
- `src/features/gloss/graph-view.tsx`, `presentation.tsx`, `argument-view.tsx`, `src/configuration.ts`: shared selection, current navigation actions, retained control synchronisation, Argument highlighting and feature flag.
- Focused Graph/Argument/bridge tests, `src/application/gloss-stage-c5.browser-fixture.tsx`, and the existing qualification/typing runners. The finite browser runner now exits after awaiting artifacts and cleanup instead of retaining a helper handle.

## Qualification

**143 tests passed across 14 files**, including 12 additional C5 regressions. Coverage spans Gloss A–C4, structured rendering, host transfers and detachment, plus message authentication/replay, unknown/duplicate SVG identities, nested text, keyboard activation, hidden/disposed callbacks, timeout/error/retry, canonical remapping with identical source, feature-off fallback, shared selection and anchor loss. Selection tests assert zero relationship adjacency reads, repository snapshots, geometry measurements and canonical revision changes. Existing authoring/manual Save and Undo/Redo regression tests remain passing.

Reactive TypeScript checking, structured-asset building and `git diff --check` passed.

Trusted Chrome qualification used disposable native Caverns and retained Flint editors, with a second unrelated Document projection monitored. The final fixtures displayed **10 nodes / 39 cyclic/shared relationships**, **50 nodes / 49 relationships**, and **100 nodes / 99 relationships**. Larger diagrams used Entire Document, node limit 100 and actual-size scrolling; each fixture also contained a missing-target diagnostic and an unanchored Gloss.

Browser checks passed for pointer/nested-label selection, edge/background rejection, native Tab/Enter/Space, visible focus versus selection, meaningful Chrome accessibility-tree names, cross-view selection/root retention, current passage and definition navigation, source editor/Cell retention, unchanged dirty state, root/filter regeneration, forged messages, hostile labels, failure/retry, narrow layout, Normal/Gloss transitions, detachment and return. The 10-node case covers the additional cyclic/security/failure checks. Totals: **29 / 25 / 25 assertions** for 10 / 50 / 100 nodes.

Across view interactions and the exercised local edit, counters recorded **0 repository snapshots, 0 projection rebuilds and 0 unrelated Document projection publications**. Node selection produced **0 C1 graph-index work, 0 Mermaid generations and 0 Mermaid renders**. Normal mode/disposal removes the bridge. No user vault was modified.

## Selection performance

| Input → selected state (ms) | 10 nodes | 50 nodes | 100 nodes |
|---|---:|---:|---:|
| Nested-label pointer click | 1.1 | 1.7 | 21.4 |
| Enter | 0.7 | 1.3 | 2.8 |
| Space | 0.6 | 1.3 | 2.0 |
| Graph → References readiness | 2.8 | 4.7 | 7.5 |


These are representative individual observations, not percentile estimates. The pointer/keyboard timer uses a qualification-only frame event timestamp and the parent's completed selection update, aligned through `performance.timeOrigin`. References synchronisation uses the actual click timestamp and a mutation observer confirming the selected References row is exposed. All instrumentation is outside product code.

Browser setup, compositor hit-region settling, screenshots and CDP round trips are excluded from these input-to-selected-state figures and retained separately in the JSON. Pointer harness totals were approximately 232–801 ms, largely screenshot/protocol preparation. These are selected-state readiness measurements, not guaranteed input-to-physical-pixel latency. Selection's parent-to-frame highlight is asynchronous; browser proofs and screenshots confirm the resulting style.

## Typing comparison

Separate Chrome runs initially varied: disabled median handler time was 2.4–3.2 ms versus 3.5–4.2 ms enabled, and median frame timing was 28.3–40.9 ms versus 43.3–47.8 ms. A controlled follow-up alternated the feature off/on/off/on in one browser, remounting the diagram and restoring the same editor caret before each 40-edit sample. No CPU profiler ran during these four comparative samples.

| Same browser, median / p95 (ms) | Handler | Through microtasks | Next frame callback |
|---|---:|---:|---:|
| Navigation off · round 1 | 2.2 / 3.5 | 11.3 / 12.8 | 27.6 / 30.4 |
| Navigation on · round 1 | 2.3 / 2.8 | 11.1 / 12.8 | 27.5 / 30.2 |
| Navigation off · round 2 | 2.5 / 5.7 | 11.6 / 15.3 | 28.2 / 34.0 |
| Navigation on · round 2 | 2.5 / 4.2 | 11.3 / 17.5 | 27.9 / 38.1 |

The controlled comparison did not reproduce a sustained median typing slowdown; tail timings still vary. This supports bounded integration, not a claim that browser rendering overhead is zero. One separate baseline-repeat attempt timed out while Chrome was creating its target, before loading Mutable; the retry completed. Raw standalone results are retained rather than discarded.


All completed typing runs recorded zero C1 index work, Argument traversal/ranking/mounting, Mermaid generation/rendering, snapshots, worker starts and service requests. Each used the same 100-Gloss native fixture, 99 source paragraphs, 1,001 visible vault rows, 40 alternating edits and a separate trusted Chrome character/Undo check. There were 40 cheap status reads, and original text was restored exactly. The benchmark's Graph remained in its normal bounded selected-root scope. Headless microtask/frame timing is diagnostic, not a user-visible latency guarantee; no renderer/transaction optimisation was undertaken.

## Screenshots and artifacts

![Selected Mermaid node](artifacts/gloss-stage-c5-50/selected-mermaid-node.png)

![Corresponding selected Gloss in References](artifacts/gloss-stage-c5-50/selected-references-gloss.png)

Per-size results and screenshots: `artifacts/gloss-stage-c5-{10,50,100}/`. Typing results/CPU profiles: `artifacts/gloss-stage-c5-typing-{before,navigation,navigation-repeat,before-repeat}/`. The controlled comparison is `artifacts/gloss-stage-c5-typing-controlled/navigation-comparison.json`.

## Remaining limitations

- Mermaid SVG identifiers are renderer-specific. A future version may need a small adapter update; unknown/ambiguous identifiers remain noninteractive and the existing selector remains usable.
- Native SVG Tab order follows generated node order, not spatial reading order. Chrome's accessibility tree was verified; a full screen-reader/cross-browser matrix remains unqualified.
- Large diagrams retain C3's rendering and visible-frame costs. Selection does not regenerate them. Timing variation and the finite sample sizes do not establish a general typing speed improvement.
- Argument predicate grouping, cross-Document relationships and broader Register redesign remain deferred.
