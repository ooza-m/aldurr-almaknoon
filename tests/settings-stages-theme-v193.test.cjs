'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'theme-contrast-v192.css'),'utf8');
test('home and today title rows have no boxed backgrounds',()=>{
 for(const selector of ['#tab-home .v50-page .v50-hero','#tab-home .v50-page .v50-top','#tab-today .v50-page .v50-top'])assert.ok(css.includes(selector));
 assert.match(css,/background:transparent!important;background-image:none!important/);
});
test('backup controls are preserved inside one collapsible group',()=>{
 const start=html.indexOf('<details class="v70-set-group backup-fold-v193"'),end=html.indexOf('<div class="v70-set-danger">',start),section=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(section,/<summary>النسخ الاحتياطية/);
 for(const id of ['cloudInspectV108','cloudExtrasStatusV109','settingsBackup','settingsRestore','settingsUndoRestore','backupHistoryV154','backupCreateNowV154'])assert.ok(section.includes('id="'+id+'"'),id);
 assert.match(section,/<\/details><\/div><\/details>/);
});
test('selected week start and halaqa days inherit current palette accent',()=>{
 for(const sel of ['#settingsModal #weekStartPick .chip-check.on','#settingsModal #halaqaDayPick .chip-check.on'])assert.ok(css.includes(sel));
 assert.match(css,/background:var\(--accent\)!important/);
 assert.match(css,/border-color:var\(--accent\)!important/);
});
test('milestones page owns the direction control and uses the safe existing changePath',()=>{
 const stages=html.slice(html.indexOf('<section class="tab-panel" id="tab-stages">'),html.indexOf('<!-- ===== الإحصاءات ===== -->'));
 assert.match(stages,/id="stagePathCustomizeV193"/);
 assert.doesNotMatch(html,/id="set-path-(up|down)"/);
 assert.match(html,/id="pathModal"/);
 assert.match(html,/if\(S\.profile\?\.pathChosen\)\{if\(changePath\(dir\)\)/);
 assert.match(html,/const oldByRange=\{\}/);
 assert.match(html,/id="stagePathCurrentV193"/);
 assert.match(html,/document\.getElementById\('stagePathCustomizeV193'\)\?\.addEventListener/);
});
test('page inline scripts remain syntactically valid',()=>{
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim());
 for(const script of scripts)assert.doesNotThrow(()=>new Function(script));
});
