const test=require('node:test');
const assert=require('node:assert/strict');
const {exactPrefix}=require('../phoneme-aligner.js');
test('phoneme tokens with whitespace align across word boundaries',()=>{
 const r=exactPrefix('a b c d',['a b','c d']);
 assert.equal(r.status,'prefix');
 assert.deepEqual(r.matchedWords,[0,1]);
});
test('a partial phoneme word is not marked matched',()=>{
 const r=exactPrefix('a b c',['a b','c d']);
 assert.deepEqual(r.matchedWords,[0]);
 assert.equal(r.status,'unverified_speech');
 assert.deepEqual(r.errors,[]);
});
test('unexpected acoustic output never creates an automatic error',()=>{
 const r=exactPrefix('x y',['a b','c d']);
 assert.deepEqual(r.errors,[]);
 assert.equal(r.completed,false);
});
