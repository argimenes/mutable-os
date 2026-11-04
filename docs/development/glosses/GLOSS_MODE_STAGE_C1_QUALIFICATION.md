# Gloss Mode C1 — Relationship Foundation qualification

Date: 3 November 2026. Scope: C1 implementation and read-only C4 infrastructure investigation. C2/C3/C4 interfaces have not been implemented.

## Result and implementation

C1 is implemented behind `features.glossRelationships`, enabled by default. It also requires `glossMode`. The existing Document registry remains authoritative; there is no new Block type, database table, graph repository, autosave or keyboard shortcut.

- `src/features/gloss/relationships.ts`: versioned decoding, suggested/custom types and copy remapping. Version 1 and the existing unversioned `{type,toGlossId}` form are understood. Malformed and future-version entries remain stored and receive diagnostics.
- `relationship-controller.ts`: canonical create, change-type, remove, reverse, retarget and restore operations, also registered as `gloss.relationship.*` commands. These are foundation APIs, not new user-facing controls. New links require unique, live endpoints in the owning Document. Self-links and exact source/type/target duplicates are rejected; different types are allowed. Custom types are trimmed, single-line strings of at most 128 Unicode characters.
- `relationship-index.ts`: derived adjacency, endpoint status, per-Gloss summaries and work counters. Imported cycles, self-links and duplicate edges survive. Missing, ambiguous, deleted, unsupported and explicitly unresolved relationships are distinguishable and excluded from active counts where appropriate.
- `src/block-tree/gloss-plan.ts`: changed definitions and edge IDs are derived from old/new canonical records. Undo/Redo uses the same admission path. The index decodes changed edges only; endpoint identity/deletion changes reevaluate their incident edges.
- `session-index.ts`: link-only edits retain Register rows and skip source-geometry notifications. The graph subscriber looks up affected record keys rather than iterating every Document graph on typing.
- `controller.ts`: Gloss deletion now retains incident relationships. Removing an anchor still leaves an active, unanchored Gloss.
- `src/block-tree/clipboard.ts`, `commands.ts`, and `src/interchange/{materialize,serializer}.ts`: copy identity remapping, preservation of outside-copy targets, orphan retention and correct registry ownership for whole-Document copies. Configuration/editor wiring owns and disposes the service.

Existing repository transactions, history, dirty tracking, mounted projections and manual persistence are retained. A stale edge token prevents overwriting a relationship changed in another view. Reversal moves the same relationship ID between source maps in one operation. Unknown extension fields survive supported edits; opaque entries can be explicitly deleted and restored through Undo.

## Canonical example

The browser fixture saves an edge from its unanchored Gloss to `g-0-0`. Its source is implicit in the containing definition:

```json
{
  "metadata": {
    "gloss": {
      "version": 1,
      "localId": "orphan-local",
      "links": {
        "RELATIONSHIP_UUID": {
          "version": 1,
          "type": "custom relation",
          "toGlossId": "g-0-0"
        }
      }
    }
  }
}
```

`RELATIONSHIP_UUID` abbreviates the actual generated ID in `artifacts/gloss-stage-c1/saved-document.ink`. Gloss local IDs, definition IDs and anchor-segment IDs remain distinct.

Deleting either endpoint retains this edge with a deleted-endpoint diagnostic. Restoring the Gloss reactivates it when both endpoints are uniquely resolved. Retargeting or explicitly deleting the relationship are separate canonical operations. C2 will provide their controls.

## Copy, move and identity

| Operation | Qualified behaviour |
| --- | --- |
| Copy a fragment | Fresh Gloss and edge IDs; internal endpoints remapped. Outgoing targets outside the copied closure retain their original ID and an explicit unresolved descriptor, even if the destination has a matching ID. |
| Duplicate a Document | Fresh Document, Gloss and edge identities. Both the existing Block-copy command and whole-Document fragment insertion retain orphan definitions and install a Document-owned registry. |
| Move within a Document | Identities and graph remain unchanged. |
| Move a Block across Documents | Existing `linkedSourcesForMove` retains definition ownership and adds external-definition provenance to moved anchors. The original graph stays in its source Document; the destination does not acquire a Gloss graph or editable foreign Gloss. This is not relationship transfer. |
| Reopen native identity | Existing canonical identities and metadata survive normal native Save/reopen. Identity-preserving package materialization retains Gloss and edge IDs. |

