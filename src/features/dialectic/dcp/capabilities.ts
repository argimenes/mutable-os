import type {ReactiveEditor} from '../../../reactive-editor/editor';
import {responseSchema,authoringSchema} from './provider-schema';
import {headingOperation,gridOperation,youtubeOperation} from '../../../block-tree/native-authoring';
import {standoffStyleSchemas} from '../../../rendering/standoff-styles';
import {capabilityLimits,compositionLimits} from './limits';
import {classifications,legend} from './markup';

type Definition = keyof typeof responseSchema.$defs|'Heading'|'Grid'|'YouTube';
interface Adapter {
 id:string; name:string; purpose:string; read:string; nativeTypes:string[]; schema?:Definition; semantic?:boolean; inspectionOnly?:boolean; annotationRenderer?:string; presentationOnly?:boolean;
 constraints?:Record<string,unknown>; guidance:string; example?:unknown;
 resources?:'asset-acquisition-unavailable'|'validated-external-reference';
 nativeOperation?:string;nativeEffects?:readonly string[];parameters?:Record<string,unknown>;prerequisites?:readonly string[];
}
const text=['standoff-editor-block'];
const paragraph={id:'new:b1',kind:'paragraph',markup:'A perspective',ranges:[]};
/** Descriptive adapters for the admitted constructors, not a second Block registry.
 * Parameter definitions below always come from the schema used by providers. */
