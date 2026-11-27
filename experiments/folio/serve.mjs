import { createServer } from 'vite';
import express from 'express';
import { copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { corpus } from './corpus.mjs';

export async function serve({port=4174,vault}={}) {
  if(process.env.FOLIO_EXPERIMENT==='0') throw Error('Folio experiment disabled');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const local=path.join(root,'experiments/folio');
  vault??=path.join(local,'work/demo-vault');
  await mkdir(vault,{recursive:true});
  for(const {id} of corpus) {
    try { await copyFile(path.join(local,'generated',id+'.ink'),path.join(vault,id+'.ink'),constants.COPYFILE_EXCL); }
    catch(error) { if(error.code!=='EEXIST') throw error; }
  }
  const api=express();
  api.get('/experiments/folio/session.json',(_req,res)=>res.json({folioExperiment:1}));
  const vite=await createServer({root,configFile:path.join(root,'vite.config.js'),cacheDir:path.join(local,'work/vite'),
    plugins:[{name:'folio-local-vault',configureServer(server){server.middlewares.use(api);}}],
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false},optimizeDeps:{entries:['experiments/folio/index.html']}});
  const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');
  api.use('/api/native',createNativeDocumentStoreRouter({root:vault,defaultVault:'.',nativeDiscoveryWorker:false}));
  api.use('/api',(_req,res)=>res.status(404).json({error:'Outside Folio experiment'}));
  await vite.listen();
  return {vite,url:'http://127.0.0.1:'+vite.httpServer.address().port+'/experiments/folio/'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {url}=await serve(); console.log(url);
}
