// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
import {createDialecticBroker} from './broker';
import {sse,streamFixture,plainContribution} from './fixtures';
import {defaultProviderSettings} from '../../src/features/dialectic/dcp/provider-contract';
const stops:(()=>Promise<void>|void)[]=[];afterEach(async()=>{for(const stop of stops.splice(0).reverse())await stop();});
async function fixture(fetcher:typeof fetch,environment:Record<string,string|undefined>={}){const broker=createDialecticBroker({fetcher,environment}),app=express();app.use('/broker',broker.router);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));stops.push(()=>broker.dispose(),()=>new Promise<void>(r=>server.close(()=>r())));const origin='http://127.0.0.1:'+(server.address() as any).port;let token='';
 const call=(p:string,body?:unknown,headers:Record<string,string>={},method='POST')=>fetch(origin+'/broker'+p,{method,headers:{origin,'content-type':'application/json','x-mutable-dialectic':'1','x-dialectic-session':token,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 token=(await(await call('/session')).json()).token;return {call,origin,token};}
const req={protocol:'dcp/1.0',profile:'4b-1',exchange:'exchange',protocolKey:{text:'Semantic markup is optional.'}};
it('uses server environment credentials without returning them to the browser',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const f=await fixture(fetcher,{OPENAI_API_KEY:'server-only-fixture-key'});
 const settings=await(await f.call('/settings',{settings:defaultProviderSettings})).text();expect(JSON.parse(settings).ready).toBe(true);expect(settings).not.toContain('server-only-fixture-key');
 const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const output=await(await f.call('/exchange/'+id+'/turn',{round:0})).text();expect(output).not.toContain('server-only-fixture-key');expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({authorization:'Bearer server-only-fixture-key'});
});
it('requires loopback matching Origin/Host, custom header and an origin-bound session',async()=>{
 const f=await fixture(vi.fn());expect((await f.call('/session',undefined,{origin:'http://evil.example'})).status).toBe(403);expect((await f.call('/session',undefined,{'x-mutable-dialectic':''})).status).toBe(403);expect((await f.call('/settings',{}, {'x-dialectic-session':'bad'})).status).toBe(401);expect((await f.call('/settings',{}, {origin:'http://localhost:'+new URL(f.origin).port})).status).toBe(403);
});
it('keeps keys session-only, bounds continuations/repair, rejects replay and forgets keys',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture('openai','',{id:'call-1',name:'read_source',arguments:{handle:'s'}}))).mockResolvedValueOnce(sse(streamFixture('openai','bad json'))).mockResolvedValueOnce(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 const f=await fixture(fetcher),settings={...defaultProviderSettings,model:'m'};let r=await f.call('/settings',{settings,key:'secret-fixture'});expect(await r.text()).not.toContain('secret-fixture');const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const round0=await(await f.call('/exchange/'+id+'/turn',{round:0})).text();expect(round0).toContain('call-1');expect(round0).not.toContain('secret-fixture');
 expect((await f.call('/settings',{settings})).status).toBe(400);
 const r1=await(await f.call('/exchange/'+id+'/turn',{round:1,results:[{id:'call-1',result:{status:'complete',text:'source'}}]})).text();expect(r1).toContain('bad json');
 const r2=await(await f.call('/exchange/'+id+'/turn',{round:2,repair:true})).text();expect(r2).toContain('picnic');expect((await f.call('/exchange/'+id+'/turn',{round:3,repair:true})).status).toBe(400);expect(fetcher).toHaveBeenCalledTimes(3);
 await f.call('/session',undefined,{},'DELETE');expect((await f.call('/settings',{settings})).status).toBe(401);
});
it('aborts an in-flight provider on explicit cancellation; never retries',async()=>{
 let aborted=false,started=false;const fetcher=vi.fn<typeof fetch>((_u,init)=>new Promise<Response>((_resolve,reject)=>{started=true;init?.signal?.addEventListener('abort',()=>{aborted=true;reject(Error('secret'));});}));
 const f=await fixture(fetcher);await f.call('/settings',{settings:{...defaultProviderSettings,model:'m'},key:'secret-fixture'});const id=(await(await f.call('/exchange',{request:req})).json()).id;
 const pending=f.call('/exchange/'+id+'/turn',{round:0}).then(r=>r.text());for(let i=0;i<50&&!started;i++)await new Promise(r=>setTimeout(r,5));await f.call('/exchange/'+id,undefined,{},'DELETE');expect(await pending).not.toContain('secret');expect(aborted).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
});

it('accepts the real Vite development proxy while rejecting foreign Origins',async()=>{
 const {createServer}=await import('vite'),config=(await import('../../vite.config')).default as any;
 const backend=await fixture(vi.fn());
 const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,proxy:{'/api/dialectic':{...config.server.proxy['/api/dialectic'],target:backend.origin,rewrite:(p:string)=>p.replace('/api/dialectic','/broker')}}}});await vite.listen();stops.push(()=>vite.close());
 const origin='http://127.0.0.1:'+(vite.httpServer!.address() as any).port;
 const post=(requestOrigin:string)=>fetch(origin+'/api/dialectic/session',{method:'POST',headers:{origin:requestOrigin,'x-mutable-dialectic':'1'}});
 expect((await post(origin)).status).toBe(200);expect((await post('http://evil.example')).status).toBe(403);
});
