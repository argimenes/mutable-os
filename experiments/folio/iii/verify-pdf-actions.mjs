import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {serve} from './serve.mjs';

const vault=await mkdtemp(path.join(tmpdir(),'folio-pdf-actions-'));
const server=await serve({port:0,vault,seed:false});
const browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'});
try{
  const page=await browser.newPage();
  page.on('pageerror',console.error);
  page.on('dialog',d=>d.accept(d.type()==='prompt'?d.defaultValue():undefined));
  const files=async()=>(await readdir(vault)).filter(n=>n.endsWith('.ink'));
  await page.goto(server.url,{waitUntil:'commit'});
  const picker=page.getByLabel('Choose local PDF');
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Open PDF',exact:true}).click({timeout:120000});
  await (await chooser).setFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});
  await page.getByText('The selected file is not a PDF.').waitFor();
  const source=fileURLToPath(new URL('../sources/corner.pdf',import.meta.url));
  await picker.setInputFiles(source);
  async function ready(title){
    await page.waitForFunction(expected=>document.querySelector('.folio-top h1')?.textContent===expected||document.querySelector('.folio-pdf-actions output')?.textContent?.match(/^(?!Opening PDF).+/),title,{timeout:120000});
    assert.equal(await page.locator('.folio-pdf-actions output').allTextContents()+'','');
    assert.equal(await page.locator('.folio-top h1').innerText(),title);
    assert.ok(await page.locator('.folio-sheet').innerText());
  }
  await ready('corner');
  assert.deepEqual(await files(),[]);
  await page.getByRole('button',{name:'Reveal left leaf'}).click();
  await page.waitForFunction(()=>document.querySelector('.folio-pdf canvas'));
  await page.getByRole('button',{name:'Save *',exact:true}).click();
  await page.waitForURL('**/?file=corner.ink');
  const saved=JSON.parse(await readFile(path.join(vault,'corner.ink')));
  assert.equal(saved.document.blocks[0].properties.metadata.folio.pages.length,2);
  await page.reload({waitUntil:'commit'});await ready('corner');
  await page.getByRole('button',{name:'Import PDF from URL'}).click();
  await page.getByLabel('PDF URL').fill('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf');
  await page.getByRole('button',{name:'Import PDF',exact:true}).click();
  await ready('dummy');assert.deepEqual(await files(),['corner.ink']);
  assert.match(await page.locator('.folio-sheet').innerText(),/Dummy PDF file/i);
  await page.keyboard.press(process.platform==='darwin'?'Meta+s':'Control+s');await page.waitForURL('**/?file=dummy.ink');
  const remote=JSON.parse(await readFile(path.join(vault,'dummy.ink')));
  assert.match(remote.document.blocks[0].properties.metadata.folio.source.url,/w3\.org/);
  console.log('Local and URL PDFs opened in Chrome, manual Save and reopen passed.');
}finally{await browser.close();await server.close();await rm(vault,{recursive:true,force:true});}
