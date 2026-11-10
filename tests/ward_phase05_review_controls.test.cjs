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
 assert.match(index,/ward-phase05-manual-settings-review\.css\?v=1/);
 assert.match(mapStyle,/#settingsModal/);
 assert.match(mapStyle,/#tab-manual/);
});

test('reader home follows the top controls and the page slider is in front of draft badge',()=>{
 assert.match(readerStyle,/body\.app-standalone #btnBack\{visibility:hidden;opacity:0;pointer-events:none/);
 assert.match(readerStyle,/body\.app-standalone\.chrome #btnBack\{visibility:visible;opacity:1;pointer-events:auto/);
 assert.match(readerStyle,/\.reader-dock \.reader-scrubber\{order:1;position:relative;z-index:3\}/);
 assert.match(readerStyle,/\.reader-dock \.rec-job-status\{order:2;position:relative;z-index:1/);
});

test('review roadmap renders remaining fixation days and the near-review due date from engine state',()=>{
 const start=index.indexOf('function wardReviewRoadmapV205(){'),end=index.indexOf('\nfunction renderMap(){',start);
 assert.ok(start>=0&&end>start);
 const first={12:'2026-10-21',20:'2026-10-11',35:'2026-09-20',40:'2026-08-20'};
 const engine={12:{phase:'fix',due:true},20:{phase:'fix',due:false},35:{phase:'near',due:true,nextDue:'2026-11-09'},40:{phase:'far',due:true,nextDue:'2026-11-10'}};
 let opened=null;
 const fn=new Function('document','todayKey','firstMemDateV62','reviewEngineStateV62','surahOfPage','daysBetween','esc','openPage',
 index.slice(start,end)+'\nreturn wardReviewRoadmapV205;')(
  document,()=> '2026-11-10',p=>first[p]||null,p=>engine[p]||{phase:'unseen'},
  ()=>[1,'البقرة'],(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000),
  x=>String(x),p=>{opened=p}
 );
 fn();
 const container=document.getElementById('wardReviewRoadmap'),summary=document.getElementById('wardReviewTotal');
 assert.equal(summary.textContent,'3 وجه');
 const lines=[...container.querySelectorAll('[data-ward-face]')];
 assert.deepEqual(lines.map(el=>Number(el.dataset.wardFace)),[20,12,35]);
 assert.match(lines[0].textContent,/ينتقل إلى القريبة غدًا/);
 assert.match(lines[1].textContent,/10 يوم متبقٍ/);
 assert.match(lines[2].textContent,/مستحق الآن/);
 assert.ok(!container.textContent.includes('وجه 40'));
 lines[1].click();assert.equal(opened,12);
});
