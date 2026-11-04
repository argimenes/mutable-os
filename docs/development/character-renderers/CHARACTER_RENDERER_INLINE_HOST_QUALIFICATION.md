# Character renderer inline host — Increment 1 qualification

**Increment 1 implemented. Recommendation: go for a separately approved Increment 2 (owned Initialis adapter).** The native-layout host is qualified in Chrome for the restricted cases below. Initialis integration has not begun.

## Implementation and contract

The default-on `inlineCharacterSurfaces` feature flag controls the host. It also requires the existing `standoffPropertyRendering` infrastructure. No existing feature default changed.

Author an ordinary inclusive standoff range covering one Cell:

```json
{
  "id": "capital-1",
  "type": "style/character-surface",
  "start": 0,
  "end": 0,
  "metadata": { "renderer": "static-capital", "width": 48, "height": 48 }
}
```

Missing metadata uses these defaults. Width/height must be finite numbers from 16–128 CSS pixels. Malformed metadata, unavailable renderer names, conflicting/adjacent surface properties, zero-width or multi-Cell ranges, and unsupported source characters leave ordinary text visible. The saved property is retained. Initially eligible characters are **ASCII uppercase A–Z**, excluding combining continuations, concealed/alternative readings and bidi contexts.

The minimal visual-effect capability is `target: 'character-surface'`, with `surface(text, params, document)` returning a ready descriptor `{ image, width, height }` or `undefined`. Increment 1 admits local raster data URLs and decodes them before hiding source text. The included renderer draws a deterministic static capital with fixed colours; it fetches no assets and starts no workers. There is no generation cache or asynchronous generator API. A future adapter will need an owned readiness/cancellation contract; `undefined` does not initiate polling.

Changes:

| File | Responsibility |
| --- | --- |
| `src/configuration.ts` | Default-on feature flag. |
| `src/runtime/visual-effect-registry.ts` | Small character-surface renderer capability and descriptor. |
| `src/rendering/range-rendering.tsx` | Surface contributions use existing property/binding lifetimes, including unavailable contributions for conflict detection. |
| `src/rendering/static-character-surface.ts` | Property metadata adapter and local static bitmap renderer. |
| `src/rendering/character-surface-host.ts` | Occurrence-local decode, native advance measurement, CSS presentation, invalidation, composition suspension and cleanup. |
| `src/rendering/standoff-editor-view.tsx` | Shared adapter for direct-DOM/Solid, existing measurement-frame integration and exact-Cell annotation geometry. |
| `src/rendering/visual-effect-renderers.tsx` | Register the capability/property. |
| `src/rendering/character-surface.test.tsx` | Focused correctness, fallback and bounded-work regression coverage. |

The host retains the existing keyed span and original Text node. It measures the unmodified glyph with controlled spacing, normalizes through a 1 CSS-pixel probe for zoom/scaling, and computes `surface width − native advance`. **No glyph-width correction is hardcoded.** The native caret gets an explicit visible colour. Pointer handling, keyboard navigation and browser selection are unchanged.

Font/style/ancestor changes, font loading, resize and visibility invalidate only active surface occurrences, using the existing local measurement frame. Range rebasing retains the surface and its font measurement. Mixed bidi safety uses one text walk of the affected paragraph at attachment, then a small mutation index over changed/added/removed text nodes. **There is no paragraph-wide text or geometry scan during ordinary typing.** Activation is therefore not strictly constant in paragraph length; the initial bidi check is a documented local admission cost.

Exact single-Cell Mutable-drawn SVG annotations use the surface rectangle through the existing fragment path. Mixed text/artwork ranges and CSS text decorations retain their previous baseline policy and can cross the artwork. Sophisticated multi-selection geometry remains deferred; native selection is not replaced.

## Correctness qualification

**74 tests passed across five focused suites; TypeScript client/server checks passed.** The suites cover the host, both character renderers, range rendering, visual-effect registry and native persistence.

**96 browser assertions passed per rendering path**, with additional screenshot-pixel and counter assertions. Actual browser: Chrome **156.0.8078.76**, macOS, native GPU, headless CDP, 1500 × 990 viewport, DPR 1. This is not Safari/Firefox qualification.

Verified in both paths:

- Painted native caret at leading/trailing boundaries using keyboard and pointer input, including line ends and paragraph ends. Screenshot pixels are checked separately from logical boundaries and DOM Range rectangles.
- Native drag and Shift-selection, including painted selection over the artwork height. Insert before/after, Backspace, Undo/Redo, retained Cell/Text identity and no duplicate source text.
- Plain/rich clipboard payloads and paste/Undo. These use in-memory clipboard events, not the OS clipboard.
- Simulated browser IME start/preedit/commit/cancel, artwork suspension and restoration, and Undo. A physical OS IME candidate-window check was not feasible in this headless run and remains unqualified.
- Changed fonts, a genuinely delayed local font load, narrow wrapping, CSS zoom, positive scaling, scrolling, hidden/visible layout, and safe fallback for rotation/RTL/mixed bidi. Native advance errors in the tested font/scale cases stayed below 0.02px.
- Shared canonical content inside a Table inside vertical Tabs, edits visible in both occurrences, retained mounted Cell identities, Undo, disposal/remount, and stale decode rejection.
- Native serialization and admission into a fresh repository preserve text/property and recreate the surface. Interactive Command-S/vault I/O was not requalified; its existing manual-save path is unchanged.

