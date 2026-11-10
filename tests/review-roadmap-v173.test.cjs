'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('function wardReviewRoadmapV205(){');
const end=html.indexOf('\nfunction renderMap(){',start);
assert.ok(start>=0&&end>start,'Roadmap function is present');
const fn=html.slice(start,end);
function render(assignments){
 const host={innerHTML:'',querySelectorAll(){return []}},counter={textContent:''};
 const ctx={
   document:{getElementById:id=>({wardReviewRoadmap:host,wardReviewTotal:counter}[id]||null)},
   firstMemDateV62:p=>p<=6?'2026-09-01':null,
   reviewEngineStateV62:p=>({phase:p<=3?'near':'far',day:p,doneToday:p===2||p===4,due:p!==2&&p!==4,nextDue:'2026-11-10'}),
   taskPagesV60:kind=>assignments[kind]||[],
   surahOfPage:()=>[2,'البقرة'],farDailyQuotaV111:()=>3,farCycleDaysV111:()=>7,
   toAr:String,esc:String,openPage:()=>{}
 };
 new Function('ctx','with(ctx){'+fn+';wardReviewRoadmapV205()}')(ctx);
 return {body:host.innerHTML,summary:counter.textContent};
}
test('today tab and roadmap share the same assigned faces',()=>{
 const x=render({near:[1,3],far:[5]});
 assert.match(x.summary,/3 أوجه اليوم/);
 assert.match(x.body,/الأوجه المطلوبة الآن/);
 assert.match(x.body,/data-ward-face="5"/);
});
test('both review tracks are optional details and not a wall of text',()=>{
 const x=render({near:[1],far:[5]});
 assert.equal((x.body.match(/class="review-details-v173"/g)||[]).length,2);
 assert.match(x.body,/المراجعة القريبة/);assert.match(x.body,/المراجعة البعيدة/);
});
test('zero remaining work is clear and does not claim review history is empty',()=>{
 const x=render({near:[],far:[]});
 assert.match(x.summary,/لا مراجعات متبقية اليوم/);
 assert.match(x.body,/لا توجد أوجه مطلوبة حاليًا/);
 assert.match(x.body,/تفاصيل المسارين/);
});
test('review roadmap contains no writes to learning records',()=>{
 assert.doesNotMatch(fn,/\bsave\s*\(/);
 assert.doesNotMatch(fn,/S\.(logs|pageReviewSched|faceLearning)\s*=/);
});
