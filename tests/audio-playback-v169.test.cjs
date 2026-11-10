'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Audio=require('../reader-audio.js');
function fakeAudio(){
 return {src:'',currentTime:0,duration:10,readyState:2,playbackRate:1,
   pause(){this.onpause?.();},play(){this.onplaying?.();return Promise.resolve();},
   removeAttribute(){},load(){}};
}
function player(){
 const statuses=[],audio=fakeAudio();
 const p=new Audio.BufferedPlayer({
   downloads:{clear(){}},audioFactory:()=>audio,onChange:s=>statuses.push(s.status),onVerse:()=>{},onError:e=>{throw Error(e)}
 });
 p.plan=new Map([['1:1',{src:'blob:test',from:0,to:5,chapter:true}]]);
 p.queue=['1:1'];
 return {p,audio,statuses};
}
test('single chapter reciter for Abdul Basit uses murattal instead of mujawwad',()=>{
 assert.equal(Audio.CHAPTER_READERS.abdulbasit[0],1);
});
test('network buffering displays separately and resumes playback',async()=>{
 const {p,audio,statuses}=player();
 await p.playIndex(0);
 assert.equal(p.status,'playing');
 audio.onwaiting();
 assert.equal(p.status,'buffering');
 await p.toggle();
 assert.equal(p.status,'paused');
 await p.toggle();
 assert.equal(p.status,'playing');
 assert.ok(statuses.includes('buffering'));
 p.stop();
 assert.equal(p.status,'idle');
});
test('stalled event is handled even without waiting event',async()=>{
 const {p,audio}=player();
 await p.playIndex(0);
 audio.onstalled();
 assert.equal(p.status,'buffering');
 audio.onplaying();
 assert.equal(p.status,'playing');
 p.stop();
});
test('halting audio clears media buffering callbacks',async()=>{
 const {p,audio}=player();
 await p.playIndex(0);
 p.halt();
 assert.equal(audio.onwaiting,null);
 assert.equal(audio.onstalled,null);
});
test('source references include fresh audio module version',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const base=path.join(__dirname,'..');
 assert.match(fs.readFileSync(path.join(base,'mushaf.html'),'utf8'),/reader-audio\.js\?v=90/);
 assert.match(fs.readFileSync(path.join(base,'sw.js'),'utf8'),/reader-audio\.js\?v=90/);
});
