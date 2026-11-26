# Producing Mutability

## The worked example

Begin with the film in `animated-explainers/renders/014-mutability.mp4`. Watch the turn from a moving lecture to an annotated transcript. Follow the underlined name when the transcript leaves the video and enters a research page. That transfer is the test of the central idea. The viewer should recognise the passage, where it came from, and what work it can now support.

The viewer needs no familiarity with Mutable. The example follows a photograph of Brooklyn Bridge. The letter, essay, conversation, related seminar title, interpretive notes and the two-voice lecture are original illustrative material for this episode. The photograph is a digitisation of an 8 × 10 inch glass negative published by the Detroit Publishing Company in 1902. The catalog identifies the publisher and copyright claimant and gives no individual photographer. Its rights advisory records no known restrictions on publication. The film crops the digitisation for the print, lecture movement and lecture still. [Library of Congress catalog and image](https://www.loc.gov/pictures/item/2016799534/)

## Editorial decisions

The twenty scenes follow the supplied seven acts. Most of the narration is the supplied script. The local edits name the particular object, supply the short lecture and describe the operations available in this checkout. The complete delivered wording and cue starts are in the [timed storyboard](storyboard.md). The original is in the [production brief](brief.md).

The dark opening uses the existing series plate, bookend, type and measured range renderer. The recurring print introduces the ivory studio. A teal folded corner always marks a surrounding surface. A turn progressively foreshortens the two faces about the same axis. Colour, the plate number and the visible tower persist across scale changes. The colour keys in the essay identify five kinds of material in this particular reading. The closing line and wordmark follow the requested wording in the new register. The episode continues Volume IV.

## Checking the operations against the editor

| Scenes | Production choice | Implementation evidence |
| --- | --- | --- |
| 1–2 | Text edits precede and move a particular mention. Two readings share one passage. The focus folds away a short nonmatching passage and can be released. | [Text range renderer](../../shared/TextRun.tsx), [focus derivation](../../../src/runtime/concertina-derivation.ts), [entity focus](../../../src/features/entity-references/document-entity-list.ts) |
| 3–5 | Owned blocks can be moved into and out of groups. The isolated photograph is the interval between two placements. The independent pose illustrates availability for placement. The current tab menu disables Extract to a new window. | [Grouping and dissolving](../../../src/runtime/block-surfaces.ts), [block clipboard](../../../src/runtime/block-clipboard.ts), [workspace object discovery](../../../src/application/workspace-objects.ts), [block menu](../../../src/runtime/block-menu-actions.ts) |
| 6–7 | A reversible surface has front and back side blocks. The existing front is moved into the wrapper. The back can hold editable text and structures. Eligible ordinary image and text blocks share the operation. The diagram is artwork in an image block. Some media acquisition paths create the wrapper and initial notes at import. The film starts with an ordinary placed image. | [Surface commands](../../../src/runtime/block-surfaces.ts), [native constructors](../../../src/block-tree/compound-authoring.ts), [resource import](../../../src/interchange/resource-surface.ts) |
| 8 | The three formulations are deliberately authored in sibling panels of a local tab row. The letter around them holds its position. | [Convert to tab, add and activate panels](../../../src/runtime/block-menu-actions.ts) |
| 9–12 | Both margin relations retain their source block. The positions illustrate sequence and authored ordering within a margin. The notes, alternative paragraph and separate document page express different attention choices. Page selection shows the chosen panel. The broad before/after view is an editorial comparison. | [Left and right margins and persistence](../../../src/block-tree/margin-commands.test.ts), [page conversion and tabs](../../../src/runtime/block-menu-actions.ts) |
| 13 | A dossier here is a research document with authored pages. Convert to page moves the document’s children into a page beneath a document-tab row. Other research material can occupy additional pages. The zoom exposes the contents of Field notes. A separate Dossier application, attachment of a live external document and synchronized transclusion are outside the demonstrated workflow. Cardex marks Dossier associations as unavailable. | [Page conversion](../../../src/runtime/block-menu-actions.ts), [Cardex Dossier status](../../../src/features/cardex/details.tsx) |
| 14–15 | Dialectic retains native block compositions in its contributions. A range can designate an entity or carry a gloss. The film holds each contributed word and its chronological position fixed throughout annotation. It makes no universal embedding or access-control claim. | [Dialectic model](../../../src/features/dialectic/model.ts), [committed-source range operations](../../../src/features/dialectic/dcp/authoring.ts), [native authoring tests](../../../src/features/dialectic/dialectic.test.tsx) |
| 16–17 | The reverse document apparatus is an authored tab row on the back side. The lecturer and transcript use the same wording. The still is an authored crop. Unwrap moves the back’s contents after the surface and removes the back. Destructuring the tab row promotes the children in order. The coloured range denotes the same annotation on the moved text. Scene 17 shows the specific exposed constituents being studied and leaves the single front available. | [Unwrap and retain reverse children](../../../src/runtime/block-surfaces.ts), [tab destructure](../../../src/runtime/block-menu-actions.ts), [native compound builders](../../../src/block-tree/compound-authoring.ts), [media front/back rendering checks](../../../src/rendering/reversible-surface.test.tsx) |
| 18–20 | The final arrangements explore the design philosophy using the established operations. They introduce no new interface command. | [Original thesis and acceptance criteria](brief.md) |

## Reproduce or adapt the episode

1. Unzip the delivery. Enter `animated-explainers`. Use Node 22.12.0 and run `npm ci`. The locked Remotion, fonts and shared plate recreate the series picture.
2. Run `npm run preview` and select `014-mutability`. Scrub to a timestamp from the storyboard. Use the frame column in `scenes.json` for exact Studio navigation. The supplied M4A plays in Studio and during rendering.
3. To make a second example, change the passage and observation together. The visual specimens live in `objects.tsx`, `pages.tsx` and `research.tsx`. The photo, pivot, range and page components live in `studio.tsx`. Each scene uses a cue index plus the elapsed fraction of its current spoken window. Place a new key pose by choosing a cue and a fraction inside it.
4. For narration changes edit [script.md](script.md). Each row has one visual action and one spoken line. Install Python 3.11, kokoro-onnx 0.6.1, NumPy, SoundFile and FFmpeg with AAC and loudnorm. Put the Kokoro v1.0 model and voice bank in one directory. Run the commands below from `animated-explainers`. The producer measures every utterance, writes the cue manifest and storyboard, leaves holds for reading and mixes the Studio soundtrack. When changing the number of cues, adjust the cue indices in the corresponding scene. [Series model and voice setup](../003-beyond-the-hierarchy/implementation.md)
5. For a review copy, decode the completed MP4. Check the moving range, the edge-on surface, the letter tabs, the two margin placements, the transcript leaving its old position and the last still. Play both the narration and the lecture voice. Compare each spoken window with the manifest. The supplied WAV is decoded from the film.

```sh
python episodes/014-mutability/produce_voice.py /path/to/kokoro-model --ffmpeg /path/to/ffmpeg
npm run typecheck
npm run render -- 014-mutability renders/014-mutability.mp4 --audio-bitrate=192k
```

## Implementation review results

The editor's 44 reversible-surface tests, three margin tests, four native compound-constructor tests and the selected Dialectic authoring and annotation test passed. The page suite passed three of five tests. In the two remaining cases the conversion preserved the ordered children, and Undo left `metadata.focus.blockId` on the document. The equality check expected the earlier snapshot without that focus metadata. The film shows page conversion and navigation. It makes no claim about restoring an identical serialized focus state. [Page tests](../../../src/rendering/page-creation.test.tsx)

The model can also represent a document inside a page, as the nested-document test fixture demonstrates. Scene 13 follows the exposed, document-wide page conversion. The distinction matters when interpreting the independent page as part of a research dossier.

## Master review

The 9:29 review cut decoded through all 17,070 H.264 frames at 1080 × 1080 and 30 fps. Its default stereo AAC track is 48 kHz. It measured −16.20 LUFS integrated and −4.95 dBTP after decoding. All 116 speech windows were audible and matched the Studio track’s amplitude envelope at 10 ms intervals. The stereo 24-bit WAV is the decoded master soundtrack trimmed to the 569-second picture timeline.

Thirty frames from the encoded film were inspected at phone size, covering all twenty scenes and ten additional transition or reading poses. The review included the photograph between placements, the three alternatives together before tabbing, the reordered margins, both views of the essay, the lecture reverse, the tab group opening and the pause between closing lines. Independent speech recognition recovered the opening question, photograph attribution, dossier explanation, protected conversational wording, lecturer’s passage, relocated transcript, closing thesis and slogan from the master.
