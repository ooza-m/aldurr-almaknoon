'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('all 30 roadmap sections expose keyboard toggle, aria-expanded and preserved focus',()=>{
 const dom=new JSDOM(index,{runScripts:'outside-only'});
 const doc=dom.window.document;
 const start=index.indexOf('function renderMap(){');
 const end=index.indexOf("\nlet mapFilter='all';",start);
 assert.ok(start>=0&&end>start);
 const openJuz=new Set();
 const ranges=Array.from({length:30},(_,i)=>[i*20+1,i*20+20]);
 const render=new Function('document','SURAHS','toAr','JUZ_RANGE','juzStateSummaryV64','juzAvgInfo','openJuz','surahOfPage','JUZ_NAME_PICK','JUZ_NAME','updateMapCount','wardReviewRoadmapV205','requestAnimationFrame','fillJuzPages',index.slice(start,end)+'\nreturn renderMap;')(
  doc,[[1,'الفاتحة',1]],String,ranges,
  ()=>({memorized:0,fix:0,near:0,far:0,weak:0,errors:0}),
  ()=>({seen:0,color:'#fff'}),openJuz,()=>[1,'الفاتحة'],
  {},Array(30).fill('الجزء'),()=>{},()=>{},()=>{},()=>{}
 );
 render();
 assert.equal(doc.querySelectorAll('#juzList [role="button"][tabindex="0"]').length,30);
 let first=doc.querySelector('#juzList [data-j="0"]');
 assert.equal(first.getAttribute('aria-expanded'),'false');
 assert.equal(first.getAttribute('aria-controls'),'jp-0');
 first.focus();
 first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 first=doc.querySelector('#juzList [data-j="0"]');
 assert.equal(first.getAttribute('aria-expanded'),'true');
 assert.equal(doc.activeElement,first);
 first.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
 first=doc.querySelector('#juzList [data-j="0"]');
 assert.equal(first.getAttribute('aria-expanded'),'false');
 assert.equal(doc.activeElement,first);
});
test('review details do not announce all rows on every map refresh',()=>{
 const dom=new JSDOM(index,{runScripts:'outside-only'}).window.document;
 assert.equal(dom.getElementById('wardReviewRoadmap').getAttribute('aria-live'),null);
 assert.equal(dom.getElementById('wardReviewTotal').getAttribute('aria-live'),'polite');
});
