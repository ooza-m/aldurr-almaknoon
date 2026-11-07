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

test('Today places its actions ahead of optional analysis without removing the tools',()=>{
 assert.match(html,/function organizeTodayV156\(\)/);
 assert.match(html,/priority\.after\(heading\)/);
 assert.match(html,/heading\.after\(tasks\)/);
 assert.match(html,/const focus=document\.getElementById\('focusedVerseReviewsV143'\),review=document\.getElementById\('dailyPageQueueV122'\)/);
 assert.match(html,/details\.id='todayFurtherV156'/);
 assert.match(html,/body\.appendChild\(el\)/);
});
test('legacy memorization analytics use explicit approved face completion',()=>{
 assert.ok(!html.includes('if(p.complete&&p.coverage>=.95)set.add(+p.page);'));
 assert.ok(!html.includes('if(p.complete&&p.coverage>=.95)n++;'));
 assert.ok(!html.includes('if(p.complete&&p.coverage>=.95)donePages.push'));
 assert.match(html,/if\(approvedRecitationFaceV149\(r,p\)\)set\.add\(\+p\.page\)/);
});
test('manual-only recitation results never receive a fabricated numeric score',()=>{
 assert.match(html,/const ratedPages=donePages\.filter\(p=>p\.manualConfirmed!==true&&p\.score!=null&&Number\.isFinite\(\+p\.score\)\)/);
 assert.match(html,/لا يوجد تقييم رقمي؛ الاعتماد يدوي/);
});

test('daily task launch resumes a matching unfinished plan and respects completed faces',()=>{
 assert.match(html,/const resumable=previous&&previous\.task===taskId&&previous\.date===todayKey\(\)/);
 assert.match(html,/previous\.pages\.slice\(\+previous\.pos\)\.find\(p=>pages\.includes\(\+p\)\)/);
 assert.match(html,/pages\.indexOf\(\+nextDue\)/);
 assert.match(html,/resume\?'استئناف الجلسة'/);
});
test('mushaf preserves incomplete session position without auto-crediting faces',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const mushaf=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/if\(payload\.planCompleted===true&&payload\.planId&&ACTIVE_TASK_SESSION\?\.id===payload\.planId\)/);
 assert.match(mushaf,/expected\.every\(p=>approved\.has\(\+p\)\)/);
 assert.match(mushaf,/if\(!ACTIVE_TASK_SESSION\|\|!recMode\)\{chip\.classList\.remove\('on'\);return;\}/);
 assert.match(mushaf,/p\.complete=false;p\.manualConfirmed=false/);
 assert.match(mushaf,/saveReviewDraftV119\(payload\)/);
});
test('task page transition does not mark position advanced until next page opens',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const mushaf=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/settle\(next\)\.then\(\(\)=>\{if\(recMode&&cur===next\)/);
 assert.match(mushaf,/ACTIVE_TASK_SESSION\.pos=i\+1/);
 assert.match(mushaf,/وصلتِ إلى آخر وجه · اعتمدي الأوجه التي أتممتِها/);
});

test('microphone pause and resume preserve cumulative active recording time',()=>{
 const mushaf=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/recElapsedMsV158\+=Math\.max\(0,Date\.now\(\)-recT0\)/);
 assert.match(mushaf,/recElapsedMsV158\+\(recOn&&recT0\?/);
 assert.match(mushaf,/recElapsedMsV158=0;recT0=0;tickTimer\(\)/);
});
test('manual word hints never trigger page navigation',()=>{
 const mushaf=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/function revealNextWord\(\).*?return;/);
 assert.match(mushaf,/وصلتِ إلى نهاية كلمات الوجه · للانتقال استخدمي زر الوجه التالي/);
 assert.match(mushaf,/function autoAdvance\(manual=false\)/);
 assert.match(mushaf,/if\(!manual&&!recOn\)return/);
});
test('automatic page advance requires sufficient unassisted spoken words',()=>{
 const mushaf=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/lastWords\.every\(w=>/);
 assert.match(mushaf,/!sec\.state\.assisted\.has\(key\)/);
 assert.match(mushaf,/spokenCoverage<\.8/);
 assert.match(mushaf,/if\(!recOn\|\|!recMode\|\|recSession\?\.id!==owner\|\|cur!==face\)return/);
});
test('speech callbacks cannot mutate an unrelated or stopped session',()=>{
 const mushaf=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/r\._stopped\|\|\(!recOn&&!r\._stopping\)\|\|r!==speechRec\|\|recSession\?\.id!==ctx\.session\.id/);
 assert.match(mushaf,/void stopRec\(\); \/\/ لا تبقي زر الميكروفون/);
});
test('pause, finish and manual next face are separate controls',()=>{
 const mushaf=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/id="recNextFaceV158"/);
 assert.match(mushaf,/autoAdvance\(true\)/);
 assert.match(mushaf,/id="recExit" aria-label="إنهاء الجلسة وعرض الاعتماد"/);
 assert.match(mushaf,/aria-pressed',String\(recOn\)/);
});

