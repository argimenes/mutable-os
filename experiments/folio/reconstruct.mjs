// All geometry here is import-time PDFium viewport geometry in points. The
// renderer receives a separate initial frame and is free to compose it differently.
const round = n => Math.round(n * 100) / 100;
const length = text => Array.from(text).length;
const middle = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
function bounds(items) {
  const x = Math.min(...items.map(i => i.x)), y = Math.min(...items.map(i => i.y));
  return {x, y, width: Math.max(...items.map(i => i.x + i.width)) - x,
    height: Math.max(...items.map(i => i.y + i.height)) - y};
}
function physicalLines(items) {
  const lines = [];
  for (const item of [...items].sort((a,b) => a.y - b.y || a.x - b.x)) {
    let line = lines.at(-1);
    if (!line || item.y - line.y > Math.max(2, item.fontSize * 0.48)) {
      line = {y:item.y, items:[]};
      lines.push(line);
    }
    line.items.push(item);
  }
  for (const line of lines) line.items.sort((a,b) => a.x - b.x);
  return lines;
}
function inside(box, item) {
  if (!box) return false;
  const x = item.x + item.width / 2, y = item.y + item.height / 2;
  return x >= box.x-1 && x <= box.x+box.width+1 && y >= box.y-1 && y <= box.y+box.height+1;
}
function assignItems(page) {
  const claimed = new Set();
  const groups = page.blocks.map((block,index) => {
    const items = [];
    for (const i of block.textItemIndices) {
      if (!page.textItems[i]) throw Error('Invalid LiteParse item index');
      if (!claimed.has(i)) { items.push(i); claimed.add(i); }
    }
    return {block, index, items, recovered:[]};
  });
  for (let i=0; i<page.textItems.length; i++) {
    if (claimed.has(i)) continue;
    const item = page.textItems[i];
    const candidates = groups.filter(g => g.block.kind === 'table' && inside(g.block.bbox,item));
    if (candidates.length === 1) {
      candidates[0].items.push(i);
      candidates[0].recovered.push(i);
    } else {
      // Keep ambiguous ink separately. Never copy a guessed table transcription
      // on top of the same source text.
      groups.push({block:{kind:'unclassified'},index:groups.length,items:[i],recovered:[i]});
    }
  }
  // Consecutive prose fragments often represent lines of one sentence. Require
  // the same column, a normal baseline step and an unfinished prior sentence.
  const joined=[];
  for(const group of groups){
    const prev=joined.at(-1);
    const first=page.textItems[group.items[0]], last=page.textItems[prev?.items.at(-1)];
    if(prev?.block.kind==='paragraph' && group.block.kind==='paragraph' && first && last &&
      Math.abs(prev.block.bbox.x-group.block.bbox.x)<3 &&
      first.y-last.y>0.65*first.fontSize && first.y-last.y<1.6*first.fontSize &&
      !/[.!?:]$/.test(last.text.trim()) && Math.abs(first.fontSize-last.fontSize)<1){
      prev.items.push(...group.items);
      prev.recovered.push(...group.recovered);
      prev.groups.push(group.index);
      prev.block={...prev.block,text:prev.block.text+' '+group.block.text};
    } else joined.push({...group,groups:[group.index]});
  }
  return joined;
}
const ligatures = {'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl'};
function paragraph(lines, id, page, region, options) {
  let text = '', offset = 0;
  const mappings = [], props = [], joins = [];
  function append(value) { text += value; offset += length(value); }
  for (const [row,line] of lines.entries()) {
    for (const [column,item] of line.items.entries()) {
      // Preserve literal hyphens unless the next fragment and the parser's
      // independent joined reading both support the unhyphenated word.
      const raw = item.text.trim();
      if (!raw) continue;
      const last = column === line.items.length-1;
      let value = raw.replace(/[ﬀﬁﬂﬃﬄ]/gu, c => ligatures[c]).normalize('NFC');
      const left = value.match(/(\p{L}+)-$/u)?.[1];
      const right = lines[row+1]?.items[0].text.trim().match(/^([\p{Ll}]+)/u)?.[1];
      const removeHyphen = !options.retainHyphens && last && left && right && (region.text ?? '').includes(left+right);
      if (removeHyphen) value = value.slice(0,-1);
      const prev = mappings.at(-1);
      const adjacent = column > 0 && item.x - (line.items[column-1].x + line.items[column-1].width) < item.fontSize * 0.12;
      if (offset && !prev.noSpaceAfter && !adjacent) {
        joins.push(offset);
        append(' ');
      }
      const start = offset;
      append(value);
      const key = 'p'+page+'-i'+item.index;
      const noSpaceAfter = !!(last && /[-\u2010]$/u.test(raw) && /^\p{L}/u.test(lines[row+1]?.items[0].text.trim() ?? ''));
      mappings.push({item:item.index,start,end:offset,noSpaceAfter, ...(value!==item.text ? {normalized:value}: {})});
      if (offset === start) continue;
      const range = {start,end:offset-1};
      props.push({id:id+'-'+key, type:'spatial/source-run', value:key,...range});
      if ((item.fontWeight ?? 0)>=600 || /bold|medi/i.test(item.fontName))
        props.push({id:id+'-bold-'+key,type:'style/bold',...range});
      if (/italic|obli|ital/i.test(item.fontName))
        props.push({id:id+'-italics-'+key,type:'style/italics',...range});
    }
  }
  return {text,props,joins,mappings};
}

