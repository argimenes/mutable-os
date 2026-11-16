import type {TimeInput} from './semantics';
export type EntityDate=Omit<TimeInput,'guid'|'entity'|'expectedEntityRevision'> & {type:string};
export interface EntityEnrichment {version:1;subtypes:string[];dates:EntityDate[];externalIds:{namespace:string;value:string}[];thumbnail?:{url:string;source?:string;attribution?:string;license?:string}}
const text=(v:unknown,max=1000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export function publicImageUrl(value:unknown):value is string {if(!text(value,2048))return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
/** Native Time fields retain precision and uncertainty, without inventing a canonical Time identity. */
export function entityDate(input:any):EntityDate {
 const keys=['type','expression','startYear','startMonth','startDay','startHour','startMinute','startSecond','endYear','endMonth','endDay','endHour','endMinute','endSecond','precision','approximation','certainty','extentKind','qualifier','normalizationProfile','lowerBoundDay','upperBoundDayExclusive','attributes'];
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!keys.includes(k))||!text(input.type,80))throw Error('Invalid Entity date');
 for(const side of ['start','end']){const year=input[side+'Year'],month=input[side+'Month'],day=input[side+'Day'];if(year!=null&&(!Number.isSafeInteger(year)||Math.abs(year)>1e9))throw Error('Invalid date year');if(month!=null&&(!Number.isInteger(month)||month<1||month>12||year==null))throw Error('Invalid date month');if(day!=null){const leap=year%4===0&&(year%100!==0||year%400===0),max=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];if(month==null||!Number.isInteger(day)||day<1||day>max)throw Error('Invalid date day');}for(const [part,max]of [['Hour',23],['Minute',59],['Second',60]] as const){const value=input[side+part];if(value!=null&&(!Number.isInteger(value)||value<0||value>max))throw Error('Invalid date time');}}
 for(const key of ['expression','precision','approximation','certainty','extentKind','qualifier','normalizationProfile'])if(input[key]!=null&&!text(input[key],512))throw Error('Invalid date qualifier');
 for(const key of ['lowerBoundDay','upperBoundDayExclusive'])if(input[key]!=null&&!Number.isSafeInteger(input[key]))throw Error('Invalid date bound');
 if(input.lowerBoundDay!=null&&input.upperBoundDayExclusive!=null&&input.lowerBoundDay>=input.upperBoundDayExclusive)throw Error('Invalid date bounds');
 if(input.startYear!=null&&input.endYear!=null){const a=[input.startYear,input.startMonth??1,input.startDay??1],b=[input.endYear,input.endMonth??12,input.endDay??31];const first=a.findIndex((v,i)=>v!==b[i]);if(first>=0&&a[first]>b[first])throw Error('Invalid temporal range');}
 if(input.startYear==null&&!input.expression)throw Error('Date requires a value or expression');
 if(JSON.stringify(input).length>4096)throw Error('Date metadata budget exceeded');return structuredClone(input);
}
export function compactEntityDate(input:Record<string,string>):EntityDate {
 const {type,value,end,...qualifiers}=input;const out:any={type,...qualifiers};
 for(const [prefix,source]of [['start',value],['end',end]])if(source){const m=/^(-?\d{1,9})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(source);if(!m)throw Error('Expected a year, year-month or year-month-day');out[prefix+'Year']=Number(m[1]);if(m[2])out[prefix+'Month']=Number(m[2]);if(m[3])out[prefix+'Day']=Number(m[3]);if(prefix==='start'&&!out.precision)out.precision=m[3]?'day':m[2]?'month':'year';}
 out.expression??=value+(end?' – '+end:'');if(end)out.extentKind??='range';return entityDate(out);
}
export function entityEnrichment(input:any):EntityEnrichment {
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['version','subtypes','dates','externalIds','thumbnail'].includes(k))||input.version!==undefined&&input.version!==1)throw Error('Invalid enrichment');
 const {subtypes=[],dates=[],externalIds=[],thumbnail}=input;
 if(!Array.isArray(subtypes)||subtypes.length>16||subtypes.some(v=>!text(v,128))||!Array.isArray(dates)||dates.length>16||!Array.isArray(externalIds)||externalIds.length>16)throw Error('Enrichment budget exceeded');
 for(const id of externalIds){if(!id||Object.keys(id).some(k=>!['namespace','value'].includes(k))||!text(id.namespace,64)||!text(id.value,256)||id.namespace==='wikidata'&&!/^Q[1-9]\d{0,14}$/.test(id.value))throw Error('Invalid authority candidate');}
 if(thumbnail&&(Object.keys(thumbnail).some(k=>!['url','source','attribution','license'].includes(k))||!publicImageUrl(thumbnail.url)||['source','attribution','license'].some(k=>thumbnail[k]!=null&&!text(thumbnail[k],2048))))throw Error('Invalid representative image');
 return {version:1,subtypes:[...new Set(subtypes)],dates:dates.map(entityDate),externalIds:structuredClone(externalIds),...(thumbnail?{thumbnail:structuredClone(thumbnail)}:{})};
}
/** Never overwrite an existing assertion silently. Local identity and original provenance survive. */
export function enrichEntityDefinition(definition:any,input:any,provenance:unknown){
 const result=structuredClone(definition),e=result.metadata.scopedEntity.entity,prior=e.attributes?.enrichment??{version:1,subtypes:[],dates:[],externalIds:[]},next=input.enrichment?entityEnrichment(input.enrichment):entityEnrichment({});
 const assertions=[...(prior.assertions??[])],conflicts=[...(prior.conflicts??[])];
 if(assertions.length>=128||conflicts.length>=128)throw Error('Entity enrichment history budget reached');
 const conflict=(field:string,value:unknown)=>{if(!conflicts.some((c:any)=>c.field===field&&JSON.stringify(c.value)===JSON.stringify(value)))conflicts.push({field,value,provenance});};
 for(const key of ['name','typename','description'])if(input[key]){if(!e[key])e[key]=input[key];else if(e[key]!==input[key])conflict(key,input[key]);}
 for(const alias of input.aliases??[])if(!e.aliases.some((a:any)=>a.name===alias)){if(e.aliases.length>=32)throw Error('Entity alias budget reached');e.aliases.push({id:crypto.randomUUID(),name:alias,origin:'agent',revision:0});}
 const merge=(field:'dates'|'externalIds',key:'type'|'namespace')=>{const values=[...(prior[field]??[])];for(const v of next[field]){const old=values.find((o:any)=>o[key]===(v as any)[key]);if(!old)values.push(v);else if(JSON.stringify(old)!==JSON.stringify(v))conflict(field+'.'+(v as any)[key],v);}if(values.length>32)throw Error('Entity enrichment budget reached');return values;};
 if(prior.thumbnail&&next.thumbnail&&prior.thumbnail.url!==next.thumbnail.url)conflict('thumbnail',next.thumbnail);
 assertions.push({provenance,values:structuredClone(input)});
 e.attributes={...e.attributes,enrichment:{...prior,version:1,subtypes:[...new Set([...(prior.subtypes??[]),...next.subtypes])].slice(0,32),dates:merge('dates','type'),externalIds:merge('externalIds','namespace'),thumbnail:prior.thumbnail??next.thumbnail,assertions,conflicts}};e.revision++;return result;
}
