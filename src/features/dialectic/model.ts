import type {ExistingBlockDto} from '../../block-tree/types';

export type ReplyTarget = {kind:'contribution'|'block';resourceId:string;blockId:string;anchorId?:never;definitionId?:never} |
 {kind:'range';resourceId:string;anchorId:string;blockId?:never;definitionId?:never} |
 {kind:'gloss';resourceId:string;definitionId:string;blockId?:never;anchorId?:never};
export interface ConsumedContext {version:1;items:{target:ReplyTarget;text:string;origins:('reply-target'|'selected')[];revisions:{contentKey:string;revision:number}[]}[];limits:{characters:number;blocks:number};}
export interface Contribution {
 version:1;kind:'contribution';state:'draft'|'committed';author:'human'|'mock';
 ordinal?:number;createdUtc?:string;replies:ReplyTarget[];context?:ReplyTarget[];requestId?:string;
 replyExcerpts?:{target:ReplyTarget;text:string}[];consumedContext?:ConsumedContext;
}
export const conversationMetadata={version:1,kind:'conversation'} as const;
export function contribution(value:unknown):Contribution|undefined {
 const v=value as Contribution|undefined;
 return v?.version===1&&v.kind==='contribution'&&['draft','committed'].includes(v.state)&&['human','mock'].includes(v.author)&&Array.isArray(v.replies)?v:undefined;
}
export function isConversation(value:unknown){const v=value as typeof conversationMetadata|undefined;return v?.version===1&&v.kind==='conversation';}
export const textBlock=(text=''):ExistingBlockDto=>({id:crypto.randomUUID(),type:'standoff-editor-block',text});
export function draftContribution():ExistingBlockDto {
 return {id:crypto.randomUUID(),type:'container-block',metadata:{dialectic:{version:1,kind:'contribution',state:'draft',author:'human',replies:[]}},children:[textBlock()]};
}
export function conversationDocument():ExistingBlockDto {
 const id=crypto.randomUUID();return {id,type:'document-block',metadata:{documentId:id,title:'New conversation',dialectic:conversationMetadata},children:[draftContribution()]};
}
export function conversationTabs(documents:readonly {id:string;title:string}[]):ExistingBlockDto {
 return {id:crypto.randomUUID(),type:'dialectic-application-block',children:[{id:crypto.randomUUID(),type:'tab-row-block',children:documents.map(d=>({id:crypto.randomUUID(),type:'tab-block',metadata:{name:d.title,documentTarget:{version:1,documentId:d.id}}}))}]};
}
export const targetKey=(t:ReplyTarget)=>JSON.stringify([t.resourceId,t.kind,t.blockId??t.anchorId??t.definitionId]);
export interface MockContext {target:ReplyTarget;text:string}
/** Deterministic native composition; IDs are allocated by the host, never by a provider. */
export function mockComposition(context:readonly MockContext[]):ExistingBlockDto[] {
 const excerpt=context[0]?.text.slice(0,280)||'(No plain text in this composition.)';
 return [textBlock('Mock assistant — a composition to explore'),
  {id:crypto.randomUUID(),type:'table-block',children:[{id:crypto.randomUUID(),type:'table-row-block',children:[
   {id:crypto.randomUUID(),type:'table-cell-block',children:[textBlock('Selected passage'),textBlock(excerpt)]},
   {id:crypto.randomUUID(),type:'table-cell-block',children:[textBlock('A possible next question'),textBlock('What evidence would strengthen or challenge this point?')]},
  ]}]},textBlock(`This deterministic example used ${context.length} explicitly selected context item${context.length===1?'':'s'}. It is a proposal, not a verified fact.`)];
}
