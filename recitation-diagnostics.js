/* Local, read-only timing diagnostics. No audio or transcript storage. */
(function(){
'use strict';
const style=document.createElement('style');
style.textContent='.durr-diag-btn{display:block;margin:10px 0;padding:10px 14px;border:1px solid var(--line,#ddd);border-radius:12px;font:inherit;color:var(--ink,#543);background:#fff}.durr-diag-panel{margin:8px 0;padding:12px;border-radius:13px;background:var(--parch,#faf4ed);border:1px solid var(--line,#ddd);font-size:13px;line-height:1.8}.durr-diag-panel[hidden]{display:none!important}.durr-diag-panel dl{display:grid;grid-template-columns:1fr auto;gap:5px 12px}.durr-diag-panel dd{font-variant-numeric:tabular-nums;font-weight:700}.durr-diag-panel p{margin:8px 0;color:var(--muted,#806d74)}';
document.head.appendChild(style);
const host=document.querySelector('#qasrStatusNote');
if(!host)return;
const button=document.createElement('button');
button.className='durr-diag-btn';button.type='button';button.textContent='تشخيص تأخر التسميع';button.setAttribute('aria-expanded','false');
const panel=document.createElement('section');panel.className='durr-diag-panel';panel.hidden=true;panel.setAttribute('aria-label','قياسات جلسة التسميع');
host.insertAdjacentElement('afterend',button);button.insertAdjacentElement('afterend',panel);
function render(){
 const stats=(typeof recSession!=='undefined'&&recSession&&recSession.stats)||{};
 const fmt=(v,n)=>n>0?Math.round(v/n)+' مللي ثانية':'لا توجد قياسات';
 const fields=[
 ['متوسط انتظار المقطع',fmt(stats.quranQueueWaitMs,stats.quranQueueWaitN)],
 ['أطول انتظار',stats.quranQueueWaitN?Math.round(stats.quranQueueMax||0)+' مللي ثانية':'لا توجد قياسات'],
 ['متوسط استجابة الخادم',fmt(stats.quranLatencyMs,stats.quranLatencyN)],
 ['أطول استجابة',stats.quranLatencyN?Math.round(stats.quranLatencyMax||0)+' مللي ثانية':'لا توجد قياسات'],
 ['متوسط المطابقة',fmt(stats.alignmentMs,stats.alignmentN)],
 ['طلبات التنبيه',String(stats.errorAlertCount||0)],
 ['تجاوز سعة انتظار الصوت',String(stats.quranQueueOverflow||0)],
 ['وصول مقاطع المحرك',String(stats.quranChunks||0)],
 ['نتائج المتصفح',String(stats.browserChunks||0)]
 ];
 const dl=document.createElement('dl');
 for(const [k,v] of fields){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;dl.append(dt,dd);}
 panel.replaceChildren(dl);
 const note=document.createElement('p');note.textContent='القياسات للجلسة الحالية فقط. طلب التنبيه لا يثبت أن الصوت سُمِع. لا نحفظ الصوت أو نص التلاوة هنا.';panel.append(note);
}
button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)render()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!panel.hidden)render()});
})();
