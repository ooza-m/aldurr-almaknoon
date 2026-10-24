/* Ephemeral speech chunk ledger. Keeps references to sequence metadata only.
   This does NOT replay audio or treat repeated ASR output as fresh evidence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrAudioWindow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
class Ledger{
 constructor(limit=24){this.limit=Math.max(2,Math.min(64,limit));this.chunks=[];this.runId=null;this.elapsedMs=0;this.pcm=[];this.maxPcmSamples=16000*5;}
 add({runId,seq,page,position,queuedAt,durationMs=0,final=false}){
  if(!runId||!Number.isInteger(seq)||seq<0||!Number.isInteger(page)||page<1||page>604)return false;
  if(this.runId!==runId){this.clear();this.runId=runId;}
  if(this.chunks.some(c=>c.seq===seq))return false;
  const duration=Number.isFinite(durationMs)?Math.max(0,Math.min(15000,durationMs)):0;
  const startMs=this.elapsedMs;this.elapsedMs+=duration;
  this.chunks.push({seq,page,position:Number.isInteger(position)?position:null,queuedAt:Number.isFinite(queuedAt)?queuedAt:null,startMs,endMs:this.elapsedMs,final:!!final});
  if(this.chunks.length>this.limit)this.chunks.splice(0,this.chunks.length-this.limit);
  return true;
 }
 context(page,focus,radius=4){
  const matching=this.chunks.filter(c=>c.page===page&&c.position!=null&&Math.abs(c.position-focus)<=radius);
  return {runId:this.runId,chunkSequences:matching.map(c=>c.seq),requiresNewAudio:true,confirmed:false};
 }
 review(tracker,key,page,radius=4){
  const window=tracker?.reviewWindow?.(key,{radius});
  if(!window)return null;
  const context=this.context(page,window.focus,radius);
  return {...window,page,runId:context.runId,chunkSequences:context.chunkSequences,
    // Chunk proximity is coarse metadata, not verified speech-word timing.
    evidence:'metadata_only',requiresNewAudio:true,confirmed:false};
 }
 addPcm(pcm){
  if(!(pcm instanceof Int16Array))return;
  const tail=pcm.subarray(Math.max(0,pcm.length-this.maxPcmSamples));
  this.pcm.push(new Int16Array(tail));
  let total=this.pcm.reduce((n,c)=>n+c.length,0);
  while(total>this.maxPcmSamples&&this.pcm.length){const first=this.pcm[0],overflow=total-this.maxPcmSamples;if(overflow>=first.length){this.pcm.shift();total-=first.length;}else{this.pcm[0]=first.slice(overflow);total-=overflow;}}
 }
 clear(){this.chunks=[];this.runId=null;this.elapsedMs=0;for(const chunk of this.pcm)chunk.fill(0);this.pcm=[];}
 get bufferedMs(){return this.pcm.reduce((n,c)=>n+c.length,0)/16;}
}
return {Ledger};
});
