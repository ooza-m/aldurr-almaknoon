'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const reader=fs.readFileSync(path.join(root,'mushaf.html'),'utf8');
const shell=fs.readFileSync(path.join(root,'reader-shell.css'),'utf8');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
const moreCss=fs.readFileSync(path.join(root,'ward-phase05-more-subpages.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

test('surah title is present in the toolbar visible when reading controls open',()=>{
 assert.match(reader,/\$\('mtSurah'\)\.textContent=names\.length>1\?names\.join\(' · '\):'سورة '\+\(names\[0\]\|\|''\)/);
 assert.match(reader,/\$\('chromeTtl'\)\.textContent=\(names\.length>1\?names\.join\(' · '\):'سورة '\+\(names\[0\]\|\|''\)\)\+' · الجزء '/);
 assert.match(shell,/body\.app-standalone\.chrome \.mini-top\{visibility:hidden/);
 assert.match(shell,/\.chrome-top \.ttl\{[^}]*direction:rtl/);
});

test('reader home appears only with reader controls and does not persist over Quran',()=>{
 assert.match(shell,/body\.app-standalone #btnBack\{visibility:hidden;opacity:0;pointer-events:none/);
 assert.match(shell,/body\.app-standalone\.chrome #btnBack\{visibility:visible;opacity:1;pointer-events:auto/);
});

test('Ward More and secondary page stylesheet does not load inside the reader',()=>{
 assert.match(app,/href="ward-phase05-more-subpages\.css\?v=1"/);
 assert.doesNotMatch(reader,/ward-phase05-more-subpages/);
 for(const id of ['more','khatma','tafsir','planning','stages','stats','tajweed','errors']){
  assert.match(moreCss,new RegExp('#tab-'+id+'\\b'));
  assert.ok(app.includes('id="tab-'+id+'"'),id);
 }
});

test('latest app-shell cache references the reader CSS and More styles',()=>{
 assert.match(sw,/const CACHE='durr-v174'/);
 assert.match(sw,/reader-shell\.css\?v=106/);
 assert.match(sw,/ward-phase05-more-subpages\.css\?v=1/);
 assert.match(reader,/register\('sw\.js\?v=108'\)/);
 assert.match(app,/register\('sw\.js\?v=108'\)/);
});
