const test=require('node:test');const assert=require('node:assert/strict');const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('a real substitution observed once then followed by later words remains unresolved, not falsely verified',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 assert.equal(t.pendingErrors.size,1);
 t.feed('لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 assert.equal(t.errors.size,0);
 assert.equal(t.pendingErrors.size,1);
 // Known limitation: word-cursor advancement prevents an independent reobservation.
 // This is not successful recognition of the real mistake.
});
test('a matching follow-up cancels the pending mistake',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 t.cursor=0;
 t.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 assert.equal(t.pendingErrors.size,0);assert.equal(t.errors.size,0);
});
