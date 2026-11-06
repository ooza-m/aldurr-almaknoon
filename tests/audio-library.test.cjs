const test=require('node:test'),assert=require('node:assert/strict'),{Library,CACHE}=require('../audio-library.js'),{AudioDownloads,BufferedPlayer}=require('../reader-audio.js');
function caches(){const data=new Map();return {data,open:async()=>({put:async(k,v)=>data.set(k,v.clone()),match:async k=>data.get(typeof k==='string'?k:k.url)?.clone(),delete:async k=>data.delete(typeof k==='string'?k:k.url),keys:async()=>[...data.keys()].map(url=>({url}))})};}
const times=[{verse_key:'103:1',timestamp_from:0,timestamp_to:2000},{verse_key:'103:2',timestamp_from:2000,timestamp_to:5000},{verse_key:'103:3',timestamp_from:5000,timestamp_to:10000}];
const metadata={audio_file:{chapter_id:103,audio_url:'https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/103.mp3',timestamps:times}};
test('a complete recording survives a new library instance and offline playback makes no request',async()=>{const cs=caches(),first=new Library({cacheStorage:cs});await first.put('alafasy',103,{blob:new Blob(['complete audio']),times});const d=new AudioDownloads({library:new Library({cacheStorage:cs}),fetcher:()=>{throw Error('offline');},createUrl:()=> 'blob:offline',revokeUrl(){}});const plan=await d.prepare(['103:1','103:2','103:3'],'alafasy');assert.equal(plan.get('103:2').from,2);assert.equal(plan.get('103:2').src,'blob:offline');assert.equal(CACHE.startsWith('durr-'),false);d.clear();});
test('per-ayah fallback downloads also persist and remove only the selected chapter',async()=>{const cs=caches(),s=new Library({cacheStorage:cs});await s.put('maher',103,{blobs:[{vk:'103:1',blob:new Blob(['a'])},{vk:'103:2',blob:new Blob(['b'])}]});await s.put('alafasy',103,{blob:new Blob(['other']),times});const saved=await new Library({cacheStorage:cs}).get('maher',103);assert.equal(saved.blobs.length,2);await s.remove('maher',103);assert.equal(await s.get('maher',103),null);assert.equal((await s.list()).length,1);});
test('a failed cache write never exposes a partially stored recording as complete',async()=>{const cs=caches(),base=cs.open;cs.open=async()=>{const cache=await base();return {...cache,put:async(k,v)=>{if(k.endsWith('/meta'))throw Error('quota');return cache.put(k,v);}};};const s=new Library({cacheStorage:cs});await assert.rejects(s.put('alafasy',103,{blob:new Blob(['audio']),times}));assert.equal(await s.get('alafasy',103),null);});
test('an unresponsive metadata host has a short deadline and a working alternate is used',async()=>{const calls=[],d=new AudioDownloads({requestTimeout:20,library:new Library({cacheStorage:null}),createUrl:()=> 'blob:audio',revokeUrl(){},fetcher:async url=>{calls.push(url);if(url.startsWith('https://api.quran.com'))return new Promise(()=>{});if(url.includes('chapter_recitations'))return {ok:true,json:async()=>metadata};return {ok:true,arrayBuffer:async()=>new ArrayBuffer(32)};}});const plan=await d.prepare(['103:1','103:2','103:3'],'alafasy');assert.equal(plan.size,3);assert.equal(calls.length,3);d.clear();});
test('a stalled download body fails instead of leaving a permanent waiting state',async()=>{const d=new AudioDownloads({stallTimeout:20,library:new Library({cacheStorage:null}),createUrl:()=> 'blob:audio',revokeUrl(){},fetcher:async url=>url.includes('chapter_recitations')?{ok:true,json:async()=>metadata}:{ok:true,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{}})}}});await assert.rejects(d.prepare(['103:1','103:2'],'alafasy'),/timed out/);d.clear();});
test('single-ayah playback uses a small verified verse file, not a whole long chapter',async()=>{const calls=[],d=new AudioDownloads({library:new Library({cacheStorage:null}),createUrl:()=> 'blob:audio',revokeUrl(){},fetcher:async url=>{calls.push(url);return url.includes('/recitations/')?{ok:true,json:async()=>({audio_files:[{verse_key:'103:3',url:'Alafasy/mp3/103003.mp3'}]})}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(32)};}});const plan=await d.prepare(['103:3'],'alafasy');assert.equal(plan.get('103:3').from,0);assert.equal(plan.get('103:3').chapter,false);assert.equal(calls.some(u=>u.includes('everyayah')||u.includes('chapter_recitations')),false);assert.ok(calls.some(u=>u.startsWith('https://verses.quran.com/')));d.clear();});


