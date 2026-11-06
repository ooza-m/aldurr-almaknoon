const test=require('node:test');
const assert=require('node:assert/strict');
const {BufferedPlayer}=require('../reader-audio.js');

function playerFixture(){
 const seen=[],audio={src:'',duration:3,currentTime:0,readyState:1,paused:true,playbackRate:1,plays:0,pauses:0,
  async play(){this.paused=false;this.plays++;this.onplaying?.();},pause(){this.paused=true;this.pauses++;this.onpause?.();}};
 const plan=new Map([['103:1',{src:'blob:chapter',from:0,to:1,chapter:true}],
  ['103:2',{src:'blob:chapter',from:1,to:2,chapter:true}],
  ['103:3',{src:'blob:chapter',from:2,to:3,chapter:true}]]);
 const downloads={async prepare(){return plan;},clear(){}};
 const player=new BufferedPlayer({audioFactory:()=>audio,downloads,reciter:'alafasy',
  onVerse:(key)=>{seen.push(key);},onError:msg=>{throw Error(msg);}});
 return {player,audio,seen};
}
test('contiguous timestamps keep the same audio element playing without restarting at each ayah',async()=>{
 const {player,audio,seen}=playerFixture();
 await player.start({verses:['103:1','103:2','103:3'],scope:'surah'});
 const initialPlays=audio.plays;
 audio.currentTime=1.03;audio.ontimeupdate();
 assert.equal(player.index,1);assert.equal(player.snapshot().key,'103:2');
 assert.equal(audio.plays,initialPlays,'the chapter audio must not restart on adjacent verse');
 assert.equal(audio.paused,false);
 assert.deepEqual(seen,['103:1','103:2']);
 audio.currentTime=2.03;audio.ontimeupdate();
 assert.equal(player.snapshot().key,'103:3');
 assert.equal(audio.plays,initialPlays);
 player.stop();
});
test('ayah repeat intentionally seeks the same segment before progressing to the next',async()=>{
 const {player,audio,seen}=playerFixture();
 player.setAyahRepeat(2);
 await player.start({verses:['103:1','103:2'],scope:'range'});
 audio.currentTime=1.01;audio.ontimeupdate();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(player.snapshot().key,'103:1');
 assert.equal(player.ayahCycle,2);
 assert.ok(audio.plays>=2,'repeat begins a new segment on purpose');
 audio.currentTime=1.01;audio.ontimeupdate();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(player.snapshot().key,'103:2');
 assert.deepEqual(seen.slice(0,3),['103:1','103:1','103:2']);
 player.stop();
});
test('pausing and resuming does not advance the verse or silently mark listening complete',async()=>{
 const {player,audio}=playerFixture();
 await player.start({verses:['103:1','103:2'],scope:'range'});
 await player.toggle();
 assert.equal(player.status,'paused');assert.equal(player.snapshot().key,'103:1');
 await player.toggle();
 assert.equal(player.status,'playing');assert.equal(player.snapshot().key,'103:1');
 assert.equal(player.completed.size,0);
 player.stop();
});


test('seeking to a verse boundary while paused never autoplays the next verse',async()=>{
 const {player,audio}=playerFixture();
 await player.start({verses:['103:1','103:2'],scope:'range'});
 await player.toggle();
 assert.equal(player.status,'paused');
 const plays=audio.plays;
 audio.currentTime=1.01;
 audio.ontimeupdate();
 assert.equal(player.status,'paused','paused listening must remain paused');
 assert.equal(player.index,0,'no automatic verse advancement during a paused seek');
 assert.equal(audio.plays,plays,'a native timeupdate may not trigger autoplay');
 player.stop();
});


test('cross-surah boundary opens the next recording once and preserves verse order',async()=>{
 const {player,audio,seen}=playerFixture();
 const cross=new Map([['103:3',{src:'blob:surah-103',from:0,to:1,chapter:true}],
  ['104:1',{src:'blob:surah-104',from:0,to:1,chapter:true}]]);
 player.downloads.prepare=async()=>cross;
 await player.start({verses:['103:3','104:1'],scope:'range'});
 assert.equal(player.snapshot().key,'103:3');
 const firstPlays=audio.plays;
 audio.currentTime=1;audio.onended();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(player.snapshot().key,'104:1','next surah remains in queue');
 assert.equal(audio.src,'blob:surah-104');
 assert.equal(audio.plays,firstPlays+1,'exactly one new playback starts for the new chapter file');
 assert.deepEqual(seen,['103:3','104:1']);
 player.stop();
});


