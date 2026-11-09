'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=source.indexOf('function initNotif(){');
const end=source.indexOf('\nlet _notifTimer=',start);
assert.ok(start>=0&&end>start,'initNotif function must be found');

function make(){
 const dom=new JSDOM(source,{runScripts:'outside-only'});
 const document=dom.window.document, S={notif:{wird:false,wirdTime:'06:00',tafsir:false,tafsirTime:'21:00'}};
 let saves=0,schedules=0,prompts=0;
 const Notification={permission:'default',requestPermission:async()=>{prompts++;return 'granted'}};
 const window={Notification};
 const fn=new Function('document','window','Notification','S','save','scheduleNotifs',
  source.slice(start,end)+'\nreturn initNotif;')(document,window,Notification,S,()=>{saves++},()=>{schedules++});
 return {dom,document,S,Notification,fn,counts:()=>({saves,schedules,prompts})};
}

test('opening settings initializes reminders without prompting for notification permission',()=>{
 const x=make();
 x.fn();
 assert.equal(x.counts().prompts,0);
 assert.equal(x.document.getElementById('ntWird').checked,false);
 assert.equal(x.document.getElementById('ntWirdTime').value,'06:00');
 assert.equal(x.document.getElementById('ntTafsirTime').value,'21:00');
 assert.equal(x.counts().saves,0);
});

test('notification permission is requested only after enabling a reminder',async()=>{
 const x=make();
 x.fn();x.fn();
 const wc=x.document.getElementById('ntWird');
 wc.checked=true;wc.dispatchEvent(new x.dom.window.Event('change',{bubbles:true}));
 await new Promise(r=>setImmediate(r));
 assert.equal(x.counts().prompts,1,'double init must not attach duplicate listeners');
 assert.equal(x.S.notif.wird,true);
 assert.equal(x.counts().saves,1);
 assert.equal(x.document.getElementById('ntWirdTime').style.display,'');
});

test('changing reminder time preserves other settings and never requests permission',()=>{
 const x=make();x.fn();
 const wt=x.document.getElementById('ntWirdTime');
 wt.value='07:20';wt.dispatchEvent(new x.dom.window.Event('change'));
 assert.equal(x.S.notif.wirdTime,'07:20');
 assert.equal(x.S.notif.tafsirTime,'21:00');
 assert.equal(x.counts().prompts,0);
 assert.equal(x.counts().saves,1);
});
