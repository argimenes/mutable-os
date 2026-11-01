import {readFile,writeFile} from 'node:fs/promises';
const distribution=values=>{const a=[...values].sort((a,b)=>a-b);return {n:a.length,median:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};};
const output={};for(const path of ['direct','solid']){
 const r=JSON.parse(await readFile(`artifacts/initialis-adapter/${path}/results.json`));
 output[path]={checks:r.checks.length,failed:r.checks.filter(c=>!c.passed),coldReadyMs:r.keyboardReadyMs,stress:r.stress,performance:{},handlers:{},errors:r.errors};
 for(const variant of ['static','cached','background']){
  const samples=r.performance.filter(p=>p.variant===variant),handlers=r.handlers.filter(p=>p.variant===variant);
  output[path].performance[variant]={eventTiming:distribution(samples.flatMap(p=>p.events.map(e=>e.duration))),firstRaf:distribution(samples.flatMap(p=>p.marks.map(e=>e.firstFrameMs))),roundP95:samples.map(p=>distribution(p.events.map(e=>e.duration)).p95),bounded:samples.every(p=>!p.counts.snapshots&&!p.counts.fullValidation&&!p.counts.broadPlanning&&!p.counts.projectionBuilds&&!p.counts.paragraphTextWalks&&!p.counts.unrelatedGeometry&&!p.counts.unrelatedMutations&&!p.stats.hashes&&!p.stats.workers&&!p.assetRequests)};
  output[path].handlers[variant]={samples:handlers.flatMap(h=>h.samples)};
 }
}
await writeFile('artifacts/initialis-adapter/summary.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
