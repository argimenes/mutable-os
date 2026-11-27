import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';

const evidence=fileURLToPath(new URL('./evidence/',import.meta.url));
const vault=await mkdtemp(path.join(tmpdir(),'folio-semantic-'));
const server=process.env.FOLIO_TEST_URL?{url:process.env.FOLIO_TEST_URL,close:async()=>{}}:await serve({port:0,vault});
const browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1536,height:960}}), errors=[], requests=[];
page.setDefaultTimeout(15000);
page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()).pathname);});
page.on('dialog',d=>d.accept());
const stats={browser:browser.version()},button=name=>page.getByRole('button',{name,exact:true});
const wait=(f,arg)=>page.waitForFunction(f,arg,{timeout:25000});
const paint=()=>page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
async function timed(name,work){const start=performance.now();await work();await paint();stats[name]=Math.round(performance.now()-start);}
async function open(file){await page.goto(server.url+'?file='+file,{waitUntil:'commit'});await page.waitForFunction(()=>window.folioIII?.metrics.openMs,undefined,{timeout:120000});}
async function selectTerm(term){
 await page.evaluate(term=>{for(const s of document.querySelectorAll('.folio-ink > span')){
  const at=s.textContent.indexOf(term);if(at<0)continue;const r=document.createRange();r.setStart(s.firstChild,at);r.setEnd(s.firstChild,at+term.length);
  const sel=getSelection();sel.removeAllRanges();sel.addRange(r);s.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return;}throw Error('Term unavailable: '+term);},term);
 assert.equal(await page.evaluate(()=>folioIII.selection()?.text),term);
}
async function verifyEndpoints(){
 await paint();
 assert.ok(await page.evaluate(()=>{
   const svg=document.querySelector('.folio-threads'),stage=svg.getBoundingClientRect(),heading=document.querySelector('.semantic-inspector h3').getBoundingClientRect();
   const rects=[...document.querySelectorAll('.folio-range-layer path[fill="#79a889"]')].map(p=>p.getBoundingClientRect());
   const inside=(p,r)=>p.x+stage.left>=r.left-2&&p.x+stage.left<=r.right+2&&p.y+stage.top>=r.top-2&&p.y+stage.top<=r.bottom+2;
   const paths=[...svg.querySelectorAll('path')];return paths.length>0&&paths.every(path=>inside(path.getPointAtLength(0),heading)&&rects.some(r=>inside(path.getPointAtLength(path.getTotalLength()),r)));
 }),'Thread endpoints align with the mounted inspector and highlight');
}
const pdf=()=>wait(()=>document.querySelector('.textLayer span')&&!document.querySelector('.folio-pdf')?.parentElement.querySelector('output'));
const snap=name=>page.screenshot({path:path.join(evidence,name+'.png')});
try{
 await open('bert.ink');stats.openMs=await page.evaluate(()=>folioIII.metrics.openMs);
 assert.equal(await page.locator('.folio-pdf').count(),0);await snap('reader');
 await selectTerm('BERT');await button('Gloss').click();const gloss=page.getByRole('textbox',{name:'Gloss'});
 await gloss.fill('note: Spatial annotation qualification');await gloss.press('Enter');await wait(()=>document.querySelector('[data-gloss]'));
 await selectTerm('BERT');await button('Scry').click();const query=page.getByLabel('Scry query');
 const create=button('Create entity from search term'),name='Scry verification '+crypto.randomUUID();
 await query.fill('   ');assert.ok(await create.isDisabled());
 const beforeCreate=await page.evaluate(()=>folioIII.editor.repository.state.revision);
 await query.fill('  '+name+'  ');await create.click();
 await page.getByRole('button',{name,exact:true,pressed:true}).waitFor();
 assert.ok(await create.isDisabled());
 assert.equal(await page.locator('.folio-scry blockquote').innerText(),'BERT');
 assert.equal(await page.evaluate(()=>folioIII.editor.repository.state.revision),beforeCreate);
 const lookup=await page.request.post(new URL('/api/folio/entity',server.url).href,{data:{op:'search',query:name,stream:'name',match:'exact'}});
 assert.deepEqual((await lookup.json()).matches.map(m=>m.name),[name]);
 await query.fill('Transformers');await wait(()=>document.querySelector('.folio-scry li'));assert.equal(await page.locator('blockquote').innerText(),'BERT');
 await query.fill('BERT');await wait(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Bind original selection')?.disabled);
 await snap('scry');await timed('singleBindMs',()=>button('Bind original selection').click());await wait(()=>folioIII.mentions().length===1);
 await page.evaluate(()=>folioIII.editor.repository.undo());await wait(()=>folioIII.inventory.state.rows.length===0);
 await selectTerm('BERT');await button('Scry').click();await button('Select all matches').click();
 await timed('multiBindMs',()=>button('Bind selected mentions').click());await wait(()=>folioIII.mentions().length>2);
 stats.references=await page.evaluate(()=>folioIII.mentions().length);
 await timed('manualSaveMs',async()=>{await page.getByRole('button',{name:/^Save/}).click();await wait(()=>!folioIII.native.isDirty(folioIII.id));});
 await timed('sourceRevealMs',async()=>{await button('Reveal left leaf').click();await pdf();});
 await button('Collapse left leaf').click();await timed('repeatRevealMs',async()=>{await button('Reveal left leaf').click();await pdf();});
 await page.getByLabel('Navigation binding').selectOption('navigation/page');
 await page.evaluate(()=>{window.leaves=[...document.querySelectorAll('.spread-leaf')];window.sourceCanvas=document.querySelector('.folio-pdf canvas');window.sheet=document.querySelector('.folio-sheet');});
 await timed('swapMs',()=>button('Swap Leaves').click());assert.ok(await page.evaluate(()=>leaves.every((l,i)=>document.querySelectorAll('.spread-leaf')[i]===l)&&leaves[0].dataset.leaf==='right'&&sheet===document.querySelector('.folio-sheet')&&sourceCanvas===document.querySelector('.folio-pdf canvas')));
 await page.evaluate(()=>folioIII.editor.repository.undo());assert.equal(await page.locator('.spread-leaf').first().getAttribute('data-leaf'),'left');
 await page.evaluate(()=>folioIII.editor.repository.redo());await button('Swap Leaves').click();
 assert.ok(await page.evaluate(()=>sourceCanvas===document.querySelector('.folio-pdf canvas')));
 const source=page.getByLabel('Original PDF page');await source.focus();await page.keyboard.press('Tab');
 assert.ok(await page.evaluate(()=>document.activeElement.closest('.spread-leaf')===leaves[0]));
 await page.getByLabel('Navigation binding').selectOption('navigation/progress');
 await page.setViewportSize({width:1480,height:670});await paint();
 const workStart=await page.evaluate(()=>({...folioIII.metrics}));
 await page.locator('[data-leaf=left] .folio-viewport').hover();await timed('linkedScrollMs',async()=>{
  for(let i=0;i<24;i++)await page.mouse.wheel(0,i%12<6?18:-18);await paint();});
 stats.scrollDeliveries=await page.evaluate(n=>folioIII.metrics.received-n,workStart.received);assert.ok(stats.scrollDeliveries>0,JSON.stringify(await page.locator('.folio-viewport').evaluateAll(v=>v.map(el=>[el.clientHeight,el.scrollHeight,el.scrollTop]))));
 await page.setViewportSize({width:1536,height:960});
 await page.getByLabel('Navigation binding').selectOption('navigation/page');
 await page.getByRole('button',{name:/^Save/}).click();await wait(()=>!folioIII.native.isDirty(folioIII.id));
 const revision=await page.evaluate(()=>folioIII.editor.repository.state.revision);const networkStart=requests.length;
 await button('Clear focus').click();await timed('focusSpineMinimapMs',()=>page.locator('.entity-row').first().click());
 await timed('referenceMs',()=>button('Next reference').click());
 await timed('galleryMs',()=>button('Gallery').click());assert.ok(await page.locator('.page-gallery svg').count()<=8);
 await button('Gallery page 3').click();await wait(()=>document.querySelector('[aria-label="Original PDF page"]').value==='3');
 await timed('threadsMs',()=>button('Threads').click());await button('Spotlight').click();await wait(()=>document.querySelector('.folio-sheet img')?.naturalWidth>0);await snap('semantic-spread');
 await page.getByLabel('Zoom').selectOption('1.25');await page.setViewportSize({width:1420,height:920});await paint();
 await button('Spine page 1').click();await button('Gallery').click();await button('Next reference').click();await paint();
 await wait(()=>document.querySelector('.folio-threads path'));await verifyEndpoints();stats.visibleThreads=await page.locator('.folio-threads path').count();
 assert.equal(await page.evaluate(()=>folioIII.editor.repository.state.revision),revision);
 stats.transientWrites=requests.slice(networkStart).filter(p=>p.includes('save'));assert.equal(stats.transientWrites.length,0);
 await button('Swap Leaves').click();await verifyEndpoints();await page.evaluate(()=>folioIII.editor.repository.undo());await verifyEndpoints();
 await page.getByRole('button',{name:/^Save/}).click();await wait(()=>!folioIII.native.isDirty(folioIII.id));
 const transientRevision=await page.evaluate(()=>folioIII.editor.repository.state.revision);
 await button('Threads').click();await paint();const before=await page.evaluate(()=>folioIII.metrics.threadFrames);
 await page.locator('.folio-sheet').hover();await page.mouse.wheel(0,80);await paint();assert.equal(await page.evaluate(()=>folioIII.metrics.threadFrames),before);
 assert.equal(await page.evaluate(()=>folioIII.editor.repository.state.revision),transientRevision);assert.equal(await page.evaluate(()=>folioIII.native.isDirty(folioIII.id)),false);
 await button('Open in Flint').click();await wait(()=>document.querySelector('.folio-flint .reactive-standoff-flow'));stats.flintGloss=await page.locator('.folio-flint .mutable-gloss-anchor').count();
 assert.ok(stats.flintGloss>0);assert.ok(await page.locator('.folio-flint svg [stroke="purple"]').count()>0);
 await button('Spine page 1').click();const titleId=await page.locator('.composed-frame').first().getAttribute('data-frame');
 const flow=page.locator('.folio-flint [data-block-id="'+titleId+'"] .reactive-standoff-flow');
 const original=await flow.textContent();
 await flow.evaluate(el=>{const e=folioIII.editor,m=e.mounts.resolveElement(el).handle;m.focus();m.restoreInlineSelection({anchor:0,head:0});});
 await paint();await page.evaluate(()=>{const {editor,metrics}=folioIII;metrics.record=true;metrics.summaryBuilds=0;metrics.frameReads=[];metrics.snapshots=0;metrics.builds=0;
  for(const [obj,fn,count] of [[editor.repository,'snapshot','snapshots'],...[...editor.projections.values()].map(p=>[p,'build','builds'])]){
   const orig=obj[fn];obj[fn]=function(...args){metrics[count]++;return orig.apply(this,args);};}});
 const net=requests.length;await timed('flintEditsMs',async()=>{for(const ch of 'folio')await page.keyboard.insertText(ch);});
 stats.withFolio=await page.evaluate(()=>{const m=folioIII.metrics;m.record=false;return {snapshots:m.snapshots,builds:m.builds,summaryBuilds:m.summaryBuilds,readBlocks:new Set(m.frameReads).size};});
 assert.deepEqual(stats.withFolio,{snapshots:0,builds:0,summaryBuilds:0,readBlocks:1});assert.equal(requests.length,net);
 assert.equal(await flow.textContent(),'folio'+original);
 await page.evaluate(()=>{for(let i=0;i<5;i++)folioIII.editor.repository.undo();});assert.equal(await flow.textContent(),original);
 const parts=await flow.evaluate(el=>{const e=folioIII.editor,key=e.mounts.resolveElement(el).nodeKey;return [key,e.commands.splitStandoff(key,8)];});
 await page.getByRole('button',{name:'Read unplaced content in Flint'}).waitFor();
 await page.evaluate(([a,b])=>folioIII.editor.commands.joinStandoff(a,b),parts);assert.equal(await flow.textContent(),original);
 await button('Close Flint').click();await page.getByRole('button',{name:/^Save/}).click();await wait(()=>!folioIII.native.isDirty(folioIII.id));assert.equal(await page.evaluate(async()=>{const {native,id,file}=folioIII,doc=(await native.discoverVault('.')).documents.find(d=>d.resourceId===id);
  const result=await native.relocateVault({operationId:crypto.randomUUID(),vault:'.',kind:'pair',source:file,destination:'relocated-reading.ink',baselines:[{resourceId:id,baseline:doc.baseline}]});return result.phase;}),'relocated');
 const beforeMove=await page.evaluate(()=>folioIII.mentions().map(m=>m.id).sort());
 await open('relocated-reading.ink');await page.locator('.entity-row').first().click();assert.equal(await page.evaluate(()=>folioIII.mentions().length),stats.references);assert.deepEqual(await page.evaluate(()=>folioIII.mentions().map(m=>m.id).sort()),beforeMove);
 assert.ok(await page.locator('[data-gloss]').count()>0);await button('Reveal left leaf').click();await pdf();await button('Spine page 3').click();
 await wait(()=>document.querySelector('.folio-sheet img')?.naturalWidth>0);stats.managedFigureWidth=await page.locator('.folio-sheet img').first().evaluate(el=>el.naturalWidth);
 assert.deepEqual(errors,[]);await writeFile(path.join(evidence,'browser.json'),JSON.stringify(stats,null,2)+'\n');console.log(stats);
}catch(e){console.error('Last screen', (await page.locator('body').innerText()).slice(-1600));throw e;}
finally{await browser.close();await server.close();await rm(vault,{recursive:true,force:true});}
