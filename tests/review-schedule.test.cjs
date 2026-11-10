const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=src.indexOf('function updateReviewEngineV62(');
const end=src.indexOf('function fixationPagesV50(',start);
assert.ok(start>0&&end>start,'review engine source found');
function harness(){
 const S={pageReviewSched:{}};
 const ctx={S,firstMemDateV62:()=> '2026-09-01',daysBetween:(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000),
 addDaysKeyV62:(d,n)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10),
 NEAR_INTERVALS_V62:[1,3,7,14,30,60],FAR_INTERVALS_V62:[7,14,30,60,90,120],
 MASTERY_LEVELS_V116:{weak:'متفلّت',needs:'يحتاج تثبيت',good:'جيد',strong:'ثابت'},Date};
 vm.createContext(ctx);vm.runInContext("function farCycleDaysV111(){return Number.isInteger(+S.farReviewCycleDays)&&+S.farReviewCycleDays>=1?+S.farReviewCycleDays:7;}\n"+src.slice(start,end),ctx);return ctx;
}
test('same session cannot advance schedule twice',()=>{
 const c=harness();c.updateReviewEngineV62(125,'near','2026-11-03',{manualMasteryLevel:'good',coverage:1},'session-a');
 const state=JSON.stringify(c.S.pageReviewSched[125]);
 c.updateReviewEngineV62(125,'near','2026-11-03',{manualMasteryLevel:'good',coverage:1},'session-a');
 assert.equal(JSON.stringify(c.S.pageReviewSched[125]),state);
});
test('new distinct session may advance schedule',()=>{
 const c=harness();c.updateReviewEngineV62(125,'near','2026-11-03',{manualMasteryLevel:'good'},'session-a');
 const x=c.S.pageReviewSched[125].lastReview;
 c.updateReviewEngineV62(125,'near','2026-11-04',{manualMasteryLevel:'good'},'session-b');
 assert.ok(c.S.pageReviewSched[125].lastReview>x);assert.equal(c.S.pageReviewSched[125].lastSessionId,'session-b');
});
test('ungraded session does not receive inferred mastery score',()=>{
 const c=harness();c.updateReviewEngineV62(125,'near','2026-11-03',{coverage:1,score:100},'session-a');
 assert.equal(c.S.pageReviewSched[125].lastScore,undefined);
 assert.equal(c.S.pageReviewSched[125].lastSessionId,'session-a');
});
