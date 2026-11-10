'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const main=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'ward-phase05-home-today.css'),'utf8');
const svg=fs.readFileSync(path.join(root,'assets/ward-blossoms.svg'),'utf8');
const mushaf=fs.readFileSync(path.join(root,'mushaf.html'),'utf8');

test('first Ward skin loads only in the app shell and not the Mushaf',()=>{
 assert.match(main,/href="ward-phase05-home-today\.css\?v=1"/);
 assert.doesNotMatch(mushaf,/ward-phase05-home-today/);
 assert.ok(!css.includes('#mushaf'));
});

test('Ward floral art is local and has no external resources or scripts',()=>{
 assert.match(svg,/<svg /);
 assert.match(svg,/<\/svg>/);
 assert.doesNotMatch(svg,/<script|onload=|https?:\/\//i);
 assert.match(css,/url\("assets\/ward-blossoms\.svg"\)/);
});

test('Ward home and Today preserve existing app data hooks',()=>{
 for(const id of ['homeTipText','homeProgressCard','homeContinueCard','homeTodayCard','homeRecent','todayTasksV50','todayOverviewV50','todayPriorityV50']){
  assert.ok(main.includes('id="'+id+'"'),id);
 }
 assert.match(css,/#tab-home/);
 assert.match(css,/#tab-today/);
 assert.doesNotMatch(css,/\bdisplay\s*:\s*none\s*!important\s*;?\s*}\s*$/m);
});

test('Ward provides a narrow-phone fallback, visible keyboard focus and reduced motion',()=>{
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css, /:focus-visible/);
 assert.match(css, /prefers-reduced-motion/);
});
