'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'..');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const mushaf=fs.readFileSync(path.join(root,'mushaf.html'),'utf8');

function extract(source,first,last){
 const start=source.indexOf(first),end=source.indexOf(last,start);
 assert.ok(start>=0 && end>start,`missing function boundaries: ${first}`);
 return source.slice(start,end);
}

test('switchTab updates real navigation DOM and aria-current across primary and secondary screens',()=>{
 const dom=new JSDOM(index,{runScripts:'outside-only'});
 const document=dom.window.document;
 const src=extract(index,'function switchTab(t){',"\ndocument.getElementById('tabs').addEventListener");
 const calls=[];
 const switchTab=new Function('document','window','requestAnimationFrame','openMushafAtV50','lastActivityPageV50',src+'\nreturn switchTab;')(
  document,{scrollTo(){calls.push('scroll');}},()=>{},()=>calls.push('mushaf'),()=>489
 );
 for(const name of ['home','today','calendar','map','more','tafsir']){
  switchTab(name);
  assert.equal(document.getElementById('tab-'+name).classList.contains('active'),true,name);
  const selected=[...document.querySelectorAll('#bottomNav button[aria-current="page"]')].map(x=>x.dataset.tab);
  const expected=['home','today','calendar','map'].includes(name)?[name]:[];
  assert.deepEqual(selected,expected,name);
  assert.equal(document.body.dataset.page,name);
 }
 switchTab('mushaf');
 assert.equal(calls.at(-1),'mushaf');
});

test('recitation status only offers explicit recovery when a draft exists',()=>{
 const src=extract(mushaf,'function renderRecJobsV86(entries){','\nconst recJobsV86=');
 const button={hidden:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v}};
 let saved=null;
 const render=new Function('$','loadReviewDraftV119','ARA',src+'\nreturn renderRecJobsV86;')(
  id=>id==='recJobStatus'?button:null,()=>saved,x=>String(x)
 );
 render([]);
 assert.equal(button.hidden,true);
 assert.equal(button.textContent,'');
 saved={id:'saved-draft',pages:[{page:489}]};
 render([]);
 assert.equal(button.hidden,false);
 assert.equal(button.textContent,'مسودة تسميع محفوظة');
 assert.match(button.attrs['aria-label'],/فتح مسودة/);
 render([{status:'processing'}]);
 assert.equal(button.hidden,false);
 assert.equal(button.textContent,'جارٍ تحليل 1 جلسة');
 saved=null;
 render([{status:'done'}]);
 assert.equal(button.hidden,true);
 assert.equal(button.textContent,'');
});
