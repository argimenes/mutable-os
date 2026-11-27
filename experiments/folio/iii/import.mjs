// Run from repository root. Source/derivative bytes are admitted by the ordinary managed store on first launch.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import sharp from 'sharp';
import {LiteParse} from '@llamaindex/liteparse';
import {publicationParser,extractPublication,publicationDocument,encodePublication} from '../../../server/folio-publication.mjs';
import {corpus} from '../corpus.mjs';
export const here=fileURLToPath(new URL('.',import.meta.url)),base=path.resolve(here,'..'),work=path.join(base,'work/iii-input');
export const cavernId='folio-reading';
const unseen=[
 ['potnia','Potnia: A Python library for the conversion of transliterated ancient texts to Unicode','https://www.theoj.org/joss-papers/joss.07725/10.21105.joss.07725.pdf','0e1228444002c1a2d5f6bfb48c843a076878148a0daebbcf30e702211156be2b'],
 ['teiphy','teiphy: A Python Package for Converting TEI XML Collations to NEXUS and Other Formats','https://www.theoj.org/joss-papers/joss.04879/10.21105.joss.04879.pdf','6509e60a547a86f2098af7be88005ec8164001901b27cb189be5c6b0fc46957c'],
 ['corpora','corporaexplorer: An R package for dynamic exploration of text collections','https://www.theoj.org/joss-papers/joss.01342/10.21105.joss.01342.pdf','efdaff46682585f78d7026eaa7bf6ceb27cfd5e07adb0b7a027f31679a0c2d50'],
 ['chronicle','Identifying Copied Fragments in a 18th Century Dutch Chronicle','https://aclanthology.org/2022.lrec-1.631.pdf','df342ca95fb04a484bdad2dee784b842f0faecbbb3319f63c2aef247518d34cf'],
 ['newspapers','A Language Modelling Approach to Quality Assessment of OCR’ed Historical Text','https://aclanthology.org/2022.lrec-1.630.pdf','18c199992c0706a1959290496f41ccf6b0098a2beac47cf85a85fd61413df97e']
].map(([id,title,url,sha256])=>({id,title,url,sha256,unseen:true}));
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function importAll(){
  await Promise.all([work,path.join(here,'generated'),path.join(here,'evidence')].map(d=>mkdir(d,{recursive:true})));
  const native=path.join(work,'native.mjs');
  await build({stdin:{contents:"export {decodeBlockTree} from './src/block-tree/codecs';export {nativeEnvelope,decodeNative,captureNative} from './src/persistence/native-resource';",resolveDir:path.resolve(base,'../..')},outfile:native,bundle:true,format:'esm',platform:'node'});
  const {decodeBlockTree,nativeEnvelope,decodeNative,captureNative}=await import(native);
  const assets=new Map(),results=[],parser=publicationParser();
  async function asset(file,type){const bytes=await readFile(file),digest=hash(bytes);assets.set(digest,{file:path.relative(base,file),type});return {kind:'managed',cavernId,assetId:'sha256:'+digest};}
  async function image(bytes){const png=await sharp(bytes).png().toBuffer(),file=path.join(work,hash(png)+'.png');await writeFile(file,png);return asset(file,'image/png');}
  for(const paper of [...corpus,...unseen]){
    const source=path.join(paper.unseen?work:path.join(base,'sources'),paper.id+'.pdf');
    try{await readFile(source);}catch{execFileSync('curl',['-fLsS','--retry','2',paper.url,'-o',source]);}
    const original=await asset(source,'application/pdf');if(original.assetId!=='sha256:'+paper.sha256)throw Error('Source changed '+paper.id);
    let children,pages,metrics={};const id='folio-'+paper.sha256.slice(0,20)+'-ii';
    if(paper.unseen){
      ({children,pages,metrics}=await extractPublication(parser,source,paper,image));
    }else{
      const w=JSON.parse(await readFile(path.join(base,'ii/generated/'+paper.id+'.ink'))).document.blocks;
      pages=w[0].properties.metadata.folio.pages;children=[];
      for(const b of w.slice(1)){
        const block={...b.properties,id:b.id,type:b.type,...(b.inline?{inlineAtoms:b.inline}:{})};
        if(b.type==='image-block'){
          if(block.asset){const dpi=Number(process.env.FOLIO_FIGURE_DPI??192);if(!Number.isFinite(dpi)||dpi<72||dpi>384)throw Error('Figure DPI must be 72–384');
            const renderer=new LiteParse({dpi,quiet:true});const t=performance.now();let shot;
            try{[shot]=await renderer.screenshot(source,[3]);}finally{renderer.close();}
            const scale=dpi/72,bytes=await sharp(shot.imageBuffer).extract({left:Math.round(72*scale),top:Math.round(60*scale),width:Math.round(456*scale),height:Math.round(186*scale)}).png().toBuffer();
            block.asset=await image(bytes);metrics.reviewedFigure={dpi,bytes:bytes.length,renderAndStoreMs:performance.now()-t};
          }else block.asset=await image(await readFile(path.resolve(base,'../..','.'+block.metadata.url)));
          delete block.metadata.url;
        }children.push(block);
      }
    }
    const dto=publicationDocument(id,paper,original,pages,children);
    const wire=encodePublication(dto,{decodeBlockTree,nativeEnvelope,captureNative,decodeNative});
    await writeFile(path.join(here,'generated',paper.id+'.ink'),wire+'\n');results.push({id:paper.id,url:paper.url,pages:pages.length,bytes:Buffer.byteLength(wire)+1,...metrics});
  }
  parser.close();await writeFile(path.join(work,'assets.json'),JSON.stringify(Object.fromEntries(assets)));
  await writeFile(path.join(here,'evidence/import.json'),JSON.stringify(results,null,2)+'\n');return results;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.table(await importAll());
