const test=require('node:test');const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),path=require('node:path');
const {Tracker}=require('../recitation-core.js');
const mushaf=readFileSync(path.join(__dirname,'../mushaf.html'),'utf8');
const words=['هل','أتى','على','الإنسان','حين','من','الدهر','لم','يكن','شيئا','مذكورا'].map((expected,wi)=>({expected,vk:'76:1',wi,seqIndex:wi}));
test('legacy tracker may infer an error from a single transcript but follow-along clears such results',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 assert.equal(t.errors.size,1,'document the fallibility of the legacy internal classifier');
 assert.match(mushaf,/const DURR_FOLLOW_ONLY_V1=true;/);
 assert.match(mushaf,/if\(DURR_FOLLOW_ONLY_V1\)\{sec\.tracker\.errors\.clear\(\);sec\.tracker\.pendingErrors\.clear\(\);if\(result\)result\.updates=\[\];\}/,'the real Mushaf integration clears speculative findings before rendering or persistence');
});
test('corrected follow-up cannot be trusted to confirm or erase a legacy acoustic judgment',()=>{
 const t=new Tracker(words);
 t.feed('هل أتى على الإنسان حين من الذكر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'one'});
 t.cursor=0;
 t.feed('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا',{source:'quran-asr',observationId:'two'});
 assert.equal(t.errors.size,1,'legacy tracker remains unreliable; V1 must disregard these internal labels');
 assert.match(mushaf,/if\(result\)result\.updates=\[\];/,'follow-along discards all auto-generated error updates');
});
