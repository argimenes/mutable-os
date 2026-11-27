import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { LiteParse } from '@llamaindex/liteparse';
import { corpus } from './corpus.mjs';
import { reconstruct } from './reconstruct.mjs';

process.chdir(fileURLToPath(new URL('.',import.meta.url)));
await Promise.all(['generated','evidence','work','sources'].map(dir => mkdir(dir,{recursive:true})));
const digest = b => createHash('sha256').update(b).digest('hex');
const json = data => JSON.stringify(data,null,2)+'\n';
// Bundle the repository's actual native writer and validator for this offline Node process.
await build({stdin:{contents:`export {decodeBlockTree} from './src/block-tree/codecs';
  export {nativeEnvelope,decodeNative,captureNative} from './src/persistence/native-resource';`,resolveDir:fileURLToPath(new URL('../../',import.meta.url))},
  outfile:'work/native.mjs',bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {decodeBlockTree,nativeEnvelope,decodeNative,captureNative} = await import('./work/native.mjs');
const parser = new LiteParse({ocrEnabled:false, extractImages:true,extractBlocks:true,
  extractVectorGraphics:true,extractTextMetadata:true,extractStructureTree:true,preserveVerySmallText:true,
  keepHeadersFooters:true,outputFormat:'markdown',dpi:96,quiet:true});
const results=[];
for(const paper of corpus) {
  const sourcePath='sources/'+paper.id+'.pdf';
  let bytes;
  try { bytes=await readFile(sourcePath); } catch(error) {
    if(error.code!=='ENOENT') throw error;
    const response=await fetch(paper.url);
    if(!response.ok) throw Error(response.status+' '+paper.url);
    bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(digest(bytes),paper.sha256);
    await writeFile(sourcePath,bytes);
  }
  assert.equal(digest(bytes),paper.sha256,'Source PDF version changed');
  const start=performance.now();
  const result=await parser.parse(bytes);
  const parsed=performance.now();
  assert.equal(result.pageErrors.length,0);
  const imageUrls=new Map();
  for(const image of result.images){
    const name=digest(image.bytes)+'.'+image.format;
    await mkdir('generated/images',{recursive:true});
    await writeFile('generated/images/'+name,image.bytes);
    imageUrls.set(image.name,'/experiments/folio/generated/images/'+name);
  }
  const {doc,evidence,counts}=reconstruct(paper,result,imageUrls);
  // Prove source item coverage and the unit conversion at the actual output boundary.
  for(const [p,page] of evidence.pages.entries()){
    const expected=page.items.flatMap((v,i)=>v.text.trim()?[i]:[]);
    const mapped=page.bindings.flatMap(b=>b.mappings.map(m=>m.item)).sort((a,b)=>a-b);
    assert.deepEqual(mapped,expected);
    const byId=new Map(doc.children[p].children.map(b=>[b.id,b]));
    for(const binding of page.bindings){
      const block=byId.get(binding.blockId), points=[...block.inlineAtoms[0].text];
      const covered=Array(points.length).fill(0);
      for(const gap of binding.joins){assert.equal(points[gap],' ');covered[gap]++;}
      for(const m of binding.mappings){
        assert.equal(points.slice(m.start,m.end).join(''),m.normalized??page.items[m.item].text);
        for(let i=m.start;i<m.end;i++) covered[i]++;
        const anchor=block.standoffProperties.find(s=>s.type==='spatial/source-run'&&s.value==='p'+page.number+'-i'+m.item);
        assert.ok(anchor&&anchor.start===m.start&&anchor.end===m.end-1);
      }
      assert.ok(covered.every(n=>n===1),'Every logical point must have exactly one source or synthetic origin');
    }
  }
  const evidenceJson=JSON.stringify(evidence);
  const compressed=gzipSync(evidenceJson,{level:9});
  doc.metadata.folio.evidenceSha256=digest(evidenceJson);
  await writeFile('generated/'+doc.metadata.folio.evidence,compressed);
  const {state}=decodeBlockTree(doc);
  for(const placement of Object.values(state.placements)){
    placement.placementId='folio-placement-'+state.contents[placement.contentKey].payload.id;
  }
  const wire=nativeEnvelope(captureNative(state,doc.id));
  const native=JSON.stringify(wire);
  const resource=decodeNative(new TextEncoder().encode(native),undefined,true);
  assert.deepEqual(nativeEnvelope(resource),wire);
  await writeFile('generated/'+paper.id+'.ink',native+'\n');
  const finished=performance.now();
  const [shot]=await parser.screenshot(bytes,[paper.samplePage]);
  await writeFile('evidence/'+paper.id+'-source.png',shot.imageBuffer);
  const example=evidence.pages[0].bindings.find(b=>b.mappings.length>2);
  const page=evidence.pages[0];
  await writeFile('evidence/'+paper.id+'-sample.json',json({pdfSha256:paper.sha256,page:page.number,
    classified:page.blocks[example.group],items:example.mappings.map(m=>({index:m.item,...page.items[m.item]})),binding:example,
    native:wire.document.blocks.find(b=>b.id===example.blockId)}));
  results.push({paper:paper.id,...counts,imageErrors:result.imageErrorCount,nativeBytes:Buffer.byteLength(native)+1,
    evidenceBytes:compressed.length,parseMs:Math.round(parsed-start),conversionValidationAndWriteMs:Math.round(finished-parsed)});
}
parser.close();
await writeFile('evidence/import.json',json({node:process.version,platform:process.platform,arch:process.arch,results}));
console.table(results);
