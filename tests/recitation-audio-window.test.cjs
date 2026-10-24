const test=require('node:test');const assert=require('node:assert/strict');const {Ledger}=require('../recitation-audio-window.js');
test('ledger stores only sequence metadata and no audio',()=>{
 const l=new Ledger(3);l.add({runId:'a',seq:0,page:575,position:2,queuedAt:10,audio_b64:'SECRET'});
 assert.equal(JSON.stringify(l).includes('SECRET'),false);
 assert.deepEqual(l.context(575,2).chunkSequences,[0]);
 assert.equal(l.context(575,2).confirmed,false);
});
test('later run resets evidence metadata and replay is not independent',()=>{
 const l=new Ledger(3);
 l.add({runId:'a',seq:0,page:575,position:2});
 assert.equal(l.add({runId:'a',seq:0,page:575,position:2}),false);
 l.add({runId:'b',seq:0,page:575,position:2});
 assert.equal(l.runId,'b');assert.equal(l.chunks.length,1);
});

test('joins a suspicious word with coarse nearby chunk IDs without certifying an error',()=>{
 const l=new Ledger(10);
 l.add({runId:'run1',seq:0,page:575,position:3});
 l.add({runId:'run1',seq:1,page:575,position:6});
 l.add({runId:'run1',seq:2,page:576,position:6});
 const tracker={reviewWindow:(key)=>key==='76:1#6'?{key,start:3,end:10,focus:6,expected:['الدهر'],confirmed:false}:null};
 const result=l.review(tracker,'76:1#6',575);
 assert.deepEqual(result.chunkSequences,[0,1]);
 assert.equal(result.evidence,'metadata_only');
 assert.equal(result.confirmed,false);
 assert.equal(result.requiresNewAudio,true);
 assert.equal(l.review(tracker,'not-found',575),null);
});
