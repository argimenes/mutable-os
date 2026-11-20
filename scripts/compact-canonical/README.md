# Compact canonical text experiment

Test-only, removable qualification. No production entry point imports this folder. No feature registration, native schema change, migration, autosave, viewport virtualization or shadow canonical Cell repository is installed.

Read `../../COMPACT_CANONICAL_TEXT_PROOF_OF_CONCEPT.md` for the decision and limits. This is **not** a production repository implementation or a claim of Flint parity.

- `model.ts`: compact immutable Block state, native structural witness, inline payload checks, affected-Block commits, indexed occurrence subscriptions, local history and restricted structural operations.
- `presentation.ts`: eager occurrence-local editing Cells using `DirectCharacterCells`; separate Cell-free styled runs using existing standoff style rules.
- `editor.ts`: actual `InputGateway`, mounts, focus, selections, measurements and provisional Cells through bounded test adapters. Nominal casts explicitly mark unqualified service interfaces. Unsupported commands throw.
- `cell-oracle.ts`: current `CanonicalRepository`/`TreeCommands` behind the same minimal presentation for controlled comparisons. It is not the full-Flint baseline.
- `fixture.ts`, `model.test.ts`: mixed objects, ownership, references, Unicode, overlapping properties and differential tests.
- `main.ts`, `build.mjs`, `browser.mjs`: isolated production bundle, forbidden-Cell construction probe, trusted browser editing checks and comparative measurements.

The user approved equivalent point rebasing with each serialized form retained. That is the default in this experiment. `pointPolicy: 'legacy'` is solely the differential baseline; production's current inconsistent rebasing remains unchanged. This option is not persisted.

## Reproduce

From the repository root:

```sh
npx vitest run scripts/compact-canonical/model.test.ts
npx tsc --noEmit --project scripts/compact-canonical/tsconfig.json
npm run typecheck
node scripts/compact-canonical/build.mjs
python3 -m http.server 3112 --bind 127.0.0.1 --directory artifacts/compact-canonical/site
```

In another terminal:

```sh
node scripts/compact-canonical/browser.mjs
```

`COMPACT_CHECKS_ONLY=1` runs browser checks without the performance matrix. `COMPACT_RUNS` defaults to three. `COMPACT_CASES=long` selects the additional single 120,624-character paragraph stress case; it uses four dispatch samples per round. `COMPACT_OUTPUT` selects a separate evidence directory. `COMPACT_URL` selects another server URL. Chrome uses a temporary, isolated profile which is removed on completion. The runner uses the installed macOS Google Chrome executable.

The ordinary native fixture defaults to `vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink`; set `COMPACT_NATIVE_PATH` to another ordinary native file when reproducing outside this workspace. Input is read only, with path/size/SHA-256 recorded. No fixture content is copied into tracked evidence. The WeGA and anthology inputs are generated through existing preparation before timing admission; their preparation time is excluded.

Results go to ignored `artifacts/compact-canonical/`: browser assertions, known-gap observations, screenshot and complete stage/memory/CPU metrics. The report retains the significant numerical results. Benchmarks run serially. Do not run tests/builds or another performance suite concurrently. The comparator uses the same minimal renderer as the experiment, not Flint. Only the separate existing Flint benchmarks can speak to production acceptance.

A build-only guard throws if the existing native decoder constructs any text/image Cell during compact admission or read-only rendering. Logical editing allocations are independently counted. Memory samples include post-GC retained JS heap and stage-boundary observations; they do not measure a true peak or isolate GC duration. No viewport virtualization is used.

## Deliberate boundaries

The compact workspace index tests new-resource/Block-ID collisions, but does not implement production admission's reuse, live foreign binding, Object Bank publication or index maintenance after structural changes. Restricted split/join/cross-Block commands are model tests; browser structural routing, clipboard, multicaret, production annotation monitors, active alternatives and exact-history replay are not adapted. The flat read-only surface displays standoff definitions, not a full Document layout. It preserves all canonical data but does not render every Block class, themed Block property, linked-definition overlay, SVG effect, concealment or active alternative. Managed assets require the production asset binder.

Known browser gaps are captured separately from successful assertions: mixed-object IME reconciliation and restoration of a noncollapsed selection on Undo. These prevent a production-readiness claim.

## Separate production sentinels

Build `scripts/cell-materialisation/build.mjs` and serve its output on port 3113, then run `node scripts/compact-canonical/flint-sentinel.mjs`. This reuses the existing full-Flint runner for small/large WeGA, redirecting evidence into this experiment's artifact directory. It does not overwrite the earlier investigation's results. The diagnostic bundle includes probes, so its numbers are not interchangeable with the earlier uninstrumented acceptance series.

The ordinary native production typing sentinel uses the existing command:

```sh
BENCHMARK_OUTPUT=artifacts/compact-canonical/flint-typing node scripts/benchmark-flint-typing-browser.mjs
```

The additional recorded runs used:

```sh
COMPACT_CASES=long COMPACT_OUTPUT=artifacts/compact-canonical/long node scripts/compact-canonical/browser.mjs
COMPACT_CASES=native COMPACT_OUTPUT=artifacts/compact-canonical/native node scripts/compact-canonical/browser.mjs
```

The native follow-up waits for teardown frames before sampling its initial heap, avoiding delayed cleanup of the populated scenario in the earlier matrix. Per-stage timings still exclude those setup frames. Retained-definition ordering was subsequently aligned with the existing native writer and covered by a regression test; final browser checks/build/typecheck passed. The timing fixtures' retention arrays are empty, so no new timing claim is made for that serialization-order correction.
