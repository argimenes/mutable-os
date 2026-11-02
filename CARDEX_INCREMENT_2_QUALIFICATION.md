# Cardex Increment 2 — consolidated qualification

Completed 2026-11-02 within the approved 2A/2B/2C scope, with the limitations below. Existing Increment 1 work and its independent Entity Instrument are preserved. `cardexIncrement2` is enabled by default. No new keyboard shortcuts were introduced.

## Stage reports

- [2A — Search and soft deletion](CARDEX_INCREMENT_2A_QUALIFICATION.md)
- [2B — Entity Card](CARDEX_INCREMENT_2B_QUALIFICATION.md)
- [2C — Advanced search](CARDEX_INCREMENT_2C_QUALIFICATION.md)

The approved direction supersedes the investigation's cursor-invalidation ideas: search is explicit and may become stale. Refresh is the only general refresh mechanism. Pagination validates query/sort identity, not database freshness.

## Results

| Check | Result |
| --- | --- |
| Cardex SQL / regex | 14 passing tests |
| Foundation / migration | 24 passing tests |
| Existing canonical Entity / semantic APIs | 11 passing tests |
| Entity lookup / editor resolver | 22 passing tests |
| Total focused automated tests | **71 passed** |
| Chrome Increment 2 scenario | Passed, temporary Vault, 10,000 Entities / 20 Documents / 20,000 annotation rows |
| Chrome Name and rich Description regression | Passed |
| Frontend and server typecheck | Passed |
| Production client/server build | Passed with `NODE_OPTIONS=--max-old-space-size=8192`; existing chunk-size warning remains |
| Final SQLite worker packaging | Rebuilt after final backend changes |

Browser coverage includes table pagination/state, explicit bulk delete/restore, global count sorting, lazy tabs, local typing bounds, standalone Instrument isolation, Description projection, exact/stale source navigation, canonical Claim/Relationship creation, referenced-Entity deletion/restoration and regex error handling. SQL tests cover attachment, conflicts/retries, duplicate incidences, source eligibility, legacy coordinates and isolated regex termination. Subsequent backend-only refinements to excerpt filtering and shared label placement were checked by the focused SQL/worker tests.

Ordinary local typing recorded **0 snapshots, 0 unrelated workspace updates and 0 network requests**. No persisted count tables, automatic result refresh, graph rebuild service, repository snapshot path or broad editor projection changes were introduced.

## Performance summary

SQL fixture: name page plus batched metrics **0.75–0.97 ms**; global count order **36.6–36.9 ms** using the qualified reference index. Without that index, visible-page metrics took about **13–14 ms**. The prior global plan took **48–49 ms** on the same fixture.

| Browser interaction | HTTP response availability | Through verified screenshot |
| --- | ---: | ---: |
| Search / Refresh | 87.5 ms | 382 ms |
| Global count sort | 155.1 ms | 439 ms |
| Open Documents tab | 77.8 ms | 323 ms |
| Regex Search | 280.4 ms | 491 ms |

Screenshot measurements are conservative upper bounds from interaction dispatch through actual rendered output. They include automation polling and PNG capture; they are not pure paint timings, user-hardware guarantees, or arbitrary two-frame settling. Native selects are set through change events by this Mac Chrome harness; text, submissions, checkboxes and action buttons use CDP input.

The slow first existing-Vault query was reproduced read-only: **852 ms**, then **68–73 ms**, with a new connection subsequently taking **68–70 ms**. This suggests cold file-cache costs; it does not establish a definitive cause. No speculative cache or database infrastructure was added. User records were not changed by qualification.

## Boundaries and remaining limitations

- Dossier is a placeholder. Category ancestry, Claim predicate/literal models, a query DSL, relationship removal, qualifier/evidence editing and new navigation shortcuts remain deferred.
- Graph endpoint/other-Entity filters and existing-Claim attachment currently use GUID entry. Dedicated pickers are a UI refinement still to do.
- Multi-Block mentions are counted and displayed as one logical group; each segment navigates separately. Missing, changed or unsafe source ranges are not blindly selected.
- Counts describe saved qualifying Document indexes. Incomplete indexes may undercount; stale/missing/ambiguous/unavailable sources, workspace Resources and non-document Proposition Blocks are excluded. There is no invented Document archive flag.
- Historical rich/plain Description differences are not backfilled automatically; explicit Save updates both atomically. Existing resolved-label caches update through their normal resolution path.
- SQL count sorts still use temporary distinct/sort structures. Regex rejects work exceeding its budget rather than returning misleading partial pages. Full Unicode linguistic Description search is not provided.
- The larger build heap is a successful build configuration, not a diagnosis of the previously reported build-memory problem.

The migration runs through normal backend initialization. Restart a non-watching backend and reload the application to use the new protocol/UI together.

## Reproduction and evidence

Run `node scripts/build-sqlite-foundation.mjs`, the focused tests above, `node scripts/check-cardex-increment2.mjs`, and `CARDEX_NAME_REGRESSION=1 node scripts/check-cardex.mjs`. `scripts/measure-cardex-increment2.mjs` generates the synthetic SQL/index comparison; an optional database path enables the read-only existing-Vault recheck.

Raw measurements and screenshots: [experiments/cardex-increment2](experiments/cardex-increment2/). No tests require mutation of the user's Vault.
