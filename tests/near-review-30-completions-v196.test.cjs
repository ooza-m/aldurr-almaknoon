'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function section(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j);}
const add=(k,n)=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const diff=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
function model(date='2026-02-01',dates=[],sessions=[]){
 const first={8:'2026-01-01',9:'2026-01-01'};
 const S={updatedAt:1,pageReviewSched:{},farReviewCycleDays:7,
  logs:dates.map(day=>({date:day,revList:[{surahId:2,from:8,to:8}]})),recitationSessions:sessions};
 const c={S,todayKey:()=>date,firstMemDateV62:p=>first[p]||null,firstMemDateMapV50:()=>first,
  addDaysKeyV62:add,daysBetween:diff,farCycleDaysV111:()=>7,
  rangeSetV50:items=>new Set(items.flatMap(x=>Array.from({length:x.to-x.from+1},(_,i)=>x.from+i))),
  uniqueRecitationSessionsV163:rs=>rs,approvedRecitationFaceV149:(rs,p)=>p.complete===true&&p.manualConfirmed===true&&rs.userReviewed===true,
  keyOf:d=>d.toISOString().slice(0,10),surahOfPage:()=>[2,'البقرة'],
  toAr:String,document:{getElementById:()=>null},Set,Map,Object,Array,Date,Number,Math,String,
  MASTERY_LEVELS_V116:{}};
 vm.createContext(c);
 vm.runInContext(section('let reviewDayIndexCacheV196=null;','function fixationPagesV50(){'),c);
 vm.runInContext(section('function reviewCategoryForDayV196','function renderRevChips(){'),c);
 return c;
}
test('first day after memorization is due for near review',()=>{
 const c=model('2026-01-02');
 assert.equal(c.nearReviewProgressV196(8).completed,0);
 assert.equal(c.reviewEngineStateV62(8).phase,'near');
 assert.equal(c.reviewEngineStateV62(8).due,true);
});
test('30 distinct days advance to far only on the following day',()=>{
 const days=Array.from({length:30},(_,i)=>add('2026-01-01',i+1));
 const c=model('2026-01-31',days);
 assert.equal(c.nearReviewProgressV196(8).completed,30);
 assert.equal(c.nearReviewProgressV196(8).remaining,0);
 assert.equal(c.nearReviewProgressV196(8).phase,'near');
 assert.equal(c.nearReviewProgressV196(8).farFrom,'2026-02-01');
 assert.equal(c.reviewCategoryForDayV196(8,'2026-01-31'),'near');
 assert.equal(c.reviewCategoryForDayV196(8,'2026-02-01'),'far');
 assert.equal(c.nearReviewProgressV196(8,'2026-02-01').phase,'far');
});
test('one missed day extends near review by exactly one day',()=>{
 const days=Array.from({length:30},(_,i)=>add('2026-01-01',i+1)).filter(x=>x!=='2026-01-10');
 const c=model('2026-01-31',days);
 assert.equal(c.nearReviewProgressV196(8).completed,29);
 assert.equal(c.nearReviewProgressV196(8).remaining,1);
 assert.equal(c.nearReviewProgressV196(8).missed,1);
 assert.equal(c.nearReviewProgressV196(8).projectedCompletion,'2026-02-01');
 c.S.logs.push({date:'2026-02-01',revList:[{from:8,to:8}]});c.S.updatedAt++;
 assert.equal(c.nearReviewProgressV196(8,'2026-02-01').completed,30);
 assert.equal(c.nearReviewProgressV196(8,'2026-02-02').phase,'far');
});
test('missing a full week adds seven replacement days',()=>{
 const days=Array.from({length:30},(_,i)=>add('2026-01-01',i+1)).filter(x=>x<'2026-01-10'||x>'2026-01-16');
 const c=model('2026-01-31',days);
 assert.equal(c.nearReviewProgressV196(8).completed,23);
 assert.equal(c.nearReviewProgressV196(8).remaining,7);
 assert.equal(c.nearReviewProgressV196(8).missed,7);
 assert.equal(c.nearReviewProgressV196(8).projectedCompletion,'2026-02-07');
 for(let i=1;i<=7;i++)c.S.logs.push({date:add('2026-01-31',i),revList:[{from:8,to:8}]});
 c.S.updatedAt++;
 assert.equal(c.nearReviewProgressV196(8,'2026-02-07').completed,30);
 assert.equal(c.nearReviewProgressV196(8,'2026-02-08').phase,'far');
});
test('duplicate logs and confirmed recitation on same day count once',()=>{
 const stamp=Date.parse('2026-01-02T12:00:00Z');
 const c=model('2026-01-02',['2026-01-02','2026-01-02'],[{task:'near',endedAt:stamp,userReviewed:true,pages:[{page:8,complete:true,manualConfirmed:true}]}]);
 assert.equal(c.nearReviewProgressV196(8).completed,1);
 assert.equal(c.nearReviewProgressV196(8).remaining,29);
});
test('unapproved voice finding does not count as completed review',()=>{
 const stamp=Date.parse('2026-01-02T12:00:00Z');
 const c=model('2026-01-02',[],[{task:'near',endedAt:stamp,userReviewed:false,pages:[{page:8,complete:true,manualConfirmed:false}]}]);
 assert.equal(c.nearReviewProgressV196(8).completed,0);
});
test('manual input has no type selector and classifies face ranges automatically',()=>{
 assert.doesNotMatch(src,/id="rev-type"/);
 const c=model('2026-02-01',Array.from({length:30},(_,i)=>add('2026-01-01',i+1)));
 const kind=c.reviewCategoryForDayV196(8,'2026-02-01');
 assert.equal(kind,'far');
 const classified=c.classifiedManualReviewListV196([{surahId:2,from:8,to:9}],'2026-02-01');
 assert.equal(classified[0].type,'far');
 assert.equal(classified[1].type,'near');
 assert.equal(c.reviewBreakdownV196([{surahId:2,from:8,to:9}],'2026-02-01').near,1);
});