export function reconstruct(paper, result, imageUrls,options={}) {
  const docId = 'folio-'+paper.sha256.slice(0,20);
  const doc = {type:'document-block',id:docId,metadata:{name:paper.title,folio:{
    version:1, source:{...paper,license:'CC BY 4.0'},coordinateSystem:'top-left-72dpi', evidence:paper.id+'.source.json.gz'}},children:[]};
  const evidence = {version:1,source:paper.sha256,parser:'@llamaindex/liteparse@2.21.3',offsets:'Unicode code points, half-open at import',pages:[]};
  const counts = {pages:0,items:0,mapped:0,empty:0,recovered:0,unclassified:0,textBlocks:0,images:0,tables:0,tableCells:0,tableCellsWithLinks:0,tagRoots:0,shapes:0,lines:0};
  for (const page of result.pages) {
    const {pageNum:number,width,height} = page;
    const id = docId+'-p'+number;
    const pageDto = {type:'page-block',id,metadata:{folio:{number,width,height,rules:[]}},children:[]};
    doc.children.push(pageDto);
    const snapshot = {number,width,height,items:page.textItems.map(({text,x,y,width,height,fontName,fontSize,fontWeight,rotation,mcid}) =>
      ({text,x,y,width,height,fontName,fontSize,fontWeight,rotation,mcid})),blocks:page.blocks,bindings:[],images:[],structureTree:page.structureTree,vectorGraphics:page.vectorGraphics};
    evidence.pages.push(snapshot);
    counts.pages++; counts.items+=page.textItems.length; counts.tagRoots+=page.structureTree?.roots.length ?? 0;
    counts.shapes+=page.vectorGraphics?.shapes.length ?? 0; counts.lines+=page.vectorGraphics?.lines.length ?? 0;
    const images = result.images.filter(i => i.page===number);
    const pendingImages = new Map(images.map(i => [i.id,i]));
    function imageBlock(image) {
      const {bbox,rotation,name,id:imageId} = image;
      snapshot.images.push({imageId,bbox,rotation,name});
      pageDto.children.push({type:'image-block',id:id+'-'+imageId,blockProperties:[{type:'block/size',metadata:{width:Math.round(bbox.width*4/3)+'px'}}],metadata:{url:imageUrls.get(name),alt:'Extracted image '+imageId,
        folio:{frame:{...bbox},kind:'figure',rotation}}});
      counts.images++; pendingImages.delete(imageId);
    }
    for (const group of assignItems(page)) {
      const {block,items,index,recovered} = group;
      if (block.kind==='figure' && pendingImages.has(block.id)) imageBlock(pendingImages.get(block.id));
      if (block.kind==='rule' && block.bbox) pageDto.metadata.folio.rules.push({...block.bbox});
      if (block.kind==='table') {
        counts.tables++;
        const cells = [...(block.header??[]),...(block.rows??[]).flat()];
        counts.tableCells+=cells.length; counts.tableCellsWithLinks+=cells.filter(c=>c.textItemIndices.length).length;
      }
      counts.recovered+=recovered.length;
      if(block.kind==='unclassified') counts.unclassified+=items.length;
      const ink = items.map(i => ({...page.textItems[i],index:i})).filter(i=>i.text.trim());
      counts.empty+=items.length-ink.length;
      if (!ink.length) continue;
      const lines = physicalLines(ink);
      // A classified heading sometimes absorbs an affiliation and email at
      // different sizes on different lines. Split on strong size/vertical breaks.
      const chunks = [];
      for (const line of lines) {
        const previous = chunks.at(-1)?.at(-1);
        const size = middle(line.items.map(i=>i.fontSize));
        if (!previous || line.y - previous.y > 1.65*size ||
          (block.kind==='heading' && Math.abs(previous.items[0].fontSize-size)>1)) chunks.push([]);
        chunks.at(-1).push(line);
      }
      for (const [part,chunk] of chunks.entries()) {
        const blockId = id+'-b'+index+'-'+part;
        const members = chunk.flatMap(l=>l.items), frame = bounds(members);
        const fontSize = middle(members.map(i=>i.fontSize));
        const leading = middle(chunk.slice(1).map((l,i)=>l.y-chunk[i].y)) || fontSize*1.13;
        const {text,props,joins,mappings} = paragraph(chunk,blockId,number,block,options);
        const kind = /^(Figure|Fig\.|Table)\s+\d+[:.]/i.test(text) ? 'caption' : block.kind;
        const family = /sans/i.test(members[0].fontName) ? 'sans-serif' : /mono|typewriter/i.test(members[0].fontName) ? 'monospace' : 'serif';
        pageDto.children.push({id:blockId,type:'standoff-editor-block',inlineAtoms:[{kind:'text',text}],standoffProperties:props,
          metadata:{folio:{kind,frame:Object.fromEntries(Object.entries(frame).map(([k,v])=>[k,round(v)])),fontSize:round(fontSize),lineCount:chunk.length,
            leading:round(Math.max(fontSize,leading)),family,align:block.kind==='heading' && Math.abs(frame.x+frame.width/2-width/2)<12 ? 'center':'left'}}});
        snapshot.bindings.push({blockId,group:index,groups:group.groups,part,lines:chunk.map(l=>l.items.map(i=>i.index)),joins,mappings,
          recovered:members.filter(i=>recovered.includes(i.index)).map(i=>i.index)});
        counts.textBlocks++; counts.mapped+=mappings.length;
      }
    }
    for(const image of pendingImages.values()) imageBlock(image);
    // Put bottom-margin publication furniture after both columns in Flint.
    const isFooter = b => b.metadata.folio.frame.y > height*0.92;
    pageDto.children.sort((a,b)=>Number(isFooter(a))-Number(isFooter(b)));
  }
  return {doc,evidence,counts};
}
