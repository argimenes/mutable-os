// Paired trials with the repository's standard Flint benchmark and identical native text.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)), local=path.join(root,'experiments/folio');
const input=path.join(local,'generated/bert.ink'), baseline=JSON.parse(await readFile(input));
const work=path.join(local,'work');await mkdir(work,{recursive:true});
for(const block of baseline.document.blocks){
  if(block.properties.standoffProperties) block.properties.standoffProperties=block.properties.standoffProperties.filter(p=>p.type!=='spatial/source-run');
}
const without=path.join(work,'bert-no-spatial-ranges.ink');await writeFile(without,JSON.stringify(baseline));
const results=[];
for(const [trial,fixture] of [['withoutSourceRanges',without],['withSourceRanges',input],['withSourceRanges',input],['withoutSourceRanges',without]]){
  const dir=path.join(work,trial);
  execFileSync(process.execPath,['scripts/benchmark-flint-typing-browser.mjs'],{cwd:root,stdio:'inherit',env:{
    ...process.env,BENCHMARK_COMPACT:'1',BENCHMARK_SKIP_SCREENSHOT:'1',BENCHMARK_SKIP_CPU_PROFILE:'1',
    BENCHMARK_DOCUMENT_PATH:fixture,BENCHMARK_OUTPUT:dir}});
  const {result}=JSON.parse(await readFile(path.join(dir,'results.json')));
  const {sync,settled,frame,snapshots,serviceRequests,workerStarts,restored,paragraphs,characters}=result;
  results.push({trial,sync,settled,frame,snapshots,serviceRequests,workerStarts,restored,paragraphs,characters});
}
await writeFile(path.join(local,'evidence/typing.json'),JSON.stringify(results,null,2)+'\n');
