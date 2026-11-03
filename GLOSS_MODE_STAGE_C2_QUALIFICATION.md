# Gloss Mode C2 — Relationship Authoring qualification

3 November 2026. C1 is approved; this increment implements C2 only. The revised roadmap is **C3: Mermaid Graph View**, followed by **C4: Argument Explorer**.

## Implementation and workflows

Relationship authoring is available in Local References when Gloss Mode is enabled. The new `glossRelationshipAuthoring` flag defaults to enabled and requires the existing Gloss presentation/relationship features.

- Each active, uniquely identified Gloss has **Add Relationship**. A compact inline Register editor fixes the source to that entry, accepts a suggested or custom predicate, and searches local targets by type, text or alias. Results show occurrence/unanchored context and are limited to 30 visible candidates; users refine the search for more. Deleted, ambiguous, foreign and self targets are excluded.
- The preview reads **source — predicate → target**. Incoming and outgoing groups are collapsed initially, with active counts by type. Related-Gloss buttons select the corresponding Register entry; **Passage** reveals an existing anchor, while **Definition** selects an unanchored Gloss without attempting passage navigation.
- **Type**, **Retarget**, **Reverse** and **Delete Link** delegate to C1 operations. Type and target changes are separate, single-Undo actions. Reversal preserves identity and requires confirmation of the new direction. Deletion has a compact inline confirmation. Retargeting requires an explicit local selection, including for outside-copy targets.
- Suggested predicates include the initial vocabulary and custom types already used in the Document. No global search, ontology or second relationship store is introduced.

## Files and architecture

| File | Change |
| --- | --- |
| `src/features/gloss/relationship-authoring.tsx` | Editor, direction preview, target picker, relationship groups, repair section, and reusable session selection/filter state. |
| `relationship-authoring.css` | Compact Register styling; no Document-width or geometry-system changes. |
| `relationship-index.ts` | Incrementally maintained problem-edge inventory and predicate suggestions, derived from the existing graph. No new canonical storage. |
| `presentation.tsx` | Register integration and related-Gloss navigation. Selection, filters and group expansion survive Normal/Gloss Mode transitions within the retained session. |
| `src/configuration.ts` | Default-on authoring feature flag. |
| `relationship-authoring.test.tsx` | Focused UI regression tests. |
| `src/application/gloss-stage-c2.browser-fixture.tsx` | Trusted-input, physical persistence, bounded-work and interaction-readiness qualification. |
| `scripts/qualify-gloss-browser.mjs`, `benchmark-flint-typing-browser.mjs` | C2 fixtures, density selection and paired authoring-UI benchmarks. |
| `AGENTS.md` | Records the requested standard: read briefs and ask needed clarifying questions before implementation. |

The C1 canonical controller, registry admission, Undo/Redo and manual persistence remain in use. No transaction-engine rewrite, Mermaid conversion, graph rendering or Argument Explorer was added. Margin-card relationship indicators are deferred: all C2 controls remain in the Register, keeping link-only changes independent of source geometry.

## Focus, selection and lifecycle

Opening a relationship editor captures the source selection through the existing mount/selection mechanisms. Native relationship inputs do not dispatch editor shortcuts. Enter confirms appropriate input fields; composing Enter is ignored, Escape cancels, and submissions are guarded against repetition.

Cancel makes no transaction. Closing returns focus to the invoking control, or its surviving Register row/host when an edit removes that control. The source selection is retained when returning to the Document; the native selection can temporarily belong to the focused Register/input. A canonical text revision check avoids restoring a stale range after an intervening text edit.

Editors and Cell elements remain mounted. Browser qualification covers Window detachment/return, normal/narrow layouts and Normal/Gloss Mode transitions. Related-Gloss navigation deliberately changes selection; ordinary relationship editing does not navigate the source passage.

## Repair and conflicts

**Relationships needing attention** is separate from active counts. It includes deleted, missing, ambiguous, outside-copy and unsupported records, including relationships whose source Gloss no longer appears among active Register entries.

Unique tombstoned endpoints can be restored. Supported links with a live source can be retargeted. Explicit deletion is available when C1 can uniquely identify the edge. Unsupported versions have no type/reverse/retarget controls and remain intact unless explicitly deleted; Undo restores them. Ambiguous relationship IDs remain diagnostic-only because C1 cannot safely choose one by ID.

A stale editor retains the user's input and reports the conflict. Cancel/reopen refreshes it; newer data is never silently overwritten. Missing definitions are not fabricated, and outside-copy descriptors are removed only by explicit retargeting.

## Tests and browser qualification

**42 automated tests pass** across relationship authoring (8), C1 relationships (13), existing Gloss authoring (16) and Stage B (5). Client and server typechecks pass.

The UI suite covers alias/type/body search, suggested/custom types, cancellation, duplicate prevention, self exclusion, double submission, IME/key isolation, stable IDs and Undo/Redo for edits, reversal/retarget/deletion, stale conflicts, repair, related-definition navigation, unrelated-row stability and zero graph work on typing. C1 tests retain malformed/ambiguous/foreign ownership and native-copy coverage.

**48 trusted Chrome checks pass in each of two fixtures**:

- 32,400-character annotated Document, 243 active Glosses, 976 initial relationships, plus an unrelated 18,000-character Document.
- The same Documents with **3,892 initial relationships** and the authoring UI enabled.

