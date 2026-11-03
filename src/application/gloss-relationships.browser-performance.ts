import {ReactiveEditor} from '../reactive-editor/editor';
/** Isolated browser CPU measurements: two projections, one registry, no synthetic settling frames. */
export async function relationshipScaling(){
 const results:any[]=[];
 for(const degree of [1,4,16]){const count=400,registry=Object.fromEntries(Array.from({length:count},(_,i)=>{const id='g'+i;return[id,{id,type:'mutable/gloss',value:'note: Reasoning '+i,metadata:{gloss:{version:1,localId:id,links:Object.fromEntries(Array.from({length:degree},(_,j)=>['e'+i+'-'+j,{version:1,type:'supports',toGlossId:'g'+((i+j+1)%count)}]))}}}];}));
  const e=new ReactiveEditor({id:'scale',type:'document-block',linkedAnnotations:registry,children:[{id:'text',type:'standoff-editor-block',text:'Benchmark text'}]});
  try{const v=e.createView('one'),other=e.createView('two'),owner=v.node(v.state.rootKey)!.contentKey,s=e.glossRelationships,g=s.document(owner);let historyMs=0,projectionMs=0,indexMs=0,history:any;
   const storage=(e.repository as any).historyStorage,store=storage.store;storage.store=function(...args:any[]){const start=performance.now();const result=store.apply(this,args);historyMs+=performance.now()-start;history=result;return result;};
   for(const view of [v,other]){const set=(view as any).setState;(view as any).setState=function(...args:any[]){const start=performance.now(),result=set.apply(this,args);projectionMs+=performance.now()-start;return result;};}
   const apply=g.apply;g.apply=function(...args:Parameters<typeof apply>){const start=performance.now(),result=apply.apply(this,args);indexMs+=performance.now()-start;return result;};
   const samples:any[]=[];for(let i=0;i<5;i++){historyMs=projectionMs=indexMs=0;const before={...g.diagnostics},started=performance.now();s.create(owner,'g0','measurement-'+i,'g200');const callMs=performance.now()-started;samples.push({...s.timing,callMs,historyMs,projectionMs,indexMs,historyBytes:new TextEncoder().encode(JSON.stringify(history)).length,decoded:g.diagnostics.edgeDecodes-before.edgeDecodes,evaluated:g.diagnostics.edgeEvaluations-before.edgeEvaluations});e.repository.undo();await new Promise(r=>setTimeout(r,10));}
   const median=(key:string)=>samples.map(s=>s[key]).sort((a,b)=>a-b)[2];results.push({glosses:count,edges:count*degree,projections:2,median:Object.fromEntries(Object.keys(samples[0]).map(k=>[k,median(k)])),samples});
  }finally{e.dispose();}
 }
 return results;
}
