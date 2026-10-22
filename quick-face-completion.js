/* Quick completion: optional manual evidence, never a fabricated ASR result. */
(function(){
'use strict';
const KEY='durr-alfareed-v2';
const css=document.createElement('style');
css.textContent=`
.dq-trigger{position:fixed;left:14px;bottom:calc(104px + env(safe-area-inset-bottom));z-index:190;background:var(--ink,#5E3A4D);color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:100px;padding:9px 15px;font:600 13px "IBM Plex Sans Arabic",sans-serif;box-shadow:0 6px 25px #0002}
.dq-overlay{position:fixed;inset:0;background:#160c1585;z-index:10000;display:none;align-items:flex-end;justify-content:center}
.dq-overlay.open{display:flex}
.dq-sheet{width:min(100%,460px);background:var(--parch,#F4E1D2);color:var(--text,#3E2A35);border-radius:24px 24px 0 0;padding:20px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -12px 30px #0002;max-height:88vh;overflow:auto;font:14px "IBM Plex Sans Arabic",sans-serif}
.dq-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.dq-head strong{font-size:18px}.dq-close{font-size:22px;padding:6px}
.dq-field{margin:12px 0}.dq-field label{font-weight:650;display:block;margin-bottom:6px}
.dq-options{display:flex;flex-wrap:wrap;gap:7px}.dq-options label{flex:1;min-width:90px;border:1px solid var(--line,#dbc5c9);border-radius:12px;background:#fff;padding:10px 7px;text-align:center;cursor:pointer;font-weight:500}
.dq-options label:has(input:checked){border-color:var(--ink,#5E3A4D);background:var(--green-soft,#DDE6D4)}
.dq-options input{accent-color:var(--ink,#5E3A4D)}
.dq-save{width:100%;padding:13px;background:var(--ink,#5E3A4D);color:#fff;border-radius:12px;font-size:15px;font-weight:700}
.dq-hint{font-size:12px;color:var(--muted,#9A8189);margin:6px 0 14px}
`;document.head.appendChild(css);
const trigger=document.createElement('button');trigger.className='dq-trigger';trigger.type='button';trigger.textContent='✓ تسجيل الإنجاز';trigger.setAttribute('aria-label','تسجيل إنجاز هذا الوجه يدويًا');
const overlay=document.createElement('div');overlay.className='dq-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','تسجيل الإنجاز');
overlay.innerHTML=`<div class="dq-sheet"><div class="dq-head"><strong id="dqTitle">تسجيل الإنجاز</strong><button type="button" class="dq-close" aria-label="إغلاق">×</button></div>
<form id="dqForm"><div class="dq-field"><label>نوع الإنجاز</label><div class="dq-options">
<label><input type="radio" name="kind" value="review" checked> مراجعة</label><label><input type="radio" name="kind" value="memorize"> حفظ</label><label><input type="radio" name="kind" value="recite"> تسميع</label><label><input type="radio" name="kind" value="read"> قراءة</label>
</div></div>
<div class="dq-field"><label>تقييم الأداء</label><div class="dq-options">
<label><input type="radio" name="quality" value="excellent" checked> متقن</label><label><input type="radio" name="quality" value="good"> جيد</label><label><input type="radio" name="quality" value="retry"> يحتاج إعادة</label>
</div></div>
<div class="dq-field"><label>كيف أُنجز؟</label><div class="dq-options">
<label><input type="radio" name="source" value="self" checked> بنفسي</label><label><input type="radio" name="source" value="teacher"> مع معلّمة</label><label><input type="radio" name="source" value="other"> تطبيق آخر</label>
</div></div>
<p class="dq-hint">يُسجّل الوجه كاملًا فقط في هذه النسخة. التسجيل اليدوي لا يُعد نتيجة تسميع آلي ولا ينشئ أخطاء غير موثقة.</p>
<button class="dq-save" type="submit">حفظ إنجاز الوجه</button></form></div>`;
document.body.append(trigger,overlay);
const close=()=>overlay.classList.remove('open');
trigger.addEventListener('click',()=>{overlay.querySelector('#dqTitle').textContent='إنجاز الوجه '+cur;overlay.classList.add('open')});
overlay.querySelector('.dq-close').addEventListener('click',close);
overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
overlay.querySelector('#dqForm').addEventListener('submit',function(e){
 e.preventDefault();
 const p=Number(cur),pg=DATA&&DATA.pages&&DATA.pages[String(p)];
 if(!Number.isInteger(p)||p<1||p>604||!pg){alert('تعذر تحديد الوجه.');return}
 const value=n=>this.querySelector('input[name="'+n+'"]:checked').value;
 const kind=value('kind'),quality=value('quality'),source=value('source');
 const date=new Date(), day=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 try{
  const state=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(!state||typeof state!=='object'||Array.isArray(state))throw Error('قاعدة البيانات غير صالحة');
  state.logs=Array.isArray(state.logs)?state.logs:[];
  state.quickCompletions=Array.isArray(state.quickCompletions)?state.quickCompletions:[];
  const event={id:'manual_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),date,page:p,kind,quality,source,manual:true,createdAt:Date.now()};
  state.quickCompletions.push(event);
  let log=state.logs.find(x=>x.date===day);
  if(!log){log={date:day,new:'',memList:[],rev:'',near:'',far:'',revList:[],tilawa:false,tilawaTxt:'',tafsir:false,tafsirTxt:'',halaqa:false,mreview:false};state.logs.push(log)}
  const targets=(pg.s||[]).map(x=>Number(x.id)).filter(Number.isInteger);
  if(kind==='memorize'||kind==='review'||kind==='recite'){
   const listKey=kind==='memorize'?'memList':'revList';
   if(!Array.isArray(log[listKey]))log[listKey]=[];
   for(const sid of targets){
    if(!log[listKey].some(x=>Number(x.surahId)===sid&&Number(x.from)===p&&Number(x.to)===p)){
     const item={surahId:sid,from:p,to:p,source:'manual'};
     if(listKey==='revList')item.type='near';
     log[listKey].push(item);
    }
   }
  }
  // Reading intentionally remains separate from memorisation/review accounting.
  if(kind==='read')log.tilawa=true;
  state.updatedAt=Date.now();
  localStorage.setItem(KEY,JSON.stringify(state));
  close();
  const old=trigger.textContent;trigger.textContent='✓ سُجّل الإنجاز';
  setTimeout(()=>trigger.textContent=old,2200);
 }catch(err){alert('تعذّر تسجيل الإنجاز: '+err.message)}
});
})();