test('failed preparation remains retryable and cannot credit listening before audio starts',async()=>{
 let attempts=0;
 const audio={src:'',duration:2,currentTime:0,readyState:1,paused:true,playbackRate:1,
  async play(){this.paused=false;this.onplaying?.();},pause(){this.paused=true;this.onpause?.();}};
 const errors=[],player=new BufferedPlayer({audioFactory:()=>audio,onError:e=>errors.push(e),
  downloads:{async prepare(){attempts++;if(attempts===1)throw Error('network offline');return new Map([['103:1',{src:'blob:retry',from:0,to:2,chapter:true}]]);},clear(){}}});
 await player.start({verses:['103:1'],scope:'verse'});
 assert.equal(player.status,'error');
 assert.equal(player.completed.size,0);
 assert.equal(errors.length,1);
 await player.toggle();
 assert.equal(attempts,2);
 assert.equal(player.status,'playing');
 assert.equal(audio.src,'blob:retry');
 assert.equal(player.completed.size,0,'a recovered download is not a completed listen');
 player.stop();
});


test('a twice-repeated range spanning two surahs preserves order and ends after second cycle',async()=>{
 const {player,audio,seen}=playerFixture();
 player.downloads.prepare=async()=>new Map([
  ['103:3',{src:'blob:surah103',from:0,to:1,chapter:true}],
  ['104:1',{src:'blob:surah104',from:0,to:1,chapter:true}]]);
 player.setRepeat(2);
 await player.start({verses:['103:3','104:1'],scope:'range'});
 for(let step=0;step<4;step++){
  audio.currentTime=1;audio.onended();
  await new Promise(resolve=>setImmediate(resolve));
 }
 assert.deepEqual(seen,['103:3','104:1','103:3','104:1']);
 assert.equal(player.status,'ended','range ends only after its configured second cycle');
 assert.equal(player.cycle,2);
 player.stop();
});


test('decoder-rejected complete-size MP3 evicts only its chapter cache before manual retry',async()=>{
 let loads=0,removed=[],notes=[];
 const audio={src:'',currentTime:0,duration:1,readyState:1,paused:true,error:null,
  async play(){this.paused=false;this.onplaying?.();},pause(){this.paused=true;this.onpause?.();}};
 const downloads={library:{async remove(reciter,chapter){removed.push([reciter,chapter]);}},
  async prepare(){loads++;return new Map([['103:1',{src:'blob:attempt-'+loads,from:0,to:1,chapter:true}]]);},clear(){}};
 const player=new BufferedPlayer({audioFactory:()=>audio,downloads,reciter:'alafasy',onError:e=>notes.push(e)});
 await player.start({verses:['103:1']});
 audio.error={code:3};audio.onerror();
 assert.equal(player.status,'error');
 assert.equal(player.completed.size,0);
 await player.toggle();
 assert.deepEqual(removed,[['alafasy',103]]);
 assert.equal(loads,2);
 assert.equal(audio.src,'blob:attempt-2');
 assert.equal(player.status,'playing');
 player.stop();
});
test('network playback error does not delete a previously verified offline chapter',async()=>{
 let deleted=0,loads=0;
 const audio={src:'',currentTime:0,duration:1,readyState:1,paused:true,error:null,
  async play(){this.paused=false;this.onplaying?.();},pause(){this.paused=true;this.onpause?.();}};
 const player=new BufferedPlayer({audioFactory:()=>audio,onError:()=>{},downloads:{
  library:{async remove(){deleted++;}},async prepare(){loads++;return new Map([['103:1',{src:'blob:cached',from:0,to:1,chapter:true}]]);},clear(){}}});
 await player.start({verses:['103:1']});
 audio.error={code:2};audio.onerror();
 assert.equal(player.status,'error');assert.equal(deleted,0);
 await player.toggle();assert.equal(loads,2);assert.equal(deleted,0);
 player.stop();
});
test('a late play promise cannot revive playback after a media error',async()=>{
 let resolvePlay;const audio={src:'',currentTime:0,duration:1,readyState:1,paused:true,error:{code:2},
  play(){return new Promise(resolve=>{resolvePlay=resolve;});},pause(){this.paused=true;this.onpause?.();}};
 const player=new BufferedPlayer({audioFactory:()=>audio,onError:()=>{},downloads:{
  async prepare(){return new Map([['103:1',{src:'blob:late',from:0,to:1,chapter:true}]]);},clear(){}}});
 const work=player.start({verses:['103:1']});
 for(let i=0;i<5&&!resolvePlay;i++)await new Promise(r=>setImmediate(r));
 assert.equal(typeof resolvePlay,'function');
 audio.onerror();
 resolvePlay();await work;
 assert.equal(player.status,'error');
 assert.equal(player.completed.size,0);
 player.stop();
});
