/* Opt-in local review of dismissed automatic findings. No upload, audio, or transcript. */
(function(){
'use strict';
const API=window.DurrRecFeedback,host=document.querySelector('#qasrStatusNote');
if(!API||!host)return;
const style=document.createElement('style');
style.textContent='.durr-feedback-btn{display:block;margin:10px 0;padding:10px 14px;border:1px solid #cdbcb8;background:transparent;border-radius:13px;font:inherit;color:inherit}.durr-feedback-panel{border:1px solid #d9c9c4;border-radius:14px;padding:12px;margin:8px 0;font:inherit;line-height:1.8}.durr-feedback-panel[hidden]{display:none!important}.durr-feedback-item{border-bottom:1px solid #e4d9d4;padding:10px 0}.durr-feedback-item:last-child{border:0}.durr-feedback-item button{font:inherit;font-size:12px;margin:3px;padding:6px;border:1px solid #cbb8b8;border-radius:9px;background:transparent;color:inherit}.durr-feedback-item button[aria-pressed=true]{border-color:#647f72;background:#e9f1ea}.durr-feedback-note{font-size:12px;opacity:.8}';
document.head.appendChild(style);
const btn=document.createElement('button');btn.type='button';btn.className='durr-feedback-btn';btn.textContent='مراجعة ملاحظات التسميع';btn.setAttribute('aria-expanded','false');
const panel=document.createElement('section');panel.className='durr-feedback-panel';panel.hidden=true;panel.setAttribute('aria-label','مراجعة الأخطاء الآلية');
host.insertAdjacentElement('afterend',btn);btn.insertAdjacentElement('afterend',panel);
const labels=[['correct_reading','قراءتي صحيحة'],['actual_error','أخطأت فعلًا'],['unsure','غير متأكدة']];
function render(){
 panel.replaceChildren();
 const note=document.createElement('p');note.className='durr-feedback-note';note.textContent='ملاحظات حذف الرصد الآلي فقط؛ أحكامكِ تُحفظ على هذا الجهاز ولا تُرسل للتدريب.';panel.append(note);
 const entries=API.list(localStorage).slice().reverse();
 if(!entries.length){const empty=document.createElement('p');empty.textContent='لا توجد ملاحظات للمراجعة حتى الآن.';panel.append(empty);return;}
 for(const item of entries){
  const el=document.createElement('div');el.className='durr-feedback-item';
  const heading=document.createElement('div');heading.textContent='الآية '+item.vk+' · الكلمة '+(item.wi+1)+' · '+item.type;el.append(heading);
  for(const [label,title] of labels){
   const choice=document.createElement('button');choice.type='button';choice.textContent=title;choice.setAttribute('aria-pressed',String(item.label===label));
   choice.addEventListener('click',()=>{if(API.classify(localStorage,item.id,label))render();});el.append(choice);
  }
  panel.append(el);
 }
}
btn.addEventListener('click',()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)render();});
})();