test('malformed first chapter metadata host falls through to verified alternate and downloads once',async()=>{
 const calls=[],d=new AudioDownloads({library:new Library({cacheStorage:null}),createUrl:()=> 'blob:verified',revokeUrl(){},
  fetcher:async url=>{
   calls.push(url);
   if(url.startsWith('https://api.quran.com')&&url.includes('chapter_recitations'))
    return {ok:true,json:async()=>({audio_file:{chapter_id:103,audio_url:'https://invalid.example/file.mp3',timestamps:times}})};
   if(url.startsWith('https://api.qurancdn.com')&&url.includes('chapter_recitations'))
    return {ok:true,json:async()=>metadata};
   if(url.startsWith('https://download.quranicaudio.com'))
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(32)};
   throw Error('Unexpected fallback '+url);
  }});
 const plan=await d.prepare(['103:1','103:2'],'alafasy');
 assert.equal(plan.get('103:2').src,'blob:verified');
 assert.equal(calls.filter(u=>u.includes('chapter_recitations')).length,2);
 assert.equal(calls.filter(u=>u.startsWith('https://download.quranicaudio.com')).length,1);
 d.clear();
});

test('incomplete chapter timestamps on primary host retry full-coverage metadata from alternate host',async()=>{
 const calls=[],partial={audio_file:{...metadata.audio_file,timestamps:[times[0]]}};
 const d=new AudioDownloads({library:new Library({cacheStorage:null}),createUrl:()=> 'blob:complete',revokeUrl(){},fetcher:async url=>{
   calls.push(url);
   if(url.startsWith('https://api.quran.com'))return {ok:true,json:async()=>partial};
   if(url.startsWith('https://api.qurancdn.com'))return {ok:true,json:async()=>metadata};
   if(url.startsWith('https://download.quranicaudio.com'))return {ok:true,arrayBuffer:async()=>new ArrayBuffer(32)};
   throw Error('Unexpected fallback '+url);
 }});
 const plan=await d.prepare(['103:1','103:2','103:3'],'alafasy');
 assert.equal(plan.size,3);
 assert.equal(plan.get('103:3').src,'blob:complete');
 assert.equal(calls.filter(u=>u.includes('chapter_recitations')).length,2);
 assert.equal(calls.filter(u=>u.startsWith('https://download.quranicaudio.com')).length,1);
 d.clear();
});
test('invalid first verse metadata falls through to second host for a single ayah',async()=>{
 const calls=[],d=new AudioDownloads({library:new Library({cacheStorage:null}),createUrl:()=> 'blob:ayah',revokeUrl(){},fetcher:async url=>{
   calls.push(url);
   if(url.startsWith('https://api.quran.com'))return {ok:true,json:async()=>({audio_files:[]})};
   if(url.startsWith('https://api.qurancdn.com'))return {ok:true,json:async()=>({audio_files:[{verse_key:'103:3',url:'Alafasy/mp3/103003.mp3'}]})};
   if(url.startsWith('https://verses.quran.com'))return {ok:true,arrayBuffer:async()=>new ArrayBuffer(32)};
   throw Error('Unexpected fallback '+url);
 }});
 const plan=await d.prepare(['103:3'],'alafasy');
 assert.equal(plan.get('103:3').src,'blob:ayah');
 assert.equal(calls.filter(u=>u.includes('/recitations/')).length,2);
 assert.equal(calls.filter(u=>u.includes('everyayah.com')).length,0);
 d.clear();
});

test('unavailable chapter MP3 falls back to per-ayah audio for the chosen reciter',async()=>{
 const calls=[],d=new AudioDownloads({library:new Library({cacheStorage:null}),
  createUrl:(()=>{let i=0;return()=> 'blob:verse-'+(++i);})(),revokeUrl(){},
  fetcher:async url=>{
   calls.push(url);
   if(url.includes('chapter_recitations'))return {ok:true,json:async()=>metadata};
   if(url.startsWith('https://download.quranicaudio.com'))return {ok:false,status:503};
   if(url.includes('/Alafasy_128kbps/'))return {ok:true,arrayBuffer:async()=>new ArrayBuffer(20)};
   throw Error('Wrong reader or untrusted audio URL '+url);
  }});
 const plan=await d.prepare(['103:1','103:2'],'alafasy');
 assert.equal(plan.size,2);
 assert.equal(plan.get('103:1').chapter,false);
 assert.equal(plan.get('103:2').chapter,false);
 assert.notEqual(plan.get('103:1').src,plan.get('103:2').src);
 assert.equal(calls.filter(u=>u.includes('/Alafasy_128kbps/')).length,2);
 d.clear();
});
