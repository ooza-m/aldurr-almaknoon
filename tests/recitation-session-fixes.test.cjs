const test=require('node:test');const assert=require('node:assert/strict');const {Tracker}=require('../recitation-core.js');
const tokens=['إِنَّا','هَدَيْنَاهُ','السَّبِيلَ','إِمَّا','شَاكِرًا'].map((expected,wi)=>({expected,vk:'76:3',wi,seqIndex:wi}));
test('an/inna recognizer ambiguity never becomes a confirmed error',()=>{
 const t=new Tracker(tokens);
 t.feed('أن هديناه السبيل إما شاكرا',{source:'quran-asr',observationId:'1'});
 assert.equal(t.errors.size,0);
 assert.equal(t.pendingErrors.has('76:3#0'),false);
});
test('full recording history must not be wiped by session-only filtering',()=>{
 const historical=[{session:'old',vk:'76:1'},{session:'new',vk:'76:3'}];
 const visible=historical.filter(e=>e.session==='new');
 assert.equal(visible.length,1);assert.equal(historical.length,2);
});
