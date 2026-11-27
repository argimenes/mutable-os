import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import express from 'express';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {createCavernLifecycle} from '../../../dist/server/cavern-lifecycle.js';

const temp=await mkdtemp(path.join(tmpdir(),'folio-desktop-'));
const vault=path.join(temp,'Library');
await mkdir(path.join(vault,'documents'),{recursive:true});
const preferences=path.join(temp,'caverns.json');
const cavern=createCavernLifecycle({stateFile:preferences}),api=express();
api.use(express.json({limit:'32mb'}));
api.use('/api/cavern',cavern.router);
api.use('/api',cavern.middleware);
const vite=await createServer({cacheDir:path.join(temp,'vite'),plugins:[{name:'fixture-vault',configureServer(s){s.middlewares.use(api);}}],
  server:{host:'127.0.0.1',port:0,hmr:false},optimizeDeps:{entries:['folio/index.html']}});
let browser;
try{
 await vite.listen();const origin='http://127.0.0.1:'+vite.httpServer.address().port;
 const establish=async folder=>{const r=await fetch(origin+'/api/cavern/establish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:folder,intent:'create',confirmed:true})});const value=await r.json();assert.ok(value.Success,value.Error);return value.Data.current;};
 const selected=await establish(vault);
 browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();page.setDefaultTimeout(120000);
 page.on('pageerror',console.error);page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
 await page.goto(origin+'/folio/',{waitUntil:'commit'});
 await page.getByText('Open a PDF or choose a saved publication in Library/documents.').waitFor();
 await page.getByLabel('Choose local PDF').setInputFiles(new URL('../sources/corner.pdf',import.meta.url).pathname);
 await page.getByRole('heading',{name:'corner',exact:true}).waitFor();
 assert.deepEqual(await readdir(path.join(vault,'documents')),[]);
 await page.getByRole('button',{name:'Save *',exact:true}).click();
 await page.waitForURL('**/folio/?file=corner.ink');
 const file=path.join(vault,'documents','corner.ink'),doc=JSON.parse(await readFile(file));
 assert.equal(doc.document.blocks[0].properties.metadata.folio.original.cavernId,selected.cavernGuid);
 await page.reload({waitUntil:'commit'});
 await page.getByRole('button',{name:'Reveal left leaf'}).click();await page.locator('.folio-pdf canvas').waitFor();
 const hits=await page.evaluate(async()=>{const r=await fetch('/api/native/vault/browse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault:'.',mode:'reconcile'})});return (await r.json()).Data.documents;});
 assert.ok(hits.some(row=>row.title==='corner'&&row.location.folder==='documents'&&row.resourceId===doc.resourceId));
 const other=path.join(temp,'Second');await establish(other);
 const stale=await page.evaluate(async()=> (await fetch('/api/folio/entity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'create',id:crypto.randomUUID(),name:'Stale'})})).status);
 assert.equal(stale,409);
 await page.goto(origin+'/folio/',{waitUntil:'commit'});await page.getByText('Open a PDF or choose a saved publication in Second.').waitFor();
 await page.getByLabel('Choose local PDF').setInputFiles(new URL('../sources/corner.pdf',import.meta.url).pathname);
 await page.getByRole('button',{name:'Save *',exact:true}).click();await page.waitForURL('**/folio/?file=corner.ink');
 assert.ok((await readdir(other)).includes('corner.ink'));
 console.log('Desktop Folio passed manual Save, Flint discovery, PDF reopen, vault switch fencing and vault-root fallback.');
}finally{
 await browser?.close();
 vite.httpServer?.closeAllConnections();
 await vite.close();
 await cavern.close();
 await rm(temp,{recursive:true,force:true});
}
// The compiled filesystem helper keeps a process-wide worker alive after the fixture closes.
process.exit(0);
