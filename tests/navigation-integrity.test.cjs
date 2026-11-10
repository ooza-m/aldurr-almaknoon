const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('home More shortcut opens the More tab instead of a removed reminders dialog',()=>{
 assert.match(html,/id="homeNotifBtn"[^>]*aria-label="المزيد"/);
 assert.match(html,/if\(n\)n\.addEventListener\('click',\(\)=>switchTab\('more'\)\)/);
 assert.doesNotMatch(html,/id="reminderModal"/);
});
test('notification controls are unique and belong to global settings',()=>{
 for(const id of ['ntWird','ntWirdTime','ntTafsir','ntTafsirTime','ntStatus']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/id="settingsModal"/);
});
test('settings have one visible main navigation destination',()=>{
 assert.match(html,/id="moreSettingsBtn"/);
 assert.doesNotMatch(html,/id="settingsBtn"/);
 assert.doesNotMatch(html,/id="todayTuneBtn"/);
});
test('inline scripts remain syntactically valid',()=>{
 let count=0;
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
   if(!match[1].trim())continue;
   assert.doesNotThrow(()=>new Function(match[1]));
   count++;
 }
 assert.ok(count>=3);
});
