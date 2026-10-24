const test=require('node:test');const assert=require('node:assert/strict');const {record,KEY}=require('../recitation-feedback.js');
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values}};
test('records only dismissed automatic findings, never audio or transcript',()=>{
 const store=memory();
 assert.equal(record(store,{automatic:true,session:'s1',vk:'76:1',wi:2,type:'substitution',heard:'secret audio transcript'}),true);
 const payload=store.getItem(KEY);assert.ok(payload);assert.equal(payload.includes('secret audio transcript'),false);
});
test('rejects repeated dismissal of the same finding',()=>{
 const store=memory(),e={automatic:true,session:'s1',vk:'76:1',wi:2,type:'substitution'};
 assert.equal(record(store,e),true);assert.equal(record(store,e),false);
 assert.equal(JSON.parse(store.getItem(KEY)).length,1);
});
test('does not store manual annotations as machine feedback',()=>{
 const store=memory();assert.equal(record(store,{automatic:false,session:'s1',vk:'76:1',wi:2}),false);assert.equal(store.getItem(KEY),null);
});
