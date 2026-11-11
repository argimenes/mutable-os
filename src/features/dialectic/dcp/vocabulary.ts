import type {ReactiveEditor} from '../../../reactive-editor/editor';
import {capabilityCatalogue} from './capabilities';
import {entityMentionSemantic} from './markup';
import {ENTITY_REFERENCE} from '../../../feature-api/scoped-entities';
import type {VocabularySelection,VocabularySnapshot,VocabularyDescriptor} from './vocabulary-contract';
export type {VocabularySelection,VocabularySnapshot,VocabularyDescriptor,VocabularyProfile} from './vocabulary-contract';

// Preset membership references existing descriptor IDs; it defines no native types,
// constructors or validation. User overrides remain independent of presets.
const core=['composition.paragraph','composition.heading','composition.group','composition.list','composition.table','composition.code','source.anchor','source.classification','reference.reply',...['style/bold','style/italics','style/highlight','reference/url'].map(t=>'standoff:'+t)];
const general=[...core,'composition.card-grid','composition.tabs','composition.surface','composition.tasks','configuration.margins','configuration.text','configuration.list-numbering','configuration.table-headers','composition.sticky-note','media.external-image','media.video','media.youtube','media.embed','semantic.gloss','semantic.entity','standoff:mutable/entity-reference'];
const research=[...general,'composition.pages','composition.source','semantic.entity','semantic.argument','semantic.argument-relation','semantic.entity-relation','media.image','media.retained-pdf','standoff:mutable/entity-reference'];
export const allQualifiedSelection:Readonly<VocabularySelection>=Object.freeze({profile:'all-qualified'});
export function copyVocabularySelection(input:VocabularySelection):Readonly<VocabularySelection>{
 if(!input||!['all-qualified','core','general','research'].includes(input.profile)||Object.keys(input).some(k=>!['profile','enable','disable'].includes(k)))throw Error('Invalid DCP vocabulary selection');
 const list=(values:readonly string[]|undefined)=>{if(values===undefined)return [];if(!Array.isArray(values)||values.length>128||values.some(v=>typeof v!=='string'||!v||v.length>128)||new Set(values).size!==values.length)throw Error('Invalid DCP capability overrides');return Object.freeze([...values]);};
 const enable=list(input.enable),disable=list(input.disable);if(enable.some(id=>disable.includes(id)))throw Error('Conflicting DCP capability overrides');
 return Object.freeze({profile:input.profile,enable,disable});
}
export function vocabularyDescriptors(editor:ReactiveEditor):readonly VocabularyDescriptor[]{
 const current=new Map(capabilityCatalogue(editor).selectable.map(d=>[d.id,d]));
 // Enumerate qualified selection IDs even when their current native/stage gate
 // is off. Availability still comes exclusively from the real editor.
 const features={...editor.features,dcpNativeAuthoringStage1:true,dcpNativeAuthoringStage2Text:true,dcpNativeAuthoringStage2Layouts:true,dcpNativeAuthoringStage2Compounds:true,dcpNativeAuthoringStage2Widgets:true,dcpNativeAuthoringStage3ManagedImages:true,dcpNativeAuthoringStage3ExternalMedia:true,dcpNativeAuthoringStage3RetainedPdf:true};
 const descriptors=capabilityCatalogue({features,registry:editor.registry,visualEffects:editor.visualEffects}).selectable.map(d=>({...d,...(current.get(d.id)?.requiresAny?{requiresAny:current.get(d.id)!.requiresAny}:{}),available:current.get(d.id)?.available??false}));
 if(!descriptors.some(d=>d.standoff===ENTITY_REFERENCE))descriptors.push({id:'standoff:'+ENTITY_REFERENCE,purpose:entityMentionSemantic.purpose,requires:[],standoff:ENTITY_REFERENCE,available:false});
 return descriptors;
}
export function resolveVocabulary(editor:ReactiveEditor,input:VocabularySelection=allQualifiedSelection):VocabularySnapshot {
 const selection=copyVocabularySelection(input),descriptors=vocabularyDescriptors(editor),byId=new Map(descriptors.map(d=>[d.id,d]));
 for(const id of [...selection.enable??[],...selection.disable??[]])if(!byId.has(id))throw Error('Unknown or unqualified DCP selection ID: '+id);
 const preset=selection.profile==='all-qualified'?descriptors.map(d=>d.id):selection.profile==='core'?core:selection.profile==='general'?general:research;
 const wanted=new Set(preset);
 if(['general','research'].includes(selection.profile))for(const d of descriptors)if(d.standoff&&d.standoff!=='mutable/entity-reference')wanted.add(d.id);
 selection.enable?.forEach(id=>wanted.add(id));selection.disable?.forEach(id=>wanted.delete(id));
 if(!wanted.has('composition.paragraph'))throw Error('A conversational vocabulary must allow paragraphs');
 const allowed=new Set(descriptors.filter(d=>wanted.has(d.id)&&d.available).map(d=>d.id));
 // Dependencies constrain permissions; they do not silently enable endpoints or parents.
 let changed=true;while(changed){changed=false;for(const id of allowed)if(byId.get(id)!.requires.some(dependency=>!allowed.has(dependency))||byId.get(id)!.requiresAny&&!byId.get(id)!.requiresAny!.some(dependency=>allowed.has(dependency))){allowed.delete(id);changed=true;}}
 if(!allowed.has('composition.paragraph'))throw Error('Native paragraph authoring is unavailable');
 const enabled=descriptors.filter(d=>allowed.has(d.id)),f=editor.features,n=f.dcpNativeAuthoringStage1;
 const frozen=<T>(v:T[])=>Object.freeze(v);
 return Object.freeze({version:1,profile:selection.profile,capabilities:frozen(enabled.map(d=>d.id)),kinds:frozen(enabled.flatMap(d=>d.kind?[d.kind]:[])),schemas:frozen(enabled.flatMap(d=>d.kind&&d.schema?[d.schema]:[])),standoff:frozen(enabled.flatMap(d=>d.standoff?[d.standoff]:[])),stages:frozen([n,n&&f.dcpNativeAuthoringStage2Text,n&&f.dcpNativeAuthoringStage2Layouts,n&&f.dcpNativeAuthoringStage2Compounds,n&&f.dcpNativeAuthoringStage2Widgets,n&&f.dcpNativeAuthoringStage3ManagedImages,n&&f.dcpNativeAuthoringStage3ExternalMedia,n&&f.dcpNativeAuthoringStage3RetainedPdf])});
}
