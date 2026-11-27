import {createServer} from 'vite';
import express from 'express';
import {mkdir,copyFile,readFile,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

import {cavernId as studyCavern,importAll,work,base} from './import.mjs';
import {closeFilesystemWorkers} from '../../../scripts/stage-c-gates/filesystem.mjs';
import {createManagedAssetService} from '../../../server/managed-assets-router.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)), root=path.resolve(here,'../../..');
export async function serve({port=4176,vault=path.resolve(here,'../work/folio-semantic'),seed=true,cavernId=studyCavern}={}){
  if(process.env.FOLIO_EXPERIMENT==='0')throw Error('Folio experiment disabled');
  await mkdir(vault,{recursive:true});
  const assets=createManagedAssetService({root:vault,cavernId,session:'folio-iii'});
  async function retain(bytes,mediaType,expected){
    const sha=createHash('sha256').update(bytes).digest('hex');
    if(expected && sha!==expected)throw Error('Original hash mismatch');
    try{await assets.store.get('sha256:'+sha,cavernId);return;}catch(e){if(e.code!=='ENOENT')throw e;}
    const lease=await assets.store.begin([]);
    try{await assets.store.stage(lease,bytes,{mediaType});await assets.store.publish(lease);await assets.store.finish(lease,'folio-iii-import');}
    catch(e){await assets.store.abort(lease);throw e;}
  }
  const api=express();
  const vite=await createServer({root,configFile:path.join(root,'vite.config.js'),cacheDir:path.resolve(here,'../work/vite-iii'),
    plugins:[{name:'folio-iii-vault',configureServer(server){server.middlewares.use(api);}}],
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false},optimizeDeps:{entries:['experiments/folio/iii/index.html']}});
  const {SqliteKnowledgeHost}=await vite.ssrLoadModule('/server/sqlite-knowledge-host.ts');
  const knowledge=new SqliteKnowledgeHost({root:path.dirname(vault),debounceMs:60000});
  const scope=path.basename(vault);await knowledge.establish(scope);
  if(seed){
    const id='8721e7b5-fdd4-4cda-81a3-e065db931869';
    await knowledge.entityMutate({vault:scope,request:{op:'create',id,operationId:id,name:'BERT'}});
    const manifest=path.join(work,'assets.json');
    let inventory;
    try{inventory=JSON.parse(await readFile(manifest));}catch(e){if(e.code!=='ENOENT')throw e;await importAll();inventory=JSON.parse(await readFile(manifest));}
    for(const name of await readdir(path.join(here,'generated'))){
      if(!name.endsWith('.ink'))continue;
      try{await copyFile(path.join(here,'generated',name),path.join(vault,name),constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
    }
    for(const [digest,{file,type}] of Object.entries(inventory))await retain(await readFile(path.resolve(base,file)),type,digest);
  }
  await knowledge.acquire(scope);
  api.get('/experiments/folio/iii/session.json',async(_req,res)=>res.json({cavernId,session:'folio-iii',files:(await readdir(vault)).filter(n=>n.endsWith('.ink'))}));
  const {folioRouter}=await vite.ssrLoadModule('/server/folio-router.mjs');
  api.use('/api/folio',folioRouter({cavernId,store:()=>assets.store,knowledge,scope}));
  const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');
  api.use('/api/assets',assets.router);
  api.use('/api/native',createNativeDocumentStoreRouter({root:vault,defaultVault:'.',nativeDiscoveryWorker:false,coordinate:action=>knowledge.foreground(action)}));
  api.use('/api',(_req,res)=>res.status(404).json({error:'Outside Folio reading vault'}));
  await vite.listen();
  return {url:'http://127.0.0.1:'+vite.httpServer.address().port+'/experiments/folio/iii/',knowledge,
    close:async()=>{await vite.close();await knowledge.close();await assets.close();await closeFilesystemWorkers();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const external=process.env.FOLIO_VAULT;
  if(external&&!process.env.FOLIO_CAVERN_ID)throw Error('Supply the managed store Cavern identity in FOLIO_CAVERN_ID.');
  console.log((await serve(external?{vault:path.resolve(external),seed:false,cavernId:process.env.FOLIO_CAVERN_ID}:{})).url);}
