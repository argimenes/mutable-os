import {createSignal,For,Show} from 'solid-js';
import {defaultModel,modelPresets} from './model-presets';
import type {DialecticController} from './controller';
import type {Provider,ProviderSettings} from './dcp/provider-contract';

/** Shared compact controls; inherited Desktop/Textual chrome remains independent. */
export function ProviderSettingsView(props:{c:DialecticController}){
 const c=props.c,[settings,setSettings]=createSignal<ProviderSettings>({...c.providerSettings()});let key!:HTMLInputElement;
 const [custom,setCustom]=createSignal(!modelPresets[settings().provider].some(m=>m.id===settings().model));
 const change=(patch:Partial<ProviderSettings>)=>setSettings(v=>({...v,...patch}));
 return <details class="dialectic-provider-settings"><summary>AI settings</summary>
  <p>Keys entered here stay in the local server’s session memory. Server environment credentials remain available after reload or Forget keys. Nothing is saved in this Document.</p>
  <form onSubmit={e=>{e.preventDefault();const secret=key.value;key.value='';void c.configureProvider(settings(),secret||undefined);}}>
   <fieldset disabled={c.busy()||c.providerConfiguring()}>
    <label>Provider <select aria-label="AI provider" value={settings().provider} onChange={e=>{const provider=e.currentTarget.value as Provider;setCustom(false);change({provider,model:defaultModel(provider)});}}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label>
    <label>Model <select aria-label="AI model" value={custom()?'custom':settings().model} onChange={e=>{const value=e.currentTarget.value;setCustom(value==='custom');change({model:value==='custom'?'':value});}}><For each={modelPresets[settings().provider]}>{m=><option value={m.id}>{m.label}</option>}</For><option value="custom">Custom model…</option></select></label>
    <Show when={custom()}><label>Custom model ID <input aria-label="AI model ID" required maxLength={128} placeholder="Model supporting structured output and tools" value={settings().model} onInput={e=>change({model:e.currentTarget.value})}/></label></Show>
    <label>Session API key <input ref={key} aria-label="Session API key" type="password" autocomplete="off" spellcheck={false} maxLength={4096} placeholder="Leave blank to use a server key or retain the session key"/></label>
    <label>Maximum output tokens <input aria-label="Maximum output tokens" type="number" min="512" max="8192" step="1" value={settings().maxOutputTokens} onInput={e=>change({maxOutputTokens:Number(e.currentTarget.value)})}/></label>
    <label>Response length <select aria-label="Response length" value={settings().cadence} onChange={e=>change({cadence:e.currentTarget.value as ProviderSettings['cadence']})}><option value="conversational">Conversational</option><option value="extended">Extended when useful</option></select></label>
    <label><input type="checkbox" checked={settings().repair} onChange={e=>change({repair:e.currentTarget.checked})}/> Allow one validation repair (may incur another provider charge)</label>
    <button type="submit">Use session settings</button><button type="button" onClick={()=>{key.value='';void c.forgetProvider();}}>Forget keys</button>
   </fieldset>
  </form>
  <Show when={c.providerNotice()}><p role="status">{c.providerNotice()}</p></Show>
  <p>No request is sent until Ask or Submit &amp; Ask. Selected content and requested source reads are sent to the chosen provider. Cost is reported as unknown; the token limit is not a currency cap.</p>
 </details>;
}
