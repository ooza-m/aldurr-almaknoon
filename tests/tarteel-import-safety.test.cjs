'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tarteel=require('../tarteel-merge.js');
const sample=()=>({schema:'durr-tarteel-confirm-v1',confirmed:true,owner:'test-user',errors:[{
 source:'tarteel',key:'tarteel:error:deadbeef',type:'MISSED_WORDS',
 positions:[{surah:2,ayah:118,word:4}],faces:[18],
 createdAt:'2026-11-10T12:00:00Z',expected:'الحق',received:''
}]});
test('confirmed Tarteel error imported once and not duplicated',()=>{
 const first=Tarteel.merge({errors:[]},sample());
 assert.equal(first.added,1);
 const second=Tarteel.merge(first.state,sample());
 assert.equal(second.added,0);
 assert.equal(second.skipped,1);
 assert.equal(second.state.errors.length,1);
});
test('rejects unconfirmed errors',()=>{
 const batch=sample();batch.confirmed=false;
 assert.throws(()=>Tarteel.merge({errors:[]},batch));
});
test('rejects invalid page mapping',()=>{
 const batch=sample();batch.errors[0].faces=[605];
 assert.throws(()=>Tarteel.merge({errors:[]},batch));
});
test('keeps manually entered errors when importing',()=>{
 const manual={id:'manual:1',date:'2026-11-10',type:'نسيان'};
 const merged=Tarteel.merge({errors:[manual]},sample());
 assert.equal(merged.added,1);
 assert.equal(merged.state.errors.length,2);
 assert.ok(merged.state.errors.some(x=>x.id==='manual:1'));
});
