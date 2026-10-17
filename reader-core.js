/* Quran page layout is deliberately outside this module. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrReader=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RECITERS=Object.freeze([
    {id:'alafasy',name:'مشاري راشد العفاسي',directory:'Alafasy_128kbps'},
    {id:'husary',name:'محمود خليل الحصري',directory:'Husary_128kbps'},
    {id:'minshawi',name:'محمد صديق المنشاوي',directory:'Minshawy_Murattal_128kbps'},
    {id:'abdulbasit',name:'عبد الباسط عبد الصمد',directory:'Abdul_Basit_Murattal_192kbps'},
    {id:'hudhaify',name:'علي الحذيفي',directory:'Hudhaify_128kbps'},
    {id:'maher',name:'ماهر المعيقلي',directory:'MaherAlMuaiqly128kbps'},
    {id:'sudais',name:'عبد الرحمن السديس',directory:'Abdurrahmaan_As-Sudais_192kbps'},
    {id:'shatri',name:'أبو بكر الشاطري',directory:'Abu_Bakr_Ash-Shaatree_128kbps'}
  ]);
  const RATES=Object.freeze([.5,.75,1,1.25,1.5,2]);
  const BOOKS=Object.freeze({saadi:{id:91,name:'تفسير السعدي'},muyassar:{id:16,name:'التفسير الميسّر'}});
  const validVerse=key=>/^(?:[1-9]|[1-9]\d|10\d|11[0-4]):[1-9]\d{0,2}$/.test(String(key));
  function audioUrl(key,reader){
    if(!validVerse(key))throw new Error('Invalid verse');
    const reciter=RECITERS.find(r=>r.id===reader);if(!reciter)throw new Error('Unknown reciter');
    const [s,a]=key.split(':');return 'https://everyayah.com/data/'+reciter.directory+'/'+s.padStart(3,'0')+a.padStart(3,'0')+'.mp3';
  }
  class TafsirStore{
    constructor({fetcher,storage,toText}={}){this.fetcher=fetcher||globalThis.fetch.bind(globalThis);this.storage=storage;this.toText=toText||String;this.inflight=new Map();this.cache={};this.key='durr-tafsir-cache-v81';
      try{const data=JSON.parse(storage&&storage.getItem(this.key)||'{}');if(data.version===1&&data.entries)this.cache=data.entries;}catch(_){}
    }
    async get(key,book){
      if(!validVerse(key)||!BOOKS[book])throw new Error('Invalid tafsir selection');
      const cacheKey=book+'|'+key,entry=this.cache[cacheKey];
      if(entry&&entry.source===BOOKS[book].id&&typeof entry.text==='string'&&entry.text.trim())return entry.text;
      if(this.inflight.has(cacheKey))return this.inflight.get(cacheKey);
      const task=(async()=>{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
        try{
          const response=await this.fetcher('https://api.quran.com/api/v4/tafsirs/'+BOOKS[book].id+'/by_ayah/'+key,{headers:{Accept:'application/json'},signal:controller.signal});
          if(!response.ok)throw new Error('Tafsir HTTP '+response.status);
          const json=await response.json(),data=json&&json.tafsir;
          if(!data||!data.text||(data.resource_id!=null&&+data.resource_id!==BOOKS[book].id))throw new Error('Wrong or empty tafsir source');
          const text=this.toText(data.text);if(!text.trim())throw new Error('Empty tafsir');
          this.cache[cacheKey]={source:BOOKS[book].id,text};
          const keys=Object.keys(this.cache);while(keys.length>350)delete this.cache[keys.shift()];
          try{this.storage&&this.storage.setItem(this.key,JSON.stringify({version:1,entries:this.cache}));}catch(_){}
          return text;
        }finally{clearTimeout(timer);}
      })();this.inflight.set(cacheKey,task);
      try{return await task;}finally{this.inflight.delete(cacheKey);}
    }
  }
  class AudioPlayer{
    constructor({audioFactory,onChange,onVerse,onComplete,onError,reciter='alafasy',rate=1}={}){
      this.audioFactory=audioFactory||(()=>new Audio());this.onChange=onChange||(()=>{});this.onVerse=onVerse||(()=>{});this.onComplete=onComplete||(()=>{});this.onError=onError||(()=>{});
      this.reciter=RECITERS.some(r=>r.id===reciter)?reciter:'alafasy';this.rate=RATES.includes(+rate)?+rate:1;
      this.queue=[];this.index=0;this.status='idle';this.generation=0;this.completed=new Set();this.audio=null;this.scope='verse';this.page=0;
    }
    snapshot(){const a=this.audio,duration=Number(a&&a.duration)||0,current=Number(a&&a.currentTime)||0;return {generation:this.generation,queue:this.queue.slice(),index:this.index,key:this.queue[this.index]||'',status:this.status,reciter:this.reciter,rate:this.rate,scope:this.scope,page:this.page,current,duration,progress:this.queue.length?(this.index+(duration>0?Math.min(1,current/duration):0))/this.queue.length:0};}
    emit(){this.onChange(this.snapshot());}
    async start({verses,scope='verse',page=0}={}){
      if(!Array.isArray(verses)||!verses.length||!verses.every(validVerse))throw new Error('Empty or invalid audio range');
      this.generation++;if(this.audio)this.audio.pause();this.queue=[...new Set(verses)];this.scope=scope;this.page=page;this.completed.clear();
      await this.playIndex(0);
    }
    async playIndex(index,{autoplay=true}={}){
      if(index<0)return;if(index>=this.queue.length){this.finish();return;}
      const token=++this.generation;if(!this.audio)this.audio=this.audioFactory();const audio=this.audio;
      audio.onended=audio.onerror=audio.onpause=audio.ontimeupdate=audio.onplaying=null;audio.pause();
      this.index=index;this.status='loading';this.emit();
      try{
        await this.onVerse(this.queue[index],this.snapshot());if(token!==this.generation)return;
        audio.src=audioUrl(this.queue[index],this.reciter);audio.preload='auto';audio.playbackRate=this.rate;audio.preservesPitch=true;
        if('webkitPreservesPitch' in audio)audio.webkitPreservesPitch=true;
        audio.onended=()=>{if(token!==this.generation)return;this.completed.add(this.queue[index]);this.playIndex(index+1);};
        audio.onerror=()=>{if(token!==this.generation)return;this.status='error';this.emit();this.onError('تعذّر تحميل التلاوة. حاولي مجددًا أو اختاري قارئًا آخر.');};
        audio.ontimeupdate=()=>{if(token===this.generation)this.emit();};
        audio.onplaying=()=>{if(token===this.generation){this.status='playing';this.emit();}};
        audio.onpause=()=>{if(token===this.generation&&this.status==='playing'){this.status='paused';this.emit();}};
        if(!autoplay){this.status='paused';this.emit();return;}
        await audio.play();if(token===this.generation){this.status='playing';this.emit();}
      }catch(error){if(token!==this.generation)return;this.status='paused';this.emit();this.onError(error&&error.name==='NotAllowedError'?'اضغطي تشغيل للسماح بالصوت.':'تعذّر تشغيل التلاوة. اضغطي تشغيل للمحاولة مجددًا.');}
    }
    async toggle(){if(!this.queue.length||this.status==='loading')return;if(this.status==='playing'){this.audio.pause();this.status='paused';this.emit();return;}if(this.status==='ended')return this.start({verses:this.queue,scope:this.scope,page:this.page});
      if(this.status==='error')return this.playIndex(this.index);const token=this.generation;
      try{await this.audio.play();if(token===this.generation){this.status='playing';this.emit();}}catch(_){this.onError('تعذّر تشغيل الصوت. حاولي مجددًا.');}
    }
    next(){return this.playIndex(this.index+1);}
    previous(){return this.playIndex(Math.max(0,this.index-1));}
    setRate(value){if(!RATES.includes(+value))return;this.rate=+value;if(this.audio)this.audio.playbackRate=this.rate;this.emit();}
    async setReciter(id){if(!RECITERS.some(r=>r.id===id)||id===this.reciter)return;const autoplay=this.status==='playing';this.reciter=id;this.completed.clear();if(this.queue.length&&this.status!=='idle')await this.playIndex(this.index,{autoplay});else this.emit();}
    finish(){if(this.status==='ended'||!this.queue.length)return;this.generation++;if(this.audio){this.audio.onended=this.audio.onpause=null;this.audio.pause();}const full=this.queue.every(key=>this.completed.has(key));this.completed.clear();this.status='ended';this.emit();this.onComplete({...this.snapshot(),fullyPlayed:full});}
    stop(){this.generation++;if(this.audio){this.audio.onended=this.audio.onerror=this.audio.ontimeupdate=this.audio.onplaying=null;this.audio.pause();this.audio.removeAttribute&&this.audio.removeAttribute('src');this.audio.load&&this.audio.load();}this.queue=[];this.completed.clear();this.status='idle';this.emit();}
  }
  return {RECITERS,RATES,BOOKS,audioUrl,validVerse,TafsirStore,AudioPlayer};
});
