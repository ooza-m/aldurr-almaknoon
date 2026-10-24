/* Ephemeral speech chunk ledger. Keeps references to sequence metadata only.
   This does NOT replay audio or treat repeated ASR output as fresh evidence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrAudioWindow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
class Ledger{
 constructor(limit=24){this.limit=Math.max(2,Math.min(64,limit));this.chunks=[];this.runId=null;}
 add({runId,seq,page,position,queuedAt,final=false}){
  if(!runId||!Number.isInteger(seq)||seq<0||!Number.isInteger(page)||page<1||page>604)return false;
  if(this.runId!==runId){this.runId=runId;this.chunks=[];}
  if(this.chunks.some(c=>c.seq===seq))return false;
  this.chunks.push({seq,page,position:Number.isInteger(position)?position:null,queuedAt:Number.isFinite(queuedAt)?queuedAt:null,final:!!final});
  if(this.chunks.length>this.limit)this.chunks.splice(0,this.chunks.length-this.limit);
  return true;
 }
 context(page,focus,radius=4){
  const matching=this.chunks.filter(c=>c.page===page&&c.position!=null&&Math.abs(c.position-focus)<=radius);
  return {runId:this.runId,chunkSequences:matching.map(c=>c.seq),requiresNewAudio:true,confirmed:false};
 }
 clear(){this.chunks=[];this.runId=null;}
}
return {Ledger};
});
