import React from 'react';
import {At, C, Paper, Print, Rule, Slip, Surface, Tag, Words, between, mix, ramp, type Pose} from './studio';

const alternatives = [
  ['I was disappointed not to receive a reply.'],
  ['I had hoped to hear from you sooner.'],
  ['I appreciate that you have had', 'other demands on your time.'],
];
const tones = ['Disappointment', 'Hope', 'Generosity'];
export function Tabs({labels, active, w = 620}: {labels: string[]; active: number; w?: number}) {
  const cell = w / labels.length;
  return (
    <g>
      {labels.map((label, i) => (
        <g key={label} transform={`translate(${-w / 2 + i * cell} 0)`}>
          <rect width={cell - 3} height={43} fill={i === active ? C.teal : '#e6e8dc'} />
          <Words
            x={cell / 2}
            y={29}
            lines={label}
            size={22}
            anchor="middle"
            color={i === active ? C.page : C.quiet}
          />
        </g>
      ))}
    </g>
  );
}
export function Letter({u}: {u: number}) {
  const gather = ramp(u, 2.9, 3.33) * (1 - ramp(u, 3.65, 4.18));
  const tabbed = ramp(u, 3.75, 4.22);
  const selected = u < 2.02 ? 0 : u < 2.53 ? 1 : u < 4.52 ? 2 : u < 5.08 ? 0 : u < 5.66 ? 1 : 2;
  return (
    <At p={[540, 568, 1]}>
      <Paper w={862} h={610} />
      <Tag x={-366} y={-251}>
        Private correspondence
      </Tag>
      <Words x={361} y={-249} anchor="end" size={26} lines="Friday" italic />
      <Rule x={-366} y={-229} w={727} />
      <Words x={-365} y={-162} lines="Dear Mara," size={43} />
      <Words x={-365} y={-103} lines="Thank you for sending the photograph." size={33} />
      <g transform="translate(0 -67)" opacity={tabbed}>
        <Tabs labels={tones} active={selected} w={738} />
      </g>
      {alternatives.map((lines, i) => {
        const y = mix(28, -53 + i * 67, gather);
        return (
          <g key={i} opacity={i === selected ? 1 : gather} transform={`translate(0 ${y})`}>
            <path d="M-367 -31v58" stroke={[C.rust, C.teal, C.gold][i]} strokeWidth={4} />
            <Words x={-349} y={0} lines={lines} size={mix(34, 27, gather)} italic />
          </g>
        );
      })}
      <Words x={-365} y={169} lines="I would still love to compare our notes." size={33} />
      <Words x={-365} y={242} lines="Yours, Eli" size={38} italic />
    </At>
  );
}
export const materials = [
  {name: 'Evidence', short: 'The deck stays sharp.', lines: ['The deck', 'stays sharp.'], color: C.teal},
  {
    name: 'Qualification',
    short: 'Mist softens the tower.',
    lines: ['Mist softens', 'the tower.'],
    color: C.gold,
  },
  {
    name: 'Objection',
    short: 'The boats also draw the eye.',
    lines: ['The boats also', 'draw the eye.'],
    color: C.rust,
  },
  {name: 'Context', short: 'A dry plate, dated 1902.', lines: ['A dry plate,', 'dated 1902.'], color: C.blue},
  {
    name: 'Possibility',
    short: 'Perhaps the river leads.',
    lines: ['Perhaps the', 'river leads.'],
    color: C.plum,
  },
];
function EssayNote({index, compact, column}: {index: number; compact: number; column: number}) {
  const m = materials[index],
    w = mix(mix(704, 356, column), 250, compact),
    h = mix(mix(53, 76, column), 102, compact);
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#f8f3e6" stroke="#cdc8b9" strokeWidth={1.6} />
      <path d={`M${-w / 2} ${-h / 2}v${h}`} stroke={m.color} strokeWidth={6} />
      <Tag x={-w / 2 + 14} y={mix(mix(7, -13, column), -23, compact)} size={17} color={m.color}>
        {m.name}
      </Tag>
      {compact < 0.5 ? (
        <Words
          x={mix(-174, -w / 2 + 14, column)}
          y={mix(11, 20, column)}
          lines={m.short}
          size={mix(28, 23, column)}
        />
      ) : (
        <Words x={-w / 2 + 15} y={8} lines={m.lines} size={25} leading={27} />
      )}
    </>
  );
}
export function Essay({n, u}: {n: number; u: number}) {
  const on = (scene: number, start: number, end: number) =>
    n < scene ? 0 : n > scene ? 1 : ramp(u, start, end);
  const beside = on(10, 0.06, 0.72),
    objection = on(10, 0.93, 1.57),
    reorder = on(10, 3.05, 3.6);
  const back = on(11, -0.05, 0.35),
    alt = on(11, 0.92, 1.42),
    page = on(11, 1.95, 2.54);
  const contextual = n === 11 ? ramp(u, 2.9, 3.23) * (1 - ramp(u, 3.57, 3.96)) : 0;
  const flip = n === 11 ? ramp(u, 0.18, 0.44) * (1 - ramp(u, 0.62, 0.94)) : 0;
  const alternative = n === 11 ? ramp(u, 1.36, 1.53) * (1 - ramp(u, 1.78, 2.02)) : 0;
  const cx = 540,
    claimY = 386;
  const count = materials.reduce((tot, _, i) => tot + on(9, 0.84 + i * 0.38, 1.21 + i * 0.38), 0);
  const placed = [beside, back, objection, page, alt];
  const dest: Pose[] = [
    [202, 492 + 147 * reorder, 0.95],
    [540, claimY, 0.62],
    [878, 492, 0.95],
    [765, 787, 0.55],
    [540, claimY, 0.6],
  ];
  const heights = materials.map((_, i) => on(9, 0.84 + i * 0.38, 1.21 + i * 0.38) * (1 - placed[i]));
  return (
    <>
      <At p={[540, 569, 1]}>
        <Paper w={943} h={609} />
        <Tag x={-436} y={-260}>
          Essay / Reading the crossing
        </Tag>
        <Rule x={-436} y={-241} w={872} />
      </At>
      <g opacity={1 - contextual}>
        {materials.map((m, i) => {
          const shown = on(9, 0.84 + i * 0.38, 1.21 + i * 0.38);
          const y = 477 + 46 * alt + (59 + 24 * beside) * heights.slice(0, i).reduce((a, b) => a + b, 0);
          const pos = between([540, y, 1], dest[i], placed[i]);
          const hidden = i === 1 ? back : i === 3 ? page : i === 4 ? alt : 0;
          return (
            <At key={m.name} p={pos} opacity={shown * (1 - hidden)}>
              <EssayNote index={i} compact={placed[i]} column={beside} />
            </At>
          );
        })}
        <At p={[cx, claimY, 1]}>
          <Surface
            w={530}
            h={107}
            amount={flip}
            wrap={back}
            front={
              <>
                <Paper w={530} h={107} />
                <Words
                  x={-238}
                  y={-5}
                  size={31}
                  lines={
                    alternative > 0.5
                      ? ['Perhaps the river leads', 'the eye across the water.']
                      : ['The deck draws the eye', 'across the water.']
                  }
                />
              </>
            }
            back={
              <Slip
                w={530}
                h={107}
                label="Qualification"
                lines={['Mist softens the tower.']}
                color={C.gold}
                size={31}
              />
            }
          />
        </At>
        <g transform="translate(540 441)" opacity={alt}>
          <Tabs w={360} labels={['Deck', 'River']} active={alternative > 0.5 ? 1 : 0} />
        </g>
        <Words
          x={540}
          y={
            n === 9
              ? mix(480, 511 + 59 * 5, count / 5)
              : 527 + (59 + 24 * beside) * heights.reduce((a, b) => a + b, 0) + 55 * alt
          }
          lines="We cross the river with our eyes."
          size={32}
          anchor="middle"
          italic
        />
        <g opacity={beside}>
          <path d="M310 458l73 -37" fill="none" stroke={C.teal} strokeWidth={2} />
        </g>
        <g opacity={objection}>
          <path d="M769 457l-64 -37" fill="none" stroke={C.rust} strokeWidth={2} />
        </g>
        <At p={[202 - 28 * Math.sin(Math.PI * reorder), 631 - 139 * reorder, 0.94]} opacity={objection}>
          <Slip w={250} h={94} label="Observation" lines={['Boats below.']} size={25} />
        </At>
      </g>
      <g transform="translate(540 811)" opacity={page}>
        <Tabs w={460} labels={['Essay', 'Source record']} active={contextual > 0.5 ? 1 : 0} />
      </g>
      <At p={[540, 564, 1]} opacity={contextual}>
        <Slip
          label="Source record   /   Context"
          w={767}
          h={259}
          lines={[
            'Detroit Publishing Company, 1902.',
            'The glass plate is eight by ten inches.',
            'Look again at the vanishing tower.',
          ]}
          size={33}
          color={C.blue}
        />
      </At>
    </>
  );
}
const locations = ['Left margin', 'Reverse surface', 'Right margin', 'Source page', 'Alternative tab'];
export function Comparison({u}: {u: number}) {
  const sel = Math.min(4, Math.max(0, Math.floor((u - 0.9) * 2.1)));
  const inventory = ramp(u, 0.76, 1.24) * (1 - ramp(u, 4.46, 4.92));
  const returnToEssay = ramp(u, 4.46, 4.92);
  return (
    <>
      <g opacity={1 - inventory}>
        <At p={[43 - 550 * returnToEssay, 273, 0.48]} opacity={1 - returnToEssay}>
          <Essay n={9} u={4.8} />
        </At>
        <At p={between([533, 273, 0.48], [0, 0, 1], returnToEssay)}>
          <Essay n={11} u={4.8} />
        </At>
        <g opacity={1 - returnToEssay}>
          <Words x={302} y={736} anchor="middle" lines="In sequence" size={35} italic />
          <Words x={790} y={736} anchor="middle" lines="In composition" size={35} italic />
        </g>
      </g>
      <At p={[540, 571, 1]} opacity={inventory}>
        <Paper w={916} h={567} />
        <Tag x={-410} y={-231}>
          Two readings of the same essay
        </Tag>
        <Rule x={-410} y={-210} w={820} />
        <Words x={-410} y={-144} lines="In sequence" size={44} />
        <Words x={68} y={-144} lines="In composition" size={44} />
        {materials.map((m, i) => {
          const y = -83 + i * 64;
          return (
            <g key={m.name}>
              <circle cx={-395} cy={y - 9} r={8} fill={m.color} />
              <Words x={-369} y={y} size={29} lines={m.name} />
              <path
                d={`M-155 ${y - 10}C-85 ${y - 10},-15 ${y - 10},45 ${y - 10}`}
                fill="none"
                stroke={m.color}
                strokeWidth={i === sel ? 4 : 1.2}
                opacity={ramp(u, 0.7 + i * 0.16, 1.15 + i * 0.16)}
              />
              <circle cx={74} cy={y - 9} r={8} fill={m.color} />
              <Words x={98} y={y} size={29} lines={locations[i]} />
            </g>
          );
        })}
      </At>
    </>
  );
}
export function FieldPage({borders = 0}: {borders?: number}) {
  return (
    <>
      <Paper w={622} h={548} />
      <Tag x={-274} y={-226}>
        East River / Field notebook
      </Tag>
      <Words x={-274} y={-158} lines="Field notes" size={58} />
      <Rule x={-274} y={-134} w={545} />
      <At p={[0, -4, 0.61]}>
        <Print />
      </At>
      <Words
        x={-265}
        y={164}
        lines={['The deck draws the eye across the water.', 'The far tower fades into mist.']}
        size={28}
      />
      <g opacity={borders} stroke={C.teal} fill="none" strokeWidth={2}>
        <rect x={-199} y={-125} width={398} height={243} />
        <rect x={-276} y={129} width={551} height={90} />
      </g>
    </>
  );
}
export function Dossier({u}: {u: number}) {
  const shrink = ramp(u, 1.76, 2.69),
    enter = ramp(u, 3.89, 4.3) * (1 - ramp(u, 4.65, 5.18));
  const overview = shrink * (1 - enter);
  return (
    <>
      <At p={[540, 570, 1]} opacity={overview}>
        <Paper w={916} h={575} color="#eaf0e4" />
        <Tag x={-409} y={-230}>
          Research dossier
        </Tag>
        <Words x={-409} y={-163} lines="Looking across the East River" size={49} />
        <Rule x={-409} y={-137} w={813} />
      </At>
      {[
        ['Essay', 'The line of the deck'],
        ['Source record', 'Detroit Publishing Co.'],
      ].map(([a, b], i) => (
        <At
          key={a}
          p={between(
            [1080 + 220, 459 + i * 194, 0.78],
            [767, 515 + i * 189, 0.77],
            ramp(u, 2.75 + i * 0.2, 3.5 + i * 0.2),
          )}
          opacity={overview}
        >
          <Slip w={467} h={177} label={a} lines={[b]} size={32} color={i ? C.blue : C.rust} />
        </At>
      ))}
      <At p={between([540, 562, 1], [324, 617, 0.66], overview)}>
        <FieldPage borders={enter} />
      </At>
      <g transform="translate(540 806)" opacity={overview}>
        <Tabs labels={['Field notes', 'Essay', 'Source record']} active={0} w={802} />
      </g>
    </>
  );
}
