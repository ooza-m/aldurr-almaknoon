'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('index.html'),contrast=read('theme-contrast-v192.css'),prefs=read('app-preferences.js');
test('calendar has no header back arrow, but milestones card remains navigable',()=>{
 const section=app.match(/<section class="tab-panel" id="tab-calendar">([\s\S]*?)<\/section>/)?.[1]||'';
 assert.match(section,/<h1>التقويم<\/h1>/);
 assert.doesNotMatch(section,/class="v67-back"/);
 assert.match(section,/data-v50-route="stages"/);
});
test('home settings and More account shortcuts use existing actions without duplicating auth logic',()=>{
 assert.match(app,/id="homeAccountBtn" aria-label="الإعدادات"/);
 assert.match(app,/id="moreAccountBtn" aria-label="الحساب وتسجيل الدخول والخروج"/);
 assert.match(app,/getElementById\('homeAccountBtn'\);if\(a\)a\.addEventListener\('click',openSettings\)/);
 assert.match(app,/getElementById\('moreAccountBtn'\).*?getElementById\('acctChip'\)\.click\(\)/);
 assert.match(app,/id="acctChip"/);
});
test('settings controls use a sliders glyph rather than a sun',()=>{
 const home=app.match(/id="homeAccountBtn"[\s\S]*?<\/button>/)?.[0]||'';
 const more=app.match(/id="moreSettingsBtn"[\s\S]*?<\/button>/)?.[0]||'';
 for(const control of [home,more]){
  assert.match(control,/M4 7h9M17 7h3/);
  assert.doesNotMatch(control,/M12 2v3M12 19v3/);
 }
});
test('Tajweed uses a study/checklist icon',()=>{
 const icon=app.match(/data-v50-route="tajweed"[\s\S]*?<\/button>/)?.[0]||'';
 assert.match(icon,/M4 6h16M6 3v6/);
 assert.match(icon,/m17 17 2 2 3-4/);
});
test('dark-mode contrast is token-based across all four palettes and major pages',()=>{
 assert.match(app,/theme-contrast-v192\.css\?v=192/);
 for(const palette of ['rose','olive','navy','plum'])assert.match(prefs,new RegExp(palette+':\\{name:'));
 for(const id of ['tab-home','tab-today','tab-calendar','tab-map','tab-stages','tab-stats','tab-tajweed','tab-tafsir','tab-more'])assert.ok(contrast.includes('#'+id),'missing '+id);
 assert.match(contrast,/:root\[data-theme=dark\]/);
 assert.match(contrast,/#tab-stats \.v67-stat-grid>div/);
 assert.match(contrast,/#tab-stages \.v69-stage-hero/);
 assert.match(contrast,/#tab-tajweed \.tj-content/);
 assert.match(contrast,/#tab-map \.map-sum-grid>div/);
 assert.match(contrast,/background:var\(--surface\)!important/);
 assert.match(contrast,/color:var\(--ink\)!important/);
 assert.match(contrast,/#tab-stages #btnAddStage\{background:var\(--accent\)!important;color:var\(--page\)!important/);
});
