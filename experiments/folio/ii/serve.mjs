import {createServer} from 'vite';
import express from 'express';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {corpus} from '../corpus.mjs';
import {cavernId} from './import.mjs';
import {closeFilesystemWorkers} from '../../../scripts/stage-c-gates/filesystem.mjs';
import {createManagedAssetService} from '../../../server/managed-assets-router.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)), root=path.resolve(here,'../../..');
export async function serve({port=4175,vault=path.resolve(here,'../work/folio-ii')}={}){
  if(process.env.FOLIO_EXPERIMENT==='0')throw Error('Folio experiment disabled');
  await mkdir(vault,{recursive:true});
  const assets=createManagedAssetService({root:vault,cavernId,session:'folio-ii'});
  async function retain(bytes,mediaType,expected){
    const sha=createHash('sha256').update(bytes).digest('hex');
    if(expected && sha!==expected)throw Error('Original hash mismatch');
    try{await assets.store.get('sha256:'+sha,cavernId);return;}catch(e){if(e.code!=='ENOENT')throw e;}
    const lease=await assets.store.begin([]);
    try{await assets.store.stage(lease,bytes,{mediaType});await assets.store.publish(lease);await assets.store.finish(lease,'folio-ii-import');}
    catch(e){await assets.store.abort(lease);throw e;}
  }
  const api=express();
  const vite=await createServer({root,configFile:path.join(root,'vite.config.js'),cacheDir:path.resolve(here,'../work/vite-ii'),
    plugins:[{name:'folio-ii-vault',configureServer(server){server.middlewares.use(api);}}],
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false},optimizeDeps:{entries:['experiments/folio/ii/index.html']}});
  const {SqliteKnowledgeHost}=await vite.ssrLoadModule('/server/sqlite-knowledge-host.ts');
  const knowledge=new SqliteKnowledgeHost({root:path.dirname(vault),debounceMs:60000});
  const scope=path.basename(vault);await knowledge.establish(scope);
  const id='8721e7b5-fdd4-4cda-81a3-e065db931869';
  const {entity}=await knowledge.entityMutate({vault:scope,request:{op:'create',id,operationId:id,name:'BERT'}});
  for(const paper of corpus){
    for(const suffix of ['','-spread']){
      const name=paper.id+suffix+'.ink';
      try{await copyFile(path.join(here,'generated',name),path.join(vault,name),constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
    }
    await retain(await readFile(path.resolve(here,'../sources',paper.id+'.pdf')),'application/pdf',paper.sha256);
  }
  await retain(await readFile(path.join(here,'generated/bert-figure-1.png')),'image/png');
  api.get('/experiments/folio/ii/session.json',(_req,res)=>res.json({entity,cavernId,session:'folio-ii'}));
  const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');
  api.use('/api/assets',assets.router);
  api.use('/api/native',createNativeDocumentStoreRouter({root:vault,defaultVault:'.',nativeDiscoveryWorker:false}));
  api.use('/api',(_req,res)=>res.status(404).json({error:'Outside Folio II study'}));
  await vite.listen();
  return {url:'http://127.0.0.1:'+vite.httpServer.address().port+'/experiments/folio/ii/',knowledge,
    close:async()=>{await vite.close();await knowledge.close();await assets.close();await closeFilesystemWorkers();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){console.log((await serve()).url);}
