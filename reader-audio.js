/* Download before playback. Chapter audio and its own timestamps stay together. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./reader-core.js'):root.DurrReader);if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrAudio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  const CHAPTER_READERS={alafasy:[7,'mishari_al_afasy'],husary:[6,'khalil_al_husary'],minshawi:[9,'siddiq_minshawi'],abdulbasit:[2,'abdul_baset'],sudais:[3,'abdurrahmaan_as_sudais'],shatri:[4,'abu_bakr_shatri']};
  class AudioDownloads{
    constructor({fetcher,createUrl,revokeUrl}={}){this.fetcher=fetcher||fetch;this.createUrl=createUrl||URL.createObjectURL.bind(URL);this.revokeUrl=revokeUrl||URL.revokeObjectURL.bind(URL);this.urls=[];this.controller=null;this.key='';this.plan=null;}
    clear(){this.controller?.abort();this.controller=null;this.urls.forEach(url=>this.revokeUrl(url));this.urls=[];this.plan=null;this.key='';}
    async prepare(verses,reciter,onProgress=()=>{}){
      const key=reciter+'|'+verses.join(',');if(this.key===key&&this.plan)return this.plan;
      this.clear();const controller=new AbortController();this.controller=controller;
      const urls=[],signal=controller.signal;let bytes=0,done=0,lastProgress=0;
      const timeout=setTimeout(()=>controller.abort(),180000),progress=data=>{const now=Date.now();if(!signal.aborted&&(now-lastProgress>=100||data.loaded>=data.total)){lastProgress=now;onProgress({files:done,bytes,...data});}};
      const download=async(url,label)=>{
        const r=await this.fetcher(url,{signal});if(!r.ok)throw Error('Audio HTTP '+r.status);
        const total=Number(r.headers?.get('content-length'))||0;if(total>180*1024*1024)throw Error('Audio file too large');
        const parts=[];let loaded=0;
        if(r.body?.getReader){const reader=r.body.getReader();for(;;){const {done:ended,value}=await reader.read();if(ended)break;loaded+=value.length;bytes+=value.length;if(bytes>220*1024*1024)throw Error('Audio range too large');parts.push(value);progress({label,loaded,total});}}
        else{const data=await r.arrayBuffer();loaded=data.byteLength;bytes+=loaded;if(bytes>220*1024*1024)throw Error('Audio range too large');parts.push(data);}
        if(!loaded||signal.aborted)throw Error('Empty or cancelled audio');
        const src=this.createUrl(new Blob(parts,{type:'audio/mpeg'}));urls.push(src);done++;progress({label,loaded,total:total||loaded});return src;
      };
      try{
        const plan=new Map(),chapters=[...new Set(verses.map(v=>v.split(':')[0]))];
        for(const chapter of chapters){
          const keys=verses.filter(v=>v.startsWith(chapter+':')),mapping=CHAPTER_READERS[reciter];let file=null;
          if(mapping){try{
            const r=await this.fetcher('https://api.quran.com/api/v4/chapter_recitations/'+mapping[0]+'/'+chapter+'?segments=true',{signal});
            if(r.ok){const j=await r.json(),candidate=j.audio_file,u=new URL(candidate?.audio_url||'');
              const times=new Map((candidate?.timestamps||[]).map(t=>[t.verse_key,t]));
              if(+candidate.chapter_id===+chapter&&u.protocol==='https:'&&u.hostname==='download.quranicaudio.com'&&u.pathname.startsWith('/qdc/'+mapping[1]+'/murattal/')&&keys.every(k=>{const t=times.get(k);return t&&Number.isFinite(t.timestamp_from)&&Number.isFinite(t.timestamp_to)&&t.timestamp_from>=0&&t.timestamp_to>t.timestamp_from;}))file={url:u.href,times};
            }
          }catch(error){if(signal.aborted)throw error;}}
          if(file){
            const src=await download(file.url,'سورة '+chapter);
            keys.forEach(k=>{const t=file.times.get(k);plan.set(k,{src,from:t.timestamp_from/1000,to:t.timestamp_to/1000,chapter:true});});
          }else{
            // Missing chapter recordings/timings: download the entire selected range first.
            let cursor=0;
            await Promise.all(Array.from({length:Math.min(4,keys.length)},async()=>{while(cursor<keys.length){const k=keys[cursor++],src=await download(core.audioUrl(k,reciter),k);plan.set(k,{src,from:0,to:null,chapter:false});}}));
          }
        }
        if(signal.aborted||this.controller!==controller)throw Error('Cancelled audio preparation');
        this.urls=urls;this.plan=plan;this.key=key;return plan;
      }catch(error){controller.abort();urls.forEach(url=>this.revokeUrl(url));throw error;}
      finally{clearTimeout(timeout);}
    }
  }
  class BufferedPlayer extends core.AudioPlayer{
    constructor(options={}){super(options);this.downloads=options.downloads||new AudioDownloads();this.plan=null;this.boundary=null;this.download=null;this.coverage=new Map();this.lastClock=null;}
    snapshot(){const state=super.snapshot(),s=this.plan?.get(state.key);if(s&&s.to!=null){state.current=Math.max(0,state.current-s.from);state.duration=s.to-s.from;state.progress=(state.index+Math.min(1,state.current/state.duration))/state.queue.length;}return {...state,download:this.download,preloaded:!!this.plan};}
    async start({verses,scope='verse',page=0,autoplay=true,startIndex=0}={}){
      if(!Array.isArray(verses)||!verses.length||!verses.every(core.validVerse))throw Error('Invalid audio range');
      this.halt();const token=++this.generation;this.queue=[...new Set(verses)];this.scope=scope;this.page=page;this.completed.clear();this.coverage.clear();this.index=0;this.plan=null;
      if(this.queue.length===1){this.downloads.clear();this.download=null;return super.playIndex(0,{autoplay});}
      this.status='loading';this.download={label:'التلاوة',files:0,bytes:0,loaded:0,total:0};this.emit();
      try{
        const plan=await this.downloads.prepare(this.queue,this.reciter,d=>{if(token===this.generation){this.download=d;this.emit();}});
        if(token!==this.generation)return;this.plan=plan;this.download=null;return this.playIndex(Math.min(startIndex,this.queue.length-1),{autoplay});
      }catch(error){if(token!==this.generation)return;this.status='error';this.download=null;this.emit();this.onError('لم يكتمل تنزيل التلاوة. تحققي من الاتصال واضغطي تشغيل للمحاولة مجددًا.');}
    }
    halt(){clearTimeout(this.boundary);this.boundary=null;this.lastClock=null;if(this.audio){this.audio.onloadedmetadata=this.audio.onended=this.audio.onpause=this.audio.ontimeupdate=this.audio.onplaying=this.audio.onerror=null;this.audio.pause();}}
    async playIndex(index,{autoplay=true}={}){
      if(!this.plan)return super.playIndex(index,{autoplay});
      if(index<0)return;if(index>=this.queue.length)return this.finish();
      this.halt();const token=++this.generation,a=this.audio||(this.audio=this.audioFactory()),segment=this.plan.get(this.queue[index]);
      this.index=index;this.status='loading';this.emit();
      try{
        await this.onVerse(this.queue[index],this.snapshot());if(token!==this.generation)return;
        if(a.src!==segment.src){a.src=segment.src;a.preload='auto';}
        const seek=()=>{if(token===this.generation)a.currentTime=segment.from;};
        a.onloadedmetadata=seek;if(a.readyState>=1||typeof a.readyState!=='number')seek();a.playbackRate=this.rate;a.preservesPitch=true;if('webkitPreservesPitch' in a)a.webkitPreservesPitch=true;
        a.onplaying=()=>{if(token===this.generation){this.status='playing';this.lastClock={at:Date.now(),time:a.currentTime};this.emit();this.schedule(token);}};
        a.onpause=()=>{if(token===this.generation&&this.status==='playing'){clearTimeout(this.boundary);this.status='paused';this.lastClock=null;this.emit();}};
        a.onerror=()=>{if(token===this.generation){this.halt();this.status='error';this.emit();this.onError('تعذّر تشغيل الملف المحمّل. حاولي مجددًا.');}};
        a.ontimeupdate=()=>this.clock(token);
        a.onended=()=>{if(token!==this.generation)return;this.clock(token,true);};
        if(!autoplay){this.status='paused';this.emit();return;}
        await a.play();if(token===this.generation){this.status='playing';this.emit();this.schedule(token);}
      }catch(error){if(token!==this.generation)return;this.status='paused';this.emit();this.onError(error?.name==='NotAllowedError'?'اكتمل التحميل. اضغطي تشغيل للسماح بالصوت.':'تعذّر التشغيل. اضغطي تشغيل للمحاولة مجددًا.');}
    }
    schedule(token){clearTimeout(this.boundary);const s=this.plan?.get(this.queue[this.index]);if(s?.to!=null&&this.status==='playing')this.boundary=setTimeout(()=>this.clock(token),Math.max(40,(s.to-this.audio.currentTime)*1000/this.rate));}
    clock(token,ended=false){
      if(token!==this.generation||!this.plan||!this.queue.length)return;
      const now=Date.now(),t=this.audio.currentTime,last=this.lastClock;this.lastClock={at:now,time:t};
      if(last&&t>=last.time&&t-last.time<=Math.max(1.5,(now-last.at)/1000*this.rate+.8)){
        for(const key of this.queue){const s=this.plan.get(key);if(s.src!==this.audio.src)continue;const end=s.to??this.audio.duration,overlap=Math.max(0,Math.min(t,end)-Math.max(last.time,s.from));if(overlap)this.coverage.set(key,(this.coverage.get(key)||0)+overlap);}
      }
      let segment=this.plan.get(this.queue[this.index]);
      while((segment.to!=null&&t>=segment.to-.015)||ended){
        const key=this.queue[this.index],duration=(segment.to??this.audio.duration)-segment.from;
        if(duration>0&&(this.coverage.get(key)||0)>=duration*.95)this.completed.add(key);
        const next=this.index+1;if(next>=this.queue.length){this.finish();return;}
        const upcoming=this.plan.get(this.queue[next]);
        if(!ended&&upcoming.src===segment.src&&+this.queue[next].split(':')[1]===+key.split(':')[1]+1){
          this.index=next;const snapshot=this.snapshot();Promise.resolve(this.onVerse(this.queue[next],snapshot)).catch(()=>{});segment=upcoming;
        }else{this.playIndex(next);return;}
      }
      this.emit();this.schedule(token);
    }
    async toggle(){if(this.status==='error')return this.start({verses:this.queue,scope:this.scope,page:this.page});await super.toggle();if(this.plan&&this.status==='playing')this.schedule(this.generation);}
    setRate(value){super.setRate(value);if(this.plan)this.schedule(this.generation);}
    async setReciter(id){if(!core.RECITERS.some(r=>r.id===id)||id===this.reciter)return;const playing=this.status==='playing',queue=this.queue.slice(),scope=this.scope,page=this.page,startIndex=this.index;this.reciter=id;if(!queue.length){this.emit();return;}await this.start({verses:queue,scope,page,autoplay:playing,startIndex});}
    finish(){clearTimeout(this.boundary);super.finish();}
    stop(){this.halt();super.stop();this.downloads.clear();this.plan=null;this.download=null;this.coverage.clear();}
  }
  return {AudioDownloads,BufferedPlayer,CHAPTER_READERS};
});
