import React from 'react';
import {
  At,
  C,
  Catalog,
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
  photo,
  ramp,
  type Pose,
} from './studio';
import {FieldPage, Tabs} from './pages';

const turns = [
  ['Mara', 'What draws the eye to Brooklyn Bridge?'],
  ['Eli', 'The deck carries it across the water.'],
  ['Mara', 'Even where the far tower disappears?'],
];
function Dialogue({u, outline = 0}: {u: number; outline?: number}) {
  return (
    <>
      <Paper w={836} h={566} />
      <Tag x={-376} y={-240}>
        Dialectic / Conversation
      </Tag>
      <Words x={-376} y={-176} lines="Reading the photograph" size={49} />
      <Rule x={-376} y={-151} w={752} />
      {turns.map(([person, line], i) => {
        const y = -108 + i * 111,
          show = i === 0 ? 1 : ramp(u, 0.85 + (i - 1) * 0.45, 1.14 + (i - 1) * 0.45);
        return (
          <g key={i} opacity={show}>
            <rect
              x={-382}
              y={y - 25}
              width={764}
              height={91}
              fill={i % 2 ? '#e9ecdf' : '#f6efdf'}
              stroke={C.teal}
              strokeOpacity={outline}
            />
            <Tag x={-359} y={y + 2} size={17} color={i % 2 ? C.teal : C.rust}>
              {person}
            </Tag>
            <RangeLine
              x={0}
              y={y + 43}
              size={33}
              text={line}
              word={['Brooklyn Bridge', 'The deck', 'far tower'][i]}
              on={i === 0 ? ramp(u, 2.02, 2.21) : i === 1 ? ramp(u, 2.42, 2.68) : 0}
            />
          </g>
        );
      })}
      <g opacity={ramp(u, 2.07, 2.32)}>
        <Tag x={-375} y={245}>
          Entity · Brooklyn Bridge
        </Tag>
      </g>
      <g opacity={ramp(u, 2.42, 2.7)}>
        <Tag x={16} y={245} color={C.rust}>
          Gloss · a line of sight
        </Tag>
      </g>
    </>
  );
}
export function Application({n, u}: {n: number; u: number}) {
  if (n === 15)
    return (
      <At p={[540, 572, 1]}>
        <Dialogue u={u} />
      </At>
    );
  const pull = ramp(u, 2.9, 3.7);
  return (
    <>
      <At p={between([287, 560, 0.67], [-390, 560, 0.65], pull)}>
        <FieldPage borders={ramp(u, 1.8, 2.4)} />
      </At>
      <At p={between([786, 560, 0.54], [540, 572, 1], pull)}>
        <Dialogue u={1.9 * (1 - pull)} outline={ramp(u, 1.85, 2.48) * (1 - pull)} />
      </At>
      <g opacity={1 - pull}>
        <Words x={283} y={818} anchor="middle" italic lines="A document to read" size={29} />
        <Words x={786} y={818} anchor="middle" italic lines="A place to converse" size={29} />
      </g>
    </>
  );
}
function Transcript({marked = 1}: {marked?: number}) {
  return (
    <>
      <Tag x={-265} y={-54}>
        Lecture / 00:00
      </Tag>
      <RangeLine
        x={-40}
        y={1}
        text="Look at the Brooklyn Bridge."
        word="Brooklyn Bridge"
        size={32}
        on={marked}
      />
      <Words
        x={-263}
        y={54}
        size={28}
        lines={['Follow the deck out over the water.', 'The far tower nearly disappears into the sky.']}
      />
      <g opacity={marked}>
        <Rule x={-264} y={113} w={523} />
        <Tag x={-265} y={151} size={17}>
          Entity · Brooklyn Bridge
        </Tag>
      </g>
    </>
  );
}
function Still({w = 495, h = 203}: {w?: number; h?: number}) {
  return (
    <svg width={w} height={h} x={-w / 2} y={-h / 2} viewBox="0 0 495 203" preserveAspectRatio="none">
      <image href={photo} x={-164} y={-85} width={690} height={431} preserveAspectRatio="xMidYMid slice" />
      <rect x={9} y={9} width={99} height={35} fill="#233331" />
      <Words x={18} y={33} lines="00:07" color={C.page} size={22} />
    </svg>
  );
}
function Library({tab, marked = 1}: {tab: number; marked?: number}) {
  return (
    <>
      <Paper w={600} h={380} />
      <g transform="translate(0 -173)">
        <Tabs w={563} labels={['Transcript', 'Screenshots', 'References']} active={tab} />
      </g>
      {tab === 0 ? (
        <Transcript marked={marked} />
      ) : tab === 1 ? (
        <>
          <At p={[0, 12, 1]}>
            <Still />
          </At>
          <Words x={-247} y={152} size={26} lines="The distant tower against the sky." italic />
        </>
      ) : (
        <>
          <Tag x={-259} y={-66}>
            Source
          </Tag>
          <Words
            x={-259}
            y={-23}
            lines={['Brooklyn Bridge, 1902.', 'Detroit Publishing Co.', 'Library of Congress, LC-D4-14479.']}
            size={29}
          />
          <Tag x={-259} y={119}>
            Related lecture
          </Tag>
          <Words x={-259} y={153} lines="Reading a river view · seminar notes" size={24} />
        </>
      )}
    </>
  );
}
const apparatus = [
  ['Transcript', 'Look at the Brooklyn Bridge.'],
  ['Screenshot', 'The distant tower, 00:07.'],
  ['References', 'Detroit Publishing Co., 1902.'],
];
export function Lecture({u}: {u: number}) {
  const spread = ramp(u, 1.92, 2.4) * (1 - ramp(u, 3.03, 3.65));
  const progress = 0.74 * ramp(u, 0.99, 1.96) + 0.23 * ramp(u, 7.78, 8.87);
  const angle = ramp(u, 3.89, 4.34) * (1 - ramp(u, 6.87, 7.47));
  const tab = u < 5.09 ? 0 : u < 5.49 ? 1 : u < 5.99 ? 2 : 0;
  return (
    <>
      {apparatus.map(([title, detail], i) => (
        <At key={title} p={between([540, 563, 0.64], [783, 418 + i * 137, 0.77], spread)} opacity={spread}>
          <Slip w={488} label={title} lines={[detail]} size={29} color={[C.teal, C.gold, C.rust][i]} />
        </At>
      ))}
      <At p={between([540, 575, 1.18], [300, 555, 0.73], spread)}>
        <Surface
          amount={angle}
          wrap={ramp(u, 3.22, 3.92)}
          front={<Player progress={progress} />}
          back={<Library tab={tab} marked={ramp(u, 4.42, 4.83)} />}
        />
      </At>
      <g opacity={ramp(u, 1.04, 1.26) * (1 - ramp(u, 1.78, 2.0))}>
        <Words
          x={540}
          y={863}
          anchor="middle"
          lines="“Follow the deck out over the water.”"
          size={33}
          italic
        />
      </g>
    </>
  );
}
export function Released({u}: {u: number}) {
  const open = ramp(u, 0.93, 1.3),
    dissolve = ramp(u, 1.37, 1.83);
  const land = ramp(u, 1.98, 2.48),
    wrap = ramp(u, 2.52, 2.86);
  const positions: Pose[] = [
    between([765, 435, 0.7], [743, 495, 0.71], land),
    between([763, 585, 0.7], [301, 724, 0.73], ramp(u, 2.46, 2.94)),
    between([763, 743, 0.7], [740, 778, 0.72], ramp(u, 2.94, 3.55)),
  ];
  const focus: Pose = between([540, 575, 1.18], [297, 428, 0.64], open);
  return (
    <>
      <At p={[740, 596, 1]} opacity={land}>
        <Paper w={454} h={492} color="#e7ecdf" />
        <Tag x={-198} y={-207}>
          New page / Lines of sight
        </Tag>
      </At>
      <At p={focus}>
        <Surface amount={0} wrap={1 - open} front={<Player progress={0.97} />} back={<Library tab={0} />} />
      </At>
      <At p={between([540, 575, 0.55], [753, 570, 0.73], open)} opacity={open * (1 - dissolve)}>
        <Library tab={0} />
      </At>
      {positions.map((pos, i) => (
        <At key={i} p={between([753, 570, 0.73], pos, dissolve)} opacity={dissolve}>
          {i === 0 ? (
            <>
              <Paper w={573} h={284} />
              <At p={[0, -24, 0.88]}>
                <Transcript />
              </At>
            </>
          ) : i === 1 ? (
            <Surface
              w={489}
              h={190}
              amount={ramp(u, 2.93, 3.25) * (1 - ramp(u, 3.78, 4.13))}
              wrap={wrap}
              front={
                <>
                  <Paper w={489} h={190} />
                  <Still w={471} h={173} />
                </>
              }
              back={
                <Slip
                  w={489}
                  h={190}
                  label="Working note"
                  lines={['Where does the far', 'tower disappear?']}
                  size={33}
                />
              }
            />
          ) : (
            <Slip
              w={526}
              h={125}
              label="Source"
              color={C.rust}
              lines={['Detroit Publishing Co., 1902.']}
              size={29}
            />
          )}
        </At>
      ))}
    </>
  );
}
export function Reprise({u}: {u: number}) {
  const arrangement: Pose[] = [
    [215, 430, 0.43],
    [540, 420, 0.43],
    [861, 430, 0.43],
    [222, 694, 0.42],
    [542, 696, 0.42],
    [855, 695, 0.42],
  ];
  const final: Pose[] = [
    [208, 518, 0.48],
    [525, 713, 0.34],
    [850, 481, 0.4],
    [506, 481, 0.4],
    [770, 691, 0.37],
    [239, 762, 0.34],
  ];
  const moving = ramp(u, 4.87, 5.89),
    nest = ramp(u, 5.89, 6.6);
  return (
    <>
      <At p={[540, 583, 1]} opacity={nest}>
        <Paper w={933} h={507} color="#e9eee4" />
        <Tag x={-430} y={-215}>
          A new study of the crossing
        </Tag>
      </At>
      <At p={[675, 482, 1]} opacity={nest}>
        <rect x={-300} y={-93} width={604} height={186} fill="none" stroke={C.teal} strokeWidth={2} />
      </At>
      {arrangement.map((p, i) => (
        <At key={i} p={between(p, final[i], moving)}>
          {i === 0 ? (
            <Surface
              amount={ramp(u, 0.12, 0.62) * (1 - ramp(u, 4.9, 5.4))}
              wrap={1 - moving}
              front={<Print />}
              back={<Catalog />}
            />
          ) : i === 1 ? (
            <>
              <g opacity={1 - moving}>
                <Paper w={600} h={380} />
                <Tag x={-263} y={-142}>
                  Dear Mara,
                </Tag>
                <g transform="translate(0 -94)">
                  <Tabs w={530} labels={['Direct', 'Hope', 'Grace']} active={u < 1.35 ? 0 : 1} />
                </g>
              </g>
              <g opacity={moving}>
                <Paper w={602} h={185} />
                <Tag x={-259} y={-54}>
                  From the letter
                </Tag>
              </g>
              <Words
                x={-259}
                y={30}
                size={39}
                lines={
                  u < 1.35
                    ? ['I was disappointed not', 'to receive a reply.']
                    : ['I had hoped to hear', 'from you sooner.']
                }
                italic
              />
            </>
          ) : i === 2 ? (
            <>
              <g opacity={1 - moving}>
                <Paragraph />
              </g>
              <At
                p={[
                  mix(-90, -240, ramp(u, 1.3, 1.85)) * (1 - moving),
                  131 * (1 - moving),
                  mix(0.38, 0.95, moving),
                ]}
              >
                <Slip label="Evidence" lines={['The deck stays sharp.']} />
              </At>
            </>
          ) : i === 3 ? (
            <>
              <At p={[0, 0, ramp(u, 1.95, 2.5)]}>
                <Paper w={644} h={474} color="#dbe4d5" />
              </At>
              <At p={[0, 0, 0.69]}>
                <FieldPage />
              </At>
            </>
          ) : i === 4 ? (
            <At p={[0, 0, 0.72]}>
              <Dialogue u={mix(1.8, 3, ramp(u, 0.93, 1.62))} />
            </At>
          ) : (
            <Surface
              wrap={1 - moving}
              amount={ramp(u, 3.85, 4.56) * (1 - ramp(u, 5.02, 5.72))}
              front={<Player progress={0.7} />}
              back={<Library tab={0} />}
            />
          )}
        </At>
      ))}
    </>
  );
}
export function Close({u}: {u: number}) {
  const inPage = ramp(u, 1.95, 2.45) * (1 - ramp(u, 2.91, 3.49));
  const quiet = ramp(u, 5.12, 6.08);
  return (
    <>
      <At p={[540, 560, 1]} opacity={inPage}>
        <Paper w={784} h={508} />
        <Tag x={-350} y={-202}>
          Field notes / East River
        </Tag>
        <Words x={-345} y={199} lines="The far tower fades into mist." size={30} italic />
      </At>
      <At p={[540, mix(569, 375, quiet), mix(0.94 - 0.3 * inPage, 0.44, quiet)]}>
        <Surface
          amount={ramp(u, 1.02, 1.35) * (1 - ramp(u, 1.62, 1.96))}
          wrap={ramp(u, 0.87, 1.18) * (1 - ramp(u, 2.97, 3.56))}
          front={<Print />}
          back={<Catalog />}
        />
      </At>
      <g opacity={ramp(u, 5.97, 6.3)}>
        <Words
          x={540}
          y={584}
          lines={['Mutability is not merely', 'the freedom to change things.']}
          size={49}
          anchor="middle"
        />
      </g>
      <g opacity={ramp(u, 6.98, 7.29)}>
        <Words
          x={540}
          y={751}
          lines={['It is the freedom to change', 'what things can become.']}
          size={53}
          italic
          color={C.teal}
          anchor="middle"
        />
      </g>
    </>
  );
}
