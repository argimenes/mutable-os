import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';
import {corpus} from '../corpus.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),evidence=path.join(here,'evidence');
const vault=await mkdtemp(path.join(tmpdir(),'folio-ii-check-')),server=await serve({port:0,vault});
const browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1480,height:780}}),errors=[],io=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
page.on('request',r=>{if(r.url().includes('/api/'))io.push(new URL(r.url()).pathname);});
const stats={browser:browser.version()}, frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const button=name=>page.getByRole('button',{name,exact:true}),mode=page.getByLabel('Navigation binding'),left=page.getByLabel('Original PDF page'),right=page.getByLabel('Mutable Folio page');
const pdfReady=()=>page.waitForFunction(()=>document.querySelector('[data-leaf=left] .textLayer span')&&!document.querySelector('[data-leaf=left] output'));
async function open(paper='bert'){
 await page.goto(server.url+'?paper='+paper,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.folioII?.metrics.openMs,undefined,{timeout:120000});
}
const revision=()=>page.evaluate(()=>[folioII.publication,folioII.layout].map(s=>s.editor.repository.state.revision));
async function selectPage(widget,number){await widget.selectOption(String(number));await frames();}
async function untilValue(widget,value){await page.waitForFunction(({name,value})=>document.querySelector('select[aria-label="'+name+'"]')?.value===value,
 {name:await widget.getAttribute('aria-label'),value:String(value)});}
