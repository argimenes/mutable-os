// Reproduce the audited still-image subset from the pinned checkout. No package-manager hooks.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const revision='6cf93f7d3d2922efdbeb86cafa27f39758be9398';
const source=process.argv[2]??'/tmp/mutable-initialis-investigation';
if(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()!==revision)throw Error('Wrong Initialis revision');
const dest='public/vendor/initialis/'+revision;
const params=await import(pathToFileURL(path.join(source,'render/src/params.js')).href+'?v=a8136959');
const kinds=await import(pathToFileURL(path.join(source,'render/src/kinds.js')).href+'?v=a8136959');
await kinds.need(params.DEFAULTS);
const {PARAMS_OF}=await import(pathToFileURL(path.join(source,'render/src/kinds/names.js')).href+'?v=a8136959');
const requested=[['pattern','hatch'],['frame','rect'],...Object.entries(PARAMS_OF).flatMap(([family,keys])=>keys.map(key=>[family,params.DEFAULTS[key]]))].filter(([,name])=>name&&name!=='none');
const files=new Set();
async function collect(file){if(files.has(file))return;files.add(file);const code=await readFile(path.join(source,file),'utf8');for(const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){const spec=match[1].split('?')[0];if(spec.startsWith('.'))await collect(path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)));}}
await collect('render/src/render.js');await collect('render/src/kinds.js');
for(const [family,name] of requested)await collect(`render/src/kinds/${family}/${name}.js`);
// lBlob, whole fonts, pages, animation and custom use(url) are unreachable under our validation.
for(const file of files){await mkdir(path.dirname(path.join(dest,file)),{recursive:true});await copyFile(path.join(source,file),path.join(dest,file));}
for(const file of ['LICENSE','render/fonts/caps/cormorant-garamond-700.json']){await mkdir(path.dirname(path.join(dest,file)),{recursive:true});await copyFile(path.join(source,file),path.join(dest,file));files.add(file);}
const fonts=JSON.parse(await readFile(path.join(source,'render/fonts/base/manifest.json'),'utf8')).filter(f=>f.slug==='cormorant-garamond');fonts[0].files={'700':fonts[0].files['700']};
await mkdir(dest+'/render/fonts/base',{recursive:true});await mkdir(dest+'/render/fonts/initials',{recursive:true});
for(const [file,value] of [['render/fonts/base/manifest.json',fonts],['render/fonts/initials/manifest.json',[]]]){await writeFile(dest+'/'+file,JSON.stringify(value,null,2)+'\n');files.add(file);}
const schema=params.PARAMS.filter(p=>p.key!=='text').map(p=>({key:p.key,default:p.def,spec:p.spec}));
const defaults=Object.fromEntries(schema.map(p=>[p.key,p.default]));
const fixed={font:'cormorant-garamond-700',lBlob:0,lFil:defaults.lFil,...Object.fromEntries(Object.values(PARAMS_OF).flat().map(key=>[key,defaults[key]]))};
await writeFile('src/features/initialis/preset.json',JSON.stringify({revision,schemaVersion:1,assetVersion:revision+'-subset-1',defaults,schema,fixed},null,2)+'\n');
// An actual font-specific OFL notice, not upstream's generic placeholder template.
const license=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt');if(!license.ok)throw Error('Font licence unavailable');const ofl=await license.text();if(!ofl.startsWith('Copyright 2015 the Cormorant Project Authors'))throw Error('Review changed licence');
await writeFile(dest+'/render/fonts/OFL-Cormorant.txt',ofl);files.add('render/fonts/OFL-Cormorant.txt');
const manifest=[];for(const file of [...files].sort()){const bytes=await readFile(dest+'/'+file);manifest.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),licence:file.includes('/fonts/caps/')||file.includes('/OFL-')?'OFL-1.1':'MIT',modified:file.endsWith('manifest.json')});}
await writeFile(dest+'/manifest.json',JSON.stringify({upstream:'https://github.com/azlen/initialis',revision,assetVersion:revision+'-subset-1',fontNoticeSource:'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt',files:manifest},null,2)+'\n');
console.log(JSON.stringify({files:files.size,bytes:manifest.reduce((n,f)=>n+f.bytes,0),settings:schema.length,kinds:requested}));

const transport=await readFile('public/vendor/initialis/worker.mjs');await writeFile('public/vendor/initialis/transport-manifest.json',JSON.stringify({assetVersion:revision+'-subset-1',path:'worker.mjs',bytes:transport.length,sha256:createHash('sha256').update(transport).digest('hex')},null,2)+'\n');
