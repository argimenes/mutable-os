# Character renderers: Initialis feasibility and performance

31 October 2026 · Investigation only · **No production integration implemented**

Follow-up: the [bounded native geometry experiment](CHARACTER_RENDERER_NATIVE_GEOMETRY_REPORT.md) resolves the single-Cell Chrome caret discrepancy below using native text advance sizing. It supersedes this report's unresolved-caret conclusion for that tested case.

Mutable source: `3e35dd5d4bdd5b3836c91a73764b1ce39a9370a6`.
Initialis source: `6cf93f7d3d2922efdbeb86cafa27f39758be9398`.

## 1. Recommendation

**Proceed with constraints, inline-first. Initialis is viable as an artwork generator; its embedding component is not a ready-made Mutable editor integration.** Preserve the existing character Cells and text nodes, add a narrowly scoped presentation host, and put generation behind a shared cache and bounded scheduler. Do not build a separate text-layout engine.

The expected normal operation is one user-requested capital. Many capitals are principally a document-loading case, as clarified by the user. Loading should expose ordinary text immediately, reuse saved/cached artwork, and generate missing visible capitals progressively. The 50–100-item results below are loading stress tests, not an assumed everyday editing workload.

The evidence supports this recommendation:

- A real Initialis bitmap decorated an existing character in Flint without replacing its canonical text or creating a rendering history entry. Cached presentation caused **zero additional generation jobs during typing**.
- Boundary edits, logical selection, trusted arrow navigation, drag selection, IME commit/Undo with presentation suspended, plain/rich clipboard text and native serialization checks passed in the isolated prototype.
- **Physical caret placement is not yet correct.** After the decorated `B`, Mutable correctly reported boundary 1, but Chrome placed the caret at x=303.05 inside artwork spanning x=294–342. The native text glyph advances about 9 pixels; the artwork box is 48 pixels wide. Cell identity is not confused. Presentation geometry needs a small, explicit integration contract.
- Initialis rendered a cold capital in approximately 0.49 seconds; warm mixed designs had a 115 ms median. Its default three-worker queue increased typing cost under a 100-job loading backlog. Off-main-thread work still competes for machine resources.
- Rectangular floats actually wrap Mutable's existing character spans. This establishes layout feasibility, **not** full drop-cap editing correctness.

Production release remains gated on caret/hit-testing geometry, lifecycle control, font notices, and export fallback support. Approve a small renderer-neutral host increment first; Initialis can remain the first generation backend. Display/drop modes and multi-character compositions should follow separately.

## 2. Current architecture and reusable mechanisms

Paths and line numbers refer to the Mutable commit above. The legacy `Cell` and `StandoffProperty` classes are not the current reactive renderer's canonical model.

