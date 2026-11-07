/* Phase 03: explicit, bounded, idempotent Tarteel import into the main error ledger. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrTarteelMerge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const QUEUE_KEY='durr-tarteel-review-queue-v1',BACKUP_KEY='durr-tarteel-before-merge-v1';
const LABELS={EXTRA_WORDS:'زيادة كلمات',INCORRECT_WORDS:'قراءة غير مطابقة',MISSED_WORDS:'سقوط كلمات',INCORRECT_TASHKEEL:'خطأ تشكيل',PEEKED_WORDS:'استعانة بالمصحف'};
const good=n=>Number.isInteger(+n)&&+n>0;
function validate(queue){
 if(!queue||queue.schema!=='durr-tarteel-confirm-v1'||queue.confirmed!==true||typeof queue.owner!=='string'||!queue.owner||queue.owner.length>128||!Array.isArray(queue.errors)||!queue.errors.length||queue.errors.length>100)throw Error('Invalid or unconfirmed Tarteel batch');
 const seen=new Set();
 return queue.errors.map(row=>{
   if(!row||row.source!=='tarteel'||typeof row.key!=='string'||!/^tarteel:error:[a-f0-9]{1,16}$/.test(row.key)||!LABELS[row.type]||seen.has(row.key))throw Error('Invalid or duplicate Tarteel error');
   seen.add(row.key);
   const p=row.positions?.[0],page=+row.faces?.[0];
   if(!p||!good(p.surah)||+p.surah>114||!good(p.ayah)||!good(p.word)||!good(page)||page>604)throw Error('Unmapped error cannot be confirmed');
   if(!/^\d{4}-\d{2}-\d{2}/.test(row.createdAt||''))throw Error('Invalid Tarteel date');
   return {id:'import:'+row.key,importKey:row.key,source:'tarteel',userConfirmed:true,verification:'manual-confirmation',
    type:LABELS[row.type],errorGroup:row.type,desc:[row.expected?'الصواب: '+String(row.expected).slice(0,100):'',row.received?'القراءة: '+String(row.received).slice(0,100):''].filter(Boolean).join(' · '),
    surahId:+p.surah,ayah:+p.ayah,wordIndex:+p.word-1,verseKey:p.surah+':'+p.ayah,page,
    date:row.createdAt.slice(0,10),archived:false,externalSession:row.sessionKey||''};
 });
}
function plan(state,queue){
 const normalized=validate(queue),existing=new Set((state?.errors||[]).filter(e=>e?.source==='tarteel'&&e.importKey).map(e=>e.importKey));
 const added=normalized.filter(e=>!existing.has(e.importKey));
 return {added,skipped:normalized.length-added.length,originalCount:normalized.length};
}
function merge(state,queue){
 if(!state||typeof state!=='object'||!Array.isArray(state.errors))throw Error('Invalid local state');
 const result=plan(state,queue);
 return {state:{...state,errors:[...state.errors,...result.added].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))},added:result.added.length,skipped:result.skipped};
}
return {QUEUE_KEY,BACKUP_KEY,LABELS,validate,plan,merge};
});