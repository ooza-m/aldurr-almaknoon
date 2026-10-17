/* Conservative Quran phoneme alignment: uses verified phoneme tokens only.
   Never assigns an automatic recitation error or completion credit. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrPhonemeAligner=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
function align(heard,words){
 const spoken=Array.isArray(heard)?heard.map(String):(typeof heard==='string'?heard.trim().split(/\s+/).filter(Boolean):[]);
 const refs=[];(words||[]).forEach((w,k)=>{if(!Array.isArray(w.phonemes)||!w.phonemes.length)throw new TypeError('Verified word phonemes required');w.phonemes.forEach(t=>refs.push({token:String(t),word:k}));});
 const n=spoken.length,m=refs.length;if(n>4096||m>4096)throw new RangeError('Alignment too large');
 // Keep only stable full-word matches: partial output can change on the next chunk.
 if(!m)return {matchedWords:[],candidateWords:[],errors:[],completed:false,status:'no_reference'};
 const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=0;i<=n;i++)dp[i][0]=i;
 for(let j=0;j<=m;j++)dp[0][j]=j;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(spoken[i-1]===refs[j-1].token?0:1));
 let end=0,best=Infinity;for(let j=0;j<=m;j++)if(dp[n][j]<best||(dp[n][j]===best&&j>end)){best=dp[n][j];end=j;}
 const matched=Array.from({length:words.length},()=>new Set()),suspect=new Set();let i=n,j=end;
 while(i||j){
  if(i&&j&&spoken[i-1]===refs[j-1].token&&dp[i][j]===dp[i-1][j-1]){matched[refs[j-1].word].add(j-1);i--;j--;continue;}
  if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){suspect.add(refs[j-1].word);i--;j--;continue;}
  if(i&&dp[i][j]===dp[i-1][j]+1){i--;continue;}
  if(j){suspect.add(refs[j-1].word);j--;continue;}break;
 }
 const confirmed=[],candidate=[];let offset=0;
 words.forEach((w,k)=>{const next=offset+w.phonemes.length;if(next<=end&&!suspect.has(k)&&matched[k].size===w.phonemes.length)confirmed.push(k);else if(offset<end&&(suspect.has(k)||matched[k].size))candidate.push(k);offset=next;});
 return {matchedWords:confirmed,candidateWords:candidate,errors:[],completed:false,status:'provisional',referencePrefixTokens:end,editDistance:best};
}
return {align};
});