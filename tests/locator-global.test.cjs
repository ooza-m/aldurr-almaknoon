const test=require('node:test');const assert=require('node:assert/strict');const {Locator}=require('../recitation-core.js');
const reference={
 '76:1':[578,'هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا'],
 '76:2':[578,'إنا خلقنا الإنسان من نطفة أمشاج نبتليه فجعلناه سميعا بصيرا'],
 '76:3':[578,'إنا هديناه السبيل إما شاكرا وإما كفورا'],
 '75:1':[577,'لا أقسم بيوم القيامة'],
 '1:1':[1,'بسم الله الرحمن الرحيم'],
 '1:2':[1,'الحمد لله رب العالمين'],
 '2:1':[2,'الم'],
 '3:1':[50,'الم']
};
test('Al-Insan opening on non-current page',()=>{const x=new Locator(reference).locate('هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا');assert.equal(x?.vk,'76:1');assert.equal(x?.page,578)});
test('Al-Insan verse 3 starting anywhere',()=>{const x=new Locator(reference).locate('إنا هديناه السبيل إما شاكرا وإما كفورا');assert.equal(x?.vk,'76:3')});
test('ambiguous identical introductions wait',()=>{const x=new Locator(reference).locate('بسم الله الرحمن الرحيم');assert.equal(x,null)});
test('invocation plus verse locates after introduction',()=>{const x=new Locator(reference).locate('أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم هل أتى على الإنسان حين من الدهر لم يكن');assert.equal(x?.vk,'76:1')});
test('too-short utterance not enough',()=>{assert.equal(new Locator(reference).locate('إنا'),null)});
