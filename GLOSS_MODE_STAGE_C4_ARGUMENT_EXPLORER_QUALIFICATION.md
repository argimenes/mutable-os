# Gloss Mode C4 — Argument Explorer qualification

3 November 2026. **Implemented and qualified.** Default-on feature flag: `glossArgumentExplorer`. C4 is complete; no subsequent stage or Mermaid navigation bridge is implemented.

## Implementation

Local References now offers **References / Graph / Argument**. Argument is a compact outliner with searchable root selection, Incoming (default), Outgoing and Both modes, and Document-local relationship-type filtering. It initially uses the selected eligible Gloss, otherwise suggests a thesis. Unique active unanchored Glosses are eligible. Both mode lists incoming relationships first; arrows and authored predicate wording retain canonical direction.

Expansion, root, filter and selected path are transient retained-session state. Labels select without navigating; **Passage**, **Definition** for unanchored Glosses, and **References** are explicit actions using C2 navigation. The existing narrow drawer and Document detachment/return infrastructure are reused. No new canonical model, Block, relationship storage, SQL, keyboard shortcut or save mechanism was introduced.

## Traversal and reactive architecture

`argumentChildren()` reads exactly one C1 adjacency and never follows descendants. Only mounted, expanded branches subscribe to relevant incoming/outgoing adjacency. The root initially shows its direct children; deeper branches are collapsed. Root choices use the existing local Gloss inventory, not a second repository.

A row's path contains the root ID plus each canonical relationship ID, direction and child ID. Shared evidence therefore has independent rows/expansion under different parents. A path-local ancestor list produces a visible, navigable terminal cycle reference, including imported self-links. Predicate or label edits preserve path identity; retargeting deliberately changes it.

Sibling order follows the session index's current source occurrence order, followed by stable identity tie-breakers; unanchored entries follow anchored ones. Only changed rank signals publish after structural ordering changes. Offset rebasing does not republish ranks or traverse relationships. Relevant-direction equality checks prevent an opposite-direction edit from re-sorting an unchanged branch. Live label/type edits retain existing row elements; an unrelated edge edit does no branch traversal.

Limits: **300 visible rows, depth 8, 20 children per page**. Show more pages the already-derived immediate adjacency. At the row limit, users collapse branches and explicitly retry waiting rows. At the depth limit, they can select the terminal Gloss as root. Direct adjacency filtering/sorting is proportional to that node's degree; it is not a recursive scan. No virtualisation or geometry subsystem was added.

Hidden Argument views unmount their reactive readers. Expansion/control state survives switching, drawer closure, Normal/Gloss Mode and host changes; presentation rows are recreated on reopening. Source editors and Cells remain mounted.

## Files

- `src/features/gloss/argument.ts`, `argument-view.tsx`, `argument-view.css`: traversal, retained state, diagnostics, UI and layout.
- `presentation.tsx`, `graph-view.tsx`, `src/configuration.ts`: integration, shared panel tab state and feature flag.
- `argument.test.tsx`, `src/application/gloss-stage-c4.browser-fixture.tsx`: focused regressions and native Flint qualification.
- Existing C3 fixture exports reusable setup/input helpers. `scripts/qualify-gloss-browser.mjs` supports C4 and records sanitised SVG node IDs; `scripts/benchmark-flint-typing-browser.mjs` records Argument work and locates Graph by label now that a third tab exists.

## Tests and browser results

**131 tests passed across 13 files**, including 14 new Argument tests, Gloss A/B/C1/C2/C3, structured rendering and Document transfer/detachment. Reactive TypeScript checking and `git diff --check` passed.

Coverage includes directions/custom predicates, shared evidence/diamonds, cycles/self-links, unresolved and ambiguous identities, tombstones/restoration, orphan and empty states, budgets/pagination, root choice, source reordering, label/type changes, reversal/retarget/deletion/Undo, unaffected DOM identity, hidden inactivity and bounded typing work. Existing Gloss authoring tests retain Undo/Redo and manual Save coverage.

Trusted Chrome mouse/key interactions passed on disposable native Caverns with **10, 50, 100 and dense/cyclic 100 Glosses**: 26 / 24 / 24 / 25 checks respectively. Ordinary fixtures contain 9/49/99 active relationships; dense contains 399. Each also has a missing-target relationship and an unanchored Gloss. No user vault was modified.

Browser checks exercised expansion, selection retention, root/direction/filter controls, live relationship updates, unanchored definition access, explicit passage/References navigation, view/mode switching, narrow layout and Window detachment/return. A second Document projection was monitored. Viewing preserved canonical revision and dirty state; trusted typing and Undo succeeded. Source mount and Cell identities survived interactions and transfers. View/local-edit probes recorded **0 repository snapshots, 0 projection builds, 0 unrelated Document projection updates and 0 API requests**. Argument needs no Mermaid generation, iframe or renderer asset; the 10-node run separately opened Graph for the investigation below.

## Browser interaction measurements

