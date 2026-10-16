/* DOM integration only: this does not replace visual/iOS device QA. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function boot(){
  const errors=[],requests=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(read('mushaf.html'),{url:'https://reader.test/mushaf.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;
  w.matchMedia=()=>({matches:true});w.FontFace=class{async load(){return this;}};
  Object.defineProperty(w.document,'fonts',{value:{add(){},load:async()=>[]}});
  w.requestAnimationFrame=fn=>{fn();return 0;};w.scrollTo=()=>{};
  const audio=[];w.Audio=class{
    constructor(){this.src='';this.duration=10;this.currentTime=0;audio.push(this);}
    async play(){this.paused=false;this.onplaying?.();}pause(){this.paused=true;this.onpause?.();}
    removeAttribute(){this.src='';}load(){}
  };
  const clipboard=[],shares=[],downloads=[];
  Object.defineProperty(w,'isSecureContext',{value:true});Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>clipboard.push(text)}});
  w.navigator.share=async data=>shares.push(data);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  w.fetch=async url=>{
    url=String(url);requests.push(url);
    if(url.includes('/chapter_recitations/')){const chapter=+url.match(/chapter_recitations\/\d+\/(\d+)/)[1];return {ok:true,json:async()=>({audio_file:{chapter_id:chapter,audio_url:'https://download.quranicaudio.com/qdc/khalil_al_husary/murattal/'+chapter+'.mp3',timestamps:Array.from({length:286},(_,i)=>({verse_key:chapter+':'+(i+1),timestamp_from:i*10000,timestamp_to:(i+1)*10000}))}})};}
    if(url.includes('download.quranicaudio.com')||url.includes('everyayah.com'))return {ok:true,arrayBuffer:async()=>new ArrayBuffer(16)};
    if(url.startsWith('data/'))return {ok:true,json:async()=>JSON.parse(read(url))};
    const match=url.match(/tafsirs\/(\d+)\/by_ayah\/([\d:]+)/);
    if(match)return {ok:true,json:async()=>({tafsir:{resource_id:+match[1],text:'<p>تفسير المصدر '+match[1]+' للآية '+match[2]+'</p><p>فقرة ثانية.</p>'}})};
    throw Error('Unexpected network request: '+url);
  };
  w.eval(read('reader-core.js'));w.eval(read('reader-audio.js'));
  for(const script of w.document.querySelectorAll('script:not([src])')){
    let code=script.textContent;
    if(code.includes('const REC_QUERY='))code+='\nwindow.readerTest={get player(){return audioController},get page(){return cur},get verse(){return playingVerse},settle,faceVerses,loadTafsir,maybeCompleteFaceTafsir};';
    w.eval(code);
  }
  for(let i=0;i<50&&w.document.getElementById('loading').style.display!=='none';i++)await tick();
  assert.equal(w.document.getElementById('loading').style.display,'none','reader booted');
  return {dom,w,errors,requests,audio,clipboard,shares,downloads,$:id=>w.document.getElementById(id)};
}
test('both navigation bars place Mushaf centrally and route calendar directly',()=>{
  for(const [file,selector,attr] of [['index.html','#bottomNav','tab'],['mushaf.html','#appBottomNav','appRoute']]){
    const dom=new JSDOM(read(file)),buttons=[...dom.window.document.querySelector(selector).children];
    assert.deepEqual(buttons.map(b=>b.dataset[attr]),['home','today','mushaf','calendar','more']);assert.ok(buttons[2].classList.contains('nav-mushaf'));dom.window.close();
  }
  const dom=new JSDOM(read('index.html'));assert.ok(dom.window.document.querySelector('#tab-more [data-v50-route=map]'));dom.window.close();
});
test('reader boots without missing/duplicate IDs or JavaScript errors',async t=>{
  const {dom,w,errors}=await boot();t.after(()=>dom.window.close());
  const ids=[...w.document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length);
  const missing=[...read('mushaf.html').matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]).filter(id=>!w.document.getElementById(id)&&!['errClr'].includes(id));assert.deepEqual([...new Set(missing)],[]);
  assert.deepEqual(errors,[]);assert.equal(w.document.getElementById('faceListenBar').parentElement.id,'screen');
});
test('face tafsir source buttons really change content and agree with the ayah sheet',async t=>{
  const {dom,w,$,requests}=await boot();t.after(()=>dom.window.close());
  $('readerTafsir').click();await tick();await tick();assert.match($('faceTafsirBody').textContent,/المصدر 91/);
  w.document.querySelector('[data-face-tf=muyassar]').click();await tick();await tick();assert.match($('faceTafsirBody').textContent,/المصدر 16/);assert.doesNotMatch($('faceTafsirBody').textContent,/المصدر 91/);
  assert.ok($('faceTafsirBody').querySelector('.tafsir-prose p'));
  $('faceTafsirClose').click();await w.openAyah('1:1');await tick();assert.match($('ayTafsirText').textContent,/المصدر 16/);
  const count=requests.filter(x=>x.includes('/tafsirs/16/by_ayah/1:1')).length;assert.equal(count,1,'shared cache');
  $('ayLib').click();await tick();assert.ok($('faceTafsirOv').classList.contains('open'));assert.match($('faceTafsirTitle').textContent,/الميسّر/);
});
test('listen settings, speed, persistent highlighting and next-page following are wired',async t=>{
  const {dom,w,$,audio}=await boot();t.after(()=>dom.window.close());
  $('readerListen').click();assert.ok($('audioOptionsWrap').classList.contains('open'));assert.equal($('audioReciter').options.length,8);
  $('audioReciter').value='husary';$('audioReciter').dispatchEvent(new w.Event('change'));
  $('audioRate').value='1.5';$('audioRate').dispatchEvent(new w.Event('change'));
  $('audioForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
  assert.equal(w.readerTest.player.status,'playing');assert.match(audio[0].src,/^blob:/);assert.ok(w.readerTest.player.plan);assert.equal(audio[0].playbackRate,1.5);
  assert.ok(w.document.querySelector('#paneB .qw.playing[data-vk="1:1"]'));
  $('faceListenPlay').click();await tick();assert.equal(w.readerTest.player.status,'paused');assert.ok(w.document.querySelector('#paneB .qw.playing[data-vk="1:1"]'));
  $('faceListenNext').click();await tick();assert.equal(w.readerTest.verse,'1:2');
  await w.readerTest.player.start({verses:['2:5','2:6'],scope:'custom'});assert.equal(w.readerTest.page,2);audio[0].onended();await tick();await tick();assert.equal(w.readerTest.page,3);assert.equal(w.readerTest.verse,'2:6');
  $('faceListenClose').click();assert.equal(w.document.querySelectorAll('.qw.playing').length,0);assert.ok(!w.document.body.classList.contains('face-listening'));
});
test('ayah action buttons copy, share and download actual text',async t=>{
  const {dom,w,$,clipboard,shares,downloads}=await boot();t.after(()=>dom.window.close());await w.openAyah('1:2');
  $('ayCopy').click();await tick();assert.match(clipboard[0].replace(/[ً-ْ]/g,''),/الحمد/);
  $('ayShare').click();await tick();assert.match(shares[0].text.replace(/[ً-ْ]/g,''),/الحمد/);
  $('ayDl').click();await tick();assert.equal(downloads[0],'ayah-1-2.txt');
  $('ayPlayTo').click();assert.equal($('audioScope').value,'custom');assert.equal($('audioEndAyah').max,'7');assert.ok($('audioOptionsWrap').classList.contains('open'));
});
test('native text selection is suppressed and keyboard does not page behind a dialog',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());const track=$('track');
  const select=new w.Event('selectstart',{bubbles:true,cancelable:true});track.dispatchEvent(select);assert.equal(select.defaultPrevented,true);
  $('btnIndex').click();const page=w.readerTest.page;w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await tick();assert.equal(w.readerTest.page,page);
  $('pageJump').value='604';$('readerJumpForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();assert.equal(w.readerTest.page,604);assert.ok(!$('indexOv').classList.contains('open'));
});
test('all inline scripts compile and layout/source data remain independently testable',()=>{
  for(const file of ['index.html','mushaf.html'])for(const match of read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  const css=read('reader-shell.css');assert.match(css,/safe-area-inset-top/);assert.match(css,/user-select:none/);assert.match(css,/position:relative;inset:auto;order:4/);assert.doesNotMatch(read('mushaf.html'),/setProperty\('--app-nav-h'/);
});
test('long touch opens ayah details while preventing native selection and a phantom tap',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());const word=$('paneB').querySelector('.qw[data-vk]'),touch={clientX:100,clientY:100};
  const start=new w.Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(start,'touches',{value:[touch]});word.dispatchEvent(start);assert.ok(start.defaultPrevented);
  await new Promise(resolve=>setTimeout(resolve,480));assert.ok($('ayahWrap').classList.contains('open'));assert.equal(w.getSelection().toString(),'');
  const end=new w.Event('touchend',{bubbles:true});Object.defineProperty(end,'changedTouches',{value:[touch]});word.dispatchEvent(end);assert.ok(!w.document.body.classList.contains('reader-quiet'));
});
test('late Saadi responses cannot overwrite a newer Muyassar selection',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());const original=w.fetch,releases=[];
  w.fetch=url=>String(url).includes('/tafsirs/91/')?new Promise(resolve=>releases.push(()=>original(url).then(resolve))):original(url);
  const old=w.openFaceTafsir('saadi');await tick();w.document.querySelector('[data-face-tf=muyassar]').click();await tick();await tick();releases.forEach(release=>release());await old;await tick();
  assert.match($('faceTafsirBody').textContent,/المصدر 16/);assert.doesNotMatch($('faceTafsirBody').textContent,/المصدر 91/);
});
test('viewport updates do not measure and grow the navigation height recursively',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());$('appBottomNav').getBoundingClientRect=()=>{throw Error('nav measurement feedback');};
  for(let i=0;i<20;i++)w.syncReaderViewport();assert.equal(w.document.documentElement.style.getPropertyValue('--app-nav-h'),'');
});
test('new styles win over legacy positioning and keep the audio dock in normal flow',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());
  for(const file of ['app-navigation.css','reader-shell.css']){const style=w.document.createElement('style');style.textContent=read(file);w.document.head.append(style);assert.ok(style.sheet.cssRules.length>0);}
  assert.equal(w.getComputedStyle($('screen')).position,'relative');
  assert.equal(w.getComputedStyle(w.document.querySelector('.chrome-top')).position,'relative');
  assert.equal(w.getComputedStyle(w.document.querySelector('.chrome-top')).pointerEvents,'auto');
  w.document.body.classList.add('face-listening');assert.equal(w.getComputedStyle($('faceListenBar')).position,'relative');assert.equal(w.getComputedStyle($('faceListenBar')).display,'flex');
  assert.equal(w.getComputedStyle($('appBottomNav')).pointerEvents,'auto');assert.equal(w.getComputedStyle($('appBottomNav')).opacity,'1');
  w.document.body.classList.add('focus-mode');assert.equal(w.getComputedStyle($('appBottomNav')).display,'none');
});