Representative pixel evidence: [leading caret](experiments/inline-character-host/evidence/direct-native-leading-caret.png), [trailing caret](experiments/inline-character-host/evidence/direct-caret.png), [native selection](experiments/inline-character-host/evidence/direct-selection.png), [line-end caret](experiments/inline-character-host/evidence/direct-line-end-trailing.png). The diagnostic colour is applied to Chrome's native caret; no test overlay paints it.

## Repeated performance measurements

Real annotated Flint Document, plus **two unrelated mounted Documents containing 9,900 characters and 162 annotations**. Each rendering path ran three alternating ordinary/decorated pairs: **60 trusted keyboard events per condition**, followed by three paired batches of 20 synthetic beforeinput events for handler/queued-caret timing. Setup authoring/layout settles before counters start.

All values below are **median / p95 in milliseconds**.

| Path / presentation | Browser Event Timing, trusted input | First caret-verified animation frame, trusted input |
| --- | ---: | ---: |
| Direct DOM, ordinary | 16 / 24 | 14.8 / 16.2 |
| Direct DOM, decorated | 16 / 24 | 14.8 / 16.2 |
| Solid, ordinary | 16 / 24 | 14.9 / 16.2 |
| Solid, decorated | 16 / 24 | 14.9 / 16.2 |

| Path / presentation | beforeinput handler | Caret restoration execution | Cumulative through queued-caret microtask |
| --- | ---: | ---: | ---: |
| Direct DOM, ordinary | 6.4 / 10.5 | 1.9 / 3.5 | 8.4 / 13.3 |
| Direct DOM, decorated | 6.6 / 9.8 | 2.0 / 2.4 | 8.7 / 12.6 |
| Solid, ordinary | 7.8 / 8.5 | 1.9 / 2.1 | 9.8 / 10.6 |
| Solid, decorated | 7.7 / 8.6 | 1.9 / 2.1 | 9.6 / 10.6 |

Direct-DOM per-batch Event Timing p95 was **24/24/24 ordinary vs 16/24/16 decorated**; Solid was **24/24/24 in both conditions**. The earlier prototype's 32ms decorated tail did not reproduce as a consistent regression. These samples establish bounded work and no observed sustained slowdown, not a universal zero-overhead guarantee. Event Timing is quantized; animation-frame timestamps are readiness checks, **not physical paint latency or arbitrary two-frame settling measurements**.

Property-authoring-to-observed-surface-ready latency over six activations was **33.4ms median / 46.7ms p95 direct DOM**, **33.6 / 42.7ms Solid**. This includes canonical authoring, bitmap decode and the first frame observing readiness. Ordinary text remains available until the surface is ready. It is not comparable to the previous experiment's 1.6ms synchronous cached-CSS measurement.

Every measured 20-event batch, in both conditions and paths, recorded:

- **20 local canonical commits**, with **0 broad planning calls, full validations, repository snapshots or projection-tree builds**. A separate canary proves the planning/validation instrumentation runs.
- **0 paragraph text walks, unrelated-Document geometry reads or DOM mutations, worker starts or fetch calls.**
- **380 element-rectangle calls and 360 Range-rectangle calls**, identical with/without the surface. These include existing editor/annotation work; the host adds no ordinary-typing geometry sweep.

Presentation completion and font/layout changes produce **no canonical edit**. Regression tests instrument this directly; the host itself has no editor/repository mutation interface. Existing editing, history, dirty tracking and manual persistence remain authoritative.

## Limits and next increment

Chrome is the only browser qualified. Physical OS IME, OS clipboard, other browsers, unsupported Unicode/grapheme combinations, ligatures and adjacent decorated Cells are not claimed as supported. Bidi and known incompatible layouts fall back to ordinary text. Mixed-range annotation aesthetics remain limited as described above. Static package/raster export, theme colours, designer UI, drop/display capitals and procedural generation remain deferred.

**Go for Increment 2 after review:** no demonstrated native-caret blocker remains for the supported inline case. The owned Initialis adapter must separately qualify generation readiness, cancellation/stale results, asset licensing and its typing budget. Broader browser/IME release qualification remains outstanding. This implementation stops at Increment 1.

Reproduce with [experiment instructions](experiments/inline-character-host/README.txt). Retained evidence: [summary](experiments/inline-character-host/evidence/summary.json), [direct raw results](experiments/inline-character-host/evidence/direct-results.json), [Solid raw results](experiments/inline-character-host/evidence/solid-results.json), [unit results](experiments/inline-character-host/evidence/tests.txt), [type checks](experiments/inline-character-host/evidence/typecheck.txt). Full browser outputs/screenshots remain in `artifacts/inline-character-host/{direct,solid}/`.