| Area | Source and finding |
|---|---|
| Canonical text and identity | `src/block-tree/types.ts:22` defines `ContentRecord`, `PlacementRecord` and projected `BlockNode`. `src/block-tree/codecs.ts:79` expands standoff text using `[...text]` into `text-cell` records and inline placements. `src/block-tree/commands.ts:899` does the same for inserted characters. Cells count Unicode code points, not UTF-16 units or whole grapheme clusters. |
| DOM-to-Cell mapping | `src/rendering/direct-character-cells.ts:36` maintains keyed spans and their original Text nodes. `data-inline-key` identifies the projected Cell; its canonical character is `editor.node(key).payload.text`. DOM identity, occurrence identity and content identity are distinct. `src/rendering/standoff-editor-view.tsx:780` connects this renderer to canonical/provisional cells. |
| Grapheme semantics | `src/input/graphemes.ts:4` converts `Intl.Segmenter` grapheme boundaries into code-point coordinates, falling back to code points. `src/runtime/text-ranges.ts:4` uses versioned half-open ranges with an explicit `cell` or `utf16` coordinate. A grapheme may occupy several Cells. |
| Persisted properties | Properties live in the text Block's `payload.standoffProperties`. `src/rendering/standoff-styles.ts:66` recognises active inclusive ranges; `src/interchange/ranges.ts:30` maps them through replacements. Insertion at an edge stays outside the range; insertion inside expands it; complete deletion removes it. Point properties have separate affinity rules. |
| Rendering and precedence | `src/rendering/standoff-styles.ts:145` combines legacy cell styles in property order; `:163` compiles runs. `src/runtime/visual-effect-registry.ts:42` supports cell classes, range overlays, text presentation and viewport presentation. It has no character-surface target. `src/rendering/range-rendering.tsx:36` owns roots per property/source, separates configuration from range rebasing, and disposes resources. Reuse these lifetimes and registry concepts rather than creating another annotation pipeline. |
| Existing non-text visuals | `src/rendering/standoff-editor-view.tsx:740` renders actual `image-cell` atoms; they are different canonical content and are inappropriate replacements for decorated text. Superpositions are another structural/semantic mechanism, not a generic glyph-decoration adapter. Range effects render in aria-hidden layers. |
| Selection and caret | `src/rendering/standoff-editor-view.tsx:30` maps DOM positions to Cell boundaries; `:72` restores boundaries; `:77` derives annotation fragments from native text Ranges. `src/runtime/measurements.ts:15` caches a collapsed caret measurement per frame/mount generation/selection. A correct logical index does not establish correct visual geometry. |
| Input, IME and history | `src/input/gateway.ts:75` installs input listeners; `:308` marks composition; `:319` reconciles committed text. `src/input/multi-selection-editor.ts:24` applies canonical replacements. `src/block-tree/commands.ts:926` rebases properties, and `src/block-tree/repository.ts:441` selects bounded commit paths, with broader fallback retained. Presentation completion must never call these editing paths. |
| Clipboard and search | `src/runtime/mutable-clipboard.ts:38` owns structured clipboard handling; `src/input/gateway.ts:445` routes it. `src/runtime/canonical-search-source.ts:8` reads canonical text, independent of artwork. Clipboard/import coordinates and semantic properties must stay authoritative. |
| Layout and invalidation | `src/index.css:162` uses ordinary CSS text flow, `pre-wrap` and `overflow-wrap:anywhere`; spans are not a bespoke line compositor. `src/rendering/standoff-editor-view.tsx:450` measures affected annotation ranges, `:565` coalesces work into a frame, `:639` installs resize/visibility observers, and `:657` tracks local invalidation sources. |
| Geometry limitations | The current range-fragment cache is local to a measurement pass; the caret cache is separate. This is **not** a complete shared cell-geometry cache. The reference design is `src/library/original/modules/speedy/editor-new-2.js:3056`, which retains current/previous offsets. A renderer must participate in shared measurement/invalidation rather than adding its own paragraph scan. |
| Visibility and mounting | `src/rendering/block-outlet.tsx:10` supports retained occurrences; `:34` renders children through `For`. There is no general viewport paragraph virtualizer in this path. Document activity and IntersectionObservers suppress selected work, but are not a renderer job scheduler or automatic offscreen unmount policy. |
| Assets | `src/runtime/managed-assets.ts:5` provides session ownership, aborts, content verification, refcounts and URL revocation. `src/interchange/managed-asset.ts:1` defines content-hashed references. Reuse asset ownership conventions; the current service is not a procedural bitmap cache. |
| Native persistence | `src/persistence/native-resource.ts:26`, `:117`, `:166` capture, serialize and decode native resources. Native retention cannot be safely exported through the legacy tree encoder. The prototype therefore verifies native serialization, not a lossy legacy conversion. |
| Packages and static publication | `src/interchange/package/projection.ts:7` bundles known image embeds with hashed assets. `src/interchange/package/data.ts:1` describes frozen SQLite records, not a generic image container. `src/ink-viewer/worker.ts:1` projects packages through `exportFragment`; `src/interchange/export-plan.ts:18` handles known marks and preserves text when unknown styling is omitted. `src/publication/projection.ts:65` explicitly filters published annotations and assets. New artwork is not automatically supported by these exporters. |

**Architectural consequence:** read source characters from Cells in memory; never OCR artwork, read canvas pixels as text, or use DOM text extraction as canonical edit authority. Retaining the original Text node also makes ordinary browser text selection/accessibility possible. The integration must reconcile the *visual* advance, baseline and hit area with that logical character.

## 3. Proposed renderer-neutral contract

Use a general `text/character-renderer` standoff property with renderer metadata. Reusing bold, inline-image or superposition types would conflate distinct semantics. No new Block type is warranted.

Illustrative persisted property (not implemented):

```json
{
  "id": "property-id",
  "type": "text/character-renderer",
  "start": 0,
  "end": 0,
  "metadata": {
    "version": 1,
    "renderer": "initialis",
    "rendererVersion": "6cf93f7d3d2922efdbeb86cafa27f39758be9398",
    "settingsVersion": 1,
    "settings": { "fullResolvedSettingsExceptText": "..." },
    "layout": {
      "mode": "inline",
      "widthEm": 2.5,
      "heightEm": 2.5,
      "baselineEm": 0.3
    }
  }
}
```

