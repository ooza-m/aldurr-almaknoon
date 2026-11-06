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
