const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function section(a,b){
 const first=html.indexOf(a),last=html.indexOf(b,first);
 assert.ok(first>=0&&last>first,'Expected source boundary '+a);
 return html.slice(first,last);
}
function makeReviewModel(firsts,day='2026-11-10',cycle=7,completed=[]){
 const S={farReviewCycleDays:cycle,pageReviewSched:{},logs:[]};
 const kDate=k=>new Date(k+'T12:00:00Z');
 const daysBetween=(a,b)=>Math.round((kDate(b)-kDate(a))/86400000);
 const addDaysKeyV62=(k,n)=>new Date(kDate(k).getTime()+86400000*n).toISOString().slice(0,10);
 const completedSet=new Set(completed);
 const sandbox={S,todayKey:()=>day,firstMemDateV62:p=>firsts[p]||null,firstMemDateMapV50:()=>firsts,completeReviewTodayV62:p=>completedSet.has(+p),daysBetween,addDaysKeyV62,pagesOfSurah:()=>[1,604],uniqueRecitationSessionsV163:()=>[],rangeSetV50:()=>new Set(),Date,Number,Math,Set,Object,String,Array};
 const src=section('function farCycleDaysV111','function readingPinV86');
 vm.runInNewContext(src+';this.review={reviewEngineStateV62,reviewBucketsV50,farDailyQuotaV111}',sandbox);
 return{S,model:sandbox.review,completedSet};
}
test('near review covers first 30 days and far review starts on day 31',()=>{
 const {model}=makeReviewModel({1:'2026-11-09',2:'2026-10-11'});
 assert.equal(model.reviewEngineStateV62(1).phase,'near');
 assert.equal(model.reviewEngineStateV62(1).due,true);
 assert.equal(model.reviewEngineStateV62(2).phase,'far');
 assert.equal(model.farDailyQuotaV111(),1);
});
test('far review divides the entire pool by the chosen cycle',()=>{
 const {model}=makeReviewModel(Object.fromEntries(Array.from({length:25},(_,i)=>[i+1,'2026-09-01'])),'2026-11-10',10);
 assert.equal(model.farDailyQuotaV111(),3);
});
test('completed far face is included in quota and does not cause endless refill',()=>{
 const {model}=makeReviewModel({1:'2026-09-01',2:'2026-09-01',3:'2026-09-01'},'2026-11-10',7,[1]);
 const rows=model.reviewBucketsV50().far.slice(0,model.farDailyQuotaV111());
 assert.ok(rows.length>=1,'The far-cycle quota includes the already completed face');
 assert.equal(rows[0].p,1);
});
test('a recently completed far face is not re-scheduled before cycle elapses',()=>{
 const {S,model}=makeReviewModel({1:'2026-09-01'});
 S.pageReviewSched[1]={page:1,firstMemDate:'2026-09-01',lastReview:'2026-11-09'};
 assert.equal(model.reviewEngineStateV62(1).due,false);
 const rows=model.reviewBucketsV50().far;
 assert.equal(rows.length,0,'Future-due faces do not appear in today\'s far-review bucket');
 assert.equal(model.reviewEngineStateV62(1).nextDue,'2026-11-16');
 const app=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(app,/cycle\.remaining\.slice\(\)\.sort/);
});
test('calendar labels a complete juz, a complete surah, and a page range',()=>{
 const SURAHS=[[44,'الدخان',496],[45,'الجاثية',499],[46,'الأحقاف',502]];
 const JUZ_RANGE=[[1,20],[21,40]];
 const sandbox={SURAHS,JUZ_RANGE,Set,Array,Math,Number,Map};
 sandbox.surahOfPage=p=>{let s=SURAHS[0];for(const item of SURAHS)if(item[2]<=p)s=item;return s;};
 sandbox.pagesOfSurah=id=>id===44?[496,499]:id===45?[499,502]:[502,604];
 vm.runInNewContext(section('function calendarPageSummaryV111','function dayFactsV71')+';this.format=calendarPageSummaryV111;',sandbox);
 const format=sandbox.format;
 assert.equal(format(new Set(Array.from({length:20},(_,i)=>i+1)),'مراجعة بعيدة'),'مراجعة بعيدة: الجزء 1');
 assert.equal(format(new Set([496,497,498,499]),'حفظ',[{surahId:44,from:496,to:499}]),'حفظ سورة الدخان');
 assert.equal(format(new Set([496,497]),'حفظ'),'حفظ سورة الدخان: ص496–497');
});
test('today has no smart or fixation as a separate current task',()=>{
 const tasks=section('function tasksV50(){','function taskTotalsV50(){');
 assert.doesNotMatch(tasks,/id:'ai-review'/);
 assert.doesNotMatch(tasks,/id:'fix'/);
 assert.match(tasks,/id:'near'/);
 assert.match(tasks,/id:'far'/);
 assert.match(tasks,/dailyTaskOptions|optionalDailyItemsV111/);
});
