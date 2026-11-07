const test=require('node:test');
const assert=require('node:assert/strict');
const {ingest}=require('../tarteel-import.js');
const {QUEUE_KEY,BACKUP_KEY,plan,merge,validate}=require('../tarteel-merge.js');
const sessions=[{session_id:'a',session_type:'RECITE',recitation_mode:'DETECTION',started_at:'2026-01-01T00:00:00Z',start_surah_number:76,start_ayah_number:1,end_surah_number:76,end_ayah_number:2}];
const mistakes=[{session_id:'a',mistake_type:'INCORRECT_TASHKEEL',positions:[{surah_number:76,ayah_number:1,word_number:3}],created:'2026-01-01T00:00:05Z',expected:'أَتَى',received:'أُتَى'}];
const imported=ingest(sessions,mistakes,{faceForAyah:()=>578});
const confirmed={schema:'durr-tarteel-confirm-v1',confirmed:true,owner:'local-only',errors:[imported.errors[0]]};
test('explicit selected Tarteel mistakes merge into manual-confirmed error ledger only',()=>{
 const original={errors:[{source:'manual',type:'تسميع',page:1}],recitationSessions:[],logs:[],pages:{'1':'solid'}};
 const r=merge(original,confirmed);
 assert.equal(r.added,1);assert.equal(r.skipped,0);assert.equal(original.errors.length,1,'original state remains untouched');
 assert.equal(r.state.errors.length,2);
 const e=r.state.errors.find(e=>e.source==='tarteel');
 assert.equal(e.importKey,imported.errors[0].key);assert.equal(e.page,578);
 assert.equal(e.verseKey,'76:1');assert.equal(e.wordIndex,2);
 assert.equal(e.verification,'manual-confirmation');assert.equal(e.userConfirmed,true);
 assert.deepEqual(r.state.recitationSessions,[]);
 assert.deepEqual(r.state.pages,{'1':'solid'},'import does not award faces or change map');
 assert.deepEqual(r.state.logs,[],'import does not create daily plan credit');
});
test('repeating a reviewed batch skips prior imported keys and never duplicates manual errors',()=>{
 const original={errors:[{source:'manual',importKey:'another',page:1}]};
 const once=merge(original,confirmed),twice=merge(once.state,confirmed);
 assert.equal(once.added,1);assert.equal(twice.added,0);
 assert.equal(twice.skipped,1);assert.equal(twice.state.errors.length,2);
});
test('unconfirmed, unmapped, oversized, or forged batches are rejected',()=>{
 const clone=v=>JSON.parse(JSON.stringify(v));
 for(const change of [q=>{q.confirmed=false;},q=>{q.errors[0].faces=[];},q=>{q.errors[0].source='auto';},q=>{q.errors[0].key='malformed';},q=>{q.errors=Array(101).fill(q.errors[0]);}]){
  const q=clone(confirmed);change(q);assert.throws(()=>validate(q));
 }
 assert.ok(QUEUE_KEY!==BACKUP_KEY);
});
test('source identifiers are idempotent, while unrelated existing records stay intact',()=>{
 const q={...confirmed,errors:[...confirmed.errors]};
 const first=plan({errors:[]},q);
 const existing={errors:[{...first.added[0],userConfirmed:false},{source:'manual',page:76}]};
 const second=plan(existing,q);
 assert.equal(second.added.length,0);assert.equal(second.skipped,1);
 assert.equal(merge(existing,q).state.errors[1].source,'manual');
});
