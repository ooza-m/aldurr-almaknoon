'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Tracker}=require('../recitation-core.js');
const wordList='الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين اياك نعبد واياك نستعين اهدنا الصراط المستقيم'.split(' ');
const make=()=>new Tracker(wordList.map((expected,wi)=>({expected,wi,vk:'1:1'})));
test('continuous reading across several voice segments keeps advancing',()=>{
 const t=make();
 assert.equal(t.feed('الحمد لله رب العالمين')?.end,4);
 assert.equal(t.feed('الرحمن الرحيم مالك يوم الدين')?.end,9);
 assert.equal(t.feed('اياك نعبد واياك نستعين')?.end,13);
 assert.equal(t.cursor,13);
});
test('repeating an earlier phrase cannot rewind the reading cursor',()=>{
 const t=make();
 t.feed('الحمد لله رب العالمين');
 t.feed('الرحمن الرحيم مالك يوم الدين');
 const at=t.cursor;
 t.feed('الرحمن الرحيم');
 assert.equal(t.cursor,at);
});
test('stopping in the middle and resuming at the same phrase stays localized',()=>{
 const t=make();
 t.feed('الحمد لله رب العالمين');
 const at=t.cursor;
 t.feed('الرحمن الرحيم');
 assert.ok(t.cursor>=at);
 t.feed('مالك يوم الدين');
 assert.ok(t.cursor>=at);
});
test('short ambiguous far-away phrase does not force a big jump',()=>{
 const t=make();
 t.feed('الحمد لله رب العالمين');
 const before=t.cursor;
 t.feed('اياك نعبد');
 assert.ok(t.cursor<=before+8);
});
test('interim hypothesis never triggers automatic page navigation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 const src=html.slice(html.indexOf('function previewSpeechV84('),html.indexOf('function initSpeech()'));
 assert.doesNotMatch(src,/autoAdvance\(/);
 assert.doesNotMatch(src,/rec-preview-suspected/);
});
test('pausing drops incomplete speech fragments but preserves reading cursor',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 const src=html.slice(html.indexOf('function stopRec(){'),html.indexOf('function syncRecMicV89()'));
 assert.match(src,/sec\.tracker\.pending=''/);
 assert.doesNotMatch(src,/tracker\.cursor=0/);
});
