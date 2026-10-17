const assert=require('node:assert/strict');
const test=require('node:test');
const phonemes=require('../phoneme-aligner.js');
test('exact verified first word',()=>{
 const r=phonemes.exactPrefix('bismi',['bismi','llahi','rrahmani','rrahim']);
 assert.deepEqual(r.matchedWords,[0]);assert.equal(r.status,'prefix');
 assert.deepEqual(r.errors,[]);assert.equal(r.completed,false);
});
test('multiple contiguous words with spaces',()=>{
 const r=phonemes.exactPrefix('bismi llahi',['bis mi','llahi','rrahmani']);
 assert.deepEqual(r.matchedWords,[0,1]);
});
test('does not advance across a mismatch',()=>{
 const r=phonemes.exactPrefix('bismi WRONG',['bismi','llahi','rrahmani']);
 assert.deepEqual(r.matchedWords,[0]);assert.equal(r.status,'unverified_speech');
});
test('invalid input never grants credit',()=>{
 assert.equal(phonemes.exactPrefix('abc',['','xyz']).status,'invalid_reference');
 assert.deepEqual(phonemes.exactPrefix('', ['abc']).matchedWords,[]);
});
test('partial phoneme cannot reveal a full word',()=>{
 assert.deepEqual(phonemes.exactPrefix('bis',['bismi','llahi']).matchedWords,[]);
});
