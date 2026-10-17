/* Transcript alignment, not an acoustic/Tajweed model. No DOM or network work. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data/recitation-aliases.json').aliases:{});if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrRecitation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(initialAliases){
 'use strict';
 const baseNormalize=s=>String(s||'').normalize('NFC').replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200c\u200d]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[^\u0621-\u064a\s]/g,' ').replace(/\s+/g,' ').trim();
 let aliases={...initialAliases};
 const normalize=s=>baseNormalize(s).split(' ').map(w=>aliases[w]||w).join(' ');
 function configureAliases(map){aliases={};for(const [from,to] of Object.entries(map||{}))if(/^[\u0621-\u064a]+$/.test(from)&&/^[\u0621-\u064a]+$/.test(to))aliases[from]=to;}
 const tokens=s=>normalize(s).split(' ').filter(Boolean);
 function similarity(a,b){if(a===b)return 1;if(!a||!b)return 0;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return 1-row[b.length]/Math.max(a.length,b.length);}
 function align(words,heard,{cursor=0,located=false,recall=null}={}){
   const source=tokens(heard).slice(-90);if(!source.length||!words.length)return null;
   const recallStart=recall?words.findIndex(w=>w.vk===recall):0;if(recall&&recallStart<0)return null;
   const lo=Math.max(recallStart,located?Math.max(0,cursor-16):0),hi=recall?words.findLastIndex(w=>w.vk===recall)+1:words.length;
   const expected=words.slice(lo,hi),m=source.length,n=expected.length;if(!n)return null;
   const dp=Array.from({length:m+1},()=>new Float32Array(n+1)),bt=Array.from({length:m+1},()=>new Uint8Array(n+1)),sc=Array.from({length:m},()=>new Float32Array(n)),similarities=new Map();
   for(let i=1;i<=m;i++){dp[i][0]=i*.92;bt[i][0]=2;}
   for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
     const target=expected[j-1].norm||normalize(expected[j-1].expected),key=source[i-1]+'|'+target;let sim=similarities.get(key);if(sim==null){sim=similarity(source[i-1],target);similarities.set(key,sim);}sc[i-1][j-1]=sim;
     const diag=dp[i-1][j-1]+(sim>=.999?0:sim>=.88?.22:1),ins=dp[i-1][j]+.92,omit=dp[i][j-1]+.92;
     let best=Math.min(diag,ins,omit),op=best===diag?1:best===ins?2:3;
     if(i>=2&&source[i-2]+source[i-1]===target&&dp[i-2][j-1]+.03<best){best=dp[i-2][j-1]+.03;op=4;}
     const previous=j>=2?(expected[j-2].norm||normalize(expected[j-2].expected)):'';
     if(j>=2&&source[i-1]===previous+target&&dp[i-1][j-2]+.03<best){best=dp[i-1][j-2]+.03;op=5;}
     dp[i][j]=best;bt[i][j]=op;
   }
   // Backtrace bounded candidates; free prefix means a mid-page start is not an omission.
   const ends=Array.from({length:n},(_,i)=>i+1).sort((a,b)=>dp[m][a]-dp[m][b]).slice(0,18),candidates=[];let best=null;
   for(const end of ends){let i=m,j=end,ops=[];while(i>0){const op=bt[i][j];if(op===4){ops.push({type:'match',index:lo+j-1,word:expected[j-1],heard:source[i-2]+source[i-1],similarity:1});i-=2;j--;}
     else if(op===5){for(let k=1;k>=0;k--)ops.push({type:'match',index:lo+j-2+k,word:expected[j-2+k],heard:source[i-1],similarity:1});i--;j-=2;}
     else if(op===1){const similarity=sc[i-1][j-1];ops.push({type:similarity>=.999?'match':'sub',index:lo+j-1,word:expected[j-1],heard:source[i-1],similarity});i--;j--;}else if(op===2||!j){ops.push({type:'extra',index:lo+j,heard:source[i-1],similarity:0});i--;}else{ops.push({type:'omit',index:lo+j-1,word:expected[j-1],heard:'',similarity:0});j--;}}
     ops.reverse();const start=lo+j,strong=ops.filter(o=>o.type==='match'&&o.similarity>=.99).length,score=1-dp[m][end]/Math.max(m,end-j),distance=located?Math.abs(start-cursor):0,rank=score-Math.min(.28,distance*.006);
     const candidate={ops,start,end:lo+end,strong,score,rank};candidates.push(candidate);if(!best||rank>best.rank+.0001)best=candidate;
   }
   if(!best||best.score<.48)return null;
   if(!located&&candidates.some(c=>Math.abs(c.start-best.start)>2&&c.strong>=best.strong&&c.score>=best.score-.005))return null;
   if(best.strong<2){const exact=best.ops.find(o=>o.type==='match'&&o.similarity>=.99),unique=exact&&source.length===1&&source[0].length>=5&&words.filter(w=>(w.norm||normalize(w.expected))===source[0]).length===1,nearCursor=best.start<=cursor||(m>=2&&best.start===cursor+1);if(!unique&&!(located&&nearCursor&&best.end>=cursor&&best.strong>=1))return null;}
   return best;
 }
 class Tracker{
   constructor(words,{cursor=0,located=false,recall=null}={}){this.words=words.map((w,index)=>({...w,index,norm:normalize(w.expected)}));this.cursor=cursor;this.located=located;this.recall=recall;this.startedAt=null;this.pending='';this.covered=new Set();this.errors=new Map();this.dismissed=new Set();this.events=[];this.lastResult=null;}
   preview(text){return align(this.words,(this.pending+' '+text).trim(),this)||(this.pending?align(this.words,text,this):null);}
   feed(text,{source='browser-speech',final=true}={}){
     if(!final)return this.preview(text);
     const heard=(this.pending+' '+text).trim();let result=align(this.words,heard,this),recovered=false;
     if(!result&&this.pending){const fresh=align(this.words,text,this);if(fresh?.strong>=2){result=fresh;recovered=true;}}
     if(!result){this.pending=tokens(heard).slice(-35).join(' ');return null;}this.pending='';
     const initial=!this.located,oldCursor=this.cursor;this.located=true;if(initial)this.startedAt=result.start;
     const updates=[];
     // A jump is revealed for orientation, never counted as recited or turned into a long run of errors.
     const omittedPrefix=!initial&&!recovered&&result.start>oldCursor&&result.start-oldCursor<=6?Array.from({length:result.start-oldCursor},(_,i)=>({type:'omit',index:oldCursor+i,word:this.words[oldCursor+i],heard:'',similarity:0})):[];
     const body=result.ops.slice();if(omittedPrefix.length===1&&body[0]?.type==='extra'){omittedPrefix[0]={...omittedPrefix[0],type:'sub',heard:body.shift().heard};}
     const ops=[...omittedPrefix,...body];
     ops.forEach((op,i)=>{
       if(op.type==='match'){
         const key=op.word.vk+'#'+op.word.wi;this.covered.add(key);const prior=this.errors.get(key);
         if(prior&&prior.active){prior.active=false;prior.correctedAt=Date.now();updates.push({...prior,corrected:true});}return;
       }
       if(op.type==='extra'){
         // Repeating a recently recited word is a repair/repetition, not automatically an error.
         if(this.words.slice(Math.max(0,op.index-5),op.index+1).some(w=>w.norm===op.heard))return;
       }
       const before=ops.slice(0,i).some(o=>o.type==='match'&&o.similarity>=.99)||(!initial&&result.start<=oldCursor+6),after=ops.slice(i+1).filter(o=>o.type==='match'&&o.similarity>=.99).length;
       // At least a right anchor is required. Silence and unanchored transcript tails are not errors.
       const previousWord=this.words[Math.max(0,op.index-1)],previousAnchor=!initial&&previousWord&&this.covered.has(previousWord.vk+'#'+previousWord.wi);
       if(!before||after<1||(result.strong<2&&!previousAnchor))return;
       const word=op.word||this.words[Math.max(0,Math.min(this.words.length-1,op.index-1))];if(!word)return;
       const key=word.vk+'#'+word.wi;if(this.dismissed.has(key))return;const previous=this.errors.get(key),event={vk:word.vk,wi:word.wi,index:word.index,type:op.type==='omit'?'omission':op.type==='sub'?'substitution':'extra',expected:word.expected,heard:op.heard||'',source,active:true,automatic:true,confidence:Math.min(.97,Math.max(.5,result.score)),confidenceKind:'alignment-not-acoustic',ts:Date.now()};
       if(!previous||!previous.active||previous.type!==event.type||previous.heard!==event.heard){this.errors.set(key,event);this.events.push(event);updates.push(event);}
     });
     this.cursor=result.end;this.lastResult={...result,ops,initial,oldCursor,updates};return this.lastResult;
   }
   dismiss(key){this.dismissed.add(key);const event=this.errors.get(key);if(event)event.active=false;}
   export(){return {cursor:this.cursor,located:this.located,startedAt:this.startedAt,covered:[...this.covered],errors:[...this.errors.values()],events:this.events.slice()};}
 }
 return {normalize,baseNormalize,configureAliases,tokens,similarity,align,Tracker};
});
