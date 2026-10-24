const test=require('node:test');const assert=require('node:assert/strict');const {exactPrefix}=require('../phoneme-aligner.js');
test('continuous phoneme stream crosses two verse boundaries',()=>{
 const verses=[['aa bb','cc'],['dd ee','ff'],['gg']];
 const r=exactPrefix('aa bb cc dd ee ff gg',verses.flat());
 assert.equal(r.status,'prefix');assert.deepEqual(r.matchedWords,[0,1,2,3,4]);
});
test('partial final word never appears as fully matched',()=>{
 const r=exactPrefix('aa bb cc dd', ['aa bb','cc','dd ee']);
 assert.deepEqual(r.matchedWords,[0,1]);assert.equal(r.status,'unverified_speech');
});
test('revised transcript may retract a temporary preview',()=>{
 const segments=['aa bb','cc dd'];
 const first=exactPrefix('aa bb',segments),revised=exactPrefix('zz',segments);
 assert.deepEqual(first.matchedWords,[0]);assert.equal(revised.status,'unverified_speech');
 assert.deepEqual(revised.errors,[]);
});
