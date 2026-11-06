const test=require('node:test');const assert=require('node:assert/strict');const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('an uncertain substitution in a transcript does not become a confirmed recitation error',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 assert.equal(t.errors.size,0,'one transcript is insufficient acoustic evidence');
 t.feed('لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 assert.equal(t.errors.size,0,'right-hand context must not count as confirmation');
});
test('a corrected follow-up does not leave a confirmed automatic error',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 t.cursor=0;
 t.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 assert.equal(t.errors.size,0,'verified or uncertain words cannot silently become persistent mistakes');
});
