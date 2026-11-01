Increment 1 production character-surface qualification

From the repository root (dependencies and Chrome installed):

BENCHMARK_NATIVE_GPU=1 node experiments/inline-character-host/run.mjs
CARET_PATH=solid BENCHMARK_OUTPUT=artifacts/inline-character-host/solid BENCHMARK_NATIVE_GPU=1 node experiments/inline-character-host/run.mjs
node experiments/inline-character-host/summarize.mjs

CHROME_BIN overrides the default macOS Chrome executable. Run the two browser
processes sequentially, without CPU-heavy builds/tests alongside measurements.
The harness adapts scripts/benchmark-flint-typing-browser.mjs. It mounts real
Flint with a disposable in-memory native Michelangelo Document, authors the
production style/character-surface property, and adds two unrelated mounted
Documents (9,900 characters, 162 annotations). No user's vault is saved.

Each renderer gets three alternating ordinary/decorated pairs of 20 trusted
keyboard events each (60 per condition), plus three pairs of 20 beforeinput
samples measuring handler, queued-caret execution and microtask settlement.
Property authoring and its initial layout settle before event counters start.
A first-frame timestamp is not a physical-monitor latency measurement.

The Vite test plugin instruments broad repository planning and full validation.
An explicit canary proves both counters work before the measured editing run.
Other counters cover snapshots, local commits, projection builds, rectangle
calls, unrelated Document mutations/geometry, workers and fetch calls.

The production host is used unchanged. Diagnostic CSS makes Chrome's own
caret magenta/non-blinking for pixel assertions; it does not paint a caret.
Trusted keyboard/pointer/composition input uses CDP. Clipboard tests use an
in-memory DataTransfer. The late-font test deliberately requests a delayed
local font, outside typing measurement. Native serialization is admitted into
a fresh repository; it does not exercise a user's Command-S binding or vault.

Raw results/screenshots: ignored artifacts/inline-character-host/{direct,solid}.
Summary and cropped browser evidence: experiments/inline-character-host/evidence/.
The summarizer checks both painted caret boundaries, pointer caret placement,
line/paragraph ends, native selection height, local-work counters, and all
browser assertions. Assertions fail the command on a regression.

Unit/DOM regression checks:
npx vitest run src/rendering/character-surface.test.tsx src/rendering/direct-character-cells.test.tsx src/rendering/range-rendering.test.tsx src/runtime/visual-effect-registry.test.tsx src/persistence/native-resource.test.ts
npm run typecheck

No Initialis dependency, custom caret, keyboard shortcuts, pointer handler,
asset downloader, worker scheduler, export adapter or general geometry cache
is introduced. See CHARACTER_RENDERER_INLINE_HOST_QUALIFICATION.md.
