/* v109: cautious syncing of reader-only local data. No destructive auto merge. */
(function(root){
'use strict';
const KEYS={bookmarks:'durr-verse-bookmarks-v86',highlights:'durr-hl',notes:'durr-verse-notes-v87',preferences:'durr-display-preferences-v85'};
let user=null,db=null,ready=false,busy=false,blocked=false,remotePayload=null,timer=null,serial=0;
const status=msg=>{const el=document.getElementById('cloudExtrasStatusV109');if(el)el.textContent=msg;};
const stable=v=>JSON.stringify(v);
function snapshot(){
 const out={};
 for(const [k,key] of Object.entries(KEYS))out[k]=localStorage.getItem(key);
 return out;
}
function anyData(data){return Object.values(data).some(v=>v!==null&&v!==''&&v!=='[]'&&v!=='{}');}
function baselineKey(){return 'durr-reader-cloud-baseline-v109-'+user.uid;}
function ref(){return db.collection('users').doc(user.uid).collection('data').doc('readerExtras');}
function getBaseline(){return localStorage.getItem(baselineKey());}
function saveBaseline(value){localStorage.setItem(baselineKey(),value);}
function parse(payload){try{
 const data=JSON.parse(payload);
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const out={};for(const k of Object.keys(KEYS)){const val=data[k];if(val!==null&&val!==undefined&&typeof val!=='string')return null;out[k]=val??null;}
 return out;
}catch(_){return null;}}
function backupBeforeReplace(local){
 const key='durr-reader-cloud-restore-v109-'+user.uid;
 const previous=JSON.parse(localStorage.getItem(key)||'[]');
 const copies=Array.isArray(previous)?previous:[];
 copies.push({at:Date.now(),data:local});
 localStorage.setItem(key,JSON.stringify(copies.slice(-4)));
}
function applyRemote(remote){
 const old=snapshot();
 backupBeforeReplace(old);
 try{
  for(const [field,key] of Object.entries(KEYS)){
   if(remote[field]===null)localStorage.removeItem(key);
   else localStorage.setItem(key,remote[field]);
  }
 }catch(err){
  for(const [field,key] of Object.entries(KEYS))try{
   if(old[field]===null)localStorage.removeItem(key);else localStorage.setItem(key,old[field]);
  }catch(_){}
  throw err;
 }
 if(root.DurrPreferences?.reload)root.DurrPreferences.reload();
 root.dispatchEvent(new Event('durr-reader-data-restored'));
}
function conflict(){
 blocked=true;status('توجد اختلافات بين بيانات القراءة على الجهاز والسحابة. أُوقفت مزامنتها لحماية النسختين. صدّري نسختك الاحتياطية قبل التسوية.');
 const panel=document.getElementById('cloudExtrasConflictV109');if(panel)panel.hidden=false;
}
function clearConflict(){
 blocked=false;const panel=document.getElementById('cloudExtrasConflictV109');if(panel)panel.hidden=true;
}
async function push(local,baseline){
 if(!user||blocked||busy)return;
 busy=true;const next=stable(local),expected=baseline;
 try{
  const result=await db.runTransaction(async tx=>{
   const snap=await tx.get(ref()),remote=snap.exists?snap.data()?.payload:null;
   if(remote===next)return 'equal';
   if(remote!==expected)return 'conflict';
   tx.set(ref(),{payload:next,updatedAt:Date.now()});
   return 'saved';
  });
  if(result==='conflict'){conflict();return;}
  saveBaseline(next);remotePayload=next;
  status(result==='saved'?'تمت مزامنة الفواصل وألوانها وتفضيلات القراءة.':'بيانات القراءة متطابقة مع السحابة.');
  // Do not drop changes made while the network request was in flight.
  if(stable(snapshot())!==next)setTimeout(()=>sync(),100);
 }catch(e){status('تعذّرت مزامنة بيانات القراءة. بيانات الجهاز محفوظة؛ حاولي عند توفر الاتصال.');console.warn('reader extras sync',e);}
 finally{busy=false;}
}
async function start(uid,firestore){
 serial++;const thisRun=serial;
 user=uid?{uid}:null;db=firestore||null;ready=false;busy=false;remotePayload=null;clearTimeout(timer);clearConflict();
 if(!user||!db)return;
 status('جارٍ التحقق من بيانات القراءة دون استبدالها…');
 try{
  const snap=await ref().get({source:'server'});
  if(thisRun!==serial)return;
  const cloud=snap.exists?snap.data()?.payload:null;
  if(cloud!==null&&typeof cloud!=='string'){conflict();return;}
  const remote=cloud===null?null:parse(cloud);
  if(cloud!==null&&!remote){conflict();return;}
  remotePayload=cloud;
  const local=snapshot(),localPayload=stable(local),base=getBaseline();
  ready=true;
  if(cloud===localPayload){saveBaseline(localPayload);status('بيانات الفواصل والقراءة مطابقة للسحابة.');return;}
  if(cloud===null){
   if(base!==null){conflict();return;} // remote deletion cannot be assumed harmless
   if(anyData(local))await push(local,null);
   else status('لا توجد فواصل أو تفضيلات سحابية محفوظة لهذا الحساب بعد.');
   return;
  }
  if(!anyData(local)||localPayload===base){
   applyRemote(remote);saveBaseline(cloud);
   status('استُعيدت بيانات الفواصل وألوانها وتفضيلات القراءة من السحابة.');
   return;
  }
  if(cloud===base){await push(local,base);return;}
  conflict();
 }catch(e){if(thisRun===serial)status('تعذّر الاتصال بـFirebase لبيانات القراءة؛ لم تُغيّر بيانات الجهاز.');console.warn('reader extras initial read',e);}
}
async function sync(){
 if(!ready||!user||blocked||busy)return;
 const local=snapshot(),next=stable(local),baseline=getBaseline();
 if(next===baseline)return;
 await push(local,baseline);
}
function schedule(){
 if(!ready||!user||blocked)return;
 clearTimeout(timer);timer=setTimeout(sync,550);
}
function download(data,name){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('cloudExtrasLocalV109')?.addEventListener('click',()=>download(snapshot(),'aldurr-reader-local.json'));
 document.getElementById('cloudExtrasRemoteV109')?.addEventListener('click',()=>{const data=remotePayload?parse(remotePayload):null;if(data)download(data,'aldurr-reader-cloud.json');});
});
root.addEventListener('online',schedule);
root.addEventListener('pageshow',schedule);
root.addEventListener('storage',event=>{if(Object.values(KEYS).includes(event.key))schedule();});
root.DurrPreferences?.subscribe?.(schedule);
root.DurrCloudExtras={start,sync,snapshot};
})(window);
