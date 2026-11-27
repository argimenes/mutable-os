import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from './corpus.mjs';
import { serve } from './serve.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const vault=await mkdtemp(path.join(tmpdir(),'folio-qualification-'));
const {vite,url}=await serve({port:0,vault});
const browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'});
const results=[],errors=[];
try {
  for(const paper of corpus){
    const page=await browser.newPage({viewport:{width:1250,height:990}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    await page.goto(url+'?paper='+paper.id+'&page='+paper.samplePage);
    await page.waitForFunction(()=>window.folio?.metrics?.openAndSpatialMs);
    await page.locator('article img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    await page.locator('.folio-stage article').screenshot({path:path.join(here,'evidence',paper.id+'-folio.png')});
    const result=await page.evaluate(()=>({
      openAndSpatialMs:Math.round(folio.metrics.openAndSpatialMs), samplePage:folio.number(),
      sampleFrames:document.querySelectorAll('.folio-frame').length,
      sampleOverflowFrames:[...document.querySelectorAll('.folio-frame')].filter(f=>
        f.offsetHeight>Number(f.dataset.height)+parseFloat(getComputedStyle(f).lineHeight)).length}));
    await page.getByRole('button',{name:'Source PDF',exact:true}).click();
    assert.match(await page.locator('iframe.folio-source').getAttribute('src'),new RegExp(paper.id+'\\.pdf#page='+paper.samplePage+'$'));
    await page.getByRole('button',{name:'Folio',exact:true}).click();
    if(paper.id==='corner'){
      await page.getByLabel('Source page').selectOption('1');
      // Use a real DOM Range across the Folio text and ask the UI to restore it in Flint.
      const picked=await page.locator('.folio-frame').filter({hasText:'This Python module uses'}).evaluate(frame=>{
        const text=frame.textContent, needle='matplotlib', at=text.indexOf(needle);
        const walker=document.createTreeWalker(frame,NodeFilter.SHOW_TEXT);
        let count=0,node;while((node=walker.nextNode())){
          if(count+node.length>=at+needle.length) break;
          count+=node.length;
        }
        const range=document.createRange();range.setStart(node,at-count);range.setEnd(node,at-count+needle.length);
        const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
        frame.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
        return {id:frame.dataset.frame, key:frame.dataset.content, at, needle};
      });
      await page.getByText('Trace to source',{exact:true}).click();
      const trace=await page.locator('.folio-notice').innerText();
      assert.match(trace,/p\. 1 · item 10/);
      await page.getByText('Select in Flint',{exact:true}).click();
      const target=page.locator('.folio-flint [data-block-id="'+picked.id+'"] .reactive-standoff-flow');
      await target.waitFor({state:'attached'});
      await page.waitForFunction(({id,at,needle})=>{
        const flow=document.querySelector('.folio-flint [data-block-id="'+id+'"] .reactive-standoff-flow');
        const key=flow&&folio.editor.mounts.resolveElement(flow)?.nodeKey;
        const sel=key&&folio.editor.mounts.get(key)?.captureInlineSelection();
        return sel?.anchor===at&&sel?.head===at+needle.length;
      },picked,{timeout:12000});
      await target.evaluate(flow=>{
        const e=folio.editor, key=e.mounts.resolveElement(flow).nodeKey;
        if(!e.gloss.open(key)) throw Error('Native Gloss could not capture the selection');
      });
      await page.getByRole('textbox',{name:'Gloss',exact:true}).fill('method: Plotting library used in the source publication');
      await page.getByRole('textbox',{name:'Gloss',exact:true}).press('Enter');
      await page.waitForFunction(()=>document.querySelector('.folio-frame [data-gloss]'));
      assert.equal(await target.locator('.mutable-gloss-anchor').allTextContents().then(vals=>vals.join('')),picked.needle);
      assert.equal(await page.locator('.folio-frame [data-gloss]').innerText(),picked.needle);
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(here,'evidence','shared-gloss-flint.png')});
      await page.getByRole('button',{name:'Folio',exact:true}).click();
      await page.locator('.folio-stage article').screenshot({path:path.join(here,'evidence','shared-gloss-folio.png')});
      await page.getByRole('button',{name:'Compare',exact:true}).click();
      const measure=await target.evaluate(flow=>{
        const {editor,metrics}=folio, key=editor.mounts.resolveElement(flow).nodeKey;
        const mount=editor.mounts.get(key);mount.focus();mount.restoreInlineSelection({anchor:0,head:0});
        metrics.frameReads.clear();let snapshots=0,builds=0;
        const snap=editor.repository.snapshot;
        editor.repository.snapshot=function(...a){snapshots++;return snap.apply(this,a);};
        for(const v of editor.projections.values()){
          const build=v.build;v.build=function(...a){builds++;return build.apply(this,a);};
        }
        folio.counts=()=>({snapshots,builds});
        return mount.captureText();
      });
      const io=[];
      const onRequest=req=>{if(req.url().includes('/api/')) io.push(req.url());};
      page.on('request',onRequest);
      await page.keyboard.insertText('X');
      await page.waitForFunction(id=>document.querySelector('[data-frame="'+id+'"]').textContent.startsWith('XThis'),picked.id);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const work=await page.evaluate(()=>({frames:[...folio.metrics.frameReads],...folio.counts(),dirty:folio.native.isDirty(folio.id)}));
      page.off('request',onRequest);
      assert.deepEqual(work.frames.map(([key])=>key),[picked.key]);
      assert.equal(work.snapshots,0);assert.equal(work.builds,0);assert.deepEqual(io,[]);assert.equal(work.dirty,true);
      await page.evaluate(()=>folio.editor.repository.undo());
      assert.equal(await target.textContent(),measure);
      await page.evaluate(()=>folio.editor.repository.redo());
      assert.equal(await target.textContent(),'X'+measure);
      await page.evaluate(()=>folio.editor.repository.undo());
      const save=page.getByRole('button',{name:'Save Document',exact:true}).first();
      await save.click();
      await page.waitForFunction(()=>!folio.native.isDirty(folio.id));
      assert.ok(!(await readdir(vault)).some(file=>file.endsWith('.md')),'Manual Save produced a Markdown sidecar');
      const saved=await readFile(path.join(vault,'corner.ink'),'utf8');
      const wire=JSON.parse(saved);
      const linked=wire.document.blocks.find(b=>b.id===picked.id).properties.standoffProperties.find(p=>p.type==='mutable/gloss');
      assert.ok(linked.annotationId);assert.equal(linked.start,picked.at);
      const owner=wire.document.blocks.find(b=>b.id===wire.resourceId);
      assert.match(owner.properties.linkedAnnotations[linked.annotationId].value,/Plotting library/);
      await writeFile(path.join(here,'evidence','corner-annotated.ink'),saved);
      Object.assign(result,{trace,selection:picked.needle,sharedGloss:linked.annotationId,
        typing:{affectedFrames:work.frames.length,evaluations:work.frames[0][1],snapshots:work.snapshots,projectionBuilds:work.builds,apiRequests:io.length},
        manualSaveVerified:true,undoRedoVerified:true});
    }else{
      if(paper.id==='bert'){
        await page.getByLabel('Source page').selectOption('3');
        await page.locator('.folio-stage article').screenshot({path:path.join(here,'evidence','bert-p3-folio.png')});
      }
      const t=performance.now();
      await page.getByRole('button',{name:'Flint',exact:true}).click();
      await page.locator('.folio-flint .reactive-standoff-flow').first().waitFor({state:'attached'});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      result.flintSwitchMs=Math.round(performance.now()-t);
      const heading=await page.locator('.folio-flint .reactive-standoff-flow').first().textContent();
      assert.ok(heading.includes(paper.id==='bert'?'BERT':'authorship'));
    }
    results.push({paper:paper.id,...result});console.log(results.at(-1));
    await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(here,'evidence','browser.json'),JSON.stringify({chrome:browser.version(),results,errors},null,2)+'\n');
} finally {await browser.close();await vite.close();await rm(vault,{recursive:true,force:true});}
