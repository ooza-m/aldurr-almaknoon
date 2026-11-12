'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function section(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'source boundary '+a);return html.slice(i,j);}
const date=(k,n)=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
function labelModel(){
 const c={Set,Map,Array,Date,Number,Math,String,toAr:String};
 vm.createContext(c);
 vm.runInContext(section('const SURAHS = [','// تحويل قائمة إدخالات (سور/أوجه)')+section('/* v197: Calendar uses compact titles','function dayFactsV71')+';this.label=calendarPageSummaryV111;this.groups=calendarCompactGroupsV197;this.surahs=SURAHS;',c);
 return c;
}
const entries=(c,a,b)=>c.surahs.filter(x=>x[0]>=a&&x[0]<=b).map(x=>({surahId:x[0],from:x[2],to:((c.surahs.find(y=>y[0]===x[0]+1)||[,,605])[2]-1)<x[2]?x[2]:(c.surahs.find(y=>y[0]===x[0]+1)||[,,605])[2]-1}));
const pageSet=items=>new Set(items.flatMap(x=>Array.from({length:x.to-x.from+1},(_,i)=>x.from+i)));
test('five final juz are recognized by complete named surahs',()=>{
 const c=labelModel();
 for(const [j,n,a,b] of [[26,'الأحقاف',46,50],[27,'الذاريات',51,57],[28,'المجادلة',58,66],[29,'تبارك',67,77],[30,'عمّ',78,114]]){
  const source=entries(c,a,b),out=c.label(pageSet(source),'مراجعة',source);
  assert.equal(out,'مراجعة: الجزء '+j+' · '+n,out);
 }
});
test('partial contiguous surah runs are concise; missing one surah prevents complete-juz label',()=>{
 const c=labelModel(),list=[...entries(c,78,81),...entries(c,111,114)];
 assert.equal(c.label(pageSet(list),'مراجعة قريبة',list),'مراجعة قريبة: النبأ - التكوير، المسد - الناس');
 const almost=entries(c,78,113);
 assert.doesNotMatch(c.label(pageSet(almost),'مراجعة بعيدة',almost),/الجزء 30/);
});
test('compact calendar rows retain full day-specific details only in day modal',()=>{
 const render=html.slice(html.indexOf('function renderWeek(){'));
 assert.match(render,/calendarPageSummaryV111\(f\.groups\.near/);
 assert.match(render,/calendarPageSummaryV111\(f\.groups\.far/);
 assert.match(render,/function openDay\(k\)/);
 assert.match(render,/تفاصيل الأوجه/);
 assert.match(render,/surahOfPage\(p\)\[1\]/);
});
test('historical memorized faces graduate without fabricating 30 review completions',()=>{
 const S={logs:[],recitationSessions:[],pageReviewSched:{},updatedAt:1};
 const first={100:'2026-09-01',101:'2026-10-13'};
 const c={S,Set,Map,Object,Array,Date,Math,Number,String,
  firstMemDateV62:p=>first[p]||null,firstMemDateMapV50:()=>first,todayKey:()=> '2026-11-12',
  daysBetween:days,addDaysKeyV62:date,rangeSetV50:()=>new Set(),uniqueRecitationSessionsV163:()=>[],
  approvedRecitationFaceV149:()=>false,keyOf:d=>d.toISOString().slice(0,10),
  farCycleDaysV111:()=>7,MASTERY_LEVELS_V116:{}};
 vm.createContext(c);
 vm.runInContext(section('let reviewDayIndexCacheV196=null','function fixationPagesV50()'),c);
 const old=c.nearReviewProgressV196(100),recent=c.nearReviewProgressV196(101);
 assert.equal(old.phase,'far');assert.equal(old.legacyGraduated,true);assert.equal(old.completed,0);
 assert.equal(recent.phase,'near');assert.equal(recent.remaining,30);
 assert.equal(c.reviewEngineStateV62(100).phase,'far');
});
