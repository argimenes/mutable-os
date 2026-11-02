import {entitySearch,cardexDetails} from './cardex-query.mjs';
import {displayEntityName} from './entity-display.mjs';
import {canonicalSemantics} from './semantics.mjs';
import {canonicalEntities} from './entities.mjs';
import {guid,expected,canonicalTables} from './canonical-ledger.mjs';
import {validateCard} from '../features/cardex/validation.mjs';
const recordId=id=>{if(typeof id!=='string'||!id||id.length>512||id.includes('\0'))throw Error('Invalid Entity identity');};
const fold=s=>s.normalize('NFKC').toLowerCase();
const parse=s=>s===null?null:JSON.parse(s);
const aliases=(db,id)=>{const rows=db.prepare("SELECT guid AS id,alias AS name,origin,revision FROM EntityAlias WHERE entityGuid=? AND origin IN ('curated','imported') ORDER BY guid LIMIT 201").all(id);if(rows.length===201)throw Error('This Entity exceeds Cardex’s bounded alias budget (200).');return rows;};
const get=(db,id)=>{const row=db.prepare('SELECT guid AS id,name,revision,deletedUtc,description,nameStrata,descriptionDocument,imageRef FROM Entity WHERE guid=?').get(id);return row?{...row,displayName:displayEntityName(row.name,row.deletedUtc),nameStrata:parse(row.nameStrata),descriptionDocument:parse(row.descriptionDocument),imageRef:parse(row.imageRef),aliases:aliases(db,id)}:null;};
const quote=s=>'"'+s.replaceAll('"','""')+'"';
export function cardexImpact(db,id){
 const dependencies=[];
 for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'EntityAlias'").all()){
  for(const fk of db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().filter(f=>f.table==='Entity')){
   const count=db.prepare(`SELECT count(*) AS n FROM ${quote(name)} WHERE ${quote(fk.from)}=?`).get(id).n;if(count)dependencies.push({kind:name+'.'+fk.from,count});
  }
 }
 for(const [kind,sql] of [['saved text references',"SELECT count(*) AS n FROM StandoffProperty WHERE isDeleted=0 AND (targetEntityGuid=? OR (typename='codex/entity-reference' AND value=?))"],['saved Block references',"SELECT count(*) AS n FROM BlockProperty WHERE isDeleted=0 AND typename='codex/entity-reference' AND value=?"]]){
  const count=db.prepare(sql).get(...(kind==='saved text references'?[id,id]:[id])).n;if(count)dependencies.push({kind,count});
 }
 return {dependencies,blocked:dependencies.length>0,aliases:db.prepare('SELECT count(*) AS n FROM EntityAlias WHERE entityGuid=?').get(id).n,notice:'Saved SQL dependencies only. Unsaved references in open Documents are not included. Shared image files are retained.'};
}
export function canonicalCardex(db,ledger,request,check=()=>{}){
 check();if(!request||Buffer.byteLength(JSON.stringify(request))>32768)throw Error('Card exceeds the 32 KiB operation budget');
 const op=request.op;
 if(op==='bulk-state'){
  if(!['delete','restore'].includes(request.state)||!Array.isArray(request.items)||!request.items.length||request.items.length>100||request.confirmation!==request.items.length||new Set(request.items.map(i=>i.id)).size!==request.items.length)throw Error('Invalid explicit bulk selection');
  return {results:request.items.map(item=>{check();try{return {id:item.id,...canonicalCardex(db,ledger,{op:request.state,id:item.id,expected:item.expected,operationId:item.operationId,confirmation:item.id},check)};}catch(e){return {id:item.id,error:e.message};}})};
 }

 if(op==='semantic'){
  const c=request.command;
  if(!c||!(['Claim','ClaimParticipant'].includes(c.recordType)&&['get','create','add','update'].includes(c.op)||c.recordType==='Relationship'&&['relationship-create','relationship-update'].includes(c.op)))throw Error('Unsupported Cardex semantic operation');
  return c.recordType==='Relationship'?canonicalEntities(db,c,check,ledger):canonicalSemantics(db,ledger,c,check);
 }

 if(!['save','delete','restore'].includes(op))return db.transaction(()=>{
  if(op==='context')return {vaultGuid:db.prepare("SELECT value FROM SchemaInfo WHERE key='vaultGuid'").get().value};
  if(op==='get'){recordId(request.id);return {entity:get(db,request.id)};}
  if(op==='impact'){recordId(request.id);if(!get(db,request.id))throw Error('Entity missing');return cardexImpact(db,request.id);}
  if(['documents','mentions','claims','relationships'].includes(op))return cardexDetails(db,request,check);
  if(op==='search')return entitySearch(db,request,check);
  throw Error('Invalid Cardex operation');
 }).deferred();
 recordId(request.id);if(op==='save')validateCard(request);
 return ledger.mutate(request,ctx=>{
  const old=get(db,request.id),{now,actorGuid}=ctx;
  if(old){if(old.revision!==expected(request.expected))throw Error('Entity changed. Reload before editing.');}else if(op!=='save'||request.expected!==null)throw Error('Entity missing or changed');
  if(op==='delete'||op==='restore'){
   if(request.confirmation!==request.id)throw Error('Explicit deletion/restoration confirmation required');
   if(Boolean(old.deletedUtc)!==(op==='delete'))ctx.change('Entity',request.id,()=>db.prepare('UPDATE Entity SET deletedUtc=?,revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE guid=?').run(op==='delete'?now:null,actorGuid,now,request.id));
   return {entity:get(db,request.id),stateChanged:Boolean(old.deletedUtc)!==(op==='delete')};
  }
  const baseline=(request.aliasBaseline??[]).map(a=>[a.id,a.revision]).sort((a,b)=>a[0].localeCompare(b[0]));
  const current=(old?.aliases??[]).map(a=>[a.id,a.revision]).sort((a,b)=>a[0].localeCompare(b[0]));
  if(JSON.stringify(baseline)!==JSON.stringify(current))throw Error('Aliases changed. Reload before editing.');
  const collision=id=>{guid(id);for(const table of canonicalTables)if(table!=='Time'&&db.prepare(`SELECT 1 FROM ${table} WHERE guid=?`).get(id))throw Error('Canonical GUID already exists');};
  if(!old)collision(request.id);
  ctx.change('Entity',request.id,()=>{
   const values=[request.name,fold(request.name),request.descriptionDocument===null?null:request.descriptionDocument.children.map(b=>b.text).join('\n'),request.nameStrata===null?null:JSON.stringify(request.nameStrata),request.descriptionDocument===null?null:JSON.stringify(request.descriptionDocument),request.imageRef===null?null:JSON.stringify(request.imageRef)];
   if(old)db.prepare('UPDATE Entity SET name=?,nameKey=?,description=?,nameStrata=?,descriptionDocument=?,imageRef=?,revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE guid=?').run(...values,actorGuid,now,request.id);
   else db.prepare('INSERT INTO Entity(name,nameKey,description,nameStrata,descriptionDocument,imageRef,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc,guid) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...values,actorGuid,now,actorGuid,now,request.id);
  });
  const originals=new Map(db.prepare("SELECT guid,createdByActorGuid,createdUtc FROM EntityAlias WHERE entityGuid=? AND origin IN ('curated','imported')").all(request.id).map(a=>[a.guid,a]));
  const incoming=new Map(request.aliases.map(a=>[a.id,a]));
  // Remove edited aliases first so swapping two names does not hit a transient uniqueness conflict.
  for(const a of old?.aliases??[]){const next=incoming.get(a.id);if(!next||next.name!==a.name){ctx.change('EntityAlias',a.id,()=>db.prepare('DELETE FROM EntityAlias WHERE guid=?').run(a.id));}}
  for(const a of request.aliases){const before=old?.aliases.find(v=>v.id===a.id);if(before&&before.origin!==a.origin)throw Error('Alias origin cannot be changed');if(before?.name===a.name)continue;if(!before)collision(a.id);
   ctx.change('EntityAlias',a.id,()=>db.prepare('INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin,revision,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) VALUES(?,?,?,?,?,?,?,?,?,?)').run(a.id,request.id,a.name,fold(a.name),a.origin,before?before.revision+1:0,originals.get(a.id)?.createdByActorGuid??actorGuid,originals.get(a.id)?.createdUtc??now,actorGuid,now));
  }
  check();return {entity:get(db,request.id)};
 },check);
}
