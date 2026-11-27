import {describe,expect,it,vi} from 'vitest';
import {LeafGateway,type Binding,type Descriptor,type LeafEndpoint} from './leaf-events';
const progress:Descriptor={type:'navigation/progress',version:1};
const page:Descriptor={type:'navigation/page',version:1,pagination:'edition-a'};
const bindings:Binding[]=[page,progress].map(d=>({type:d.type,enabled:true,direction:'bidirectional'}));
function fixture(){
  const frames=new Map<number,FrameRequestCallback>();let id=0;
  const gateway=new LeafGateway(fn=>{frames.set(++id,fn);return id;},key=>{frames.delete(key);});
  gateway.configure(bindings);
  const register=(side:'left'|'right',publishes:Descriptor[],subscribes:Descriptor[],receive:LeafEndpoint['receive']=vi.fn())=>
    ({...gateway.register(side,{publishes,subscribes,receive}),receive});
  const flush=()=>{const work=[...frames.values()];frames.clear();work.forEach(f=>f(0));};
  return {gateway,register,flush,frames};
}
describe('spread occurrence navigation',()=>{
  it('checks publication, subscription, direction, version and pagination identity',()=>{
    const {gateway,register,flush}=fixture(),l=register('left',[progress,page],[]);
    const r=register('right',[],[progress,{...page,pagination:'edition-b'}]);
    l.publish({type:page.type as 'navigation/page',page:2});r.publish({type:'navigation/progress',position:0});flush();expect(r.receive).not.toHaveBeenCalled();
    for(const position of [-1,NaN,2,.5])l.publish({type:'navigation/progress',position});flush();expect(r.receive).toHaveBeenCalledTimes(1);
    gateway.configure([{...bindings[1],direction:'right-to-left'}]);
    l.publish({type:'navigation/progress',position:.8});flush();expect(r.receive).toHaveBeenCalledTimes(1);
    register('right',[],[{...progress,version:2}]);expect(gateway.compatible('left','navigation/progress')).toBe(false);
  });
  it('coalesces bursts, revokes stale user intent, drops queued events on deregistration, replacement and unlink',()=>{
    const {gateway,register,frames,flush}=fixture(),l=register('left',[progress],[progress]),r=register('right',[progress],[progress]);
    l.intent();for(let i=0;i<=100;i++)l.publish({type:'navigation/progress',position:i/100});
    expect(frames.size).toBe(1);flush();expect(r.receive).toHaveBeenCalledWith({type:'navigation/progress',position:1});
    l.publish({type:'navigation/progress',position:.8});r.intent();expect(l.currentIntent()).toBe(false);
    r.publish({type:'navigation/progress',position:.2});flush();expect(l.receive).toHaveBeenCalledTimes(1);expect(r.receive).toHaveBeenCalledTimes(1);
    l.publish({type:'navigation/progress',position:.7});const replacement=register('right',[],[progress]);r.release();flush();expect(replacement.receive).not.toHaveBeenCalled();
    l.publish({type:'navigation/progress',position:.7});gateway.configure([]);flush();expect(replacement.receive).not.toHaveBeenCalled();
    gateway.configure(bindings);l.publish({type:'navigation/progress',position:.7});replacement.release();flush();expect(frames.size).toBe(0);
    gateway.dispose();expect(l.currentIntent()).toBe(false);
  });
});
it('suppresses receive-side publication and fences stale registrations of the same adapter object',()=>{
  const {gateway,register,flush,frames}=fixture();
  const from=register('left',[progress],[progress]);
  const endpoint:LeafEndpoint={publishes:[progress],subscribes:[progress],receive:event=>current.publish(event)};
  const expired=gateway.register('right',endpoint);
  const current=gateway.register('right',endpoint);
  expired.release();expired.publish({type:'navigation/progress',position:.1});flush();
  from.publish({type:'navigation/progress',position:.5});flush();
  expect(frames.size).toBe(0);expect(from.receive).not.toHaveBeenCalled();
  current.publish({type:'navigation/progress',position:.7});flush();expect(from.receive).toHaveBeenCalledTimes(1);
});
