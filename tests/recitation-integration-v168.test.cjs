'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function cut(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing production function: '+start);
 return html.slice(a,b);
}
const code=cut('function approvedRecitationFaceV149(rs,pg){','let firstMemDateCacheV111')+'\n'+cut('function recitationSessionStatusV163(session){','function localReviewDraftsV163');
const ctx={};
vm.runInNewContext(code,ctx,{timeout:1000});
const status=ctx.recitationSessionStatusV163;
test('incomplete recitation cannot complete a review',()=>{
 const result=status({task:'near',version:150,userReviewed:true,pages:[{page:51,complete:false,manualConfirmed:true}]});
 assert.equal(result.key,'draft');assert.equal(result.confirmed,0);
});
test('completed but unreviewed ASR cannot complete a review',()=>{
 const result=status({task:'far',version:150,userReviewed:false,pages:[{page:51,complete:true,manualConfirmed:true}]});
 assert.equal(result.key,'draft');
});
test('duplicate face snapshots count as one approved face',()=>{
 const result=status({task:'far',version:150,userReviewed:true,pages:[{page:51,complete:false},{page:51,complete:true,manualConfirmed:true}]});
 assert.equal(result.key,'approved');assert.equal(result.total,1);assert.equal(result.confirmed,1);
});
test('one confirmed face out of two is a partial approval',()=>{
 const result=status({task:'near',version:150,userReviewed:true,pages:[{page:51,complete:true,manualConfirmed:true},{page:52,complete:false}]});
 assert.equal(result.key,'partial');assert.equal(result.confirmed,1);assert.equal(result.total,2);
});
test('free follow-along never automatically approves a memorization task',()=>{
 const result=status({task:'free',version:150,userReviewed:true,pages:[{page:51,complete:true,manualConfirmed:true}]});
 assert.equal(result.key,'follow');assert.equal(result.confirmed,0);
});
test('new memorization is not recorded as a completed review',()=>{
 const engine=cut('function ingestRecitationSessionV51(raw){',"window.addEventListener('message',e=>");
 assert.match(engine,/if\(\['fix','near','far'\]\.includes\(task\)\)updateReviewEngineV62/);
});
test('face effects deduplicate repeated snapshots without deleting raw history',()=>{
 const engine=cut('function ingestRecitationSessionV51(raw){',"window.addEventListener('message',e=>");
 assert.match(engine,/const effectPagesV168=new Map\(\)/);
 assert.match(engine,/for\(const pg of effectPagesV168\.values\(\)\)/);
});
