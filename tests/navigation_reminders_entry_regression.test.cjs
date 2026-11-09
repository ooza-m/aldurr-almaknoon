'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mushaf=fs.readFileSync(path.join(root,'mushaf.html'),'utf8');
const app=new JSDOM(main,{runScripts:'outside-only'}).window.document;

test('main bottom navigation reserves the fifth slot for the map',()=>{
 const items=[...app.querySelectorAll('#bottomNav button')];
 assert.deepEqual(items.map(b=>b.dataset.tab),['home','today','mushaf','calendar','map']);
 assert.equal(items[4].textContent.trim(),'الخريطة');
});

test('home shortcut opens More instead of reminders',()=>{
 const b=app.getElementById('homeNotifBtn');
 assert.ok(b);
 assert.equal(b.getAttribute('aria-label'),'المزيد');
 assert.match(main,/if\(n\)n\.addEventListener\('click',\(\)=>switchTab\('more'\)\)/);
});

test('notification settings are embedded in settings dialog, once each',()=>{
 const modal=app.getElementById('settingsModal');
 assert.ok(modal);
 for(const id of ['ntWird','ntWirdTime','ntTafsir','ntTafsirTime','ntStatus']){
  assert.equal(app.querySelectorAll('#'+id).length,1,id);
  assert.ok(modal.querySelector('#'+id),id);
 }
 assert.equal(app.getElementById('reminderModal'),null);
});

test('free recitation linkage is no longer injected into home header',()=>{
 assert.match(main,/initFreeRecitationReviewV105\(\)[\s\S]*?const home=document\.getElementById\('moreSettingsBtn'\)/);
 assert.doesNotMatch(main,/const home=document\.getElementById\('homeAccountBtn'\);\s*if\(!home\)return;\s*const button=document\.createElement\('button'\)/);
});

test('app keeps logging sessions but does not announce automatic sync as a success toast',()=>{
 assert.match(main,/function ingestRecitationSessionV51\(/);
 assert.doesNotMatch(main,/showV51Toast\('سُجّلت جلسة التسميع تلقائيًا'/);
});

test('Mushaf retains the recitation result but does not open old drafts on load',()=>{
 assert.ok(mushaf.includes('id="recSummaryWrap"'));
 assert.ok(mushaf.includes('saveReviewDraftV119(payload)'));
 assert.doesNotMatch(mushaf,/window\.addEventListener\('load',\(\)=>\{const draft=loadReviewDraftV119\(\);if\(draft\)setTimeout\(\(\)=>showRecSummary\(draft\),200\);\}\)/);
});

test('service worker references use the same updated version',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.match(sw,/const CACHE='durr-v103'/);
 assert.match(main,/register\('sw\.js\?v=103'\)/);
 assert.match(mushaf,/register\('sw\.js\?v=103'\)/);
});
