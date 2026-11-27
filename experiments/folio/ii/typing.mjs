// Run from the repository root. Both fixtures use the same real Flint benchmark and Chrome.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(here,'../../..');
const trials=[];
for(const [i,edition] of ['I','II','II','I'].entries()){
  const fixture=path.join(here,edition==='I'?'../generated/bert.ink':'generated/bert.ink');
  const out=path.join(here,'../work/ii-benchmark-'+i);
  execFileSync(process.execPath,['scripts/benchmark-flint-typing-browser.mjs'],{cwd:repo,stdio:'inherit',env:{...process.env,
    BENCHMARK_OUTPUT:out,BENCHMARK_DOCUMENT_PATH:fixture,BENCHMARK_COMPACT:'1',BENCHMARK_SKIP_SCREENSHOT:'1',BENCHMARK_SKIP_CPU_PROFILE:'1'}});
  const {result}=JSON.parse(await readFile(path.join(out,'results.json')));
  const {sync,settled,frame,restored,paragraphs,characters,snapshots,serviceRequests,workerStarts}=result;
  if(!restored||snapshots||serviceRequests||workerStarts)throw Error('Unexpected Flint benchmark work');
  trials.push({edition,sync,settled,frame,restored,paragraphs,characters,snapshots,serviceRequests,workerStarts});
}
await writeFile(path.join(here,'evidence/typing.json'),JSON.stringify(trials,null,2)+'\n');
