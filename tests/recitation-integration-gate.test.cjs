const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
const core=fs.readFileSync(path.join(__dirname,'..','recitation-core.js'),'utf8');
test('reader ships all local feedback/report assets in correct order',()=>{
 const names=['recitation-feedback.js','recitation-feedback-ui.js','recitation-report.js'];
 const offsets=names.map(n=>html.indexOf('src="'+n));
 assert.ok(offsets.every(x=>x>=0));
 assert.ok(offsets[0]<offsets[1]&&offsets[1]<offsets[2]);
 for(const name of names)assert.ok(fs.existsSync(path.join(__dirname,'..',name)));
});
test('browser dictation is excluded from automatic Quran mistakes',()=>{
 assert.match(core,/source==='browser-speech'\|\|source==='browser-preview'/);
});
test('phoneme preview does not award covered-word credit or grade errors',()=>{
 const first=html.indexOf('async function previewQuranPhonemesV90(');
 const end=html.indexOf('\nfunction buildRecSeq()',first);
 assert.ok(first>=0&&end>first);
 const body=html.slice(first,end);
 assert.doesNotMatch(body,/markSessionError\(|\.covered\.add\(|\.errors\.add\(|playRecErrorToneV91\(/);
});
test('fallback does not repeatedly start browser recognition',()=>{
 assert.match(html,/if\(speechAvailable&&!speechStarted\)startSpeech\(\)/);
});

test('async phoneme reference results must not overwrite a newer preview',()=>{
 const first=html.indexOf('async function previewQuranPhonemesV90(');
 const end=html.indexOf('\nfunction buildRecSeq()',first);
 const body=html.slice(first,end);
 assert.match(body,/previewGeneration=sec\.phonemePreviewGeneration/);
 assert.match(body,/previewGeneration!==sec\.phonemePreviewGeneration/);
});
