# Character renderer: bounded native geometry experiment

**Recommendation: use native inline advance sizing for the first single-Cell rectangular host. A custom caret or general geometry subsystem is unnecessary for the tested case.** This resolves the Chrome caret discrepancy reported in `CHARACTER_RENDERER_INITIALIS_FEASIBILITY_REPORT.md`; it does not qualify a complete Initialis integration.

Research only, against Mutable `3e35dd5`. No production renderer, input handler, persistence model or feature flag was changed. The isolated harness uses the real Flint shell and its annotated Michelangelo Document, with a locally generated 48 × 48 bitmap capital. Initialis generation is deliberately absent from this geometry test.

## Native sizing result

Keep the keyed Cell span and its original Text node. Give that Text node the same advance as the artwork:

```css
/* Example for this measured font/character, not a universal constant. */
display: inline-block;
width: 48px;
height: 48px;
line-height: 48px;
letter-spacing: 38.9375px; /* 48 - measured 9.0625px native advance */
color: transparent;
/* Artwork is a CSS background; original text remains in the DOM. */
```

The actual caret must have an explicit visible `caret-color`; it must not inherit the transparent text color. The experiment used magenta solely to identify native caret pixels in screenshots.

| Observation | Width alone | Width plus corrected text advance |
| --- | ---: | ---: |
| Artwork bounds | x = 294–342 | x = 294–342 |
| Logical boundary after `B` | 1 | 1 |
| DOM endpoint | Original Text node, offset 1 | Original Text node, offset 1 |
| Collapsed native Range x | 303.047 | 341.984 |
| Native pointer results at 10%, 25%, 75%, 90% of width | 1, 1, 1, 1 | 0, 0, 1, 1 |

The fixed-width box reserved space for following text but did not change the original glyph's advance. Letter spacing corrected that advance without replacing text or intercepting navigation.

**Physical painting was checked separately.** In both rendering paths, the screenshot's native caret occupies x = 341–342, directly against the box's trailing edge. Its normal text-height stroke remains 17px tall; it need not become a 48px custom caret. Native selection visibly covers the artwork box, despite the selected Text Range reporting 48 × 17px. Pixel checks detected a broad blue highlight over more than 45px of the 48px height. Treating Range height as the native highlight's painted height would have produced the wrong conclusion.

[Native caret screenshot](experiments/character-caret/evidence/direct-caret.png) · [Native selection screenshot](experiments/character-caret/evidence/direct-selection.png). These are browser screenshots at 3× capture scale, without painted test overlays.

The comparison also tested zero/tiny font sizes, horizontal scaling, right alignment and enlarged hidden fonts. Zero/tiny fonts produced unusable caret heights; right alignment moved the leading boundary incorrectly. Scaling worked horizontally but added an unnecessary transform. Enlarging the font changed caret height without being needed for native selection. Keep the normal font and correct its advance.

## Interaction qualification

Chrome 156.0.8078.76, macOS, native GPU, headless Chromium with trusted CDP keyboard/pointer input, 1500 × 990 viewport, DPR 1. Both `directDomCharacterCells=true` and `false` passed **62 interaction assertions each**, plus screenshot-pixel, identity, endpoint and performance-boundary assertions in the summarizer. No uncaught browser exceptions occurred.

Covered:

- ArrowLeft/ArrowRight, Shift+ArrowRight and native dragging across the decorated Cell.
- Twelve native pointer positions across the box's width and height, repeated after narrowing the paragraph to 180px and applying 125% CSS zoom. All 36 positions per renderer selected the expected leading/trailing logical boundary.
- Trusted insertion immediately before and after the capital; canonical text, original Text-node retention, Undo and Redo.
- Backspace deleting exactly the decorated character, and Undo restoring its text.
- Plain/rich clipboard payloads preserving the source character once, paste and Undo. Clipboard events used an in-memory DataTransfer, not the operating-system clipboard.
- Browser composition/preedit, replacement with `漢`, commit and Undo. A small experimental composition guard suspends the artwork and spacing during composition. This exercises Chrome's IME protocol, not a physical OS IME candidate window.
- Original Cell/text identity throughout presentation variations and ordinary typing. Deleting/replacing a Cell intentionally removes its old DOM node; Undo is checked for restored content, not resurrection of a deleted JavaScript Text object.