The descriptor is `{version:1, reason:"outside-copy", originGlossId, originResourceId?}`. An existing descriptor is retained on subsequent copies. Ambiguous copied local IDs are not guessed. Future-version payloads keep their existing fields; where a target ID is readable, copying adds provenance rather than interpreting their unknown schema.

`originResourceId` alone is not a global resolver: it may be absent, and the same resource identity can exist in different vaults. The descriptor retains the original Gloss ID and is explicitly versioned. A future explicit resolver should optionally add `originCavernId` when known and require the user to select/verify the source Document. No automatic cross-Document binding is introduced.

## Automated and browser qualification

**76 tests passed across 8 focused suites:** C1 relationships (13), existing Gloss authoring (16), Stage B (5), Block clipboard (3), linked annotations (1), definition ownership (11), fragment clipboard (18), and native packages (9). `npm run typecheck` passes for client and server.

Coverage includes different types between the same pair; duplicate/self policies; cycles; missing/ambiguous targets and ambiguous edge identities; tombstones/restoration; anchor deletion; split/join and repeated occurrences; foreign ownership; stale edits; stable IDs through Undo/Redo; independent and native copies; opaque versions/extensions; explicit repair; feature-flag disablement; incremental publication; and bounded typing work.

The Chrome fixture uses a real Flint workspace, a 32,400-character annotated Document with 243 Glosses and 972 initial relationships, plus an unrelated 18,000-character Document. Relationship foundation calls run through the public controller API because C1 intentionally has no authoring UI. Trusted Chrome input exercises Undo/Redo, typing, Gloss editing, navigation and manual Command-S. The fixture checks retained editors/Cells and selection, unrelated-view isolation and unchanged source geometry for link-only edits.

Normal Save writes a physical `.ink` file through the existing native route. The entire workspace session is disposed and a fresh session reopens that file. Registry equality, edge identity/direction and orphan endpoints are verified. The disposable vault is removed; the saved artifact is retained for inspection. No user's vault is modified.

See `artifacts/gloss-stage-c1/qualification.json`, `saved-document.ink` and browser screenshots. The final browser run passed **35 checks**.

## Performance and bounded work

A single-edge edit decodes/evaluates **one edge**, publishes affected summaries only, retains unrelated Register row objects, and causes **zero repository snapshots, child-tree builds, unrelated projection writes, source-geometry invalidations or network requests** in the instrumented browser fixture. Text edits and automatic offset rebasing produce **zero definition reads, edge decodes/evaluations, node publications or summary publications** in the relationship index.

Canonical costs remain proportional to the owning registry, as anticipated. The browser scaling fixture uses 400 Glosses, two projections of the same Document and five measured edits per size. Copy time covers the initial root-record/registry copy; validation time is the explicit admission preflight. Commit time additionally includes the repository's own admission, inverse/prepared/previous-record copying, history and projection work. History bytes are serialized entry size, not a heap allocation estimate. Per-column medians need not sum exactly.

In the mounted Flint fixture, the controller call took **21.4 ms** (1.2 ms initial copy, 0.9 ms preflight, 19.1 ms commit). This measures synchronous completion of the foundation operation; no relationship UI exists to measure visual interaction latency.

| Edges | Controller call | Initial copy | Preflight | Commit | History storage | Two projection reconciliations | Index update | History entry |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 400 | 17.5 ms | 1.3 ms | 0.5 ms | 15.6 ms | 2.6 ms | 1.2 ms | 0.1 ms | 152.9 KiB |
| 1,600 | 30.9 ms | 2.2 ms | 0.9 ms | 27.8 ms | 4.7 ms | 2.2 ms | <0.1 ms | 292.2 KiB |
| 6,400 | 73.8 ms | 4.7 ms | 1.8 ms | 67.4 ms | 10.9 ms | 5.1 ms | 0.1 ms | 854.3 KiB |

