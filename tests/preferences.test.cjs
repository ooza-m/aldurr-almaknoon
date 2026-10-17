const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../app-preferences.js');
const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function reset(){const map=new Map();P.load({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)});return map;}
test('preferences validate, persist, migrate digits and keep future design unavailable',()=>{
 const map=reset();P.set({palette:'navy',digits:'en',calendar:'hijri',design:'floral'});
 assert.equal(P.get().design,'classic');assert.equal(P.get().palette,'navy');assert.equal(JSON.parse(map.get(P.KEY)).calendar,'hijri');
 P.load({getItem:k=>k==='durr-num'?'en':null});assert.equal(P.get().digits,'en');
 P.load({getItem:()=>'{broken'});assert.equal(P.get().palette,'rose');
});
test('Hijri month boundaries roundtrip actual dates and preserve stored Gregorian keys',()=>{
 reset();P.set({calendar:'hijri',digits:'en'});
 assert.deepEqual(P.parts('2026-02-18'),{year:1447,month:9,day:1});
 const m=P.month('2026-02-25');assert.equal(m.name,'رمضان');assert.ok([29,30].includes(m.days.length));
 for(const day of m.days){const p=P.parts(day.date);assert.equal(P.key(P.fromParts(p.year,p.month,p.day)),day.key);}
 const next=P.shiftMonth('2026-02-25',1);assert.equal(P.parts(next).month,10);assert.equal(P.parts(next).day,8);
 assert.equal(P.key(P.parse('2026-02-25')),'2026-02-25');assert.match(P.format('2026-02-25'),/رمضان/);
});
test('Gregorian leap month, year transition and Arabic/Persian number conversion',()=>{
 reset();assert.equal(P.month('2024-02-29').days.length,29);assert.equal(P.key(P.shiftMonth('2024-01-31',1)),'2024-02-29');
 assert.equal(P.key(P.shiftMonth('2026-12-31',1)),'2027-01-31');assert.equal(P.digits('١۲3','en'),'123');assert.equal(P.digits('123','ar'),'١٢٣');
});
async function boot(){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));vc.on('warn',e=>errors.push(e));
 const dom=new JSDOM(read('index.html'),{url:'https://app.test/index.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.scrollTo=()=>{};w.requestAnimationFrame=fn=>{fn();return 0;};w.alert=()=>{};w.confirm=()=>false;w.matchMedia=()=>({matches:false,addEventListener(){}});w.fetch=async()=>({ok:false});
 w.localStorage.setItem('durr-skip-auth','1');for(const file of ['app-preferences.js','reader-ui.js','app-data.js'])w.eval(read(file));
 w.eval([...w.document.querySelectorAll('script:not([src])')].map(s=>s.textContent).join('\n'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(r=>setImmediate(r));
 return {dom,w,errors,$:id=>w.document.getElementById(id)};
}
test('visible settings shortcuts open before any login/logout and all local tabs render',async t=>{
 const {dom,w,$,errors}=await boot();t.after(()=>dom.window.close());
 for(const id of ['moreSettingsBtn','homeNotifBtn','todayTuneBtn']){$('settingsModal').classList.remove('open');$(id).click();assert.ok($('settingsModal').classList.contains('open'),id);}
 $('settingsModal').classList.remove('open');
 for(const route of ['home','today','manual','calendar','map','more','khatma','tafsir','planning','stages','stats','tajweed','errors']){w.switchTab(route);assert.ok($('tab-'+route).classList.contains('active'),route);}
 assert.deepEqual(errors,[]);
});
test('main settings change palette/digits and render a real Hijri month and picker',async t=>{
 const {dom,w,$,errors}=await boot();t.after(()=>dom.window.close());const p=w.DurrPreferences;
 const before=w.localStorage.getItem('durr-alfareed-v2');
 w.document.querySelector('[data-palette=olive]').click();assert.equal(w.document.documentElement.dataset.palette,'olive');
 w.document.querySelector('[data-digits=en]').click();assert.equal(p.digits(123),'123');
 w.document.querySelector('[data-calendar=hijri]').click();w.switchTab('calendar');$('vMonth').click();
 assert.match($('calTitle').textContent,new RegExp(p.month(new w.Date()).name));
 assert.equal($('calGrid').querySelectorAll('.cal-cell:not(.empty)').length,p.month(new w.Date()).days.length);
 $('calTitleBtn').click();assert.equal($('dpCalHost').querySelectorAll('.dpm-days [data-k]').length,p.month(new w.Date()).days.length);
 const target=$('dpCalHost').querySelector('[data-k]').dataset.k;$('dpCalHost').querySelector('[data-k]').click();assert.ok(!$('datePickModal').classList.contains('open'));
 assert.equal(w.localStorage.getItem('durr-alfareed-v2'),before,'display settings do not rewrite learning state');assert.deepEqual(errors,[]);
});
test('digit display preserves machine values and exact Quran glyph/numeral text',async t=>{
 const {dom,w}=await boot();t.after(()=>dom.window.close());const host=w.document.createElement('div');
 host.innerHTML='<span>وجه 123</span><span class="qw">آية ١٢٣</span><input value="123"><span data-preserve-numerals>123</span>';
 w.document.body.append(host);w.DurrPreferences.set({digits:'en'});w.DurrPreferences.formatNumbers(host);
 assert.equal(host.querySelector('.qw').textContent,'آية ١٢٣');assert.equal(host.querySelector('input').value,'123');assert.equal(host.querySelector('span').textContent,'وجه 123');
});
test('Hijri picker supports month/year selection, date limits and ISO event values',()=>{
 const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only',url:'https://app.test'}),w=dom.window;
 try{w.eval(read('app-preferences.js'));w.DurrPreferences.set({calendar:'hijri'});let picked;
 const host=w.document.getElementById('host');w.DurrPreferences.picker(host,{value:'2026-02-25',min:'2026-02-20',max:'2026-03-05',onPick:k=>picked=k});
 assert.ok(host.querySelector('[data-k="2026-02-18"]').disabled);host.querySelector('[data-k="2026-02-25"]').click();assert.equal(picked,'2026-02-25');
 host.querySelector('[data-mode]').click();assert.equal(host.querySelectorAll('[data-month]').length,12);host.querySelector('[data-years]').click();assert.ok(host.querySelector('[data-year="1447"]'));
 host.querySelector('[data-year="1447"]').click();host.querySelector('[data-month="10"]').click();assert.match(host.textContent,/شوّال/);
 }finally{w.close();}
});
test('navigation controls and More shortcuts target real panels',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());
 const targets=[...new Set([...w.document.querySelectorAll('[data-v50-route]')].map(b=>b.dataset.v50Route))];
 for(const target of targets){assert.ok($('tab-'+target),target);w.document.querySelector('[data-v50-route="'+target+'"]').click();assert.ok($('tab-'+target).classList.contains('active'),target);}
 for(const target of ['home','today','calendar','more']){w.document.querySelector('#bottomNav [data-tab="'+target+'"]').click();assert.ok($('tab-'+target).classList.contains('active'));}
 $('moreSettingsBtn').click();$('set-name').value='اختبار';$('set-name-save').click();assert.equal(JSON.parse(w.localStorage.getItem('durr-alfareed-v2')).profile.name,'اختبار');
});
test('stage completion uses the selected-calendar picker and saves only after confirmation',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());w.DurrPreferences.set({calendar:'hijri'});w.switchTab('stages');
 const before=w.localStorage.getItem('durr-alfareed-v2'),button=$('stageTrack').querySelector('[data-done]'),index=+button.dataset.done;button.click();
 assert.ok($('stageModal').classList.contains('open'));assert.equal($('stStatus').value,'done');assert.match($('stDate').nextElementSibling.textContent,new RegExp(w.DurrPreferences.month(new w.Date()).name));
 assert.equal(w.localStorage.getItem('durr-alfareed-v2'),before,'opening completion does not save progress');
 $('stDate').nextElementSibling.click();const target=$('stDate')._pop.querySelector('.dp-days [data-k]').dataset.k;$('stDate')._pop.querySelector('.dp-days [data-k]').click();$('stSave').click();
 const state=JSON.parse(w.localStorage.getItem('durr-alfareed-v2'));assert.equal(state.stages[index].date,target);assert.equal(state.stages[index].status,'done');assert.equal(state.stages[index+1].status,'current');
 assert.match($('stageTrack').textContent,new RegExp(w.DurrPreferences.format(target)));
});
test('automatic findings reach the error log and an improved final result does not duplicate a session',async t=>{
 const {dom,w}=await boot();t.after(()=>dom.window.close());
 const initial={id:'background-one',version:86,task:'free',analysisStatus:'interrupted',analysisIncomplete:true,endedAt:Date.now(),pages:[{page:1,coverage:.4,complete:false,score:40,verses:[{vk:'1:2',coverage:.4,errorWordIndexes:[2],errorWords:1}]}],automaticErrorKeys:['1:2#2'],findings:[{type:'automatic_omission',automatic:true,active:true,source:'browser-speech',confidenceKind:'alignment-not-acoustic',page:1,vk:'1:2',wi:2,expected:'رب',confidence:.8}]};
 w.ingestRecitationSessionV51(initial);let state=JSON.parse(w.localStorage.getItem('durr-alfareed-v2'));assert.equal(state.errors.length,1);assert.equal(state.errors[0].automatic,true);assert.equal(state.errors[0].userConfirmed,undefined);
 const final=JSON.parse(JSON.stringify(initial));final.analysisStatus='complete';final.analysisIncomplete=false;final.pages[0].coverage=.9;w.ingestRecitationSessionV51(final);w.ingestRecitationSessionV51(final);state=JSON.parse(w.localStorage.getItem('durr-alfareed-v2'));assert.equal(state.recitationSessions.length,1);assert.equal(state.activityEvents.filter(e=>e.type==='recitation').length,1);assert.equal(state.verseReview['1:2'].count,1);assert.equal(state.errors.length,1);assert.equal(state.recitationSessions[0].analysisStatus,'complete');
});
test('home reading pin stays separate from memorization scheduling',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());new w.DurrReaderUI.Bookmarks(w.localStorage).put('3:1',50,'وردي');w.refreshV50();assert.match($('homeContinueCard').textContent,/فاصلك/);assert.equal($('homeContinueCard').querySelector('[data-reading-vk]').dataset.readingVk,'3:1');assert.equal(w.lastActivityPageV50(),1);
});
test('import validation leaves state untouched and undo restores the checkpoint',async t=>{
 const {dom,w,$}=await boot();t.after(()=>dom.window.close());w.confirm=()=>true;const before=w.currentBackupV86();w.DurrData.checkpoint(w.localStorage,before);
 const imported=w.DurrData.validate(w.DurrData.backup({logs:[],profile:{name:'اسم مستورد',pathChosen:true,pathDir:'up'}},{palette:'navy',digits:'en',calendar:'hijri'},[{vk:'1:4',page:1,name:'فاصل'}]));w.applyImportV86(imported);assert.equal(JSON.parse(w.localStorage.getItem('durr-alfareed-v2')).profile.name,'اسم مستورد');assert.equal(w.DurrPreferences.get().palette,'navy');
 $('settingsUndoRestore').click();assert.equal(JSON.parse(w.localStorage.getItem('durr-alfareed-v2')).profile.name,before.state.profile.name);assert.equal(w.DurrPreferences.get().palette,before.displayPreferences.palette);assert.equal(JSON.parse(w.localStorage.getItem('durr-verse-bookmarks-v86')).length,before.bookmarks.length);
});
