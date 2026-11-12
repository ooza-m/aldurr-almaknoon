'use strict';
/* Regression coverage for 604-face Madani mushaf boundaries.
   Uses the very same tables and functions as index.html (not a copied map). */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function extract(pattern,label){
 const match=html.match(pattern);
 assert.ok(match,'Missing app definition: '+label);
 return match[0];
}
const declarations=[
 extract(/const SURAHS = \[[\s\S]*?\n\];/,'SURAHS'),
 extract(/const SURAH_SHARED_START_FACES_V209=new Set\(\[[\s\S]*?\]\);/,'shared faces'),
 extract(/function pagesOfSurah\(surahId\)\{[\s\S]*?\n\}/,'pagesOfSurah'),
 extract(/function splitRangeBySurah\(from,to,type\)\{[\s\S]*?\n\}/,'splitRangeBySurah'),
 '({SURAHS,pagesOfSurah,splitRangeBySurah,SURAH_SHARED_START_FACES_V209})'
].join('\n');
const {SURAHS,pagesOfSurah,splitRangeBySurah,SURAH_SHARED_START_FACES_V209:shared}=vm.runInNewContext(declarations);

test('all 114 surahs have valid bounds and cover all 604 faces',()=>{
 assert.equal(SURAHS.length,114);
 const used=new Set();
 for(const [id,,start] of SURAHS){
   const r=pagesOfSurah(id);
   assert.ok(r && r[0]===start && r[1]>=start && r[1]<=604,'invalid surah '+id);
   for(let p=r[0];p<=r[1];p++)used.add(p);
 }
 assert.equal(used.size,604);
 for(let p=1;p<=604;p++)assert.ok(used.has(p),'missing face '+p);
});

test('no fabricated overlap and no dropped true boundary faces',()=>{
 const examples=[
 [41,477,482],[42,483,489],
 [45,499,502],[46,502,506],
 [48,511,515],[49,515,517],
 [50,518,520],[51,520,523],[52,523,525],
 [53,526,528],[54,528,531],[55,531,534],
 [56,534,537],[57,537,541],
 [77,580,581],[78,582,583],[79,583,584],
 [80,585,586],[81,586,586],
 [112,604,604],[113,604,604],[114,604,604]
 ];
 for(const [id,from,to] of examples)assert.deepEqual(Array.from(pagesOfSurah(id)),[from,to],'surah '+id);
 assert.ok(!pagesOfSurah(41).includes(483));
 assert.ok(!pagesOfSurah(77).includes(582));
 assert.ok(pagesOfSurah(50).includes(520));
 assert.ok(pagesOfSurah(51).includes(520));
});

test('all verified consecutive overlaps and non-overlaps agree with lookup',()=>{
 for(let i=0;i<SURAHS.length-1;i++){
   const curr=SURAHS[i],next=SURAHS[i+1],finish=pagesOfSurah(curr[0])[1];
   const expected=next[2]===curr[2] || shared.has(next[2]);
   assert.equal(finish>=next[2],expected,'boundary of '+curr[1]+' / '+next[1]);
 }
});

test('manual entry range splitting preserves both surahs on shared faces',()=>{
 const at520=splitRangeBySurah(520,520);
 assert.deepEqual(Array.from(at520,x=>x.surahId),[50,51]);
 const at483=splitRangeBySurah(483,483);
 assert.deepEqual(Array.from(at483,x=>x.surahId),[42]);
 const at582=splitRangeBySurah(582,582);
 assert.deepEqual(Array.from(at582,x=>x.surahId),[78]);
 const at604=splitRangeBySurah(604,604);
 assert.deepEqual(Array.from(at604,x=>x.surahId),[112,113,114]);
});

test('surah-based juz 25–30 are complete with correct shared face endpoints',()=>{
 const specs=[[25,42,45,483,502],[26,46,50,502,520],
              [27,51,57,520,541],[28,58,66,542,561],
              [29,67,77,562,581],[30,78,114,582,604]];
 for(const [j,first,last,from,to] of specs){
   const covered=new Set();
   for(let id=first;id<=last;id++){
     const range=pagesOfSurah(id);
     for(let p=range[0];p<=range[1];p++)covered.add(p);
   }
   assert.ok(covered.has(from)&&covered.has(to),'part '+j);
   assert.equal(covered.size,to-from+1,'part '+j+' missing or extra faces');
   for(let p=from;p<=to;p++)assert.ok(covered.has(p),'part '+j+' face '+p);
 }
});
