import {createHash} from 'node:crypto';
export const eligible="s.typename='codex/entity-reference' AND s.isDeleted=0 AND s.resolution IN ('direct','resolved') AND r.typename='document-block' AND r.indexStatus IN ('complete','incomplete')";
const text=(v,max=1000)=>{if(typeof v!=='string'||v.length>max||v.includes('\0'))throw Error('Invalid search value');return v;};
const like=v=>'%'+text(v).normalize('NFKC').toLowerCase().replace(/[\\%_]/g,'\\$&')+'%';
import {displayEntityName} from './entity-display.mjs';
export function compileEntityQuery(request,{omitText=false}={}){
 const f=request.filters??{},args=[],parts=[],status=request.status??'active',target=f.target??'nameAlias';
 if(!['active','deleted','all'].includes(status)||!['nameAlias','name','alias','description','any'].includes(target)||!['literal','regex'].includes(f.mode??'literal'))throw Error('Invalid search options');
 if(status!=='all')parts.push(`e.deletedUtc IS ${status==='active'?'':'NOT '}NULL`);
 const add=(sql,...values)=>{parts.push(sql);args.push(...values);};text(request.query??'');
 if(!omitText&&(request.query??'')!==''){
  const checks=[],values=[],pattern=like(request.query);
  if(['name','nameAlias','any'].includes(target)){checks.push("e.nameKey LIKE ? ESCAPE '\\'");values.push(pattern);}
  if(['alias','nameAlias','any'].includes(target)){checks.push("EXISTS(SELECT 1 FROM EntityAlias a WHERE a.entityGuid=e.guid AND a.origin IN ('curated','imported') AND a.aliasKey LIKE ? ESCAPE '\\')");values.push(pattern);}
  if(['description','any'].includes(target)){checks.push("lower(coalesce(e.description,'')) LIKE ? ESCAPE '\\'");values.push(pattern);}
  add('('+checks.join(' OR ')+')',...values);
 }
 if(f.typename)add('e.typename=?',text(f.typename,256));
 if(f.image){if(!['yes','no'].includes(f.image))throw Error('Invalid image filter');parts.push(`e.imageRef IS ${f.image==='yes'?'NOT ':''}NULL`);}
 for(const [field,operator] of [['createdFrom','>='],['createdTo','<']])if(f[field]){if(!/^\d{4}-\d{2}-\d{2}$/.test(f[field]))throw Error('Use an ISO date');const date=new Date(f[field]+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==f[field])throw Error('Invalid date');if(field==='createdTo')date.setUTCDate(date.getUTCDate()+1);add(`e.createdUtc ${operator} ?`,date.toISOString());}
 if(f.relationshipType||f.otherEntity||f.direction){const direction=f.direction||'both';if(!['in','out','both'].includes(direction))throw Error('Invalid relationship direction');const endpoints=[];
  for(const d of direction==='both'?['in','out']:[direction]){const side=d==='in'?'target':'source',other=d==='in'?'source':'target';endpoints.push(`EXISTS(SELECT 1 FROM Relationship x WHERE x.${side}EntityGuid=e.guid${f.relationshipType?' AND x.typename=?':''}${f.otherEntity?` AND x.${other}EntityGuid=?`:''})`);if(f.relationshipType)args.push(text(f.relationshipType,256));if(f.otherEntity)args.push(text(f.otherEntity,512));}parts.push('('+endpoints.join(' OR ')+')');
 }
 if(f.claimType||f.role||f.claimOther){let sql='EXISTS(SELECT 1 FROM ClaimParticipant p JOIN Claim c ON c.guid=p.claimGuid WHERE p.entityGuid=e.guid';if(f.claimType){sql+=' AND c.typename=?';args.push(text(f.claimType,256));}if(f.role){sql+=' AND p.role=?';args.push(text(f.role,256));}if(f.claimOther){sql+=' AND EXISTS(SELECT 1 FROM ClaimParticipant o WHERE o.claimGuid=c.guid AND o.entityGuid=?)';args.push(text(f.claimOther,512));}parts.push(sql+')');}
 return {where:parts.join(' AND ')||'1',args,target};
}
export function pageOffset(request,configuration){
 if(!request.after)return 0;let cursor;try{cursor=JSON.parse(Buffer.from(request.after,'base64url').toString());}catch{throw Error('Invalid page');}
 if(cursor.key!==configuration||!Number.isInteger(cursor.offset)||cursor.offset<0||cursor.offset>1000000)throw Error('Page belongs to a different query or sort');return cursor.offset;
}
export const queryKey=r=>createHash('sha256').update(JSON.stringify([r.op,r.id??null,r.query??'',r.status??'active',r.sort??'name',r.direction??'asc',r.filters??{}])).digest('hex').slice(0,24);
export const pageCursor=(key,offset)=>Buffer.from(JSON.stringify({key,offset})).toString('base64url');
export function entitySearch(db,request,check=()=>{},regexIds){
 const started=performance.now(),sort=request.sort??'name',direction=request.direction??'asc';if(!['name','created','mentions','documents'].includes(sort)||!['asc','desc'].includes(direction))throw Error('Invalid Entity order');
 if(request.filters?.mode==='regex'&&!regexIds)throw Error('Regex requires the isolated search reader');
 const {where,args}=compileEntityQuery(request,{omitText:!!regexIds}),key=queryKey(request),offset=pageOffset(request,key),filter=where+(regexIds?' AND e.guid IN (SELECT value FROM json_each(?))':'');if(regexIds)args.push(JSON.stringify(regexIds));
 // Qualified covering-index scan avoids regrouping reference rows for global count order.
 const allCounts=['mentions','documents'].includes(sort),cte=allCounts?`WITH counts AS (SELECT s.targetEntityGuid AS id,COUNT(DISTINCT s.logicalGuid) AS mentions,COUNT(DISTINCT s.resourceGuid) AS documents FROM StandoffProperty s INDEXED BY IX_Standoff_Entity_Document_Logical JOIN Resource r ON r.guid=s.resourceGuid JOIN Entity e ON e.guid=s.targetEntityGuid WHERE ${eligible} AND ${filter} GROUP BY s.targetEntityGuid) `:'';
 const order=sort==='name'?'e.nameKey':sort==='created'?'e.createdUtc':`coalesce(c.${sort},0)`;
 const sql=cte+`SELECT e.guid AS id,e.name,e.revision,e.deletedUtc,e.createdUtc,e.typename,e.imageRef${allCounts?',coalesce(c.mentions,0) AS mentions,coalesce(c.documents,0) AS documents':''} FROM Entity e ${allCounts?'LEFT JOIN counts c ON c.id=e.guid':''} WHERE ${filter} ORDER BY ${sort==='created'?'e.createdUtc IS NULL,':''}${order} ${direction},e.guid LIMIT 31 OFFSET ?`;
 const rows=db.prepare(sql).all(...(allCounts?[...args,...args]:args),offset),page=rows.slice(0,30),ids=JSON.stringify(page.map(r=>r.id)),map=new Map(page.map(r=>[r.id,r]));check();
 if(page.length){
  if(!allCounts)for(const row of db.prepare(`SELECT s.targetEntityGuid AS id,COUNT(DISTINCT s.logicalGuid) AS mentions,COUNT(DISTINCT s.resourceGuid) AS documents FROM StandoffProperty s JOIN Resource r ON r.guid=s.resourceGuid WHERE ${eligible} AND s.targetEntityGuid IN (SELECT value FROM json_each(?)) GROUP BY s.targetEntityGuid`).all(ids))Object.assign(map.get(row.id),row);
  for(const row of db.prepare('SELECT entityGuid AS id,COUNT(DISTINCT claimGuid) AS claims FROM ClaimParticipant WHERE entityGuid IN (SELECT value FROM json_each(?)) GROUP BY entityGuid').all(ids))Object.assign(map.get(row.id),row);
  for(const row of db.prepare('SELECT id,COUNT(DISTINCT guid) AS relationships FROM (SELECT sourceEntityGuid AS id,guid FROM Relationship WHERE sourceEntityGuid IN (SELECT value FROM json_each(?)) UNION ALL SELECT targetEntityGuid AS id,guid FROM Relationship WHERE targetEntityGuid IN (SELECT value FROM json_each(?))) GROUP BY id').all(ids,ids))Object.assign(map.get(row.id),row);
 }
 const total=db.prepare(`SELECT COUNT(*) AS n FROM Entity e WHERE ${filter}`).get(...args).n;check();
 return {rows:page.map(r=>({mentions:0,documents:0,claims:0,relationships:0,...r,displayName:displayEntityName(r.name,r.deletedUtc),imageRef:r.imageRef?JSON.parse(r.imageRef):null})),total,offset,next:rows.length>30?pageCursor(key,offset+30):null,previous:offset?pageCursor(key,Math.max(0,offset-30)):null,sqlMs:performance.now()-started,notice:'Saved indexed Documents only; unsaved, stale and unavailable sources are excluded. Incomplete indexes may undercount.'};
}
export function cardexDetails(db,request,check=()=>{}){
 const {id,op}=request;text(id,512);const q=like(request.query??''),f=request.filters??{},key=queryKey(request),offset=pageOffset(request,key),args=[id];let sql;
 if(op==='documents'){
  args.push(q);const sorts={title:'coalesce(r.title,r.path) COLLATE NOCASE',date:'r.fileModifiedUtc',mentions:'mentions'},order=sorts[request.sort??'title'];if(!order)throw Error('Invalid Document order');if(!['asc','desc'].includes(request.direction??'asc'))throw Error('Invalid order');
  sql=`SELECT r.guid AS id,r.title,r.path,r.fileModifiedUtc AS date,COUNT(DISTINCT s.logicalGuid) AS mentions FROM StandoffProperty s JOIN Resource r ON r.guid=s.resourceGuid WHERE ${eligible} AND s.targetEntityGuid=? AND lower(coalesce(r.title,r.path)) LIKE ? ESCAPE '\\' GROUP BY r.guid ORDER BY ${order} ${request.direction??'asc'},r.guid`;
 }else if(op==='mentions'){
  const searchExcerpt=!!request.query;
  if(searchExcerpt){db.function('cardex_excerpt',{deterministic:true},(value,start,end,coordinate)=>{const units=coordinate==='cell'?[...value]:value.split('');return units.slice(Math.max(0,start-55),end+85).join('').normalize('NFKC').toLowerCase();});args.push(q);}if(f.document)args.push(text(f.document,512));
  sql=`SELECT s.logicalGuid AS id,s.resourceGuid,r.title,r.path FROM StandoffProperty s JOIN Resource r ON r.guid=s.resourceGuid JOIN Block b ON b.guid=s.sourceBlockGuid WHERE ${eligible} AND s.targetEntityGuid=? ${searchExcerpt?"AND cardex_excerpt(b.text,s.startIndex,s.endIndex,s.coordinate) LIKE ? ESCAPE '\\'":''} ${f.document?'AND r.guid=?':''} GROUP BY s.logicalGuid,s.resourceGuid ORDER BY r.guid,s.logicalGuid`;
 }else if(op==='claims'){
  args.push(q);let extra='';for(const [field,column]of [['type','c.typename'],['role','p.role']])if(f[field]){extra+=` AND ${column}=?`;args.push(text(f[field],256));}if(f.other){extra+=' AND EXISTS(SELECT 1 FROM ClaimParticipant o WHERE o.claimGuid=c.guid AND o.entityGuid=?)';args.push(text(f.other,512));}
  sql=`SELECT DISTINCT c.guid AS id,c.expression,c.typename,c.revision FROM ClaimParticipant p JOIN Claim c ON c.guid=p.claimGuid WHERE p.entityGuid=? AND lower(coalesce(c.expression,'')) LIKE ? ESCAPE '\\' ${extra} ORDER BY c.guid`;
 }else if(op==='relationships'){
  args.push(id);const d=f.direction??'both';if(!['both','in','out'].includes(d))throw Error('Invalid direction');let extra='';if(d!=='both'){extra+=` AND x.${d==='in'?'target':'source'}EntityGuid=?`;args.push(id);}if(f.type){extra+=' AND x.typename=?';args.push(text(f.type,256));}if(f.other){extra+=' AND (CASE WHEN x.sourceEntityGuid=? THEN x.targetEntityGuid ELSE x.sourceEntityGuid END)=?';args.push(id,text(f.other,512));}args.push(q);
  sql=`SELECT x.guid AS id,x.sourceEntityGuid AS source,x.targetEntityGuid AS target,x.typename AS type,x.revision,a.name AS sourceName,a.deletedUtc AS sourceDeleted,b.name AS targetName,b.deletedUtc AS targetDeleted FROM Relationship x JOIN Entity a ON a.guid=x.sourceEntityGuid JOIN Entity b ON b.guid=x.targetEntityGuid WHERE (x.sourceEntityGuid=? OR x.targetEntityGuid=?) ${extra} AND lower(x.typename) LIKE ? ESCAPE '\\' ORDER BY x.guid`;
 }else throw Error('Unknown detail tab');
 const rows=db.prepare(sql+' LIMIT 31 OFFSET ?').all(...args,offset),page=rows.slice(0,30);
 if(op==='mentions'&&page.length){const segments=db.prepare(`SELECT s.logicalGuid,s.resourceGuid,s.sourceBlockGuid AS blockGuid,s.startIndex,s.endIndex,s.coordinate,b.text FROM StandoffProperty s JOIN Resource r ON r.guid=s.resourceGuid JOIN Block b ON b.guid=s.sourceBlockGuid WHERE ${eligible} AND s.targetEntityGuid=? AND s.logicalGuid IN (SELECT value FROM json_each(?)) ORDER BY s.resourceGuid,s.sourceBlockGuid,s.startIndex LIMIT 301`).all(id,JSON.stringify(page.map(r=>r.id)));if(segments.length>300)throw Error('These mentions exceed the 300-segment page budget; narrow the search');
  for(const row of page)row.segments=segments.filter(s=>s.logicalGuid===row.id&&s.resourceGuid===row.resourceGuid).map(s=>{const units=s.coordinate==='cell'?[...s.text]:s.text.split(''),from=Math.max(0,s.startIndex-55),to=Math.min(units.length,s.endIndex+85);return {blockGuid:s.blockGuid,start:s.coordinate==='utf16'?[...s.text.slice(0,s.startIndex)].length:s.startIndex,end:s.coordinate==='utf16'?[...s.text.slice(0,s.endIndex)].length:s.endIndex,coordinate:s.coordinate==='utf16'&&(/[\uD800-\uDBFF]$/.test(s.text.slice(0,s.startIndex))||/[\uD800-\uDBFF]$/.test(s.text.slice(0,s.endIndex)))?'unsupported':'cell',blockHash:createHash('sha256').update(s.text).digest('hex'),before:units.slice(from,s.startIndex).join(''),text:units.slice(s.startIndex,s.endIndex).join(''),after:units.slice(s.endIndex,to).join('')};});
 }
 if(op==='relationships')for(const r of page){r.sourceName=displayEntityName(r.sourceName,r.sourceDeleted);r.targetName=displayEntityName(r.targetName,r.targetDeleted);}
 check();return {rows:page,next:rows.length>30?pageCursor(key,offset+30):null,previous:offset?pageCursor(key,Math.max(0,offset-30)):null,offset};
}
