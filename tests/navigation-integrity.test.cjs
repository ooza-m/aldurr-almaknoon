const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
test('bell opens only the dedicated reminder dialog',()=>{
 assert.match(html,/id="homeNotifBtn"[^>]*aria-label="التنبيهات"/);
 assert.match(html,/n\.addEventListener\('click',openReminders\)/);
 assert.doesNotMatch(html,/n\.addEventListener\('click',\(\)=>openSettings\(\)\)/);
 assert.match(html,/id="reminderModal"/);
});
test('reminder controls are unique and separate from global preferences',()=>{
 for(const id of ['ntWird','ntWirdTime','ntTafsir','ntTafsirTime','ntStatus']){
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/id="openRemindersFromSettings"/);
 assert.match(html,/id="reminderClose"/);
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
