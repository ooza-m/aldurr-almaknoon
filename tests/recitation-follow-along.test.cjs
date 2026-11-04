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

test('read words remain Quran-colored while current word has a restrained underline',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(html,/\.pane\.reciting \.qw\.rvl\{color:var\(--quran\)!important\}/);
 assert.match(html,/\.pane\.reciting \.qw\.rec-cur\.rvl\{color:var\(--quran\)!important;/);
 assert.match(html,/text-decoration-color:var\(--accent\)/);
 assert.match(html,/text-decoration-thickness:2px/);
});
test('the current highlight references covered words, not the end of a repeated transcript',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(html,/function syncRecCurrentV160\(section\)/);
 assert.match(html,/section\.state\.covered\.has\(key\)\|\|section\.state\.assisted\.has\(key\)/);
 assert.match(html,/recWordPos=sec\.tracker\.cursor;recPos=[^;]+;syncRecCurrentV160\(sec\)/);
 assert.doesNotMatch(html,/setCurrent\(sec\.words\[Math\.max\(0,result\.end-1\)\]\?\.el\)/);
});
test('locating the initial voice position never unmasks preceding unspoken words',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 const body=html.slice(html.indexOf('function applyContextTranscriptV86('),html.indexOf('function renderRecitationV89('));
 assert.doesNotMatch(body,/index<startSeq\)item\.el\.classList\.add\('rvl','rec-context'\)/);
});
test('follow-only reveal never treats hypothesized omissions as recited words',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 const body=html.slice(html.indexOf('function renderRecitationV89('),html.indexOf('let voiceLocatorV89=null'));
 assert.match(body,/if\(DURR_FOLLOW_ONLY_V1\)\{/);
 assert.match(body,/sec\.state\.covered\.has\(key\)\|\|sec\.state\.assisted\.has\(key\)/);
 assert.match(body,/else for\(const item of state\.visible\)/);
});
test('paused highlighting stays visible, with reduced-motion alternative',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/\.pane\.reciting \.qw\.rec-cur\.rvl/);
 assert.doesNotMatch(html,/body\.rec-on \.qw\.rec-cur\.rvl/);
});

test('eye button shows the face without advancing word cursor or coverage',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 const eye=html.slice(html.indexOf('function toggleEye(){'),html.indexOf('function autoAdvance(',html.indexOf('function toggleEye(){')));
 assert.match(eye,/paneCur\.classList\.toggle\('rec-face-revealed',eyeShown\)/);
 assert.doesNotMatch(eye,/markCoverage\(|recWordPos\s*=|recPos\s*=|covered\.add\(/);
 assert.match(eye,/syncRecCurrentV160\(section\)/);
});
test('verse-end symbol appears only when all words of that verse have been followed or manually revealed',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 const marker=html.slice(html.indexOf('function revealVerseEndV161('),html.indexOf('function syncRecCurrentV160('));
 assert.match(marker,/classList\.contains\('qend'\)/);
 assert.match(marker,/verse\.every\(w=>/);
 assert.match(marker,/section\.state\.covered\.has\(key\)\|\|section\.state\.assisted\.has\(key\)/);
 assert.match(marker,/item\.el\.classList\.toggle\('rvl',reached\)/);
});
test('turning off the eye and switching faces restores the last followed word',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(html,/paneCur\.classList\.remove\('rec-face-revealed'\);buildRecSeq\(\);setEye\(\)/);
 assert.match(html,/if\(section\)syncRecCurrentV160\(section\)/);
 assert.match(html,/aria-pressed',String\(eyeShown\)/);
});
test('small-screen recitation controls remain accessible',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(html,/@media\(max-width:390px\)\{\s*body\.reciting #recBar/);
 assert.match(html,/body\.reciting #recBar \.rec-i\{width:32px;height:36px\}/);
 assert.match(html,/body\.reciting #recBar \.rec-mic\{width:46px;height:46px\}/);
});
