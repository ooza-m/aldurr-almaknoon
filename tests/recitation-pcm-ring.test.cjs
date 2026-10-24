const test=require('node:test');const assert=require('node:assert/strict');const {Ledger}=require('../recitation-audio-window.js');
test('five-second PCM ring stays bounded, volatile and unpublished',()=>{
 const l=new Ledger();
 for(let i=0;i<7;i++){l.add({runId:'a',seq:i,page:575,position:i,durationMs:1000});l.addPcm(new Int16Array(16000).fill(i+1));}
 assert.equal(l.bufferedMs,5000);assert.equal(l.chunks.at(-1).endMs,7000);
 assert.equal(l.chunks[0].startMs,0);
 assert.equal(l.pcm.length,5);
 l.clear();assert.equal(l.bufferedMs,0);assert.equal(l.chunks.length,0);
});
test('duration follows actual PCM samples',()=>{
 const l=new Ledger();l.add({runId:'a',seq:0,page:575,position:0,durationMs:625});
 assert.equal(l.chunks[0].endMs,625);
});

test('clear overwrites retained PCM before releasing reference',()=>{
 const l=new Ledger(),samples=new Int16Array(16000).fill(333);
 l.addPcm(samples);
 const held=l.pcm[0];l.clear();
 assert.equal(held.every(v=>v===0),true);
 assert.equal(l.bufferedMs,0);
});
