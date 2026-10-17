/* DOM integration only: this does not replace visual/iOS device QA. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function tap(w,el,x=100,y=100){const touch={clientX:x,clientY:y},start=new w.Event('touchstart',{bubbles:true,cancelable:true}),end=new w.Event('touchend',{bubbles:true});Object.defineProperty(start,'touches',{value:[touch]});Object.defineProperty(end,'changedTouches',{value:[touch]});el.dispatchEvent(start);el.dispatchEvent(end);}
async function boot(options={}){
  const errors=[],requests=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(read('mushaf.html'),{url:'https://reader.test/mushaf.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;
  w.matchMedia=()=>({matches:true});w.FontFace=class{async load(){return this;}};
  if(options.SpeechRecognition){w.SpeechRecognition=options.SpeechRecognition;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});}
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
  w.localStorage.setItem('durr-num','en');if(options.savedFocus!=null)w.localStorage.setItem('durr-focus',options.savedFocus);for(const file of ['app-preferences.js','reader-core.js','audio-library.js','reader-audio.js','recitation-core.js','recitation-jobs.js','reader-ui.js','reader-study.js'])w.eval(read(file));
  for(const script of w.document.querySelectorAll('script:not([src])')){
    let code=script.textContent;
    if(code.includes('const REC_QUERY='))code+='\nwindow.readerTest={get player(){return audioController},get page(){return cur},get verse(){return playingVerse},get session(){return recSession},get recMode(){return recMode},get pageState(){return recPageState},get jobs(){return recJobsV86},settle,faceVerses,loadTafsir,maybeCompleteFaceTafsir,enterRecite,toggleRec,finishReciteSession,processTranscriptV73,openErrLog};';
    w.eval(code);
  }
  for(let i=0;i<50&&w.document.getElementById('loading').style.display!=='none';i++)await tick();
  assert.equal(w.document.getElementById('loading').style.display,'none','reader booted');
  return {dom,w,errors,requests,audio,clipboard,shares,downloads,$:id=>w.document.getElementById(id)};
}
test('night preference changes Quran ink without changing any glyphs or line order',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const before=[...w.document.querySelectorAll('.pane .qline')].map(el=>el.textContent);
 $('btnSettings').click();w.DurrPreferences.mount(w.document.querySelector('[data-app-preferences]'));w.document.querySelector('[data-appearance=dark]').click();assert.equal(w.document.documentElement.dataset.theme,'dark');assert.equal(w.document.documentElement.style.getPropertyValue('--quran'),'#f1ece5');
 assert.deepEqual([...w.document.querySelectorAll('.pane .qline')].map(el=>el.textContent),before);assert.equal(JSON.parse(w.localStorage.getItem(w.DurrPreferences.KEY)).appearance,'dark');w.document.querySelector('[data-appearance=light]').click();assert.equal(w.document.documentElement.dataset.theme,'light');
});
test('verse notes retain both types, render hostile text safely and jump to their exact ayah',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());await w.openAyah('1:3');$('ayNote').click();$('noteText').value='<img src=x onerror=alert(1)>';$('noteForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 $('noteKind').value='teacher';$('noteKind').dispatchEvent(new w.Event('change'));$('noteText').value='توجيه المعلمة';$('noteForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));const data=JSON.parse(w.localStorage.getItem('durr-verse-notes-v87'));assert.equal(data.length,2);
 $('openNotes').click();assert.equal($('notesBody').querySelector('img'),null);assert.match($('notesBody').textContent,/<img src=x/);assert.match($('notesBody').textContent,/توجيه المعلمة/);
 await w.readerTest.settle(50);$('notesBody').querySelector('[data-note-go]').click();for(let i=0;i<8;i++)await tick();assert.equal(w.readerTest.page,1);assert.ok(w.document.querySelector('.qw.qend[data-vk="1:3"]').classList.contains('has-note'));
});
test('random recall uses selected faces and a hint prevents independent success and face credit',async t=>{
 const {dom,w,$,errors}=await boot();t.after(()=>dom.window.close());w.Math.random=()=>0;$('openPractice').click();$('practiceFrom').value='1';$('practiceTo').value='1';$('practiceForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<10;i++)await tick();assert.equal($('practicePrompt').hidden,false);assert.match($('practiceLocation').textContent,/الفاتحة/);
 $('practiceHint').click();for(let i=0;i<4;i++)await tick();assert.ok($('practiceHintText').textContent);$('practiceStart').click();for(let i=0;i<15;i++)await tick();assert.equal(w.readerTest.recMode,true);assert.equal(w.readerTest.session.task,'practice');assert.equal(w.readerTest.session.recall.hinted,true);assert.equal(w.document.body.classList.contains('practice-preparing'),false);
 const vk=w.readerTest.session.recall.vk,search=JSON.parse(read('data/mushaf-search.json'));w.readerTest.processTranscriptV73(search[vk][1],'browser-speech');await w.readerTest.finishReciteSession();const payload=JSON.parse(w.localStorage.getItem('durr-last-recitation'));assert.equal(payload.summary.completedPages,0);assert.equal(payload.summary.recallSuccess,false);assert.ok(payload.pages.every(p=>!p.complete));await w.readerTest.enterRecite();assert.notEqual(w.readerTest.session.task,'practice');assert.deepEqual(errors,[]);
});
test('an unassisted one-ayah practice result is distinct from a completed face',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());w.Math.random=()=>0;$('openPractice').click();$('practiceForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<10;i++)await tick();$('practiceStart').click();for(let i=0;i<15;i++)await tick();const vk=w.readerTest.session.recall.vk,search=JSON.parse(read('data/mushaf-search.json'));w.readerTest.processTranscriptV73(search[vk][1],'browser-speech');await w.readerTest.finishReciteSession();const payload=JSON.parse(w.localStorage.getItem('durr-last-recitation'));assert.equal(payload.summary.recallSuccess,true);assert.equal(payload.summary.completedPages,0);
});
test('audio options preserve a chosen silent gap while changing repetition and start playback',async t=>{
 const {dom,w,$}=await boot();t.after(()=>{w.readerTest.player.stop();dom.window.close();});$('readerListen').click();$('audioRepeat').value='2';$('audioGap').value='5';$('audioForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<15;i++)await tick();assert.equal(w.readerTest.player.repeat,2);assert.equal(w.readerTest.player.gap,5);assert.equal(w.readerTest.player.status,'playing');
 $('faceListenOptions').click();assert.equal($('audioGap').value,'5');assert.equal($('audioRepeat').value,'2');
});
test('a short touch toggles tools, suppresses the following ghost click and leaves glyph styles alone',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const pane=$('paneB'),word=pane.querySelector('.qw[data-vk]');let measurements=0;
 Object.defineProperties(pane,{clientWidth:{get:()=>380},clientHeight:{get:()=>{measurements++;return 700;}}});w.syncReaderViewport();const before=[...pane.querySelectorAll('.qline,.qw')].map(el=>el.style.cssText),count=measurements;
 assert.ok(!$('readerDock').closest('.track'));assert.equal($('readerTopTools').getAttribute('aria-hidden'),'true');tap(w,word);assert.ok(w.document.body.classList.contains('chrome'));assert.equal($('readerTopTools').getAttribute('aria-hidden'),'false');assert.equal($('readerDock').hasAttribute('inert'),false);word.click();assert.ok(w.document.body.classList.contains('chrome'));assert.ok(!$('ayahWrap').classList.contains('open'));
 tap(w,word);assert.ok(!w.document.body.classList.contains('chrome'));assert.equal($('readerDock').hasAttribute('inert'),true);assert.equal(measurements,count);assert.deepEqual([...pane.querySelectorAll('.qline,.qw')].map(el=>el.style.cssText),before);
});
test('multi-touch and canceled gestures do not toggle reader tools',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const start=new w.Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(start,'touches',{value:[{clientX:100,clientY:100},{clientX:140,clientY:120}]});$('track').dispatchEvent(start);const end=new w.Event('touchend',{bubbles:true});Object.defineProperty(end,'changedTouches',{value:[{clientX:100,clientY:100}]});$('track').dispatchEvent(end);assert.ok(!w.document.body.classList.contains('chrome'));$('track').dispatchEvent(new w.Event('touchcancel'));$('track').click();assert.ok(!w.document.body.classList.contains('chrome'));
});
test('reader always opens large regardless of the obsolete focus preference, and Home is its exit',async t=>{
 for(const savedFocus of ['0','1']){const {dom,w,$}=await boot({savedFocus});t.after(()=>dom.window.close());assert.equal($('btnFocus'),null);assert.equal($('appBottomNav'),null);assert.ok(!w.document.body.classList.contains('focus-mode'));assert.equal($('readerDock').hasAttribute('inert'),true);assert.equal($('btnBack').closest('[inert]'),null);let route='';w.leaveReader=async value=>{route=value;};$('btnBack').click();assert.equal(route,'home');}
});
test('keyboard toggles controls and Escape hides them without changing pages',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const page=w.readerTest.page;$('track').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.ok(w.document.body.classList.contains('chrome'));$('track').dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));assert.ok(!w.document.body.classList.contains('chrome'));
 $('track').click();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('readerDock').getAttribute('aria-hidden'),'true');assert.equal(w.readerTest.page,page);
});
test('showing an audio session reveals the dock once; later progress does not re-open hidden tools',async t=>{
 const {dom,w,$}=await boot();t.after(()=>{w.readerTest.player.stop();dom.window.close();});await w.readerTest.player.start({verses:['1:1','1:2']});assert.ok(w.document.body.classList.contains('chrome'));$('track').click();assert.ok(!w.document.body.classList.contains('chrome'));w.readerTest.player.emit();assert.ok(!w.document.body.classList.contains('chrome'));assert.equal($('faceListenBar').closest('#readerDock').id,'readerDock');
});
test('main navigation keeps Mushaf central while the reader has only its persistent home exit',()=>{
  for(const [file,selector,attr] of [['index.html','#bottomNav','tab']]){
    const dom=new JSDOM(read(file)),buttons=[...dom.window.document.querySelector(selector).children];
    assert.deepEqual(buttons.map(b=>b.dataset[attr]),['home','today','mushaf','calendar','more']);assert.ok(buttons[2].classList.contains('nav-mushaf'));dom.window.close();
  }
  const dom=new JSDOM(read('index.html'));assert.ok(dom.window.document.querySelector('#tab-more [data-v50-route=map]'));dom.window.close();
  const reader=new JSDOM(read('mushaf.html'));assert.equal(reader.window.document.querySelector('#appBottomNav'),null);assert.equal(reader.window.document.querySelector('#btnFocus'),null);assert.equal(reader.window.document.querySelector('#btnBack').getAttribute('aria-label'),'العودة للرئيسية');reader.window.close();
});
test('reader boots without missing/duplicate IDs or JavaScript errors',async t=>{
  const {dom,w,errors}=await boot();t.after(()=>dom.window.close());
  const ids=[...w.document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length);
  const missing=[...read('mushaf.html').matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]).filter(id=>!w.document.getElementById(id)&&!['errClr'].includes(id));assert.deepEqual([...new Set(missing)],[]);
  assert.deepEqual(errors,[]);assert.equal(w.document.getElementById('faceListenBar').parentElement.id,'readerDock');
});
test('page scrubber is under the face before actions and jumps without opening the index',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const scrubber=$('pageSlider').closest('.reader-scrubber');
 assert.equal(scrubber.parentElement.id,'readerDock');assert.equal(scrubber.parentElement.previousElementSibling.id,'pagefoot');assert.ok(scrubber.compareDocumentPosition(w.document.querySelector('.chrome-bot'))&w.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal($('indexOv').querySelector('#pageSlider'),null);$('pageSlider').value='50';$('pageSlider').dispatchEvent(new w.Event('input'));assert.ok($('sBubble').classList.contains('on'));
 $('pageSlider').dispatchEvent(new w.Event('change'));assert.equal(w.readerTest.page,50);assert.ok(!$('indexOv').classList.contains('open'));
 $('btnSettings').click();w.DurrPreferences.mount(w.document.querySelector('[data-app-preferences]'));w.document.querySelector('[data-palette=navy]').click();w.document.querySelector('[data-digits=ar]').click();
 assert.equal(w.document.documentElement.dataset.palette,'navy');assert.equal(w.localStorage.getItem('durr-num'),'ar');assert.match($('pagefoot').textContent,/٥٠/);
});
test('ayah bookmarks persist independently of browsing and jump back to their exact ayah',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());await w.openAyah('1:3');$('ayBookmark').click();assert.equal($('ayBookmark').getAttribute('aria-pressed'),'true');
 const saved=JSON.parse(w.localStorage.getItem('durr-verse-bookmarks-v86'));assert.equal(saved[0].vk,'1:3');await w.readerTest.settle(50);assert.equal(JSON.parse(w.localStorage.getItem('durr-verse-bookmarks-v86'))[0].vk,'1:3');
 $('btnIndex').click();$('openBookmarks').click();assert.ok($('bookmarksOv').classList.contains('open'));w.document.querySelector('[data-bookmark-go="1:3"]').click();await tick();await tick();assert.equal(w.readerTest.page,1);assert.ok(w.document.querySelector('.qend.has-bookmark[data-vk="1:3"]'));
});
test('reader library exposes each reciter, surah download and real stored status',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());$('readerListen').click();$('openAudioLibrary').click();await tick();assert.equal(w.document.querySelectorAll('[data-reader-open]').length,8);
 w.document.querySelector('[data-reader-open=alafasy]').click();await tick();assert.equal(w.document.querySelectorAll('[data-download]').length,114);
 $('audioLibrarySearch').value='العصر';$('audioLibrarySearch').dispatchEvent(new w.Event('input'));await tick();w.document.querySelector('[data-download="103"]').click();for(let i=0;i<12;i++)await tick();assert.match($('audioLibraryFeedback').textContent,/اكتمل|تم التحميل/);assert.ok(w.document.querySelector('[data-chapter-remove="103"]'));
 w.document.querySelector('[data-chapter-play="103"]').click();for(let i=0;i<8;i++)await tick();assert.equal(w.readerTest.player.status,'playing');assert.equal(w.readerTest.player.queue.length,3);assert.match($('faceListenReader').textContent,/العفاسي/);
});
test('download ring indicates progress and its stop button cancels without reviving playback',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const player=w.readerTest.player,original=player.downloads.fetcher;let reads=0;
 player.downloads.fetcher=async url=>String(url).includes('chapter_recitations')?original(url):{ok:true,headers:{get:key=>key==='content-length'?'32':'audio/mpeg'},body:{getReader:()=>({read:async()=>++reads===1?{done:false,value:new Uint8Array(8)}:new Promise(()=>{}),cancel:async()=>{}})}};
 const work=player.start({verses:['103:1','103:2','103:3']});await tick();await tick();assert.equal(player.status,'loading');assert.equal($('faceListenDownloadRing').hasAttribute('hidden'),false);assert.equal($('faceListenPlay').disabled,false);assert.equal($('faceListenPlay').getAttribute('aria-label'),'إلغاء التحميل');$('faceListenPlay').click();await work;assert.equal(player.status,'idle');assert.equal(w.document.body.classList.contains('face-listening'),false);
});
test('seek and bounded repetition control the real player without creating listening credit',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());const player=w.readerTest.player;await player.start({verses:['1:1','1:2']});$('faceListenRepeat').click();assert.equal(player.repeat,2);$('faceListenSeek').value='500';$('faceListenSeek').dispatchEvent(new w.Event('change'));assert.equal(player.audio.currentTime,5);assert.equal(player.completed.size,0);assert.equal($('faceListenRepeatCount').textContent,'2');
});
test('finishing speech immediately restores navigation while the final result belongs to its old session',async t=>{
 const recognizers=[];class SR{constructor(){recognizers.push(this);}start(){this.onstart?.();}stop(){}abort(){this.onend?.();}}
 const {dom,w,$}=await boot({SpeechRecognition:SR});t.after(()=>dom.window.close());await w.readerTest.enterRecite('free');await w.readerTest.toggleRec();const owner=w.readerTest.session.id,old=recognizers[0],finished=w.readerTest.finishReciteSession();
 assert.equal(w.readerTest.recMode,false);assert.equal(w.document.body.classList.contains('reciting'),false);assert.equal($('recSummaryWrap').classList.contains('open'),false);$('btnIndex').click();assert.ok($('indexOv').classList.contains('open'));
 await w.readerTest.enterRecite('free');const fresh=w.readerTest.session.id;assert.notEqual(fresh,owner);const result=[{transcript:'الحمد لله رب العالمين'}];result.isFinal=true;old.onresult({resultIndex:0,results:[result]});old.onend();await finished;
 assert.equal(w.readerTest.session.id,fresh);assert.equal(w.readerTest.pageState.covered.size,0);assert.equal(w.readerTest.jobs.get(owner).payload.summary.wordsCovered,4);assert.equal($('recSummaryWrap').classList.contains('open'),false);assert.match($('recJobStatus').textContent,/اكتمل/);
 await w.readerTest.finishReciteSession();
});
test('automatic error rows are removable without waiting for the similar-verses data',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());await w.readerTest.enterRecite('free');w.readerTest.processTranscriptV73('الحمد لله غريب العالمين الرحمن الرحيم','browser-speech',{});await w.readerTest.openErrLog();assert.ok($('errBody').querySelector('[data-error-remove]'));$('errBody').querySelector('[data-error-remove]').click();await tick();assert.equal(JSON.parse(w.localStorage.getItem('durr-errors')).length,0);assert.equal(JSON.parse(w.localStorage.getItem('durr-error-dismissals-v86')).length,1);await w.readerTest.finishReciteSession();
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
  const end=new w.Event('touchend',{bubbles:true});Object.defineProperty(end,'changedTouches',{value:[touch]});word.dispatchEvent(end);assert.ok(!w.document.body.classList.contains('chrome'));assert.ok($('readerDock').hasAttribute('inert'));
});
test('late Saadi responses cannot overwrite a newer Muyassar selection',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());const original=w.fetch,releases=[];
  w.fetch=url=>String(url).includes('/tafsirs/91/')?new Promise(resolve=>releases.push(()=>original(url).then(resolve))):original(url);
  const old=w.openFaceTafsir('saadi');await tick();w.document.querySelector('[data-face-tf=muyassar]').click();await tick();await tick();releases.forEach(release=>release());await old;await tick();
  assert.match($('faceTafsirBody').textContent,/المصدر 16/);assert.doesNotMatch($('faceTafsirBody').textContent,/المصدر 91/);
});
test('viewport sizing does not reserve or measure the removed application navigation',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());assert.equal($('appBottomNav'),null);
  for(let i=0;i<20;i++)w.syncReaderViewport();assert.equal(w.document.documentElement.style.getPropertyValue('--app-nav-h'),'');
});
test('reader controls and recitation UI overlay the large fixed reading area',async t=>{
  const {dom,w,$}=await boot();t.after(()=>dom.window.close());
  for(const file of ['app-navigation.css','reader-shell.css']){const style=w.document.createElement('style');style.textContent=read(file);w.document.head.append(style);assert.ok(style.sheet.cssRules.length>0);}
  assert.equal(w.getComputedStyle($('screen')).position,'relative');
  assert.equal(w.getComputedStyle($('readerTopTools')).position,'absolute');assert.equal(w.getComputedStyle($('readerDock')).position,'absolute');assert.equal(w.getComputedStyle($('btnBack')).position,'absolute');
  assert.equal(w.getComputedStyle($('readerTopTools')).visibility,'hidden');assert.equal(w.getComputedStyle($('readerDock')).pointerEvents,'none');
  assert.equal(w.getComputedStyle($('btnBack')).visibility,'visible');assert.equal($('btnBack').closest('[inert]'),null);assert.equal(w.getComputedStyle(w.document.querySelector('.mini-top')).display,'none');
  $('track').click();assert.equal(w.getComputedStyle($('readerTopTools')).visibility,'visible');assert.equal(w.getComputedStyle($('readerDock')).pointerEvents,'auto');
  w.document.body.classList.add('face-listening');assert.equal(w.getComputedStyle($('faceListenBar')).position,'relative');assert.equal(w.getComputedStyle($('faceListenBar')).display,'flex');
  assert.equal($('faceListenBar').closest('#readerDock').id,'readerDock');
  await w.readerTest.enterRecite();assert.equal(w.getComputedStyle($('recBar')).position,'absolute');assert.equal(w.getComputedStyle($('recEngine')).position,'absolute');assert.equal(w.getComputedStyle($('recSessionChip')).position,'absolute');
});
