const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app-cloud-extras.js'),'utf8');
function setup(local,remote){
 const map=new Map(Object.entries(local||{}));
 const storage={getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
 const els={status:{textContent:''},conflict:{hidden:true}};
 const document={getElementById:key=>key==='cloudExtrasStatusV109'?els.status:key==='cloudExtrasConflictV109'?els.conflict:null,addEventListener:()=>{}};
 const window={addEventListener:()=>{},dispatchEvent:()=>{},DurrPreferences:{subscribe:()=>{},reload:()=>{}}};
 let payload=remote;
 const doc={get:async()=>({exists:payload!==null,data:()=>({payload})})};
 const db={collection:()=>({doc:()=>({collection:()=>({doc:()=>doc})})}),runTransaction:async callback=>{
  let written=null;
  const tx={get:()=>doc.get(),set:(_ref,obj)=>{written=obj.payload}};
  const result=await callback(tx);if(written!==null)payload=written;return result;
 }};
 const sandbox={window,document,localStorage:storage,Event:class{constructor(type){this.type=type}},console,setTimeout,clearTimeout,Date,JSON};
 vm.runInNewContext(source,sandbox,{filename:'app-cloud-extras.js'});
 return{app:window.DurrCloudExtras,map,els,getRemote:()=>payload,db};
}
const payload=value=>JSON.stringify({bookmarks:value,highlights:null,notes:null,preferences:null});
test('reader extras restore remote on an empty device',async()=>{
 const env=setup({},payload('[{"vk":"1:1"}]'));
 await env.app.start('uid-test',env.db);
 assert.equal(env.map.get('durr-verse-bookmarks-v86'),'[{"vk":"1:1"}]');
 assert.equal(env.getRemote(),payload('[{"vk":"1:1"}]'));
 assert.equal(env.els.conflict.hidden,true);
});
test('reader extras never silently overwrite divergent histories',async()=>{
 const existing=payload('[{"vk":"1:1"}]');
 const env=setup({'durr-verse-bookmarks-v86':'[{"vk":"2:2"}]'},existing);
 await env.app.start('uid-test',env.db);
 assert.equal(env.els.conflict.hidden,false);
 assert.equal(env.map.get('durr-verse-bookmarks-v86'),'[{"vk":"2:2"}]');
 assert.equal(env.getRemote(),existing);
});
test('reader extras upload to a truly empty account',async()=>{
 const env=setup({'durr-hl':'1:1=#ABCDEF'},null);
 await env.app.start('uid-test',env.db);
 assert.equal(JSON.parse(env.getRemote()).highlights,'1:1=#ABCDEF');
 assert.equal(env.els.conflict.hidden,true);
});
test('reader extras do not auto-upload if known cloud history disappeared',async()=>{
 const old=payload('[{"vk":"1:1"}]');
 const env=setup({'durr-reader-cloud-baseline-v109-uid-test':old,'durr-verse-bookmarks-v86':'[{"vk":"2:2"}]'},null);
 await env.app.start('uid-test',env.db);
 assert.equal(env.els.conflict.hidden,false);
 assert.equal(env.getRemote(),null);
});
test('backup validation roundtrips separator colors and refuses malformed entries',()=>{
 const D=require('../app-data.js');
 const state={pages:{},logs:[],stages:[],errors:[],recitationSessions:[],profile:{}};
 const pref={design:'classic',palette:'rose',digits:'en',calendar:'gregorian',appearance:'light'};
 assert.equal(D.validate(D.backup(state,pref,[],[],'1:1=#E3A9B6')).highlights,'1:1=#E3A9B6');
 assert.throws(()=>D.validate(D.backup(state,pref,[],[],'1:1=red')),/الفواصل/);
});
test('floral CSS is opt-in while classic stays default',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const file of ['ward-phase05-home-today.css','ward-phase05-calendar-map.css','ward-phase05-manual-settings-review.css','ward-phase05-more-subpages.css','ward-phase05-dialogs.css']){
  assert.match(html,new RegExp('href="'+file.replaceAll('.','\\.')+'[^"]*" media="not all" data-floral-stylesheet'));
 }
 const P=require('../app-preferences.js');
 const state=P.load({getItem:()=>null});
 assert.equal(state.design,'classic');
});
