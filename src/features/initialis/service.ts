import type {CharacterSurface,CharacterSurfacePresentation} from '../../runtime/visual-effect-registry';
import {initialisKey,resolution,validateInitialis,INITIALIS_ASSETS,type InitialisMetadata} from './settings';
type Result={id:number;bitmap?:ImageBitmap;blob?:Blob;error?:string;renderMs?:number;startupMs?:number};
interface Consumer {publish:(surface:CharacterSurface|undefined)=>void;priority:number}
interface Item {key:string;base:string;text:string;config:InitialisMetadata;size:number;consumers:Set<Consumer>;order:number;running:boolean;failed:boolean;url?:string;bitmap?:ImageBitmap;bytes:number;touched:number}
export interface InitialisLease {update(presentation:CharacterSurfacePresentation):void;dispose():void}
export interface InitialisStats {hashes:number;workersStarted:number;workersTerminated:number;generated:number;cacheHits:number;deduplicated:number;queuedCancelled:number;staleResults:number;failures:number;evicted:number;bytes:number;peakBytes:number;active:number;queued:number;leases:number;renderMs:number[];startupMs:number[]}
/** One worker per editor session, shared by every occurrence. No repository dependencies. */
export class InitialisService {
  readonly stats:InitialisStats={hashes:0,workersStarted:0,workersTerminated:0,generated:0,cacheHits:0,deduplicated:0,queuedCancelled:0,staleResults:0,failures:0,evicted:0,bytes:0,peakBytes:0,active:0,queued:0,leases:0,renderMs:[],startupMs:[]};
  private items=new Map<string,Item>();
  private explicit=new Map<string,number>();
  private worker?:Worker;
  private active?:Item;
  private id=0;
  private clock=0;
  private disposed=false;
  private unavailable=false;
  private timer?:ReturnType<typeof setTimeout>;
  private idle?:ReturnType<typeof setTimeout>;
  constructor(private readonly workerFactory=()=>new Worker(`/vendor/initialis/worker.mjs?v=${INITIALIS_ASSETS}`,{type:'module',name:'Mutable Initialis'}),readonly maxBytes=16*1024*1024){}
  prioritize(text:string,config:InitialisMetadata){
    const now=performance.now();for(const [key,deadline] of this.explicit)if(deadline<now)this.explicit.delete(key);
    if(this.explicit.size>=64)this.explicit.delete(this.explicit.keys().next().value!);
    this.stats.hashes++;this.explicit.set(initialisKey(text,config),now+2000);
  }
  acquire(text:string,config:InitialisMetadata,presentation:CharacterSurfacePresentation,publish:Consumer['publish']):InitialisLease {
    if(this.disposed||!/^[A-Z]$/.test(text)||!validateInitialis(config))return {update(){},dispose(){}};
    this.stats.hashes++;const base=initialisKey(text,config);
    let current:Item|undefined,live=true;
    const consumer:Consumer={publish,priority:3};this.stats.leases++;
    const detach=()=>{if(!current)return;current.consumers.delete(consumer);current.touched=++this.clock;
      if(!current.consumers.size&&!current.url&&!current.running){this.items.delete(current.key);this.stats.queuedCancelled++;}current=undefined;};
    const update=(state:CharacterSurfacePresentation)=>{
      if(!live||this.disposed)return;
      const {size,dpr}=resolution(config.width,config.height,state.pixelRatio),key=`${base}|${size}|${dpr}`;
      consumer.priority=(this.explicit.get(base)??0)>performance.now()?0:state.visibility==='visible'?1:state.visibility==='nearby'?2:3;
      if(current?.key===key){this.pump();return;}
      detach();let item=this.items.get(key);
      if(item){if(item.url)this.stats.cacheHits++;else this.stats.deduplicated++;}
      else {item={key,base,text,config:{...config,settings:{...config.settings}},size,consumers:new Set(),order:++this.clock,running:false,failed:false,bytes:0,touched:this.clock};this.items.set(key,item);}
      current=item;item.consumers.add(consumer);item.touched=++this.clock;
      publish(item.url?{image:item.url,width:config.width,height:config.height}:undefined);this.pump();
    };
    update(presentation);
    return {update,dispose:()=>{if(!live)return;live=false;this.stats.leases--;detach();this.pump();}};
  }
  private priority(item:Item){return Math.min(3,...[...item.consumers].map(c=>c.priority));}
  private pump(){
    if(this.disposed||this.unavailable)return;
    const queue=[...this.items.values()].filter(i=>!i.url&&!i.failed&&!i.running&&i.consumers.size&&this.priority(i)<3).sort((a,b)=>this.priority(a)-this.priority(b)||a.order-b.order).slice(0,64);
    this.stats.queued=queue.length;if(this.active)return;
    if(!queue.length){if(this.worker&&!this.idle)this.idle=setTimeout(()=>this.stopWorker(),15000);return;}
    clearTimeout(this.idle);this.idle=undefined;
    const item=queue[0];this.active=item;item.running=true;this.stats.active=1;this.stats.queued--;
    try{
      if(!this.worker){this.worker=this.workerFactory();this.stats.workersStarted++;this.worker.onmessage=event=>this.receive(event.data);this.worker.onerror=event=>{event.preventDefault();this.failed('Worker failure');};this.worker.onmessageerror=()=>this.failed('Invalid worker response');}
      const id=++this.id;this.timer=setTimeout(()=>this.failed('Generation deadline exceeded'),10000);
      this.worker.postMessage({id,text:item.text,settings:item.config.settings,size:item.size});
    }catch{this.failed('Worker unavailable');}
  }
  private stopWorker(){clearTimeout(this.idle);this.idle=undefined;if(this.worker){this.worker.onmessage=this.worker.onerror=this.worker.onmessageerror=null;this.worker.terminate();this.stats.workersTerminated++;this.worker=undefined;}}
  private failed(message:string){this.stopWorker();this.receive({id:this.id,error:message});}
  private receive(result:Result){
    const item=this.active;
    if(this.disposed||!item||result.id!==this.id){result.bitmap?.close();this.stats.staleResults++;return;}
    clearTimeout(this.timer);this.timer=undefined;item.running=false;this.active=undefined;this.stats.active=0;
    if(!item.consumers.size){result.bitmap?.close();this.items.delete(item.key);this.stats.staleResults++;}
    else if(result.error||!result.blob||!result.bitmap){
      result.bitmap?.close();this.stats.failures++;this.unavailable=true;this.stopWorker();this.stats.queued=0;
      // A missing dependency or unavailable GPU must not cause a restart storm.
      for(const pending of this.items.values())if(!pending.url){pending.failed=true;for(const c of pending.consumers)c.publish(undefined);}
    }
    else {
      const bytes=result.bitmap.width*result.bitmap.height*4+result.blob.size;
      for(const old of [...this.items.values()].filter(i=>i.url&&!i.consumers.size).sort((a,b)=>a.touched-b.touched)){if(this.stats.bytes+bytes<=this.maxBytes)break;this.evict(old);}
      if(this.stats.bytes+bytes>this.maxBytes){result.bitmap.close();item.failed=true;this.stats.failures++;for(const c of item.consumers)c.publish(undefined);}
      else {item.bitmap=result.bitmap;item.url=URL.createObjectURL(result.blob);item.bytes=bytes;this.stats.bytes+=bytes;this.stats.peakBytes=Math.max(this.stats.peakBytes,this.stats.bytes);this.stats.generated++;
        this.stats.renderMs.push(result.renderMs??0);this.stats.startupMs.push(result.startupMs??0);
        // Diagnostics are bounded too; detailed qualification samples are captured externally.
        if(this.stats.renderMs.length>128){this.stats.renderMs.shift();this.stats.startupMs.shift();}
        for(const c of item.consumers)c.publish({image:item.url,width:item.config.width,height:item.config.height});}
    }
    for(const [key,deadline] of this.explicit)if(deadline<performance.now())this.explicit.delete(key);
    this.pump();
  }
  private evict(item:Item){if(item.url)URL.revokeObjectURL(item.url);item.bitmap?.close();this.stats.bytes-=item.bytes;this.items.delete(item.key);this.stats.evicted++;}
  dispose(){if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);this.stopWorker();for(const item of this.items.values()){for(const c of item.consumers)c.publish(undefined);this.evict(item);}this.items.clear();this.explicit.clear();this.active=undefined;this.stats.active=this.stats.queued=0;}
}
