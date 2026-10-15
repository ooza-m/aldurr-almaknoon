const CACHE='durr-v79';
const STATIC=[
  './manifest.json','./icon.png','./icon-180.png',
  './data/mushaf-data.json','./data/mushaf-search.json',
  './data/mushaf-mutashabihat.json','./data/surah-frame.svg'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(STATIC)).catch(()=>{}).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('durr-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  const isHTML=event.request.mode==='navigate'||url.pathname.endsWith('.html')||url.pathname.endsWith('/');
  const isRuntimeConfig=url.pathname.endsWith('/config.js')||url.pathname.endsWith('config.js');

  if(isRuntimeConfig){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(resp=>resp)
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  if(isHTML){
    // مهم: الشبكة أولًا حتى لا تبقى index/mushaf قديمة محبوسة في Safari.
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(resp=>{
          if(resp&&resp.ok){
            const copy=resp.clone();
            caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});
          }
          return resp;
        })
        .catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }

  // الملفات الثابتة: كاش أولًا مع تحديث هادئ من الشبكة.
  event.respondWith(
    caches.match(event.request).then(cached=>{
      const fresh=fetch(event.request).then(resp=>{
        if(resp&&resp.ok){
          const copy=resp.clone();
          caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});
        }
        return resp;
      }).catch(()=>cached);
      return cached||fresh;
    })
  );
});
