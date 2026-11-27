import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legalBreak} from './ranges.mjs';

test('edited continuations preserve every grapheme once in canonical order',()=>{
 const lines=['One 👩🏽‍🔬 words e\u0301 and another','Inserted words before 👩🏽‍🔬 words e\u0301 and another','👩🏽‍🔬','a'.repeat(80)+'👩🏽‍🔬'];
 for(const text of lines){
  const chars=[...text],edges=new Set([0,...Array.from(new Intl.Segmenter().segment(text),s=>[...text.slice(0,s.index+s.segment.length)].length)]);
  const offsets=[0,3,8,10,64,undefined].map(n=>legalBreak(text,n));
  assert.deepEqual(offsets,[...offsets].sort((a,b)=>a-b));assert.ok(offsets.every(n=>edges.has(n)));
  assert.equal(offsets.slice(1).map((end,i)=>chars.slice(offsets[i],end).join('')).join(''),text);
 }
 assert.equal(legalBreak('one two three',7),8);
});
