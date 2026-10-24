const test=require('node:test');const assert=require('node:assert/strict');const {Tracker}=require('../recitation-core.js');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('complete correct recitation covers words without errors',()=>{const t=new Tracker(words);t.feed(words.map(w=>w.expected).join(' '),{source:'browser-speech'});assert.equal(t.errors.size,0);assert.ok(t.covered.size>=7)});
test('one mistaken browser transcription never triggers an alert',()=>{const t=new Tracker(words);t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'browser-speech'});assert.equal(t.errors.size,0)});
test('correcting previously suspected word clears it',()=>{const t=new Tracker(words);t.pendingErrors.set('76:1#6',{signature:'substitution|الذكر',at:Date.now(),seen:1});t.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'quran-asr'});assert.equal(t.pendingErrors.size,0)});
test('expired suspicions are not exported',()=>{const t=new Tracker(words);t.pendingErrors.set('76:1#6',{type:'substitution',expected:'الدهر',heard:'الذكر',at:Date.now()-6000});assert.equal(t.export().pendingErrors.length,0)});
test('silence does not invent a missing word',()=>{const t=new Tracker(words);t.feed('',{source:'browser-speech'});assert.equal(t.errors.size,0)});
