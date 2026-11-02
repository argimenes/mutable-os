# Cardex Increment 2B — Entity Card

Qualified 2026-11-02. The same independently mountable Entity Instrument supplies Cardex and standalone Entity Card windows.

## Delivered

- Compact identity header and horizontal Identity/Documents/Mentions/Claims/Relationships/Dossier tabs. The outer application tabs are retained; Claims/Relationships/Facts remain placeholders there.
- Retained mounted Name/Description editors, contextual Name tools, expandable four-to-six-line Description area, editable aliases, and explicit Save. Rich Description and its plain projection are written atomically in the existing canonical operation.
- Immediate object-URL image preview during managed ingestion, with cancellation, cleanup and failure fallback to the previous image. Existing picker, drop and paste paths are retained.
- Lazy, independently retained tab queries and filters. Documents list title/date/mention count, sorting, pagination and opening through the native Document/session mechanisms. Mentions group logical identity, show highlighted bounded excerpts, filter by excerpt/Document, and page results.
- Source navigation reuses `openThesisSource`; it verifies Block text before selecting. Legacy UTF-16 ranges convert to scalar boundaries. Unsafe boundaries are not selected. Each segment of a multi-Block mention has its own source action.
- Claims list/filter by actual type, participant role and other participant; creation prefills the context participant with an explicit role; attachment and inspection/editing use existing canonical semantic operations and parent revisions.
- Relationships list/filter in both directions, deduplicate self-relations, resolve endpoint labels, and create/edit through the existing canonical Relationship API. Removal remains unavailable.
- Dossier is an explicit placeholder. Unsaved graph forms and unresolved receipts participate in the Instrument's close guard; in-flight writes prevent closing.

## Qualification

SQL tests verify atomic Description projection, distinct Claim participation, context creation/attachment, relationship filtering, logical groups, displayed-excerpt filtering and UTF-16 conversion. They do not introduce a separate graph writer.

Chrome checks verify no detail queries on initial Card opening, lazy Documents/Mentions, actual Claim/Relationship creation, exact source selection, refusal to restore a changed source range, and independent Instrument draft isolation/close behavior. The source-navigation browser cases use already-loaded Documents; unopened files continue through the existing native session path.

The earlier reported Name/Description errors were checked again in Chrome: hidden CR diagnostics, explicit single-line repair, retained annotation IDs/ranges, one-step Undo/Redo, trusted rich HTML paste and persistence without global graph rows all pass.

Local Description typing, with 20 unrelated Documents and 10,000 database Entities present, produced **zero repository snapshots, zero unrelated workspace changes and zero network requests**. Opening Documents measured 77.8 ms HTTP and 323 ms through screenshot verification. These are separate measurements; the screenshot upper bound includes automation overhead.

## Limits

Other-Entity filters, Relationship endpoint entry and attachment to an existing Claim currently accept GUIDs; dedicated Entity/Claim pickers are not included. Claim inspection displays participant/qualifier/evidence identities separately. It does not add qualifier/evidence editing or a predicate model.

Existing rich/plain Description discrepancies are not silently backfilled; the next explicit Entity Save makes the projection consistent. Cached lists intentionally remain stale until Refresh. Multi-Block source actions select individual segments rather than synthesizing a cross-Block selection.

Evidence: [browser results](experiments/cardex-increment2/browser-results.json), [Name/Description regression](experiments/cardex-increment2/name-description-regression.json), [Documents screenshot](experiments/cardex-increment2/2b-documents.png), [Mentions screenshot](experiments/cardex-increment2/2b-mentions.png).
