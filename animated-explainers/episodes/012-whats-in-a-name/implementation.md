# Concept 012 · What's in a Name?

*Semantic authoring beyond backlinks* follows one referent through a changing vocabulary. At the centre of the film, “The mathematician” occupies a fixed text range while four different queries are tried. In the next scene, four occurrences of “Dodgson” become four distinct mentions of the same entity in a single reviewed bind.

[Watch the narrated film](../../renders/012-whats-in-a-name.mp4) · [Stage sheet](../../renders/012-stages.png) · [Full-resolution stills](../../renders/012-stills) · [Narration WAV](../../renders/012-narration.wav) · [Portable production package](../../renders/012-whats-in-a-name.zip)

## What the editor does

| Demonstration | Behaviour verified before production | Implementation |
| --- | --- | --- |
| Discover a referent | The entity resolver distinguishes canonical names, curated or imported aliases, and resolved earlier mentions. The saved-index mention stream searches indexed source expressions. The live document inventory can also use its current forms. | [Saved lookup](../../../src/knowledge-sqlite/entity-lookup.mjs), [live document lookup](../../../src/features/entity-references/live-entity-query.ts) |
| Edit the search | The source range and initial text are captured on opening. The query has separate state. The panel retains its source decoration during query editing and preparation. | [Selection capture](../../../src/features/entity-references/entity-search.ts), [query session](../../../src/features/entity-references/ler-session.ts), [source preview and binding](../../../src/features/entity-references/ler-view.tsx) |
| Review several occurrences | Prepare the entity, review document-scoped occurrences, check eligible matches, then bind. Each matching occurrence in this example gets its own standoff record with the same entity ID. The reviewed records are written together. | [Candidate review and commit](../../../src/features/entity-references/entity-candidates.ts), [batch tests](../../../src/features/entity-references/entity-candidates.test.ts) |
| Complete while composing | Typing the double opener enters an authoring mode. The end marker is presented by the editor. Choosing the result in square-bracket mode commits the entity name. In double-parenthesis mode it commits the authored phrase. Both write an entity reference, and their delimiters disappear. | [Scry trigger and commit paths](../../../src/features/autocomplete/index.tsx), [provisional integration tests](../../../src/features/autocomplete/provisional-integration.test.ts) |

The portable package includes the inspected editor source and tests as reference files. In the full repository, the four existing autocomplete, provisional input, candidate batch and resolver-interaction suites passed all 73 tests during production. The editor files were inspected and exercised. The production changes are confined to the animation workspace.

## The worked example

[model.ts](model.ts) contains the supplied sketch, a small teaching authority, the recorded mention forms and the four illustrative notebook blocks. Separate identities for E. Dodgson and Nora Carroll are fictional teaching devices. The notebook and neighbour material is illustrative prose.

[plate.tsx](plate.tsx) uses the series document frames and entity nodes. Each source block keeps its full text in one shaped SVG run, including spaces at visual line breaks. The temporary amber band and the persistent teal range share measured glyph boundaries. The purple query field and the labelled matching rows occupy a separate part of the plate.

[discovery.tsx](discovery.tsx) keeps the same source block and range on screen while the query text and search field change. A surname search yields two illustrative candidates. The full alias narrows the result, and the canonical name then finds the same person. [authoring.tsx](authoring.tsx) stages the four candidate highlights in reading order, shows the prepared entity, and makes the persistent range marks appear together at commit. The four individual connections then become visible.

The inline example uses the partial alias “Dodgson” in square brackets so that the viewer can see the committed wording change to “Lewis Carroll”. The parenthesis example holds “the author of Alice” in place while a separate search is edited. In the later cross-document lookup the lecture note has been manually saved and indexed before its expression is used as evidence.

## Preview and reproduce

1. From the repository or unpacked package, enter `animated-explainers`. Use Node 22.12.0 and run `npm ci` if the locked dependencies are absent.
2. Run `npm run preview` and open `012-whats-in-a-name`. Press Space to play. In Studio, press G and enter frame 2247 for the surname search, 3426 for the reviewed ranges, 3750 for the published mentions, or 5280 for the two committed inline forms.
3. Compare the [complete storyboard and narration](storyboard.md) with the [timed scene manifest](scenes.json). To try a different second query, edit the corresponding stage in `discovery.tsx`. Leave the target in `model.ts` fixed and inspect how the candidates change while the highlight stays put.
4. The included soundtrack is ready for preview and export. After a script edit, use the [local Kokoro and FFmpeg setup](../003-beyond-the-hierarchy/implementation.md) and regenerate speech with the first command. The remaining commands check and render the composition.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/012-whats-in-a-name.m4a --episode-dir episodes/012-whats-in-a-name
npm run typecheck
npm run render -- 012-whats-in-a-name renders/012-whats-in-a-name.mp4 --audio-bitrate=192k
```

Kokoro v1.0’s British English Emma voice reads 24 timed cues at its native rate. The existing generator checks every utterance against its time window and normalises the assembled soundtrack. Studio and the recorder share the included 48 kHz AAC asset. The standalone WAV contains the 24-bit PCM audio decoded from the release.

## Editorial choices

The 3:38 cut continues Volume IV as Concept 012. Query and source are abstract instruments, with the working Scry behaviour retained. The four checks appear sequentially to give the viewer time to read each occurrence. One commit binds the reviewed set. The exact-name comparison illustrates one lookup rule. The teaching corpus and result counts are specific to the film.

## Release verification

The release MP4 decoded through all 6,540 frames. All 24 narration cues aligned with the source soundtrack at 10 ms resolution. The 48 kHz AAC soundtrack measured −16.14 LUFS integrated and −4.96 dBTP. The last words end at 217.28 seconds. The visual review covered 21 frames at phone size, including the original range at commit and the closing phrases in context.

In Studio, “The mathematician” kept the same text and screen coordinates through all four queries. Four reviewed ranges became four individually identified mentions of Lewis Carroll. Seeking backwards restored the earlier selections. All twelve compositions opened in Studio, and all 73 tests in the four editor suites referenced above passed.