The property uses existing inclusive Cell coordinates. The source character is intentionally absent from settings. Resolve it from the current range; do not retain a second authoritative copy. The `settings` object above is a placeholder for a complete validated settings snapshot, not a proposed literal field name inside Initialis settings.

A small trusted backend API could be:

```ts
interface CharacterRenderer {
  id: string;
  version: string;
  capabilities: {
    outputs: readonly ('bitmap' | 'svg' | 'paint')[];
    maxGraphemes: number;
    cancellation: 'abort' | 'ignore-result';
  };
  validate(settings: unknown): Readonly<Record<string, unknown>>;
  supports(text: string, settings: object): boolean;
  render(input: {
    text: string;
    settings: Readonly<Record<string, unknown>>;
    widthCssPx: number;
    heightCssPx: number;
    pixelRatio: number;
    theme: Readonly<Record<string, string>>;
    signal: AbortSignal;
  }): Promise<{
    surface: TrustedSurface; // bitmap, trusted SVG descriptor or paint adapter
    width: number;
    height: number;
    baseline: number;
    accessibleText: string;
    exclusion?: { kind: 'rectangle'; width: number; height: number };
    dispose(): void;
  }>;
}
```

This is a proposal, not an additional production registry. Prefer extending the existing visual registry with a character-surface capability and a host binding. Its current targets cannot supply an asynchronous, text-derived surface with metrics. Keep three responsibilities separate:

1. **Range binding:** resolve current Cells/graphemes and eligibility; retain property identity and mounted occurrence identity.
2. **Generation/cache service:** validate a trusted renderer ID and settings; load assets, schedule generation, deduplicate in-flight work, lease results and dispose them.
3. **Presentation host:** reserve layout space, install artwork, expose original text once, preserve selection/IME behavior, and invalidate the existing geometry service locally.

Cache identity should include renderer/defaults/assets version, resolved settings, source grapheme(s), resolution bucket, pixel ratio and any effective theme inputs. Exclude document revision, absolute annotation offsets and caret position. Typing before an unchanged capital changes its location, not its design. Compute configuration hashes only when their source changes.

Maintain separate shared-cache ownership and occurrence ownership. Each occurrence retains a generation ticket and cancellation signal; accept completion only if its source/settings/lease are still current and it is still mounted. Dispose rejected outputs. Removing an occurrence releases a lease rather than destroying an image used by another occurrence. Close ImageBitmaps and revoke object URLs at eviction/disposal. Cancellation of queued work and ignoring a completed stale result are different capabilities.

For the first implementation, admit one supported uppercase Latin grapheme occupying one Cell. Unsupported text, missing renderers/assets, conflicts and generation errors retain ordinary text. Do not silently uppercase, strip accents or manufacture replacement characters. Keep unsupported properties in persistence. Reject zero-width properties as character replacements. Initialis can compose `AB`, but multi-character monograms require multi-Cell selection/geometry qualification and should be deferred.

Ordinary styling and semantic annotations remain attached to the original range. Multiple artwork replacements over the same grapheme need an explicit policy: initially reject creation of a conflicting renderer property and show ordinary text for imported conflicts. Do not let asynchronous completion order select the winner. Existing underline/selection geometry also needs to account for the artwork box.

## 4. Layout feasibility

The experiment alters CSS on an existing keyed span; it does not insert an image Cell, wrap canonical Blocks or change text. Geometry was inspected in the real Flint paragraph at a forced 320 px width.

| Mode | Demonstrated result | Essential remaining work | Relative complexity |
|---|---|---|---|
| Inline | 48×48 CSS box containing the original character, with bitmap background. Text wraps normally. | Correct visual advance/baseline, native caret positions, hit-testing, selection/annotation boxes, composition fallback and both rendering paths. | Small-to-medium, focused host work; first increment. |
| Rectangular drop capital | A 64 px float plus 8 px margin shifted four text lines to x=366; the following line returned to x=294. Existing DOM/CSS can perform exclusion. | Restrict initially to paragraph start; validate clearing, short paragraphs, line-height changes, bidi, tables, nested layouts and physical caret/selection behavior. | Medium; no evidence requiring a new line composer. |
| Display initial | A 96 px block-level presentation on the source Cell moved following text below it without a new canonical Block. | Define visual reading order, before/after navigation, paragraph margins, annotation extent and placement restrictions. | Medium; separate qualification. |

