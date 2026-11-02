# Gloss Mode — Stage B qualification

Date: 3 November 2026. **Implemented; stopped after Stage B.**

## Delivered

The Document annotation bar now has **Gloss Mode**. Normal Mode retains Stage A's dotted anchors and compact editor. Gloss Mode adds margin cards and a fixed, independently scrolling **Local References** Register. Cards show type and text, support expansion and source navigation, and open the existing Stage A editor. Register entries provide text/type/alias filtering, document order, occurrence/segment counts, navigation, editing and deletion. Unanchored definitions remain editable entries marked **anchor removed**.

At narrow widths, notes flow below their passages and **Refs** opens a bottom Register drawer; it consumes layout space instead of covering the editor. Authored pages use this underneath presentation, with notes placed after the page; table notes are placed after the containing table. Existing page margins and canonical layout data are not rewritten. Very small annotation bars abbreviate the controls while retaining their accessible names/tooltips.

`glossPresentation` is enabled by default alongside the existing `glossMode` authoring flag. Each retained viewing session starts in Normal Mode. Mode, filters, expansion and drawer state are presentation state, not persisted Document edits. No shortcuts, graph relationships, argument tree, resolver, SQL indexing or other Stage C work were added.

## Integration and bounded work

- **Retained host:** `src/features/gloss/presentation.tsx` runs inside the existing retained render root in `retained-document-view.tsx`. The editor subtree is unconditional. Switching modes mounts/unmounts only Gloss furniture. Detaching and returning a Document moves the same session, index and editor. An additional strip serves retained Ink hosts without the Flint formatting bar.
- **Derived index:** `session-index.ts` visits the current Document's Block tree, excluding nested Documents and foreign-owned Gloss anchors. It indexes native definition/segment identities and local occurrences, not a second Gloss repository. A structural membership change refreshes this Document's inventory; explicit definition changes reconcile its definitions. Ordinary offset rebasing reads only the affected TextBlock's segment list and leaves row/filter signals intact. Current native offsets are resolved when navigating or measuring.
- **Geometry:** the existing measurement service now retains occurrence-local range fragments, shared with the Stage A popup. Validity includes mount generation, content revision, width and scale, with explicit invalidation for font/layout changes. Margin anchors are observed for visibility; visible block origins are measured once per frame, range fragments are reused on scrolling, and position writes follow reads. Cache entries and observers are released with removed occurrences/views. Narrow cards use native document flow.
- **Authoring:** Register/card edits use the same Stage A popup and bounded canonical Gloss proof, including edits/deletion of orphan definitions. Undo/Redo and ordinary manual Save remain authoritative. Mode changes do not dirty the Document.
- **Small existing-path correction:** qualification exposed a revision-only publication to unrelated projections on ordinary text edits. `BlockTreeProjection.updateInline()` now returns immediately when its indexed content map has no occurrence of the changed TextBlock. This prevents unrelated view updates without changing transaction admission or rebuilding projections.

## Verification

**70 focused automated tests passed**, covering Stage A authoring in direct-DOM and Solid paths, bounded index updates, orphan edit/delete and Undo, anchor deletion/Undo, split/join, repeated local occurrences, foreign borrowing, retained range cache reuse/invalidation, retained session lifecycle, detachment/return, core projection operations and caret measurements. Reactive TypeScript checking and `git diff --check` passed.

**22 Chrome browser assertions passed**, using trusted pointer, wheel and keyboard input for the product interactions:

- Same retained session, editor mount, Cell elements, selection, history and dirty state across mode activation/deactivation.
- Wide cards/Register, non-overlapping crowded cards, filtering, orphan editing, source navigation, narrow notes and drawer.
- Same Gloss index and editor when detached into a Window and returned to Flint.
- Ordinary typing: **one affected TextBlock segment-list read; zero Document tree visits, definition reads or Register row publications**. An unrelated row retained its DOM identity. Range reads remained below 70 in the crowded visible band, rather than measuring all 242 anchored Glosses.
- Across tested mode, typing, Gloss-edit and navigation operations: **0 repository snapshots, 0 projection builds, 0 unrelated projection updates, 0 network requests**. Manual persistence was measured separately and excluded from these counters.

Fixture: **32,400 characters**, 36 paragraphs, **243 Gloss definitions** including one orphan, 32 crowded overlapping anchors in the first paragraph, plus a separate **18,000-character Document**. The typing benchmark additionally displayed **1,001 Vault rows**.

## Browser measurements

