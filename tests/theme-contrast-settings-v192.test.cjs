'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
const html=read('index.html'),css=read('theme-contrast-v192.css'),sw=read('sw.js');
test('Calendar header no longer shows a redundant back arrow, while milestones route remains',()=>{
 const start=html.indexOf('<section class="tab-panel" id="tab-calendar">'),end=html.indexOf('</section>',start),page=html.slice(start,end);
 assert.ok(start>=0);
 assert.doesNotMatch(page,/<button class="v67-back"/);
 assert.match(page,/data-v50-route="stages"/);
});
test('Home settings and More account controls use the existing handlers and preserve account workflow',()=>{
 assert.match(html,/id="homeAccountBtn" aria-label="الإعدادات"/);
 assert.match(html,/id="moreAccountBtn" aria-label="الحساب وتسجيل الدخول والخروج"/);
 assert.match(html,/getElementById\('homeAccountBtn'\);if\(a\)a\.addEventListener\('click',openSettings\)/);
 assert.match(html,/getElementById\('moreAccountBtn'\);if\(accountShortcut\)accountShortcut\.addEventListener\('click',\(\)=>document\.getElementById\('acctChip'\)\.click\(\)\)/);
 assert.match(html,/getElementById\('acctChip'\)\.addEventListener\('click'/);
});
test('Settings uses sliders rather than the previous sun-like shortcut and Tajweed has a new icon',()=>{
 assert.match(html,/id="homeAccountBtn"[\s\S]{0,450}M4 7h9M17 7h3/);
 assert.match(html,/id="moreSettingsBtn"[\s\S]{0,450}M4 7h9M17 7h3/);
 assert.match(html,/data-v50-route="tajweed"[\s\S]{0,220}M4 6h16M6 3v6/);
});
test('Contrast stylesheet uses dynamic palette tokens on all illustrated screens',()=>{
 assert.match(html,/theme-contrast-v192\.css\?v=192/);
 for(const area of ['#tab-home','#tab-calendar','#tab-map','#tab-stats','#tab-stages','#tab-tajweed','#tab-tafsir','#tab-more']){
   assert.ok(css.includes(area),area+' is covered');
 }
 assert.match(css,/:root\[data-theme=dark\]/);
 assert.match(css,/#tab-stages #btnAddStage/);
 assert.match(css,/var\(--surface\)!important/);
 assert.match(css,/var\(--ink\)!important/);
 assert.doesNotMatch(css,/#fffdfa|#ffffff.*!important/);
});
