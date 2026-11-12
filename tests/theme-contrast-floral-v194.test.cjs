'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html'),css=read('theme-contrast-v192.css'),floralCss=read('ward-phase05-more-subpages.css');
const Preferences=require('../app-preferences.js');
test('floral design is day-only, but classic rose retains its night and system options',()=>{
 const store={values:new Map(),getItem(k){return this.values.get(k)||null},setItem(k,v){this.values.set(k,v)}};
 Preferences.load(store);
 Preferences.set({design:'classic',palette:'rose',appearance:'dark'});
 assert.equal(Preferences.get().appearance,'dark');
 Preferences.set({design:'floral'});
 assert.equal(Preferences.get().appearance,'light');
 Preferences.set({appearance:'system'});
 assert.equal(Preferences.get().appearance,'light');
 Preferences.set({appearance:'dark'});
 assert.equal(Preferences.get().appearance,'light');
 Preferences.set({design:'classic',appearance:'system'});
 assert.equal(Preferences.get().appearance,'system');
 Preferences.set({palette:'rose',appearance:'dark'});
 assert.equal(Preferences.get().appearance,'dark');
 const saved=JSON.parse(store.getItem(Preferences.KEY));
 assert.equal(saved.design,'classic');
 assert.equal(saved.appearance,'dark');
 store.setItem(Preferences.KEY,JSON.stringify({...saved,design:'floral',appearance:'dark'}));
 Preferences.reload();
 assert.equal(Preferences.get().appearance,'light');
});
test('appearance controls are disabled only for floral theme',()=>{
 const js=read('app-preferences.js');
 assert.match(js,/floral&&b\.dataset\.appearance!=='light'/);
 assert.match(js,/b\.disabled=locked/);
 assert.match(js,/if\(!b\|\|b\.disabled\)return/);
 assert.match(js,/data-floral-appearance-note/);
});
test('manual entry uses dark text on dark surfaces with visible additions',()=>{
 for(const id of ['mem-add','rev-add','mem-surah','rev-surah','rev-juz','mem-chips','rev-chips','rev-chips-toggle'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const token of ['#tab-manual>.card','#tab-manual .v68-manual-note','#tab-manual .seg-toggle .seg.on','#tab-manual :is(#mem-add,#rev-add,#btnSaveToday)','#tab-manual :is(#mem-chips,#rev-chips) .chip-check'])assert.ok(css.includes(token),token);
 assert.match(css,/#tab-manual #rev-chips \.chip-check\{border-inline-start:3px solid var\(--blue\)!important\}/);
 assert.match(css,/-webkit-text-fill-color:var\(--ink\)!important/);
});
test('khatma, home attention, home task link and calendar active toggle have contrast',()=>{
 for(const selector of ['#tab-khatma :is(.v69-empty-hero,.v69-kh-hero,.v69-kh-today,.v69-settings-card)',
  '#tab-home #homeAttentionCard .v65-att-list button',
  '#tab-home #homeTodayCard .v72-home-today>button',
  '#tab-calendar .view-toggle button.on',
  '#settingsModal #set-name'])assert.ok(css.includes(selector),selector);
 assert.match(css,/#tab-calendar \.view-toggle button\.on\{\s*background:var\(--accent\)!important;color:var\(--page\)!important/);
 assert.match(css,/#tab-more \.v50-top,:root\[data-theme="dark"\] #tab-more \.v50-top\{/);
 assert.match(floralCss,/#tab-more \.v50-top\{background:transparent!important/);
});
test('updated style is fetched with a new cache version',()=>{
 assert.match(html,/theme-contrast-v192\.css\?v=194/);
});
