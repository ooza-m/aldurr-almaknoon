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
   constructor(words,{cursor=0,located=false,recall=null}={}){this.words=words.map((w,index)=>({...w,index,norm:normalize(w.expected)}));this.cursor=cursor;this.located=located;this.recall=recall;this.startedAt=null;this.pending='';this.covered=new Set();this.errors=new Map();this.pendingErrors=new Map();this.dismissed=new Set();this.events=[];this.lastResult=null;}
   preview(text){return align(this.words,(this.pending+' '+text).trim(),this)||(this.pending?align(this.words,text,this):null);}
   feed(text,{source='browser-speech',final=true}={}){
     if(!final)return this.preview(text);
     const heard=(this.pending+' '+text).trim();let result=align(this.words,heard,this),recovered=false;
     if(!result&&this.pending){const fresh=align(this.words,text,this);if(fresh?.strong>=2){result=fresh;recovered=true;}}
     if(!result){this.pending=tokens(heard).slice(-35).join(' ');return null;}this.pending='';
     const initial=!this.located,oldCursor=this.cursor;this.located=true;if(initial)this.startedAt=result.start;
     const updates=[];
     // A jump is revealed for orientation, never counted as recited or turned into a long run of errors.
     const anchoredJump=result.strong>=3&&this.words[oldCursor-1]&&this.covered.has(this.words[oldCursor-1].vk+'#'+this.words[oldCursor-1].wi);
     const omittedPrefix=!initial&&!recovered&&result.start>oldCursor&&result.start-oldCursor<180&&(result.start-oldCursor<=6||anchoredJump)?Array.from({length:result.start-oldCursor},(_,i)=>({type:'omit',index:oldCursor+i,word:this.words[oldCursor+i],heard:'',similarity:0})):[];
     const body=result.ops.slice();if(omittedPrefix.length===1&&body[0]?.type==='extra'){omittedPrefix[0]={...omittedPrefix[0],type:'sub',heard:body.shift().heard};}
     const ops=[...omittedPrefix,...body];
     ops.forEach((op,i)=>{
       if(op.type==='match'){
         const key=op.word.vk+'#'+op.word.wi;this.covered.add(key);this.pendingErrors.delete(key);const prior=this.errors.get(key);
         if(prior&&prior.active){prior.active=false;prior.correctedAt=Date.now();updates.push({...prior,corrected:true});}return;
       }
       if(op.type==='extra'){
         // Repeating a recently recited word is a repair/repetition, not automatically an error.
         if(this.words.slice(Math.max(0,op.index-5),op.index+1).some(w=>w.norm===op.heard))return;
       }
       const before=ops.slice(0,i).some(o=>o.type==='match'&&o.similarity>=.99)||(!initial&&(result.start<=oldCursor+6||anchoredJump)),after=ops.slice(i+1).filter(o=>o.type==='match'&&o.similarity>=.99).length;
       // At least a right anchor is required. Silence and unanchored transcript tails are not errors.
       const previousWord=this.words[Math.max(0,op.index-1)],previousAnchor=!initial&&previousWord&&this.covered.has(previousWord.vk+'#'+previousWord.wi);
       if(!before||after<1||(result.strong<2&&!previousAnchor))return;
       // Browser speech recognition is optimized for ordinary dictation; it regularly
       // substitutes correct Quran words. Retain positive tracking, but never promote
       // its lexical disagreements to verified recitation mistakes.
       if(source==='browser-speech'||source==='browser-preview')return;
       // Two strong right anchors reduce spurious omissions on continuous chunks.
       if((op.type==='omit'||op.type==='extra')&&after<2)return;
       const word=op.word||this.words[Math.max(0,Math.min(this.words.length-1,op.index-1))];if(!word)return;
       const key=word.vk+'#'+word.wi;if(this.dismissed.has(key))return;const previous=this.errors.get(key),event={vk:word.vk,wi:word.wi,index:word.index,type:op.type==='omit'?'omission':op.type==='sub'?'substitution':'extra',expected:word.expected,heard:op.heard||'',source,active:true,automatic:true,confidence:Math.min(.97,Math.max(.5,result.score)),confidenceKind:'alignment-not-acoustic',ts:Date.now()};
       // An uncalibrated ASR disagreement is a candidate first, not an immediate alarm.
       // Require the same finding across two *distinct* observations.
       const priorCandidate=this.pendingErrors.get(key);
       const signature=event.type+'|'+event.heard;
       if(!priorCandidate||priorCandidate.signature!==signature||Date.now()-priorCandidate.at>5000){
         this.pendingErrors.set(key,{signature,seen:1,at:Date.now()});
         return;
       }
       priorCandidate.seen++;
       if(priorCandidate.seen<2)return;
       this.pendingErrors.delete(key);
       if(!previous||!previous.active||previous.type!==event.type||previous.heard!==event.heard){this.errors.set(key,event);this.events.push(event);updates.push(event);}
     });
     this.cursor=result.end;this.lastResult={...result,ops,initial,oldCursor,updates};return this.lastResult;
   }
   dismiss(key){this.pendingErrors.delete(key);this.dismissed.add(key);const event=this.errors.get(key);if(event)event.active=false;}
   export(){return {cursor:this.cursor,located:this.located,startedAt:this.startedAt,covered:[...this.covered],errors:[...this.errors.values()],events:this.events.slice()};}
 }
 class RevealGate{
  constructor(words,delay=3000){this.words=words;this.delay=delay;this.pending=new Map();this.deadlines=new Map();this.handled=new Set();}
  update(ops,errors,now=Date.now()){
   ops.forEach(op=>{if(op.word)this.pending.set(op.index,op.word);});const active=new Map([...errors].filter(([,e])=>e.active&&e.type==='omission'));
   for(const[key,e]of active)if(!this.handled.has(key)&&!this.deadlines.has(key))this.deadlines.set(key,now+this.delay);
   for(const[key,deadline]of this.deadlines)if(!active.has(key)||deadline<=now){this.deadlines.delete(key);this.handled.add(key);}
   const barrier=Math.min(Infinity,...[...this.deadlines.keys()].map(key=>active.get(key)?.index??Infinity));
   return {barrier,waiting:Number.isFinite(barrier),remaining:this.deadlines.size?Math.max(0,Math.min(...this.deadlines.values())-now):0,visible:[...this.pending].filter(([index])=>index<barrier).map(([,word])=>({word,omitted:active.has(word.vk+'#'+word.wi)}))};
  }
 }
 class Locator{
  constructor(search){
    this.entries=Object.entries(search).map(([vk,[page,text]])=>({vk,page,tokens:tokens(text)}))
      .sort((a,b)=>{const [as,aa]=a.vk.split(':').map(Number),[bs,ba]=b.vk.split(':').map(Number);return as-bs||aa-ba;});
    this.words=[];this.startIndex=new Map();
    for(const verse of this.entries)for(let wi=0;wi<verse.tokens.length;wi++)
      this.words.push({token:verse.tokens[wi],vk:verse.vk,page:verse.page,wi});
    // Index consecutive triples: avoids thousands of expensive DP alignments.
    for(let i=0;i+2<this.words.length;i++){
      const a=this.words[i],b=this.words[i+1],c=this.words[i+2];
      const key=[a.token,b.token,c.token].join('|');
      if(!this.startIndex.has(key))this.startIndex.set(key,[]);
      this.startIndex.get(key).push(i);
    }
  }
  locate(text){
    const spoken=tokens(text).slice(-48);
    // The opening invocation is not evidence for a Quran location.
    const opening=['اعوذ','بالله','من','الشيطان','الرجيم','بسم','الله','الرحمن','الرحيم'];
    let start=0;
    while(start<spoken.length&&opening.includes(spoken[start])&&start<9)start++;
    // Avoid removing Quran words: trim only recognizable complete invocation.
    const heard=(start>=5&&spoken.slice(0,5).join(' ')==='اعوذ بالله من الشيطان الرجيم')
      ?spoken.slice(spoken.slice(5,9).join(' ')==='بسم الله الرحمن الرحيم'?9:5)
      :spoken.slice(0,4).join(' ')==='بسم الله الرحمن الرحيم'?spoken.slice(4):spoken;
    if(heard.length<3)return null;
    const candidates=new Map();
    for(let k=0;k+2<heard.length;k++){
      const hits=this.startIndex.get(heard.slice(k,k+3).join('|'))||[];
      for(const i of hits){
        const origin=i-k;if(origin<0)continue;
        const first=this.words[origin];if(!first)continue;
        const key=first.vk+'#'+first.wi;
        const prior=candidates.get(key)||{first,origin,score:0,matched:0};
        prior.score+=3;prior.matched++;
        candidates.set(key,prior);
      }
    }
    const ranked=[...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,120);
    const scored=[];
    for(const item of ranked){
      let matches=0,mismatches=0;
      for(let k=0;k<heard.length;k++){
        const ref=this.words[item.origin+k];
        if(!ref)break;
        if(ref.token===heard[k])matches++;else mismatches++;
      }
      if(matches<3||matches/Math.max(heard.length,1)<.76)continue;
      scored.push({...item,matched:matches,quality:matches/Math.max(heard.length,1)});
    }
    scored.sort((a,b)=>b.matched-a.matched||b.quality-a.quality);
    const best=scored[0];if(!best)return null;
    const second=scored.find(v=>v.first.vk!==best.first.vk||v.first.wi!==best.first.wi);
    // Continue listening through mutashabihat; never choose by page proximity.
    if(second&&second.matched>=best.matched-1&&second.quality>=best.quality-.08)return null;
    return {vk:best.first.vk,page:best.first.page,wi:best.first.wi,score:best.quality,strong:best.matched};
  }
}

 function errorInfo(error,all=[],words=[]){const type=String(error.type||'').replace(/^automatic_/,''),key=error.vk;
  if(type==='omission'){const verse=words.filter(w=>w.vk===key),omitted=all.filter(e=>e.vk===key&&String(e.type).replace(/^automatic_/,'')==='omission'&&e.active!==false);return {group:'omission',label:verse.length&&omitted.length>=verse.length?'سقوط آية كاملة':'سقوط كلمة',reason:'سقط أثناء التسميع'};}
  if(type==='substitution')return {group:'word',label:'استبدال كلمة'};if(type==='extra')return {group:'extra',label:'كلمة زائدة'};if(type==='mutashabih_jump')return {group:'word',label:'انتقال إلى متشابه'};
  if(type==='assistance')return {group:'help',label:error.hint==='ayah'?'تلميح آية':error.hint==='eye'?'كشف الوجه':'تلميح كلمة'};
  if(type==='tashkeel')return {group:'word',label:'خطأ تشكيل · مصنّف من المعلّمة'};return {group:'word',label:'خطأ في الكلمة'};
 }
 return {normalize,baseNormalize,configureAliases,tokens,similarity,align,Tracker,RevealGate,Locator,errorInfo};
});