const saveSpread=async()=>{await page.getByRole('button',{name:/^Save spread/}).click();await page.waitForFunction(()=>!folioII.layouts.isDirty(folioII.layoutId));};
async function inspectWork(){
 await page.evaluate(()=>{
   if(folioII.work)return;
   const work=folioII.work={snapshots:0,builds:0,commits:0,explorerMutations:0};
   for(const s of [folioII.layout,folioII.publication]){
     const e=s.editor;
     for(const [obj,name,counter] of [[e.repository,'snapshot','snapshots'],[e.repository,'commit','commits'],...[...e.projections.values()].map(p=>[p,'build','builds'])]){
       const orig=obj[name];obj[name]=function(...args){work[counter]++;return orig.apply(this,args);};
     }
   }
   const observer=new MutationObserver(rows=>{work.explorerMutations+=rows.length;});
   folioII.observeExplorer=()=>{
     const rows=[...document.querySelectorAll('.flint-tree-document')];
     for(const row of rows)observer.observe(row,{attributes:true,subtree:true,childList:true,characterData:true});return rows.length;
   };
 });
}
const work=()=>page.evaluate(()=>({...folioII.work}));
const viewport=side=>page.locator('[data-leaf='+side+'] .folio-viewport');
const ratio=side=>viewport(side).evaluate(el=>el.scrollTop/(el.scrollHeight-el.clientHeight));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await open();stats.mount=await page.evaluate(()=>({renderMs:folioII.metrics.mountMs,openToSecondFrameMs:folioII.metrics.openMs}));
 assert.equal(await left.count(),0);assert.equal(io.some(p=>p.startsWith('/api/assets/')),false);
 await page.screenshot({path:path.join(evidence,'initial.png')});
 let t=performance.now();await button('Reveal left leaf').click();await pdfReady();stats.firstRevealMs=performance.now()-t;
 assert.equal(await page.evaluate(()=>folioII.metrics.live),2);
 await mode.selectOption('navigation/page');await saveSpread();await inspectWork();let before=await revision();io.length=0;
 const sweep=server.knowledge.metrics.sweeps;
 await selectPage(left,3);await untilValue(right,3);await pdfReady();await page.locator('.folio-sheet img').evaluate(img=>img.decode());
 await page.screenshot({path:path.join(evidence,'figure-spread.png')});
 const fig=await page.evaluate(()=>({caption:document.querySelector('[data-frame*="p3-b2-0"]').textContent.slice(0,90),
 image:document.querySelector('.folio-sheet img').naturalWidth,text:document.querySelector('.folio-sheet').innerText}));
 assert.equal(fig.image,608);assert.match(fig.caption,/Figure 1/);assert.ok(!fig.text.includes('NSP Mask LM'));
 await page.getByText('Figure labels',{exact:true}).click();assert.match(await page.locator('.composed-figure details p').first().innerText(),/NSP Mask LM/);
 await page.getByText('Figure labels',{exact:true}).click();
 await selectPage(right,2);await untilValue(left,2);await pdfReady();
 const continued=await page.locator('[data-frame*="p1-b15-0-ii-part1"]').textContent();
 assert.match(continued,/^word based only/);
 await selectPage(right,1);await untilValue(left,1);await pdfReady();
 assert.match(await page.locator('[data-frame*="p1-b15-0-ii-part1"]').textContent(),/of the masked\s*$/);
 assert.deepEqual(await revision(),before);assert.deepEqual(await work(),{snapshots:0,builds:0,commits:0,explorerMutations:0});
 assert.deepEqual(io.filter(route=>!route.startsWith('/api/assets/')),[]);stats.pageAssetReads=io.length;assert.equal(server.knowledge.metrics.sweeps,sweep);
 await mode.selectOption('');await saveSpread();await selectPage(left,3);await pdfReady();assert.equal(await right.inputValue(),'1');
 await mode.selectOption('navigation/progress');await saveSpread();before=await revision();const baseWork=await work();io.length=0;
 const base=await page.evaluate(()=>({...folioII.metrics}));
 // Use real Chromium wheel input. Reverse before hitting either end of the independent scroll ranges.
 await viewport('left').hover();t=performance.now();
 for(let i=0;i<48;i++)await page.mouse.wheel(0,i%16<8?11:-11);
 await frames();await pause(100);await frames();
 const after=await page.evaluate(()=>({...folioII.metrics}));
 stats.scroll={durationMs:performance.now()-t,wheels:48,published:after.published-base.published,received:after.received-base.received,receiverMs:after.deliveryMs-base.deliveryMs};
 assert.ok(stats.scroll.received>8);assert.ok(stats.scroll.received<=stats.scroll.published && stats.scroll.published<=stats.scroll.wheels);
 assert.ok(Math.abs(await ratio('right')-await ratio('left'))<.025);
 // Race gestures within a frame. A delayed scroll event from the previous side must lose ownership.
 await page.evaluate(()=>{const l=document.querySelector('[data-leaf=left] .folio-viewport'),r=document.querySelector('[data-leaf=right] .folio-viewport');
   l.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));l.scrollTop=40;l.dispatchEvent(new Event('scroll'));
   r.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));r.scrollTop=(r.scrollHeight-r.clientHeight)*.72;r.dispatchEvent(new Event('scroll'));
 });
 await frames();await pause(90);assert.ok(Math.abs(await ratio('left')-.72)<.025);
 const settled=await page.evaluate(()=>folioII.metrics.received);await pause(100);assert.equal(await page.evaluate(()=>folioII.metrics.received),settled);
 assert.deepEqual(await work(),baseWork);assert.deepEqual(await revision(),before);assert.deepEqual(io,[]);assert.equal(server.knowledge.metrics.sweeps,sweep);
 assert.deepEqual(await page.evaluate(()=>[folioII.native.isDirty(folioII.id),folioII.layouts.isDirty(folioII.layoutId)]),[false,false]);
 stats.navigation={apiRequests:io.length,repositoryCommits:0,snapshots:0,projectionBuilds:0,graphSweeps:0,delayedEchoes:0};
 const prior=await ratio('left');await button('Collapse left leaf').click();assert.equal(await left.count(),0);
 assert.equal(await page.evaluate(()=>folioII.metrics.live),1);
 t=performance.now();await button('Reveal left leaf').click();await pdfReady();stats.repeatRevealMs=performance.now()-t;
 assert.equal(await left.inputValue(),'3');assert.ok(Math.abs(await ratio('left')-prior)<.025);
 await button('Collapse right leaf').click();assert.equal(await right.count(),0);await button('Reveal right leaf').click();
 const gutter=page.getByRole('separator',{name:'Leaf width'});const box=await gutter.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();
 await page.mouse.move(box.x+box.width/2+74,box.y+20,{steps:8});await page.mouse.up();
 const dragged=Number(await gutter.getAttribute('aria-valuenow'));assert.ok(dragged>=54&&dragged<=56);
 await gutter.focus();await page.keyboard.press('ArrowRight');const authored=Number(await gutter.getAttribute('aria-valuenow'));assert.equal(authored,dragged+5);
 await button('Remember open leaves').click();await gutter.focus();await page.keyboard.press(process.platform==='darwin'?'Meta+s':'Control+s');await page.waitForFunction(()=>!folioII.layouts.isDirty(folioII.layoutId));
 await button('Open Flint').click();
 const titleId=await page.locator('.composed-frame').first().getAttribute('data-frame');
 const block=page.locator('.folio-flint [data-block-id="'+titleId+'"]'),flow=block.locator('.reactive-standoff-flow');
 await flow.waitFor({state:'attached'});await page.locator('.flint-tree-document').first().waitFor();
 stats.explorerRows=await page.evaluate(()=>folioII.observeExplorer());assert.ok(stats.explorerRows>0);
 const withExplorer=await work();await viewport('right').hover();await page.mouse.wheel(0,40);await frames();
 assert.deepEqual(await work(),withExplorer);

 async function selection(start,end){await flow.evaluate((el,[anchor,head])=>{
   const e=folioII.publication.editor,m=e.mounts.get(e.mounts.resolveElement(el).nodeKey);m.focus();m.restoreInlineSelection({anchor,head});
 },[start,end]);}
 const title=await flow.textContent();await selection(0,0);
 const following=page.locator('.composed-frame').nth(1),top=await following.evaluate(e=>e.offsetTop);
 await page.keyboard.insertText('Longer publication heading '.repeat(16));await frames();
 const moved=await following.evaluate(e=>e.offsetTop);
 const gap=await page.locator('.composed-frame').first().evaluate((el)=>{
   const next=document.querySelectorAll('.composed-frame')[1];return next.getBoundingClientRect().top-el.getBoundingClientRect().bottom;});
 assert.ok(moved>top&&gap>=-1);stats.reflow={followingFrameMovedPx:moved-top,gapPx:gap};
 await page.evaluate(()=>folioII.publication.editor.repository.undo());assert.equal(await flow.textContent(),title);
 const continuedId=await page.locator('[data-frame*="p1-b15-0-ii-part1"]').getAttribute('data-frame');
 const sharedFlow=page.locator('.folio-flint [data-block-id="'+continuedId+'"] .reactive-standoff-flow'),whole=await sharedFlow.textContent();
 await sharedFlow.evaluate(el=>{const e=folioII.publication.editor,m=e.mounts.resolveElement(el).handle;m.focus();m.restoreInlineSelection({anchor:0,head:0});});
 await page.keyboard.insertText('Edited: ');await frames();
 const firstHalf=await page.locator('[data-frame="'+continuedId+'"]').textContent();
 await selectPage(right,2);const secondHalf=await page.locator('[data-frame="'+continuedId+'"]').textContent();
 assert.equal(firstHalf+secondHalf,'Edited: '+whole);stats.multiFrameEdit=true;
 await page.evaluate(()=>folioII.publication.editor.repository.undo());await selectPage(right,1);
 await selection(0,4);await button('Bind selection to BERT').click();
 await page.waitForFunction(()=>document.querySelector('.composed-frame [data-entity]'));
 const bound=await page.locator('.composed-frame [data-entity]').innerText();assert.equal(bound,'BERT');
 await block.locator('svg [stroke="purple"]').first().waitFor({state:'attached'});
 await button('Collapse left leaf').click();await page.screenshot({path:path.join(evidence,'entity-flint-folio.png')});
 await button('Reveal left leaf').click();await pdfReady();
 stats.entity={name:bound,id:await page.locator('.composed-frame [data-entity]').getAttribute('data-entity')};
 stats.typing=[];
 for(const pdf of ['expanded','collapsed']){
   if(pdf==='collapsed')await button('Collapse left leaf').click();
   await selection(4,4);await frames();const w=await work();io.length=0;
   await page.evaluate(()=>{folioII.metrics.record=true;folioII.metrics.frameReads=[];});
   const times=[];
   for(const letter of 'abcdefghijkl'){
     t=performance.now();await page.keyboard.insertText(letter);times.push(performance.now()-t);
   }
   await frames();assert.ok((await page.locator('[data-frame="'+titleId+'"]').textContent()).startsWith('BERTabcdefghijkl'));
   const m=await page.evaluate(()=>{folioII.metrics.record=false;return [...new Set(folioII.metrics.frameReads)];});
   const final=await work();assert.equal(m.length,1);assert.equal(final.snapshots,w.snapshots);assert.equal(final.builds,w.builds);assert.deepEqual(io,[]);
   stats.typing.push({pdf,samples:times.length,driverMedianMs:times.sort((a,b)=>a-b)[6],driverMaxMs:times.at(-1),affectedContents:m.length,snapshots:0,projectionBuilds:0,apiRequests:0});
   await page.evaluate(original=>{const e=folioII.publication.editor,m=e.mounts.resolveElement(document.activeElement).handle;
     for(let i=0;i<12&&m.captureText()!==original;i++)e.repository.undo();},title);
   assert.equal(await flow.textContent(),title);
 }
 await page.evaluate(()=>folioII.publication.editor.repository.redo());
 const edited=await flow.textContent();assert.notEqual(edited,title);
 await selection(0,0);await page.keyboard.press(process.platform==='darwin'?'Meta+s':'Control+s');
 await page.waitForFunction(()=>!folioII.native.isDirty(folioII.id));
 assert.ok(!(await readdir(vault)).some(f=>f.endsWith('.md')));
 const bytes=await readFile(path.join(vault,'bert.ink')),wire=JSON.parse(bytes);
 assert.equal(wire.document.blocks.find(b=>b.id===titleId).properties.standoffProperties.find(p=>p.type==='codex/entity-reference').value,stats.entity.id);
 const graph=await server.knowledge.entityLookup({vault:path.basename(vault),request:{op:'get',id:stats.entity.id}});assert.equal(graph.entity.name,'BERT');
 const original=wire.document.blocks[0].properties.metadata.folio.original;
 const response=await fetch(new URL('/api/assets/'+original.assetId+'/content?cavernId='+original.cavernId,server.url));
 assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),corpus[2].sha256);
 await open();await pdfReady();assert.equal(Number(await gutter.getAttribute('aria-valuenow')),authored);assert.equal(await mode.inputValue(),'navigation/progress');assert.equal(await left.inputValue(),'1');
 assert.equal(await page.locator('[data-frame="'+titleId+'"]').textContent(),edited);assert.equal(await page.locator('.composed-frame [data-entity]').getAttribute('data-entity'),stats.entity.id);
 await button('Open Flint').click();await block.locator('svg [stroke="purple"]').first().waitFor({state:'attached'});
 stats.saveOpen={layout:true,editedText:true,entity:true,originalSha256:corpus[2].sha256,transientPageReset:true};
 // An explicitly reordered Mutable edition loses its matching page domain. Progress stays available.
 await page.evaluate(()=>{
   const {publication,id}=folioII,e=publication.editor;
   const n=Object.values(publication.projection.state.nodes).find(n=>n.payload.id===id);
   const metadata=e.repository.readState().contents[n.contentKey].payload.metadata;
   const pages=[...metadata.folio.pages];[pages[0],pages[1]]=[pages[1],pages[0]];
   e.commands.setPayloadField(n.key,'metadata',{...metadata,folio:{...metadata.folio,pages}},'Reorder demonstration pages');
 });
 assert.ok(await mode.locator('option[value="navigation/page"]').evaluate(o=>o.disabled));
 assert.ok(await mode.locator('option[value="navigation/progress"]').evaluate(o=>!o.disabled));
 await page.evaluate(()=>folioII.publication.editor.repository.undo());
 assert.ok(await mode.locator('option[value="navigation/page"]').evaluate(o=>!o.disabled));stats.divergentPagination=true;
 await button('Collapse left leaf').click();await button('Reveal left leaf').click();await button('Collapse left leaf').click();
 await pause(120);assert.equal(await page.locator('[data-leaf=left] canvas').count(),0);assert.equal(await page.evaluate(()=>folioII.metrics.live),1);
 stats.abortOnCollapse=true;
 for(const paper of corpus.slice(0,2)){await open(paper.id);assert.equal(await right.locator('option').count(),paper.id==='corner'?2:9);assert.ok((await page.locator('.composed-frame').count())>0);}
 assert.deepEqual(errors,[]);stats.browserErrors=errors;
 await writeFile(path.join(evidence,'browser.json'),JSON.stringify(stats,null,2)+'\n');console.log(JSON.stringify(stats,null,2));
}finally{await browser.close();await server.close();await rm(vault,{recursive:true,force:true});}
