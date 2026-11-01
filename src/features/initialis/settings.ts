import preset from './preset.json';
export const INITIALIS_REVISION=preset.revision;
export const INITIALIS_ASSETS=preset.assetVersion;
export const INITIALIS_BASE=`/vendor/initialis/${INITIALIS_REVISION}/`;
export type InitialisSettings=Record<string,string|number|boolean>;
export interface InitialisMetadata {
  renderer:'initialis'; rendererVersion:string; settingsVersion:number; assetVersion:string;
  width:number; height:number; settings:InitialisSettings;
}
export function defaultInitialisMetadata():InitialisMetadata {
  return {renderer:'initialis',rendererVersion:INITIALIS_REVISION,settingsVersion:1,assetVersion:INITIALIS_ASSETS,
    width:48,height:48,settings:{...preset.defaults}};
}
const keys=new Set(preset.schema.map(p=>p.key));
const metadataKeys=new Set(['renderer','rendererVersion','settingsVersion','assetVersion','width','height','settings']);
export function validateInitialis(value:unknown):value is InitialisMetadata {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const p=value as InitialisMetadata;
  if(Object.keys(p).some(k=>!metadataKeys.has(k))||p.renderer!=='initialis'||p.rendererVersion!==INITIALIS_REVISION||p.settingsVersion!==1||p.assetVersion!==INITIALIS_ASSETS)return false;
  if(![p.width,p.height].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=16&&n<=128))return false;
  if(!p.settings||typeof p.settings!=='object'||Array.isArray(p.settings)||Object.keys(p.settings).length!==keys.size||Object.keys(p.settings).some(k=>!keys.has(k)))return false;
  for(const {key,spec} of preset.schema){
    const v=p.settings[key];
    if(Array.isArray(spec)){
      if(typeof spec[0]==='number') {if(typeof v!=='number'||!Number.isFinite(v)||v<Number(spec[0])||v>Number(spec[1]))return false;}
      else if(!(spec as unknown[]).includes(v))return false;
    } else if(spec==='color'){if(typeof v!=='string'||!/^#[\da-f]{6}$/i.test(v))return false;}
    else if(spec==='seed'){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>0x7fffffff)return false;}
    else if(spec==='bool'){if(typeof v!=='boolean')return false;}
    else if(spec==='font'){if(v!=='cormorant-garamond-700')return false;}
    else return false;
  }
  for(const [key,value] of Object.entries(preset.fixed))if(p.settings[key]!==value)return false;
  return true;
}
/** Stable ordered key, calculated at acquisition only; never on caret movement or rebasing. */
export function initialisKey(text:string,p:InitialisMetadata){
  return JSON.stringify([INITIALIS_REVISION,1,INITIALIS_ASSETS,text,p.width,p.height,...preset.schema.map(s=>p.settings[s.key])]);
}
export function resolution(width:number,height:number,pixelRatio:number){
  const dpr=pixelRatio<=1?1:pixelRatio<=2?2:4;
  const target=Math.max(width,height)*dpr*2;
  return {dpr,size:target<=128?128:target<=256?256:512};
}
