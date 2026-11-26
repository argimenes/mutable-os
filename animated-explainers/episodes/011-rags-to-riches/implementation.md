# Concept 011 · RAGs to Riches

*A chunk is not an island.* Volume IV opens with a 132-second worked example of retrieval over text that readers have already annotated. The question concerns observers’ assessments of Napoleon’s military leadership. The decisive and reckless judgements remain attached to their observers throughout retrieval and generation.

[Watch the narrated film](../../renders/011-rags-to-riches.mp4) · [Review sheet](../../renders/011-stages.png) · [Full-resolution stills](../../renders/011-stills) · [Narration WAV](../../renders/011-narration.wav) · [Portable production package](../../renders/011-rags-to-riches.zip)

## Follow one retrieval

| Document | Original fictional passage | Role in the demonstration |
| --- | --- | --- |
| A | Napoleon examined the map. He pointed towards the river. The officers prepared to depart. | Two mentions share one person across the first cut. The pointing action informs an alternative cut. |
| B | The Emperor returned to Paris. | The historical reading supplies Napoleon Bonaparte, Paris in France and the return journey. The Emperor passes the Napoleon constraint. |
| C | Our commander was decisive in the face of uncertainty. | The selected candidate. Officer A’s attributed characterisation supplies the entry into the graph. |
| D | He was reckless when confronted with opposition. | A second Trait Statement links the same person to Aide B and the original source words. |
| E | Bonaparte ordered the troops to advance before dawn. | The military-order Claim Statement preserves the issuer, recipient, action, time and supporting passage. |
| F | The Emperor was renowned for his military leadership. | Its title resolves to Augustus and falls outside the selected entity constraint. |

The [illustrative model](model.ts) stores each document’s original text. A derived chunk references a document and a half-open character interval. The source-range strip uses character offsets, while the standoff underlines use measurements of the shaped glyphs. Moving the boundary changes the two derived intervals. The source and its mention associations retain their identities.

The text-only input and the enriched input in [preparation.tsx](preparation.tsx) share B’s source range. Existing mention and claim references supply the extra fields. The historical, rhetorical and literary readings refer to overlapping ranges of that same passage. Their classifications are explicit choices in the teaching corpus. The bars depict a possible embedding of the entire input.

The two-dimensional projection and its B/C/F candidate set are authored illustrations. Entity filtering operates on the mentions in those candidates. It keeps B and C. C is the selected entry because its passage addresses the question with an attributed judgement.

In [retrieval.tsx](retrieval.tsx), C’s words, its mention C1 and the Napoleon entity appear in sequence. The same C evidence card moves into the graph as the second trait and the order enter. Expansion follows the characterised-subject and order-issuer relationships of the resolved person. A and B also mention Napoleon, but this selection calls for attributed judgements and an order. F refers to a different person.

The context combines C, D and E, deduplicated by document and range. It includes two attributed traits and the order’s participant roles and timing. The example serialisation in the model retains the source intervals, words, identities and attributions. The film sends that context and the research question to the language-model component and shows an authored illustrative response with references to C and D.

## Source and recording

The episode lives in `animated-explainers/episodes/011-rags-to-riches/`. [scene.tsx](scene.tsx) registers the soundtrack in the composition and coordinates the series plate, question, context handoff and bookends. [art.tsx](art.tsx) provides the derived chunk treatment, the abstract embedding glyph and the measured passage view. The series’ existing document frame, range marks, mention and entity nodes, statement plate, graph links, traversal pulses, fonts, captions and Remotion recording command supply the other visual elements.

1. From the repository or unpacked package, enter `animated-explainers`. Use Node 22.12.0 and run `npm ci` if the locked dependencies are absent.
2. Run `npm run preview` and select `011-rags-to-riches`. Press Space for playback with narration. Press G and enter frame 645 for the adjusted boundary, 1152 for enrichment, 1914 for the identity filter, 2664 for graph expansion, or 3030 for the assembled context.
3. Compare the [storyboard and complete narration](storyboard.md) with the [timed manifest](scenes.json). To try a second classification, change F’s resolved identity from Augustus to Napoleon in the model and inspect the filter again. The source wording stays the same and F now passes. Restore its original identity to reproduce this edition.
4. The included soundtrack is ready to render. For an edited script, use the [local neural voice and FFmpeg setup](../003-beyond-the-hierarchy/implementation.md) and the first command below. The remaining commands typecheck and record the film.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/011-rags-to-riches.m4a --episode-dir episodes/011-rags-to-riches
npm run typecheck
npm run render -- 011-rags-to-riches renders/011-rags-to-riches.mp4 --audio-bitrate=192k
```

Local Kokoro v1.0 generated all 17 cues using the British English Emma voice at its native rate. The generator checks each utterance against its scene window and normalises the assembled track. Preview and recording share the included 48 kHz AAC asset. The standalone 24-bit PCM WAV is the soundtrack decoded from the finished MP4.

## Editorial choices and limits

The 132-second cut gives 27 seconds to the transition from C through the graph. The narration names the observers and the selected order so the listener can follow the visible paths. The order provides context for action and timing. The illustrative response attributes its two assessments to C and D.

The diagrams demonstrate architectural choices over six fictional passages. The film uses preset vector candidates, a fixed evidence layout and an authored response. There was no live model call or retrieval benchmark. Establishing effectiveness would require experiments with a specified corpus, annotation quality, model and task.

## Release checks

The initial cut, the crossing cut and the guided cut each partition A into two ranges that reconstruct the full source. Tests verified B’s two entity references and return-journey claim, the two different Emperor identities, the C/D observer assignments, the order roles and time, and deduplication of three evidence ranges. Starting from F yields its source alone along the selected relationships. The serialised context retains each original passage and identifies the source of each judgement.

Studio checks matched underline endpoints to the rendered glyphs, checked the B/C/F filter result, and confirmed one Napoleon and one copy each of C, D and E in the graph and the context. Backward seeks reproduced the same results. The moving C statement cleared its source card at all 20 sampled positions during the graph transition. All eleven episodes opened in Studio.

The 1080 × 1080 H.264 export decoded through all 3,960 frames at 30 fps. Nineteen decoded frames were inspected at phone viewing sizes. All 17 spoken cues aligned with the timed source at 10 ms resolution. The release soundtrack measured −16.23 LUFS integrated and −4.73 dBTP. The final words finish around 127.70 seconds, leaving the end card visible through 132 seconds.
