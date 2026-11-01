EXPERIMENTAL INITIALIS INVESTIGATION — NOT PRODUCTION CODE

No application imports these files. The runner uses an isolated Chrome profile,
local Vite middleware and an in-memory copy of a repository fixture. It does not
save a user Document. No Initialis code/assets have been vendored into Mutable.

Prerequisites: existing project dependencies, Python 3, git and Google Chrome.
Run from the repository root. CHROME_BIN overrides the macOS Chrome path.

1. Obtain the exact candidate:
   git clone https://github.com/azlen/initialis.git /tmp/mutable-initialis-investigation
   git -C /tmp/mutable-initialis-investigation checkout 6cf93f7d3d2922efdbeb86cafa27f39758be9398

2. Record the unmodified real Flint baseline first:
   BENCHMARK_NATIVE_GPU=1 BENCHMARK_OUTPUT=artifacts/initialis-investigation/baseline node scripts/benchmark-flint-typing-browser.mjs

3. Run these sequentially, with no other benchmark/test workload:
   BENCHMARK_NATIVE_GPU=1 INITIALIS_MODE=baseline BENCHMARK_OUTPUT=artifacts/initialis-investigation/baseline-paired node experiments/initialis/benchmark-flint.mjs
   BENCHMARK_NATIVE_GPU=1 INITIALIS_MODE=cached BENCHMARK_OUTPUT=artifacts/initialis-investigation/cached node experiments/initialis/benchmark-flint.mjs
   BENCHMARK_NATIVE_GPU=1 INITIALIS_MODE=contended BENCHMARK_OUTPUT=artifacts/initialis-investigation/contended node experiments/initialis/benchmark-flint.mjs

INITIALIS_ROOT may point to another checkout of the pinned version.
BENCHMARK_DOCUMENT_PATH selects another valid native Mutable fixture.
The baseline runner was copied to keep production and established benchmark code
unchanged. The added hooks load browser.js through local middleware. Ordinary
source imports retain the repository's existing Vite configuration.

4. Summarize retained results:
   python3 experiments/initialis/summarize.py

The summary script records this investigation's hardware description. Change it
when reproducing on another machine; do not carry those labels into new results.
For a different INITIALIS_ROOT, also update its asset-manifest source path.

Interpretation:
- "visibleCallbackMs" is the first installed-layout rAF callback, not a monitor
  timestamp; screenshots establish that the artwork actually renders.
- 40 synthetic samples follow the existing benchmark's conventions. 20 trusted
  key events separately record Event Timing and caret observations.
- The many-capital gallery exercises render scheduling and visible canvases,
  not 100 finished annotation hosts. Contention represents document loading.
- The experimental property is deliberately unregistered. Rich clipboard keeps
  unsupported information inert; a production admission adapter is still needed.
- Injected worker/WebGL/font failures are deliberate. A missing font can resolve
  an unusable bitmap. Do not interpret successful Promise resolution as coverage.
- The simple background host has a demonstrated physical-caret defect. It is a
  test vehicle, not an approved implementation pattern.
- No Safari, Firefox, mobile, screen reader, full GPU-memory, large/shared document
  or strict-CSP qualification is claimed.

The report at ../../CHARACTER_RENDERER_INITIALIS_FEASIBILITY_REPORT.md contains
source references, results, limits and an implementation proposal for approval.
