import {listConfiguration,tableConfiguration} from '../../../block-tree/layout-authoring';
import {codeOperation} from '../../../block-tree/literal-authoring';
import {sourceOperation} from '../../../interchange/source-block';
import {headingOperation,gridOperation,youtubeOperation,textAppearanceOperation} from '../../../block-tree/native-authoring';
import {compositionLimits} from './limits';
import {generatedIdentityPattern,type GeneratedIdentityKind} from './identities';
// Strict provider schema for the negotiated text-only DCP profile.
// Native prepare() remains authoritative for capabilities, sizes, ownership and markup.
export const responseSchema = {"type":"object","properties":{"protocol":{"enum":["dcp/1.0"],"type":"string"},"kind":{"enum":["contribution"],"type":"string"},"exchange":{"type":"string"},"intent":{"type":"string","enum":["reply","acknowledge","share","create","propose","challenge","qualify","clarify","compare","elaborate","synthesise","ask","answer","other"]},"replyTargets":{"type":"array","items":{"type":"string"}},"composition":{"type":"array","items":{"$ref":"#/$defs/Node"}},"anchors":{"type":"array","items":{"$ref":"#/$defs/Anchor"}},"entities":{"type":"array","items":{"$ref":"#/$defs/LocalEntity"}},"interpretations":{"type":"array","items":{"$ref":"#/$defs/Interpretation"}},"arguments":{"type":"array","items":{"$ref":"#/$defs/Argument"}},"glosses":{"type":"array","items":{"$ref":"#/$defs/Gloss"}},"relations":{"type":"array","items":{"$ref":"#/$defs/Relation"}},"suggestions":{"type":"array","items":{"type":"string"}},"promotionRecommendations":{"type":"array","items":{"type":"string"}}},"required":["protocol","kind","exchange","intent","replyTargets","composition","anchors","entities","interpretations","arguments","glosses","relations","suggestions","promotionRecommendations"],"additionalProperties":false,"$defs":{"Attribute":{"type":"object","properties":{"name":{"type":"string"},"value":{"type":"string"}},"required":["name","value"],"additionalProperties":false},"Span":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string"},"from":{"type":"string"},"to":{"type":"string"},"ref":{"anyOf":[{"type":"string"},{"type":"null"}]},"attributes":{"type":"array","items":{"$ref":"#/$defs/Attribute"}}},"required":["id","type","from","to","ref","attributes"],"additionalProperties":false},"Paragraph":{"type":"object","properties":{"id":{"type":"string"},"kind":{"enum":["paragraph"],"type":"string"},"markup":{"type":"string"},"ranges":{"type":"array","items":{"$ref":"#/$defs/Span"}}},"required":["id","kind","markup","ranges"],"additionalProperties":false},"Group":{"type":"object","properties":{"id":{"type":"string"},"kind":{"enum":["group"],"type":"string"},"children":{"type":"array","items":{"$ref":"#/$defs/Node"}}},"required":["id","kind","children"],"additionalProperties":false},"List":{"type":"object","properties":{"id":{"type":"string"},"kind":{"enum":["list"],"type":"string"},"style":{"enum":["bullet","ordered"],"type":"string"},"items":{"type":"array","items":{"type":"array","items":{"$ref":"#/$defs/Node"}}}},"required":["id","kind","style","items"],"additionalProperties":false},"Table":{"type":"object","properties":{"id":{"type":"string"},"kind":{"enum":["table"],"type":"string"},"rows":{"type":"array","items":{"type":"array","items":{"type":"array","items":{"$ref":"#/$defs/Node"}}}}},"required":["id","kind","rows"],"additionalProperties":false},"Node":{"anyOf":[{"$ref":"#/$defs/Paragraph"},{"$ref":"#/$defs/Group"},{"$ref":"#/$defs/List"},{"$ref":"#/$defs/Table"}]},"Anchor":{"type":"object","properties":{"id":{"type":"string"},"source":{"type":"string"},"revision":{"type":"string"},"selector":{"type":"object","properties":{"exact":{"type":"string"},"prefix":{"type":"string"},"suffix":{"type":"string"}},"required":["exact","prefix","suffix"],"additionalProperties":false}},"required":["id","source","revision","selector"],"additionalProperties":false},"LocalEntity":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"typename":{"type":"string"},"description":{"type":"string"},"aliases":{"type":"array","items":{"type":"string"}}},"required":["id","name","typename","description","aliases"],"additionalProperties":false},"Interpretation":{"type":"object","properties":{"id":{"type":"string"},"target":{"type":"string"},"type":{"type":"string"},"ref":{"anyOf":[{"type":"string"},{"type":"null"}]},"attributes":{"type":"array","items":{"$ref":"#/$defs/Attribute"}}},"required":["id","target","type","ref","attributes"],"additionalProperties":false},"Argument":{"type":"object","properties":{"id":{"type":"string"},"anchor":{"type":"string"}},"required":["id","anchor"],"additionalProperties":false},"Gloss":{"type":"object","properties":{"id":{"type":"string"},"target":{"type":"string"},"type":{"type":"string"},"text":{"type":"string"}},"required":["id","target","type","text"],"additionalProperties":false},"Relation":{"anyOf":[{"$ref":"#/$defs/ArgumentRelation"},{"$ref":"#/$defs/EntityRelation"}]},"ArgumentRelation":{"type":"object","properties":{"id":{"type":"string"},"type":{"enum":["supports","challenges","qualifies","contradicts","elaborates","answers","depends-on","provides-evidence-for"],"type":"string"},"from":{"type":"string"},"to":{"type":"string"},"kind":{"enum":["argument"],"type":"string"}},"required":["id","kind","type","from","to"],"additionalProperties":false},"EntityRelation":{"type":"object","properties":{"id":{"type":"string"},"type":{"type":"string"},"from":{"type":"string"},"to":{"type":"string"},"kind":{"enum":["entity"],"type":"string"}},"required":["id","kind","type","from","to"],"additionalProperties":false}}};

// Constrain new provider declarations without changing the DCP object shape.
// Host preparation also checks typed roles and still admits legacy unprefixed aliases.
const declarationKinds:Record<string,GeneratedIdentityKind>={Paragraph:'b',Group:'b',List:'b',Table:'b',Anchor:'r',Span:'s',LocalEntity:'e',Interpretation:'m',Argument:'arg',Gloss:'g',ArgumentRelation:'rel',EntityRelation:'rel'};
for(const [name,kind]of Object.entries(declarationKinds))Object.assign((responseSchema.$defs as any)[name].properties.id,{pattern:generatedIdentityPattern(kind),maxLength:128});

/** Transport projection of shared native operations. The baseline remains unchanged. */
export function authoringSchema(nativeAuthoring=false,textAuthoring=false,layoutAuthoring=false):any {
 if(!nativeAuthoring)return responseSchema;
 const schema:any=structuredClone(responseSchema),d=schema.$defs;
 d.Heading={...structuredClone(d.Paragraph),properties:{...d.Paragraph.properties,kind:{type:'string',enum:['heading']},level:headingOperation.parameters.level},required:[...d.Paragraph.required,'level']};
 d.Grid=structuredClone(d.Table);d.Grid.properties.kind={type:'string',enum:['grid']};
 d.Grid.properties.rows.maxItems=Math.min(compositionLimits.tableRows,gridOperation.constraints.maxRows);
 d.Grid.properties.rows.items.maxItems=Math.min(compositionLimits.tableColumns,gridOperation.constraints.maxColumns);
 d.Grid.properties.rows.items.items.maxItems=Math.min(compositionLimits.cellChildren,gridOperation.constraints.maxCellChildren);
 d.YouTube={type:'object',properties:{id:d.Paragraph.properties.id,kind:{type:'string',enum:['youtube']},url:youtubeOperation.parameters.url},required:['id','kind','url'],additionalProperties:false};
 d.Node.anyOf.push(...['Heading','Grid','YouTube'].map(name=>({$ref:'#/$defs/'+name})));
 if(textAuthoring){
  const nullable=(schema:unknown)=>({anyOf:[schema,{type:'null'}]});
  d.TextStyle={type:'object',properties:Object.fromEntries(Object.entries(textAppearanceOperation.parameters).map(([key,value])=>[key,nullable(value)])),required:Object.keys(textAppearanceOperation.parameters),additionalProperties:false};
  for(const name of ['Paragraph','Heading']){d[name].properties.textStyle=nullable({$ref:'#/$defs/TextStyle'});d[name].required.push('textStyle');}
  const node=(kind:string,parameters:Record<string,unknown>)=>({type:'object',properties:{id:d.Paragraph.properties.id,kind:{type:'string',enum:[kind]},...parameters},required:['id','kind',...Object.keys(parameters)],additionalProperties:false});
  d.Code=node('code',codeOperation.parameters);d.Source=node('source',sourceOperation.parameters);
  d.Node.anyOf.push({$ref:'#/$defs/Code'},{$ref:'#/$defs/Source'});
 }

 if(layoutAuthoring){
  const nullable=(ref:string)=>({anyOf:[{$ref:'#/$defs/'+ref},{type:'null'}]});
  d.ListConfiguration=listConfiguration;d.TableConfiguration=tableConfiguration;
  d.List.properties.style.enum.push('task');
  d.List.properties.configuration=nullable('ListConfiguration');d.List.required.push('configuration');
  d.Table.properties.configuration=nullable('TableConfiguration');d.Table.required.push('configuration');
 }
 return schema;
}
/** Anthropic rejects recursive JSON schemas; expand the same bounded contract. */
export function schemaFor(provider:'openai'|'anthropic',nativeAuthoring=false,textAuthoring=false,layoutAuthoring=false):any {
 const schema:any=structuredClone(authoringSchema(nativeAuthoring,textAuthoring,layoutAuthoring));
 if(provider==='openai')return nativeAuthoring?schema:responseSchema;
 const defs=schema.$defs,node=defs.Node,templates:Record<string,any>={Group:defs.Group,List:defs.List,Table:defs.Table,...(nativeAuthoring?{Grid:defs.Grid}:{})};
 const leaf=node.anyOf.filter((r:any)=>!Object.hasOwn(templates,r.$ref.replace('#/$defs/','')));
 for(let depth=0;depth<=compositionLimits.depth;depth++){
  defs['Node'+depth]=depth===compositionLimits.depth?(nativeAuthoring?{anyOf:leaf}:{$ref:'#/$defs/Paragraph'}):{anyOf:node.anyOf.map((r:any)=>({$ref:Object.hasOwn(templates,r.$ref.replace('#/$defs/',''))?r.$ref+depth:r.$ref}))};
  if(depth===compositionLimits.depth)continue;
  for(const [name,value]of Object.entries(templates))defs[name+depth]=JSON.parse(JSON.stringify(value).replaceAll('#/$defs/Node','#/$defs/Node'+(depth+1)));
 }
 for(const name of ['Node',...Object.keys(templates)])delete defs[name];
 schema.properties.composition.items={$ref:'#/$defs/Node0'};return schema;
}
