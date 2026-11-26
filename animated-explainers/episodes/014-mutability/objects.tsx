import React from 'react';
import {Bookend} from '../../shared/SeriesPlate';
import {type} from '../../theme';
import {
  At,
  C,
  Catalog,
  Drawing,
  NotesFace,
  Paper,
  Paragraph,
  Player,
  Print,
  RangeLine,
  Rule,
  Slip,
  Surface,
  Tag,
  Words,
  between,
  mix,
  ramp,
  travel,
  type Pose,
} from './studio';

export function Opening({n, u}: {n: number; u: number}) {
  const first = n === 1;
  const inserted = u < 3.36 ? '' : u < 4.38 ? 'In mist, ' : 'In morning mist, ';
  const line = first
    ? inserted + (inserted ? 'the' : 'The') + ' Brooklyn Bridge ' + (u < 2.3 ? 'rises.' : 'appears.')
    : 'In morning mist, the Brooklyn Bridge appears.';
  const fold = first ? 0 : ramp(u, 2.04, 2.29) * (1 - ramp(u, 2.62, 2.91));
  return (
    <>
      {first && u < 1.25 && (
        <Bookend
          lead="Mutability"
          emphasis=""
          volumeLabel="Volume IV — From Text to Intelligence"
          spread={ramp(u, 0, 0.8)}
          opacity={1 - ramp(u, 0.88, 1.17)}
        />
      )}
      <g opacity={first ? ramp(u, 0.86, 1.3) : 1}>
        <Tag x={92} y={304} color="#acd1bd">
          {first ? 'Field notes   /   first draft' : 'Field notes   /   two readings'}
        </Tag>
        <RangeLine
          x={540}
          y={430}
          text={line}
          word="Brooklyn Bridge"
          size={39}
          on={first ? ramp(u, 3.75, 4.1) : 1}
          second={first ? 0 : ramp(u, 0.13, 0.6)}
          dark
        />
        <g opacity={first ? ramp(u, 3.75, 4.1) : 1}>
          <Tag x={100} y={520} color="#83cfc0">
            Entity · Brooklyn Bridge
          </Tag>
        </g>
        {!first && (
          <>
            <g opacity={ramp(u, 0.13, 0.6)}>
              <Tag x={100} y={564} color="#dfb575">
                Reading · Appearance in mist
              </Tag>
            </g>
            <g opacity={ramp(u, 0.95, 1.3) * (1 - fold)}>
              <Words
                x={540}
                y={661}
                anchor="middle"
                lines="A ferry crosses below."
                size={37}
                color="#e7dcc8"
              />
            </g>
            <g opacity={ramp(u, 1.16, 1.44)}>
              <RangeLine
                x={540}
                y={mix(765, 646, fold)}
                text="The bridge draws the eye east."
                word="The bridge"
                size={38}
                dark
              />
              <Tag x={266} y={mix(818, 699, fold)} color="#83cfc0">
                Same entity
              </Tag>
            </g>
          </>
        )}
      </g>
    </>
  );
}
export function Notebook() {
  return (
    <>
      <Paper w={600} h={380} />
      <Tag x={-260} y={-148}>
        Notebook / East River
      </Tag>
      <Words x={-260} y={-85} lines="Reading the crossing" size={46} />
      <Rule x={-260} y={-56} w={520} />
      <At p={[-143, 54, 0.35]}>
        <Print />
      </At>
      <Words x={-20} y={30} lines={['A deck, two towers,', 'a line over water.']} size={27} />
    </>
  );
}
export function Exchange() {
  return (
    <>
      <Paper w={600} h={380} />
      <Tag x={-260} y={-145}>
        Correspondence
      </Tag>
      <Words x={-260} y={-75} lines="What holds the eye?" size={44} />
      <Rule x={-260} y={-49} w={512} />
      <Tag x={-250} y={9} color={C.rust}>
        Mara
      </Tag>
      <Words x={-110} y={9} lines="The line of the deck." size={29} />
      <Tag x={-250} y={90}>
        Eli
      </Tag>
      <Words x={-110} y={90} lines="Or the tower in mist?" size={29} />
    </>
  );
}
const parts = [Paragraph, Print, Player, Notebook, Exchange];
const constellation: Pose[] = [
  [223, 426, 0.45],
  [545, 411, 0.5],
  [860, 427, 0.46],
  [359, 704, 0.51],
  [729, 704, 0.51],
];
const verbs = ['Read and edit', 'View', 'Play', 'Compose', 'Participate'];
export function Cabinet({n, u}: {n: number; u: number}) {
  const inside: Pose[] = [
    [264, 461, 0.39],
    [264, 627, 0.39],
    [813, 477, 0.44],
    [813, 688, 0.45],
    [264, 780, 0.31],
  ];
  const group = n === 4 ? ramp(u, 1.72, 2.55) : 0;
  return (
    <>
      {n === 4 &&
        [264, 813].map((x, i) => (
          <At key={x} p={[x, 579, 1]} opacity={group}>
            <Paper w={360} h={530} />
            <Tag x={-162} y={-199}>
              {i ? 'Crossing study' : 'Field notes'}
            </Tag>
          </At>
        ))}
      {parts.map((Part, i) => {
        const shift =
          n === 3
            ? i === 1
              ? ramp(u, 3.85, 4.2) * (1 - ramp(u, 4.7, 5.1))
              : i === 4
                ? ramp(u, 4.84, 5.23) * (1 - ramp(u, 5.72, 6.1))
                : 0
            : 0;
        let pose = between(constellation[i], inside[i], group);
        if (n === 4 && i === 1)
          pose = travel(u, pose, [
            [3.05, 3.58, [540, 541, 0.34]],
            [4.1, 4.72, [813, 626, 0.37]],
          ]);
        if (n === 4 && i === 3) pose = between(pose, [813, 783, 0.34], ramp(u, 3.8, 4.52));
        pose = [pose[0], pose[1] - 16 * shift, pose[2] * (1 + 0.18 * shift)];
        return (
          <At key={i} p={pose} opacity={n === 3 ? ramp(u, i * 0.1, 0.57 + i * 0.1) : 1}>
            <Part />
            {n === 4 && (
              <rect
                x={-307}
                y={-197}
                width={614}
                height={394}
                fill="none"
                stroke={C.teal}
                strokeWidth={5}
                opacity={ramp(u, i * 0.08, 0.8 + i * 0.08) * (1 - 0.7 * group)}
              />
            )}
            {n === 3 && (
              <g opacity={ramp(u, 0.75 + i * 0.12, 1.3 + i * 0.12) * (1 - ramp(u, 2.8, 3.35))}>
                <Words x={0} y={264} lines={verbs[i]} size={50} anchor="middle" italic />
              </g>
            )}
          </At>
        );
      })}
    </>
  );
}
export function Pieces({u}: {u: number}) {
  const poses: Pose[] = [
    travel(
      u,
      [540, 450, 0.64],
      [
        [1.02, 1.64, [306, 470, 0.71]],
        [2.02, 2.6, [373, 478, 0.59]],
        [3.07, 3.48, [609, 458, 0.56]],
        [3.65, 4.35, [311, 489, 0.72]],
      ],
    ),
    travel(
      u,
      [540, 640, 0.82],
      [
        [1.06, 1.65, [781, 430, 0.77]],
        [2.08, 2.65, [373, 650, 0.77]],
        [3.07, 3.48, [609, 620, 0.73]],
        [3.65, 4.35, [784, 441, 0.73]],
      ],
    ),
    travel(
      u,
      [540, 755, 0.82],
      [
        [1.1, 1.7, [748, 716, 0.81]],
        [3.07, 3.48, [609, 747, 0.74]],
        [3.65, 4.35, [733, 714, 0.82]],
      ],
    ),
  ];
  return (
    <>
      <At p={[540, 568, 1]} opacity={1 - ramp(u, 0.93, 1.34)}>
        <Paper w={600} h={586} />
      </At>
      <At
        p={travel(u, [373, 540, 1], [[3.07, 3.48, [609, 526, 0.95]]])}
        opacity={ramp(u, 2.28, 2.62) * (1 - ramp(u, 3.68, 4))}
      >
        <Paper w={478} h={376} color="#e2e9df" edge={C.teal} />
      </At>
      <At p={[609, 570, 1]} opacity={ramp(u, 2.91, 3.15) * (1 - ramp(u, 3.65, 4))}>
        <rect x={-268} y={-259} width={536} height={505} fill="none" stroke={C.teal} strokeWidth={3} />
      </At>
      <At p={poses[0]}>
        <Print />
      </At>
      <At p={poses[1]}>
        <Slip label="Caption" lines={['The deck crosses the East River.']} size={29} />
      </At>
      <At p={poses[2]}>
        <Slip label="Observation" color={C.rust} lines={['Look at the distant tower.']} />
      </At>
    </>
  );
}
export function ImageStudy({u}: {u: number}) {
  const away = ramp(u, 0.82, 1.26) * (1 - ramp(u, 2.15, 2.7));
  const p: Pose = [540 - 228 * away, 573, 0.99 - 0.22 * away];
  return (
    <>
      {['Source', 'Publisher and date', 'Observation'].map((name, i) => {
        const start: Pose = [782, 417 + i * 143, 0.75],
          dest: Pose = [540, 568, 0.64];
        return (
          <At
            key={name}
            p={between(start, dest, ramp(u, 1.95 + i * 0.12, 2.63 + i * 0.1))}
            opacity={ramp(u, 0.82 + i * 0.1, 1.22 + i * 0.13) * (1 - ramp(u, 2.48, 2.9))}
          >
            <Slip
              w={486}
              label={name}
              lines={[['Library of Congress'], ['Detroit Publishing Co., 1902'], ['The far tower fades.']][i]}
              size={29}
            />
          </At>
        );
      })}
      <At p={p}>
        <Surface
          amount={ramp(u, 3.13, 3.72) * (1 - ramp(u, 4.95, 5.65))}
          wrap={ramp(u, 2.5, 3.07)}
          front={<Print />}
          back={<Catalog />}
        />
      </At>
      <g opacity={ramp(u, 5.9, 6.38)}>
        <path d="M234 775v42h126" fill="none" stroke={C.teal} strokeWidth={2} />
        <Tag x={372} y={824}>
          Surface around the original plate
        </Tag>
      </g>
    </>
  );
}
export function Generality({u}: {u: number}) {
  const apart = ramp(u, 0.75, 1.5);
  return (
    <>
      <At p={between([540, 573, 0.99], [540, 329, 0.36], apart)}>
        <Surface amount={0} front={<Print />} back={<Catalog />} />
      </At>
      {[false, true].map((diagram, i) => (
        <At key={i} p={[i ? 775 : 305, 633, 0.68]} opacity={ramp(u, 0.92 + i * 0.38, 1.42 + i * 0.38)}>
          <Surface
            amount={
              ramp(u, 2.03 + 0.43 * i, 2.31 + 0.43 * i) * (1 - ramp(u, 3.87 + i * 0.13, 4.4 + i * 0.13))
            }
            wrap={ramp(u, 1.65 + i * 0.22, 2.12 + i * 0.22)}
            front={diagram ? <Drawing /> : <Paragraph />}
            back={
              <NotesFace
                label={diagram ? 'Drawing notes' : 'Working note'}
                lines={
                  diagram
                    ? ['Trace the deck first.', 'Then look for the tower.']
                    : ['Does the line of the deck', 'outlast the stone tower?']
                }
              />
            }
          />
        </At>
      ))}
    </>
  );
}
