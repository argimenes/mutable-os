# Cardex Increment 2C — Advanced search

Qualified 2026-11-02. `src/knowledge-sqlite/cardex-query.mjs` exports the query compiler/search service independently of JSX for reuse by other Instruments.

## Delivered

Structured AND filters support literal Name, alias, plain Description or combined text; exact **Record Type**; relationship type/direction/other endpoint; Claim type/participant role/other participant; image presence; creation dates; and Active/Deleted/All. Values are bound SQL parameters. Counts and sorting apply to the complete matching result set before pagination.

Regex searches plain Name/alias/Description fields in a disposable read-only Node worker. It never runs in the editor or canonical writer. Limits are 256 pattern characters, 50,000 candidate Entities, 200 aliases per candidate, 16 MiB text, and two seconds including reader startup. Invalid patterns, cancellation and exhausted limits return errors; partial candidates are never passed off as a complete sorted result. The existing JavaScript regex engine is used; no external engine or generic query subsystem was added.

## Qualification

- SQL checks cover Description projection, composed filters, exact type and relationship direction, Claim participant semantics, parameterization, literal wildcard escaping and query-bound pages.
- The isolated reader test covers plain Description matching, invalid patterns, cancellation and pathological timeout. A simultaneous write remains available while the pathological pattern runs; terminating the reader does not terminate the writer.
- Chrome checks regex submission and visible results, plus invalid-pattern feedback. The final regex search measured 280.4 ms HTTP and a 491 ms interaction-to-screenshot upper bound. Submissions use actual browser input; the harness sets native select values through their change event.
- All work is explicitly requested. No per-keystroke requests, database-change subscriptions, revision-based cursor invalidation or background reconciliation were introduced.

Category ancestry, Claim predicates/literals, Dossier associations and a textual DSL remain deferred as approved. Literal Description search uses SQLite's ordinary case conversion; full Unicode linguistic/collation search is not implemented. Regex uses JavaScript Unicode case-insensitive matching.

Evidence: [browser results](experiments/cardex-increment2/browser-results.json), [regex screenshot](experiments/cardex-increment2/2c-regex.png), `src/knowledge-sqlite/cardex-regex.test.mjs`.