Tests use the real C2 controls for creation, type changes, reversal, retargeting, deletion and restoration. The stale-conflict test deliberately injects an external controller edit. Trusted composing Enter, cancellation/focus return, source selection recovery, retained Cells, navigation/filtering, detachment and responsive layouts are exercised.

### Physical persistence

Each run uses an isolated temporary on-disk Cavern. Relationships are authored through the C2 UI and saved through the existing Command-S route. The entire `WorkspaceSession` is disposed, a fresh session opens the saved `.ink` file, and the complete registry is compared. Relationship IDs, direction, type, orphan endpoints, opaque extension data and unresolved outside-copy state survive. The temporary Cavern is removed; the saved file remains under the qualification artifacts. The user's Cavern is untouched.

## Performance and work counters

| Operation | 976 edges: input → ready | Controller | 3,892 edges: input → ready | Controller |
| --- | ---: | ---: | ---: | ---: |
| Open target picker | 40.3 ms | 0.0 ms | 65.8 ms | 0.0 ms |
| Search targets | 17.3 ms | 0.0 ms | 30.9 ms | 0.0 ms |
| Create relationship | 65.5 ms | 32.0 ms | 98.3 ms | 66.0 ms |
| Change type | 52.9 ms | 22.8 ms | 92.4 ms | 60.9 ms |
| Reverse relationship | 49.6 ms | 23.5 ms | 85.2 ms | 58.2 ms |
| Retarget relationship | 48.5 ms | 19.7 ms | 82.8 ms | 48.1 ms |
| Delete relationship | 43.1 ms | 17.9 ms | 72.9 ms | 45.6 ms |

These are individual interaction samples. Adjacency publication measured 0.0–0.5 ms; post-controller readiness was 22.4–31.9 ms. Screenshot/protocol completion added 217.2–461.6 ms **after** readiness and is excluded from the interaction column. Near-zero values are below this timer's useful resolution.

Readiness is measured inside Chrome from trusted pointer-down (or `beforeinput` for searching) until the required DOM state exists and layout is available in the next animation frame. This is condition-driven readiness, not an arbitrary two-frame delay, and is not claimed as a physical monitor timestamp. A screenshot follows separately.

Controller time includes its synchronous derived publication/render effects. The graph `apply` phase is measured separately; post-controller readiness includes remaining DOM/layout/frame scheduling. These phases overlap and must not be added as independent CPU costs. Explicit layout-check time and Register mutation counts are retained in JSON; browser engine rendering CPU is not isolated by these probes.

Across the browser workflow, counters record **zero repository snapshots, projection builds, unrelated-view writes and network requests**. Link-only creation retains Register inventory and causes no source-geometry invalidation. The single-edge commit decodes only the changed edge. Typing and offset rebasing perform **zero relationship definition reads, edge decodes/evaluations, node publications or summary publications**, with the UI mounted.

The real-Flint typing benchmark uses the dense fixture, Gloss presentation enabled, 1,001 Explorer entries and 40 alternating insert/delete samples. Only the C2 UI flag differs; the C1 graph remains enabled in both runs.

| Authoring UI | Synchronous handler median / p95 | Handler + queued caret median / p95 |
| --- | ---: | ---: |
| Disabled | 16.9 / 26.8 ms | 38.0 / 59.4 ms |
| Enabled | 16.9 / 23.9 ms | 38.4 / 56.9 ms |

Both runs show zero graph work, snapshots, service requests and worker starts. Synchronous medians are identical at 16.9 ms; the pair shows no measured typing regression. Timed samples dispatch `beforeinput`; separate trusted Chrome character input and Undo pass. Headless frame timing is not presented as physical display latency.

The principal latency remains the existing whole-registry canonical transaction, as measured in C1. The denser C2 fixture makes its contribution visible in actual authoring interaction. A reviewable follow-up would restrict canonical copies/history/projection changes to the affected Gloss definition or edge, retaining validation, compact inverse operations and owner-local dirty tracking. No generic patch engine or speculative repository refactor was undertaken.

## Screenshots and artifacts

![Relationship editor in the Register](artifacts/gloss-stage-c2/relationship-editor.png)

![Expanded relationship groups](artifacts/gloss-stage-c2/expanded-relationships.png)

Detailed results and saved Documents: `artifacts/gloss-stage-c2/qualification.json`, `saved-document.ink`, and the equivalent files in `artifacts/gloss-stage-c2-dense/`. Paired typing results and profiles are under `typing-ui-disabled/` and `typing-ui-enabled/`.

## Readiness for C3 and remaining limits

C3 can reuse stable local-ID selection, the C1 graph's independent incoming/outgoing adjacency, Register filters and existing anchor navigation. No canonical data needs to change for Mermaid. Large-registry transaction latency remains the main architectural concern; measurements are fixture-specific samples, not universal guarantees.

Ambiguous relationship identities require a future identity-repair policy. Cross-Document relationship resolution/transfer, margin-card indicators and new shortcuts remain outside C2. Target matching scans only the current Document's derived Gloss rows during picker interaction; it performs no vault discovery or graph traversal during ordinary typing.

C2 stops here for review. C3 and C4 have not begun.
