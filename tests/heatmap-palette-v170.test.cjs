'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const heatmap=html.slice(html.indexOf('function renderHeatmap(){'),html.indexOf('function renderMonth(){'));
test('heatmap has five theme-derived levels with vivid maximum activity',()=>{
 const m=heatmap.match(/const levels=\[([\s\S]*?)\];/);
 assert.ok(m,'Missing levels palette');
 const colors=[...m[1].matchAll(/'([^']+)'/g)].map(v=>v[1]);
 assert.equal(colors.length,5);
 assert.equal(colors[4],'color-mix(in srgb, var(--gold) 82%, var(--surface))');
 assert.equal(colors[2],'color-mix(in srgb, var(--gold) 30%, var(--parch))');
 assert.ok(colors.every(x=>x.includes('var(')),'Palette levels should follow user theme');
 assert.ok(!colors[4].includes('var(--ink)'),'The highest activity color must not mix with dark ink');
});
test('heatmap legend shares exactly the same palette and today outline uses accent',()=>{
 assert.match(heatmap,/levels\.map\(\(c,i\)=>/);
 assert.match(heatmap,/outline:2px solid var\(--accent\)/);
});
function contrast(raw){
 const start=html.indexOf('const raw=',html.indexOf("cont.querySelectorAll('.pg').forEach(c=>{"));
 const end=html.indexOf("c.style.textShadow='none';",start);
 assert.ok(start>=0&&end>start,'Missing contrast calculation');
 const statement=html.slice(start,end);
 const target={style:{}};
 const getComputedStyle=()=>({backgroundColor:raw});
 new Function('c','getComputedStyle',statement)(target,getComputedStyle);
 return target.style.color;
}
test('light backgrounds choose dark numerals regardless of browser color syntax',()=>{
 for(const v of ['rgb(244, 230, 217)','color(srgb 0.95 0.88 0.85)','color(display-p3 0.95 0.88 0.85)'])
  assert.equal(contrast(v),'#241A20',v);
});
test('dark backgrounds choose light numerals regardless of syntax',()=>{
 for(const v of ['rgb(45, 32, 50)','color(srgb 0.19 0.15 0.24)'])
  assert.equal(contrast(v),'#FFFFFF',v);
});
test('custom review date input has LTR direction for iOS',()=>{
 assert.match(html,/name="startDate" type="date" dir="ltr" lang="en"/);
});
test('save button uses active palette and contrast pairing',()=>{
 assert.match(html,/#tab-settings #set-name-save\{background:var\(--accent\)!important;color:var\(--on-accent,#fff\)!important/);
});