| Interaction (ms) | 10 | 50 | 100 | Dense 100 |
|---|---:|---:|---:|---:|
| Argument activation | 31.5 | 89.4 | 133.6 | 132.3 |
| Root change | 40.6 | 47.4 | 59.4 | 57.9 |
| First-level expansion | 6.8 | 10.5 | 18.8 | 20.1 |
| Deeper expansion | 6.0 | 9.8 | 15.3 | 17.0 |
| Relationship filter | 23.8 | 31.1 | 39.2 | 39.2 |
| Clear filter | 39.6 | 21.5 | 34.0 | 30.3 |
| Relevant relationship update | 7.2 | 9.2 | 13.9 | 17.4 |


These are individual representative runs, not percentile estimates. Timing begins before trusted browser input (or the indicated canonical relationship update), waits for the expected actionable DOM state, and flushes Argument layout. The qualification-only layout read is not in product code. Screenshot/protocol time is recorded separately, roughly 190–333 ms in these runs; screenshots confirm the resulting display. These numbers are **DOM/layout readiness**, not guaranteed physical display-presentation latency or arbitrary two-frame settling.

Activation increased with fixture size despite constant adjacency work. The measurement includes browser input and retained-source panel layout changes. At every ordinary size, activation and each individual expansion inspected **one adjacency / two edges**; dense inspected **one adjacency / five edges**. The visible relationship update re-read one affected adjacency. Applying the filter read two retained expanded branches; clearing it restored three. No collapsed descendants were traversed.

### Real Flint typing comparison

The existing benchmark opened the 100-Gloss native fixture with 99 source paragraphs and 1,001 visible vault rows. It measured 40 alternating insert/delete events through the real Flint editor, then separately verified trusted Chrome character input and Undo. Runs were serial, with no competing test suite.

| Real Flint typing, median / p95 (ms) | Feature disabled | Argument visible |
|---|---:|---:|
| Synchronous handler | 3.5 / 9.0 | 3.4 / 8.8 |
| Through queued microtasks | 17.8 / 24.0 | 16.9 / 22.9 |
| Next animation-frame callback | 25.3 / 31.0 | 20.9 / 25.2 |


Both runs recorded **zero** Argument branch reads, edge inspections, row mounts and rank passes; zero C1 definition/edge/publication work; zero Mermaid generation/rendering; zero snapshots, worker starts or service requests. There were 40 cheap document-status reads for 40 edits, independent of vault-row count. Text was restored exactly. This pair provides no evidence of added typing cost; it is not a statistically established speed improvement. Microtask/frame figures include existing editor presentation work and are not input-to-pixel guarantees.

## Diagnostics and repair

Inactive, missing, tombstoned, ambiguous, unsupported-version and outside-copy edges are excluded from normal traversal. Expanded branches show deduplicated omitted-edge counts, and the C1 Document-wide problem count remains visible. **Review in References** exposes existing C2 inspection/repair controls. Unavailable roots remain explicit and recover when restored; no missing definition is fabricated. Diagnostic counts are not hidden by the active-predicate filter.

## Small Mermaid navigation investigation

Safe identification is feasible. The existing sanitised SVG retained renderer-generated IDs such as `diagram-flowchart-G0-0`; `data-id` was absent. Tokens are usable within the current generated token-to-Gloss mapping, not permanent canonical node identities across regenerated diagrams.

A future narrow bridge could delegate node activation inside the trusted frame and post only an allowlisted generated token. The parent would validate the exact current frame's `contentWindow`, message shape, current-render nonce/generation and active-Document token mapping, rejecting stale/unmapped messages. Opaque sandbox origin `null` is not authentication. Existing sandbox/CSP/sanitisation can remain intact; no Mermaid click directives or HTML labels are needed.

The navigation benefit is worthwhile as a later refinement, but keyboard accessibility, stale frames and message validation need focused tests. **No bridge or click handlers were implemented in C4.**

## Screenshots and artifacts

![Expanded Argument Explorer](artifacts/gloss-stage-c4-10/expanded-argument.png)

![Narrow Argument drawer](artifacts/gloss-stage-c4-10/narrow-argument.png)

Per-size evidence: `artifacts/gloss-stage-c4-{10,50,100,100-dense}/qualification.json`, screenshots and native typing fixtures. Paired typing results and CPU profiles: `artifacts/gloss-stage-c4-typing-{before,argument}/`.

## Remaining limitations

- Predicate grouping is deferred; flat labels preserve authored direction and wording.
- Expansion is session-only, and native root selection uses a separate search input.
- Very high-degree nodes still require sorting their immediate adjacency. Row/depth/page limits bound visible expansion, not the size of that one adjacency. Thousands of Glosses were not tested or optimised.
- Reopening remounts visible presentation rows while restoring paths; live unaffected rows retain identity. At the row budget, retry is explicit after collapsing branches.
- Full IME/device/accessibility qualification was not repeated for this read-only presentation; existing text editing and geometry paths were unchanged.
