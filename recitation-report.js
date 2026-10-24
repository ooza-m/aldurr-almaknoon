/* Local recitation diagnostics report. Explicitly not a model accuracy metric. */
(function(){
'use strict';
const api=window.DurrRecFeedback,host=document.querySelector('#qasrStatusNote');
if(!api||!host)return;
const btn=document.createElement('button');btn.type='button';btn.className='durr-feedback-btn';btn.textContent='تقرير تشخيص التسميع';
const pane=document.createElement('section');pane.className='durr-feedback-panel';pane.hidden=true;
host.insertAdjacentElement('afterend',btn);btn.insertAdjacentElement('afterend',pane);
function render(){
 const c=api.summary(localStorage);
 const stats=(typeof recSession!=='undefined'&&recSession?.stats)||{};
 const avg=(total,count)=>count>0?Math.round(total/count)+' مللي ثانية':'غير مقاس';
 const lines=[
 ['ملاحظات مراجَعة',c.correct_reading+c.actual_error+c.unsure],
 ['رصد غير صحيح بحسب مراجعتكِ',c.correct_reading],
 ['خطأ حقيقي بحسب مراجعتكِ',c.actual_error],
 ['غير متأكدة',c.unsure],
 ['بانتظار المراجعة',c.unreviewed],
 ['متوسط انتظار المقاطع (الجلسة الحالية)',avg(stats.quranQueueWaitMs,stats.quranQueueWaitN)],
 ['متوسط استجابة الخادم (الجلسة الحالية)',avg(stats.quranLatencyMs,stats.quranLatencyN)],
 ['متوسط مطابقة الكلمات (الجلسة الحالية)',avg(stats.alignmentMs,stats.alignmentN)],
 ['تجاوز سعة المقاطع',stats.quranQueueOverflow||0],
 ['الانتقال للوضع المحدود',stats.asrFallbacks||0]
 ];
 pane.replaceChildren();
 const dl=document.createElement('dl');dl.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px';
 for(const [name,value] of lines){const dt=document.createElement('dt');dt.textContent=name;const dd=document.createElement('dd');dd.textContent=String(value);dl.append(dt,dd);}
 pane.append(dl);
 const note=document.createElement('p');note.className='durr-feedback-note';note.textContent='هذه إحصاءات ملاحظات حُذفت من الرصد الآلي، وليست نسبة دقة النموذج. أزمنة الأداء تخص الجلسة الحالية فقط. لا يوجد إرسال بيانات أو تسجيلات.';pane.append(note);
}
btn.addEventListener('click',()=>{pane.hidden=!pane.hidden;if(!pane.hidden)render()});
})();
