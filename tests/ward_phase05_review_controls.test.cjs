'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mapStyle=fs.readFileSync(path.join(root,'ward-phase05-manual-settings-review.css'),'utf8');
const readerStyle=fs.readFileSync(path.join(root,'reader-shell.css'),'utf8');
const dom=new JSDOM(index,{runScripts:'outside-only'});
const document=dom.window.document;

test('the roadmap has exactly one color key and one all-parts control',()=>{
 const map=document.getElementById('tab-map');
 assert.ok(map);
 assert.equal(map.querySelectorAll('.map-legend-v64').length,1);
 assert.equal(map.querySelectorAll('#btnToggleAllJuz').length,1);
 assert.equal(map.querySelectorAll('#btnExpandAll,#btnCollapseAll,.map-options-v96').length,0);
 assert.ok(map.querySelector('#wardReviewRoadmap'));
 assert.ok(map.querySelector('#wardReviewTotal'));
});

test('manual entry and settings preserve their original form identifiers',()=>{
 for(const id of ['settingsModal','ntWird','ntWirdTime','ntTafsir','ntTafsirTime','set-name','set-name-save','set-reset','in-date','btnManualEntryV50']){
  assert.ok(document.getElementById(id),id);
 }
 assert.match(index,/ward-phase05-manual-settings-review\.css\?v=2/);
 assert.match(mapStyle,/#settingsModal/);
 assert.match(mapStyle,/#tab-manual/);
});

test('reader home follows the top controls and the page slider is in front of draft badge',()=>{
 assert.match(readerStyle,/body\.app-standalone #btnBack\{visibility:hidden;opacity:0;pointer-events:none/);
 assert.match(readerStyle,/body\.app-standalone\.chrome #btnBack\{visibility:visible;opacity:1;pointer-events:auto/);
 assert.match(readerStyle,/\.reader-dock \.reader-scrubber\{order:1;position:relative;z-index:3\}/);
 assert.match(readerStyle,/\.reader-dock \.rec-job-status\{order:2;position:relative;z-index:1/);
});

test('review roadmap uses the same near and far pages as Today and opens the requested face',()=>{
 const start=index.indexOf('function wardReviewRoadmapV205(){'),end=index.indexOf('\nfunction renderMap(){',start);
 assert.ok(start>=0&&end>start);
 const first={12:'2026-10-21',35:'2026-09-20',40:'2026-08-20'};
 const engine={12:{phase:'near',day:21,due:true,doneToday:false,nextDue:'2026-11-10'},
 35:{phase:'near',day:30,due:false,doneToday:true,nextDue:'2026-11-11'},
 40:{phase:'far',due:true,doneToday:false,nextDue:'2026-11-10'}};
 let opened=null;
 const fn=new Function('document','firstMemDateV62','reviewEngineStateV62','surahOfPage','esc','openPage','taskPagesV60','toAr','farCycleDaysV111','farDailyQuotaV111',
 index.slice(start,end)+'\nreturn wardReviewRoadmapV205;')(
 document,p=>first[p]||null,p=>engine[p]||{phase:'unseen'},
 ()=>[1,'البقرة'],x=>String(x),p=>{opened=p},
 task=>task==='near'?[12]:task==='far'?[40]:[],String,()=>7,()=>1
 );
 fn();
 const container=document.getElementById('wardReviewRoadmap'),summary=document.getElementById('wardReviewTotal');
 assert.match(summary.textContent,/2 أوجه اليوم/);
 const visible=[...container.querySelectorAll('.review-today-list-v173 [data-ward-face]')];
 assert.deepEqual(visible.map(el=>Number(el.dataset.wardFace)),[12,40]);
 assert.match(container.textContent,/المراجعة القريبة/);
 assert.match(container.textContent,/المراجعة البعيدة/);
 assert.match(container.textContent,/أُنجز اليوم/);
 visible[0].click();assert.equal(opened,12);
});
