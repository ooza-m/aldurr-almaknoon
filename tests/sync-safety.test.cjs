'use strict';
/* Regression tests for the pure conflict-merge rules from the production dashboard.
   Run: node --test tests/sync-safety.test.cjs
   These tests NEVER connect to Firebase or touch personal data. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('const CLOUD_RECORD_LISTS_V152=');
const end=html.indexOf("document.getElementById('cloudChoicesV153')?",start);
assert.ok(start>=0&&end>start,'production conflict logic available');
const {cloudPlanMergeV152,cloudManualPlanV153}=
 new Function(html.slice(start,end)+';return {cloudPlanMergeV152,cloudManualPlanV153};')();
const B={recitationSessions:[{id:'s1',task:'new'}],errors:[{id:'e1',type:'نسيان'}],pageMastery:{'25':{level:'good'}},plan:{goal:3},updatedAt:1};
const L={recitationSessions:[...B.recitationSessions,{id:'s2',task:'fix'}],errors:B.errors,pageMastery:{'25':{level:'weak'}},plan:{goal:3},updatedAt:2};
const R={recitationSessions:[...B.recitationSessions,{id:'s3',task:'near'}],errors:B.errors,pageMastery:{'25':{level:'strong'}},plan:{goal:3},updatedAt:3};
test('independent session IDs combine with common baseline',()=>{
 const result=cloudPlanMergeV152(B,{...L,pageMastery:B.pageMastery}, {...R,pageMastery:B.pageMastery});
 assert.deepEqual(result.conflicts,[]);
 assert.deepEqual(result.merged.recitationSessions.map(s=>s.id),['s1','s2','s3']);
});
test('conflicting face mastery remains blocked until explicit choice',()=>{
 const undecided=cloudManualPlanV153(B,L,R);
 assert.equal(undecided.unresolved.length,1);
 assert.equal(undecided.rows[0].label,'pageMastery / 25 / level');
 const selected=cloudManualPlanV153(B,L,R,{[undecided.rows[0].id]:'remote'});
 assert.deepEqual(selected.unresolved,[]);
 assert.equal(selected.merged.pageMastery['25'].level,'strong');
 assert.deepEqual(selected.merged.recitationSessions.map(x=>x.id),['s1','s2','s3']);
});
test('same session ID with divergent content is never merged silently',()=>{
 const x={...L,recitationSessions:[{id:'s1',task:'fix'}],pageMastery:B.pageMastery};
 const y={...R,recitationSessions:[{id:'s1',task:'far'}],pageMastery:B.pageMastery};
 assert.ok(cloudManualPlanV153(B,x,y).unresolved.includes('recitationSessions'));
});
test('deleted record is never restored by automatic union',()=>{
 const l={...B,errors:[]};
 const r={...B,errors:[...B.errors,{id:'e2',type:'سهو'}]};
 assert.ok(cloudPlanMergeV152(B,l,r).conflicts.includes('errors'));
});
test('a list without stable IDs cannot be auto-merged',()=>{
 const l={...B,errors:[{type:'نسيان'}]};
 const r={...B,errors:[{type:'سهو'}]};
 assert.ok(cloudPlanMergeV152(B,l,r).conflicts.includes('errors'));
});
test('different plans require review or explicit choice, never timestamp arbitration',()=>{
 const l={...B,plan:{goal:2}};
 const r={...B,plan:{goal:5}};
 const u=cloudManualPlanV153(B,l,r);
 assert.equal(u.rows.length,1);
 assert.equal(u.unresolved.length,1);
 assert.equal(cloudManualPlanV153(B,l,r,{[u.rows[0].id]:'local'}).merged.plan.goal,2);
});
test('missing common baseline blocks union of independent records',()=>{
 const l={recitationSessions:[{id:'a'}],updatedAt:10};
 const r={recitationSessions:[{id:'b'}],updatedAt:20};
 assert.ok(cloudPlanMergeV152(null,l,r).conflicts.includes('recitationSessions'));
});
test('production sync still uses atomic Firestore transaction',()=>{
 assert.match(html,/fbDb\.runTransaction\(async tx=>/);
 assert.match(html,/transaction\.set\(docRef\(\),\{payload:proposed/);
});
test('restoring a JSON backup invalidates stale cloud baseline',()=>{
 assert.match(html,/cloudBaselineV151=null;\s*S=state;if\(preferences\)/);
});
test('offline local changes cannot overwrite differing cloud data by timestamp alone',()=>{
 assert.match(html,/localHas&&cloudHas&&localUpdated>cloudUpdated&&!cloudEqualV152\(S,cloudS\)/);
});

test('daily backups use separate IndexedDB stores for snapshots and audit',()=>{
 assert.match(html,/const BACKUP_DB_V154='aldurr-safety-v154'/);
 assert.match(html,/createObjectStore\('snapshots',\{keyPath:'id'\}\)/);
 assert.match(html,/createObjectStore\('audit',\{keyPath:'id'\}\)/);
});
test('automatic backups are daily and rotate at five snapshots',()=>{
 assert.match(html,/item\.at>now-24\*3600\*1000/);
 assert.match(html,/for\(const old of ordered\.slice\(5\)\)store\.delete\(old\.id\)/);
});
test('restore requires a checkpoint and explicitly invalidates cloud baseline',()=>{
 assert.match(html,/await backupCreateV154\('before-restore',true\)/);
 assert.match(html,/DurrData\.checkpoint\(localStorage,currentBackupV86\(\)\)/);
 assert.match(html,/cloudBaselineV151=null;\s*S=state/);
});
test('backup errors do not stop the primary local save path',()=>{
 assert.match(html,/localStorage\.setItem\(KEY,JSON\.stringify\(S\)\);cloudDirtyV151=true;backupScheduleV154\(\)/);
 assert.match(html,/backupCreateV154\('automatic'\)\.catch\(e=>\{/);
});

test('backup snapshots and audit remain scoped to the active account',()=>{
 assert.match(html,/function backupOwnerV155\(\)\{return fbUser\?\.uid\|\|'local-only';\}/);
 assert.match(html,/function backupOwnedV155\(row\)/);
 assert.match(html,/const list=\(await backupReadStoreV154\('snapshots'\)\)\.filter\(backupOwnedV155\)/);
 assert.match(html,/const snapshots=data\.filter\(backupOwnedV155\)/);
 assert.match(html,/const ownAudit=audit\.filter\(backupOwnedV155\)/);
});
test('IndexedDB reads resolve only after transaction completion',()=>{
 assert.match(html,/tx\.oncomplete=\(\)=>\{db\.close\(\);resolve\(rows\);\}/);
 assert.match(html,/req\.onblocked=\(\)=>reject/);
});
test('restore confirmation previews history before overwriting local state',()=>{
 assert.match(html,/const summary='نسخة بتاريخ '/);
 assert.match(html,/bundle\.state\?\.recitationSessions\?\.length/);
 assert.match(html,/await backupCreateV154\('before-restore',true\)/);
});
test('automatic backup scheduling coalesces repeated saves',()=>{
 assert.match(html,/if\(!hasData\(S\)\|\|backupScheduledV155\)return/);
 assert.match(html,/backupScheduledV155=false;\s*backupCreateV154\('automatic'\)/);
});
