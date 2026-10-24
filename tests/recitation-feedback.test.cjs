const test=require('node:test');const assert=require('node:assert/strict');const {record,list,classify,summary,KEY}=require('../recitation-feedback.js');
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

test('three review labels persist in local storage and summary after reload',()=>{
 const store=memory();
 for(let i=0;i<4;i++)record(store,{automatic:true,session:'s'+i,vk:'76:1',wi:i,type:'substitution'});
 const entries=list(store);
 assert.equal(classify(store,entries[0].id,'correct_reading'),true);
 assert.equal(classify(store,entries[1].id,'actual_error'),true);
 assert.equal(classify(store,entries[2].id,'unsure'),true);
 assert.equal(classify(store,entries[3].id,'invalid'),false);
 const reloaded=JSON.parse(store.getItem(KEY));
 assert.deepEqual(reloaded.slice(0,3).map(x=>x.label),['correct_reading','actual_error','unsure']);
 assert.deepEqual(summary(store),{correct_reading:1,actual_error:1,unsure:1,unreviewed:1,total:4});
});
