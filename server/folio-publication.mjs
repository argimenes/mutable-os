import {LiteParse} from '@llamaindex/liteparse';
import {reconstruct} from '../experiments/folio/reconstruct.mjs';

export function publicationParser(options={}){
  return new LiteParse({ocrEnabled:false,extractImages:true,extractBlocks:true,extractVectorGraphics:true,extractTextMetadata:true,keepHeadersFooters:true,preserveVerySmallText:true,quiet:true,dpi:96,...options});
}

export async function extractPublication(parser,source,paper,image,documentId){
  const start=performance.now(),r=await parser.parse(source);
  if(!r.pages.length || r.pageErrors.length || r.pages.length!==r.totalPages)throw Error('Folio could not read every page of this PDF.');
  const images=new Map();for(const im of r.images)images.set(im.name,await image(im.bytes));
  const {doc,counts,evidence}=reconstruct(paper,r,new Map(),{retainHyphens:true,documentId});
  const children=[],pages=doc.children.map((page,i)=>{const pageInfo={...page.metadata.folio,frames:[]};
    for(const b of page.children){const f=b.metadata.folio;pageInfo.frames.push({...f,kind:f.kind==='table'?'reading-text':f.kind,id:b.id,start:0});
      if(b.type==='image-block'){const placement=evidence.pages[i].images.find(im=>b.id===page.id+'-'+im.imageId);b.asset=images.get(placement.name);b.metadata={alt:'Imported figure'};}
      else{b.standoffProperties=b.standoffProperties.filter(p=>p.type!=='spatial/source-run');delete b.metadata;}
      children.push(b);
    }return pageInfo;});
  const metrics={...counts,ms:Math.round(performance.now()-start),captions:pages.flatMap(p=>p.frames).filter(f=>f.kind==='caption').length,
    footnoteCandidates:pages.flatMap(p=>p.frames.filter(f=>f.frame.y>p.height*.8&&f.fontSize<9)).length};
  return {children,pages,metrics};
}

export function publicationDocument(id,paper,original,pages,children){
  const sourceId=id+'-pdf',reader=id+'-composition';
  const sourceBlock={id:sourceId,type:'folio-original-block',asset:original,metadata:{original,pagination:paper.sha256,pages:pages.length}};
  const content={id:reader,type:'folio-publication-block',metadata:{publicationId:id,pagination:paper.sha256,pages:pages.length},children};
  return {type:'document-block',id,metadata:{name:paper.title,title:paper.title,folio:{version:3,source:paper,original,pages}},children:[{id:id+'-spread',type:'spread-block',metadata:{spread:{version:3,continuousLeafId:id+'-b',ratio:.5,bindings:[]}},
    children:[{id:id+'-a',type:'leaf-block',placement:'verso',collapsedByDefault:true,children:[sourceBlock]},{id:id+'-b',type:'leaf-block',placement:'recto',children:[content]}]}]};
}

export function encodePublication(dto,{decodeBlockTree,nativeEnvelope,captureNative,decodeNative}){
  const {state}=decodeBlockTree(dto);
  for(const placement of Object.values(state.placements))placement.placementId='placement-'+state.contents[placement.contentKey].payload.id;
  const wire=JSON.stringify(nativeEnvelope(captureNative(state,dto.id)));
  decodeNative(new TextEncoder().encode(wire),undefined,true);
  return wire;
}

