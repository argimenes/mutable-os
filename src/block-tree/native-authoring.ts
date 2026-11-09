import type {ExistingBlockDto} from './types';
import {youtubeId} from '../interchange/youtube-reference';

/** Native preparations shared by editor commands and transport projections.
 * These return host-owned fragments, not permission to admit arbitrary DTOs. */
export const headingOperation={purpose:'Introduce a section with a native heading.',parameters:{level:{type:'integer',minimum:1,maximum:6}},nativeEffects:['standoff-editor-block','block/font/size']} as const;
export function headingProperty(type:string,level:number){
 if(type!=='standoff-editor-block'||!Number.isInteger(level)||level<1||level>6)throw Error('Heading requires a TextBlock and level 1–6');
 return {type:'block/font/size',value:'h'+level};
}
export function prepareHeading(text:ExistingBlockDto,level:number):ExistingBlockDto {
 const property=headingProperty(text.type!,level);
 return {...text,blockProperties:[...(Array.isArray(text.blockProperties)?text.blockProperties:[]).filter((p:any)=>p.type!=='block/font/size'),property]};
}
export const gridOperation={purpose:'Arrange related content in a native grid.',constraints:{maxRows:64,maxColumns:16,maxCellChildren:32,rectangular:true},nativeEffects:['grid-block','grid-row-block','grid-cell-block']} as const;
export function prepareGrid(rows:ExistingBlockDto[][][]):ExistingBlockDto {
 const {maxRows,maxColumns,maxCellChildren}=gridOperation.constraints;
 if(!Array.isArray(rows)||!rows.length||rows.length>maxRows)throw Error('Invalid native grid rows');
 const width=Array.isArray(rows[0])?rows[0].length:0;
 if(!width||width>maxColumns||rows.some(row=>!Array.isArray(row)||row.length!==width||row.some(cell=>!Array.isArray(cell)||cell.length>maxCellChildren)))throw Error('Invalid native grid cells');
 const dto=(type:string,children:ExistingBlockDto[]):ExistingBlockDto=>({id:crypto.randomUUID(),type,metadata:{},children});
 return dto('grid-block',rows.map(row=>dto('grid-row-block',row.map(cell=>dto('grid-cell-block',cell)))));
}
export const youtubeOperation={purpose:'Present an existing external YouTube video; no acquisition or generation.',parameters:{url:{type:'string',minLength:1,maxLength:4096}},nativeEffects:['youtube-video-block','metadata.url'],prerequisites:['A URL or video ID accepted by the native YouTube validator']} as const;
export function prepareYouTube(url:string):ExistingBlockDto {
 if(typeof url!=='string'||url.length>4096||!youtubeId(url))throw Error('Enter a valid YouTube URL or video ID');
 return {id:crypto.randomUUID(),type:'youtube-video-block',metadata:{url},children:[]};
}
