# Cardex Increment 2A — Search and soft deletion

Qualified 2026-11-02. Implemented behind the default-on `cardexIncrement2` presentation flag, retaining the existing `cardex` application flag. Canonical deletion semantics remain valid independently of the presentation flag.

## Delivered

- Compact table: selection, 32px image, inert name with full title, created date, logical mentions, distinct Documents/Claims/Relationships, View and Delete/Restore. Secondary columns can be hidden.
- Explicit Search and Refresh; Active/Deleted/All; whole-result name/date/count ordering with GUID tie-breaker. Thirty-row pages use an offset plus a query/sort fingerprint. No database-version cursor, subscription, automatic refresh or count cache.
- Search state, current page and explicit selection survive a Card visit. A mutation updates affected displayed records; refreshing reapplies filters to otherwise stale results.
- Migration 0010 adds nullable `Entity.deletedUtc`, active/deleted name indexes, a created-date index and a partial reference index. Soft deletion preserves every reference and Entity field. Restoration clears deletedUtc. Already-satisfied requests do not increment Entity revision.
- Existing canonical ledger, revisions and operation receipts handle individual and explicit bulk requests. A batch contains at most 100 explicitly selected IDs/revisions; each result reports success or conflict. Unknown outcomes retain a retry action. Window close is guarded during mutations.
- Shared `entity-display.mjs` supplies presentation-only deleted labels. Canonical get results keep the original name and expose displayName; resolved-name batches append the suffix. Ordinary canonical Entity/name/alias discovery excludes deleted records.

## Qualification

Cardex SQL tests cover migration, preserved dependencies, revision conflicts, no-op state changes, receipt retries, partial batch conflicts, logical versus segment counts, source eligibility, self-relationships, repeated Claim roles, global count order before pagination, and mismatched query cursors. Foundation migration tests and existing Entity/semantic compatibility tests pass.

Real Chrome verification uses a temporary Vault with 10,000 Entities, 20 Documents and 20,000 annotation rows. It covers compact results, selected-row bulk Delete/Restore, page retention on Back, count sorting, and deleting/restoring an Entity that has Relationships and Claims. Native select values are set through change events by the harness; submissions, checkboxes, buttons and text editing use CDP input. No real Vault records are changed.

## Performance

| Measurement | Result |
| --- | ---: |
| Name-ordered page and batched counts, qualified index | 0.75–0.97 ms SQL |
| Same page without the reference covering index | 12.95–14.08 ms SQL |
| Global Document count order | 36.58–36.86 ms SQL |
| Global mention count order | 36.70–36.86 ms SQL |
| Count order with the earlier index plan | approximately 48–49 ms SQL |
| Explicit browser Search / count-sort HTTP | 87.5 / 155.1 ms |
| Interaction through verified screenshot, Search / count sort | 382 / 439 ms |

The global count query explicitly uses the qualified partial reference index; its plan removes the grouping B-tree. Distinct counts and final ordering still use ordinary temporary SQL structures. No persisted count tables were introduced.

The SQL fixture is in memory. Browser timings are headless Chrome upper bounds including input dispatch, condition polling and PNG capture, not isolated paint latency or an arbitrary two-frame wait. HTTP timings measure fetch response availability separately from rendering.

The original existing-Vault query was also rerun read-only: 852 ms initially, then 68–73 ms; a newly opened connection then took 68–70 ms. Earlier rechecks produced first-query values of 871 and 971 ms followed by similar warm values. This is consistent with cold file-cache costs rather than a recurring per-connection penalty; the cause has not been conclusively isolated. The real Vault was not migrated or modified by these measurements.

Evidence: [SQL measurements](experiments/cardex-increment2/sql-measurements.json), [browser results](experiments/cardex-increment2/browser-results.json), [table screenshot](experiments/cardex-increment2/2a-search.png), [count-sort screenshot](experiments/cardex-increment2/2a-count-sort.png).
