'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function extract(start,end){const i=html.indexOf(start),j=html.indexOf(end,i+start.length);assert(i>=0&&j>i,'Function source not found: '+start);return html.slice(i,j);}
const add=(key,n)=>{const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const diff=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const js=(x)=>JSON.parse(JSON.stringify(x));
function stageHarness(stages,dates={}){
 const c={S:{stages,profile:{pathDir:'up'}},AR_ORD:['','الأولى','الثانية','الثالثة','الرابعة'],JUZ_RANGE:Array.from({length:30},(_,i)=>[i===0?1:i*20+2,i===29?604:(i+1)*20+1]),firstMemDateMapV50:()=>dates,buildStagePath:()=>[],Set,Map,Math,Number,String,Array};
 vm.createContext(c);vm.runInContext(extract('function stageTitleV177(','// يبني قائمة المرحليات'),c);return c;
}
test('stage titles reflect new position, while historical examination fields remain',()=>{
 const stages=[{name:'المرحلية الثالثة',range:'الجزء ٢٥ و٢٦',status:'done',date:'2026-10-01'},{name:'المرحلية الأولى',range:'الجزء ١ و٢',status:'current'}];
 const c=stageHarness(stages);c.normalizeStageNamesV177();
 assert.equal(stages[0].name,'المرحلية الأولى');assert.equal(stages[0].date,'2026-10-01');
 assert.equal(stages[1].name,'المرحلية الثانية');assert.equal(stages[0].status,'done');
});
test('after six memorized parts, newly suggested page comes from first unmemorized stage',()=>{
 const stages=[{range:'الجزء ٢٥ و٢٦'},{range:'الجزء ٢٧ و٢٨'},{range:'الجزء ٢٩ و٣٠'},{range:'الجزء ١ و٢'}],dates={};
 // Use the test harness' consistent Juz bounds, not production dates.
 const temp=stageHarness(stages);for(let j=25;j<=30;j++){const [a,b]=temp.JUZ_RANGE[j-1];for(let p=a;p<=b;p++)dates[p]='2026-01-01';}
 const c=stageHarness(stages,dates);assert.deepEqual(Array.from(c.nextStageNewPagesV177(3)),[1,2,3]);
});
function reviewHarness(logs,farFirst,recitationSessions=[]){
 const S={logs,recitationSessions};
 const ctx={S,Set,Map,Object,Math,Number,Array,Date,firstMemDateMapV50:()=>farFirst,farCycleDaysV111:()=>7,addDaysKeyV62:add,daysBetween:diff,todayKey:()=> '2026-11-14',
  rangeSetV50:items=>new Set(items.flatMap(x=>Array.from({length:x.to-x.from+1},(_,i)=>x.from+i))),
  uniqueRecitationSessionsV163:x=>x,approvedRecitationFaceV149:(rs,pg)=>pg.complete===true&&pg.manualConfirmed===true&&rs.userReviewed===true,
  keyOf:d=>d.toISOString().slice(0,10)};
 vm.createContext(ctx);vm.runInContext(extract('function farCycleStateV177(','function farDailyQuotaV111(){'),ctx);return ctx;
}
test('far review counts unique pages irrespective of order and never counts duplicates',()=>{
 const first={1:'2026-10-06',2:'2026-10-06',3:'2026-10-06',4:'2026-10-06'};
 const ctx=reviewHarness([{date:'2026-11-12',revList:[{from:4,to:4}]},{date:'2026-11-13',revList:[{from:2,to:2}]},{date:'2026-11-14',revList:[{from:4,to:4},{from:1,to:1}]}],first);
 const a=ctx.farCycleStateV177();assert.deepEqual(Array.from(a.remaining),[3]);assert.equal(a.todayDone,2);assert.equal(a.target,1);assert.equal(a.cycleComplete,false);
});
test('daily far target does not increase when an additional face is marked today',()=>{
 const first={1:'2026-10-06',2:'2026-10-06',3:'2026-10-06',4:'2026-10-06'};
 const base=reviewHarness([{date:'2026-11-12',revList:[{from:4,to:4}]}],first).farCycleStateV177();
 const after=reviewHarness([{date:'2026-11-12',revList:[{from:4,to:4}]},{date:'2026-11-14',revList:[{from:1,to:2}]}],first).farCycleStateV177();
 assert.equal(base.target,after.target);assert.equal(after.todayDone,2);
});
test('cycle completes only when all four distinct eligible faces are covered',()=>{
 const first={1:'2026-10-06',2:'2026-10-06',3:'2026-10-06',4:'2026-10-06'};
 const ctx=reviewHarness([{date:'2026-11-12',revList:[{from:4,to:4}]},{date:'2026-11-13',revList:[{from:2,to:2}]},{date:'2026-11-14',revList:[{from:1,to:3}]}],first);
 assert.equal(ctx.farCycleStateV177().cycleComplete,true);
});
