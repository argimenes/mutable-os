import {parentPort,workerData} from 'node:worker_threads';
import Database from 'better-sqlite3';
import {compileEntityQuery,entitySearch} from './cardex-query.mjs';
// Dedicated disposable read-only worker. Never shares a writer, ledger, or UI thread.
let db;
try{
 const {file,request}=workerData,pattern=request.query;
 if(typeof pattern!=='string'||pattern.length>256)throw Error('Regex pattern exceeds 256 characters');
 const regex=new RegExp(pattern,'iu'),{where,args,target}=compileEntityQuery(request,{omitText:true});
 db=new Database(file,{readonly:true,fileMustExist:true});db.pragma('busy_timeout=200');
 const matches=[];let rows=0,bytes=0;const aliases=db.prepare("SELECT alias FROM EntityAlias WHERE entityGuid=? AND origin IN ('curated','imported') LIMIT 201");
 for(const e of db.prepare(`SELECT e.guid,e.name,e.description FROM Entity e WHERE ${where} ORDER BY e.guid LIMIT 50001`).iterate(...args)){
  if(++rows>50000)throw Error('Regex exceeds 50,000 candidate Entities; narrow the filters');
  const values=[];if(['name','nameAlias','any'].includes(target))values.push(e.name);if(['description','any'].includes(target))values.push(e.description??'');
  if(['alias','nameAlias','any'].includes(target)){const a=aliases.all(e.guid);if(a.length>200)throw Error('Regex alias budget exceeded; narrow the filters');values.push(...a.map(v=>v.alias));}
  bytes+=values.reduce((n,v)=>n+Buffer.byteLength(v),0);if(bytes>16*1024*1024)throw Error('Regex exceeds the 16 MiB text budget; narrow the filters');
  if(values.some(v=>regex.test(v)))matches.push(e.guid);
 }
 parentPort.postMessage({result:entitySearch(db,request,()=>{},matches)});
}catch(error){parentPort.postMessage({error:error.message});}finally{db?.close();}
