const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{JSDOM,VirtualConsole}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const session=[{session_id:'a',session_type:'RECITE',recitation_mode:'DETECTION',started_at:'2026-01-01T00:00:00Z',start_surah_number:76,start_ayah_number:1}];
const error=[{session_id:'a',mistake_type:'INCORRECT_TASHKEEL',positions:[{surah_number:76,ayah_number:1,word_number:3}],created:'2026-01-01T00:00:05Z',expected:'أَتَى',received:'أُتَى',email:'not-to-import@example.test'}];
async function boot(){
 const vc=new VirtualConsole(),exceptions=[];vc.on('jsdomError',e=>exceptions.push(e));
 const dom=new JSDOM(read('tarteel-import.html'),{url:'https://reader.test/tarteel-import.html',runScripts:'outside-only',virtualConsole:vc,pretendToBeVisual:true}),w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>({'76:1':[578]})});
 for(const name of ['tarteel-import.js','tarteel-merge.js','tarteel-phase3.js'])w.eval(read(name));
 const file=(id,data)=>Object.defineProperty(w.document.getElementById(id),'files',{configurable:true,value:[{size:JSON.stringify(data).length,text:async()=>JSON.stringify(data)}]});
 file('sessions',session);file('mistakes',error);
 w.document.getElementById('run').click();
 for(let i=0;i<8;i++)await tick();
 return{dom,w,exceptions};
}
test('original JSON reader previews real Tarteel shape without writing any approved data',async t=>{
 const {dom,w,exceptions}=await boot();t.after(()=>dom.window.close());
 assert.equal(w.document.getElementById('output').hidden,false);
 assert.match(w.document.getElementById('metrics').textContent,/الجلسات/);
 assert.equal(w.document.querySelectorAll('.record input[type=checkbox]').length,1);
 assert.equal(w.localStorage.getItem('durr-tarteel-review-queue-v1'),null);
 assert.equal(w.localStorage.getItem('durr-alfareed-v2'),null);
 assert.equal(w.document.getElementById('archive').disabled,true,'archive must require explicit prior-snapshot acknowledgment');
 assert.deepEqual(exceptions,[]);
});
test('one selected verified error is staged, not automatically imported or awarded',async t=>{
 const {dom,w}=await boot();t.after(()=>dom.window.close());
 const box=w.document.querySelector('.record input[type=checkbox]');
 box.checked=true;box.dispatchEvent(new w.Event('change'));
 w.document.getElementById('commit').click();
 const staged=JSON.parse(w.localStorage.getItem('durr-tarteel-review-queue-v1'));
 assert.equal(staged.confirmed,true);
 assert.equal(staged.errors.length,1);
 assert.equal(staged.errors[0].faces[0],578);
 assert.equal(w.localStorage.getItem('durr-alfareed-v2'),null,'main state remains untouched before second confirmation');
 assert.equal(JSON.stringify(staged).includes('not-to-import@example.test'),false);
});
