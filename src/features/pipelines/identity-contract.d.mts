export interface IdentitySource {resourceId:string;entityId:string;revision:number;name:string;typename:string;description:string;aliases:string[];enrichment:{subtypes?:string[];dates?:unknown[];externalIds?:{namespace:string;value:string}[]};provenance:unknown}
export interface IdentityChoices {name:'keep'|'import';aliases:'keep'|'merge';description:'keep'|'import'|'both';typename:'keep'|'import';enrichment:'keep'|'merge'}
export function identitySource(value:unknown):IdentitySource;
export function identityChoices(value:unknown):IdentityChoices;
