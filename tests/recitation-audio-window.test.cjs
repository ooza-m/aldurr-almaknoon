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
