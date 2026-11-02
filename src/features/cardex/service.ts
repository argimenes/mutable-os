import type {ManagedAssetReference} from '../../interchange/managed-asset';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {AssetLease} from '../../runtime/managed-assets';
export interface CardAlias {id:string;name:string;origin:'curated'|'imported';revision?:number}
export interface EntityCardRecord {id:string;name:string;revision:number;deletedUtc?:string|null;displayName?:string;description?:string|null;nameStrata:any;descriptionDocument:any;imageRef:ManagedAssetReference|null;aliases:CardAlias[]}
export async function cardexRequest(vault:string,request:unknown,signal?:AbortSignal):Promise<any>{
 const body=JSON.stringify({vault,request});if(new TextEncoder().encode(body).length>32000)throw Object.assign(Error('Card exceeds the 32 KiB save budget. Shorten the Description or aliases.'),{notDispatched:true});
 const response=await fetch('/api/sqlite/knowledge/cardex',{method:'POST',headers:{'Content-Type':'application/json'},body,signal});const data=await response.json();if(!response.ok||!data.Success)throw Error(data.Error??'Cardex request failed');return data.Data;
}
/** Picker, drop and clipboard all enter this same managed-asset admission path. */
export async function ingestCardImage(host:ReactiveEditor,file:Blob,signal:AbortSignal):Promise<ManagedAssetReference>{
 if(!['image/png','image/jpeg'].includes(file.type)||file.size>10*1024*1024||file.size===0)throw Error('Choose a PNG or JPEG image no larger than 10 MiB.');
 let lease:AssetLease|undefined,finished=false;try{lease=await host.assets.begin([],signal);const image=await host.assets.stage(lease,file,signal);await host.assets.action(lease,'publish',signal);signal.throwIfAborted();await host.assets.request(`${lease.id}/finish`,{commitId:'cardex-image-import'},signal,lease);finished=true;return {kind:'managed',cavernId:image.cavernId,assetId:image.assetId};}
 finally{if(lease&&!finished)await host.assets.action(lease,'abort').catch(()=>{});}
}

const previewQueues=new WeakMap<ReactiveEditor,{busy:boolean;jobs:Array<()=>void>}>();
/** Cardex shares the existing asset service's two-operation admission budget with uploads.
 * Keep one preview request in flight across this host's Cardex windows; retain its normal URL lease. */
export function bindCardThumbnail(host:ReactiveEditor,image:HTMLImageElement,asset:ManagedAssetReference|null):()=>void{
 image.removeAttribute('src');image.removeAttribute('title');if(!asset)return()=>{};
 const context=host.readAssetContext();if(!host.features.managedAssetClipboard||!context.session||context.cavernId!==asset.cavernId){image.title='Image unavailable in this Cavern';return()=>{};}
 let queue=previewQueues.get(host);if(!queue){queue={busy:false,jobs:[]};previewQueues.set(host,queue);}const q=queue;
 let started=false,finished=false,observer:MutationObserver|undefined,release:(()=>void)|undefined;
 const pump=()=>{if(!q.busy)q.jobs.shift()?.();};
 const finish=(event?:Event)=>{if(!started||finished)return;finished=true;observer?.disconnect();image.removeEventListener('load',finish);image.removeEventListener('error',finish);if(event?.type==='load')image.removeAttribute('title');if(event?.type==='error')image.title='Image unavailable in this Cavern';q.busy=false;queueMicrotask(pump);};
 const start=()=>{started=true;q.busy=true;image.title='Loading image…';observer=new MutationObserver(()=>{if(image.title!=='Loading image…')finish();});observer.observe(image,{attributes:true,attributeFilter:['title']});image.addEventListener('load',finish);image.addEventListener('error',finish);release=host.assets.bind(image,asset);};
 q.jobs.push(start);queueMicrotask(pump);
 return()=>{if(!started){const index=q.jobs.indexOf(start);if(index>=0)q.jobs.splice(index,1);}else{release?.();finish();}};
}