test('only user-reviewed modern follow-along pages can complete daily tasks',()=>{
 const anchor='function approvedRecitationFaceV149(';
 const start=html.indexOf(anchor),end=html.indexOf('\nfunction firstMemDateMapV50(',start);
 assert.ok(start>=0&&end>start);
 const approved=new Function(html.slice(start,end)+';return approvedRecitationFaceV149;')();
 const page={page:25,complete:true,manualConfirmed:true};
 assert.equal(approved({task:'new',version:86,userReviewed:false},page),false);
 assert.equal(approved({task:'new',version:86,userReviewed:true},page),true);
 assert.equal(approved({task:'free',version:86,userReviewed:true},page),false);
 assert.equal(approved({task:'new',version:86,userReviewed:true},{...page,manualConfirmed:false}),false);
});
test('map read-through is not represented as an approved completed face',()=>{
 assert.match(html,/complete:approvedRecitationFaceV149\(rs,pg\)/);
 assert.match(html,/manualConfirmed:approvedRecitationFaceV149\(rs,pg\)/);
 assert.match(html,/followedOnly:rs\.engine==='follow-along'/);
 assert.match(html,/res\.followedOnly\?'متابعة صوتية غير معتمدة '/);
});
test('recitation summary separates audio tracking from assisted reveal and user approval',()=>{
 const mushaf=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','mushaf.html'),'utf8');
 assert.match(mushaf,/متابعة صوتية تقريبية:/);
 assert.match(mushaf,/مساعدة في إظهار النص:/);
 assert.match(mushaf,/pg\.manualConfirmed=!!document\.querySelector/);
 assert.match(mushaf,/payload\.summary\.completedPages=\(payload\.pages\|\|\[\]\)\.filter\(pg=>pg\.manualConfirmed===true\)\.length/);
});

