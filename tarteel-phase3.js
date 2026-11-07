/* Phase 03: local Tarteel archive and manually reviewed batches. */
(function(){
'use strict';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('en-US');
let data=null,sourceSessions=null,sourceMistakes=null,filtered=[],selected=new Map(),page=0,previewOwner=null;
const owner=()=>localStorage.getItem('durr-tarteel-owner-v1')||'local-only';
const archiveKey=()=> 'durr-tarteel-history-v1'+(owner()==='local-only'?'':':'+owner());
const ownerUnchanged=()=>{if(owner()!==previewOwner)throw Error('تبدّل الحساب منذ المعاينة. أعيدي تحليل الملفات لحماية بياناتك.');};
const PAGE_SIZE=25;
const notify=(message,error=false)=>{$('status').textContent=message;$('status').className=error?'error':'success';};
async function fileJSON(input){
 const file=input.files?.[0];if(!file)throw Error('اختاري ملفي الجلسات والأخطاء.');
 if(file.size>65*1024*1024)throw Error('حجم الملف يتجاوز الحد المسموح (65 MB).');
 const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed))throw Error('ملف التصدير لا يحتوي قائمة JSON.');
 return parsed;
}
function display(){
 if(!data)return;
 const filter=$('typeFilter').value;
 filtered=data.errors.filter(e=>e.faces.length&&(!filter||e.type===filter));
 page=Math.min(page,Math.max(0,Math.ceil(filtered.length/PAGE_SIZE)-1));
 const view=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),root=$('records');root.replaceChildren();
 for(const e of view){
   const p=e.positions[0],label=document.createElement('label'),check=document.createElement('input'),body=document.createElement('div');
   label.className='record';check.type='checkbox';check.checked=selected.has(e.key);
   check.onchange=()=>{if(check.checked){if(selected.size>=100){check.checked=false;notify('حد الاعتماد في الدفعة 100 خطأ. اعتمدي المحدد ثم اختاري دفعة جديدة.',true);return;}selected.set(e.key,e);}else selected.delete(e.key);syncSelected();};
   body.textContent='سورة '+p.surah+' · آية '+p.ayah+' · وجه '+e.faces[0]+' · '+(DurrTarteelMerge.LABELS[e.type]||e.type)+(e.expected?' · الصواب: '+e.expected:'')+(e.positions.length>1?' · مواضع متعددة':'');
   label.append(check,body);root.append(label);
 }
 $('pageStatus').textContent=(page+1)+' من '+Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))+' · '+fmt(filtered.length)+' سجلًا قابلًا للمراجعة';
 $('prev').disabled=page===0;$('next').disabled=(page+1)*PAGE_SIZE>=filtered.length;
 syncSelected();
}
function syncSelected(){$('selectionCount').textContent='المحدد: '+fmt(selected.size);$('commit').disabled=!selected.size;}
function archiveProjection(){
 const sessions=sourceSessions.map(s=>({id:String(s.session_id||''),start:s.started_at||'',end:s.ended_at||'',type:s.session_type||'',mode:s.recitation_mode||''}));
 const mistakes=sourceMistakes.map(m=>({session_id:String(m.session_id||''),type:m.mistake_type||'',positions:(Array.isArray(m.positions)?m.positions:[]).map(p=>({surah_number:p.surah_number,ayah_number:p.ayah_number,word_number:p.word_number})),expected:typeof m.expected==='string'?m.expected.slice(0,150):'',received:typeof m.received==='string'?m.received.slice(0,150):'',created:m.created||''}));
 return {format:'durr-maknun-tarteel-import',version:1,importedAt:new Date().toISOString(),sessions,mistakes,bookmarks:[],metadata:{source:'tarteel-json',counts:data.summary}};
}
async function accessArchive(operation){
 if(!window.indexedDB)throw Error('التخزين المحلي للأرشيف غير متاح.');
 const db=await new Promise((resolve,reject)=>{
  const req=indexedDB.open('durr-tarteel-history',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('archives'))req.result.createObjectStore('archives');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 try{return await operation(db);}finally{db.close();}
}
async function readArchive(key){
 return accessArchive(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction('archives','readonly'),req=tx.objectStore('archives').get(key);
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
 }));
}
async function restorePreviousArchive(){
 return accessArchive(db=>new Promise((resolve,reject)=>{
  const key=archiveKey(),tx=db.transaction('archives','readwrite'),store=tx.objectStore('archives');
  const prev=store.get(key+'-previous');
  prev.onsuccess=()=>{
   if(!prev.result){tx.abort();return;}
   const current=store.get(key);
   current.onsuccess=()=>{if(current.result)store.put(current.result,key+'-previous');store.put(prev.result,key);};
  };
  tx.oncomplete=()=>resolve(true);
  tx.onabort=()=>reject(Error('لا توجد نسخة سابقة قابلة للاستعادة أو تعذّرت الكتابة.'));
  tx.onerror=()=>reject(tx.error);
 }));
}

