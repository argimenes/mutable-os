Bounded character-caret research; not imported by the application.

From the repository root, with dependencies installed and Chrome available:

BENCHMARK_NATIVE_GPU=1 node experiments/character-caret/run.mjs
CARET_PATH=solid BENCHMARK_OUTPUT=artifacts/character-caret/solid BENCHMARK_NATIVE_GPU=1 node experiments/character-caret/run.mjs
node experiments/character-caret/summarize.mjs

CHROME_BIN may override the macOS Chrome executable path. The local Vite fixture
uses an in-memory copy of the existing annotated Michelangelo native Document.
It does not open/save a user's vault. It does not require Initialis or download
fonts/artwork. A canvas-generated single-capital bitmap is a renderer-neutral
stand-in. The application itself receives no production changes.

run.mjs adapts the bootstrap from scripts/benchmark-flint-typing-browser.mjs.
It checks the same Cell with nine CSS sizing candidates, then qualifies the
simplest successful candidate with real Chrome keyboard/pointer/composition
input. Copy/paste uses in-memory ClipboardEvents. run.mjs asserts 62 interaction
checks per rendering path. summarize.mjs additionally asserts native endpoints,
Cell/Text identity, typing caret boundaries, screenshot caret pixels and native
selection coverage. Failed assertions cause a nonzero exit.

Raw results and full screenshots go to ignored artifacts/character-caret/.
The compact summary and cropped browser screenshots are retained in evidence/.
No custom caret or custom selection overlay is installed. Magenta caret-color
and caret-animation:manual make Chrome's own caret easy to locate in pixels.

The composition guard is experimental: it suspends surface CSS during preedit.
A production host must restore only when its original Cell remains eligible.
This experiment stops before that host, font invalidation, or Initialis work.

See CHARACTER_RENDERER_NATIVE_GEOMETRY_REPORT.md at the repository root.
