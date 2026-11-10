'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const reader=fs.readFileSync(path.join(root,'mushaf.html'),'utf8');
const css=fs.readFileSync(path.join(root,'ward-phase05-dialogs.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const doc=new JSDOM(html,{runScripts:'outside-only'}).window.document;
const ids=['pageModal','datePickModal','hmInfoModal','rangeModal','stageModal','errModal','tafsirModal','pathModal','mapInfoModal','dayActModal'];

test('all ten app dialogs are styled, remain distinct and retain their content',()=>{
 for(const id of ids){
  const node=doc.getElementById(id);
  assert.ok(node,id);
  assert.equal(doc.querySelectorAll('#'+id).length,1,id);
  assert.ok(node.querySelector('.modal .modal-x'),id+' close');
  assert.ok(css.includes('#'+id),id+' CSS');
 }
 assert.ok(doc.getElementById('settingsModal'));
 assert.ok(!css.includes('#settingsModal'),'settings continue using their own Ward stylesheet');
});

test('dialog styling is scoped to index and does not alter Quran reading layout',()=>{
 assert.match(html,/ward-phase05-dialogs\.css\?v=1/);
 assert.doesNotMatch(reader,/ward-phase05-dialogs/);
 assert.doesNotMatch(css,/\.qline|\.qw|\.pane|\.reader-dock/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/env\(safe-area-inset-top\)/);
 assert.match(css,/prefers-reduced-motion/);
});

test('dialog update is included in offline shell cache',()=>{
 assert.match(sw,/const CACHE='durr-v109'/);
 assert.match(sw,/ward-phase05-dialogs\.css\?v=1/);
 assert.match(html,/register\('sw\.js\?v=109'\)/);
 assert.match(reader,/register\('sw\.js\?v=109'\)/);
});

test('existing form fields and save actions remain available',()=>{
 for(const id of ['pmTitle','rgApply','rgClose','stName','erSurah','erContextV98','tfName','dpToday','dpClose','dayActBody']){
  assert.ok(doc.getElementById(id),id);
 }
});
