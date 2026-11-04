# Cardex — Increment 1 qualification

Implemented 2 November 2026. **Cardex is enabled by default** through `FeatureFlags.cardex`. Open its Desktop icon; search by canonical name or authored alias, or choose **Add**. Saves are explicit: **Save Entity** or Command-S/Control-S in the Instrument. The server must be restarted to load the new route and worker.

## Delivered

- Normal managed application Window with the supplied Cardex branding and vertical **Entities → Claims → Relationships → Facts** tabs. The last three panels are intentionally empty. Switching panels retains the Entity draft.
- A reusable, independently mounted Entity Card, launched with **Open Instrument** or `cardex.entity.open`. Instances have independent editors, drafts, revisions and cancellation state.
- Canonical Name with optional, locally authored semantic ranges; native Mutable paragraph editors for Description; editable authored aliases; managed canonical images through file selection, drag/drop and clipboard paste. Local Name marks are underlined. No configuration dialog or new global shortcut.
- Atomic, revision-checked SQL field/alias saves through the existing canonical ledger, audit outbox and operation receipts. Lost responses retry the same operation. Referenced Entities cannot be deleted; dependency checks are repeated inside the delete transaction.
- Draft guards on record changes, closing and page unload. Form editors and their Undo/Redo survive Save. Image imports can be cancelled. Shared published images are retained when a reference or Entity is removed.

## Architecture and boundaries

The [implementation plan](CARDEX_IMPLEMENTATION_PLAN.md) records investigation, reuse decisions and the file map. Migration **0009** adds nullable JSON columns `Entity.nameStrata`, `descriptionDocument` and `imageRef`; existing GUIDs, plain name, legacy description and alias rows remain in place. Names and Name Strata are committed together. Existing plain Entity/Thesis rename operations now clear Name Strata only when the name changes; a changed legacy Description clears its obsolete rich counterpart.

Description uses the existing Mutable document codec in a separate, record-local editor repository. Save serializes that fragment directly into the Entity row. It creates **no global Resource, Block or StandoffProperty rows**, documentary backlinks or graph relationships. Ordinary typing only marks this local draft dirty. There is no background document save, Markdown sidecar, global graph snapshot or workspace projection update.

Search submits explicitly and returns at most 30 lean rows, with keyset pagination. It does not parse Description or Name Strata. The existing SQLite name/alias indexes and predicates are reused; substring searches can still examine SQL rows, so bounded result size is not a claim of constant-time search.

## Verification

All listed checks passed:

- **49 SQLite regression checks:** Cardex, schema/migrations, foundation and existing Entity operations.
- After the compatibility adjustment, **17 focused checks:** the final seven Cardex tests plus existing Entity and Proposition tests. This includes preserving rich metadata on unchanged plain values and invalidating it on replacement.
- **8 Desktop integration tests**, including local window operations with 50 unrelated Documents; one focused thumbnail-admission test covers serialized loading, failed loads and cancellation.
- TypeScript checking; production server/worker build; production client build (the build reports bundle-size warnings).
- Real Chrome **156.0.8078.76** browser workflow against a temporary Vault, real HTTP/worker/SQLite services and the managed image service. Only default-Vault discovery was stubbed. No user Vault was changed.

Browser coverage: create, edit, alias search, reopen, native paragraph insertion, single-line Name, semantic annotation, alias input focus, file picker/drop/clipboard image ingestion, thumbnail persistence, manual Save, Undo/Redo after Save, retained drafts across placeholder tabs, discard rejection, independent Instrument windows, lost-response retry, stale revision rejection, blocked deletion, successful confirmed deletion and retained image bytes. Mouse/keyboard actions used CDP browser input; annotation range setup used DOM Range. Image paste used Chrome's clipboard and native paste command. Discard/delete confirmation decisions were supplied deterministically by the harness. No browser runtime exceptions were recorded.

With **20 unrelated Documents** mounted and **10,000 unrelated SQL Entities**, typing in the Name and Description produced **zero repository snapshots across editor instances, zero workspace repository changes, and zero network requests**. The browser check instruments the repository prototype, not only the workspace instance.

## Measurements

One-run local SQLite measurements (milliseconds; diagnostic samples, not statistical guarantees):

| Operation | Small baseline | With 10,000 unrelated Entities |
| --- | ---: | ---: |
| Search page | 0.153 | 0.495 |
| Open record | 0.073 | 0.103 |
| Save one new record | 0.869 | 0.640 |

The larger-fixture Save emitted exactly **one affected-record audit event**. Alias authoring adds only the affected alias events. These figures isolate SQL/ledger computation and are not browser-visible interaction latency.

