const test=require('node:test');
const assert=require('node:assert/strict');
const {RECITERS,RATES,audioUrl,TafsirStore,AudioPlayer}=require('../reader-core.js');
class FakeAudio{
  constructor(){this.currentTime=0;this.duration=10;this.paused=true;this.src='';}
  async play(){this.paused=false;this.onplaying?.();}
  pause(){this.paused=true;this.onpause?.();}
  removeAttribute(){this.src='';}load(){}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function player(options={}){const audio=new FakeAudio();return {audio,p:new AudioPlayer({audioFactory:()=>audio,...options})};}
test('eight distinct reciters produce zero-padded, validated EveryAyah URLs',()=>{
  assert.equal(RECITERS.length,8);assert.equal(new Set(RECITERS.map(r=>audioUrl('2:3',r.id))).size,8);
  assert.match(audioUrl('2:3','husary'),/Husary_128kbps\/002003.mp3$/);
  assert.throws(()=>audioUrl('115:1','alafasy'));assert.throws(()=>audioUrl('1:0','alafasy'));assert.throws(()=>audioUrl('1:1','unknown'));
});
test('current ayah remains selected on pause, then follows the next audio file',async()=>{
  const verses=[],{p,audio}=player({onVerse:key=>verses.push(key)});
  await p.start({verses:['1:1','1:2']});await p.toggle();assert.equal(p.status,'paused');assert.deepEqual(verses,['1:1']);
  await p.toggle();audio.onended();await tick();assert.equal(p.snapshot().key,'1:2');assert.deepEqual(verses,['1:1','1:2']);
});
test('all six rates update the real audio element without restarting the verse',async()=>{
  const {p,audio}=player();await p.start({verses:['1:1']});const src=audio.src;
  for(const rate of RATES){p.setRate(rate);assert.equal(audio.playbackRate,rate);assert.equal(audio.src,src);}
  p.setRate(4);assert.equal(p.rate,2);
});
test('changing reciter while paused keeps playback paused and changes the audio URL',async()=>{
  const {p,audio}=player();await p.start({verses:['1:1']});await p.toggle();await p.setReciter('minshawi');
  assert.equal(p.status,'paused');assert.equal(audio.paused,true);assert.match(audio.src,/Minshawy/);
});
test('full completion is reported exactly once, and only after every ayah ends',async()=>{
  const completions=[],{p,audio}=player({onComplete:s=>completions.push(s)});
  await p.start({verses:['1:1','1:2'],scope:'face',page:1});audio.onended();await tick();const stale=audio.onended;stale();await tick();stale();
  assert.equal(completions.length,1);assert.equal(completions[0].fullyPlayed,true);assert.equal(completions[0].page,1);
});
test('skipping an ayah never grants full listening credit',async()=>{
  const completions=[],{p,audio}=player({onComplete:s=>completions.push(s)});
  await p.start({verses:['1:1','1:2'],scope:'face'});await p.next();audio.onended();await tick();assert.equal(completions[0].fullyPlayed,false);
});
test('replaying only the final ayah after completion cannot count the whole face again',async()=>{
  const completions=[],{p,audio}=player({onComplete:s=>completions.push(s)});
  await p.start({verses:['1:1','1:2'],scope:'face'});audio.onended();await tick();audio.onended();await tick();
  await p.playIndex(1);audio.onended();await tick();assert.deepEqual(completions.map(s=>s.fullyPlayed),[true,false]);
});
test('a single-ayah session cannot inherit the previous face onended callback',async()=>{
  const {p,audio}=player();await p.start({verses:['1:1','1:2']});const oldEnd=audio.onended;
  await p.start({verses:['2:1'],scope:'verse'});oldEnd();await tick();assert.equal(p.snapshot().key,'2:1');assert.equal(p.status,'playing');
  audio.onended();await tick();assert.equal(p.status,'ended');assert.equal(p.scope,'verse');
});
test('stale asynchronous page preparation cannot replace a newer audio session',async()=>{
  let release;const {p,audio}=player({onVerse:key=>key==='1:1'?new Promise(resolve=>release=resolve):undefined});
  const old=p.start({verses:['1:1']});await p.start({verses:['2:1']});release();await old;
  assert.match(audio.src,/002001.mp3$/);assert.equal(p.snapshot().key,'2:1');
});
test('stop invalidates callbacks and clears the media resource',async()=>{
  const {p,audio}=player();await p.start({verses:['1:1','1:2']});const end=audio.onended;p.stop();end();await tick();assert.equal(p.status,'idle');assert.equal(audio.src,'');assert.deepEqual(p.queue,[]);
});
test('system pause events update the player state',async()=>{const {p,audio}=player();await p.start({verses:['1:1']});audio.pause();assert.equal(p.status,'paused');});
function storage(seed={}){const entries={...seed};return {getItem:k=>entries[k],setItem:(k,v)=>entries[k]=v};}
test('tafsir books use separate source-checked cache entries and deduplicate requests',async()=>{
  const requests=[],store=new TafsirStore({storage:storage(),fetcher:async url=>{requests.push(url);const source=+url.match(/tafsirs\/(\d+)/)[1];return {ok:true,json:async()=>({tafsir:{resource_id:source,text:'source-'+source}})};}});
  const values=await Promise.all([store.get('1:1','saadi'),store.get('1:1','saadi'),store.get('1:1','muyassar')]);
  assert.deepEqual(values,['source-91','source-91','source-16']);assert.equal(requests.length,2);await store.get('1:1','muyassar');assert.equal(requests.length,2);
});
test('legacy mixed caches are ignored without touching user learning data',async()=>{
  const saved=storage({'durr-tafsir-cache':JSON.stringify({'1:1':{saadi:'wrong'}}),'durr-face-learning-ui':'progress'});let calls=0;
  const store=new TafsirStore({storage:saved,fetcher:async()=>{calls++;return {ok:true,json:async()=>({tafsir:{text:'correct',resource_id:91}})};}});
  assert.equal(await store.get('1:1','saadi'),'correct');assert.equal(calls,1);assert.equal(saved.getItem('durr-face-learning-ui'),'progress');
});
test('a response from the wrong tafsir source is rejected, not cached',async()=>{
  const store=new TafsirStore({fetcher:async()=>({ok:true,json:async()=>({tafsir:{text:'wrong',resource_id:16}})})});await assert.rejects(store.get('1:1','saadi'),/Wrong/);assert.deepEqual(store.cache,{});
});