The earlier browser run measured 106.7 ms at 6,400 edges, versus 73.8 ms in the final run (both artifacts retained). This variation reinforces using the work counters and scaling trend rather than treating one timing as a guarantee. The measured bottleneck is the existing whole-registry canonical path, not adjacency maintenance. Large edge sets can make a relationship commit a noticeable main-thread operation. A narrowly scoped follow-up for review would introduce validated Gloss-definition/edge patches with compact inverse history and targeted projection field updates. It must retain canonical validation, Undo/Redo and owner-local dirty tracking. **No such transaction refactor was undertaken in C1.**

The paired real-Flint typing benchmark retains Gloss presentation and the same 972 relationships in both runs; only the relationship feature is disabled/enabled. It includes 1,001 Explorer entries and 40 alternating insert/delete events:

| Relationship index | Synchronous handler median / p95 | Handler + queued caret median / p95 |
| --- | ---: | ---: |
| Disabled | 17.9 / 29.6 ms | 45.2 / 68.7 ms |
| Enabled | 13.4 / 20.1 ms | 34.7 / 51.1 ms |

These runs show **no measured typing regression**, not evidence that relationships improve typing speed. Timed samples dispatch `beforeinput`; separate trusted Chrome character input and Undo pass. Headless frame times are not claimed as physical display latency. Both runs record zero snapshots, service requests and worker starts; the enabled run records zero relationship-index work. Artifacts: `typing-disabled/results.json` and `typing-enabled/results.json`, with CPU profiles.

## C4 Mermaid investigation — no implementation

Mutable already installs **Mermaid 12.2.0**. `scripts/build-structured-assets.mjs` bundles a local renderer; `src/rendering/structured-resource-view.tsx` lazily loads `src/structured/mermaid-view.ts` for `.mmd`/`.mermaid` resources. There is no dedicated Mermaid Block: the existing structured-resource Block provides source-backed, read-only preview and source-copy controls.

`mermaid-frame.ts` uses strict Mermaid configuration, disables HTML labels, and strips executable/embedded SVG elements, event attributes and external references. Rendering runs in an opaque sandbox iframe with a restrictive CSP and network disabled. Existing guards limit source size/lines, edges, SVG bytes and element count. `diagramFrame` provides cancellation, token-checked completion, an eight-second timeout and an error fallback. These controls are reusable; a timeout alone is not a guarantee of a hard CPU budget.

The current source guard also rejects words such as `click` even inside labels. A generated-source adapter needs tested label encoding compatible with this guard; it must not simply relax security settings to accept arbitrary labels. SVG click navigation is not currently provided.

The Flint Document graph (`src/features/flint/graph/document-graph.tsx`) supplies useful view-lifecycle, selection and navigation patterns, but consumes entity inventory and uses a separate Three.js renderer. Its Entity/SQL model should not be reused as Gloss storage.

Recommended C4 approach:

1. A pure, deterministic adapter over bounded C1 graph extraction. Map local identities to generated safe Mermaid node tokens; keep labels separate, escaped and length-limited. Sort nodes/edges consistently. Preserve directed cycles and shared nodes; represent missing, ambiguous and deleted endpoints explicitly.
2. A session-owned derived view, with no canonical source mutation. Instantiate it only while visible; subscribe to relevant graph/label changes, coalesce redraws and cancel stale renders. Impose a small node/edge budget before Mermaid runs. Ordinary offset rebasing must not redraw it.
3. Reuse the sandbox/SVG controls. Navigation should use a trusted, bounded node-ID-to-Gloss mapping and a validated frame message bridge, never generated Mermaid `click` directives or arbitrary executable callbacks. Resolve current anchor ranges through the existing Gloss index at navigation time.
4. Keep a **live derived view** distinct from an explicitly copied/exported Mermaid snapshot. The latter is user-requested output and does not become a second authoritative graph.

Existing view hosts can display this derived panel without changing Block data. C3's argument tree and C4's graph should remain independent projections over C1 adjacency. After C2 provides relationship authoring/repair, C4 may be worth reviewing before C3 because it exposes cycles and shared nodes directly; this is a recommendation only.

## Remaining limits and next step

Relationship authoring/repair controls are deferred to C2. Cross-Document relationship transfer/resolution is not implemented. Large-registry commit latency and history size remain the principal measured concern; initial graph construction also reads the local registry when first requested. Multi-Document copy batches and a general foreign-definition transfer workflow were not separately qualified.

C1 stops here for review. No C2, C3 or C4 implementation is started.
