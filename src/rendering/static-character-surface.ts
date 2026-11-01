import { validateInitialis } from '../features/initialis/settings';
import type { EffectParams, PropertyTypeDefinition, VisualEffectRegistry } from '../runtime/visual-effect-registry';
import type { StandoffAnnotation } from './standoff-styles';

export const characterSurfaceType = 'style/character-surface';
/** Metadata is presentation configuration only. Unknown values survive saving. */
export function characterSurfaceDefinition(annotation: StandoffAnnotation, definition: PropertyTypeDefinition): PropertyTypeDefinition {
  if (annotation.type !== characterSurfaceType) return definition;
  const metadata = annotation.metadata;
  const validMetadata=metadata===undefined||!!metadata&&typeof metadata==='object'&&!Array.isArray(metadata);
  const config = validMetadata && metadata ? metadata as Record<string, unknown> : {};
  const renderer=config.renderer===undefined?'static-capital':config.renderer;
  if(renderer==='initialis'){
    const params={...config,settings:config.settings&&typeof config.settings==='object'?{...config.settings}:config.settings};
    return {...definition,renderers:[{id:'surface',name:'initialis',params:validateInitialis(params)?params as unknown as EffectParams:{renderer:'unavailable'}}]};
  }
  const width=config.width===undefined?48:config.width,height=config.height===undefined?48:config.height;
  const params:EffectParams=validMetadata&&typeof renderer==='string'&&typeof width==='number'&&typeof height==='number'
    &&[width,height].every(n=>Number.isFinite(n)&&n>=16&&n<=128)
    ? {renderer,width,height} : {renderer:'unavailable',width:48,height:48};
  return {...definition, renderers: [{id:'surface', name:'static-character-surface', params}]};
}

export function registerStaticCharacterSurface(registry: VisualEffectRegistry) {
  registry.registerRenderer({name:'static-character-surface', target:'character-surface', defaults:{renderer:'static-capital',width:48,height:48},
    validate(p) {
      if (typeof p.renderer !== 'string' || ['width','height'].some(k=>typeof p[k] !== 'number' || !Number.isFinite(p[k]) || Number(p[k])<16 || Number(p[k])>128)) throw Error('Invalid character surface parameters');
    },
    surface(text,p,document) {
      if (p.renderer !== 'static-capital') return;
      const width=Number(p.width),height=Number(p.height);
      const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;
      const ctx=canvas.getContext('2d');if(!ctx)return;
      // Fixed local bitmap: no fonts/assets fetched, asynchronous generator or cache.
      ctx.scale(2,2);ctx.fillStyle='#e6d9bb';ctx.fillRect(0,0,width,height);
      ctx.strokeStyle='#51422b';ctx.strokeRect(.5,.5,width-1,height-1);
      ctx.fillStyle='#302419';ctx.font=`bold ${Math.min(width,height)*.75}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);
      return {image:canvas.toDataURL('image/png'),width,height};
    }});
  registry.registerType({type:characterSurfaceType,renderers:[{id:'surface',name:'static-character-surface'}]});
}
