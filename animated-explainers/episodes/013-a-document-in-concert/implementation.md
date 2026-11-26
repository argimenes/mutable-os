# A Document in Concert

*Semantic reading and the responsive document* continues Volume IV as Concept 013. The 3:42 film uses one ten-passage, five-section sketch. The last passage provides a point to follow during the main fold. It starts beneath nine passages, moves up beside the two earlier references to photography and returns to its original position on release.

[Watch the film](../../renders/013-a-document-in-concert.mp4) · [Narration WAV](../../renders/013-narration.wav) · [Scene sheet](../../renders/013-stages.png) · [Timed storyboard](storyboard.md)

## Working from the editor

| Action | What the teaching example represents | Source |
| --- | --- | --- |
| Survey the sketch | The live inventory groups by entity ID. Text segments sharing one annotation identity count as one logical mention. Block references also contribute. This example uses single-segment text mentions. | [Document inventory](../../../src/features/entity-references/document-entities.ts) |
| Compare the wider collection | The optional database total counts saved, indexed, undeleted entity-reference segments and matching block properties. Unsaved edits are excluded. Each example paragraph has one placement. The sketch is assumed saved and indexed for the comparison. Database numbers are illustrative. | [Database query](../../../src/knowledge-sqlite/entities.mjs) · [Panel labels](../../../src/features/entity-references/list-view.tsx) |
| Illuminate a row | Entering a row adds preview decorations at its occurrence ranges. Leaving clears that preview. Amber shows this temporary emphasis. The thinner teal lines and endpoint pins represent persistent annotations. | [Preview and focus controller](../../../src/features/entity-references/document-entity-list.ts) |
| Focus the passages | Focus activates the ranges on the current page, with the flowing document as fallback. Matching blocks and their ancestors remain available. Other eligible branches are suppressed. Short matching blocks retain their height. The implementation can show a scrollable excerpt of a long block. | [Structural derivation](../../../src/runtime/concertina-derivation.ts) · [Viewport behaviour](../../../src/runtime/concertina.ts) · [Settings](../../../src/runtime/concertina-settings.ts) |
| Restore the composition | Toggling the same focus off releases its markers and decorations. The renderer restores the hidden branches and any saved excerpt viewport state. | [Focus controller](../../../src/features/entity-references/document-entity-list.ts) · [Presentation styling](../../../src/rendering/concertina.css) |

## The visual example

[document.ts](document.ts) owns the ten passages, section order, six identities and their authored ranges. The five person references are “Dodgson”, “The mathematician”, “The author”, “Carroll” and “Lewis Carroll”. The local count, highlights, distribution and retained passages all come from those ranges. Photography has three live mentions here and four example saved segments across the collection. Mathematics has one here and 112 across the collection. Each fraction illustrates distribution within this example.

[page.tsx](page.tsx) measures range endpoints against the shaped literary line, after the series fonts load. [inventories.tsx](inventories.tsx) introduces the single page between its contents and its semantic inventory. [reading.tsx](reading.tsx) keeps that page through the hover, fold and release. The camera pullback, moving folds and original-position strip make spatial relations visible. The editor itself hides eligible branches and restores them on release. The film uses short passages in one flowing document so that the complete focus scope fits on screen.

## Reproduce or change the example

1. Open the unpacked package or repository and enter `animated-explainers`. Use Node 22.12.0 and install the locked dependencies with `npm ci`.
2. Run `npm run preview` and open `013-a-document-in-concert`. Press Space to play. In Studio, G opens the frame control. Compare frames 4320 (all ten passages), 4425 (mid-fold), 4740 (three intact passages), and 4971 (all ten restored).
3. To try a second reading, change the annotated expression in passage 10 in [document.ts](document.ts). For example, replace its photographic-practice range with a sentence and a range about Oxford. Compare the local counts, amber marks and passage positions. Adjust the illustrative database totals and the narration when making a new edition.
4. The embedded Kokoro v1.0 Emma voice is included for Studio and the renderer. For script edits, align the cues in [scenes.json](scenes.json) and [storyboard.md](storyboard.md), use the [series voice setup](../003-beyond-the-hierarchy/implementation.md) and run the first command below. The generator checks each speech window before mixing. Run the remaining commands to verify and export.

```sh
python episodes/003-beyond-the-hierarchy/narrate.py /path/to/model public/013-a-document-in-concert.m4a --episode-dir episodes/013-a-document-in-concert
npm run typecheck
npm run render -- 013-a-document-in-concert renders/013-a-document-in-concert.mp4 --audio-bitrate=192k
```

## Verification

The finished MP4 decoded through 6,660 H.264 frames at 1080 × 1080 and 30 fps. Its 48 kHz AAC soundtrack measured −16.17 LUFS integrated and −4.94 dBTP. All 23 speech windows matched the source track at 10 ms resolution. Speech was recovered from every scene, with the final words ending at 219.69 seconds.

The phone-size visual check covered 18 encoded frames, including a fold in motion and its release. Studio checks followed the ten block identities and their text through each state. During the Photography fold, passages 04, 06 and 10 kept their full height as the other seven contracted. Oxford retained 03 and 09, and Alice Liddell retained 05 and 07. Each release restored the original positions, including on backward seeking. The editor’s entity-list and concertina suites passed all 20 tests. All thirteen compositions opened in Studio.
