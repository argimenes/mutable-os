import type {Provider} from './dcp/provider-contract';
// Curated text/tool/structured-output choices, checked against official model
// documentation on 2026-11-07. Account access is established by the request.
export const modelPresets:Record<Provider,{id:string;label:string}[]>={
 openai:[{id:'gpt-5.4-mini',label:'GPT-5.4 Mini (default)'},{id:'gpt-5.4',label:'GPT-5.4'}],
 anthropic:[{id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5 (default)'},{id:'claude-haiku-5-5',label:'Claude Haiku 5.5'}],
};
export const defaultModel=(provider:Provider)=>modelPresets[provider][0].id;
