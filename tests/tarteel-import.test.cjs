const test=require('node:test'),assert=require('node:assert/strict');const {ingest,planMerge}=require('../tarteel-import.js');
const sessions=[{session_id:'a',session_type:'RECITE',recitation_mode:'DETECTION',started_at:'2026-01-01T00:00:00Z',start_surah_number:76,start_ayah_number:1,end_surah_number:76,end_ayah_number:2}];
const mistakes=[{session_id:'a',mistake_type:'INCORRECT_TASHKEEL',positions:[{surah_number:76,ayah_number:1,word_number:3}],created:'2026-01-01T00:00:05Z',expected:'أَتَى',received:'أُتَى'}];
test('maps ayah to page and deduplicates repeat mistakes',()=>{const r=ingest(sessions,[...mistakes,...mistakes],{faceForAyah:()=>578});assert.equal(r.errors.length,1);assert.deepEqual(r.errors[0].faces,[578]);assert.equal(r.summary.duplicates,1)});
test('reimport creates no new entries',()=>{const r=ingest(sessions,mistakes);const m=planMerge(r,r);assert.equal(m.newSessions.length,0);assert.equal(m.newErrors.length,0)});
test('rejects missing positions',()=>{const r=ingest(sessions,[{...mistakes[0],positions:[]}]);assert.equal(r.summary.rejected,1)});
test('rejects profile-only data and does not leak email',()=>{const r=ingest([{...sessions[0],email:'private@example.com'}],mistakes);assert.equal(JSON.stringify(r).includes('private@example.com'),false)});
