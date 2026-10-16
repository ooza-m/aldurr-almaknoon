const test=require('node:test'),assert=require('node:assert/strict');
const {AudioDownloads,BufferedPlayer}=require('../reader-audio.js');
const tick=()=>new Promise(r=>setImmediate(r));
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