async function saveArchive(archive){
 if(!window.indexedDB)throw Error('التخزين المحلي الكبير غير متاح في هذا المتصفح.');
 const db=await new Promise((res,rej)=>{const req=indexedDB.open('durr-tarteel-history',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('archives'))req.result.createObjectStore('archives');};req.onerror=()=>rej(req.error);req.onsuccess=()=>res(req.result);});
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('archives','readwrite'),store=tx.objectStore('archives');
   const key=archiveKey(),req=store.get(key);
   req.onsuccess=()=>{
    if(req.result)store.put(req.result,key+'-previous');
    store.put(archive,key);
   };
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
}
$('run').onclick=async()=>{
 $('run').disabled=true;notify('جارٍ تحليل الملفات على هذا الجهاز…');$('output').hidden=true;data=null;selected.clear();
 try{
  previewOwner=owner();
  [sourceSessions,sourceMistakes]=await Promise.all([fileJSON($('sessions')),fileJSON($('mistakes'))]);
  const res=await fetch('data/mushaf-search.json');if(!res.ok)throw Error('تعذّر تحميل فهرس المصحف.');
  const map=await res.json();
  data=DurrTarteelImport.ingest(sourceSessions,sourceMistakes,{faceForAyah:(s,a)=>map[s+':'+a]?.[0]});
  const n=data.summary;
  $('metrics').replaceChildren();
  for(const [title,value] of [['الجلسات',n.sessions],['الأخطاء الفريدة',n.errors],['المكررات',n.duplicates],['المرفوضة',n.rejected]]){
   const card=document.createElement('div'),strong=document.createElement('strong');card.className='metric';card.textContent=title;strong.textContent=fmt(value);card.append(strong);$('metrics').append(card);
  }
  $('mapping').textContent='أخطاء لم يُعرف وجهها: '+fmt(n.unmapped)+'؛ لا يمكن اعتمادها حتى يُحدَّد موضعها.';
  $('types').replaceChildren();$('typeFilter').replaceChildren(new Option('جميع التصنيفات',''));
  for(const [type,count]of Object.entries(n.byType)){
   const p=document.createElement('p');p.textContent=(DurrTarteelMerge.LABELS[type]||type)+' : '+fmt(count);$('types').append(p);
   $('typeFilter').append(new Option(DurrTarteelMerge.LABELS[type]||type,type));
  }
  $('replaceArchive').checked=false;$('archive').disabled=true;page=0;$('output').hidden=false;display();
  notify('انتهى التحليل. لم تُحفَظ الملفات أو تُعتمد أخطاء بعد.');
 }catch(error){notify('تعذّر التحليل: '+error.message,true);}
 finally{$('run').disabled=false;}
};
$('typeFilter').onchange=()=>{page=0;display();};
$('prev').onclick=()=>{if(page>0){page--;display();}};
$('next').onclick=()=>{page++;display();};
$('replaceArchive').onchange=()=>{$('archive').disabled=!data||!$('replaceArchive').checked;};
$('archive').onclick=async()=>{
 if(!data||!$('replaceArchive').checked)return;
 $('archive').disabled=true;$('archiveStatus').textContent='جارٍ حفظ الأرشيف في الجهاز…';
 try{ownerUnchanged();await saveArchive(archiveProjection());$('archiveStatus').textContent='حُفظ الأرشيف. يُعرض من سجل الأخطاء في التطبيق، دون أي اعتماد آلي.';notify('حُفظ الأرشيف في IndexedDB على الجهاز.');}
 catch(error){$('archiveStatus').textContent='تعذّر حفظ الأرشيف: '+error.message;notify('لم يُحفَظ الأرشيف؛ لا تتخلصي من ملفات التصدير.',true);}
 finally{$('archive').disabled=!$('replaceArchive').checked;}
};
$('archiveExport').onclick=async()=>{
 $('archiveExport').disabled=true;
 try{
  const data=await readArchive(archiveKey());if(!data)throw Error('لا يوجد أرشيف محفوظ للحساب الحالي.');
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob);
  try{const a=document.createElement('a');a.href=url;a.download='aldurr-tarteel-history-backup.json';document.body.append(a);a.click();a.remove();}
  finally{URL.revokeObjectURL(url);}
  notify('تم تجهيز تصدير الأرشيف. احفظي الملف في ملفات الجهاز بعيدًا عن المشاركة العامة.');
 }catch(e){notify('تعذّر تصدير الأرشيف: '+e.message,true);}
 finally{$('archiveExport').disabled=false;}
};
$('archiveRestorePrevious').onclick=async()=>{
 if(!window.confirm('هل تريدين استعادة الأرشيف السابق لهذا الحساب؟ ستُحفظ النسخة الحالية لتتمكني من الرجوع إليها.'))return;
 $('archiveRestorePrevious').disabled=true;
 try{await restorePreviousArchive();notify('استُعيد الأرشيف السابق لهذا الحساب. افتحي السجل التاريخي في التطبيق للاطلاع عليه.');}
 catch(e){notify('تعذّرت الاستعادة: '+e.message,true);}
 finally{$('archiveRestorePrevious').disabled=false;}
};
$('commit').onclick=()=>{
 try{
  ownerUnchanged();
  if(!data||!selected.size||selected.size>100)throw Error('اختاري من 1 إلى 100 خطأ.');
  const rows=[...selected.values()],batch={schema:'durr-tarteel-confirm-v1',confirmed:true,owner:previewOwner,baseUpdatedAt:0,errors:rows};
  const existing=JSON.parse(localStorage.getItem('durr-alfareed-v2')||'{}');
  batch.baseUpdatedAt=+existing.updatedAt||0;
  const result=DurrTarteelMerge.plan(existing.errors?existing:{errors:[]},batch);
  if(!result.added.length)throw Error('الأخطاء المحددة مستوردة من قبل.');
  if(localStorage.getItem(DurrTarteelMerge.QUEUE_KEY))throw Error('هناك دفعة سابقة بانتظار مراجعتها في التطبيق.');
  localStorage.setItem(DurrTarteelMerge.QUEUE_KEY,JSON.stringify(batch));
  window.location.assign('index.html?tab=errors');
 }catch(error){notify('تعذّر تجهيز الاعتماد: '+error.message,true);}
};
})();
