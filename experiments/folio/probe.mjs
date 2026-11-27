// Two concrete gaps found on the corpus: missing layout blocks in CLI JSON
// and graphics that did not yield an embedded image in LiteParse.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PDFDocument from 'pdfkit';
import { buffer } from 'node:stream/consumers';
import { LiteParse } from '@llamaindex/liteparse';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
await mkdir('work/probe',{recursive:true});
execFileSync('node_modules/.bin/lit',['parse','sources/bert.pdf','--target-pages','1','--format','json',
  '--no-ocr','--extract-blocks','--extract-text-metadata','--extract-images','--image-output-dir','work/probe',
  '-o','work/probe/cli.json','--quiet']);
const raw=JSON.parse(await readFile('work/probe/cli.json','utf8'));
const parser=new LiteParse({ocrEnabled:false,outputFormat:'json',targetPages:'1',extractBlocks:true,extractTextMetadata:true,preserveVerySmallText:true,keepHeadersFooters:true,quiet:true});
const api=(await parser.parse('sources/bert.pdf')).pages[0];
parser.close();
const [diagram]=await new LiteParse({dpi:96,quiet:true}).screenshot('sources/bert.pdf',[3]);
await writeFile('evidence/bert-p3-source.png',diagram.imageBuffer);
// A positive control separates genuinely untagged papers from a broken switch.
const control=new PDFDocument({tagged:true,lang:'en',pdfVersion:'1.7'});
const controlBytes=buffer(control);
control.addStructure(control.struct('H1',{},()=>control.fontSize(18).text('Control heading')));
control.addStructure(control.struct('P',{},()=>control.fontSize(12).text('Control paragraph')));
control.end();
const taggedParser=new LiteParse({ocrEnabled:false,extractStructureTree:true,extractTextMetadata:true,quiet:true});
const tagged=(await taggedParser.parse(await controlBytes)).pages[0];
taggedParser.close();
const pdf=await getDocument({data:new Uint8Array(await readFile('sources/bert.pdf')),useSystemFonts:false,isEvalSupported:false}).promise;
try{
  const page=await pdf.getPage(3);
  const ops=await page.getOperatorList();
  const counts={};
  for(const op of ['constructPath','paintImageXObject','paintInlineImageXObject','showText'])
    counts[op]=ops.fnArray.filter(x=>x===OPS[op]).length;
  const facts={taggedControl:{tree:tagged.structureTree,items:tagged.textItems.map(({text,mcid})=>({text,mcid}))},cliPageKeys:Object.keys(raw.pages[0]),apiJsonBlockCount:api.blocks?.length,
    firstTable:api.blocks.find(b=>b.kind==='table'),pdfjs:{version:'5.4.624',page:3,operatorCounts:counts,
    textItems:(await page.getTextContent()).items.length}};
  await writeFile('evidence/parser-probes.json',JSON.stringify(facts,null,2)+'\n');
  console.log(facts.cliPageKeys,facts.apiJsonBlockCount,counts);
}finally{await pdf.destroy();}
