import {chromium} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
const here=fileURLToPath(new URL('.',import.meta.url)),evidence=path.join(here,'evidence');
const url=process.env.FOLIO_TEST_URL??'http://127.0.0.1:4176/experiments/folio/iii/';
const browser=await chromium.launch(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{channel:'chrome'});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),data=[];
try{for(const [id,number] of [['potnia',2],['teiphy',3],['corpora',2],['chronicle',4],['newspapers',2]]){
 const {blocks}=JSON.parse(await readFile(path.join(here,'generated',id+'.ink'))).document;
 const info=blocks[0].properties.metadata.folio.pages;
 await page.goto(url+'?file='+id+'.ink',{waitUntil:'commit'});await page.waitForFunction(()=>window.folioIII?.metrics.openMs,undefined,{timeout:90000});
 await page.getByRole('button',{name:'References',exact:true}).click();
 await page.getByRole('button',{name:'Reveal left leaf'}).click();
 await page.getByLabel('Mutable Folio page').selectOption(String(number));await page.getByLabel('Original PDF page').selectOption(String(number));
 await page.waitForFunction(()=>document.querySelector('.textLayer span')&&!document.querySelector('.folio-pdf')?.parentElement.querySelector('output'));
 await page.waitForFunction(()=>[...document.querySelectorAll('.folio-sheet img')].every(img=>img.complete&&img.naturalWidth>0));
 const details=await page.evaluate(()=>{const frames=[...document.querySelectorAll('.composed-frame')];return {frames:frames.length,
   horizontalOverflow:frames.filter(e=>e.scrollWidth>e.clientWidth+2).length,text:frames.slice(0,4).map(e=>e.innerText.slice(0,110)),
   sourceSample:document.querySelector('.textLayer').textContent.slice(0,160),sheetHeight:Math.round(document.querySelector('.folio-sheet').getBoundingClientRect().height)};});
 const pic=await page.screenshot();await sharp(pic).resize(1050).jpeg({quality:76}).toFile(path.join(evidence,id+'-comparison.jpg'));
 data.push({id,samplePage:number,sourceHeight:info[number-1].height, ...details});}
 await writeFile(path.join(evidence,'sample-pages.json'),JSON.stringify(data,null,2)+'\n');
}finally{await browser.close();}
