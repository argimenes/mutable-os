// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {conversation,continuation,providerTurn,repair} from './providers';
import {schemaFor} from '../../src/features/dialectic/dcp/provider-schema';
import {plainContribution,sse,streamFixture} from './fixtures';
import {defaultProviderSettings,type Provider} from '../../src/features/dialectic/dcp/provider-contract';
const request={exchange:'exchange',protocolKey:{text:'Use DCP; semantic markup is optional.'}};
it.each(['openai','anthropic'] as Provider[])('%s advertises negotiated catalogue discovery and continues its results',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,capabilities:{version:1,items:[]},legend:{tools:['describe_capabilities']}});
 const fetcher=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'catalogue',name:'describe_capabilities',arguments:{ids:['composition.table','semantic.gloss']}})))
  .mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const signal=new AbortController().signal,turn=await providerTurn(state,'fixture',signal,()=>{},fetcher);
 expect(turn.calls[0].tool).toBe('describe_capabilities');
 continuation(state,turn.calls,[{status:'complete',items:[{id:'composition.table',authorable:true}]}]);
 await providerTurn(state,'fixture',signal,()=>{},fetcher);
 for(const [,init]of fetcher.mock.calls){const body=JSON.parse(String(init?.body)),tool=body.tools.find((t:any)=>t.name==='describe_capabilities');expect(tool).toBeDefined();expect(tool.parameters??tool.input_schema).toMatchObject({required:['ids'],additionalProperties:false,properties:{ids:{maxItems:4}}});}
 expect(String(fetcher.mock.calls[1][1]?.body)).toContain('authorable');
 const disabled=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,'',{id:'unadvertised',name:'describe_capabilities',arguments:{ids:['composition.table']}})));
 await expect(providerTurn(conversation({...defaultProviderSettings,provider},request),'fixture',signal,()=>{},disabled)).rejects.toThrow('Unadvertised');
 expect(JSON.parse(String(disabled.mock.calls[0][1]?.body)).tools.map((t:any)=>t.name)).not.toContain('describe_capabilities');
});
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
it('sends bounded repair diagnostics and preserves native intent without forwarding raw error text',()=>{
 const state=conversation({...defaultProviderSettings},request);
 repair(state,{code:'source',path:'$.anchors[1]',message:'secret credential or source text'});
 const content=state.input.at(-1).content;expect(content).toContain('$.anchors[1]');expect(content).toContain('unambiguous prefix/suffix');expect(content).toContain('preserve valid requested addressing');expect(content).not.toContain('secret credential');expect(content).not.toContain('Prefer plain paragraphs');
 repair(state,{code:'arbitrary secret',path:'$.secret'});expect(state.input.at(-1).content).not.toContain('arbitrary secret');expect(state.input.at(-1).content).not.toContain('$.secret');
});
it('reports context exhaustion explicitly without retrying or leaking provider text',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{code:'context_length_exceeded',message:'private source and credential'}},{status:400}));
 await expect(providerTurn(conversation(defaultProviderSettings,request),'fixture',new AbortController().signal,()=>{},fetcher)).rejects.toThrow('History was not truncated and no stateless retry was sent');expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['openai','anthropic'] as Provider[])('%s keeps inventory and source tools available across successive continuations',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},request),signal=new AbortController().signal;
 const fetcher=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'list',name:'list_text_blocks',arguments:{cursor:null,limit:1,contributionId:null,participantId:null,fromOrdinal:1}})))
  .mockResolvedValueOnce(sse(streamFixture(provider,'',{id:'read',name:'read_source',arguments:{handle:'fresh'}})))
  .mockResolvedValueOnce(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 const first=await providerTurn(state,'fixture',signal,()=>{},fetcher);continuation(state,first.calls,[{items:[{handle:'fresh',blockId:'native-block',readRequired:true}]}]);
 const second=await providerTurn(state,'fixture',signal,()=>{},fetcher);expect(second.calls[0].tool).toBe('read_source');continuation(state,second.calls,[{status:'complete',handle:'fresh',revision:'current',text:'Garden.'}]);
 const final=await providerTurn(state,'fixture',signal,()=>{},fetcher);expect(final.calls).toEqual([]);expect(JSON.parse(final.text).kind).toBe('contribution');
 for(const [,init]of fetcher.mock.calls.slice(1)){const body=JSON.parse(String(init?.body));expect(body.tools.map((t:any)=>t.name)).toContain('list_text_blocks');expect(body.instructions??body.system).toContain('Further advertised tool calls remain available');}
});

it.each(['gpt-5.4-mini','gpt-5.4-mini-2026-03-17','gpt-4.1','custom-model'])('configures bounded native-authoring reasoning only for the qualified Mini model: %s',async model=>{
 const state=conversation({...defaultProviderSettings,model},request),fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture('openai',JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture-key',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body.reasoning).toEqual(model.startsWith('gpt-5.4-mini')?{effort:'low'}:undefined);expect(body.max_output_tokens).toBe(defaultProviderSettings.maxOutputTokens);
});

it.each(['openai','anthropic'] as Provider[])('%s sends source-operation requirements on the initial turn, after conversational defaults',async provider=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(conversation({...defaultProviderSettings,provider},request),'fixture-key',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),instructions=body.instructions??body.system;
 expect(instructions.indexOf('REQUESTED SOURCE OPERATIONS')).toBeGreaterThan(instructions.indexOf('a short acknowledgement is valid'));
 expect(instructions).toContain('Before declaring the passage unavailable, use list_text_blocks or search_symposium');
 expect(instructions).toContain('read_source to obtain its current text and revision');
 expect(instructions).toContain('Do not ask the participant for a source handle');
 expect(instructions).toContain('participant and contribution chronology');
 expect(instructions).toContain('including when you authored it yourself');
 expect(instructions).toContain('Reproducing those quotations in composition is allowed');
 expect(instructions).toContain('does not substitute for native source anchoring');
 expect(instructions).toContain('Keep source anchor aliases distinct from any aliases on reproduced composition text');
 expect(body.tools.map((tool:any)=>tool.name).sort()).toEqual(['list_text_blocks','read_source','search_symposium']);
 expect(body.max_output_tokens??body.max_tokens).toBe(defaultProviderSettings.maxOutputTokens);
});

it.each(['openai','anthropic'] as Provider[])('%s negotiates Stage 1 schema without changing the disabled contract',async provider=>{
 const state=conversation({...defaultProviderSettings,provider},{...request,nativeAuthoring:1});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(sse(streamFixture(provider,JSON.stringify(plainContribution('exchange')))));
 await providerTurn(state,'fixture',new AbortController().signal,()=>{},fetcher);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body)),schema=provider==='openai'?body.text.format.schema:body.output_config.format.schema;
 expect(schema.$defs.Heading.properties.level).toEqual({type:'integer',minimum:1,maximum:6});expect(schema.$defs.YouTube.properties.url.maxLength).toBe(4096);
 expect(schemaFor(provider).$defs.Heading).toBeUndefined();
 const refs=new Set<string>();const walk=(value:any)=>{if(!value||typeof value!=='object')return;if(value.$ref)refs.add(value.$ref.slice('#/$defs/'.length));Object.values(value).forEach(walk);};walk(schema);
 for(const name of refs)expect(schema.$defs[name],name).toBeDefined();
 if(provider==='anthropic'){expect(schema.$defs.Node).toBeUndefined();expect(schema.$defs.Grid0).toBeDefined();expect(schema.$defs.Node12.anyOf.map((r:any)=>r.$ref)).toEqual(expect.arrayContaining(['#/$defs/Paragraph','#/$defs/Heading','#/$defs/YouTube']));}
});
