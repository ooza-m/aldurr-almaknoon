/* Local-only Tarteel parser. Do not send source files to servers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrTarteelImport=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const TYPES=['EXTRA_WORDS','INCORRECT_WORDS','MISSED_WORDS','INCORRECT_TASHKEEL','PEEKED_WORDS'];
const validNum=n=>Number.isInteger(n)&&n>0;
const date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():null;
const text=(v,n=500)=>typeof v==='string'?v.slice(0,n):'';
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)}
function hash(v){const s=stable(v);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16)}
function ingest(sessions,mistakes,{faceForAyah=()=>null}={}){
 if(!Array.isArray(sessions)||!Array.isArray(mistakes))throw Error('Select sessions.json and mistakes.json');
 const ss=new Map(),duplicates=[],rejected=[];for(const s of sessions){
  if(!s||!s.session_id||ss.has(s.session_id)){duplicates.push('session');continue}
  if(!validNum(s.start_surah_number)||s.start_surah_number>114||!validNum(s.start_ayah_number)||!date(s.started_at)){rejected.push({kind:'session',reason:'invalid'});continue}
  ss.set(s.session_id,{key:'tarteel:session:'+s.session_id,source:'tarteel',type:text(s.session_type,24),mode:text(s.recitation_mode,30),startedAt:date(s.started_at),endedAt:date(s.ended_at),start:{surah:s.start_surah_number,ayah:s.start_ayah_number},end:{surah:s.end_surah_number,ayah:s.end_ayah_number},assessed:s.session_type==='RECITE'&&s.recitation_mode==='DETECTION',durationMs:Number.isFinite(s.duration_ms)?s.duration_ms:null,faces:[]});
 }
 const errors=[],seen=new Set();let unmapped=0;
 for(const [i,e] of mistakes.entries()){
  if(!e||!ss.has(e.session_id)||!TYPES.includes(e.mistake_type)||!date(e.created)||!Array.isArray(e.positions)||!e.positions.length){rejected.push({kind:'mistake',index:i,reason:'invalid'});continue}
  const ps=e.positions.map(p=>({surah:p?.surah_number,ayah:p?.ayah_number,word:p?.word_number}));
  if(ps.some(p=>!validNum(p.surah)||p.surah>114||!validNum(p.ayah)||!validNum(p.word))){rejected.push({kind:'mistake',index:i,reason:'position'});continue}
  const canonical={session:e.session_id,type:e.mistake_type,positions:ps,start:e.start_time_ms,end:e.end_time_ms,expected:text(e.expected),received:text(e.received),created:date(e.created)};
  const key='tarteel:error:'+hash(canonical);if(seen.has(key)){duplicates.push('error');continue}seen.add(key);
  const faces=[...new Set(ps.map(p=>faceForAyah(p.surah,p.ayah)).filter(x=>validNum(x)&&x<=604))];if(!faces.length)unmapped++;
  errors.push({key,source:'tarteel',sessionKey:ss.get(e.session_id).key,type:e.mistake_type,positions:ps,faces,expected:canonical.expected,received:canonical.received,createdAt:canonical.created,reviewStatus:'unreviewed'});
 }
 return {schema:'durr-tarteel-v1',sessions:[...ss.values()],errors,summary:{sessions:ss.size,errors:errors.length,duplicates:duplicates.length,rejected:rejected.length,unmapped,byType:Object.fromEntries(TYPES.map(t=>[t,errors.filter(e=>e.type===t).length]))}};
}
function planMerge(existing,incoming){const sk=new Set((existing?.sessions||[]).map(s=>s.key)),ek=new Set((existing?.errors||[]).map(e=>e.key));return {newSessions:incoming.sessions.filter(x=>!sk.has(x.key)),newErrors:incoming.errors.filter(x=>!ek.has(x.key)),skippedSessions:incoming.sessions.length-incoming.sessions.filter(x=>!sk.has(x.key)).length,skippedErrors:incoming.errors.length-incoming.errors.filter(x=>!ek.has(x.key)).length}}
return {ingest,planMerge,TYPES};
});