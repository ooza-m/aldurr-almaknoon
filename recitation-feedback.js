/* Local feedback on dismissed automated Quran recognition; no audio or transcripts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrRecFeedback=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KEY='durr-recitation-feedback-v1',MAX=300;
function record(storage,entry){
 if(!entry||entry.automatic!==true||!entry.session||!entry.vk||!Number.isInteger(entry.wi))return false;
 let data=[];try{const parsed=JSON.parse(storage.getItem(KEY)||'[]');if(Array.isArray(parsed))data=parsed;}catch(_){}
 const id=String(entry.session)+'|'+String(entry.vk)+'#'+entry.wi;
 if(data.some(x=>x.id===id))return false;
 // Dismissal is not proof of a model error; this is only a review signal.
 data.push({id,vk:String(entry.vk),wi:entry.wi,type:String(entry.type||'unknown'),label:'dismissed_unverified',time:Date.now()});
 storage.setItem(KEY,JSON.stringify(data.slice(-MAX)));return true;
}
function list(storage){
 try{const value=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(x=>x&&typeof x.id==='string').slice(-MAX):[];}catch(_){return [];}
}
function classify(storage,id,label){
 if(!['correct_reading','actual_error','unsure'].includes(label))return false;
 const data=list(storage),item=data.find(x=>x.id===id);
 if(!item)return false;
 item.label=label;item.reviewedAt=Date.now();
 storage.setItem(KEY,JSON.stringify(data));return true;
}
return {record,list,classify,KEY};
});
