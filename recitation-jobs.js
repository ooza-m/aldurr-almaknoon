/* Detached finalisation: no modal and no global recording lock. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrRecitationJobs=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const KEY='durr-recitation-jobs-v86';
 class Jobs{
   constructor({storage,onChange=()=>{},timeout=10000}={}){this.storage=storage;this.onChange=onChange;this.timeout=timeout;this.entries=new Map();try{for(const item of JSON.parse(storage?.getItem(KEY)||'[]')){if(!item?.id||!item.payload)continue;if(item.status==='processing'){item.status='interrupted';item.payload.analysisIncomplete=true;item.payload.analysisStatus='interrupted';item.payload.pages?.forEach(p=>p.complete=false);if(item.payload.summary)item.payload.summary.completedPages=0;}this.entries.set(item.id,item);}}catch(_){}this.save();}
   save(){try{this.storage?.setItem(KEY,JSON.stringify([...this.entries.values()].slice(-15)));}catch(_){}this.onChange([...this.entries.values()]);}
   async run({id,initial,work,finish,onTimeout=()=>{}}){const entry={id,status:'processing',createdAt:Date.now(),payload:initial};this.entries.set(id,entry);this.save();let timer;
     try{await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(Error('Analysis timed out'));},this.timeout);})]);entry.status='complete';}
     catch(error){entry.status='incomplete';entry.error=String(error?.message||error);}
     finally{clearTimeout(timer);try{entry.payload=await finish(entry.status);if(entry.payload.analysisIncomplete&&entry.status==='complete')entry.status='incomplete';entry.payload.analysisStatus=entry.status;}catch(error){entry.status='incomplete';entry.payload.analysisIncomplete=true;entry.error=String(error?.message||error);}this.save();}return entry.payload;
   }
   get(id){return this.entries.get(id);}
   latest(){return [...this.entries.values()].at(-1);}
 }
 return {Jobs,KEY};
});
