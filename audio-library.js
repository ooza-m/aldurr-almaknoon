/* Complete recordings only. Cache names intentionally survive static SW upgrades. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DurrAudioLibrary=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const CACHE='quran-offline-audio-v1',PREFIX='https://quran-offline.invalid/';
 class Library{
   constructor({cacheStorage=typeof caches!=='undefined'?caches:null}={}){this.caches=cacheStorage;this.memory=new Map();}
   key(reciter,chapter){if(!/^[a-z]+$/.test(reciter)||!Number.isInteger(+chapter)||+chapter<1||+chapter>114)throw Error('Invalid recording key');return reciter+'/'+chapter;}
   async get(reciter,chapter){const key=this.key(reciter,chapter);if(this.memory.has(key))return this.memory.get(key);if(!this.caches)return null;
     try{const cache=await this.caches.open(CACHE),response=await cache.match(PREFIX+key+'/meta');if(!response)return null;const meta=await response.json();
       if(meta.kind==='ayahs'){const blobs=[];for(const vk of meta.ayahs){const audio=await cache.match(PREFIX+key+'/ayah/'+vk.split(':')[1]);if(!audio)return null;blobs.push({vk,blob:await audio.blob()});}if(blobs.reduce((n,b)=>n+b.blob.size,0)!==meta.bytes)return null;return {...meta,blobs};}
       const audio=await cache.match(PREFIX+key+'/audio');if(!audio)return null;const blob=await audio.blob();if(!blob.size||blob.size!==meta.bytes)return null;return {...meta,blob};}catch(_){return null;}
   }
   async put(reciter,chapter,record){const key=this.key(reciter,chapter),bytes=record.blobs?record.blobs.reduce((n,b)=>n+b.blob.size,0):record.blob.size,meta={reciter,chapter:+chapter,url:record.url||'',times:record.times||[],ayahs:record.blobs?.map(b=>b.vk)||[],bytes,downloadedAt:Date.now(),kind:record.blobs?'ayahs':'chapter'};
     if(!bytes)throw Error('Empty recording');if(!this.caches){this.memory.set(key,{...meta,blob:record.blob,blobs:record.blobs});return {...meta,persistent:false};}
     const cache=await this.caches.open(CACHE);try{if(record.blobs){for(const b of record.blobs)await cache.put(PREFIX+key+'/ayah/'+b.vk.split(':')[1],new Response(b.blob));}else await cache.put(PREFIX+key+'/audio',new Response(record.blob,{headers:{'Content-Type':'audio/mpeg'}}));await cache.put(PREFIX+key+'/meta',new Response(JSON.stringify(meta),{headers:{'Content-Type':'application/json'}}));return {...meta,persistent:true};}catch(error){await this.remove(reciter,chapter);throw error;}
   }
   async list(reciter){const entries=[];for(const [key,value] of this.memory)if(!reciter||key.startsWith(reciter+'/'))entries.push({...value,blob:undefined});if(!this.caches)return entries;
     try{const cache=await this.caches.open(CACHE);for(const request of await cache.keys()){if(!request.url.endsWith('/meta'))continue;const response=await cache.match(request),meta=await response.json();if(!reciter||meta.reciter===reciter)entries.push(meta);}}catch(_){}return entries;
   }
   async remove(reciter,chapter){const key=this.key(reciter,chapter);this.memory.delete(key);if(this.caches){const cache=await this.caches.open(CACHE);for(const request of await cache.keys())if(request.url.startsWith(PREFIX+key+'/'))await cache.delete(request);}}
 }
 return {Library,CACHE};
});