The float result is direct browser evidence, not an inference from Initialis's demo. It does not establish that arbitrary mid-paragraph floats or contour-following shapes are safe. `shape-outside` remains deferred.

The observed inline caret defect is a release gate, not evidence that the editor loses character identity. Test a bounded host that aligns the character's visual advance and browser selection boundaries with the artwork. An atomic presentation span or adjusted text metrics may be viable, but neither has been qualified here. Do not solve this by replacing canonical text with an `image-cell`.

## 5. Measured performance

### Method and limits

Apple M1, 8 logical CPUs, 8 GiB RAM, macOS 15.5; Chrome 156.0.8078.76, headless with **native ANGLE/Metal Apple M1 GPU**, not SwiftShader. Viewport 1500×990, DPR 1, Vite development build. No CPU throttling. Runs were sequential; foundation tests ran after the browser measurements.

The real Flint benchmark used an in-memory copy of the existing Michelangelo letter fixture: 9 Blocks, 8 mounted text flows, 660 code points and 31 standoff properties; the measured paragraph contains 499 characters. This is a real annotated document, **not a large-document qualification**. No user Document was saved. The prototype adds one experimental property in the disposable session, before timing starts.

First ran the unmodified `scripts/benchmark-flint-typing-browser.mjs`. Then used an isolated research copy for paired baseline, cached artwork and a 100-job loading backlog. Each typing run has 40 alternating synthetic insert/delete samples, plus a separate 20-event trusted Chrome keydown/keyup sequence. The existing trusted insertion/Undo check also passed.

Synthetic handler time, queued-caret/microtask time and first-rAF callback time are separate measurements. The rAF values are **not paint guarantees**. Trusted Event Timing measures browser keydown-to-next-paint duration, quantised to 8 ms with a 16 ms reporting threshold; all 20 events were reported in these runs. No two-frame settling metric is used. Physical-monitor latency was not measured.

### Typing comparison

Milliseconds, median / p95. Synthetic p95 follows the existing benchmark's index convention; native and renderer summaries use nearest-rank p95.

| Condition | Handler | Handler + queued caret | First rAF | Trusted next paint | Trusted caret verified in rAF |
|---|---:|---:|---:|---:|---:|
| Initial unmodified baseline | 8.7 / 14.1 | 11.7 / 17.0 | 16.5 / 22.5 | Not captured | Not captured |
| Paired unmodified baseline | 9.0 / 15.7 | 11.9 / 19.2 | 16.8 / 23.4 | 24 / 24 | 14.9 / 16.2 |
| One cached capital | 9.6 / 16.2 | 12.9 / 20.9 | 18.3 / 29.0 | 24 / 32 | 15.5 / 19.3 |
| Capital plus 100 queued renders | 14.3 / 20.1 | 18.3 / 23.8 | 25.7 / 36.0 | 32 / 32 | 18.2 / 21.7 |

Trusted worst next-paint samples: baseline 24 ms; cached and contended 40 ms. These are small single-run comparisons, not statistical proof of negligible overhead. Cached presentation preserved the median but did not establish p95 parity. The loading backlog visibly increases handler/queued-caret work; CPU versus GPU contributions were not independently isolated.

Every synthetic typing run recorded **zero repository snapshots, zero newly started workers and zero application-service requests**. Cached and contended runs recorded zero typing-triggered renderer generation. The backlog was scheduled before typing. This does not prove absence of every possible repository scan: full validation/planning functions and unrelated Documents were not independently instrumented in this prototype. No generation callback makes a canonical edit; the repository revision check around bitmap generation/presentation passed.

For the 20 trusted keys, all three paired runs recorded 41 layouts and 72 style recalculations. Total layout time was 28.1 / 36.2 / 43.3 ms (baseline / cached / contended); total style recalculation was 21.2 / 26.1 / 32.5 ms. Identical counts with longer duration support resource contention rather than a new per-key generation loop.

### Generation and cache

| Scenario | Measured result |
|---|---|
| Cold module import | 22.4 ms, local server, fresh browser profile |
| Cold render call → bitmap | 487.2 ms; API service callback 485.3 ms |
| Cold import → first installed-layout callback | 555.6 ms; includes experimental property setup and CSS installation. Screenshot confirms artwork later; this is not a physical-display timestamp. |
| Warm mixed letters/styles, 24 sequential requests | Median 115.0 ms; p95 294.4 ms; worst 718.6 ms |
| Identical cached design, 100 lookups | Median/p95 below timer resolution; worst 0.1 ms; **zero engine calls** |
| Same full settings, three fresh bitmap requests | Identical SHA-256 pixel hashes on this device/run; not a cross-device determinism guarantee |