Browser HTTP response-header elapsed times, including local proxy, host admission, filesystem/worker services and SQL: search **85–145 ms**; record fetch **78–150 ms**; Save **161–285 ms** (includes image validation and the exercised rejected/retried requests); deletion **85 ms**. Managed image admission uses the existing disposable validation worker and immutable store; its stage/publish/finalize path is asynchronous. For the 96 × 64 PNG fixture, summed admission-request time was 880 ms for the initial picker import, 638 ms for drop and 686 ms for clipboard paste. Preview decoding is additional; this is not a large-image throughput benchmark. Raw timings are retained in the linked evidence. These are service measurements, not arbitrary two-frame settling or a claim about physical display latency.

## Remaining limits

- Description accepts text paragraphs and local bold/italic/underline/highlight/strike, superscript/subscript, passive URL links and text/background colours. Structural layouts, graph annotations and unsupported annotation data are rejected at Save with field-specific errors rather than silently stripped. It is capped at 40 paragraphs/20,000 Unicode scalars, subject to the existing **32 KiB total operation budget**, which can impose a lower practical limit.
- Saves support up to 100 authored aliases. Detail loading explicitly rejects records exceeding the 200-alias read budget. Conflicts require reloading or discarding the draft; there is no automatic merge or global Entity Undo UI.
- Delete impact covers SQL dependencies and saved references. Unsaved references in other Documents are disclosed as outside this check; Cardex does not scan every open editor. Published images are not garbage-collected when drafts are cancelled.
- Images require the existing active Cavern/managed-assets service, support PNG/JPEG up to 10 MiB, and use its verified original-byte serving/cache with display-sized thumbnails. Thumbnail requests are queued across Cardex windows sharing a host, leaving capacity for image uploads; queued work is cancelled on disposal. No separate thumbnail rendition subsystem was introduced.
- Cardex's rich Description is authoritative within Cardex. Older consumers of the legacy plain `description` column continue to see that legacy value until they are adapted. Generic archival SQL extraction retains the new columns; public projection rules are unchanged. Cross-Cavern image packaging/import is not added by this increment.
- Migration is additive and transactional. Downgrading requires a pre-migration backup or an explicit reverse migration that preserves the new values. The feature flag does not undo a schema migration.
- The final production build uses `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. A default-heap repeat reached Node’s approximately 2 GiB heap limit; the higher-heap build passed. No project-wide build setting was changed.
- Real OS IME sessions, screen-reader qualification and additional browser engines were not separately exercised. Existing native editing machinery remains in use.

Evidence: [browser results](experiments/cardex/browser-results.json), [SQL measurements](experiments/cardex/sqlite-measurements.json), [Cardex shell](experiments/cardex/cardex-shell.png), [independent Entity Card](experiments/cardex/entity-instrument.png). Reproduce the browser check after `npm run build:server` with `node scripts/check-cardex.mjs`.


## Validation follow-up — 2 November 2026

Two reported save failures were addressed:

1. The stored excerpt Name contained actual CR characters before `722.` and after it. Its 49-character length was valid, but the old combined error obscured the single-line violation. Validation now reports hidden line breaks separately from empty/oversized names. **Make Name single-line** is an explicit draft-only action: remove leading/trailing breaks, replace internal runs with a space, retain unaffected Cells and rebase Name Strata using native bounded replacements. One Undo restores the original text and annotation ranges. There is no silent normalization or automatic SQL update.
2. The Description editor could import and render Wikipedia-style links/citation superscripts that Cardex’s restricted annotation whitelist rejected. These passive annotation types, subscript and text/background colours now round-trip. Paste and save share the existing URL/colour admission rules through `interchange/inline-values.mjs`. Graph references/shared definitions remain excluded. Diagnostics identify the field and distinguish an unsupported annotation type from an invalid range.

Verification: 17 focused field/HTML-import tests, 8 Cardex SQLite tests, TypeScript checks, server build, and the real Chrome/SQLite regression mode passed. The browser check exercised inherited CRs, explicit repair, one-step Undo/Redo, retained annotation IDs/ranges, trusted HTML clipboard input and successful Save. Repair caused zero repository snapshots, workspace updates or network requests; rich Description persistence created no global Resource/Block/StandoffProperty/Relationship rows. Unit coverage also included Unicode offsets and 50 unrelated Blocks. The user’s Entity records were inspected read-only and were not modified.

Reproduce after the server build: `CARDEX_NAME_REGRESSION=1 node scripts/check-cardex.mjs`. [Browser evidence](experiments/cardex/validation-regression.json).
