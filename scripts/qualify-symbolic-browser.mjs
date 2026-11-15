import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
/** Actual Chromium interactions in the real Flint mount, using a disposable in-memory fixture. */
export async function qualifySymbolic({send,evaluate,sessionId,artifacts}) {
 const key=async(key,code=key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:({Backspace:8,Delete:46,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40})[key]??0},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:({Backspace:8,Delete:46,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40})[key]??0},sessionId);};
 const select=async(a,b=a)=>evaluate(`proof.mount.focus();proof.mount.restoreInlineSelection({anchor:${a},head:${b}})`);
 const selection=()=>evaluate('proof.mount.captureInlineSelection()');
 const frame=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await evaluate(`(async()=>{
  const {symbolicFixture,fixtureAttribute}=await import('/src/demo/symbolic-attributes-fixture.ts');
  proof.attribute=fixtureAttribute;proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,symbolicFixture.children[0].text);
  proof.editor.commands.setPayloadField(proof.text.key,'standoffProperties',symbolicFixture.children[0].standoffProperties);
  proof.editor.symbolicAttributes.set(fixtureAttribute,'Lewis Carroll');
  proof.canonical=()=>JSON.stringify({text:proof.mount.captureText(),properties:proof.text.payload.standoffProperties,keys:[...proof.text.inlineContent],revision:proof.editor.repository.state.revision});
  proof.update=v=>proof.editor.symbolicAttributes.set(proof.attribute,v);
 })()`);await frame();
 const before=await evaluate('proof.canonical()');
 const geometry=[];
 for(const value of ['Lewis Carroll','L. Carroll','Charles Lutwidge Dodgson','iiiiiiiiiiiii','WWWWWWWWWWWWW',null]){
  await evaluate(`proof.update(${value===null?'undefined':JSON.stringify(value)})`);await frame();
  assert.equal(await evaluate('proof.canonical()'),before);
  geometry.push(await evaluate(`(()=>{const atom=proof.flow.querySelector('[data-symbolic-display]'),r=atom.getBoundingClientRect(),alice=proof.flow.children[20].getBoundingClientRect();return {value:${JSON.stringify(value)},display:atom.textContent,atomWidth:r.width,aliceX:alice.left,aliceY:alice.top,underlinePaths:[...proof.mount.root.querySelectorAll('path[data-property-type="style/rectangle"], [data-property-type="style/rectangle"] path')].map(p=>p.getAttribute('d'))}})()`));
 }
 assert.notEqual(geometry[3].aliceX,geometry[4].aliceX,'same count, different glyph widths must reflow downstream cells');
 assert.notDeepEqual(geometry[3].underlinePaths,geometry[4].underlinePaths,'annotation SVG must follow changed glyph widths');
 await evaluate(`proof.update('L. Carroll')`);await frame();
 await select(0);await key('ArrowRight');assert.deepEqual(await selection(),{anchor:13,head:13});
 await key('ArrowLeft','ArrowLeft',8);assert.deepEqual(await selection(),{anchor:13,head:0});
 await select(13);await key('Backspace');assert.deepEqual(await selection(),{anchor:13,head:0});assert.equal(await evaluate('proof.mount.captureText()'),'Lewis Carroll wrote Alice.');
 await key('Backspace');assert.equal(await evaluate('proof.mount.captureText()'),' wrote Alice.');await evaluate('proof.editor.repository.undo()');
 // Native word navigation and vertical navigation must never expose interior source caret stops.
 const navigation=[];
 for(const [at,k,mod] of [[0,'ArrowRight',2],[13,'ArrowLeft',2],[0,'ArrowDown',0],[13,'ArrowUp',0]]){
  await select(at);await key(k,k,mod);await frame();const s=await selection();if(s)assert.ok(!((s.head>0&&s.head<13)||(s.anchor>0&&s.anchor<13)));navigation.push({at,key:k,modifiers:mod,selection:s});
 }
 const rect=await evaluate(`(()=>{const r=proof.flow.querySelector('[data-symbolic-display]').getBoundingClientRect();return {x:r.left+r.width*.8,y:r.top+r.height*.5}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect},sessionId);
 assert.deepEqual(await selection(),{anchor:13,head:13});
 // Native IME synthesis creates and commits actual composition DOM.
 await select(13);await send('Input.imeSetComposition',{text:'漢',selectionStart:1,selectionEnd:1},sessionId);
 await evaluate(`proof.update('Charles Lutwidge Dodgson')`);
 assert.equal(await evaluate('proof.mount.captureText()'),'Lewis Carroll wrote Alice.');
 await send('Input.insertText',{text:'漢'},sessionId);await frame();
 assert.equal(await evaluate('proof.mount.captureText()'),'Lewis Carroll漢 wrote Alice.');
 await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate('proof.mount.captureText()'),'Lewis Carroll wrote Alice.');
 // Reverse mouse drag selects the complete atom, never an interior source suffix.
 await evaluate("proof.editor.crossText.enable(true);proof.update('L. Carroll')");await frame();
 const points=await evaluate(`(()=>{const a=proof.flow.children[24].getBoundingClientRect(),b=proof.flow.querySelector('[data-symbolic-display]').getBoundingClientRect();return {a:{x:a.right-1,y:a.top+a.height/2},b:{x:b.left+2,y:b.top+b.height/2}}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...points.a},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...points.b},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...points.b},sessionId);
 const dragged=await selection();assert.equal(dragged.head,0);assert.ok(dragged.anchor>=20);
 // Verify font invalidation and width-driven wrapping through existing layout hooks.
 const layout=await evaluate(`(async()=>{
  const surface=proof.flow.parentElement;
  const path=()=>[...proof.mount.root.querySelectorAll('path[data-property-type="style/rectangle"], [data-property-type="style/rectangle"] path')].map(p=>p.getAttribute('d')).join('|');
  const original=path();proof.flow.style.fontSize='28px';
  const {notifyFontLayoutChange}=await import('/src/rendering/font-layout.ts');notifyFontLayoutChange(proof.mount.root);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const font=path();
  surface.style.width='190px';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const wrap=path();
  const parent=proof.flow.closest('.reactive-tabs__panel');const beforeScroll=path();if(parent){parent.style.maxHeight='210px';parent.style.overflow='auto';parent.scrollTop=40;}
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const afterScroll=path();
  surface.style.width='';proof.flow.style.fontSize='';notifyFontLayoutChange(proof.mount.root);
  return {original,font,wrap,scrollPathStable:beforeScroll===afterScroll};
 })()`);assert.notEqual(layout.original,layout.font);assert.notEqual(layout.font,layout.wrap);assert.equal(layout.scrollPathStable,true);await frame();
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'symbolic-prototype.png'),Buffer.from(screenshot.data,'base64'));
 await writeFile(path.join(artifacts,'symbolic-qualification.json'),JSON.stringify({geometry,navigation,dragged,layout,atomicNavigation:true,firstDeleteSelects:true,canonicalUndo:true,mouseBoundary:true,chromiumComposition:true},null,2));
 console.log('Symbolic Chromium qualification passed: geometry, arrows, word/vertical boundaries, first-delete-selects, mouse and IME.');
}
