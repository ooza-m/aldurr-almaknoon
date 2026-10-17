const test=require('node:test'),assert=require('node:assert/strict');
const {AudioDownloads,BufferedPlayer}=require('../reader-audio.js');
const tick=()=>new Promise(r=>setImmediate(r));
test('optional silent gap pauses and resumes its countdown without redownloading or audio during silence',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const {p,audio,requests}=player(t);p.setRepeat(2);p.setGap(5);await p.start({verses:['1:1','1:2']});advance(audio,4);assert.equal(p.status,'waiting');assert.ok(audio.paused);const plays=audio.plays;
 t.mock.timers.tick(2000);await p.toggle();assert.equal(p.status,'wait-paused');const remaining=p.snapshot().gapRemaining;t.mock.timers.tick(10000);assert.equal(p.snapshot().gapRemaining,remaining);assert.equal(audio.plays,plays);
 await p.toggle();t.mock.timers.tick(3000);await tick();assert.equal(p.status,'playing');assert.equal(audio.currentTime,0);assert.equal(p.cycle,2);assert.equal(requests.length,2);advance(audio,4);assert.equal(p.status,'ended');
});
test('stopping during a silent gap invalidates its delayed playback callback',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const {p,audio}=player(t);p.setGap(3);p.setRepeat(0);await p.start({verses:['1:1','1:2']});advance(audio,4);assert.equal(p.status,'waiting');const plays=audio.plays;p.stop();t.mock.timers.tick(20000);await tick();assert.equal(p.status,'idle');assert.equal(audio.plays,plays);
});
const times=['1:1','1:2','1:3'].map((verse_key,i)=>({verse_key,timestamp_from:i*2000,timestamp_to:(i+1)*2000}));
function downloads(options={}){
  const requests=[],revoked=[];let id=0;
  const store=new AudioDownloads({fetcher:async(url,opts)=>{requests.push(url);if(options.fetcher)return options.fetcher(url,opts);
    if(url.includes('chapter_recitations'))return {ok:true,json:async()=>({audio_file:{chapter_id:1,audio_url:'https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/1.mp3',timestamps:times}})};
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(64)};
  },createUrl:()=>`blob:audio-${++id}`,revokeUrl:u=>revoked.push(u)});
  return {store,requests,revoked};
}
class Audio{
  constructor(){this.src='';this.currentTime=0;this.duration=6;this.readyState=1;this.paused=true;this.plays=0;}
  async play(){this.paused=false;this.plays++;this.onplaying?.();}
  pause(){this.paused=true;this.onpause?.();}removeAttribute(){this.src='';}load(){}
}
function player(t,options={}){const audio=new Audio(),d=downloads(),p=new BufferedPlayer({audioFactory:()=>audio,downloads:d.store,...options});t.after(()=>p.stop());return {p,audio,...d};}
function advance(audio,to){while(audio.currentTime<to){audio.currentTime=Math.min(to,audio.currentTime+.25);audio.ontimeupdate?.();}}
test('each ayah repeats separately before advancing and does not redownload',async t=>{
 const {p,audio,requests}=player(t);p.setAyahRepeat(2);await p.start({verses:['1:1','1:2']});advance(audio,1.75);audio.currentTime=2;audio.ontimeupdate();await tick();
 assert.equal(p.snapshot().key,'1:1');assert.equal(p.ayahCycle,2);assert.equal(audio.currentTime,0);
 advance(audio,2);await tick();assert.equal(p.snapshot().key,'1:2');assert.equal(p.ayahCycle,1);assert.equal(requests.length,2);
});
test('default browser fetch is bound to its native global receiver',async()=>{
 const native=globalThis.fetch;let calls=0;globalThis.fetch=async function(){assert.equal(this,globalThis);calls++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
 try{const store=new AudioDownloads({createUrl:()=> 'blob:bound',revokeUrl(){}});await store.prepare(['103:1'],'maher');assert.equal(calls,1);store.clear();}finally{globalThis.fetch=native;}
});
test('chapter MP3 is downloaded once before any selected ayah plays',async t=>{
  const {p,audio,requests}=player(t);await p.start({verses:['1:1','1:2','1:3'],scope:'surah'});
  assert.equal(requests.length,2);assert.equal(requests.filter(u=>u.endsWith('.mp3')).length,1);assert.match(audio.src,/^blob:/);
  const source=audio.src;advance(audio,2);assert.equal(p.snapshot().key,'1:2');assert.equal(audio.src,source);assert.equal(audio.plays,1);
  advance(audio,4);assert.equal(p.snapshot().key,'1:3');assert.equal(audio.src,source);assert.equal(requests.length,2);
});
test('continuous playback keeps highlights and credits completion only after listening',async t=>{
  const seen=[],complete=[],{p,audio}=player(t,{onVerse:k=>seen.push(k),onComplete:s=>complete.push(s)});
  await p.start({verses:['1:1','1:2','1:3'],scope:'face',page:1});advance(audio,6);
  assert.deepEqual(seen,['1:1','1:2','1:3']);assert.equal(p.status,'ended');assert.equal(complete.length,1);assert.equal(complete[0].fullyPlayed,true);
});
test('range seeks to its first ayah and stops at the last selected boundary',async t=>{
  const {p,audio}=player(t);await p.start({verses:['1:2','1:3']});assert.equal(audio.currentTime,2);advance(audio,6);assert.equal(p.status,'ended');assert.ok(audio.paused);
});
test('manual skip does not earn full-face credit',async t=>{
  const complete=[],{p,audio}=player(t,{onComplete:s=>complete.push(s)});await p.start({verses:['1:1','1:2','1:3']});await p.next();advance(audio,6);assert.equal(complete[0].fullyPlayed,false);
});
test('external seek does not mark skipped intervals as listened',async t=>{
  const complete=[],{p,audio}=player(t,{onComplete:s=>complete.push(s)});await p.start({verses:['1:1','1:2','1:3']});audio.currentTime=5;audio.ontimeupdate();advance(audio,6);assert.equal(complete[0].fullyPlayed,false);
});
test('pausing keeps current ayah and changing speed does not reload or seek',async t=>{
  const {p,audio,requests}=player(t);await p.start({verses:['1:1','1:2']});advance(audio,2.5);await p.toggle();const src=audio.src;
  p.setRate(1.5);assert.equal(p.status,'paused');assert.equal(p.snapshot().key,'1:2');assert.equal(audio.currentTime,2.5);assert.equal(audio.src,src);assert.equal(requests.length,2);
});
test('changing voice while paused never starts playback and keeps the ayah',async t=>{
  const fake={clear(){},prepare:async keys=>new Map(keys.map((k,i)=>[k,{src:'blob:voice',from:i*2,to:(i+1)*2,chapter:true}]))};
  const {p,audio}=player(t,{downloads:fake});await p.start({verses:['1:1','1:2']});await p.next();await p.toggle();const plays=audio.plays;
  await p.setReciter('husary');assert.equal(p.status,'paused');assert.equal(p.snapshot().key,'1:2');assert.equal(audio.plays,plays);
});
test('all fallback ayah files finish downloading before playback starts',async t=>{
  const {p,audio,requests}=player(t);p.reciter='maher';await p.start({verses:['1:1','1:2','1:3']});assert.equal(requests.length,3);assert.equal(p.plan.size,3);assert.equal(audio.plays,1);
  const count=requests.length;audio.onended();await tick();assert.equal(p.snapshot().key,'1:2');assert.equal(requests.length,count);
});
test('closed download cannot revive playback or leave its object URLs behind',async t=>{
  let release;const fake={clear(){},prepare:()=>new Promise(r=>release=r)};const {p,audio}=player(t,{downloads:fake});const work=p.start({verses:['1:1','1:2']});p.stop();release(new Map());await work;assert.equal(p.status,'idle');assert.equal(audio.plays,0);
});
test('failed preparation stays stopped and exposes retry',async t=>{
  const errors=[],{p,audio}=player(t,{downloads:{clear(){},prepare:async()=>{throw Error('offline');}},onError:m=>errors.push(m)});await p.start({verses:['1:1','1:2']});assert.equal(p.status,'error');assert.equal(audio.plays,0);assert.equal(errors.length,1);
});
test('replaying the same downloaded range reuses its bytes',async t=>{
  const {p,audio,requests}=player(t);await p.start({verses:['1:1','1:2']});advance(audio,4);await p.toggle();assert.equal(requests.length,2);assert.equal(p.status,'playing');
});
test('stop releases downloaded URLs and cancels callbacks',async t=>{
  const {p,audio,revoked}=player(t);await p.start({verses:['1:1','1:2']});const clock=audio.ontimeupdate;p.stop();clock();assert.equal(p.status,'idle');assert.equal(revoked.length,1);assert.equal(audio.src,'');
});
test('wrong-reciter chapter metadata is rejected and uses the requested voice',async()=>{
  const {store,requests}=downloads();const plan=await store.prepare(['1:1','1:2'],'husary');assert.equal(requests.length,3);assert.ok(requests.slice(1).every(u=>u.includes('/Husary_128kbps/')));assert.notEqual(plan.get('1:1').src,plan.get('1:2').src);store.clear();
});
test('replaying the same half of an ayah cannot add up to full listening credit',async t=>{
 const complete=[],{p,audio}=player(t,{onComplete:s=>complete.push(s)});await p.start({verses:['1:1','1:2']});advance(audio,1);await p.previous();advance(audio,1);p.seek(1);audio.ontimeupdate();await tick();advance(audio,4);assert.equal(complete[0].fullyPlayed,false);assert.ok((p.coverage.get('1:1')||0)<=1.01);
});
test('a selected repeat count reuses prepared audio and completes only after the last cycle',async t=>{
 const complete=[],{p,audio,requests}=player(t,{onComplete:s=>complete.push(s)});p.setRepeat(2);await p.start({verses:['1:1','1:2']});advance(audio,3.75);audio.currentTime=4;audio.ontimeupdate();await tick();assert.equal(complete.length,0);assert.equal(p.cycle,2);advance(audio,4);assert.equal(complete.length,1);assert.equal(complete[0].fullyPlayed,true);assert.equal(requests.length,2);
});
