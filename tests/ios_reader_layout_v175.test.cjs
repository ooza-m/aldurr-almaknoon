'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('mushaf.html'),app=read('index.html'),completion=read('quick-face-completion.js'),reader=read('reader-shell.css'),sw=read('sw.js');
test('center achievement control is reused without a duplicate button',()=>{
 assert.match(html,/id="readerSimi" aria-label="تسجيل الإنجاز"/);
 assert.match(completion,/const trigger=document\.getElementById\('readerSimi'\)/);
 assert.doesNotMatch(completion,/createElement\('button'\).*quickFaceCompletionBtn/s);
 assert.match(completion,/event\.stopImmediatePropagation\(\)/);
});
test('reader options anchor to actual bottom and hide conflicting bottom navigation',()=>{
 assert.match(reader,/body\.app-standalone\.chrome \.reader-dock\{/);
 assert.match(reader,/position:fixed!important;inset:auto 0 0 0!important/);
 assert.match(reader,/body\.app-standalone\.chrome \.app-bottom-nav\{opacity:0!important/);
});
test('page bubble is viewport-clamped outside scrolling toolbar',()=>{
 assert.match(html,/document\.body\.appendChild\(bubble\)/);
 assert.match(html,/Math\.max\(bw\/2\+12,Math\.min\(window\.innerWidth-bw\/2-12,x\)\)/);
 assert.match(reader,/body>\.sbubble\.reader-floating-bubble\{position:fixed!important/);
});
test('all secondary pages reserve iOS status space and Continue points left',()=>{
 assert.match(app,/--app-header-clearance:max\(90px/);
 assert.match(app,/main>\.tab-panel:not\(#tab-home\)/);
 assert.match(app,/m15 18-6-6 6-6/);
});
test('new PWA cache version matches new reader resources',()=>{
 assert.match(sw,/durr-v176/);
 assert.match(html,/reader-shell\.css\?v=176/);
 assert.match(html,/quick-face-completion\.js\?v=176/);
 assert.match(app,/sw\.js\?v=176/);
});

test('modal options escape clipped Quran container and open at bottom',()=>{
 assert.match(html,/document\.querySelectorAll\('\.sheet-wrap'\)\.forEach/);
 assert.match(html,/body>\.sheet-wrap\.open \.sheet\{transform:translate3d\(0,0,0\)!important\}/);
});
test('completion success keeps center icon rather than replacing its contents',()=>{
 assert.doesNotMatch(completion,/trigger\.textContent='✓'/);
 assert.match(completion,/trigger\.classList\.add\('dq-saved'\)/);
});
