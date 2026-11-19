# TEI import performance qualification

An isolated production-build harness using the actual interchange worker, native
object-bank admission, application views, Cell editor, and native metadata tabs.
It never opens a user workspace or saves a document. No online reference lookup.

```sh
NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
python3 -m http.server 3108 --bind 127.0.0.1 --directory artifacts/tei-performance/site
# In a separate shell, after the build and other test jobs have finished:
TEI_FLINT=1 TEI_RUNS=3 TEI_LABEL=after node scripts/benchmark-tei-browser.mjs
```

The build script is pinned to baseline `5e2f0f4` and can use the original implementations of the explicitly listed
remediation files while keeping identical profiling and harness code:

```sh
TEI_BASELINE_REF=5e2f0f4 NODE_OPTIONS=--max-old-space-size=8192 node scripts/tei-performance/build.mjs
TEI_FLINT=1 TEI_EXPECT_BASELINE=1 TEI_CASES=small,large TEI_RUNS=3 TEI_LABEL=before node scripts/benchmark-tei-browser.mjs
```

`TEI_CASES=small,large,anthology` selects cases; `TEI_CPU=1` saves main-thread CPU
profiles. `TEI_PREP=1 TEI_CPU=1` profiles the *same* worker preparation function on
the main thread to make its call stack available to CDP. Those CPU-profile runs
are diagnostic, not end-to-end latency results. `TEI_QUALIFICATION_URL` overrides
the local origin. Results and intermediate stage evidence go to the ignored
`artifacts/tei-performance/` directory. Runtime exceptions fail the command.

Small and large are the unmodified, attributed WeGA fixtures. Anthology is an
explicitly synthetic longer correspondence document derived from A041209: its
complete source is retained and 12 sections of 20 paragraphs are appended. Each
paragraph has a name with an unresolved reference, an addition and a deletion.
This is a scaling fixture, not a claimed historical edition. Its native semantic
conversion is complete. It is not rendered or converted lazily.

The timed interval starts after the editor's empty workspace/application services
exist, and includes file reading, fresh worker startup/delivery, native admission,
projection, initial rendering and two animation frames. Source fixture loading
and application bundle startup are outside the interval, as they are outside a
file import into an already-running application. Metadata timing includes click,
mounting and two frames. Typing uses three insertion/deletion pairs on each
letter, with frames between events so native caret restoration completes. The
anthology measures import and metadata without typing; the real Flint benchmark
provides a separate 40-edit regression sample. All times are unthrottled headless
Chrome measurements, not universal latency guarantees.

`conversionTotal` includes the named decode/parse/traversal/reference/assembly/TEI
validation stages: do not add it to those component times. Traversal builds the
semantic DTOs in place; `canonicalConstruction` separately measures Block/Cell/
property materialisation into the canonical model. After remediation, `compactNativeEncodingAndWireValidation` replaces disposable
worker Cell construction/capture/serialization. Full canonical validation is
measured in `admissionTimings.nativeDecodeAndValidation`, followed by staging,
identity/binding checks and canonical commit. Worker `contents`/`placements`
counts are now zero; `cells` describes the complete authored text that admission
materialises. Counts describe records, not all JS heap allocations. Heap samples use Chrome's precise-memory-info option;
they are not peak RSS. `transferAndDispatchMs` includes structured cloning and
message dispatch after the worker stamps its result. The difference between
worker round trip and worker execution also includes worker startup.

The optional native decoder probes further split `nativeDecodeAndValidation`
into `nativeWireParsing`, `canonicalConstruction` (including local wire/field
checks), `canonicalGraphValidation`, `canonicalFreeze`, and
`nativeOwnershipValidation`. These are subsets, not additional pipeline stages.
Block and standoff DTO creation is integral to semantic traversal; main-thread
Cell creation occurs once in native decoding. The probes do not time each Cell
individually or add profiling fields to authored/native data.

For the complete Flint application lifecycle (including unsaved-candidate
registration, the existing workspace projection, and the actual open-tab host),
set `TEI_FLINT=1`. This is the acceptance metric; the default isolated document
view is a diagnostic lower bound. `projectionMs` is a subset of Flint's
`openAndRenderMs`, not an additional duration. `candidateMs` retains the complete
candidate capture/validation; it is not hidden in worker or rendering time.

For a baseline run set `TEI_EXPECT_BASELINE=1` as well: this asserts that the
worker actually used the old canonical construction path. The build overrides
both Vite plugin pipelines (main and worker), not only the main bundle.

The existing real Flint typing benchmark can be reproduced without altering the
checkout's implementation:

```sh
npx vite --config scripts/tei-performance/typing-baseline.vite.mjs
BENCHMARK_URL=http://127.0.0.1:3109/src/interchange/tei/fixtures/README.md node scripts/benchmark-typing-browser.mjs
# Afterward, against the normal current-source Vite server:
BENCHMARK_URL=http://127.0.0.1:3107/src/interchange/tei/fixtures/README.md node scripts/benchmark-typing-browser.mjs
```

Run baseline, final, CPU profiles, builds and tests sequentially. Do not compare
samples collected while another qualification job is consuming CPU/memory.
