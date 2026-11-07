// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {conversation,continuation,providerTurn,repair} from './providers';
import {schemaFor} from '../../src/features/dialectic/dcp/provider-schema';
import {plainContribution,sse,streamFixture} from './fixtures';
import {defaultProviderSettings,type Provider} from '../../src/features/dialectic/dcp/provider-contract';
const request={exchange:'exchange',protocolKey:{text:'Use DCP; semantic markup is optional.'}};
it.each(['openai','anthropic'] as Provider[])('%s sends strict schemas with every required field defined and every reference resolvable',async provider=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(conversation({...defaultProviderSettings,provider},request),'fixture-only-key',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 const schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 const check=(root:any)=>{
  const walk=(value:any,path:string)=>{
   if(!value||typeof value!=='object')return;
   if(value.type==='object'){
    expect(value.additionalProperties,path).toBe(false);
    expect([...value.required].sort(),path).toEqual(Object.keys(value.properties).sort());
   }
   if(value.$ref)expect(root.$defs?.[value.$ref.replace('#/$defs/','')],path).toBeDefined();
   for(const [key,child] of Object.entries(value))walk(child,path+'/'+key);
  };
  walk(root,'schema');
 };
 check(schema);
 for(const tool of body.tools)check(provider==='openai'?tool.parameters:tool.input_schema);
 expect(schema.$defs.LocalEntity.properties.description).toEqual({type:'string'});
});
it.each(['openai','anthropic'] as Provider[])('%s streams structured output and continues native tool calls without hosted history',async provider=>{
 const state=conversation({...defaultProviderSettings,provider,model:'configured-model'},request),signal=new AbortController().signal;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'call-1',name:'read_source',arguments:{handle:'source-1'}}))).mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const a=await providerTurn(state,'secret-fixture',signal,()=>{},fetcher);expect(a.calls).toHaveLength(1);continuation(state,a.calls,[{status:'complete',text:'Saturday?'}]);
 const chunks:string[]=[];const b=await providerTurn(state,'secret-fixture',signal,t=>chunks.push(t),fetcher);expect(JSON.parse(b.text).composition[0].markup).toContain('picnic');expect(b.receipt.usage?.output_tokens).toBe(20);expect(b.receipt.cost.status).toBe('unknown');expect(chunks.at(-1)).toBe(b.text);
 const body=JSON.parse(String(fetcher.mock.calls[1][1]?.body));expect(body.previous_response_id).toBeUndefined();expect(JSON.stringify(body)).toContain('Saturday?');expect(JSON.stringify(body)).not.toContain('secret-fixture');expect(body.model).toBe('configured-model');
 if(provider==='openai'){expect(body.store).toBe(false);expect(body.input.some((v:any)=>v.type==='function_call_output'&&v.call_id==='call-1')).toBe(true);expect(body.text.format.strict).toBe(true);}else{expect(body.messages.at(-1).content[0].tool_use_id).toBe('call-1');expect(body.output_config.format.type).toBe('json_schema');}
 repair(state);expect(JSON.stringify(state.input.at(-1))).toContain('corrected complete contribution');
});
it.each(['openai','anthropic'] as Provider[])('%s rejects token limits, refusals, truncated streams and arbitrary tools',async provider=>{
 const state=()=>conversation({...defaultProviderSettings,provider,model:'m'},request),signal=new AbortController().signal;
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(streamFixture(provider,'partial',undefined,provider==='openai'?'incomplete':'max_tokens')))).rejects.toThrow('incomplete');
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(streamFixture(provider,'').slice(0,-1)))).rejects.toThrow('interrupted');
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(streamFixture(provider,'',{id:'bad',name:'shell',arguments:{}})))).rejects.toThrow('Unsupported provider tool');
 const refused=provider==='openai'?[{type:'response.refusal.delta',delta:'no'}]:streamFixture(provider,'',undefined,'refusal');await expect(providerTurn(state(),'secret',signal,()=>{},async()=>sse(refused))).rejects.toThrow('declined');
});
it('bounds stream bytes and hides upstream credentials and errors without retries',async()=>{
 const state=()=>conversation({...defaultProviderSettings,model:'m'},request),signal=new AbortController().signal;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('secret upstream diagnostic',{status:429}));await expect(providerTurn(state(),'secret',signal,()=>{},fetcher)).rejects.toThrow('rate limit');expect(fetcher).toHaveBeenCalledTimes(1);
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>{throw Error('Bearer secret');})).rejects.toThrow('Provider connection failed');
 await expect(providerTurn(state(),'secret',signal,()=>{},async()=>new Response('x'.repeat(1048577)))).rejects.toThrow('byte budget');
});
it('compiles Anthropic schema without recursive references while retaining all core Block families',()=>{
 const schema=schemaFor('anthropic'),complete=new Set<string>();const walk=(v:any,seen=new Set<string>())=>{if(!v||typeof v!=='object')return;if(v.$ref){expect(seen.has(v.$ref),'recursive '+v.$ref).toBe(false);if(!complete.has(v.$ref)){walk(schema.$defs[v.$ref.split('/').at(-1)],new Set([...seen,v.$ref]));complete.add(v.$ref);}}else for(const [k,x]of Object.entries(v))if(k!=='$defs')walk(x,seen);};walk(schema);expect(schema.$defs.Table0).toBeTruthy();expect(schema.$defs.Node12.$ref).toBe('#/$defs/Paragraph');expect(schema.properties.intent.enum).toEqual(expect.arrayContaining(['reply','acknowledge','share','create']));
});
it.each([401,403])('distinguishes HTTP %s without leaking a key echoed by the provider',async status=>{
 const state=conversation({...defaultProviderSettings,model:'m'},request),code=status===401?'invalid_api_key':'permission_error';
 let message='';try{await providerTurn(state,'secret-fixture',new AbortController().signal,()=>{},async()=>new Response(JSON.stringify({error:{code,message:'Incorrect API key secret-fixture'}}),{status}));}catch(e){message=(e as Error).message;}
 expect(message).toContain('HTTP '+status);expect(message).toContain(code);expect(message).not.toContain('secret-fixture');expect(message).toContain(status===401?'authentication failed':'access denied');
});
