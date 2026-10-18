const test=require('node:test');const assert=require('node:assert/strict');const {Locator}=require('../recitation-core.js');
const entries={'76:1':[578,'هل أتى على الإنسان حين من الدهر لم يكن شيئا مذكورا'],'76:2':[578,'إنا خلقنا الإنسان من نطفة أمشاج نبتليه فجعلناه سميعا بصيرا'],'76:3':[578,'إنا هديناه السبيل إما شاكرا وإما كفورا'],'1:1':[1,'بسم الله الرحمن الرحيم'],'1:2':[1,'الحمد لله رب العالمين'],'1:3':[1,'الرحمن الرحيم']};
test('find surah opening halfway through a page',()=>{const value=new Locator(entries).locate('هل أتى على الإنسان حين من الدهر لم يكن',{page:578});assert.equal(value?.vk,'76:1');assert.equal(value?.page,578);});
test('find later verse on same page',()=>{const value=new Locator(entries).locate('إنا هديناه السبيل إما شاكرا وإما كفورا',{page:578});assert.equal(value?.vk,'76:3');});
test('do not force a location from one ambiguous word',()=>{assert.equal(new Locator(entries).locate('الله',{page:1}),null);});
