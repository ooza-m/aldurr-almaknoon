const test=require('node:test'),assert=require('node:assert/strict'),{Tracker,align}=require('../recitation-core.js');
const words=()=>['بسم الله الرحمن الرحيم','الحمد لله رب العالمين','الرحمن الرحيم','مالك يوم الدين','اياك نعبد واياك نستعين'].flatMap((s,i)=>s.split(' ').map((expected,wi)=>({expected,wi,vk:'1:'+(i+1)})));
test('omissions hold later reveals for three seconds, then fade only omitted words',()=>{
 const {RevealGate}=require('../recitation-core.js'),t=new Tracker(words()),g=new RevealGate(t.words),r=t.feed('بسم الله الرحيم الحمد لله رب العالمين');
 let s=g.update(r.ops,t.errors,100);assert.equal(s.waiting,true);assert.ok(s.visible.every(v=>v.word.index<2));
 s=g.update([],t.errors,3099);assert.equal(s.waiting,true);s=g.update([],t.errors,3100);assert.equal(s.waiting,false);
 assert.equal(s.visible.find(v=>v.word.index===2).omitted,true);assert.equal(s.visible.find(v=>v.word.index===3).omitted,false);
});
test('repair before the omission deadline releases the gate immediately',()=>{
 const {RevealGate}=require('../recitation-core.js'),t=new Tracker(words()),g=new RevealGate(t.words);
 let r=t.feed('بسم الله الرحيم الحمد لله رب العالمين');g.update(r.ops,t.errors,100);r=t.feed('الرحمن الرحيم الحمد لله رب العالمين');
 const s=g.update(r.ops,t.errors,200);assert.equal(s.waiting,false);assert.ok(s.visible.every(v=>!v.omitted));
});
test('whole-Quran locator finds distinct passages but waits on repeated verses',()=>{
 const {Locator}=require('../recitation-core.js'),search=require('../data/mushaf-search.json'),l=new Locator(search);
 for(const vk of ['103:2','44:3','114:1','45:3'])assert.equal(l.locate(search[vk][1]).vk,vk);
 assert.equal(l.locate('فبأي آلاء ربكما تكذبان'),null);assert.equal(l.locate('الله'),null);
});
test('error taxonomy distinguishes omission, extra and substitution without claiming acoustic tashkeel',()=>{
 const {errorInfo}=require('../recitation-core.js');assert.equal(errorInfo({type:'extra'}).group,'extra');assert.equal(errorInfo({type:'substitution'}).label,'استبدال كلمة');
 const errors=[0,1].map(wi=>({vk:'1:1',wi,type:'omission',active:true}));assert.equal(errorInfo(errors[0],errors,errors).label,'سقوط آية كاملة');
 assert.match(errorInfo({type:'tashkeel'}).label,/المعلّمة/);
});
test('initial recitation locates a middle ayah without counting its preceding words',()=>{const t=new Tracker(words()),r=t.feed('الحمد لله رب العالمين');assert.equal(r.start,4);assert.equal(r.end,8);assert.equal(t.covered.size,4);assert.equal(t.errors.size,0);});
test('an omitted word does not stop subsequent words or the next ayah',()=>{const t=new Tracker(words()),r=t.feed('بسم الله الرحيم الحمد لله رب العالمين');assert.equal(r.end,8);assert.equal(t.errors.get('1:1#2').type,'omission');assert.ok(t.covered.has('1:2#3'));});
test('a substituted word is recorded automatically with its heard text',()=>{const t=new Tracker(words());t.feed('الحمد لله غريب العالمين الرحمن الرحيم');const e=t.errors.get('1:2#2');assert.equal(e.type,'substitution');assert.equal(e.heard,'غريب');assert.equal(e.automatic,true);assert.equal(e.confidenceKind,'alignment-not-acoustic');assert.equal(t.cursor,10);});
test('self-correction resolves the active error but preserves its history',()=>{const t=new Tracker(words());t.feed('الحمد لله غريب العالمين الرحمن الرحيم');t.feed('رب العالمين الرحمن الرحيم');assert.equal(t.errors.get('1:2#2').active,false);assert.ok(t.errors.get('1:2#2').correctedAt);assert.equal(t.events.length,1);});
test('a repeated repair does not create a new extra-word error',()=>{const t=new Tracker(words());t.feed('الحمد لله لله رب العالمين');assert.equal(t.errors.size,0);assert.equal(t.cursor,8);});
test('interim results preview words after a possible mistake without saving them',()=>{const t=new Tracker(words()),r=t.preview('الحمد لله غريب العالمين الرحمن الرحيم');assert.ok(r.ops.some(o=>o.word?.expected==='الرحيم'));assert.equal(t.covered.size,0);assert.equal(t.errors.size,0);assert.equal(t.located,false);});
test('silence, noise and a single ambiguous word never become omission errors',()=>{const t=new Tracker(words());for(const text of ['','ضوضاء غير مفهومة','الله'])t.feed(text);assert.equal(t.errors.size,0);});
test('recall alignment cannot leave its selected verse in either direction',()=>{assert.equal(align(words(),'بسم الله الرحمن الرحيم',{recall:'1:4'}),null);const t=new Tracker(words(),{recall:'1:4'}),r=t.feed('مالك يوم الدين');assert.equal(r.end,13);assert.equal(t.covered.size,3);});
test('a dismissed detection cannot be resurrected by replay of the same transcript',()=>{const t=new Tracker(words());t.feed('الحمد لله غريب العالمين الرحمن الرحيم');t.dismiss('1:2#2');const r=t.feed('الحمد لله غريب العالمين الرحمن الرحيم');assert.equal(t.errors.get('1:2#2').active,false);assert.equal(r.updates.filter(e=>e.active).length,0);});
test('recognized modern spelling is equivalent to verified Quran orthographic aliases',()=>{const w='واقيموا الصلواة وءاتوا الزكواة واركعوا مع الراكعين'.split(' ').map((expected,wi)=>({expected,wi,vk:'2:43'})),t=new Tracker(w);t.feed('وأقيموا الصلاة وآتوا الزكاة واركعوا مع الراكعين');assert.equal(t.errors.size,0);assert.equal(t.covered.size,w.length);});
test('ASR joining or splitting a word is not counted as a recitation mistake',()=>{const w=['ياايها','الذين','امنوا','الحمد','لله'].map((expected,wi)=>({expected,wi,vk:'2:1'})),t=new Tracker(w);t.feed('يا أيها الذين آمنوا الحمدلله');assert.equal(t.errors.size,0);assert.equal(t.covered.size,w.length);});
test('an identical repeated ayah waits for distinguishing continuation instead of choosing a wrong start',()=>{const w='فباي الاء ربكما تكذبان مرج البحرين يلتقيان فباي الاء ربكما تكذبان بينهما برزخ لا يبغيان'.split(' ').map((expected,wi)=>({expected,wi,vk:'55:1'})),t=new Tracker(w);assert.equal(t.feed('فباي الاء ربكما تكذبان'),null);const r=t.feed('بينهما برزخ لا يبغيان');assert.equal(r.start,7);assert.equal(t.errors.size,0);});
test('a similar but different long word is not silently credited as correct',()=>{const w='الحمد لله المستغفرين بالاسحار الرحمن الرحيم'.split(' ').map((expected,wi)=>({expected,wi,vk:'3:1'})),t=new Tracker(w);t.feed('الحمد لله المستغفرون بالأسحار الرحمن الرحيم');assert.equal(t.errors.get('3:1#2').type,'substitution');assert.equal(t.covered.has('3:1#2'),false);});
test('unrecognized noise cannot poison all later correctly recognized chunks',()=>{const t=new Tracker(words());t.feed(Array(30).fill('ضوضاء').join(' '));const r=t.feed('الحمد لله رب العالمين');assert.equal(r.start,4);assert.equal(t.covered.size,4);assert.equal(t.errors.size,0);});
test('a mistake split across recognizer chunks uses the previous confirmed word as an anchor',()=>{const t=new Tracker(words());t.feed('الحمد لله');t.feed('غريب العالمين');assert.equal(t.errors.get('1:2#2').type,'substitution');assert.equal(t.cursor,8);});
