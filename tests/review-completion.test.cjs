const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function extract(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'Missing '+name);
  const brace=source.indexOf('{',start);
  let depth=0,quote='',escaped=false,template=false;
  // These targeted functions have no template literals in their bodies.
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(quote){if(escaped){escaped=false;continue;}if(ch==='\\'){escaped=true;continue;}if(ch===quote)quote='';continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}') {depth--;if(depth===0)return source.slice(start,i+1);}
  }
  throw Error('Unclosed function '+name);
}
function setup(){
 const day='2026-10-31',ts=new Date(day+'T12:00:00').getTime();
 const S={logs:[],recitationSessions:[],faceLearning:{},pageReviewSched:{}};
 const ctx={S,Set,Date,Math,Map,Number,todayKey:()=>day,
 keyOf:()=>day,
 pagesOfSurah:()=>[10,12],todayLogV50:()=>S.logs.find(x=>x.date===day)||{},rangeSetV50:(list)=>new Set((list||[]).flatMap(x=>Array.from({length:(x.to||x.from)-(x.from||x.to)+1},(_,i)=>(x.from||x.to)+i))),
 memCount:()=>100,firstMemDateV62:()=> '2026-09-01',recitedPagesTodayV51:()=>new Set(),
 dayFactsV71:()=>({}),reviewBucketsV50:()=>({near:[],far:[]})};
 vm.createContext(ctx);
 vm.runInContext(['completeReviewTodayV62','recitedPagesTodayV51','taskPagesV60'].map(extract).join('\n'),ctx);
 return{ctx,S,day,ts};
}
test('scheduled Mushaf completion counts once and is no longer due',()=>{
 const {ctx,S,ts}=setup();
 S.recitationSessions.push({id:'session1',task:'near',endedAt:ts,pages:[{page:10,complete:true,coverage:1}]});
 assert.equal(ctx.completeReviewTodayV62(10),true);
 S.recitationSessions.push({...S.recitationSessions[0]});
 assert.equal(ctx.completeReviewTodayV62(10),true);
});
test('manual review counts the selected face and does not require voice scoring',()=>{
 const{ctx,S,day}=setup();
 S.logs.push({date:day,revList:[{surahId:2,from:10,to:10,type:'near'}]});
 assert.equal(ctx.completeReviewTodayV62(10),true);
 assert.equal(ctx.completeReviewTodayV62(11),false);
});
test('free recitation and unfinished review do not mark planned review complete',()=>{
 const{ctx,S,ts}=setup();
 S.recitationSessions.push({task:'free',endedAt:ts,pages:[{page:10,complete:true,coverage:1}]});
 S.recitationSessions.push({task:'near',endedAt:ts,pages:[{page:10,complete:false,coverage:.7}]});
 assert.equal(ctx.completeReviewTodayV62(10),false);
});
test('manual and Mushaf completion overlap without duplicating due tasks',()=>{
 const{ctx,S,day,ts}=setup();
 S.logs.push({date:day,revList:[{surahId:2,from:10,to:10,type:'near'}]});
 S.recitationSessions.push({task:'near',endedAt:ts,pages:[{page:10,complete:true,coverage:1}]});
 ctx.reviewEngineStateV62=()=>({due:false,phase:'near'});
 assert.equal(ctx.taskPagesV60('near').length,0);
 assert.equal(ctx.completeReviewTodayV62(10),true);
});