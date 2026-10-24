const test=require('node:test');const assert=require('node:assert/strict');
const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('a prior suspicious word exposes bounded reference context without certification',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 t.feed('لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 const window=t.reviewWindow('76:1#6');
 assert.ok(window);
 assert.equal(window.focus,6);
 assert.ok(window.expected.includes('الدهر'));
 assert.equal(window.requiresNewAudio,true);
 assert.equal(window.confirmed,false);
 assert.equal(t.errors.size,0);
});
test('no window exists for absent candidate',()=>{assert.equal(new Tracker(words).reviewWindow('76:1#6'),null)});
