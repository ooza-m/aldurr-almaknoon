const test=require('node:test');
const assert=require('node:assert/strict');
const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('classic detects substitution before forward cursor moves',()=>{
 const tracker=new Tracker(words);
 tracker.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 const pending=tracker.pendingErrors.get('76:1#6');
 assert.equal(pending,undefined);
 tracker.feed('لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 assert.equal(tracker.errors.size,1);
 assert.equal(tracker.pendingErrors.has('76:1#6'),false);
 assert.equal(tracker.errors.get('76:1#6')?.type,'substitution');
 // Not a success case: documents current sensitivity gap, not detection.
});
