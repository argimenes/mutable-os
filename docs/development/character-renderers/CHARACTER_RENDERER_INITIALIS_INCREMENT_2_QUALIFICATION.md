# Character renderer — Initialis Increment 2 qualification

**Recommendation: go with constraints for the qualified Chrome workflow.** Ready for Increment 2 review. Increment 3 export/publication work remains deferred.

## Delivered

Select exactly one supported **A–Z** Cell, then press **Ctrl+; followed by I**, or click **𝓘 — Apply Initialis** in the existing annotation bar. Both invoke `character.initialis.apply`; the toolbar uses its existing pointer-selection capture/restore mechanism. The chord uses an unused continuation of Mutable's established Ctrl+; prefix, on both platform families.

The command writes one `style/character-surface` property with renderer `initialis`, a pinned renderer/asset identity, schema version and all **156 deterministic settings**, excluding source text. It preserves the Cell, original Text node and unrelated annotations. Collapsed, multiple-character, lowercase, non-ASCII and combining selections are rejected without alteration. An existing overlapping surface is rejected; adjacent surfaces remain deferred. Applying again creates no history entry. One Undo reverses authoring; Redo restores it.

`initialisCharacterRenderer` is enabled by default and depends on the existing inline-surface/property-rendering flags. No configuration dialog, automatic decoration, designer or generated-pixel persistence was added.

## Architecture and bounded work

* The existing host accepts an owned asynchronous readiness callback, abort signal and occurrence-local visibility/resolution notifications. Static-capital remains available. There is no polling, custom caret or alternate text-layout engine.
* Authoring uses the existing single `setPayloadField` standoff admission path, with annotation origins. It deliberately avoids the snapshot-taking general transaction wrapper. Normal canonical history, dirty tracking and manual Save remain authoritative.
* Complete configuration is observed separately from annotation offsets. Rebasing and caret movement do not revalidate/hash Initialis settings or rebuild range bindings. Readiness only updates the affected occurrence and schedules its existing geometry frame.
* One module worker per editor session; explicit requests precede visible requests, then nearby requests within 300 px. Offscreen requests are deferred. At most 64 dispatch candidates are admitted at once; additional mounted requests wait. Concurrent identical requests share generation and the resulting bitmap.
* A 16 MiB leased LRU cache accounts for retained RGBA bitmap bytes plus encoded PNG bytes. Keys include renderer/schema/assets, source character, complete settings, authored colours, dimensions, DPR bucket and resolution. Output buckets are 128, 256 and 512 px. Active leases are never evicted to admit another result; exhausted capacity falls back to source text.
* Removed queued requests are dropped; abandoned running results are closed without publication. Eviction revokes URLs and closes bitmaps. The worker clears upstream scene/last-painter caches, retains at most three painters, and terminates after 15 idle seconds or disposal. A fatal worker/font/WebGL failure stops generation for the session instead of repeatedly restarting workers. Existing properties and cached results survive; a fresh session can retry.

## Assets, provenance and reproduction

Mutable base: `3e35dd5d4bdd5b3836c91a73764b1ce39a9370a6`, with the existing Increment 1 working changes and this increment. Qualified source digests are recorded with the evidence; no commit was created.

Initialis is pinned to **`6cf93f7d3d2922efdbeb86cafa27f39758be9398`**. The vendored dependency subset is **25 files / 194,592 bytes**, plus Mutable's worker transport and notices. Only Cormorant Garamond 700 uppercase outlines are included. The four insufficiently licensed decorative faces are excluded.

* Code: MIT, copyright 2026 Azlen Elza.
* Font outlines: OFL 1.1, copyright 2015 the Cormorant Project Authors. The actual font-specific notice is bundled; the upstream placeholder OFL template is excluded. [Official font notice](https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt).
* [Asset audit, licences and upgrade procedure](public/vendor/initialis/README.md).
* [Pinned asset manifest and SHA-256 digests](public/vendor/initialis/6cf93f7d3d2922efdbeb86cafa27f39758be9398/manifest.json), [owned transport digest](public/vendor/initialis/transport-manifest.json).

All 25 asset digests were verified. Runtime uses only Mutable's locally served assets: no Initialis website, remote share IDs, arbitrary `use(url)`, general upstream worker pool, video encoders or whole-font parser.

