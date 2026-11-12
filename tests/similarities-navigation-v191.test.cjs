'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('secondary navigation returns to compact chevrons with correct targets',()=>{
 assert.match(app,/data-stages-back-v190[^>]*>‹<\/button>/);
 assert.match(app,/data-v50-route="stages"[^>]*>[\s\S]*?المرحليات والاختبارات<\/b><\/span><\/button>/);
 assert.match(app,/data-v50-route="tafsir"[\s\S]*?<i dir="ltr" aria-hidden="true">‹<\/i>/);
 assert.match(app,/stagesReturnTabV190=origin==="calendar"\?"calendar":"more"/);
 assert.match(app,/#tab-tafsir #btnAddTafsir\{[^}]*color:#fff!important/);
});
test('selected verse similarity label is explicit',()=>{
 assert.match(html,/<div class="ay-sec">المتشابهات<\/div>/);
 assert.doesNotMatch(html,/<div class="ay-sec">في الدرّ<\/div>/);
});
test('empty similarity phrases still highlight a real shared Quran word',()=>{
 const begin=html.indexOf('function simiWordsV191('),end=html.indexOf('\nlet VTXT=null;',begin);
 assert.ok(begin>0&&end>begin);
 const code=html.slice(begin,end);
 const context={norm:s=>String(s).normalize('NFC').replace(/[ً-ْٰـۖ-ۭءٴ‌‍]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه'),esc:s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))};
 vm.runInNewContext(code,context);
 const a='صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ';
 const b='صِرَاطِ اللَّهِ الَّذِي لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ';
 const keys=context.simiPhraseKeysV191(a,b,'');
 assert.ok(keys.length>0);
 assert.match(context.hlPhrase(a,keys),/<b class="simi-match">صِرَاطَ<\/b>/);
 assert.match(context.hlPhrase(b,keys),/<b class="simi-match">صِرَاطِ<\/b>/);
 const noShared=context.simiPhraseKeysV191('الْمُؤْمِنِينَ','الْكَافِرِينَ','');
 assert.equal(noShared.length,0);
});
