'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const DurrData=require('../app-data.js');

function validState(){return {pages:{},logs:[{date:'2026-11-10',memList:[],revList:[]}],stages:[],errors:[],profile:{name:'اختبار'}};}
test('valid backup is accepted without mutating the input',()=>{
 const state=validState(),original=JSON.stringify(state);
 const result=DurrData.validate({format:'durr-backup',state,displayPreferences:{palette:'rose',digits:'en',calendar:'gregorian'}});
 assert.deepEqual(result.state,state);
 assert.equal(JSON.stringify(state),original);
});
test('rejects invalid calendar dates and impossible pages',()=>{
 assert.throws(()=>DurrData.validate({...validState(),logs:[{date:'2026-02-30'}]}));
 assert.throws(()=>DurrData.validate({...validState(),errors:[{date:'2026-11-10',page:605}]}));
});
test('rejects prototype pollution keys, even when nested',()=>{
 const tampered=JSON.parse('{"pages":{},"logs":[],"profile":{"__proto__":{"isAdmin":true}}}');
 assert.throws(()=>DurrData.validate(tampered));
 assert.equal({}.isAdmin,undefined);
});
test('rejects invalid review cycles and extra review page boundaries',()=>{
 assert.throws(()=>DurrData.validate({...validState(),farReviewCycleDays:0}));
 assert.throws(()=>DurrData.validate({...validState(),extraReviewPlans:[{id:'a',from:0,to:604,dailyPages:5,direction:'up',startDate:'2026-11-10'}]}));
});
test('preserves unrelated fields when merging state defaults',()=>{
 const result=DurrData.merge({profile:{name:'',language:'ar'},pages:{},logs:[]},{profile:{name:'مستخدم'},pages:{'496':{mastered:true}}});
 assert.equal(result.profile.language,'ar');
 assert.equal(result.profile.name,'مستخدم');
 assert.equal(result.pages['496'].mastered,true);
});