Warm styles vary letters, seeds, two OFL fonts, circle/rectangle frames and a hatch pattern. They use the already-loaded engine but can incur first-use font/style costs. The 8,000 ms procedural budget is not used as a latency estimate.

Cold worker startup, shader compilation and font/module loading were not separately isolated. The first worker's first reply arrived after 486.3 ms, including generation; the other workers were initially idle, so their first-message delays are **not startup measurements**. The full experiment requested 28 distinct successful asset paths, 245,213 unique bytes; 247 requests including repeats and failure injections transferred 2,215,220 bytes. These totals are not the cold-only payload. The exact observed paths/hashes are retained in `experiments/initialis/evidence/observed-assets.json`.

### Document-loading stress

All jobs use distinct settings, 128×128 bitmap output and the library's default pool. Completed outputs are painted into a canvas gallery, then closed. This measures scheduled generation and visible surfaces, **not 100 independent standoff hosts inside a Document**.

| Instances | Whole batch to layout callback | Per-request median | p95 | Worst |
|---:|---:|---:|---:|---:|
| 1 | 112.5 ms | 94.7 ms | 94.7 ms | 94.7 ms |
| 10 | 633.0 ms | 435.6 ms | 618.0 ms | 618.0 ms |
| 50 | 2,981.7 ms | 1,709.7 ms | 2,937.6 ms | 2,979.9 ms |
| 100 | 6,050.2 ms | 2,752.8 ms | 5,838.2 ms | 6,044.0 ms |

The separate 100-job typing-contention queue had median/p95/worst completion times of 3,780.3 / 5,724.4 / 5,956.9 ms. A loading queue should not submit every capital immediately: user-requested and visible capitals first, nearby ones next, distant ones only on demand. Already-running work cannot currently be cancelled through the public library API.

### Resolution, invalidation and scrolling

| Output pixels | Median / worst, 3 requests | Minimum RGBA bytes per bitmap |
|---:|---:|---:|
| 64² | 7.5 / 113.3 ms | 16 KiB |
| 128² | 9.2 / 9.5 ms | 64 KiB |
| 256² | 11.2 / 11.6 ms | 256 KiB |
| 512² | 8.6 / 20.8 ms | 1 MiB |
| 1024² | 15.9 / 17.6 ms | 4 MiB |

These repeat the same design after the mixed workload: internal scene reuse makes them much faster than novel designs. They do not show that arbitrary 1024 px generation costs only 16 ms. PNGs at all five resolutions are retained for visual review. The 128 px output is usable in the inspected 48 CSS-pixel inline prototype; fine ornament warrants review at actual DPR/zoom. Prefer a small set of resolution buckets over exact resize dimensions.

A new 256 px request, a 512 px DPR-equivalent request and an ink-theme change took 17.0, 17.7 and 17.3 ms respectively with the scene warm. These simulate regeneration inputs; actual OS zoom/DPR transitions and automated theme wiring were not qualified.

Twenty real-editor scroll changes had rAF median/p95/worst 16.8 / 17.4 / 17.9 ms and zero generation. Gallery removal to the next callback took 17.1 ms, not 17.1 ms of synchronous unmount work. Across the later generation/scroll/failure phase, 886 rAF gaps had a 16.7 ms median and 33.3 ms maximum; no Long Tasks were reported. This is not a compositor dropped-frame count, and this observer did not cover the earlier typing phase. Offscreen cancellation, lazy host mounting and virtualized Documents remain unqualified.

### Memory and failures

The prototype's 16-entry cache evicted and closed 8 bitmaps during a 20-design fill. At measurement it retained 1 MiB of RGBA bitmap pixels; disposal reduced owned bitmap handles from 16 to zero. Main-page JS heap was approximately 39.6 MB, including the application. Worker heaps, actual GPU memory, decoded CSS-image memory and process RSS were **not** measured. The source retains per-worker scenes, fonts and canvases beyond the lifetime of a displayed capital; closing the main-thread bitmap alone is not full engine disposal.

Injected worker failure rejected after 19.3 ms. Injected unavailable WebGL2 rejected after 205.7 ms, with worker replacement attempts. Missing font assets **resolved a bitmap** after 373.6 ms, rather than reliably rejecting an unusable glyph. Coverage/assets must be validated independently. A delayed real render completion was discarded by an experimental ticket check, and the newer result won. These establish failure behavior; they do not qualify a complete production recovery service.