Principal changes: `src/features/initialis/{controller,settings,service}.ts`, generated `preset.json`, `character-surface-host.ts`, `static-character-surface.ts`, `range-rendering.tsx`, the visual-renderer readiness contract, editor lifecycle, feature configuration, binding catalogue and document annotation bar. `.gitignore` explicitly includes this vendored subset while retaining exclusions for other generated public assets.

## Correctness qualification

**48 focused automated tests passed**, covering authoring/admission/history, validation, cache sharing, priority/offscreen admission, cancellation/stale responses, eviction/disposal, fatal-failure circuit, both host paths and shortcut infrastructure. The native persistence check opens a saved Document, applies Initialis, proves dirty state without a disk write or snapshot, explicitly saves, and reopens the complete settings. Existing unrelated annotations and original Cells are preserved. Reactive and server TypeScript checks passed.

**Chrome: 96 direct-DOM checks and 92 Solid checks passed, with no uncaught page errors.** Trusted CDP keyboard/pointer input verified both activation methods, selection/focus retention, property creation and rendered output, duplicate/unsupported rejection, Undo/Redo and failure fallback. Native keyboard boundaries and a twelve-point pointer grid worked across the decorated rectangle. Additional checks covered fonts and delayed font loading, CSS zoom/scale, wrapping, hidden content, mixed bidi/rotation fallback, IME preedit suspension/cancellation, native serialization/reopening, and a shared paragraph inside a Table inside vertical Tabs, including edits, Undo, disposal and remounting.

Injected missing-font, unavailable worker WebGL2 and worker failures each retained ordinary text and the authored property, made no completion edit, remained undoable and terminated their worker. Unit tests additionally cover malformed/unrecognised settings, asset versions and unavailable configuration. The tests confirm one-worker operation, in-flight deduplication and discarded stale results; browser remounts also reuse cached results.

The final two lifecycle cleanups—bounding unused explicit-priority hints and scheduling existing geometry when a ready surface is cleared—were followed by the focused host/service tests. No further browser matrix was added after the requested testing cutoff.

## Browser responsiveness

Real annotated Flint fixture: Michelangelo letter, 660 characters across eight text flows; the edited paragraph has 499 characters. Two additional mounted Documents contain **9,900 characters and 162 annotations**. Chrome headless used the native GPU path, without concurrent compiler/test work during timing. Each condition has three interleaved rounds of 20 trusted keystrokes: **60 samples per condition per rendering path**. Handler/caret samples are separate instrumented beforeinput trials, also 60 per condition.

Values below are **median / p95 milliseconds**:

| Path / condition | Input handler | Queued caret execution | Trusted Event Timing | First verified rAF |
|---|---:|---:|---:|---:|
| Direct / static | 6.6 / 7.9 | 2.0 / 2.1 | 16 / 32 | 14.9 / 15.8 |
| Direct / cached Initialis | 7.6 / 8.3 | 1.9 / 2.0 | 16 / 32 | 14.9 / 15.8 |
| Direct / background generation | 7.5 / 8.2 | 1.9 / 2.0 | 16 / 24 | 14.8 / 15.9 |
| Solid / static | 8.8 / 10.0 | 1.9 / 2.1 | 16 / 24 | 15.1 / 16.3 |
| Solid / cached Initialis | 9.9 / 10.9 | 1.9 / 2.1 | 16 / 24 | 15.0 / 16.5 |
| Solid / background generation | 10.0 / 11.2 | 1.9 / 2.2 | 24 / 24 | 15.4 / 16.7 |

An earlier direct run had cached p95 32 ms against static 24 ms; the repeat had both at 32 ms. The one-quantum p95 increase was **not repeatable**. Solid background generation does show a one-bucket median Event Timing increase, despite unchanged p95 and a 0.4 ms p95 rAF difference. These results do not establish zero CPU/GPU contention. Retain one active worker; do not increase concurrency on this evidence.

The within-run control uses the retained static-capital renderer through the extended shared host. The original, unmodified Increment 1 measurements remain in its separate qualification report; this was not a second checkout of that host.

