// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {installMermaidNavigation,generatedNodeToken,selectionMessage} from './mermaid-navigation';
import {diagramFrame} from './mermaid-view';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();document.body.replaceChildren();});
it('recognises allowlisted generated nodes only; nested labels and keyboard select without accepting edges',()=>{
 document.body.innerHTML='<svg><g class="node" id="diagram-flowchart-G0-0"><rect class="label-container"/><text><tspan>Evidence</tspan></text></g><g class="node" id="flowchart-G1-8"><text>Thesis</text></g><g class="edgeLabel"><text>supports</text></g></svg>';
 const root=document.querySelector('svg')!,send=vi.spyOn(window,'postMessage').mockImplementation(()=>{}),stop=installMermaidNavigation(root,{token:'nonce',nodes:{G0:'Evidence <img onerror=alert(1)>',G1:'Thesis'}}),node=root.querySelector('g')!;
 expect(node.getAttribute('tabindex')).toBe('0');expect(node.getAttribute('role')).toBe('button');expect(node.getAttribute('aria-label')).toContain('<img');expect(root.querySelector('img')).toBeNull();
 node.querySelector('tspan')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));node.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
 root.querySelector('.edgeLabel text')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));root.dispatchEvent(new MouseEvent('click',{bubbles:true}));node.dispatchEvent(new KeyboardEvent('keydown',{key:'g',ctrlKey:true,bubbles:true}));
 expect(send.mock.calls.map(c=>c[0])).toEqual([1,2,3].map(sequence=>({kind:'gloss-node-select',token:'nonce',node:'G0',sequence})));
 window.dispatchEvent(new MessageEvent('message',{source:window,data:{kind:'gloss-node-selected',token:'nonce',node:'G0'}}));expect(node.classList.contains('mutable-gloss-selected')).toBe(true);
 window.dispatchEvent(new MessageEvent('message',{source:window,data:{kind:'gloss-node-selected',token:'wrong',node:'G1'}}));expect(node.getAttribute('aria-pressed')).toBe('true');
 stop();node.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(send).toHaveBeenCalledTimes(3);
});
it('fails closed for unknown and duplicate SVG identities and supports an allowlisted data-id',()=>{
 document.body.innerHTML='<svg><g class="node" id="unrecognised"/><g class="node" id="x-flowchart-G0-0"/><g class="node" id="x-flowchart-G0-1"/><g class="node" data-id="G1"/></svg>';
 const root=document.querySelector('svg')!,stop=installMermaidNavigation(root,{token:'n',nodes:{G0:'A',G1:'B'}});expect(root.querySelectorAll('[tabindex]')).toHaveLength(1);expect(generatedNodeToken(root.children[0],new Set(['G0']))).toBeUndefined();stop();
});
it('strictly validates message schema, nonce, allowlist and monotonic sequence',()=>{
 const good={kind:'gloss-node-select',token:'n',node:'G0',sequence:1},allowed=new Set(['G0']);expect(selectionMessage(good,'n',allowed,0)).toBe(true);
 for(const bad of [null,[],{...good,extra:1},{...good,token:'old'},{...good,node:'G7'},{...good,node:'javascript:alert(1)'},{...good,sequence:1.5},{...good,sequence:0},{...good,kind:'other'}])expect(selectionMessage(bad,'n',allowed,0)).toBe(false);
 expect(selectionMessage(good,'n',allowed,1)).toBe(false);
});
it('authenticates exact frame, ready state, nonce and sequence; abort rejects old messages and selection never completes a render',async()=>{
 vi.spyOn(window,'fetch').mockResolvedValue(new Response('/* fixture bundle */'));const host=document.body.appendChild(document.createElement('div')),controller=new AbortController(),done=vi.fn(),selected=vi.fn();
 const dispose=await diagramFrame(host,'flowchart TD\nG0["a"]',controller.signal,done,{navigation:{nodes:{G0:'a'},onSelect:selected}}),frame=host.querySelector('iframe')!,source=frame.contentWindow!,token=frame.srcdoc.match(/"token":"([^"]+)"/)![1];
 const post=(data:any,from:MessageEventSource=source)=>window.dispatchEvent(new MessageEvent('message',{source:from,data})),message={kind:'gloss-node-select',token,node:'G0',sequence:1};
 expect(frame.getAttribute('sandbox')).toBe('allow-scripts');expect(frame.srcdoc).toContain("connect-src 'none'");expect(frame.srcdoc).not.toContain('allow-same-origin');post(message);expect(selected).not.toHaveBeenCalled();
 post({token,ok:true,extra:'bad'});expect(done).not.toHaveBeenCalled();post({token,ok:true});expect(done).toHaveBeenCalledTimes(1);
 post(message,window);post({...message,token:'old'});post({...message,node:'G3'});post({...message,extra:1});expect(selected).not.toHaveBeenCalled();post(message);post(message);expect(selected).toHaveBeenCalledTimes(1);expect(done).toHaveBeenCalledTimes(1);
 const send=vi.spyOn(source,'postMessage');dispose.selectNode('G0');expect(send).toHaveBeenCalledWith({kind:'gloss-node-selected',token,node:'G0'},'*');controller.abort();post({...message,sequence:2});dispose.selectNode('G0');expect(selected).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
});
it('render errors and timeouts dispose selection listeners and preserve the source fallback contract',async()=>{
 vi.useFakeTimers();vi.spyOn(window,'fetch').mockResolvedValue(new Response(''));const host=document.body.appendChild(document.createElement('div')),done=vi.fn(),selected=vi.fn();
 const first=await diagramFrame(host,'flowchart TD\nG0["a"]',new AbortController().signal,done,{navigation:{nodes:{G0:'A'},onSelect:selected}}),frame=host.querySelector('iframe')!,source=frame.contentWindow!,token=frame.srcdoc.match(/"token":"([^"]+)"/)![1];
 window.dispatchEvent(new MessageEvent('message',{source,data:{token,error:'failure'}}));expect(done).toHaveBeenCalledWith('failure');expect(host.children).toHaveLength(0);window.dispatchEvent(new MessageEvent('message',{source,data:{token,ok:true}}));expect(done).toHaveBeenCalledTimes(1);first();
 await diagramFrame(host,'flowchart TD\nG0["a"]',new AbortController().signal,done);await vi.advanceTimersByTimeAsync(8001);expect(done).toHaveBeenLastCalledWith(expect.stringContaining('8 seconds'));expect(host.children).toHaveLength(0);expect(selected).not.toHaveBeenCalled();
});
