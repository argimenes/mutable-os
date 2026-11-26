import React, {useMemo, type ReactNode} from 'react';
import {ease} from '../../shared/motion';
import {TextRun, namedRange} from '../../shared/TextRun';
import {type} from '../../theme';

export const C = {
  canvas: '#e2dfd6',
  page: '#fffaf0',
  ink: '#222b29',
  quiet: '#505d55',
  line: '#aaa99b',
  teal: '#24665e',
  rust: '#9b4c33',
  gold: '#806427',
  blue: '#47677e',
  plum: '#76576c',
};
export const photo = require('./bridge.jpg') as string;
export const ramp = ease;
export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export type Pose = readonly [number, number, number];
export function between(a: Pose, b: Pose, p: number): Pose {
  return [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];
}
export function travel(u: number, initial: Pose, stops: readonly [number, number, Pose][]): Pose {
  return stops.reduce((pose, [start, end, next]) => between(pose, next, ease(u, start, end)), initial);
}
export function At({p, children, opacity = 1}: {p: Pose; children: ReactNode; opacity?: number}) {
  return (
    <g transform={`translate(${p[0]} ${p[1]}) scale(${p[2]})`} opacity={opacity}>
      {children}
    </g>
  );
}
export function Words({
  x = 0,
  y = 0,
  lines,
  size = 34,
  leading = size * 1.24,
  color = C.ink,
  anchor = 'start',
  italic = false,
  font = type.serif,
}: {
  x?: number;
  y?: number;
  lines: string | string[];
  size?: number;
  leading?: number;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  italic?: boolean;
  font?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      fontFamily={font}
      fontStyle={italic ? 'italic' : 'normal'}
      fill={color}
    >
      {(typeof lines === 'string' ? [lines] : lines).map((line, i) => (
        <tspan key={i} x={x} dy={i ? leading : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
export function Tag({
  x = 0,
  y = 0,
  children,
  color = C.teal,
  size = 19,
}: {
  x?: number;
  y?: number;
  children: string;
  color?: string;
  size?: number;
}) {
  return (
    <text x={x} y={y} fontSize={size} fontFamily={type.mono} fill={color} letterSpacing={1}>
      {children.toUpperCase()}
    </text>
  );
}
export function Paper({
  w,
  h,
  color = C.page,
  edge = C.line,
}: {
  w: number;
  h: number;
  color?: string;
  edge?: string;
}) {
  return (
    <>
      <rect x={-w / 2 + 4} y={-h / 2 + 7} width={w} height={h} fill="#344137" opacity=".095" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={color} stroke={edge} strokeWidth={1.7} />
    </>
  );
}
export function Rule({x, y, w, color = C.line}: {x: number; y: number; w: number; color?: string}) {
  return <path d={`M${x} ${y}h${w}`} stroke={color} fill="none" strokeWidth={1.6} />;
}
// Both faces pivot about the same spine. Edge-on, the paper narrows to its thickness.
export function Surface({
  amount,
  wrap = 1,
  w = 600,
  h = 380,
  front,
  back,
}: {
  amount: number;
  wrap?: number;
  w?: number;
  h?: number;
  front: ReactNode;
  back: ReactNode;
}) {
  const theta = Math.PI * amount,
    width = Math.max(0.012, Math.abs(Math.cos(theta))),
    lift = Math.sin(theta);
  return (
    <g transform={`translate(0 ${-14 * lift}) skewY(${lift * 5}) scale(${width} 1)`}>
      <g opacity={wrap}>
        <rect
          x={-w / 2 - 10}
          y={-h / 2 - 10}
          width={w + 20}
          height={h + 20}
          fill="#d3dfd2"
          stroke={C.teal}
          strokeWidth={4}
          strokeDasharray={2 * (w + h + 40)}
          strokeDashoffset={(1 - wrap) * 2 * (w + h + 40)}
        />
      </g>
      {amount < 0.5 ? front : back}
      <path d={`M${w / 2 - 32} ${-h / 2 - 10}h42v42Z`} fill={C.teal} opacity={wrap} />
    </g>
  );
}
export function RangeLine({
  text,
  word,
  x,
  y,
  size = 35,
  on = 1,
  second = 0,
  dark = false,
}: {
  text: string;
  word: string;
  x: number;
  y: number;
  size?: number;
  on?: number;
  second?: number;
  dark?: boolean;
}) {
  const ranges = useMemo(() => [namedRange('mention', text, word)], [text, word]);
  return (
    <g transform={`translate(${x - 540} ${y})`} className={dark ? '' : 'xiv-ink'}>
      <TextRun text={text} ranges={ranges} size={size}>
        {({mention: m}) => (
          <>
            {[0, 1].map((i) => (
              <g
                key={i}
                opacity={i ? second : on}
                stroke={i ? '#c49a55' : dark ? '#87d1bf' : C.teal}
                fill={i ? '#c49a55' : dark ? '#87d1bf' : C.teal}
              >
                <path d={`M${m.left} ${10 + i * 10}H${m.right}`} strokeWidth={3} />
                {[m.left, m.right].map((v) => (
                  <circle key={v} cx={v} cy={10 + i * 10} r={3} />
                ))}
              </g>
            ))}
          </>
        )}
      </TextRun>
    </g>
  );
}
export function Print({w = 600, h = 380}: {w?: number; h?: number}) {
  return (
    <>
      <Paper w={w} h={h} />
      <svg
        x={-w / 2 + 13}
        y={-h / 2 + 13}
        width={w - 26}
        height={h - 70}
        viewBox="0 0 600 313"
        preserveAspectRatio="none"
      >
        <image href={photo} width="600" height="313" preserveAspectRatio="xMidYMid slice" />
      </svg>
      <Tag x={-w / 2 + 18} y={h / 2 - 18}>
        Plate I
      </Tag>
      <Words x={w / 2 - 18} y={h / 2 - 17} lines="Brooklyn Bridge, 1902" size={25} anchor="end" italic />
    </>
  );
}
export function Catalog() {
  return (
    <>
      <Paper w={600} h={380} />
      <Tag x={-264} y={-145}>
        Plate I / Research notes
      </Tag>
      <Words x={-264} y={-86} lines="Brooklyn Bridge" size={50} />
      <Rule x={-264} y={-64} w={528} />
      <Words
        x={-264}
        y={-22}
        lines={[
          'Detroit Publishing Co.  ·  1902',
          'Glass negative, 8 × 10 inches',
          'Library of Congress  ·  LC-D4-14479',
        ]}
        size={28}
      />
      <Tag x={-264} y={106} color={C.rust}>
        Observation
      </Tag>
      <Words x={-264} y={149} lines="The far tower dissolves into the sky." size={30} italic />
    </>
  );
}
export function Slip({
  label,
  lines,
  w = 510,
  h = 134,
  color = C.teal,
  size = 32,
}: {
  label: string;
  lines: string[];
  w?: number;
  h?: number;
  color?: string;
  size?: number;
}) {
  return (
    <>
      <Paper w={w} h={h} />
      <path d={`M${-w / 2 + 1} ${-h / 2}v${h}`} stroke={color} strokeWidth={7} />
      <Tag x={-w / 2 + 24} y={-h / 2 + 30} size={18} color={color}>
        {label}
      </Tag>
      <Words x={-w / 2 + 24} y={-h / 2 + 72} lines={lines} size={size} />
    </>
  );
}
export function Player({progress = 0}: {progress?: number}) {
  return (
    <>
      <Paper w={600} h={380} color="#233331" edge="#233331" />
      <svg x={-288} y={-176} width={576} height={285} viewBox="0 0 576 285">
        <g transform={`translate(${-95 * progress} ${-40 * progress}) scale(${1 + 0.35 * progress})`}>
          <image href={photo} width={576} height={285} preserveAspectRatio="xMidYMid slice" />
        </g>
        <path d="M0 235H576V285H0Z" fill="#182422" opacity=".83" />
        <Words x={22} y={271} size={30} color="#fffaec" lines="Reading the crossing" italic />
      </svg>
      <path d="M-264 131l23 14-23 14z" fill="#fffaec" />
      <path d="M-223 145H179" stroke="#6c7a70" strokeWidth={4} />
      <path d={`M-223 145h${32 + 320 * progress}`} stroke="#b7d6af" strokeWidth={5} />
      <Words
        x={265}
        y={154}
        lines={`0:${String(Math.round(progress * 12)).padStart(2, '0')}`}
        color="#fffaec"
        size={24}
        anchor="end"
        font={type.mono}
      />
    </>
  );
}
export function Drawing() {
  return (
    <>
      <Paper w={600} h={380} />
      <Tag x={-260} y={-145}>
        Figure II / Sight line
      </Tag>
      <path
        d="M-250 78H250M-165 78V-70H-143V78M160 78V-52H182V78M-251 44H250M-250 40Q-204 30 -154 -72Q0 68 171 -53Q217 1 251 16"
        stroke={C.teal}
        strokeWidth={6}
        fill="none"
      />
      {[-105, -65, -25, 15, 55, 95, 135].map((v, i) => (
        <path
          key={v}
          d={`M${v} ${-32 + 28 * Math.sin((i / 6) * Math.PI)}V42`}
          stroke={C.quiet}
          strokeWidth={2}
        />
      ))}
      <Words x={-260} y={146} size={36} italic lines="Tracing the deck" />
    </>
  );
}
export function Paragraph() {
  return (
    <>
      <Paper w={600} h={380} />
      <Tag x={-260} y={-144}>
        Field notes
      </Tag>
      <Words x={-260} y={-42} size={45} lines={['The deck draws the eye', 'across the water.']} />
      <Rule x={-260} y={102} w={120} color={C.teal} />
    </>
  );
}
export function NotesFace({label, lines}: {label: string; lines: string[]}) {
  return (
    <>
      <Paper w={600} h={380} />
      <Tag x={-255} y={-139}>
        {label}
      </Tag>
      <Rule x={-255} y={-110} w={510} />
      <Words x={-255} y={-32} size={38} lines={lines} italic />
    </>
  );
}
