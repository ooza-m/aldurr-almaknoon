'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mushaf=fs.readFileSync(path.join(root,'mushaf.html'),'utf8');
const css=fs.readFileSync(path.join(root,'ward-phase05-calendar-map.css'),'utf8');
const homeCss=fs.readFileSync(path.join(root,'ward-phase05-home-today.css'),'utf8');
const dom=new JSDOM(main,{runScripts:'outside-only'}).window.document;

test('calendar and roadmap Ward stylesheet is linked only in the app shell',()=>{
 assert.match(main,/href="ward-phase05-calendar-map\.css\?v=1"/);
 assert.doesNotMatch(mushaf,/ward-phase05-calendar-map/);
 assert.match(css,/#tab-calendar/);
 assert.match(css,/#tab-map/);
 assert.doesNotMatch(homeCss,/#tab-calendar|#tab-map/);
});

test('calendar retains the original elements required for its heatmap, dates and views',()=>{
 const cal=dom.getElementById('tab-calendar');
 assert.ok(cal);
 for(const id of ['calendarSummaryV70','hmYear','heatmap','hmInfoBtn','calPrev','calTitle','calNext','vWeek','vMonth','calMonth','calWeek','calGrid']){
  assert.ok(cal.querySelector('#'+id),id);
 }
 // Both dialogs live in the shared modal layer, outside tab-calendar.
 assert.ok(dom.getElementById('datePickModal'));
 assert.ok(dom.getElementById('hmInfoModal'));
});

test('roadmap retains page lookup, filters, summary and the 30-part container',()=>{
 const map=dom.getElementById('tab-map');
 assert.ok(map);
 for(const id of ['mapInfoBtn','mapCount','jumpSurah','mapPageJumpV96','mapPageNumberV96','mapJumpMsgV96','juzList','btnOpenErrors','btnToggleAllJuz','wardReviewRoadmap','wardReviewTotal']){
  assert.ok(map.querySelector('#'+id),id);
 }
 assert.equal(map.querySelectorAll('.map-legend-v64').length,1,'one color key');
 assert.equal(map.querySelectorAll('#btnToggleAllJuz').length,1,'one expand/collapse control');
 const page=map.querySelector('#mapPageNumberV96');
 assert.equal(page.getAttribute('min'),'1');
 assert.equal(page.getAttribute('max'),'604');
 assert.deepEqual([...map.querySelectorAll('.mapfilt')].map(x=>x.dataset.filter),
  ['all','partial','near','far','weak','errors']);
});

test('Ward styles do not replace the memorization state palette or grade an entire face',()=>{
 // Existing states, markers and their meanings are owned by the data/review engine.
 assert.doesNotMatch(css,/#tab-map\s+\.pg\.(?:new|review|solid|weak|phase-fix|phase-near|phase-far|has-err)/);
 assert.doesNotMatch(css,/\.mapfilt\[data-filter/);
 assert.match(main,/function renderMap\(\)/);
 assert.match(main,/function fillJuzPages\(j\)/);
 assert.match(main,/for\(let j=0;j<30;j\+\+\)/);
 assert.match(main,/JUZ_RANGE\[j\]/);
});

test('the second Ward pass supports narrow phones, visible focus and reduced motion',()=>{
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(css, /:focus-visible/);
 assert.match(css, /prefers-reduced-motion/);
 assert.match(css,/overflow-x:auto/);
 assert.ok(css.includes('url("assets/ward-blossoms.svg")'));
});