### Proposed acceptance gates, derived from these results

- Ordinary typing: no generation, worker creation, asset fetch, canonical edit or repository snapshot attributable to the renderer. Range rebasing alone must not invalidate design pixels.
- Start with one active generation job for interactive use and a small cancellable admission queue for loading. Measure this policy before choosing a larger pool; the stock three-worker backlog increased typing cost.
- Cached input should approach the paired baseline. Treat a repeatable increase of one Event Timing quantum (8 ms at p95) as a regression requiring investigation; the present cached sample reaches that threshold and is not a release pass.
- Show ordinary text immediately; reserve intended dimensions before image arrival where possible. No first-render latency guarantee is justified by this small sample. Use the measured ~0.5 s cold and ~0.1–0.3 s usual warm values for planning, not contractual targets.
- Bound the cache by bytes as well as entries; begin evaluation with small resolution buckets. A fixed 16-entry cap alone could retain 64 MiB at 1024² before engine/GPU overhead.

## 6. Initialis dependency, reproducibility and licensing

The candidate's embedding API and worker source were inspected at the pinned commit: [library](https://github.com/azlen/initialis/blob/6cf93f7d3d2922efdbeb86cafa27f39758be9398/lib/initialis.js#L28), [worker](https://github.com/azlen/initialis/blob/6cf93f7d3d2922efdbeb86cafa27f39758be9398/render/src/worker.js#L61), [renderer cache](https://github.com/azlen/initialis/blob/6cf93f7d3d2922efdbeb86cafa27f39758be9398/render/src/render.js#L25).

**Offline feasibility: demonstrated for local settings and the exercised styles.** Serve vendored files at one origin. The tests loaded Initialis from a local checkout, without using the author's share service. Required entry dependencies include `lib/initialis.js`, `render/src/params.js`, `kinds.js`, `kinds/names.js`, `src/codes.js`, and the worker/render/compose/ink/font modules. Fonts require base/initial manifest JSON and selected `render/fonts/caps/*.json`. Chosen patterns, frames, leaves and other kinds load dynamically. The complete `render/` tree is about 4.4 MiB on disk; the observed 28-file subset is not a complete arbitrary-style distribution.

`random(seed)` adds `src/breed.js`, font-list and kept-design data dependencies; ordinary rendering from settings does not require that random-design path. Avoid share-link inputs and arbitrary `use(url)` modules in persisted properties. Short links can invoke a hosted lookup. Local settings remove that dependency. Page ageing/WebGPU, videos, public-domain sample texts and share-button branding are unnecessary for the basic bitmap backend.

A same-origin module-worker deployment needs module scripts, dynamic imports, worker execution and same-origin font/data fetching. Suggested policy allowances are `script-src 'self'`, `worker-src 'self'`, `connect-src 'self'`, and the chosen image transport (`blob:` or a managed same-origin URL). The research CSS uses data URLs; production need not. Cross-origin embedding takes a blob-worker shim and needs different CSP/CORS permissions. A strict production CSP was not tested. Required APIs include WebGL2 in workers, OffscreenCanvas, Path2D and ImageBitmap transfer. Chrome/Metal is verified; Safari/Firefox and mobile capability claims are not independently qualified.

The library starts up to three workers using hardware concurrency, with a FIFO queue. It has no public priority, AbortSignal, cache lease or pool-disposal interface. `draw()` has no late-completion ticket around its final canvas write. The web component's ticket check occurs before drawing completes; disconnecting it does not terminate the pool. Prefer a small owned adapter/service over mounting `<initialis-cap>` in each Cell. Existing geometry caching is useful, but the engine retains up to 40 scenes per worker and size-indexed painters/canvases; arbitrary resize sizes can accumulate.

**Reproducibility:** `random(42)` selects a design using the current design/font pool; `settings.seed=42` controls procedural choices within a supplied design. Neither is a substitute for complete settings. At this commit the resolved object has 157 keys. Persist resolved settings excluding source text, pin code/defaults/kind/font asset versions, and retain a raster for durable distribution. Growth checks elapsed time (`render/src/ornament.js:34`), so a busy machine can truncate growth differently. The scene cache key excludes the work budget (`render/src/render.js:37`). Three matching pixel hashes here are useful evidence, not a guarantee across budgets, GPUs or versions.

