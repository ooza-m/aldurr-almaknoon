/* Download before playback. Chapter audio and its own timestamps stay together. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./reader-core.js'):root.DurrReader,typeof module==='object'&&module.exports?require('./audio-library.js'):root.DurrAudioLibrary);if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrAudio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(core,libraryApi){
  'use strict';
  const CHAPTER_READERS={alafasy:[7,'mishari_al_afasy'],husary:[6,'khalil_al_husary'],minshawi:[9,'siddiq_minshawi'],abdulbasit:[2,'abdul_baset'],sudais:[3,'abdurrahmaan_as_sudais'],shatri:[4,'abu_bakr_shatri']};

  function bounded(work,ms,signal,onTimeout=()=>{}){
    return new Promise((resolve,reject)=>{let timer;const abort=()=>done(new Error('Audio cancelled'));const done=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
      if(signal?.aborted){reject(new Error('Audio cancelled'));return;}signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{onTimeout();done(new Error('Audio request timed out'));},ms);Promise.resolve(work).then(v=>done(null,v),done);
    });
  }
  class AudioDownloads{
    constructor({fetcher,createUrl,revokeUrl,library,requestTimeout=15000,stallTimeout=20000}={}){this.fetcher=fetcher||globalThis.fetch.bind(globalThis);this.createUrl=createUrl||URL.createObjectURL.bind(URL);this.revokeUrl=revokeUrl||URL.revokeObjectURL.bind(URL);this.library=library||new libraryApi.Library();this.requestTimeout=requestTimeout;this.stallTimeout=stallTimeout;this.urls=[];this.controller=null;this.key='';this.plan=null;this.records=new Map();}
    clear(){this.controller?.abort();this.controller=null;this.urls.forEach(url=>this.revokeUrl(url));this.urls=[];this.plan=null;this.key='';this.records.clear();}
    async request(url,signal,json=false,onProgress=()=>{}){
      const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
      try{
        const response=await bounded(this.fetcher(url,{signal:controller.signal}),this.requestTimeout,signal,abort);if(!response.ok)throw Error('Audio HTTP '+response.status);
        if(json)return await bounded(response.json(),this.requestTimeout,signal,abort);
        const total=Number(response.headers?.get('content-length'))||0;if(total>180*1024*1024)throw Error('Audio too large');let loaded=0;const chunks=[];
        if(response.body?.getReader){const reader=response.body.getReader();try{for(;;){const item=await bounded(reader.read(),this.stallTimeout,signal,abort);if(item.done)break;loaded+=item.value.byteLength;if(loaded>180*1024*1024)throw Error('Audio too large');chunks.push(item.value);onProgress(loaded,total);}}catch(error){reader.cancel().catch(()=>{});throw error;}}
        else{const bytes=await bounded(response.arrayBuffer(),this.stallTimeout,signal,abort);loaded=bytes.byteLength;chunks.push(bytes);onProgress(loaded,total);}
        if(!loaded||signal.aborted)throw Error('Empty or cancelled audio');const type=response.headers?.get('content-type')||'audio/mpeg';if(/text|json|html/.test(type))throw Error('Not an audio recording');
        return new Blob(chunks,{type:'audio/mpeg'});
      }finally{controller.abort();signal.removeEventListener('abort',abort);}
    }
    async metadata(chapter,reciter,signal){
      const mapping=CHAPTER_READERS[reciter];if(!mapping)return null;let candidate=null;
      for(const host of ['https://api.quran.com','https://api.qurancdn.com']){
        try{const j=await this.request(host+'/api/v4/chapter_recitations/'+mapping[0]+'/'+chapter+'?segments=true',signal,true);candidate=j.audio_file;break;}catch(e){if(signal.aborted)throw e;}
      }
      if(!candidate)return null;const u=new URL(candidate.audio_url||'');
      if(+candidate.chapter_id!==+chapter||u.protocol!=='https:'||u.hostname!=='download.quranicaudio.com'||!u.pathname.startsWith('/qdc/'+mapping[1]+'/murattal/'))return null;
      const times=new Map((candidate.timestamps||[]).filter(t=>core.validVerse(t.verse_key)&&Number.isFinite(t.timestamp_from)&&Number.isFinite(t.timestamp_to)&&t.timestamp_from>=0&&t.timestamp_to>t.timestamp_from).map(t=>[t.verse_key,t]));
      return {url:u.href,times,bytes:+candidate.file_size||0};
    }
    async verseMetadata(key,reciter,signal){
      const mapping=CHAPTER_READERS[reciter];if(!mapping)return null;
      for(const host of ['https://api.quran.com','https://api.qurancdn.com'])try{const response=await this.request(host+'/api/v4/recitations/'+mapping[0]+'/by_ayah/'+key,signal,true),file=(response.audio_files||[]).find(f=>f.verse_key===key);if(!file?.url)return null;const url=new URL(file.url,'https://verses.quran.com/');if(url.protocol==='https:'&&['verses.quran.com','verses.quran.foundation'].includes(url.hostname)&&url.pathname.endsWith('.mp3'))return url.href;}catch(error){if(signal.aborted)throw error;}return null;
    }
    async prepare(verses,reciter,onProgress=()=>{}){
      const key=reciter+'|'+verses.join(',');if(this.key===key&&this.plan)return this.plan;
      this.clear();const controller=new AbortController();this.controller=controller;const signal=controller.signal,urls=[];let bytes=0,done=0,lastProgress=0;
      const progress=data=>{const now=Date.now();if(!signal.aborted&&(now-lastProgress>80||data.complete)){lastProgress=now;onProgress({files:done,bytes,...data});}};
      const objectUrl=blob=>{const src=this.createUrl(blob);urls.push(src);return src;};
      try{
        const plan=new Map(),chapters=[...new Set(verses.map(v=>v.split(':')[0]))];
        for(const chapter of chapters){
          const keys=verses.filter(v=>v.startsWith(chapter+':'));let cached=await this.library.get(reciter,chapter);if(signal.aborted)throw Error('Cancelled');
          if(cached?.kind==='chapter'&&keys.every(k=>cached.times.some(t=>t.verse_key===k))){const src=objectUrl(cached.blob);keys.forEach(k=>{const t=cached.times.find(t=>t.verse_key===k);plan.set(k,{src,from:t.timestamp_from/1000,to:t.timestamp_to/1000,chapter:true});});done++;continue;}
          if(cached?.kind==='ayahs'&&keys.every(k=>cached.blobs.some(b=>b.vk===k))){keys.forEach(k=>plan.set(k,{src:objectUrl(cached.blobs.find(b=>b.vk===k).blob),from:0,to:null,chapter:false}));done+=keys.length;continue;}
          if(verses.length===1){
            const key=keys[0],preferred=await this.verseMetadata(key,reciter,signal),sources=[preferred,core.audioUrl(key,reciter)].filter(Boolean);let blob;
            for(const url of sources)try{progress({label:key,loaded:0,total:0,phase:'download'});blob=await this.request(url,signal,false,(loaded,total)=>progress({label:key,loaded,total,phase:'download'}));break;}catch(error){if(signal.aborted||url===sources.at(-1))throw error;}
            plan.set(key,{src:objectUrl(blob),from:0,to:null,chapter:false});done++;continue;
          }
          let file=await this.metadata(chapter,reciter,signal);if(file&&!keys.every(k=>file.times.has(k)))file=null;
          if(file){
            progress({label:'سورة '+chapter,loaded:0,total:file.bytes,phase:'download'});
            const blob=await this.request(file.url,signal,false,(loaded,total)=>progress({label:'سورة '+chapter,loaded,total:total||file.bytes,phase:'download'}));
            bytes+=blob.size;if(bytes>220*1024*1024)throw Error('Audio range too large');const src=objectUrl(blob);done++;
            keys.forEach(k=>{const t=file.times.get(k);plan.set(k,{src,from:t.timestamp_from/1000,to:t.timestamp_to/1000,chapter:true});});
            const record={blob,url:file.url,times:[...file.times.values()].map(t=>({verse_key:t.verse_key,timestamp_from:t.timestamp_from,timestamp_to:t.timestamp_to}))};this.records.set(chapter,record);
            // A chapter file is already complete; keep it for later sessions when storage permits.
            try{await this.library.put(reciter,chapter,record);}catch(_){}progress({label:'سورة '+chapter,loaded:blob.size,total:blob.size,phase:'ready',complete:true});
          }else{
            const blobs=[];let cursor=0;
            await Promise.all(Array.from({length:Math.min(3,keys.length)},async()=>{while(cursor<keys.length){const k=keys[cursor++];progress({label:k,loaded:done,total:verses.length,phase:'ayahs'});
              const blob=await this.request(core.audioUrl(k,reciter),signal,false);bytes+=blob.size;if(bytes>220*1024*1024)throw Error('Audio range too large');blobs.push({vk:k,blob});plan.set(k,{src:objectUrl(blob),from:0,to:null,chapter:false});done++;progress({label:k,loaded:done,total:verses.length,phase:'ayahs',complete:true});}}));
            this.records.set(chapter,{blobs,url:'',kind:'ayahs'});
          }
        }
        if(signal.aborted||this.controller!==controller)throw Error('Cancelled audio preparation');this.urls=urls;this.plan=plan;this.key=key;return plan;
      }catch(error){controller.abort();urls.forEach(url=>this.revokeUrl(url));throw error;}
    }
    async downloadChapter(chapter,reciter,ayahCount,onProgress=()=>{}){
      const verses=Array.from({length:ayahCount},(_,i)=>chapter+':'+(i+1));await this.prepare(verses,reciter,onProgress);
      const record=this.records.get(String(chapter));if(record)return this.library.put(reciter,chapter,record);return this.library.get(reciter,chapter);
    }
  }
  class BufferedPlayer extends core.AudioPlayer{
    constructor(options={}){super(options);this.repeat=1;this.cycle=1;this.ayahRepeat=1;this.ayahCycle=1;this.gap=0;this.gapTimer=null;this.gapDeadline=0;this.gapRemaining=0;this.downloads=options.downloads||new AudioDownloads();this.plan=null;this.boundary=null;this.download=null;this.coverage=new Map();this.coverageRanges=new Map();this.lastClock=null;}
    snapshot(){const state=super.snapshot(),s=this.plan?.get(state.key);if(s&&s.to!=null){state.current=Math.max(0,state.current-s.from);state.duration=s.to-s.from;state.progress=(state.index+Math.min(1,state.current/state.duration))/state.queue.length;}return {...state,download:this.download,preloaded:!!this.plan,repeat:this.repeat,cycle:this.cycle,ayahRepeat:this.ayahRepeat,ayahCycle:this.ayahCycle,gap:this.gap,gapRemaining:this.status==='waiting'?Math.max(0,(this.gapDeadline-Date.now())/1000):this.gapRemaining/1000};}
    async start({verses,scope='verse',page=0,autoplay=true,startIndex=0}={}){
      if(!Array.isArray(verses)||!verses.length||!verses.every(core.validVerse))throw Error('Invalid audio range');
      this.halt();const token=++this.generation;this.queue=[...new Set(verses)];this.scope=scope;this.page=page;this.completed.clear();this.coverage.clear();this.coverageRanges.clear();this.cycle=1;this.index=0;this.plan=null;
      this.status='loading';this.download={label:'التلاوة',files:0,bytes:0,loaded:0,total:0};this.emit();
      try{
        const plan=await this.downloads.prepare(this.queue,this.reciter,d=>{if(token===this.generation){this.download=d;this.emit();}});
        if(token!==this.generation)return;this.plan=plan;this.download=null;return this.playIndex(Math.min(startIndex,this.queue.length-1),{autoplay});
      }catch(error){if(token!==this.generation)return;this.status='error';this.download=null;console.warn('Audio preparation failed',error);this.emit();this.onError('لم يكتمل تنزيل التلاوة. تحققي من الاتصال واضغطي تشغيل للمحاولة مجددًا.');}
    }
    halt(){clearTimeout(this.gapTimer);this.gapTimer=null;this.gapRemaining=0;this.gapDeadline=0;clearTimeout(this.boundary);this.boundary=null;this.lastClock=null;if(this.audio){this.audio.onloadedmetadata=this.audio.onended=this.audio.onpause=this.audio.ontimeupdate=this.audio.onplaying=this.audio.onerror=null;this.audio.pause();}}
    async playIndex(index,{autoplay=true,keepAyahCycle=false}={}){
      if(!this.plan)return super.playIndex(index,{autoplay});
      if(index<0)return;if(index>=this.queue.length)return this.finish();
      this.halt();const token=++this.generation,a=this.audio||(this.audio=this.audioFactory()),segment=this.plan.get(this.queue[index]);
      this.index=index;if(!keepAyahCycle)this.ayahCycle=1;this.status='loading';this.emit();
      try{
        Promise.resolve(this.onVerse(this.queue[index],this.snapshot())).catch(()=>{});if(token!==this.generation)return;
        if(a.src!==segment.src){a.src=segment.src;a.preload='auto';}
        const seek=()=>{if(token===this.generation)a.currentTime=segment.from;};
        a.onloadedmetadata=seek;if(a.readyState>=1||typeof a.readyState!=='number')seek();a.playbackRate=this.rate;a.preservesPitch=true;if('webkitPreservesPitch' in a)a.webkitPreservesPitch=true;
        a.onplaying=()=>{if(token===this.generation){this.status='playing';this.lastClock={at:Date.now(),time:a.currentTime};this.emit();this.schedule(token);}};
        a.onpause=()=>{if(token===this.generation&&this.status==='playing'){clearTimeout(this.boundary);this.status='paused';this.lastClock=null;this.emit();}};
        a.onerror=()=>{if(token===this.generation){this.halt();this.status='error';this.emit();this.onError('تعذّر تشغيل الملف المحمّل. حاولي مجددًا.');}};
        a.ontimeupdate=()=>this.clock(token);
        a.onended=()=>{if(token!==this.generation)return;this.clock(token,true);};
        if(!autoplay){this.status='paused';this.emit();return;}
        await bounded(a.play(),12000,null,()=>a.pause());if(token===this.generation){this.status='playing';this.emit();this.schedule(token);}
      }catch(error){if(token!==this.generation)return;this.status='paused';this.emit();this.onError(error?.name==='NotAllowedError'?'اكتمل التحميل. اضغطي تشغيل للسماح بالصوت.':'تعذّر التشغيل. اضغطي تشغيل للمحاولة مجددًا.');}
    }
    schedule(token){clearTimeout(this.boundary);const s=this.plan?.get(this.queue[this.index]);if(s?.to!=null&&this.status==='playing')this.boundary=setTimeout(()=>this.clock(token),Math.max(40,(s.to-this.audio.currentTime)*1000/this.rate));}
    clock(token,ended=false){
      if(token!==this.generation||!this.plan||!this.queue.length)return;
      const now=Date.now(),t=this.audio.currentTime,last=this.lastClock;this.lastClock={at:now,time:t};
      if(last&&t>=last.time&&t-last.time<=Math.max(1.5,(now-last.at)/1000*this.rate+.8)){
        for(const key of this.queue){const s=this.plan.get(key);if(s.src!==this.audio.src)continue;const end=s.to??this.audio.duration,overlap=Math.max(0,Math.min(t,end)-Math.max(last.time,s.from));if(overlap){const ranges=[...(this.coverageRanges.get(key)||[]),[Math.max(last.time,s.from),Math.min(t,end)]].sort((a,b)=>a[0]-b[0]),merged=[];for(const range of ranges){const previous=merged.at(-1);if(previous&&range[0]<=previous[1])previous[1]=Math.max(previous[1],range[1]);else merged.push(range.slice());}this.coverageRanges.set(key,merged);this.coverage.set(key,merged.reduce((n,r)=>n+r[1]-r[0],0));}}
      }
      let segment=this.plan.get(this.queue[this.index]);
      while((segment.to!=null&&t>=segment.to-.015)||ended){
        const key=this.queue[this.index],duration=(segment.to??this.audio.duration)-segment.from;
        if(duration>0&&(this.coverage.get(key)||0)>=duration*.95)this.completed.add(key);
        if(this.ayahRepeat===0||this.ayahCycle<this.ayahRepeat){this.ayahCycle++;if(this.gap)this.waitForRepeat(this.gap*1000,this.index,true);else this.playIndex(this.index,{keepAyahCycle:true});return;}
        const next=this.index+1;if(next>=this.queue.length){this.finish();return;}
        const upcoming=this.plan.get(this.queue[next]);
        if(!ended&&upcoming.src===segment.src&&+this.queue[next].split(':')[1]===+key.split(':')[1]+1){
          this.index=next;this.ayahCycle=1;const snapshot=this.snapshot();Promise.resolve(this.onVerse(this.queue[next],snapshot)).catch(()=>{});segment=upcoming;
        }else{this.playIndex(next);return;}
      }
      this.emit();this.schedule(token);
    }
    async toggle(){if(this.status==='waiting'){this.gapRemaining=Math.max(0,this.gapDeadline-Date.now());clearTimeout(this.gapTimer);this.gapTimer=null;this.status='wait-paused';this.emit();return;}if(this.status==='wait-paused'){this.waitForRepeat(this.gapRemaining,this.gapTarget,this.gapKeepAyah);return;}if(this.status==='error')return this.start({verses:this.queue,scope:this.scope,page:this.page});await super.toggle();if(this.plan&&this.status==='playing')this.schedule(this.generation);}
    setRate(value){super.setRate(value);if(this.plan)this.schedule(this.generation);}
    async setReciter(id){if(!core.RECITERS.some(r=>r.id===id)||id===this.reciter)return;const playing=this.status==='playing',queue=this.queue.slice(),scope=this.scope,page=this.page,startIndex=this.index;this.reciter=id;if(!queue.length){this.emit();return;}await this.start({verses:queue,scope,page,autoplay:playing,startIndex});}
    setAyahRepeat(count){if([1,2,3,5,10,0].includes(+count)){this.ayahRepeat=+count;this.ayahCycle=1;this.emit();}}
    setGap(seconds){if([0,3,5,10,15,30].includes(+seconds)){this.gap=+seconds;this.emit();}}
    waitForRepeat(ms,index=0,keepAyahCycle=false){
      this.halt();const token=++this.generation;this.status='waiting';this.gapRemaining=ms;this.gapDeadline=Date.now()+ms;this.gapTarget=index;this.gapKeepAyah=keepAyahCycle;
      const tick=()=>{if(token!==this.generation||this.status!=='waiting')return;this.gapRemaining=Math.max(0,this.gapDeadline-Date.now());if(!this.gapRemaining){this.gapTimer=null;this.playIndex(index,{keepAyahCycle});return;}this.emit();this.gapTimer=setTimeout(tick,Math.min(250,this.gapRemaining));};tick();
    }
    setRepeat(count){if([1,2,3,5,10,0].includes(+count)){this.repeat=+count;this.cycle=1;this.emit();}}
    seek(fraction){if(['waiting','wait-paused'].includes(this.status)||!this.audio||!this.plan)return;const s=this.plan.get(this.queue[this.index]),duration=(s.to??this.audio.duration)-s.from;if(!(duration>0))return;this.lastClock=null;this.audio.currentTime=s.from+Math.min(1,Math.max(0,+fraction))*duration;this.emit();this.schedule(this.generation);}
    finish(){clearTimeout(this.boundary);if(this.repeat===0||this.cycle<this.repeat){this.cycle++;if(this.gap)this.waitForRepeat(this.gap*1000);else this.playIndex(0);return;}this.halt();super.finish();}
    stop(){this.halt();super.stop();this.downloads.clear();this.plan=null;this.download=null;this.coverage.clear();this.coverageRanges.clear();}
  }
  return {AudioDownloads,BufferedPlayer,CHAPTER_READERS};
});
