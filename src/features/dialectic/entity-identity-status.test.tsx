// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {EntityIdentityStatus} from './entity-identity-status';
import type {EntityAuthorityState} from '../../application/entity-authority-resolution';
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());document.body.innerHTML='';});
it('keeps the committed link visible while checking, reports failures, and clears it when the local association is undone',()=>{
 const [definition,setDefinition]=createSignal<any>({metadata:{scopedEntity:{entity:{name:'Bologna'}}}}),[state,setState]=createSignal<EntityAuthorityState>(),[unsaved,setUnsaved]=createSignal(true),open=vi.fn();
 const host=document.body.appendChild(document.createElement('div'));clean.push(render(()=><EntityIdentityStatus definition={definition()} state={state()} unsaved={unsaved()} opening={false} open={open}/>,host));
 expect(host.textContent).toContain('No database link recorded in this Document');
 setDefinition({metadata:{scopedEntity:{entity:{name:'Bologna'},identityAssociation:{method:'user-confirmed',entityId:'sql-bologna',vaultId:'cavern'}}}});setState({status:'pending'});
 expect(host.textContent).toContain('Linked to database Entity');expect(host.textContent).toContain('sql-bologna');expect(host.textContent).toContain('database link is already committed');
 setState({status:'unavailable',message:'The linked Entity belongs to another Cavern'});
 expect(host.textContent).toContain('Database link recorded — verification unavailable');expect(host.textContent).toContain('another Cavern');expect(host.textContent).not.toContain('Not linked');
 setState({status:'linked',canonical:{id:'different',name:'Wrong target',revision:0,aliases:[]}});expect(host.textContent).not.toContain('Wrong target');
 setState({status:'linked',canonical:{id:'sql-bologna',name:'Bologna (canonical)',revision:0,aliases:[]}});expect(host.textContent).toContain('Bologna (canonical)');host.querySelector('button')!.click();expect(open).toHaveBeenCalledOnce();
 setUnsaved(false);expect(host.textContent).not.toContain('Unsaved Document changes');
 setDefinition({metadata:{scopedEntity:{entity:{name:'Bologna'}}}});expect(host.textContent).toContain('No database link recorded in this Document');expect(host.querySelector('button')).toBeNull();
});
