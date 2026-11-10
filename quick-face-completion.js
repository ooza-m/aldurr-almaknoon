/* Quick completion: optional manual evidence, never a fabricated ASR result. */
(function(){
'use strict';
const KEY='durr-alfareed-v2';
const css=document.createElement('style');
css.textContent=`
.dq-toolbar{order:-3;display:flex;flex:0 0 auto;align-items:center;justify-content:flex-end;min-height:36px;padding:2px 12px 1px;direction:rtl}
.dq-trigger{position:static;display:inline-flex;align-items:center;justify-content:center;width:auto;height:34px;min-width:65px;z-index:auto;border:1px solid var(--line,rgba(94,58,77,.15));border-radius:12px;background:var(--surface,#fffdfa);color:var(--ink-2,#5E3A4D);padding:5px 12px;font:600 12px "IBM Plex Sans Arabic",sans-serif;box-shadow:none;cursor:pointer;line-height:1.3}
.reader-action.dq-saved{background:var(--wash)!important;color:var(--accent)!important}\n.dq-trigger:focus-visible{outline:2px solid var(--accent,#A8546B);outline-offset:2px}
.dq-overlay{position:fixed;inset:0;background:#160c1585;z-index:10000;display:none;align-items:flex-end;justify-content:center}
.dq-overlay.open{display:flex}
.dq-sheet{width:min(100%,460px);background:var(--page,#FBF6F1);color:var(--ink,#3D2632);border-radius:24px 24px 0 0;padding:20px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -12px 30px #0002;max-height:85dvh;overflow:auto;font:14px "IBM Plex Sans Arabic",sans-serif}
.dq-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.dq-head strong{font-size:18px}.dq-close{font-size:22px;padding:6px}
.dq-field{margin:12px 0}.dq-field label{font-weight:650;display:block;margin-bottom:6px}
.dq-options{display:flex;flex-wrap:wrap;gap:7px}.dq-field{min-width:0}.dq-overlay{padding:0}.dq-sheet{overscroll-behavior:contain;max-height:min(88dvh,calc(100dvh - env(safe-area-inset-top) - 12px))}.dq-options label{min-height:48px;display:flex;align-items:center;justify-content:center;gap:5px;white-space:normal;line-height:1.5}.dq-options label{flex:1;min-width:90px;border:1px solid var(--line,#dbc5c9);border-radius:12px;background:var(--surface,#fff);color:var(--ink,#3D2632);padding:10px 7px;text-align:center;cursor:pointer;font-weight:500}
.dq-options label:has(input:checked){border-color:var(--ink,#5E3A4D);background:var(--wash,#F3E8EC)}
.dq-options input{accent-color:var(--ink,#5E3A4D)}
.dq-save{width:100%;padding:13px;background:var(--accent-2,#874257);color:var(--on-accent,#fff);border-radius:12px;font-size:15px;font-weight:700}
.dq-hint{font-size:12px;color:var(--muted,#9A8189);margin:6px 0 14px}
.dq-range[hidden]{display:none!important}.dq-range{display:flex;gap:8px;align-items:center}.dq-range input{width:90px;min-width:0;border:1px solid var(--line,#dbc5c9);border-radius:10px;padding:9px;font:inherit;background:var(--surface,#fff);color:var(--ink);text-align:center;direction:ltr}
.dq-small{font-size:12px;color:var(--muted,#9A8189)}
body.reciting .dq-toolbar{display:none}
.dq-overlay{box-sizing:border-box;overflow:hidden}
.dq-sheet{box-sizing:border-box;max-height:calc(100dvh - max(70px,env(safe-area-inset-top)) - 8px);overflow-y:auto;-webkit-overflow-scrolling:touch}
html[data-theme="dark"] .dq-sheet{background:var(--page)!important;color:var(--ink)!important}
html[data-theme="dark"] .dq-options label{background:var(--surface)!important;color:var(--ink)!important;border-color:var(--line)!important}
html[data-theme="dark"] .dq-options label:has(input:checked){background:var(--wash)!important;border-color:var(--accent)!important}
html[data-theme="dark"] .dq-save{background:var(--accent-2)!important;color:#fff!important}
@media(min-width:700px){.dq-overlay{align-items:center}.dq-sheet{border-radius:22px}}

`;document.head.appendChild(css);
const trigger=document.getElementById('readerSimi');
if(!trigger)return; // The center achievement action already exists in the reader toolbar.
document.getElementById('quickFaceCompletionBtn')?.remove();
const overlay=document.createElement('div');overlay.className='dq-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','تسجيل الإنجاز');
overlay.innerHTML=`<div class="dq-sheet"><div class="dq-head"><strong id="dqTitle">تسجيل الإنجاز</strong><button type="button" class="dq-close" aria-label="إغلاق">×</button></div>
<form id="dqForm"><div class="dq-field"><label>نوع الإنجاز</label><div class="dq-options">
<label><input type="radio" name="kind" value="memorize"> حفظ</label><label><input type="radio" name="kind" value="near" checked> مراجعة قريبة</label><label><input type="radio" name="kind" value="far"> مراجعة بعيدة</label><label><input type="radio" name="kind" value="read"> تلاوة</label>
</div></div>
<div class="dq-field"><label>المقدار</label><div class="dq-options">
<label><input type="radio" name="scope" value="one" checked> هذا الوجه</label><label><input type="radio" name="scope" value="range"> عدة أوجه</label></div>
<div id="dqRange" hidden class="dq-range" style="margin-top:8px"><span>من</span><input id="dqFrom" type="number" min="1" max="604" inputmode="numeric"><span>إلى</span><input id="dqTo" type="number" min="1" max="604" inputmode="numeric"></div></div>
<div class="dq-field"><label>تقييم الأداء</label><div class="dq-options">
<label><input type="radio" name="quality" value="excellent" checked> متقن</label><label><input type="radio" name="quality" value="good"> جيد</label><label><input type="radio" name="quality" value="retry"> يحتاج إعادة</label>
</div></div>
<p class="dq-hint">تسجيل وجه كامل أو نطاق أوجه. التسجيل الجزئي بالآيات سيضاف بعد التحقق من ربط الآيات. التسجيل اليدوي لا يُعد نتيجة تسميع آلي ولا ينشئ أخطاء غير موثقة.</p>
<button class="dq-save" type="submit">حفظ إنجاز الوجه</button></form></div>`;
document.body.appendChild(overlay);
const close=()=>overlay.classList.remove('open');
const rangeEl=overlay.querySelector('#dqRange');
overlay.querySelectorAll('input[name="scope"]').forEach(x=>x.addEventListener('change',()=>{rangeEl.hidden=overlay.querySelector('input[name="scope"]:checked').value!=='range'}));
trigger.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();overlay.querySelector('#dqTitle').textContent='إنجاز الوجه '+cur;overlay.querySelector('#dqFrom').value=cur;overlay.querySelector('#dqTo').value=cur;rangeEl.hidden=overlay.querySelector('input[name="scope"]:checked').value!=='range';overlay.classList.add('open')},true);
overlay.querySelector('.dq-close').addEventListener('click',close);
overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
overlay.querySelector('#dqForm').addEventListener('submit',function(e){
 e.preventDefault();
 const p=Number(cur);
 const value=n=>this.querySelector('input[name="'+n+'"]:checked').value;
 const range=value('scope')==='range';
 const from=range?Number(this.querySelector('#dqFrom').value):p;
 const to=range?Number(this.querySelector('#dqTo').value):p;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>604||to<from||to-from>39){alert('اختاري نطاقًا صحيحًا لا يزيد على 40 وجهًا.');return}
 const pageEntries=Array.from({length:to-from+1},(_,i)=>({page:from+i,data:DATA&&DATA.pages&&DATA.pages[String(from+i)]}));
 if(pageEntries.some(x=>!x.data)){alert('تعذر العثور على بيانات بعض الأوجه.');return}
 const kind=value('kind'),quality=value('quality'),source='manual';
 const date=new Date(), day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 try{
  const state=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(!state||typeof state!=='object'||Array.isArray(state))throw Error('قاعدة البيانات غير صالحة');
  state.logs=Array.isArray(state.logs)?state.logs:[];
  state.quickCompletions=Array.isArray(state.quickCompletions)?state.quickCompletions:[];
  const event={id:'manual_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),date:day,page:p,from,to,kind,quality,source,manual:true,createdAt:Date.now()};
  state.quickCompletions.push(event);
  // A retry-needed attempt stays in the audit trail, but does not fulfil the daily task.
  let log=state.logs.find(x=>x.date===day);
  if(!log){log={date:day,new:'',memList:[],rev:'',near:'',far:'',revList:[],tilawa:false,tilawaTxt:'',tafsir:false,tafsirTxt:'',halaqa:false,mreview:false};state.logs.push(log)}
  const targets=pageEntries.flatMap(({page,data})=>(data.s||[]).map(x=>({page,sid:Number(x.id)}))).filter(x=>Number.isInteger(x.sid));
  if(quality!=='retry'&&(kind==='memorize'||kind==='near'||kind==='far')){
   const listKey=kind==='memorize'?'memList':'revList';
   if(!Array.isArray(log[listKey]))log[listKey]=[];
   for(const {page,sid} of targets){
    if(!log[listKey].some(x=>Number(x.surahId)===sid&&(listKey!=='revList'||(x.type==='far'?'far':'near')===kind)&&((Number(x.from)<=page&&Number(x.to)>=page)||(x.from==null&&x.to==null)))){
     const item={surahId:sid,from:page,to:page,source:'manual'};
     if(listKey==='revList')item.type=kind;
     log[listKey].push(item);
    }
   }
  }
  // Reading intentionally remains separate from memorisation/review accounting.
  if(kind==='read'&&quality!=='retry')log.tilawa=true;
  state.updatedAt=Date.now();
  localStorage.setItem(KEY,JSON.stringify(state));
  localStorage.setItem('durr-quick-pending-sync',event.id);
  close();
  const originalLabel=trigger.getAttribute('aria-label');
  trigger.setAttribute('aria-label','سُجّل إنجاز الوجه');
  trigger.classList.add('dq-saved');
  setTimeout(()=>{trigger.classList.remove('dq-saved');trigger.setAttribute('aria-label',originalLabel||'تسجيل الإنجاز')},2200);
 }catch(err){alert('تعذّر تسجيل الإنجاز: '+err.message)}
});
})();
