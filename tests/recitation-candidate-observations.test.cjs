const test = require('node:test');
const assert = require('node:assert/strict');
const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('unconfirmed automatic findings do not trigger active errors',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'chunk-1'});
 assert.equal(t.errors.size,0);
 assert.ok(t.pendingErrors instanceof Map);
});
test('correctly recognized words clear prior candidates',()=>{
 const t=new Tracker(words);
 t.pendingErrors.set('76:1#6',{signature:'substitution|الذكر',seen:1,at:Date.now(),lastObservation:'chunk-1'});
 t.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'chunk-2'});
 assert.equal(t.pendingErrors.has('76:1#6'),false);
 assert.equal(t.errors.size,0);
});
test('candidates appear separately from confirmed errors in export',()=>{
 const t=new Tracker(words);
 t.pendingErrors.set('76:1#6',{type:'substitution',expected:'الدهر',heard:'الذكر',seen:1,at:Date.now(),lastObservation:'chunk-1'});
 const out=t.export();
 assert.equal(out.errors.length,0);
 assert.equal(out.pendingErrors.length,1);
 assert.equal(out.pendingErrors[0].expected,'الدهر');
});
