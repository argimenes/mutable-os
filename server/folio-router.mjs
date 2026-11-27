import express from 'express';
import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {acquirePdf} from './asset-remote.mjs';
import {publicationParser,extractPublication,publicationDocument,encodePublication} from './folio-publication.mjs';
import {PDF_LIMITS} from '../src/pdf/model';
import {decodeBlockTree} from '../src/block-tree/codecs';
import {captureNative,decodeNative,nativeEnvelope} from '../src/persistence/native-resource';

const codec={captureNative,decodeNative,nativeEnvelope,decodeBlockTree};

export function folioRouter({cavernId,store,knowledge,scope}){
  const api=express.Router();
  async function retain(bytes,mediaType,assetId){
    const assets=store();
    if(!assets)throw Error('The current vault has no managed asset store.');
    try{await assets.get(assetId,cavernId);return;}catch(e){if(e.code!=='ENOENT')throw e;}
    const lease=await assets.begin();
    try{await assets.stage(lease,bytes,{mediaType});await assets.publish(lease);await assets.finish(lease,'folio-import');}
    catch(e){await assets.abort(lease);throw e;}
  }
  let importing=false;
  api.post('/import-pdf',express.json({limit:'16kb'}),express.raw({type:'application/pdf',limit:PDF_LIMITS.bytes}),async(req,res)=>{
    if(importing)return res.status(409).json({error:'Another PDF is importing. Try again when it finishes.'});
    importing=true;
    const abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};
    res.once('close',cancel);
    let parser;
    try{
      let bytes,name,url;
      if(req.is('application/pdf')&&Buffer.isBuffer(req.body)){
        bytes=req.body;
        name=typeof req.query.name==='string'?req.query.name:'Publication.pdf';
      }else if(req.is('application/json')&&typeof req.body?.url==='string'){
        const remote=await acquirePdf(req.body.url,abort.signal);
        bytes=Buffer.from(remote.bytes);url=remote.endpoint;
        const basename=path.posix.basename(new URL(url).pathname);
        try{name=decodeURIComponent(basename);}catch{name=basename;}
      }else throw Error('Choose a PDF file or enter its HTTPS URL.');
      if(!bytes.subarray(0,1024).includes('%PDF-'))throw Error('The selected file is not a PDF.');
      const title=path.posix.basename(name.replaceAll('\\','/')).replace(/\.pdf$/i,'').trim()||'Publication';
      const id='folio-'+randomUUID(),sha256=createHash('sha256').update(bytes).digest('hex');
      const paper={id,title,sha256,...(url?{url}:{})};
      const managed=async(data,type)=>{
        abort.signal.throwIfAborted();
        const assetId='sha256:'+createHash('sha256').update(data).digest('hex');
        await retain(data,type,assetId);
        return {kind:'managed',cavernId,assetId};
      };
      parser=publicationParser({poolSize:1,parseTimeoutMs:120000,maxPages:PDF_LIMITS.pages});
      const {pages,children}=await extractPublication(parser,bytes,paper,async image=>managed(await sharp(image).png().toBuffer(),'image/png'),id);
      const original=await managed(bytes,'application/pdf');
      const wire=encodePublication(publicationDocument(id,paper,original,pages,children),codec);
      if(Buffer.byteLength(wire)>20*1024*1024)throw Error('This publication exceeds the native document size limit.');
      res.json({id,title,wire});
    }catch(error){if(!res.destroyed)res.status(400).json({error:error.message});}
    finally{parser?.close();res.off('close',cancel);importing=false;}
  });
  api.post('/entity',express.json(),async(req,res)=>{
    try{
      if(req.body?.op==='create'){
        const {id,name}=req.body;
        return res.json(await knowledge.entityMutate({vault:scope,request:{op:'create',id,operationId:id,name}}));
      }
      res.json(await knowledge.entityLookup({vault:scope,request:req.body}));
    }
    catch(e){res.status(400).json({error:e.message});}
  });
  return api;
}