Steady typing instrumentation recorded **zero** repository snapshots, full validation, broad planning, projection rebuilds, source-paragraph text walks, unrelated occurrence geometry/mutations, settings-key calculations, worker starts or worker-asset requests in all three conditions. The ordinary canonical text commits still occur. Background rendering actually overlapped each background typing round. Artwork completion creates no canonical edit/history entry or save.

Cold activation to a decoded surface observed at a frame boundary was **325 ms direct / 312 ms Solid**. This includes shortcut dispatch and host readiness, not just generator execution. Solid's first worker job took **217 ms**, including its initial readiness wait; worker module-body/font-catalog/WebGL setup measured **59.6 ms**. That setup figure excludes module-fetch time. Cached restoration reuses the bitmap with no generation; a separate end-to-end cached-ready latency distribution was not collected. rAF is an observation boundary, **not a physical paint measurement**.

## Loading stress and lifetime

Direct-DOM loading used distinct seeds, not repeated cache keys:

| Distinct designs | First ready frame | All ready | Peak dispatch queue |
|---:|---:|---:|---:|
| 1 | 176 ms | 176 ms | 0 |
| 10 | 160 ms | 1.23 s | 9 |
| 50 | 157 ms | 6.22 s | 49 |
| 100 | 224 ms | 10.39 s | 64 |

All designs rendered, without another worker start or generation failure. Peak accounted cache storage was **16,690,343 bytes (15.92 MiB)**, below the 16 MiB bound, while unleased earlier entries were evicted. These are loading stress cases, not an assumed editing workload. The same stress matrix was not repeated on Solid after the request to limit testing; its activation, typing, nested/shared occurrence and failure regressions were exercised.

The Solid browser session recorded one worker, 50 generated results, 15 cache hits, no failures before injection, and approximately 5.44 MB retained cache storage. Unit tests explicitly verify in-flight sharing, queued cancellation, stale bitmap closure, leased-entry protection, URL revocation and termination. Accounted bitmap/PNG bytes are **not** a measurement of total JS heap, worker heap, decoded CSS images or GPU texture memory.

## Constraints and remaining release gates

* Chrome trusted browser input is qualified. Safari and Firefox are **unqualified** in this pass; Firefox is not installed. Actual OS IME, OS clipboard and screen-reader testing remain release gates. This narrowed pass did not repeat clipboard/AX API sampling; the original Text node is retained and the Increment 1 clipboard evidence remains the reference.
* The browser ran with external DNS disabled and a same-origin script/worker/connect CSP. Reopening and fresh generation succeeded using the local Mutable server. This establishes Internet-offline local operation, not a fully disconnected remote-host/PWA launch. Existing application styles require inline-style allowance; raster images allow owned blob/data URLs.
* CSS zoom/scale and resolution invalidation are covered. Physical multi-monitor/DPR transitions and non-Chrome browser resource behaviour remain unqualified.
* Supported authored defaults use one bundled font and fixed kind selectors. Unknown versions/assets fail to ordinary text with metadata intact. Adjacent surfaces, richer Unicode, designer controls and export raster fallbacks remain deferred.

## Evidence and commands

[Raw direct results](experiments/initialis-adapter/evidence/direct/results.json), [raw Solid results](experiments/initialis-adapter/evidence/solid/results.json), [summary](experiments/initialis-adapter/evidence/summary.json), [direct screenshot](experiments/initialis-adapter/evidence/direct/activation.png), [Solid screenshot](experiments/initialis-adapter/evidence/solid/activation.png). Test/typecheck logs and source digests are in the same evidence directory.

```sh
node scripts/vendor-initialis.mjs /path/to/pinned/initialis
npx vitest run src/features/initialis/initialis.test.ts src/rendering/character-surface.test.tsx src/input/bindings.test.ts
npx vitest run src/persistence/native-session.test.ts -t 'marks Initialis authoring'
npm run typecheck
BENCHMARK_NATIVE_GPU=1 node experiments/initialis-adapter/run.mjs
BENCHMARK_NATIVE_GPU=1 CARET_PATH=solid SKIP_STRESS=1 BENCHMARK_OUTPUT=artifacts/initialis-adapter/solid node experiments/initialis-adapter/run.mjs
node experiments/initialis-adapter/summarize.mjs
```

The smallest next step is review of this increment, followed by the remaining platform release gates before broader enablement. No Increment 3 implementation is included.