const adapters:Adapter[]=[
 {id:'composition.paragraph',name:'Paragraph',purpose:'Converse, explain or quote with optional inline emphasis.',read:'native-text-and-annotations',nativeTypes:text,schema:'Paragraph',guidance:'Use plain text when sufficient. XML-escape literal &, < and >. Quoting source text does not replace a requested native source anchor.',example:paragraph},
 {id:'composition.group',name:'Group',purpose:'Keep related passages together in a hierarchy.',read:'native-structure-and-child-text',nativeTypes:['container-block',...text],schema:'Group',constraints:{maxChildren:compositionLimits.groupChildren},guidance:'A structural group, not a positioned card or visual grid.',example:{id:'new:b2',kind:'group',children:[paragraph]}},
 {id:'composition.list',name:'List',purpose:'Present steps, alternatives or parallel points.',read:'native-structure-and-child-text',nativeTypes:['indented-list-block','container-block',...text],schema:'List',constraints:{maxItems:compositionLimits.listItems,maxItemChildren:compositionLimits.itemChildren},guidance:'Ordered or bullet items containing native composition; no interactive checklist.',example:{id:'new:b2',kind:'list',style:'bullet',items:[[paragraph]]}},
 {id:'composition.table',name:'Table',purpose:'Compare evidence or alternatives along shared dimensions.',read:'native-structure-and-child-text',nativeTypes:['table-block','table-row-block','table-cell-block',...text],schema:'Table',constraints:{rectangular:true,maxRows:compositionLimits.tableRows,maxColumns:compositionLimits.tableColumns,maxCellChildren:compositionLimits.cellChildren},guidance:'A rectangular native table. A 2×2 table is a tabular alternative, not spatial card-grid authoring. Width and wrapping depend on presentation.',example:{id:'new:b2',kind:'table',rows:[[ [paragraph] ]]}},
 {id:'source.anchor',name:'Exact source anchor',purpose:'Identify an exact earlier quotation for native references or annotation.',read:'issued-range-text',nativeTypes:text,schema:'Anchor',constraints:{maxAnchors:compositionLimits.anchors},guidance:'Discover and read the source in this exchange. Use its issued handle, revision and a unique exact selector. This creates a range identity, not an interpretation.',example:{id:'new:r1',source:'CURRENT_READ.handle',revision:'CURRENT_READ.revision',selector:{exact:'Exact source text',prefix:'',suffix:''}}},
 {id:'source.classification',name:'Source classification',purpose:'Identify a claim, question or other admitted discursive role in earlier text.',read:'annotations-on-source-block',nativeTypes:text,schema:'Interpretation',guidance:'Target a new exact source anchor. A classification is neither a text-bearing Gloss nor an independent Argument.'},
 {id:'semantic.gloss',name:'Gloss',purpose:'Attach independent explanatory commentary to a specific passage.',read:'issued-gloss-text',nativeTypes:text,schema:'Gloss',semantic:true,annotationRenderer:'mutable/gloss',guidance:'Use an explicit existing or newly declared passage anchor. Gloss text has its own identity; it does not edit the source.',example:{id:'new:g1',target:'new:r1',type:'commentary',text:'This detail connects the object to its historical use.'}},
 {id:'semantic.argument',name:'Argument',purpose:'Give a passage an independent Argument identity for reasoning relationships.',read:'issued-argument-and-passage',nativeTypes:text,schema:'Argument',semantic:true,guidance:'Use an owned passage anchor. Classification alone does not create an Argument.',example:{id:'new:arg1',anchor:'new:r1'}},
 {id:'semantic.argument-relation',name:'Argument relationship',purpose:'Express directed support, challenge or another admitted relationship between Arguments.',read:'issued-relation-and-endpoints',nativeTypes:text,schema:'ArgumentRelation',semantic:true,guidance:'Both endpoints must be owned Argument identities, not range anchors or classifications. from performs the relation toward to; depends-on points to the prerequisite.'},
 {id:'semantic.entity',name:'Entity',purpose:'Identify a person, object, place or concept independently of a mention.',read:'issued-scoped-entity',nativeTypes:text,schema:'LocalEntity',semantic:true,guidance:'Creates a Document-scoped Entity. No global Entity mutations. Mentions use mutable/entity-reference with an issued or newly declared Entity reference.'},
 {id:'semantic.entity-relation',name:'Entity relationship',purpose:'Describe a directed relationship between scoped Entities.',read:'issued-relation-and-endpoints',nativeTypes:text,schema:'EntityRelation',semantic:true,guidance:'Use valid scoped Entity endpoints, at least one owned by this Document, and a nonempty relation name; no global mutations.'},
 {id:'composition.heading',name:'Heading',purpose:'Introduce and organize sections visually.',read:'native-text-and-annotations',nativeTypes:text,guidance:'No DCP heading constructor. A bold paragraph remains a paragraph.'},
 {id:'composition.code',name:'Code',purpose:'Present literal code with language-aware display.',read:'child-text-only',nativeTypes:['standoff-code-block',...text],guidance:'No DCP code constructor. Literal code can be quoted as escaped paragraph text, without claiming a code Block.'},
 {id:'composition.card-grid',name:'Card grid',purpose:'Arrange perspectives as spatial cards.',read:'child-text-only',nativeTypes:['grid-block','grid-row-block','grid-cell-block'],guidance:'No DCP spatial/card-grid constructor. Native grid rendering does not establish authorability.'},
 {id:'composition.markdown-fallback',name:'Markdown fallback',purpose:'Preserve otherwise unsupported composition through a native Surface and exact Markdown provenance.',read:'unavailable',nativeTypes:['surface-block','side-block','standoff-code-block',...text],guidance:'Not implemented or authorable in this increment. Prefer available native composition; do not emit a fallback node.'},
 {id:'media.image',name:'Image',purpose:'Show visual evidence or an illustration.',read:'no-media-adapter',nativeTypes:['image-block'],resources:'asset-acquisition-unavailable',guidance:'No DCP image constructor, image perception or asset acquisition. A description or URL is not a persisted native image.'},
 {id:'media.video',name:'Video',purpose:'Present motion, demonstration or time-based evidence.',read:'no-media-adapter',nativeTypes:['mutable/video-block'],resources:'asset-acquisition-unavailable',guidance:'No DCP video constructor or durable acquisition path.'},
 {id:'media.youtube',name:'YouTube',purpose:'Present an external video for inspection.',read:'no-media-adapter',nativeTypes:['youtube-video-block'],guidance:'No DCP YouTube constructor. A link is not a native player.'},
 {id:'presentation.workspace',name:'Workspace presentation',purpose:'Read and inspect the same native Document through Desktop or Textual.',read:'not-a-source',nativeTypes:[],presentationOnly:true,guidance:'Presentation is controlled by the host application contracts, not DCP composition. Workspace availability and admission are host-dependent. This descriptor does not authorize switching workspaces or claim that all media render identically in them.'},
];

