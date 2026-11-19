# TEI Milestone 1

Use **Import external files as new Ink documents**. `.tei` selects this converter automatically; for `.xml`, choose **TEI P5 XML** explicitly. The result is an unsaved native document. Save manually to a native filename; the XML source is never overwritten.

The document always owns one Page. When a header exists, the existing native tab row opens on **Text**, with editable header content in **Metadata**. No new metadata renderer is installed. Semantic annotations and correspondence records are editable through the existing annotation monitor. Real source Entity definitions use document-local Glosses; import does not create canonical SQLite Entities or relationships.

`teiImport` is enabled by default. Disabling it removes TEI import availability and declaration activation; it does not prevent reading/editing already imported native data.

## Configuration and headless use

The limits are per import, independent of clipboard limits and native persistence:

```ts
new ReactiveEditor(workspace, {
  features: { teiImport: true },
  teiImportLimits: {
    bytes: 128 * 1024 * 1024,
    cells: 8_000_000,
    timeoutMs: 300_000,
  },
});

const result = convertTei(xml, { cells: 8_000_000 });
const fragment = convertTeiFragment(xml); // roots + owned definitions + diagnostics
```

Defaults: 64 MiB input/decoded UTF-8 bytes, 5,000,000 source-content Cells, 1,000,000 XML elements, depth 128, 100,000 Blocks, 500,000 annotation records, 500,000 reference tokens, 100 diagnostic examples, 120 seconds of worker preparation. All values are configurable positive safe integers. The full-document file batch permits 1–20 files with an aggregate ceiling of four TEI byte budgets (at least the existing 40 MiB ordinary-file budget). Non-TEI file limits are unchanged.

A small fixed document/Page/tab/notice reserve is outside source-content budgets. Partial conversion sets `metadata.tei.truncated`, includes aggregated diagnostics and places **INCOMPLETE IMPORT** visibly before the reading tabs. Byte-limit failures admit nothing. Resource ceilings are not performance promises: the existing Cell representation can use substantial transient memory during native capture/admission. A 300,100-Cell native persistence test is included; a 5-million-Cell rendered document is not qualified.

The pure converter uses no DOM, network, AI or live editor. Its internally generated candidate uses native admission, bypassing external clipboard materialisation without changing that allowlist. Fragment insertion UI is intentionally absent: callers must adopt the returned Document-owned definitions explicitly. XML-root targets have no fabricated Document target in fragment results.

## Recovery and limits of fidelity

- Unknown elements retain readable content and supported descendants. Unexpected fields are inert metadata.
- Broken, forward and ambiguous references retain original ordered tokens. Resolution is an import-time observation, not a permanent binding.
- Undefined entities can be retained literally with up to four fresh strict parser restarts. Other syntax errors retain a trusted prefix and an editable literal suffix. Never continue interpreting a parser's guessed post-error events. Even pre-error close events are checked because `saxes` emits a guessed close before signalling a mismatch.
- Inline alternatives use structural native tabs; all readings survive, but paragraph flow can change. No superposition flag is enabled.
- Ordinary line breaks use an actual newline Cell. Other milestones retain explicit Block context, not an unqualified zero-width point. Source page breaks never create Pages.
- Existing Mode split/join restrictions remain. Source IDs and rich metadata can prevent continuation; joins involving Modes remain refused.
- No canonical entity creation, external dereferencing, critical-apparatus engine, source archive, permanent XML binding, automatic save or semantic TextBlock specialisation is provided.

## Qualification

Run `npm test -- src/interchange/tei src/rendering/tei-import.test.tsx` and `npm run typecheck`. The implementation report lists the wider regression suite and baseline failures.

For a real browser check, start Vite and run `node scripts/qualify-tei-browser.mjs`. Set `TEI_QUALIFICATION_URL` if its origin differs from `http://127.0.0.1:3000`. This uses an isolated Chrome profile, the actual import worker, both pinned real letters, trusted CDP text input, Undo/Redo, reload, secondary metadata tabs, cancellation and timeout. It writes QA evidence to `artifacts/tei-m1/browser-smoke.json`; it never saves user documents. Fixture attribution and checksums are in `fixtures/README.md`.