Single interaction samples below use trusted action dispatch to the requested DOM/geometry condition. The second column extends through a Chrome screenshot capture of that state; it includes protocol/capture overhead and is **not** a physical display timestamp or an arbitrary two-frame settling estimate.

| Operation | DOM/geometry ready | Screenshot complete |
| --- | ---: | ---: |
| Activate wide Gloss Mode, cards and Register | 323.6 ms | 566.5 ms |
| Trusted text insertion and margin reposition | 39.5 ms | 268.1 ms |
| Font/wrapping refresh (fixture font change) | 46.7 ms | 275.2 ms |
| Commit orphan Gloss edit | 29.5 ms | 249.7 ms |
| Register → source navigation | 76.6 ms | 300.1 ms |
| Resize to narrow layout | 245.7 ms | 369.2 ms |
| Deactivate Gloss Mode | 255.9 ms | 411.1 ms |

Twenty trusted wheel interactions: action-to-next-frame **median 50.0 ms, p95 82.4 ms**, including automation overhead. The 19 measured margin-layout passes during those scrolls cost **median 0.40 ms, p95 0.60 ms**, excluding browser painting and the rest of the frame. These figures do not establish smooth 60-fps scrolling. Initial mode changes reflow the existing large Document and render/dispose its derived UI; they are not instantaneous, even though they perform no canonical edit or editor reconstruction.

The existing real Flint benchmark ran 40 alternating insertion/deletion events per configuration, followed by a separate trusted Chrome character-input/Undo check:

| Typing measurement | Stage A / Normal Mode | Gloss Mode active |
| --- | ---: | ---: |
| Synchronous handler median / p95 | 21.3 / 55.5 ms | 12.4 / 19.6 ms |
| Handler + queued caret work median / p95 | 47.7 / 114.9 ms | 34.7 / 56.5 ms |
| Headless next-frame median / p95 | 170.2 / 838.1 ms | 51.5 / 150.1 ms |

Both restored the original text and passed trusted input/Undo, with **zero snapshots, service requests or worker starts during typing**. These single-run headless samples have substantial scheduling/rendering variance; the lower active-mode figures are **not evidence that Gloss Mode accelerates typing**. The stronger regression evidence is the bounded-work instrumentation and retained row/editor identities.

## Physical durability

The runner created an isolated temporary on-disk Vault and seeded a native `.ink` fixture. The application opened it through the normal native backend. Trusted input created a new Gloss; **Command-S** used the existing manual Save flow. The runner verified the logical ID in the actual **224,905-byte** saved file, disposed the entire WorkspaceSession, then opened that file into a fresh WorkspaceSession.

The reopened definition registry matched all saved values and identities (ignoring JSON key order). Gloss Mode reconstructed the new native anchor association, and the edited orphan remained unanchored. The temporary Vault was removed afterward; no user Vault was accessed or modified. A copy of the saved fixture is in the artifacts.

## Evidence and limits

- [Wide layout](artifacts/gloss-stage-b/wide.png)
- [Narrow layout](artifacts/gloss-stage-b/narrow.png) · [Narrow Register drawer](artifacts/gloss-stage-b/narrow-register.png)
- [Browser checks and timings](artifacts/gloss-stage-b/qualification.json)
- [Normal typing results](artifacts/gloss-stage-b/typing-off/results.json) · [Gloss typing results](artifacts/gloss-stage-b/typing-on/results.json)
- [Saved native fixture](artifacts/gloss-stage-b/saved-document.ink)

Crowded cards use a greedy stack within the visible anchor band. With 32 anchors in one short passage, lower cards extend below the viewport; the independent Register remains the reliable way to reach every Gloss. Card expansion is height-limited. This is not a collision-routing or general layout engine. Authored pages/tables deliberately use notes underneath the containing layout, rather than inserting notes into their authored interiors.

Desktop wide/narrow layouts, font reflow and retained host transfers were browser-tested. Scale/cache invalidation was also unit-tested; this run did not qualify every OS/browser zoom combination, touch device or legacy Ink-host arrangement. Review the crowded-margin policy and first-toggle cost before broadening presentation options. Stage C remains unstarted.

Reproduce: `GLOSS_STAGE=b node scripts/qualify-gloss-browser.mjs`; run `scripts/benchmark-flint-typing-browser.mjs` with `BENCHMARK_DOCUMENT_PATH=artifacts/gloss-stage-b/typing-fixture.mutable.json`, `BENCHMARK_VAULT_SIZE=1000`, separate `BENCHMARK_OUTPUT` directories, and `BENCHMARK_GLOSS_PRESENTATION=1` for the active-mode comparison.