export const capabilityInstructions='CAPABILITY DISCOVERY: capabilities is the current authoring summary, not an inventory of everything Mutable can render. Choose native operations appropriate to the communicative purpose. Call describe_capabilities with 1–4 IDs when detailed parameters or availability are needed; it shares the existing tool and retrieval budgets. Author only capabilities marked authorable. Parameter schemas reuse the negotiated DCP schema; examples are illustrative and source placeholders must be replaced by current retrieved authority. Unknown IDs do not imply support. Native composition is preferred; Markdown fallback and media acquisition are not implemented. Ordinary conversation does not require catalogue discovery.';

/** One exchange snapshot: fixed adapter lookups only; no Document traversal,
 * repository subscription, typing hook or provider-model capability inference. */
export function capabilityCatalogue(editor:Pick<ReactiveEditor,'registry'|'features'|'visualEffects'>){
 const stage1=editor.features.dcpNativeAuthoringStage1===true;
 const semanticTypes=legend(editor.visualEffects,stage1);
 const projected=adapters.map((a):Adapter=>!stage1?a:a.id==='composition.heading'?{...a,schema:'Heading',purpose:headingOperation.purpose,nativeOperation:'prepareHeading / headingProperty',nativeEffects:headingOperation.nativeEffects,guidance:'level 1–6 creates a native TextBlock with the heading Block property; same preparation as the style bar.',example:{...paragraph,kind:'heading',level:2}}:a.id==='composition.card-grid'?{...a,schema:'Grid',purpose:gridOperation.purpose,nativeOperation:'prepareGrid',nativeEffects:gridOperation.nativeEffects,constraints:gridOperation.constraints,guidance:'Use kind:grid with rectangular rows of nonempty cell content arrays. Native preparation supplies row/cell ownership; no spatial placement or merged cells in this creation projection.',example:{id:'new:b2',kind:'grid',rows:[[[paragraph]]]}}:a.id==='media.youtube'?{...a,schema:'YouTube',purpose:youtubeOperation.purpose,nativeOperation:'prepareYouTube / youtubeId',nativeEffects:youtubeOperation.nativeEffects,resources:'validated-external-reference',prerequisites:youtubeOperation.prerequisites,guidance:'Use a native-valid URL or video ID. No trusted capture, managed asset or generation is required. External playback availability is not guaranteed.',example:{id:'new:b1',kind:'youtube',url:'Zsqep7_9_mw'}}:a.id==='source.classification'?{...a,guidance:'Target a fresh exact source anchor. Stage 1 also admits formatting from the initial legend through this same interpretations shape; attributes use the native property descriptor. Existing text remains immutable.'}:a);
 if(stage1)projected.push({id:'formatting.colour',name:'Text colour',purpose:standoffStyleSchemas['text/colour'].authoring!.purpose,read:'native-property-value',nativeTypes:text,schema:'Span',nativeOperation:'standoffStyleSchemas[text/colour].authoring.prepare',nativeEffects:['text/colour','value'],parameters:standoffStyleSchemas['text/colour'].authoring!.parameters,guidance:'Core formatting. Inline value and explicit ranges/interpretations attributes use the same native colour validation. Other unadvertised decorative/experimental styles remain non-authorable.',example:{markup:'<annotation type="text/colour" value="#336699">Evidence</annotation>'}});
 if(stage1)projected.push({id:'inspection.native',name:'Native inspection',purpose:'Understand existing compound content and its persistent properties using current source authority.',read:'bounded-native-inspection',nativeTypes:[],inspectionOnly:true,guidance:'Call read_source with an issued handle. Inspect the related child/owned-relation tree, native identities, properties and omissions. This is not lossless serialisation or a native clone operation.',example:{tool:'read_source',arguments:{handle:'CURRENT_SOURCE.handle'}}});
 const items=projected.map(a=>{
  const renderer=a.nativeTypes.every(type=>!!editor.registry.resolve(type)?.view)&&(!a.annotationRenderer||!!editor.visualEffects.type(a.annotationRenderer)?.renderers.length);
  const enabled=editor.features.dialecticDcp&&(!a.semantic||editor.features.scopedSemantics);
  const constructor=!!a.schema;
  const registered=a.id!=='source.classification'||classifications.some(type=>semanticTypes.some(t=>t.type===type));
  const authorable=constructor&&renderer&&enabled&&registered;
  return {...a,...(stage1?{reading:{available:!['not-a-source','unavailable'].includes(a.read),mode:'bounded-native-inspection'},capabilityState:a.inspectionOnly?'readable':authorable?(a.prerequisites?'authorable-with-prerequisites':'authorable'):!enabled?'disabled':'unsupported-through-dcp',context:'Committed Document sources / new contribution; no retroactive text editing'}:{}),status:a.inspectionOnly?'readable':authorable?'authorable':a.presentationOnly?'presentation-only':'unavailable',authorable,
   availability:{representation:true,renderer:a.presentationOnly?'host-controlled':renderer,constructor,providerAdapter:constructor,resources:a.resources??'none-required',enabled,semanticRegistration:registered,...(stage1&&a.resources==='validated-external-reference'?{resourceReadiness:'input-required'}:{})},
   ...(!authorable&&!a.inspectionOnly?{reason:a.presentationOnly?'Host presentation, not an authored Document object':!constructor?'No admitted DCP authoring path':!enabled?'Required DCP profile/feature disabled':!renderer?'Required native renderer unavailable':'Required semantic registration unavailable'}:{}),
   ...(a.schema?{schemaRef:'#/$defs/'+a.schema}:{}),
   ...(a.id==='composition.paragraph'?{annotationLegend:'request.legend.types'}:{}),
   ...(a.id==='source.classification'?{types:stage1?semanticTypes.map(t=>t.type):classifications.filter(type=>semanticTypes.some(t=>t.type===type))}:{}),
  };
 });
 const summary={version:1,detailTool:'describe_capabilities',items:items.map(({id,name,purpose,status,reason,...detail})=>({id,name,purpose,status,...(stage1?{state:detail.capabilityState}:{}),...(reason?{reason}:{})}))};
 const definitions=authoringSchema(stage1).$defs as Record<string,unknown>;
 function parameters(names:Definition[]){
  const defs:Record<string,unknown>={};
  const add=(name:string)=>{if(name in defs)return;defs[name]=definitions[name];walk(definitions[name]);};
  const walk=(value:any)=>{if(!value||typeof value!=='object')return;if(value.$ref)add(value.$ref.replace('#/$defs/',''));for(const child of Object.values(value))walk(child);};
  names.forEach(add);return {$defs:defs};
 }
 function describe(args:Record<string,unknown>){
  const ids=args?.ids;
  if(!args||Object.keys(args).some(k=>k!=='ids')||!Array.isArray(ids)||!ids.length||ids.length>capabilityLimits.ids||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id.length||id.length>capabilityLimits.idLength))throw Error('Invalid capability IDs: supply 1–4 distinct IDs');
  const selected:any[]=[],names:Definition[]=[];
  const result=(omittedIds:string[])=>({status:omittedIds.length?'truncated':'complete',items:selected,parameters:parameters(names),compositionLimits,omittedIds,limits:capabilityLimits});
  const omitted:string[]=[];
  for(const id of ids){
   const found=items.find(item=>item.id===id);
   const {schema,...detail}=found??{id,status:'unknown',authorable:false,reason:'Unknown capability ID',schema:undefined};
   selected.push(detail);if(schema)names.push(schema);
   if(new TextEncoder().encode(JSON.stringify(result(ids))).length>capabilityLimits.bytes){selected.pop();if(schema)names.pop();omitted.push(id);}
  }
  return result(omitted);
 }
 return {summary,describe};
}
