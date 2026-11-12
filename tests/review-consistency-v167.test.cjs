'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function sourceBetween(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a!==-1&&b>a,'Missing review function: '+start);
 return html.slice(a,b);
}
const firstDatesSource=sourceBetween('function firstMemDateMapV50(){','\nconst NEAR_INTERVALS_V62');
const taskPagesSource=sourceBetween('function taskPagesV60(id){','\n/* v111 · extra user-defined review paths');
function run(source,context){vm.runInNewContext(source,context,{timeout:1000});return context;}

test('the earliest confirmed memorization date wins across manual logs and recitations',()=>{
 const S={logs:[{date:'2026-11-08',memList:[{surahId:1,from:496,to:496}]}],recitationSessions:[{task:'new',endedAt:'2026-11-03T12:00:00',pages:[{page:496,complete:true}]}],updatedAt:1};
 const ctx={S,firstMemDateCacheV111:null,uniqueRecitationSessionsV163:a=>a,approvedRecitationFaceV149:(_,p)=>p.complete,pagesOfSurah:()=>null,keyOf:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 run(firstDatesSource,ctx);
 assert.equal(ctx.firstMemDateMapV50()[496],'2026-11-03');
});
test('duplicate sources do not create multiple memorization faces',()=>{
 const S={logs:[{date:'2026-11-03',memList:[{surahId:1,from:496,to:496},{surahId:1,from:496,to:496}]}],recitationSessions:[{task:'new',endedAt:'2026-11-03T12:00:00',pages:[{page:496,complete:true}]}],updatedAt:1};
 const ctx={S,firstMemDateCacheV111:null,uniqueRecitationSessionsV163:a=>a,approvedRecitationFaceV149:(_,p)=>p.complete,pagesOfSurah:()=>null,keyOf:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 run(firstDatesSource,ctx);
 assert.equal(Object.keys(ctx.firstMemDateMapV50()).length,1);
});
test('completed far review does not hide another due page before daily quota',()=>{
 const completed=new Set([496]);
 const bucket={far:[{p:496,doneToday:true,due:'2026-11-10'},{p:497,doneToday:false,due:'2026-11-10'},{p:498,doneToday:false,due:'2026-11-10'}],near:[]};
 const ctx={S:{profile:{pathDir:'up'}},todayKey:()=> '2026-11-10',todayLogV50:()=>({memList:[],revList:[]}),rangeSetV50:()=>new Set(),recitedPagesTodayV51:()=>new Set(),reviewBucketsV50:()=>bucket,farDailyQuotaV111:()=>2,completeReviewTodayV62:p=>completed.has(p)};
 ctx.farCycleStateV177=()=>({remaining:[497,498],todayDone:1,target:2});ctx.reviewEngineStateV62=()=>({overdueDays:0});
 run(taskPagesSource,ctx);
 assert.deepEqual(Array.from(ctx.taskPagesV60('far')),[497]);
});
test('far quota cannot fabricate missing eligible pages',()=>{
 const bucket={far:[{p:496,doneToday:false,due:'2026-11-10'},{p:497,doneToday:false,due:'2026-11-11'}],near:[]};
 const ctx={S:{profile:{pathDir:'up'}},todayKey:()=> '2026-11-10',todayLogV50:()=>({memList:[],revList:[]}),rangeSetV50:()=>new Set(),recitedPagesTodayV51:()=>new Set(),reviewBucketsV50:()=>bucket,farDailyQuotaV111:()=>3,completeReviewTodayV62:()=>false};
 ctx.farCycleStateV177=()=>({remaining:[496,497],todayDone:0,target:3});ctx.reviewEngineStateV62=()=>({overdueDays:0});
 run(taskPagesSource,ctx);
 assert.deepEqual(Array.from(ctx.taskPagesV60('far')),[496,497]);
});

test('memorization stored in face-learning remains visible even without manual logs',()=>{
 const S={logs:[],recitationSessions:[],faceLearning:{501:{hifz:{first:'2026-10-04'}}},updatedAt:1};
 const ctx={S,firstMemDateCacheV111:null,uniqueRecitationSessionsV163:a=>a,approvedRecitationFaceV149:()=>false,pagesOfSurah:()=>null,keyOf:()=>''};
 run(firstDatesSource,ctx);
 assert.equal(ctx.firstMemDateMapV50()[501],'2026-10-04');
});
