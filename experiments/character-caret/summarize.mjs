import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const stats=values=>{const a=values.toSorted((a,b)=>a-b);return {n:a.length,median:(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2,p95:a[Math.ceil(a.length*.95)-1]};};
const summary={};
for(const path of ['direct','solid']){
 const dir=`artifacts/character-caret/${path}`,r=JSON.parse(await readFile(`${dir}/results.json`,'utf8'));
 assert.ok(r.checks.every(c=>c.passed));assert.equal(r.errors.length,0);
 const spacing=r.matrix.find(m=>m.variant==='spacing');
 assert.equal(spacing.after.logical.head,1);assert.equal(spacing.before.logical.head,0);
 assert.equal(spacing.after.endpoints.focus,'original-text');assert.equal(spacing.after.endpoints.focusOffset,1);
 assert.ok(Math.abs(spacing.after.native.x-spacing.after.cell.x-spacing.after.cell.w)<.1);
 assert.ok(r.matrix.every(m=>m.after.sameText&&m.after.sameCell));
 await writeFile(`experiments/character-caret/evidence/${path}-caret.png`,await readFile(`${dir}/native-caret.png`));
 await writeFile(`experiments/character-caret/evidence/${path}-selection.png`,await readFile(`${dir}/native-selection.png`));
 const caret=await sharp(`${dir}/native-caret.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const selected=await sharp(`${dir}/native-selection.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixels=[];let blueRows=0;
 for(let y=0;y<caret.info.height;y++)for(let x=0;x<caret.info.width;x++){const i=(y*caret.info.width+x)*4;const [red,green,blue]=caret.data.subarray(i,i+3);if(red>230&&green<40&&blue>230)pixels.push({x,y});}
 for(let y=0;y<selected.info.height;y++){let count=0;for(let x=0;x<selected.info.width;x++){const i=(y*selected.info.width+x)*4;const [red,green,blue]=selected.data.subarray(i,i+3);if(blue>red+30&&green>red+10)count++;}if(count>=130)blueRows++;}
 assert.ok(pixels.length,'Native magenta caret is actually painted');
 const bounds={left:Math.min(...pixels.map(p=>p.x)),right:Math.max(...pixels.map(p=>p.x)),top:Math.min(...pixels.map(p=>p.y)),bottom:Math.max(...pixels.map(p=>p.y))};
 const clipLeft=Math.floor(r.trailing.cell.x)-5;
 const physicalCaretX=clipLeft+(bounds.left+bounds.right+1)/6;
 assert.ok(Math.abs(physicalCaretX-(r.trailing.cell.x+r.trailing.cell.w))<=1,'Painted native caret at trailing box boundary');
 assert.ok(blueRows/3>=45,'Native selection covers artwork height, not only the 17px Range');
 const performance={};for(const variant of ['plain','spacing']){const runs=r.performance.filter(p=>p.variant===variant),marks=runs.flatMap(p=>p.marks);assert.equal(marks.length,40);assert.ok(marks.every(m=>m.caret.anchor===(m.key==='x'?101:100)&&m.caret.head===(m.key==='x'?101:100)));performance[variant]={eventTimingMs:stats(runs.flatMap(p=>p.events.map(e=>e.duration))),firstFrameMs:stats(marks.map(m=>m.firstFrameMs)),keydownProcessingMs:stats(runs.flatMap(p=>p.events.map(e=>e.processing))),counts:runs.map(p=>p.counts)};}
 summary[path]={browser:r.browser.product,interactionChecks:r.checks.length,allPassed:true,activationMs:stats(r.activation.map(s=>s.ms)),performance,geometry:{cell:r.trailing.cell,nativeRange:r.trailing.native,paintedCaretX:physicalCaretX,paintedCaretBoundsAt3x:bounds,selectionBlueHeightCSSPx:blueRows/3},matrix:r.matrix.map(m=>({variant:m.variant,cell:m.after.cell,leading:m.before.native,trailing:m.after.native,selected:m.selection.native})),clipboard:r.clipboard,imePreedit:r.imePreedit.composing};
}
await mkdir('experiments/character-caret/evidence',{recursive:true});await writeFile('experiments/character-caret/evidence/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