**Licences:** repository code is MIT; retain its copyright and permission notice. Font outlines and other bundled material have separate terms. The candidate lists OFL base fonts and four decorative initial fonts with differing distribution notices. Do not treat a “100% Free” listing as a complete redistribution licence. Exclude those four decorative faces from an initial distributable until their exact grants and notices are verified. [Candidate notices](https://github.com/azlen/initialis/blob/6cf93f7d3d2922efdbeb86cafa27f39758be9398/THIRD-PARTY.md), [font inventory](https://github.com/azlen/initialis/blob/6cf93f7d3d2922efdbeb86cafa27f39758be9398/render/fonts/FONTS.md).

The tested Cinzel and Cormorant Garamond faces have upstream OFL notices. Include each font's copyright and licence, not just a generic OFL template. Outline conversion/subsetting also requires checking modified-version/reserved-name requirements. The OFL does not require ordinary documents produced with the font to adopt the font licence. [OFL terms](https://openfontlicense.org/open-font-license-official-text/), [Cinzel notice](https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt), [Cormorant notice](https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt).

If included, opentype.js, gifenc and mp4-muxer require their MIT notices; they are not all needed for this caps-only still-image path. ET Book, hyphenation patterns, sample texts and trademarks need their own treatment if those optional parts are shipped. Recommend a minimal, audited distribution rather than copying the whole site.

At inspection the public repository had one commit, dated 30 October 2026 in its recorded author timezone. There is little maintenance history to assess. Pin by commit and asset digest, preserve a small patch set if worker ownership is added, and require golden-image plus editing/performance qualification before upgrades. Do not silently re-render old documents with changed defaults.

## 7. Correctness and persistence risk register

| Concern | Evidence/status | Required gate |
|---|---|---|
| Cell identity/source text | Original Text child retained; bitmap completion did not change repository revision. | Read canonical Cells; retain occurrence-specific host identity. |
| Boundary edits and collapse | Before/after insertion rebased the experimental range correctly; deleting its sole Cell removed the property. Undo restored text/range; Redo was exercised. | Verify active presentation disposal/rebinding, not just canonical transforms. |
| Caret and hit-testing | Trusted ArrowRight reached logical boundary 1; **visual caret remained inside the 48 px artwork**. Drag selected boundaries 0–9. | Resolve physical boundary positions and mouse hit areas before release. |
| Selection/other annotations | Cross-cap selection succeeds logically. Native text fragments still describe the small glyph. | Highlight/underline/selection geometry must account for the artwork box. |
| IME | Trusted replacement with `漢` committed and undid correctly. Prototype suspended artwork during composition. | Qualify native IMEs, cancellation and grapheme sequences; never conceal preedit text. |
| Clipboard | Plain copy returned `BU` once. Rich MIME/HTML carried the experimental property. Plain and rich paste preserved text and Undo. Unknown semantics can be retained as inactive data. | Register renderer-property admission; do not promise artwork in ordinary external HTML yet. |
| Accessibility | CSS background adds no accessible image or duplicate label; the original text remains. AX tree was captured. | VoiceOver/screen-reader reading, focus and selection were not tested; no claim of full accessibility qualification. |
| Reload | Native decode/encode retained text and experimental property. | Full close/reopen/remount, shared occurrences and version-unavailable fallback remain gates. |
| Unicode | Shipped Cinzel outlines accepted `A` and both letters of `AB`; lowercase, accented/decomposed letters, CJK, emoji and isolated combining marks were missing. | Explicit coverage validation; preserve ordinary text for unsupported input. |
| Async lifecycle | Experimental stale ticket discarded an older completion; cache handles were closed. | Cancel pending admissions, bound retries and dispose engine resources at session shutdown. |
| Shared/nested layouts | Not qualified with this new presentation host. | Test multiple occurrences, tables, mixed Tabs, annotations and closed/hidden Documents. |
| Packaging/publication | Existing native data preserves metadata; static exporters do not render this new property. | Add explicit hashed fallback-asset discovery and safe static projection after approval. |

Canonical settings belong in the standoff property. Cache entries and generated pixels do not. Automatic rendering must not write asset references into the Document, create Undo entries or trigger background saves. An explicit authored “freeze” operation could persist a raster reference later; generation during viewing is not that operation.

Exported packages should contain settings/version metadata **and a deduplicated raster fallback**, using existing managed-asset hashes and package assets. Add a collector for the known renderer property; current image-embed collection will not find an arbitrary asset reference hidden in metadata. `PackageDataBlock` remains archival relational data. Static readers should retain the actual text once and paint the fallback decoratively, with ordinary text when an image fails. No worker or external Initialis service should be needed to read a published document. Raster creation for an explicit export can occur in the export job without mutating the live Document.

## 8. Smallest implementation proposal — approval required

1. **Renderer-neutral inline host with a static test surface.** Use one uppercase, one-Cell grapheme. Extend the existing registry/lifetime path narrowly. Fix visual caret, hit-testing and selection metrics; preserve keyed text nodes. Test both direct-DOM and Solid fallback rendering. Suspend presentation for composition and unsupported/conflicting ranges. No new Block types or layout engine.
2. **Owned Initialis adapter.** Vendor a pinned minimal distribution with verified font notices. Use local settings only, bounded size/settings validation, shared in-flight deduplication, byte-limited leases and stale-result checks. Start by evaluating one active job; prioritise explicit user requests and visible loading work. A small worker-pool ownership change may be necessary to provide real cancellation/disposal.
3. **Persistence/export support.** Preserve existing manual save/history. Add known-property asset collection and a static raster projection. Verify hashes, deduplication, missing version/assets and offline reading. No broad package refactor.
4. **Qualification before enabling production.** Repeat paired input measurements, including a large annotated Document and unrelated open Documents; directly instrument planning/validation/projection work. Test shared occurrences, real IMEs, accessibility, actual zoom changes, strict CSP and Safari/Firefox. Establish regression budgets from repeated baseline samples.

The eventual major feature should use the project's normal default-enabled feature flag once approved and qualified. The disposable harness needs no application flag because it is never imported by the app. Drop capitals, display initials, monograms, shape-following exclusion and a designer UI remain later decisions.

## 9. Reusable research appendix

The enduring conclusions are independent of Initialis:

- Canonical text, logical ranges and visual advance are separate concerns. A correct Cell lookup does not determine where the browser paints a caret.
- Test a cheap static surface before adopting a procedural renderer. This isolates editor geometry from engine performance.
- A DOM background can preserve searchable/copyable text but does not automatically fix caret, accessibility or annotation geometry.
- Use explicit output ownership and per-occurrence tickets even with a shared design cache.
- Never key generation to paragraph/document revision; offset rebasing, scrolling and paint-only effects should reuse pixels.
- Worker execution needs admission control: main-thread handlers can slow through CPU/GPU contention without extra layout counts or generation in those handlers.
- Source-preserving static export is part of the renderer contract, not an optional Initialis-specific feature.

Reusable protocol: record a real-editor baseline; mount one static surface; test edits and physical caret/selection; substitute a backend implementing the contract; record cold, warm, repeated, 1/10/50/100 loading, contention, resolution, scroll, memory and fault behavior; then repeat on supported browsers and representative large/shared documents. Capture raw samples, source revisions, environment, requested settings, asset digests and explicit failures. Never classify a missing measurement as a pass.

The isolated implementation is in `experiments/initialis/benchmark-flint.mjs` and `browser.js`; reproduction is in `experiments/initialis/README.txt`. Durable summaries and the asset manifest are under `experiments/initialis/evidence/`. Raw CPU profiles, JSON, AX trees and screenshots are under `artifacts/initialis-investigation/` (ignored research artifacts). The prototype is **not** a drop-in production framework and contains no application registrations.

Existing foundation validation: **45 tests passed across four suites** covering grapheme boundaries, direct character DOM, standoff editing and managed assets. The prototype records 15 successful canonical/clipboard/presentation checks, plus trusted arrow/drag/IME observations. The physical-caret finding remains a failed production requirement despite those successful logical checks.

## 10. Decisions for review

No answer was needed to perform this investigation. Before production work:

1. Approve the static-surface, inline host increment before coupling it to Initialis?
2. Accept uppercase Latin, one-Cell initials first, with ordinary-text fallback for unsupported scripts and graphemes?
3. Prefer capitals to retain authored colours, or explicitly follow document theme colours? This affects cache keys and reproducibility.
4. Confirm deferred artwork loading: text immediately, cached capitals immediately where available, then missing visible capitals progressively. This matches the clarified normal-use/loading distinction.
5. Approve settings plus raster fallbacks in exported packages, while ordinary render completion remains non-authoring session work?

**Facts** are source inspections and measurements above. **Hypotheses** include the best caret-host technique, one-worker performance benefits and cross-browser behavior. **Recommendations** are the staged inline-first implementation and loading/cache policy. None of those untested hypotheses is a production pass.
