const test=require('node:test'),assert=require('node:assert/strict');
const {Notes,NOTES_KEY,choose}=require('../reader-study.js'),D=require('../app-data.js');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
test('personal and teacher notes stay separate, persist, and blank save removes only its own kind',()=>{
 const s=storage(),n=new Notes(s);n.put('1:2',1,'personal','تدبّر');n.put('1:2',1,'teacher','ضبط');const fresh=new Notes(s);
 assert.equal(fresh.get('1:2'),'تدبّر');assert.equal(fresh.get('1:2','teacher'),'ضبط');fresh.put('1:2',1,'personal','  ');assert.equal(fresh.get('1:2'),'');assert.equal(fresh.get('1:2','teacher'),'ضبط');
});
test('invalid note and quota failure cannot replace the last good in-memory note',()=>{
 const s=storage(),n=new Notes(s);n.put('1:2',1,'personal','قديم');assert.throws(()=>n.put('1:2',1,'bad','x'));assert.throws(()=>n.put('999:2',1,'personal','x'));assert.throws(()=>n.put('1:2',1,'personal','x'.repeat(4001)));
 s.setItem=()=>{throw Error('quota');};assert.throws(()=>n.put('1:2',1,'personal','جديد'));assert.equal(n.get('1:2'),'قديم');
});
test('corrupt note journal is ignored and untrusted note HTML stays plain data',()=>{
 const s=storage();s.setItem(NOTES_KEY,'{}');assert.deepEqual(new Notes(s).items,[]);const n=new Notes(s);n.put('1:2',1,'personal','<img src=x onerror=alert(1)>');assert.equal(new Notes(s).get('1:2'),'<img src=x onerror=alert(1)>');
});
test('random study choice does not repeat until its range is exhausted',()=>{
 const list=['1:1','1:2','1:3'];assert.equal(choose(list,[],()=>0),'1:1');assert.equal(choose(list,['1:1'],()=>0),'1:2');assert.equal(choose(list,['1:1','1:2'],()=>0),'1:3');assert.notEqual(choose(list,list,()=>.99),'1:3');assert.equal(choose([],[]),null);
});
test('backup roundtrips notes and night appearance and rejects malformed notes before import',()=>{
 const notes=new Notes(storage());notes.put('1:2',1,'teacher','ضبط');const b=D.backup({logs:[]},{palette:'navy',digits:'ar',calendar:'hijri',appearance:'dark'},[],notes.items),p=D.validate(b);assert.equal(p.notes[0].text,'ضبط');assert.equal(p.preferences.appearance,'dark');
 for(const patch of [{vk:'0:1'},{page:605},{kind:'automatic'},{text:4},{updatedAt:'now'}])assert.throws(()=>D.validate({...b,notes:[{...notes.items[0],...patch}]}));assert.throws(()=>D.validate({...b,displayPreferences:{...b.displayPreferences,appearance:'unknown'}}));assert.equal(D.validate({logs:[]}).notes,undefined);
});
