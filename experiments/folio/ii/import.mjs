// Second edition consumes the complete, immutable first-pass capture. It never needs that capture at edit time.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {LiteParse} from '@llamaindex/liteparse';
import {build} from 'esbuild';
import {corpus} from '../corpus.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)), base=path.resolve(here,'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export const cavernId='folio-ii-study';
export const ref=sha=>({kind:'managed',cavernId,assetId:'sha256:'+sha});
const out=path.join(here,'generated');
const nativeModule=path.join(base,'work/native-ii.mjs');
const points=s=>Array.from(s).length;
async function run(){
  await mkdir(out,{recursive:true});await mkdir(path.dirname(nativeModule),{recursive:true});
  await build({stdin:{contents:`export {decodeBlockTree} from './src/block-tree/codecs';
    export {nativeEnvelope,decodeNative,captureNative} from './src/persistence/native-resource';`,resolveDir:path.resolve(base,'../..')},
    outfile:nativeModule,bundle:true,platform:'node',format:'esm'});
  const {decodeBlockTree,nativeEnvelope,decodeNative,captureNative}=await import(nativeModule);
  async function save(name,doc){
    const {state}=decodeBlockTree(doc);
    for(const p of Object.values(state.placements))p.placementId='placement-'+state.contents[p.contentKey].payload.id;
    const wire=nativeEnvelope(captureNative(state,doc.id)), json=JSON.stringify(wire);
    assert.deepEqual(nativeEnvelope(decodeNative(new TextEncoder().encode(json),undefined,true)),wire);
    await writeFile(path.join(out,name+'.ink'),json+'\n');
  }
  const results=[];
  for(const paper of corpus){
    const old=JSON.parse(await readFile(path.join(base,'generated',paper.id+'.ink'))).document.blocks;
    const byId=new Map(old.map(b=>[b.id,b]));
    const evidenceBytes=gunzipSync(await readFile(path.join(base,'generated',paper.id+'.source.json.gz')));
    assert.equal(hash(evidenceBytes),old[0].properties.metadata.folio.evidenceSha256);
    assert.equal(hash(await readFile(path.join(base,'sources',paper.id+'.pdf'))),paper.sha256);
    const evidence=JSON.parse(evidenceBytes), pages=[], diagnostics=[];
    const id=old[0].id+'-ii', provenance=old[0].properties.metadata.folio;
    const doc={id,type:'document-block',metadata:{name:paper.title,folio:{...provenance,evidence:'../../generated/'+provenance.evidence,version:2,original:ref(paper.sha256),pages}},children:[]};
    let continuation, previous;
    for(const page of evidence.pages){
      const original=byId.get(old[0].id+'-p'+page.number);
      const layout={...original.properties.metadata.folio,frames:[]};pages.push(layout);
      const bindings=new Map(page.bindings.map(b=>[b.blockId,b]));
      for(const child of original.children){
        const block=byId.get(child.target.blockId), meta=block.properties.metadata, frame={...meta.folio};
        const isBert=paper.id==='bert', suffix=block.id.slice(old[0].id.length+1);
        let key=block.id+'-ii';
        if(block.type==='image-block'){
          doc.children.push({id:key,type:block.type,metadata:{...meta,folio:undefined},blockProperties:block.properties.blockProperties});
          layout.frames.push({...frame,id:key});continue;
        }
        const binding=bindings.get(block.id), lines=binding.lines;
        if(isBert && ['p3-b0-0','p3-b0-1','p3-b1-0'].includes(suffix)){
          if(suffix==='p3-b0-0'){
            // Render the reviewed page from the hash-checked original; PDFium uses 96 pixels per inch.
            const box={x:72,y:60,width:456,height:186};
            const renderer=new LiteParse({dpi:96,quiet:true});
            let screenshot;try{[screenshot]=await renderer.screenshot(path.join(base,'sources/bert.pdf'),[3]);}finally{renderer.close();}
            const png=await sharp(screenshot.imageBuffer).extract({
              left:96,top:80,width:608,height:248}).png().toBuffer();
            await writeFile(path.join(out,'bert-figure-1.png'),png);
            const figure={id:id+'-figure-1',type:'image-block',asset:ref(hash(png)),metadata:{alt:'BERT pre-training and fine-tuning architectures',captionId:old[0].id+'-p3-b2-0-ii',labels:[]},blockProperties:[{type:'block/size',metadata:{width:'608px'}}]};
            doc.children.push(figure);layout.frames.push({id:figure.id,kind:'figure',frame:box});
          }
          doc.children.at(-1).metadata.labels.push(block.inline[0].text);continue;
        }
        if(frame.kind==='table'){
          diagnostics.push({sourceBlock:block.id,page:page.number,reason:'Parser table retained as reading text; grid unverified.'});frame.kind='text';
        }
        if((frame.kind==='caption'&&!(isBert&&suffix==='p3-b2-0'))||frame.frame.y>page.height*.88)
          diagnostics.push({sourceBlock:block.id,page:page.number,reason:'Caption or margin text retained independently; association unverified.'});
        const splitAt=isBert && suffix==='p1-b15-0'?lines.findIndex(l=>page.items[l[0]].text.startsWith('In this paper')) :
          -1;
        const groups=splitAt>0?[lines.slice(0,splitAt),lines.slice(splitAt)]:[lines];
        for(const [groupIndex,rows] of groups.entries()){
          let text='', offset=0;const styles=[], mappings=new Map(binding.mappings.map(m=>[m.item,m]));
          const append=s=>{text+=s;offset+=points(s);};
          let prior;
          for(const itemIndex of rows.flat()){
            const item=page.items[itemIndex],m=mappings.get(itemIndex);if(!m)continue;
            if(prior && m.start>prior.end)append(' ');
            let value=m.normalized??item.text;
            if(item.text.trimEnd().endsWith('-')&&!value.endsWith('-')){
              value+='-';diagnostics.push({sourceBlock:block.id,page:page.number,item:itemIndex,reason:'Retained ambiguous line-end hyphen.'});
            }
            const start=offset;append(value);
            for(const [test,type] of [[/bold|demibold/i,'style/bold'],[/italic|oblique/i,'style/italics']]){
              const captionPrefix=frame.kind==='caption'&&value.match(/^(?:Figure|Fig\.|Table)\s+\d+[:.]/);
              const headingWeight=frame.kind==='heading'&&type==='style/bold'&&item.fontWeight>=650;
              if(test.test(item.fontName)||headingWeight){
                const end=captionPrefix?start+points(captionPrefix[0])-1:offset-1;
                styles.push({id:key+'-'+type+'-'+itemIndex,type,start,end});
                if(end<offset-1)diagnostics.push({sourceBlock:block.id,page:page.number,reason:'Leading caption font applied only to its printed label.'});
              }
            }
            prior=m;
          }
          const first=page.items[rows[0][0]],last=page.items[rows.at(-1)[0]];
          const composed={...frame,frame:{...frame.frame,y:first.y,height:Math.max(first.height,last.y-first.y+last.height)},lineCount:rows.length};
          let logical={id:key+(groupIndex?'-part'+groupIndex:''),type:'standoff-editor-block',inlineAtoms:[{kind:'text',text}],standoffProperties:styles};
          let start=0;
          // Two manually reviewed joins on the pinned BERT revision. Other boundaries remain provisional.
          const join=isBert && suffix==='p1-b15-0' && groupIndex===0 ? previous :
            isBert && suffix==='p2-b0-0' && groupIndex===0 ? continuation : undefined;
          if(join){
            const atom=join.inlineAtoms[0];
            const reviewedWord=atom.text.endsWith('espe-')&&text.startsWith('cially');
            if(reviewedWord)atom.text=atom.text.slice(0,-1);
            const separator=reviewedWord||atom.text.endsWith('-')?'':' ';
            atom.text+=separator;start=points(atom.text);atom.text+=text;
            join.standoffProperties.push(...styles.map(p=>({...p,start:p.start+start,end:p.end+start})));logical=join;
            const priorFrame=pages.flatMap(p=>p.frames).findLast(f=>f.id===join.id);
            priorFrame.end=start;
          } else doc.children.push(logical);
          layout.frames.push({...composed,id:logical.id,start});
          if(isBert&&suffix==='p1-b14-0')previous=logical;
          if(isBert&&suffix==='p1-b15-0'&&groupIndex===1)continuation=logical;
        }
      }
    }
    if(paper.id==='bert'){
      assert.ok(continuation.inlineAtoms[0].text.includes('masked word based only'));
      assert.equal(pages.flatMap(p=>p.frames).filter(f=>f.id===continuation.id).length,2);
    }
    doc.metadata.folio.diagnostics=paper.id+'.diagnostics.json';
    await writeFile(path.join(out,doc.metadata.folio.diagnostics),JSON.stringify(diagnostics)+'\n');
    const textBlocks=doc.children.filter(b=>b.type==='standoff-editor-block');
    const allText=textBlocks.map(b=>b.inlineAtoms[0].text).join(' ');
    const rangesById=new Map();
    for(const page of pages)for(const f of page.frames){
      const frames=rangesById.get(f.id)??[];frames.push(f);rangesById.set(f.id,frames);
    }
    for(const b of textBlocks){
      const frames=rangesById.get(b.id),length=points(b.inlineAtoms[0].text);
      assert.ok(frames?.length);let end=0;
      for(const frame of frames){assert.equal(frame.start,end);end=frame.end??length;assert.ok(end>=frame.start&&end<=length);}
      assert.equal(end,length);
      for(const p of b.standoffProperties){assert.notEqual(p.type,'spatial/source-run');assert.ok(p.start>=0&&p.end<length&&p.end>=p.start);}
    }
    const expectedWords={style:['single-domain'],bert:['pre-train','fine-tuned','task-specific','especially'],corner:[]}[paper.id];
    for(const word of expectedWords)assert.ok(allText.includes(word),word);
    if(paper.id==='corner'){
      const caption=textBlocks.find(b=>b.inlineAtoms[0].text.startsWith('Figure 1:'));
      assert.equal(caption.standoffProperties.find(p=>p.type==='style/bold').end,8);
    }
    if(paper.id==='bert'){
      const ids=textBlocks.map(b=>b.id);
      assert.ok(ids.indexOf(continuation.id)>ids.findIndex(k=>k.includes('p1-b6-0')));
      assert.ok(ids.indexOf(continuation.id)<ids.findIndex(k=>k.includes('p2-b1-0')));
      assert.ok(!allText.includes('NSP Mask LM'));
    }
    results.push({paper:paper.id,pages:pages.length,logicalTextBlocks:textBlocks.length,
      multiFrameBlocks:[...rangesById.values()].filter(frames=>frames.length>1).length,
      images:doc.children.length-textBlocks.length,liveSourceRuns:0,checkedWords:expectedWords,
      diagnostics:diagnostics.reduce((counts,d)=>({...counts,[d.reason]:(counts[d.reason]??0)+1}),{})});
    await save(paper.id,doc);
    const spread={id:id+'-spread',type:'spread-block',metadata:{spread:{ratio:.5,collapsed:{left:true},bindings:[]}},
      children:[{id:id+'-source',type:'folio/pdf-leaf',metadata:{original:ref(paper.sha256),pagination:paper.sha256,pages:pages.length}},
        {id:id+'-reading',type:'folio/composition-leaf',metadata:{publicationId:id,pagination:paper.sha256,pages:pages.length}}]};
    await save(paper.id+'-spread',{id:id+'-layout',type:'document-block',metadata:{name:paper.title+' · Spread'},children:[spread]});
    console.log(paper.id,doc.children.length,'logical blocks,',pages.length,'pages,',diagnostics.length,'diagnostics');
  }
  await writeFile(path.join(here,'evidence/import.json'),JSON.stringify(results,null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await run();
