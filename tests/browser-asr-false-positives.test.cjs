const test = require('node:test');
const assert = require('node:assert/strict');
const { Tracker } = require('../recitation-core.js');
function words(){
 return ['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
}
test('browser dictated substitutions never enter confirmed Quran errors',()=>{
 const tracker=new Tracker(words());
 tracker.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'browser-speech'});
 tracker.cursor=0;tracker.located=false;
 const result=tracker.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'browser-speech'});
 assert.equal([...tracker.errors.values()].filter(e=>e.active).length,0);
 assert.equal(result?.updates?.filter(e=>e.active).length||0,0);
});
test('browser recognition can still advance correct-word coverage',()=>{
 const tracker=new Tracker(words());
 tracker.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'browser-speech'});
 assert.ok(tracker.covered.size>0);
});
