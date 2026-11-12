'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const first=html.indexOf('function weeklyMemorizationV135(');
const last=html.indexOf('function taskPagesV60(',first);
assert.ok(first>=0&&last>first);
const source=html.slice(first,last);
function run({daily=1,weekly=3,mode='halaqa',date='2026-11-12',memorized=[]}={}){
 const ctx={
  S:{goal:{pages:daily},weeklyMemGoal:weekly,logs:memorized.length?[{date,memList:memorized.map(p=>({from:p,to:p}))}]:[],recitationSessions:[]},
  todayKey:()=>date,
  addDaysKeyV62:(k,shift)=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+shift);return d.toISOString().slice(0,10);},
  pagesOfSurah:()=>null,uniqueRecitationSessionsV163:x=>x,approvedRecitationFaceV149:()=>false,keyOf:d=>d.toISOString().slice(0,10),
  reviewWeekModeV126:()=>mode,Date,Number,Math,Set,Object,Array
 };
 vm.createContext(ctx);
 vm.runInContext(source,ctx);
 return ctx.weeklyMemorizationV135(date);
}
test('1 daily and 3 weekly assigns exactly one face in halaqa week',()=>{
 const result=run();assert.equal(result.dayTarget,1);assert.equal(result.goal,3);
});
test('daily target changes to 2 independent of weekly target',()=>{
 assert.equal(run({daily:2,weekly:18}).dayTarget,2);
});
test('previously completed daily faces are not ignored or assigned again',()=>{
 const result=run({daily:1,weekly:3,memorized:[1]});assert.equal(result.dayTarget,1);assert.equal(result.todayDone,1);
});
test('daily review-week mode honors the same configured memorization target',()=>{
 assert.equal(run({daily:1,weekly:20,mode:'daily'}).dayTarget,1);
});
test('non-memorization days remain free of new tasks in halaqa mode',()=>{
 assert.equal(run({daily:1,weekly:3,date:'2026-11-13'}).dayTarget,0);
});
