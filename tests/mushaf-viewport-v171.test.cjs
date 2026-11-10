'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const mushaf=fs.readFileSync(path.join(__dirname,'..','mushaf.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','reader-shell.css'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
const a=mushaf.indexOf('function readerInputFocusedV171()');
const b=mushaf.indexOf('readerToolsV86=DurrReaderUI.mount',a);
assert.ok(a>=0&&b>a,'Viewport controller must exist');
const source=mushaf.slice(a,b);
function fixture(){
 let height=750,fits=0;
 const dimensions=[];
 const vv={get height(){return height},addEventListener(){}};
 const win={visualViewport:vv,innerHeight:750,addEventListener(){}};
 const doc={activeElement:null,documentElement:{clientHeight:750,style:{setProperty:(key,value)=>dimensions.push([key,value])}},addEventListener(){}};
 const fn=new Function('window','visualViewport','document','requestAnimationFrame','paneCur','panePrev','paneNext','fitPane',source+';return syncReaderViewport');
 const sync=fn(win,vv,doc,cb=>cb(),{},{},{},()=>{fits++});
 return {sync,doc,dimensions,setHeight:v=>{height=v},fitCount:()=>fits};
}
test('viewport remeasures Quran once and skips unchanged visual-viewport scroll',()=>{
 const f=fixture();f.sync();f.sync();assert.equal(f.fitCount(),3);assert.equal(f.dimensions.length,1);
});
test('keyboard shrinks overlay without reflowing the QCF glyph pane',()=>{
 const f=fixture();f.sync();f.doc.activeElement={matches:()=>true};
 f.setHeight(430);f.sync();
 assert.equal(f.fitCount(),3);assert.equal(f.dimensions.at(-1)[1],'430px');
});
test('keyboard dismissal recalibrates the original Quran reading height',()=>{
 const f=fixture();f.sync();f.doc.activeElement={matches:()=>true};f.setHeight(430);f.sync();
 f.doc.activeElement=null;f.setHeight(750);f.sync();
 assert.equal(f.fitCount(),6);assert.equal(f.dimensions.at(-1)[1],'750px');
});
test('reader overlays and form controls respect iOS safe areas and keyboard input size',()=>{
 assert.match(css,/\.ov-body\{[\s\S]*?padding-bottom:max\(26px/);
 assert.match(css,/font-size:max\(16px,1rem\)/);
 assert.match(css,/calc\(var\(--app-vh,100dvh\) - var\(--reader-safe-top\) - 8px\)/);
});
test('new stylesheet version is matched in Mushaf and Service Worker',()=>{
 assert.match(mushaf,/reader-shell\.css\?v=174/);
 assert.match(sw,/reader-shell\.css\?v=174/);
});
