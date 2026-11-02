const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'../mushaf.html'),'utf8');
const begin=source.indexOf("const REVIEW_DRAFT_KEY_V119=");
const end=source.indexOf("let pendingReviewApprovalV118=null;",begin);
assert.ok(begin>=0&&end>begin,'draft helper functions must exist');
function setup(){
 const data=new Map();
 const context=vm.createContext({LS:(k,f)=>data.has(k)?data.get(k):f,LSet:(k,v)=>data.set(k,v),
 localStorage:{removeItem:k=>data.delete(k)},recTip(){}});
 vm.runInContext(source.slice(begin,end),context);
 return{data,run:code=>vm.runInContext(code,context)};
}
test('unapproved pages and quality choices survive reload',()=>{
 const {run}=setup();
 run("saveReviewDraftV119({id:'s1',task:'near',pages:[{page:125,complete:false,draftApproved:true,draftQuality:'needs'}]})");
 assert.equal(run('loadReviewDraftV119().pages[0].draftApproved'),true);
 assert.equal(run('loadReviewDraftV119().pages[0].draftQuality'),'needs');
 assert.equal(run('loadReviewDraftV119().pages[0].complete'),false);
});
test('approved sessions do not reappear as drafts',()=>{
 const {run}=setup();
 run("saveReviewDraftV119({id:'s1',pages:[{page:125}],userReviewed:true})");
 assert.equal(run('loadReviewDraftV119()'),null);
});
test('clearing one session never deletes another draft',()=>{
 const {run}=setup();
 run("saveReviewDraftV119({id:'s2',pages:[{page:126}]})");
 run("clearReviewDraftV119('s1')");
 assert.equal(run('loadReviewDraftV119().id'),'s2');
 run("clearReviewDraftV119('s2')");
 assert.equal(run('loadReviewDraftV119()'),null);
});