## Performance and bounded work

Four alternating batches per rendering path, each containing 20 trusted insertion/Backspace events: 40 ordinary-text and 40 decorated-text samples. Measurements are from the real annotated Flint editor, not a standalone contenteditable.

| Rendering path / presentation | Event Timing median / p95 | First caret-verified animation frame median / p95 |
| --- | ---: | ---: |
| Direct DOM, ordinary | 16 / 24 ms | 14.8 / 15.6 ms |
| Direct DOM, decorated | 16 / 32 ms | 14.8 / 19.4 ms |
| Solid, ordinary | 16 / 24 ms | 15.0 / 16.1 ms |
| Solid, decorated | 16 / 24 ms | 14.9 / 16.1 ms |

Event Timing is the browser's quantized interaction-duration measurement; the animation-frame column checks logical caret readiness at the first frame. Neither is a physical-monitor latency guarantee, and no arbitrary two-frame settling time is presented as responsiveness. The direct-DOM decorated run had a worse tail, including one additional 8ms Event Timing bucket at p95. This small experiment does **not** establish zero performance overhead or production-level latency equivalence.

Applying the cached surface style and synchronously checking its layout cost **1.6ms median, 2.4ms maximum**, over 12 activations in each rendering path. This excludes image generation and the initial native-advance measurement.

Every 20-event batch recorded:

- **20 canonical commits through the existing local `commitInline` path.**
- **0 repository snapshots; 0 projection tree builds.** No broad planning/validation fallback was taken for these edits.
- Steady-state **380 element-rectangle calls and 360 Range-rectangle calls**, identical with and without the artwork in both paths. The first ordinary batch had 399/378 during initial settling. These are existing editor/annotation calls across the instrumented page, not calls introduced by this experiment.

The surface performs no measurement, generation, scan or extra transaction in the typing handler. One Cell's native advance is measured at attachment; subsequent sizing is CSS. Normal browser reflow still occurs where the larger inline box changes wrapping.

## Cell-aware geometry and remaining work

The existing keyed span's `getBoundingClientRect()` supplied sufficient geometry to predict all tested pointer boundaries, including width changes and CSS zoom. Native hit-testing already agreed with those predictions, so **no pointer interception is recommended** for this first case.

The implementation can remain a small renderer-neutral presentation host:

1. Retain the Cell span and original Text node; attach a non-text visual surface and an explicit native advance. Do not add sentinel characters or `contenteditable=false` islands.
2. Measure the unmodified advance with controlled letter spacing, retain it, and invalidate it when the effective font changes or finishes loading. Recompute spacing when surface width changes. Measurements must use consistent CSS/visual coordinates under transforms. Share existing frame scheduling and measured geometry; do not measure all characters while typing.
3. Suspend the surface during composition and validate that the same eligible Cell still exists before restoring it. Reuse normal canonical editing, history and manual persistence.
4. Where **Mutable-drawn** annotation or multi-selection shapes should cover the whole artwork, let the existing range-fragment consumer use the decorated Cell's box. Native selection needs no replacement. Current `rangeFragments()` still reports text-height geometry: the screenshot's existing annotation underline crosses the artwork at the text baseline. This is a small, separate presentation policy decision, not a failure of caret placement or annotation identity.

Relevant existing code: `src/rendering/direct-character-cells.ts` (keyed spans/Text retention), `src/rendering/standoff-editor-view.tsx` (`pointBoundary`, `restoreBoundary`, `rangeFragments`, Solid path), and `src/runtime/measurements.ts` (per-frame caret measurement cache). The current cache is not a complete shared Cell geometry framework; this experiment does not add one or assume one exists.

Before shipping the host, qualify font loading/style changes, line-end/paragraph-end placement, scrolling/transforms, other supported browsers, and a physical IME/OS clipboard. RTL/bidi, combining sequences, ligatures, multiple adjacent decorated Cells, accessibility and export fallbacks remain outside this one-capital experiment. In particular, do not generalize the measured spacing constant to other fonts or characters.

**Proceed with a lightweight native-layout host when authorized.** No custom caret, custom keyboard navigation or general geometry subsystem is justified by this result.

Reproduction instructions and machine-readable evidence: [experiment README](experiments/character-caret/README.txt), [summary](experiments/character-caret/evidence/summary.json).