test('session ledger separates approved, partially approved, draft and follow-along sessions',()=>{
 const start=html.indexOf('function uniqueRecitationSessionsV163('),end=html.indexOf('function localReviewDraftsV163(',start);
 assert.ok(start>=0&&end>start);
 const approved=(rs,p)=>!!(rs&&p&&['new','fix','near','far'].includes(rs.task)&&p.complete===true&&p.manualConfirmed===true&&(+rs.version<86||rs.userReviewed===true));
 const api=new Function('approvedRecitationFaceV149',html.slice(start,end)+';return {uniqueRecitationSessionsV163,recitationSessionStatusV163};')(approved);
 const base={task:'new',version:86,pages:[{page:25,complete:true,manualConfirmed:true},{page:26,complete:false,manualConfirmed:false}]};
 assert.equal(api.recitationSessionStatusV163({...base,userReviewed:true}).key,'partial');
 assert.equal(api.recitationSessionStatusV163({...base,userReviewed:false}).key,'draft');
 assert.equal(api.recitationSessionStatusV163({...base,task:'free',userReviewed:false}).key,'follow');
 assert.equal(api.recitationSessionStatusV163({...base,userReviewed:true,pages:[base.pages[0]]}).key,'approved');
});
test('duplicate session IDs are presented once and approved version wins',()=>{
 const start=html.indexOf('function uniqueRecitationSessionsV163('),end=html.indexOf('function recitationSessionStatusV163(',start);
 const uniq=new Function(html.slice(start,end)+';return uniqueRecitationSessionsV163;')();
 const rows=[{id:'x',userReviewed:false},{id:'x',userReviewed:true},{id:'y',userReviewed:false},{id:'y',userReviewed:false,localDraftV163:true}];
 const output=uniq(rows);
 assert.equal(output.length,2);
 assert.equal(output[0].userReviewed,true);
 assert.equal(output[1].localDraftV163,true);
});
test('calendar and weekly goals never count ASR coverage as completion',()=>{
 assert.match(html,/if\(!approvedRecitationFaceV149\(r,pg\)\)return;/);
 assert.match(html,/if\(approvedRecitationFaceV149\(rs,pg\)\)addPage\(pg\.page,day\)/);
 assert.doesNotMatch(html,/pg\.manualConfirmed===true\|\|\(r\.errorDetectionEnabled===true/);
});
test('session replay does not generate automatic errors or repeated review suggestions',()=>{
 const p=html.slice(html.indexOf('function ingestRecitationSessionV51('),html.indexOf("window.addEventListener('message',",html.indexOf('function ingestRecitationSessionV51(')));
 assert.doesNotMatch(p,/errAdded\+=ingestAutomaticErrorsV86\(rs,date\)/);
 assert.match(p,/if\(old\.sessionId!==rs\.id\)old\.count=/);
 assert.match(p,/if\(previous\.userReviewed===true\)return/);
});
test('unapproved 100 percent audio coverage still appears unapproved on the map',()=>{
 assert.match(html,/const partial=!!\(res&&res\.coverage>0&&!res\.complete\)/);
 assert.match(html,/متابعة صوتية غير معتمدة /);
});
test('device drafts are visible in session history but not synced as achievements',()=>{
 assert.match(html,/function localReviewDraftsV163\(\)/);
 assert.match(html,/localStorage\.getItem\('durr-review-draft-v119'\)/);
 assert.match(html,/localDraftV163:true/);
 assert.match(html,/مسودات الاعتماد المحلية محفوظة على هذا الجهاز فقط/);
});

test('cloud pull and live listener must not replace divergent offline history by timestamp alone',()=>{
 const start=html.indexOf('function cloudRemoteAdoptionV164('),end=html.indexOf('function cloudPull(',start);
 assert.ok(start>=0&&end>start);
 const canAdopt=new Function('hasData','cloudEqualV152',html.slice(start,end)+';return cloudRemoteAdoptionV164;')(
   v=>!!(v&&v.recitationSessions?.length),
   (a,b)=>JSON.stringify(a)===JSON.stringify(b)
 );
 const baseline={recitationSessions:[{id:'a',userReviewed:true}]};
 const local={recitationSessions:[...baseline.recitationSessions,{id:'b',userReviewed:true}]};
 const remote={recitationSessions:[...baseline.recitationSessions,{id:'c',userReviewed:true}]};
 assert.equal(canAdopt(local,remote,JSON.stringify(baseline)),false);
 assert.equal(canAdopt(baseline,remote,JSON.stringify(baseline)),true);
 assert.equal(canAdopt({recitationSessions:[]},remote,null),true);
 assert.equal(canAdopt(local,remote,null),false);
 assert.match(html,/different&&!cloudRemoteAdoptionV164\(S,cloudS,cloudBaselineV151\)/);
 assert.match(html,/differs&&!cloudRemoteAdoptionV164\(S,remoteState,cloudBaselineV151\)/);
});


test('two devices independently approving different Tarteel errors merge without losing either',()=>{
 const {ingest}=require('../tarteel-import.js'),{merge}=require('../tarteel-merge.js');
 const sessions=[{session_id:'a',started_at:'2026-01-01T00:00:00Z',start_surah_number:76,start_ayah_number:1}];
 const base={errors:[],logs:[],recitationSessions:[],pages:{},updatedAt:1};
 const raws=['INCORRECT_TASHKEEL','MISSED_WORDS'].map((type,i)=>ingest(sessions,[{session_id:'a',mistake_type:type,positions:[{surah_number:76,ayah_number:1+i,word_number:1}],created:'2026-01-01T00:00:05Z'}],{faceForAyah:()=>578}).errors[0]);
 const q=rows=>({schema:'durr-tarteel-confirm-v1',confirmed:true,owner:'local-only',errors:rows});
 const local={...merge(base,q([raws[0]])).state,updatedAt:2};
 const remote={...merge(base,q([raws[1]])).state,updatedAt:3};
 const result=cloudPlanMergeV152(base,local,remote);
 assert.deepEqual(result.conflicts,[]);
 assert.equal(result.merged.errors.length,2);
 assert.ok(result.merged.errors.every(e=>e.source==='tarteel'&&e.userConfirmed===true&&e.id.startsWith('import:tarteel:')));
 assert.deepEqual(result.merged.recitationSessions,[]);
});
test('two devices disagreeing on a confirmed imported error never silently choose one',()=>{
 const {ingest}=require('../tarteel-import.js'),{merge}=require('../tarteel-merge.js');
 const input=ingest([{session_id:'s',started_at:'2026-01-01T00:00:00Z',start_surah_number:76,start_ayah_number:1}],
 [{session_id:'s',mistake_type:'MISSED_WORDS',positions:[{surah_number:76,ayah_number:1,word_number:1}],created:'2026-01-01T00:00:03Z'}],{faceForAyah:()=>578});
 const base={errors:[],updatedAt:1};
 const q={schema:'durr-tarteel-confirm-v1',confirmed:true,owner:'local-only',errors:input.errors};
 const local={...merge(base,q).state,updatedAt:2};
 const remote={...merge(base,q).state,updatedAt:3};
 remote.errors[0]={...remote.errors[0],archived:true};
 const result=cloudPlanMergeV152(base,local,remote);
 assert.ok(result.conflicts.includes('errors'));
});


test('Tarteel history and review queue are scoped to active account rather than shared global archive',()=>{
 const phase3=fs.readFileSync(path.join(__dirname,'..','tarteel-phase3.js'),'utf8');
 assert.match(html,/localStorage\.setItem\('durr-tarteel-owner-v1',u\?\.uid\|\|'local-only'\)/);
 assert.match(html,/durr-tarteel-history-v1'\+\(fbUser\?\.uid\?':'\+fbUser\.uid:''\)/);
 assert.match(phase3,/const archiveKey=\(\)=> 'durr-tarteel-history-v1'\+/);
 assert.match(phase3,/ownerUnchanged\(\);/);
 assert.match(html,/if\(queue\.owner!==owner\)/);
 assert.ok(!html.includes('id="tarteelFile"'),'legacy bulk import must not bypass review');
});
