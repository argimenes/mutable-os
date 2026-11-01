# Mutable Initialis still-image subset

Upstream: https://github.com/azlen/initialis, revision `6cf93f7d3d2922efdbeb86cafa27f39758be9398`.
Asset identity: `6cf93f7d3d2922efdbeb86cafa27f39758be9398-subset-1`.

The 25-file, 194,592-byte dependency subset is recorded, with SHA-256 digests, in the revision directory's `manifest.json`. `transport-manifest.json` records Mutable's separate worker transport. The engine files and uppercase outline JSON are copied unchanged. The two font manifests are reduced to one face and an empty decorative-face list.

## Rights and notices

* Initialis code: MIT, **Copyright (c) 2026 Azlen Elza**. The complete upstream notice is in the revision directory's `LICENSE`.
* Cormorant Garamond 700 uppercase outlines: SIL Open Font License 1.1, **Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant)**. The complete font-specific notice is `render/fonts/OFL-Cormorant.txt`, obtained from https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt. That notice declares no Reserved Font Names. The outline JSON is upstream's unchanged A–Z subset; no TTF is shipped.
* Upstream's generic OFL template is deliberately excluded. The four decorative faces with insufficient redistribution evidence are excluded.

## Dependency audit

`worker.mjs` imports the pinned `render.js`, `fonts.js` and `kinds.js`. The vendoring script walks their static relative-import closure. The default still-image path additionally loads `pattern/hatch`, `frame/rect`, `leaf/acanthus` and `flower/rosette`, plus the two local font manifests and the Cormorant uppercase outline JSON.

The validated schema fixes all dynamic kind selectors, the font, `lFil` and `lBlob` to bundled values. Unknown settings, versions and unbundled assets fail before dispatch. Numeric, boolean, colour, seed and output-size bounds are checked. The 156 persisted settings exclude source text. Source text comes solely from the canonical Cell.

The following upstream branches are unreachable through the adapter and their dependencies are not shipped: remote `use(url)`, whole-font/opentype loading, blob letters, share-code decoding, random preset selection, page/UI dependencies and video encoders. The upstream general worker and its three-worker pool are also excluded. The retained generic source files still contain some unused exports; Mutable never exposes them as commands. Missing JSON may attempt upstream's same-origin `.js` fallback, which is not bundled and fails closed.

Mutable owns one module worker per editor session, admission, bitmap leases and caching. The worker clears upstream scene and last-painter caches after every job, retains at most three bounded-size painters, and terminates after 15 idle seconds or on disposal/fatal failure. It uses native local module URLs, not blob workers or remote imports. Raster result URLs are owned blob URLs.

## Reproduction and upgrades

1. Check out the exact revision above in a clean Initialis checkout.
2. Run `node scripts/vendor-initialis.mjs /path/to/initialis` from Mutable's root. The script refuses another revision, regenerates the subset, full preset/schema, notices and digests. Fetching the official OFL notice is a development-time operation only.
3. Verify the manifest digests and unchanged engine/outline files against that checkout. There is no install hook or runtime download from upstream.
4. For an upgrade, review source and licences again; update the script pin, worker imports, asset identity and validation deliberately. Do not overwrite an existing version's assets. Bump the settings schema if semantics change; unsupported saved versions must remain ordinary text with metadata intact.
5. Run the focused tests and Chrome qualification in `experiments/initialis-adapter`. Review typing, failure and lifetime evidence before enabling a changed distribution.

All runtime dependencies are locally served Mutable assets. Internet-offline use with the local Mutable server is supported. This adapter does not add an application service worker or promise a fully disconnected remote-host/PWA launch.
