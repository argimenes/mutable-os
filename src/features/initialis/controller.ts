import {createSignal} from 'solid-js';
import {unwrap} from 'solid-js/store';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {EffectParams} from '../../runtime/visual-effect-registry';
import {defaultInitialisMetadata,validateInitialis} from './settings';
import {InitialisService} from './service';
export const initialisCommand='character.initialis.apply';
export class InitialisController {
  readonly service=new InitialisService();
  private status=createSignal('');
  readonly notice=this.status[0];
  readonly enabled:boolean;
  private unregister:()=>void;
  constructor(private readonly editor:ReactiveEditor){
    this.enabled=editor.features.initialisCharacterRenderer&&editor.features.inlineCharacterSurfaces&&editor.features.standoffPropertyRendering;
    editor.visualEffects.registerRenderer({name:'initialis',target:'character-surface',defaults:defaultInitialisMetadata() as unknown as EffectParams,
      validate(params){if(!validateInitialis(params))throw Error('Unsupported Initialis settings or asset version');},
      surface:(text,params,_document,owner)=>{
        if(!this.enabled||!owner||!validateInitialis(params))return;
        const lease=this.service.acquire(text,params,owner.presentation,owner.ready);
        const stop=owner.observe(state=>lease.update(state));
        owner.signal.addEventListener('abort',()=>{stop();lease.dispose();},{once:true});
        return undefined;
      },
    });
    this.unregister=editor.commandRegistry.register<{selection?:{anchor:number;head:number}}>({id:initialisCommand,label:'Apply Initialis',
      canExecute:({targetKey})=>this.enabled&&editor.node(targetKey)?.viewType==='standoff-editor-block',
      execute:({targetKey,args})=>{this.apply(targetKey,args?.selection);},
    },'initialis');
  }
  apply(nodeKey:string,selection?:{anchor:number;head:number}):boolean {
    const editor=this.editor,node=editor.node(nodeKey),mount=editor.mounts.get(nodeKey);
    const reject=(message='Select exactly one supported uppercase Latin character (A–Z).')=>{this.status[1](message);return false;};
    if(!this.enabled||node?.viewType!=='standoff-editor-block')return reject('Initialis is unavailable for this Block.');
    const operation=editor.currentTextOperation.annotationOperation()?.annotationTargets();
    if(editor.crossText.range()||operation||editor.selections.sets[nodeKey]?.items.length>1)return reject();
    const range=selection??mount?.captureInlineSelection?.();if(!range)return reject();
    const start=Math.min(range.anchor,range.head),end=Math.max(range.anchor,range.head);
    if(end-start!==1)return reject();
    try{editor.textRanges.snapshot(nodeKey,start,end);}catch{return reject();}
    const text=String(editor.node(node.inlineContent[start])?.payload.text??'');
    const following=String(editor.node(node.inlineContent[end])?.payload.text??'');
    if(!/^[A-Z]$/.test(text)||/^[\p{Mark}\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(following))return reject();
    const properties=unwrap((node.payload.standoffProperties??[]) as Record<string,unknown>[]);
    const surfaces=properties.filter(p=>p.type==='style/character-surface'&&!p.isDeleted);
    if(surfaces.some(p=>Number(p.start)<=start&&Number(p.end)>=start))return reject('This character already has a character surface.');
    if(surfaces.some(p=>Number(p.end)===start-1||Number(p.start)===end))return reject('Adjacent character surfaces are not supported yet.');
    const metadata=defaultInitialisMetadata();
    this.service.prioritize(text,metadata);
    const property={id:crypto.randomUUID(),type:'style/character-surface',start,end:start,metadata};
    // A single put-content is admitted by the existing bounded standoff path.
    // Do not wrap this in transaction(), which would snapshot the repository.
    editor.commands.setPayloadField(nodeKey,'standoffProperties',[...properties,property],'Apply Initialis',[...properties.map((_,i)=>i),null]);
    this.status[1]('');return true;
  }
  dispose(){this.unregister();this.service.dispose();}
}
