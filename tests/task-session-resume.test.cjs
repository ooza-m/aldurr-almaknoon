const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('function startTaskSessionV60('),end=source.indexOf('function renderHomeV50(',start);
assert.ok(start>=0&&end>start,'task session navigation code must exist');
const fn=source.slice(start,end);
function setup(due,previous=null,{date='2026-11-07',task='near'}={}){
 const storage=new Map(),opened=[],toasts=[];
 if(previous)storage.set('durr-active-task-session',JSON.stringify(previous));
 const ctx={Date,JSON,Math,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  todayKey:()=>date,tasksV50:()=>[{id:task,label:'مراجعة قريبة',pages:due}],
  showV51Toast:(...args)=>toasts.push(args),window:{location:{assign:url=>opened.push(url)}}};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 return{open:()=>ctx.startTaskSessionV60(task),storage,opened,toasts,plan:()=>JSON.parse(storage.get('durr-active-task-session')||'null')};
}
test('an unfinished ascending task resumes the exact still-due face',()=>{
 const old={id:'keep-ascending',task:'near',date:'2026-11-07',pages:[10,11,12],pos:1};
 const h=setup([10,11,12],old);h.open();
 assert.equal(h.plan().id,old.id);assert.equal(h.plan().pos,1);
 assert.match(h.opened[0],/[?&]p=11&/);
});
test('when paused face is completed elsewhere, resume on the next remaining page',()=>{
 const old={id:'keep-next',task:'near',date:'2026-11-07',pages:[10,11,12],pos:1};
 const h=setup([10,12],old);h.open();
 assert.equal(h.plan().id,old.id);assert.equal(h.plan().pos,1);
 assert.match(h.opened[0],/[?&]p=12&/);
});
test('descending memorization paths resume by sequence, never by numeric page comparison',()=>{
 const old={id:'keep-descending',task:'near',date:'2026-11-07',pages:[100,99,98],pos:1};
 const h=setup([100,98],old);h.open();
 assert.equal(h.plan().id,old.id);assert.equal(h.plan().pos,1);
 assert.match(h.opened[0],/[?&]p=98&/);
});
test('a previous-day session is not resumed and the first current due face is selected',()=>{
 const old={id:'stale',task:'near',date:'2026-11-06',pages:[10,11],pos:1};
 const h=setup([18,19],old);h.open();
 assert.notEqual(h.plan().id,'stale');assert.equal(h.plan().pos,0);
 assert.match(h.opened[0],/[?&]p=18&/);
});
test('no remaining scheduled pages means no navigation and no false completion',()=>{
 const h=setup([]);h.open();
 assert.equal(h.opened.length,0);assert.equal(h.plan(),null);
 assert.equal(h.toasts.length,1);
});
