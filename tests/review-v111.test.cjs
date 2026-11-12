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
function makeReviewModel(firsts,day='2026-11-10',cycle=7,completed=[],extra=[]){
 const kDate=k=>new Date(k+'T12:00:00Z');
 const daysBetween=(a,b)=>Math.round((kDate(b)-kDate(a))/86400000);
 const addDaysKeyV62=(k,n)=>new Date(kDate(k).getTime()+86400000*n).toISOString().slice(0,10);
 const logsByDate=new Map();
 const add=(p,date)=>{
  if(date>day)return;
  const log=logsByDate.get(date)||{date,revList:[]};
  if(!log.revList.some(x=>x.from===p))log.revList.push({from:p,to:p});
  logsByDate.set(date,log);
 };
 for(const [p,first] of Object.entries(firsts))
  for(let n=1;n<=30;n++)if(addDaysKeyV62(first,n)<day)add(+p,addDaysKeyV62(first,n));
 for(const p of completed)add(p,day);
 for(const {page,date} of extra)add(page,date);
 const S={farReviewCycleDays:cycle,pageReviewSched:{},recitationSessions:[],logs:[...logsByDate.values()],updatedAt:1};
 const sandbox={S,todayKey:()=>day,firstMemDateV62:p=>firsts[p]||null,firstMemDateMapV50:()=>firsts,
  daysBetween,addDaysKeyV62,pagesOfSurah:()=>[1,604],
  uniqueRecitationSessionsV163:()=>[],approvedRecitationFaceV149:()=>false,
  rangeSetV50:items=>new Set(items.flatMap(x=>Array.from({length:x.to-x.from+1},(_,i)=>x.from+i))),
  keyOf:d=>d.toISOString().slice(0,10),Date,Number,Math,Set,Object,String,Array,Map};
 const src=section('function farCycleDaysV111','function readingPinV86');
 vm.runInNewContext(src+';this.review={reviewEngineStateV62,reviewBucketsV50,farDailyQuotaV111}',sandbox);
 return{S,model:sandbox.review};
}
test('near review begins after memorization; far review requires thirty completed review days',()=>{
 const {model}=makeReviewModel({1:'2026-11-09',2:'2026-10-10'});
 assert.equal(model.reviewEngineStateV62(1).phase,'near');
 assert.equal(model.reviewEngineStateV62(1).due,true);
 assert.equal(model.reviewEngineStateV62(2).phase,'far');
 assert.equal(model.farDailyQuotaV111(),1);
});
test('far review divides eligible faces by the remaining cycle days',()=>{
 const {model}=makeReviewModel(Object.fromEntries(Array.from({length:25},(_,i)=>[i+1,'2026-10-09'])),'2026-11-10',10);
 assert.equal(model.farDailyQuotaV111(),3);
});
test('completed far face is included in quota without endless refill',()=>{
 const {model}=makeReviewModel({1:'2026-10-01',2:'2026-10-01',3:'2026-10-01'},'2026-11-10',7,[1]);
 const rows=model.reviewBucketsV50().far.slice(0,model.farDailyQuotaV111());
 assert.ok(rows.length>=1);
 assert.equal(rows[0].p,1);
});
test('recently reviewed far face is not re-scheduled before cycle elapses',()=>{
 const {model}=makeReviewModel({1:'2026-09-01'},'2026-11-10',7,[],[{page:1,date:'2026-11-09'}]);
 assert.equal(model.reviewEngineStateV62(1).due,false);
 assert.equal(model.reviewBucketsV50().far.length,0);
 assert.equal(model.reviewEngineStateV62(1).nextDue,'2026-11-16');
 assert.match(html,/cycle\.remaining\.slice\(\)\.sort/);
});
test('calendar labels are compact and preserve full-part names',()=>{
 const sandbox={Set,Array,Math,Number,Map,toAr:String};
 vm.createContext(sandbox);
 const definitions=section('const SURAHS = [','// تحويل قائمة إدخالات (سور/أوجه)');
 const formatter=section('/* v197: Calendar uses compact titles','function dayFactsV71');
 vm.runInContext(definitions+';this.JUZ_RANGE=JUZ_RANGE;this.SURAHS=SURAHS;'+formatter+';this.format=calendarPageSummaryV111;',sandbox);
 const f=sandbox.format;
 const range=(a,b)=>new Set(Array.from({length:b-a+1},(_,i)=>a+i));
 assert.equal(f(range(1,20),'مراجعة بعيدة'),'مراجعة بعيدة: الجزء 1');
 assert.equal(f(range(496,499),'حفظ',[{surahId:44,from:496,to:499}]),'حفظ: الدخان');
 assert.equal(f(range(496,497),'حفظ'),'حفظ: الدخان');
 assert.equal(f(range(582,604),'مراجعة قريبة',sandbox.SURAHS.filter(x=>x[0]>=78).map(x=>({surahId:x[0],from:x[2],to:(sandbox.SURAHS.find(y=>y[0]===x[0]+1)||[,,605])[2]-1||604}))),
 'مراجعة قريبة: الجزء 30 · عمّ');
});
test('today has no smart or fixation as a separate current task',()=>{
 const tasks=section('function tasksV50(){','function taskTotalsV50(){');
 assert.doesNotMatch(tasks,/id:'ai-review'/);
 assert.doesNotMatch(tasks,/id:'fix'/);
 assert.match(tasks,/id:'near'/);
 assert.match(tasks,/id:'far'/);
 assert.match(tasks,/dailyTaskOptions|optionalDailyItemsV111/);
});
