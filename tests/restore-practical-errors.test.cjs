const test=require('node:test');const assert=require('node:assert/strict');const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('final speech can restore detectable omission with context',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من لم يكن شيئا مذكورا',{source:'browser-speech',observationId:'final'});
 assert.ok([...t.errors.values()].some(e=>e.type==='omission'));
});
test('correct recitation never raises errors',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'browser-speech'});
 assert.equal(t.errors.size,0);
});
