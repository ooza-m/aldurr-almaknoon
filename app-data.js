/* Validate first, preserve a recovery snapshot, then replace state. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrData=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';const RESTORE_KEY='durr-before-restore-v86';
 const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;}
 function inspect(value,depth=0){if(depth>35)throw Error('بنية ملف النسخة معقدة أو غير صالحة');if(value&&typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('يحوي الملف مفتاحًا غير آمن');inspect(value[key],depth+1);}}
 function validate(input){
   if(!object(input))throw Error('يجب أن تكون النسخة ملف بيانات للتطبيق');inspect(input);
   const wrapped=input.format==='durr-backup',state=wrapped?input.state:input;if(!object(state)||!['pages','logs','stages','errors','recitationSessions','profile'].some(k=>k in state))throw Error('هذا ليس ملف نسخة احتياطية للتطبيق');
   const arrays=['logs','stages','errors','tafsir','tajweed','recitationSessions','activityEvents','aiReviewQueue'];for(const key of arrays)if(key in state){if(!Array.isArray(state[key])||state[key].some(v=>!object(v)))throw Error('بنية «'+key+'» غير صحيحة');}
   const maps=['pages','plan','profile','halaqa','attendance','extraHalaqa','goal','mreviewDays','notif','reviewSched','pageReviewSched','faceLearning','verseReview','tajweedDone'];for(const key of maps)if(key in state&&!object(state[key]))throw Error('بنية «'+key+'» غير صحيحة');
   for(const log of state.logs||[]){if(!date(log.date))throw Error('تاريخ في سجل الحفظ غير صالح');for(const key of ['memList','revList'])if(key in log&&(!Array.isArray(log[key])||log[key].some(v=>!object(v))))throw Error('قائمة حفظ أو مراجعة غير صالحة');}
   for(const stage of state.stages||[]){if(stage.name!=null&&typeof stage.name!=='string'||stage.range!=null&&typeof stage.range!=='string'||stage.note!=null&&typeof stage.note!=='string')throw Error('نص مرحلية غير صالح');if(stage.date&&!date(stage.date))throw Error('تاريخ مرحلية غير صالح');if(stage.status&&!['upcoming','current','done'].includes(stage.status))throw Error('حالة مرحلية غير صالحة');}
   for(const error of state.errors||[]){if(error.date&&!date(error.date))throw Error('تاريخ خطأ غير صالح');if(error.page!=null&&!(+error.page>=1&&+error.page<=604))throw Error('رقم وجه غير صالح');}
   for(const session of state.recitationSessions||[]){if(session.pages!=null&&!Array.isArray(session.pages))throw Error('جلسة تسميع غير صالحة');for(const page of session.pages||[]){if(!object(page)||!(+page.page>=1&&+page.page<=604)||page.verses!=null&&!Array.isArray(page.verses))throw Error('أوجه جلسة التسميع غير صالحة');}}
   if(state.profile?.name!=null&&typeof state.profile.name!=='string')throw Error('الاسم في النسخة غير صالح');
   const bookmarks=wrapped?input.bookmarks:undefined;if(bookmarks!=null&&(!Array.isArray(bookmarks)||bookmarks.some(b=>!object(b)||!/^\d{1,3}:\d{1,3}$/.test(b.vk)||!(b.page>=1&&b.page<=604)||typeof b.name!=='string')))throw Error('فواصل النسخة غير صالحة');
   const preferences=wrapped?input.displayPreferences:undefined;if(preferences!=null&&(!object(preferences)||!['rose','olive','navy','plum'].includes(preferences.palette)||!['ar','en'].includes(preferences.digits)||!['hijri','gregorian'].includes(preferences.calendar)))throw Error('تفضيلات العرض غير صالحة');
   if(preferences?.appearance!=null&&!['light','dark','system'].includes(preferences.appearance))throw Error('إضاءة العرض غير صالحة');
   const notes=wrapped?input.notes:undefined;if(notes!=null&&(!Array.isArray(notes)||notes.length>12472||notes.some(n=>!object(n)||!/^\d{1,3}:\d{1,3}$/.test(n.vk)||+n.vk.split(':')[0]<1||+n.vk.split(':')[0]>114||+n.vk.split(':')[1]<1||+n.vk.split(':')[1]>286||!Number.isInteger(n.page)||n.page<1||n.page>604||!['personal','teacher'].includes(n.kind)||typeof n.text!=='string'||n.text.length>4000||!Number.isFinite(n.updatedAt)||n.updatedAt<0)))throw Error('ملاحظات النسخة غير صالحة');
   return {state:JSON.parse(JSON.stringify(state)),bookmarks,preferences,notes};
 }
 function merge(defaults,data){const out=JSON.parse(JSON.stringify(defaults));for(const [key,value] of Object.entries(data))out[key]=object(value)&&object(out[key])?merge(out[key],value):value;return out;}
 function backup(state,preferences,bookmarks,notes){return {format:'durr-backup',version:87,exportedAt:new Date().toISOString(),state,displayPreferences:preferences,bookmarks,...(notes?{notes}:{})};}
 function checkpoint(storage,bundle){storage.setItem(RESTORE_KEY,JSON.stringify(bundle));}
 return {RESTORE_KEY,validate,merge,backup,checkpoint,date};
});
