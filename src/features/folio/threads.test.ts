import {expect,it} from 'vitest';
import {resolveThreads,type ThreadLink} from './threads';

it('resolves a synthetic Dialectic contribution and canonical Folio passage without promoting attribution to reviewed evidence',()=>{
 const clip={left:0,top:0,right:500,bottom:300};
 const passage='fixture-publication/paragraph-12#4-19',contribution='fixture-symposium/contribution-7';
 const endpoints=new Map([[contribution,[{occurrence:'answer',rects:[{left:15,right:100,top:20,bottom:35}],clip}]],
  [passage,[{occurrence:'page-3',rects:[{left:280,right:330,top:80,bottom:100}],clip},
    {occurrence:'unmounted-page',rects:[],clip}]]]);
 const link:ThreadLink={id:'fixture-attribution',from:contribution,to:passage,kind:'evidence',origin:'ai-attributed',review:'unverified'};
 expect(resolveThreads([link],endpoints,clip)).toEqual([{...link,occurrences:['answer','page-3'],path:'M100 27.5 C190 27.5 190 90 280 90'}]);
 expect(resolveThreads([link],endpoints,{...clip,right:200})).toEqual([]);
});
