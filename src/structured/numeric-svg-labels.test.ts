// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {decodeNumericSvgLabels} from './numeric-svg-labels';
it('decodes wrapped numeric labels once into existing text nodes, never HTML',()=>{const root=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><text><tspan>&amp;#6</tspan><tspan>0;script&amp;#62; &amp;#128512; &amp;#38;#60; &amp;#9999999;</tspan></text></svg>','image/svg+xml').documentElement,nodes=[...root.querySelectorAll('tspan')];decodeNumericSvgLabels(root);expect(root.querySelector('text')!.textContent).toBe('<script> 😀 &#60; &#9999999;');expect(root.querySelector('script')).toBeNull();expect([...root.querySelectorAll('tspan')]).toEqual(nodes);});
