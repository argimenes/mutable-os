import React from 'react';
import {ink,type} from '../../theme';
import type {Point} from '../006-where-text-meets-the-graph/graph';
import type {Claim} from './model';

export const claimHalfWidth=117, claimHalfHeight=49;
export function ClaimNode({claim,center,opacity}:{claim:Claim;center:Point;opacity:number}) {
  return <g data-claim={claim.id} opacity={opacity} transform={`translate(${center.x} ${center.y})`}>
    <rect x={-claimHalfWidth} y={-claimHalfHeight} width={234} height={98} rx={16} fill="#353140" stroke={ink.narrative} strokeWidth={3}/>
    <rect x={-111} y={-43} width={222} height={86} rx={12} fill="none" stroke={ink.narrative} opacity={.33}/>
    <text textAnchor="middle" y={-14} fontSize={18} letterSpacing={.7} fontFamily={type.mono} fill={ink.narrative}>CLAIM STATEMENT · {claim.id}</text>
    <text textAnchor="middle" y={29} fontSize={41} fontFamily={type.serif} fill={ink.cream}>{claim.type}</text>
  </g>;
}
