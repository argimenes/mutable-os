import React from 'react';
import {Html5Audio, staticFile, useCurrentFrame} from 'remotion';
import mark from '../../assets/branding/layers.svg';
import {SeriesPlate} from '../../shared/SeriesPlate';
import {type} from '../../theme';
import {Cabinet, Generality, ImageStudy, Opening, Pieces} from './objects';
import {Comparison, Dossier, Essay, Letter} from './pages';
import {Application, Close, Lecture, Released, Reprise} from './research';
import {At, C, Rule, Tag, Words, ramp} from './studio';
import scenes from './scenes.json';

type Caption = [number, string, string?];
const captions: Caption[][] = [
  [
    [1, 'A sentence changes.'],
    [3.75, 'The words move. Their reference travels with them.'],
    [5, 'Is mutability simply the ability', 'to change something?'],
  ],
  [
    [0, 'One passage can carry several readings.'],
    [1.95, 'Gather the passages that mention the bridge.'],
    [2.75, 'The river returns to its place.'],
  ],
  [
    [0.5, 'What do we expect of each object?'],
    [3, 'What else could it become?'],
  ],
  [
    [0, 'A block can hold any of these materials.'],
    [2, 'Two documents, two arrangements.'],
    [3.3, 'Follow the photograph between them.'],
    [5, 'Its surroundings have changed.'],
  ],
  [
    [0, 'A photograph and its caption make a pair.'],
    [2.72, 'The pair can belong to a larger whole.'],
    [4, 'An arrangement need not be the permanent', 'destiny of its contents.'],
  ],
  [
    [0, 'What belongs with a photograph?'],
    [2.1, 'Keep the research with the print.'],
    [3.88, 'On the reverse, room to read and write.'],
    [5, 'The same glass negative faces us again.'],
  ],
  [
    [0, 'The folded corner belongs to the surrounding surface.'],
    [2, 'Give a paragraph and a drawing the same turn.'],
    [4, 'Each keeps its own front.'],
  ],
  [
    [0, 'How will the reader hear these words?'],
    [2, 'Each revision displaces an earlier possibility.'],
    [3, 'The writer chooses to keep all three.'],
    [4.8, 'One place in the letter. Three possible tones.'],
  ],
  [
    [0, 'What leads the eye across the water?'],
    [2, 'Each addition earns its place.'],
    [4, 'Must everything that belongs to a document', 'belong to its primary reading sequence?'],
  ],
  [
    [0, 'Bring the evidence beside the claim.'],
    [1, 'Give the objection the opposite margin.'],
    [3, 'Change which observation the eye meets first.'],
  ],
  [
    [0, 'Read the qualification behind the claim.'],
    [1, 'Try a second reading in the same place.'],
    [2, 'Keep the source record on its own page.'],
    [4, 'Return to the argument.'],
  ],
  [
    [0, 'Account for every part of the earlier draft.'],
    [3, 'Complexity need not be eliminated.'],
    [4, 'It can be composed.'],
    [5, 'Mutability liberates spatial thinking.'],
  ],
  [
    [0, 'A research note can stand on its own.'],
    [2, 'Its contents can form a page in a larger dossier.'],
    [4, 'Look inside. The original blocks are still legible.'],
  ],
  [
    [0, 'One environment holds a study. The other holds turns.'],
    [2, 'Both arrange blocks.'],
    [3, 'Look inside a contribution.'],
  ],
  [
    [0, 'A question invites a reply.'],
    [1, 'A reply invites a different reading.'],
    [2, 'Attach a reference and a gloss to the exchange.'],
    [3, 'The speakers’ words and their order persist.'],
  ],
  [
    [0, 'Listen to the lecturer’s reading of the photograph.'],
    [2, 'Bring the materials for studying it together.'],
    [4, 'Follow the name in the transcript.'],
    [5.06, 'Examine a frame from the lecture.'],
    [5.48, 'Check its source and related material.'],
    [6, 'The annotated passage is still here.'],
    [7, 'Turn back and resume the lecture.'],
  ],
  [
    [0, 'What if the transcript starts another investigation?'],
    [1, 'Unwrap the reverse, then open the tab group.'],
    [2, 'The passage moves into a new study.'],
    [3, 'The still can carry working notes of its own.'],
    [5, 'Enrichment is not a terminal operation.'],
  ],
  [
    [0, 'Recognise what each object has carried forward.'],
    [2, 'A whole in one place can be a part in another.'],
    [5, 'The parts are available for another arrangement.'],
  ],
  [
    [2, 'The freedom to compose.'],
    [3, 'The freedom to decompose.'],
    [4, 'The freedom to extend.'],
    [5, 'The freedom to recontextualise.'],
    [5.92, ''],
  ],
  [],
];
const acts = [
  '',
  'The opening question',
  'The block as primitive',
  'Becoming more',
  'Thinking in space',
  'Beyond the document',
  'The open-ended object',
  'The principle',
];
function Visual({n, u}: {n: number; u: number}) {
  switch (n) {
    case 1:
    case 2:
      return <Opening n={n} u={u} />;
    case 3:
    case 4:
      return <Cabinet n={n} u={u} />;
    case 5:
      return <Pieces u={u} />;
    case 6:
      return <ImageStudy u={u} />;
    case 7:
      return <Generality u={u} />;
    case 8:
      return <Letter u={u} />;
    case 9:
    case 10:
    case 11:
      return <Essay n={n} u={u} />;
    case 12:
      return <Comparison u={u} />;
    case 13:
      return <Dossier u={u} />;
    case 14:
    case 15:
      return <Application n={n} u={u} />;
    case 16:
      return <Lecture u={u} />;
    case 17:
      return <Released u={u} />;
    case 18:
      return <Reprise u={u} />;
    case 19:
      return <Close u={u} />;
    default:
      return (
        <>
          <At p={[540, 450, 1]}>
            <image href={mark} x={-70} y={-70} width={140} height={140} />
          </At>
          <Words x={540} y={629} anchor="middle" lines="Mutable" size={105} />
          <g opacity={ramp(u, 0.93, 1.17)}>
            <Words
              x={540}
              y={727}
              anchor="middle"
              lines="Same Thing. Many Faces."
              size={57}
              italic
              color={C.teal}
            />
          </g>
          <Rule x={76} y={913} w={928} />
          <Words x={76} y={976} lines="Volume IV — From Text to Intelligence" size={29} />
          <Words
            x={1004}
            y={976}
            lines="mutable.ink"
            anchor="end"
            size={26}
            color={C.quiet}
            font={type.mono}
          />
        </>
      );
  }
}
export function Mutability() {
  const frame = useCurrentFrame();
  const s = scenes.find((scene) => frame < scene.end) ?? scenes[scenes.length - 1];
  const n = s.number;
  const index = Math.max(0, s.cues.filter((c) => frame >= c.frame).length - 1);
  const start = s.cues[index].frame,
    end = s.cues[index + 1]?.frame ?? s.end;
  const u = index + Math.min(0.999, Math.max(0, (frame - start) / (end - start)));
  const light = n === 3 ? ramp(u, 0, 0.45) : n > 3 ? 1 : 0;
  const cap = captions[n - 1].filter(([at]) => at <= u).at(-1);
  const act = n <= 3 ? 1 : n <= 5 ? 2 : n <= 8 ? 3 : n <= 12 ? 4 : n <= 15 ? 5 : n <= 18 ? 6 : 7;
  return (
    <>
      <Html5Audio src={staticFile('014-mutability.m4a')} />
      <SeriesPlate number="014" productBranding={false} seriesAttribution>
        <style>{'.xiv-ink > text {fill:#222b29}'}</style>
        <g opacity={light}>
          <rect width="1080" height="1080" fill={C.canvas} />
          <image href={mark} x={76} y={60} width={50} height={50} />
          <text x={150} y={94} fill={C.ink} fontFamily={type.mono} fontSize={26} letterSpacing={2}>
            Mutable OS <tspan fill={C.teal}>/ Concepts /</tspan> 014
          </text>
          <Rule x={76} y={140} w={928} />
        </g>
        {n > 2 && n < 20 && (
          <g opacity={light}>
            <Tag x={77} y={180} size={17}>
              {acts[act]}
            </Tag>
            <Words x={76} y={235} lines={s.title} size={44} />
          </g>
        )}
        <Visual n={n} u={u} />
        {cap && cap[1] && (
          <g opacity={ramp(u, cap[0], cap[0] + 0.13)}>
            <Rule x={76} y={909} w={928} color={light ? C.line : '#526064'} />
            <Words
              x={540}
              y={cap[2] ? 962 : 980}
              anchor="middle"
              size={35}
              font={type.sans}
              lines={cap[2] ? [cap[1], cap[2]] : cap[1]}
              color={light ? C.ink : '#f2ebdd'}
            />
          </g>
        )}
      </SeriesPlate>
    </>
  );
}
