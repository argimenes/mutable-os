// @vitest-environment jsdom
import {afterEach,it,expect,vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {ProviderSettingsView} from './provider-settings';
import {DialecticProviderSession} from './dcp/live';
import {defaultProviderSettings,providerSettings} from './dcp/provider-contract';
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).forEach(f=>f());vi.unstubAllGlobals();localStorage.clear();});
it('accepts 16000 and makes unapplied settings distinct from the active budget',()=>{
 const [active]=createSignal({...defaultProviderSettings,maxOutputTokens:2048}),configure=vi.fn();
 const c:any={providerSettings:active,editor:{features:{}},busy:()=>false,providerConfiguring:()=>false,aiParticipants:()=>[],providerNotice:()=>'',configureProvider:configure,forgetProvider:vi.fn()};
 const host=document.createElement('div');document.body.append(host);clean.push(render(()=> <ProviderSettingsView c={c}/>,host),()=>host.remove());
 const input=host.querySelector<HTMLInputElement>('[aria-label="Maximum output tokens"]')!;input.value='16000';input.dispatchEvent(new Event('input',{bubbles:true}));
 expect(input.checkValidity()).toBe(true);expect(host.querySelector('summary')!.textContent).toContain('2,048');expect(host.textContent).toContain('not applied yet');
 host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));expect(configure.mock.calls[0][0].maxOutputTokens).toBe(16000);
 expect(providerSettings({...defaultProviderSettings,maxOutputTokens:16000}).maxOutputTokens).toBe(16000);expect(()=>providerSettings({...defaultProviderSettings,maxOutputTokens:16385})).toThrow('16384');
});
it('retains only accepted nonsecret preferences across reload without restoring credential readiness',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>String(url).endsWith('/session')?Response.json({token:'session-secret'}):Response.json({settings:JSON.parse(init.body).settings,ready:true})));
 const first=new DialecticProviderSession();clean.push(()=>first.dispose());await first.configure({...defaultProviderSettings,maxOutputTokens:16000},'key-secret');
 const saved=JSON.stringify({...localStorage});expect(saved).not.toContain('key-secret');expect(saved).not.toContain('session-secret');
 const next=new DialecticProviderSession();clean.push(()=>next.dispose());expect(next.settings.maxOutputTokens).toBe(16000);expect(next.ready).toBe(false);
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:'Rejected settings'},{status:400}));await expect(first.configure({...defaultProviderSettings,maxOutputTokens:1024})).rejects.toThrow('Rejected settings');expect(first.settings.maxOutputTokens).toBe(16000);
});
