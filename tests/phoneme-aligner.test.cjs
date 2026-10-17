const {test}=require('node:test');const assert=require('node:assert/strict');const {align}=require('./phoneme-aligner.js');
const words=[{phonemes:['a','b']},{phonemes:['c','d']},{phonemes:['e','f']}];
test('full prefix confirms only spoken words',()=>{const r=align(['a','b','c','d'],words);assert.deepEqual(r.matchedWords,[0,1]);assert.equal(r.completed,false);assert.deepEqual(r.errors,[]);});
test('mismatch cannot create an error',()=>{const r=align(['a','x','c','d'],words);assert.ok(!r.matchedWords.includes(0));assert.deepEqual(r.errors,[]);});
test('silence cannot complete',()=>{const r=align([],words);assert.deepEqual(r.matchedWords,[]);assert.deepEqual(r.errors,[]);});
test('reject words without phonetic references',()=>assert.throws(()=>align(['a'],[{text:'الحمد'}])));