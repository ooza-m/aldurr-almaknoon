const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../mushaf.html'), 'utf8');
const recitation = source.slice(source.indexOf('const REC_QUERY='), source.indexOf('/* ===== ربط أزرار المتشابهات/التسميع ===== */'));
const normalize = source.match(/^const norm=.*$/m)[0];
function context(fetchImpl = async()=>({ok:true,json:async()=>({seq:0,transcript_delta:''})})) {
  const elements = new Map();
  const element = () => ({classList:{add(){},remove(){},toggle(){}},dataset:{},style:{},addEventListener(){},setAttribute(){},removeAttribute(){}});
  const c = vm.createContext({URLSearchParams,location:{search:'',origin:'https://app.test'},
    window:{addEventListener(){},DURR_CONFIG:{quranAsr:{url:'https://asr.test'}},SpeechRecognition:function(){}},
    LS:(_,fallback)=>fallback,LSet(){},localStorage:{removeItem(){}},
    performance,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,
    fetch:fetchImpl,navigator:{},ARA:String,DurrRecitation:require('../recitation-core.js'),DurrRecitationJobs:require('../recitation-jobs.js'),document:{body:element()},
    $:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);},
    paneCur:element(),DATA:{pages:{'1':{s:[{id:1}]}}},SEARCH:{},
    recMode:true,cur:1,norm:null,btoa:s=>Buffer.from(s,'binary').toString('base64'),
    ensureMuta:async()=>{},MUTA:null,updateLocalLearning(){},syncTaskSessionChip(){},
  });
  vm.runInContext(normalize+'\n'+recitation,c);
  vm.runInContext(`recSession=newRecSession();
    recSeq=['الحمد','لله','رب','العالمين'].map((expected,wi)=>({vk:'1:2',wi,seqIndex:wi,expected,el:{classList:{add(){},remove(){},toggle(){}},dataset:{}}}));
    recWords=recSeq;recPageState=makePageState();recOn=true;
    checkMutashabihV73=async()=>{};updateErrCount=()=>{};recTip=()=>{};`,c);
  return c;
}
const run = (c, code) => vm.runInContext(code,c);

test('interim speech reveals a reversible preview without committing coverage or errors',()=>{
  const c=context();run(c,`recSeq.forEach(w=>{const classes=new Set();w.el.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)};});previewSpeechV84('الحمد لله');`);
  assert.equal(run(c,`recSeq[0].el.classList.contains('rec-preview')`),true);
  assert.equal(run(c,'recPageState.covered.size'),0);assert.equal(run(c,'recWordPos'),0);assert.equal(run(c,'ERR.length'),0);assert.equal(run(c,'recSession.findings.length'),0);
  run(c,`previewSpeechV84('الحمد');`);assert.equal(run(c,`recSeq[1].el.classList.contains('rec-preview')`),false);
  run(c,'clearSpeechPreview()');assert.equal(run(c,`recSeq[0].el.classList.contains('rec-preview')`),false);
});

test('browser final results commit once, and a recognizer restart resets result indices',()=>{
  const c=context();let r;c.window.SpeechRecognition=class{constructor(){r=this;}start(){this.onstart?.();}};
  run(c,'startSpeech()');assert.equal(r.interimResults,true);
  const result=[{transcript:'الحمد لله'}];result.isFinal=false;r.onresult({resultIndex:0,results:[result]});assert.equal(run(c,'recPageState.covered.size'),0);
  result.isFinal=true;r.onresult({resultIndex:0,results:[result]});assert.equal(run(c,'recPageState.covered.size'),2);
  const count=run(c,'recSession.stats.browserChunks');r.onresult({resultIndex:0,results:[result]});assert.equal(run(c,'recSession.stats.browserChunks'),count);
  r.onend();const next=[{transcript:'رب العالمين'}];next.isFinal=true;run(c,'recOn=false');r.onresult({resultIndex:0,results:[next]});assert.equal(run(c,'recPageState.covered.size'),4);
});

test('anchored omissions are saved automatically without claiming user/acoustic confirmation',()=>{
  const c=context();run(c,`recSeq=['الحمد','لله','رب','العالمين','الرحمن','الرحيم'].map((expected,wi)=>({vk:'1:2',wi,seqIndex:wi,expected,el:{classList:{add(){},remove(){},toggle(){}},dataset:{}}}));recWords=recSeq;recPageState=makePageState();recOn=false;processTranscriptV73('الحمد لله العالمين الرحمن الرحيم','quran-asr',{confidence:1,confidence_calibrated:true});`);
  assert.equal(run(c,'ERR.length'),1);assert.equal(run(c,'recPageState.errors.size'),1);assert.equal(run(c,'ERR[0].automatic'),true);assert.equal(run(c,'ERR[0].userConfirmed'),false);assert.equal(run(c,'ERR[0].confidenceKind'),'alignment-not-acoustic');assert.equal(run(c,`recSession.findings.some(f=>f.type.startsWith('confirmed_'))`),false);
});

test('a short touch cannot record an error; long touch requires confirmation',()=>{
  const c=context();let confirms=0;c.confirm=()=>{confirms++;return false;};c.document.elementFromPoint=()=>({closest:()=>c.word});
  run(c,`Date.now=()=>1000;globalThis.word=recSeq[0].el;word.dataset.vk='1:2';word._wi=0;word.classList.contains=k=>k==='rvl';globalThis.touch={clientX:1,clientY:1};recTapStart(touch);recTapEnd(touch);`);
  assert.equal(confirms,0);assert.equal(run(c,'ERR.length'),0);
  run(c,'Date.now=()=>1500;recTapEnd(touch)');assert.equal(confirms,1);assert.equal(run(c,'ERR.length'),0);
  c.confirm=()=>true;run(c,'recTapEnd(touch)');assert.equal(run(c,'ERR.length'),1);assert.equal(run(c,'ERR[0].userConfirmed'),true);
  assert.equal(run(c,`sessionPayload().manualErrorKeys[0]`),'1:2#0');
});

test('unconfirmed findings never become persistent review-queue entries',()=>{
  const html=readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('function ingestRecitationSessionV51('),end=html.indexOf("\nwindow.addEventListener('message'",start+10),fn=html.slice(start,end);
  const c=vm.createContext({S:{recitationSessions:[],errors:[]},Date,JSON,Set,keyOf:()=> '2026-10-16',ensureLogForDateV51:()=>({}),save(){},mirrorFaceLearningV61(){},showV51Toast(){},renderErrors(){},refreshV50(){},todayKey:()=> '2026-10-16'});
  vm.runInContext(fn,c);vm.runInContext(`ingestRecitationSessionV51({id:'trial',version:84,endedAt:1,pages:[],findings:[{type:'possible_omission',vk:'1:2',page:1,userConfirmed:false}]})`,c);
  assert.equal(c.S.aiReviewQueue.length,0);assert.equal(c.S.errors.length,0);
  vm.runInContext(`ingestRecitationSessionV51({id:'unconfirmed-word',version:84,endedAt:1,pages:[{page:1,verses:[{vk:'1:2',errorWordIndexes:[0]}]}],findings:[]})`,c);
  assert.equal(c.S.errors.length,0);
  c.SURAHS=[[1,'الفاتحة']];
  vm.runInContext(`ingestRecitationSessionV51({id:'manual-word',version:84,manualErrorKeys:['1:2#0'],endedAt:1,pages:[{page:1,verses:[{vk:'1:2',errorWordIndexes:[0]}]}],findings:[]})`,c);
  assert.equal(c.S.errors.length,1);
});

test('an empty streaming delta never replays the cumulative transcript',async()=>{
  const c=context(async()=>({ok:true,json:async()=>({seq:0,streaming:true,transcript:'الحمد لله رب العالمين',transcript_delta:''})}));
  await run(c,`qasrRunId='stream_1';queueQasrChunkV73(new Float32Array(16000),16000);`);
  assert.equal(run(c,'recWordPos'),0);
  assert.equal(run(c,'recSession.stats.quranChunks'),0);
});

test('finish waits for the final response before saving and does not send a second final',async()=>{
  let respond;const requests=[];
  const c=context(async(url,opts)=>{
    if(opts.method==='DELETE')return {ok:true};
    const item=JSON.parse(opts.body);requests.push(item);
    await new Promise(r=>respond=r);
    return {ok:true,json:async()=>({seq:item.seq,streaming:true,transcript_delta:'الحمد لله رب العالمين'})};
  });
  run(c,`qasrRunId='stream_1';qasrActive=true;showRecSummary=()=>{};sendSession=p=>{globalThis.saved=p;};`);
  const finish=run(c,'finishReciteSession(false)');
  assert.equal(c.saved,undefined);
  assert.equal(requests.length,1);
  assert.equal(requests[0].final,true);
  respond();await finish;
  assert.equal(c.saved.summary.wordsCovered,4);
  assert.equal(c.saved.planCompleted,false);
  assert.equal(requests.length,1);
});

test('network failure retries identical sequence, then blocks a complete result',async()=>{
  const calls=[];
  const c=context(async(url,opts)=>{
    if(opts.method==='DELETE')return {ok:true};
    calls.push(JSON.parse(opts.body));throw new Error('offline');
  });
  run(c,`qasrRunId='stream_1';qasrActive=true;recOn=false;`);
  await run(c,'queueQasrChunkV73(new Float32Array(16000),16000)');
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
  assert.equal(run(c,'recSession.analysisIncomplete'),true);
  assert.equal(run(c,'snapshotPage(false).complete'),false);
});

test('late responses from an old stream cannot update a new recitation session',async()=>{
  let respond;
  const c=context(async()=>{await new Promise(r=>respond=r);return {ok:true,json:async()=>({seq:0,transcript_delta:'الحمد لله رب العالمين'})};});
  const pending=run(c,`qasrRunId='old_stream';queueQasrChunkV73(new Float32Array(16000),16000);`);
  run(c,`recSession=newRecSession();recSession.id='new_session';qasrRunId='new_stream';`);
  respond();await pending;
  assert.equal(run(c,'recWordPos'),0);
  assert.equal(run(c,'recSession.stats.quranChunks'),0);
});

test('automatic omission tracking continues after the missed word',()=>{
  const c=context();run(c,`recSeq=['الحمد','لله','رب','العالمين','الرحمن','الرحيم'].map((expected,wi)=>({vk:'1:2',wi,seqIndex:wi,expected,el:{classList:{add(){},remove(){},toggle(){}},dataset:{}}}));recWords=recSeq;recPageState=makePageState();recOn=false;processTranscriptV73('الحمد لله العالمين الرحمن الرحيم','quran-asr',{});`);
  assert.equal(run(c,'ERR.length'),1);
  assert.equal(run(c,`recSession.findings.some(f=>f.type==='automatic_omission')`),true);assert.equal(run(c,'recWordPos'),6);assert.equal(run(c,'recPageState.covered.size'),5);
});

test('a recall attempt with an extra-word finding remains unresolved and never completes a face',()=>{
  const c=context();
  run(c,`recSession.task='ai-review';recSession.recall={vk:'1:2'};recWords.forEach(w=>markCoverage(w,'quran-asr'));recSession.findings=[{type:'possible_extra_word',vk:'1:2',page:1}];`);
  assert.equal(run(c,'snapshotPage(false).recallSuccess'),false);
  assert.equal(run(c,'snapshotPage(false).complete'),false);
  run(c,'recSession.findings=[]');
  assert.equal(run(c,'snapshotPage(false).recallSuccess'),true);
  assert.equal(run(c,'snapshotPage(false).complete'),false);
});

test('microphone denial does not start a timer or a fake active recording',async()=>{
  const c=context();c.navigator.mediaDevices={getUserMedia:async()=>{const e=new Error('denied');e.name='NotAllowedError';throw e;}};
  run(c,'recOn=false');await run(c,'toggleRec()');
  assert.equal(run(c,'recOn'),false);
  assert.equal(run(c,'recTimerH'),null);
});

test('suspected positions do not subtract points from an otherwise identical result',()=>{
  const c=context();run(c,`recWords.forEach(w=>markCoverage(w,'quran-asr'));`);
  const score=run(c,'snapshotPage(false).score');
  run(c,`markSessionError('1:2',1,'suspected');`);
  assert.equal(run(c,'snapshotPage(false).score'),score);
});

test('recall alignment is restricted to the requested ayah',()=>{
  const c=context();run(c,`recSession.recall={vk:'1:2'};recWords.push({...recWords[0],vk:'1:3',expected:'الرحمن',wi:0,seqIndex:4});`);
  assert.equal(run(c,`alignChunkV75(['الرحمن'],4)`),null);
});

test('browser fallback drains its last final result before saving',async()=>{
  const c=context();
  let recognizer;
  c.window.SpeechRecognition=class {
    constructor(){recognizer=this;}
    start(){}
    stop(){}
  };
  run(c,`startSpeech();showRecSummary=()=>{};sendSession=p=>{globalThis.saved=p;};`);
  const finished=run(c,'finishReciteSession(false)');
  assert.equal(c.saved,undefined);
  const result=[{transcript:'الحمد لله رب العالمين'}];result.isFinal=true;
  recognizer.onresult({resultIndex:0,results:[result]});
  recognizer.onend();
  await finished;
  assert.equal(c.saved.summary.wordsCovered,4);
  assert.equal(c.saved.engine,'browser-speech');
});

test('a discarded browser recognizer cannot change the next session',async()=>{
  const c=context();let recognizer;
  c.window.SpeechRecognition=class {
    constructor(){recognizer=this;}
    start(){}
    stop(){this.onend();}
  };
  run(c,'startSpeech();recOn=false;');await run(c,'stopSpeech()');
  run(c,`recSession=newRecSession();recSession.id='another_session';`);
  const result=[{transcript:'الحمد لله رب العالمين'}];result.isFinal=true;
  recognizer.onresult({resultIndex:0,results:[result]});
  assert.equal(run(c,'recWordPos'),0);
});

test('chunked recording waits for a pause and discards silence-only buffers',()=>{
  const c=context();
  run(c,`qasrStreaming=false;globalThis.segments=[];queueQasrChunkV73=(x,rate)=>segments.push({length:x.length,rate});`);
  run(c,'collectQasrAudioV80(new Float32Array(32000),16000)');
  assert.equal(c.segments.length,0);
  assert.equal(run(c,'qasrSamples'),0);
  run(c,'collectQasrAudioV80(new Float32Array(32000).fill(.1),16000)');
  assert.equal(c.segments.length,0);
  run(c,'collectQasrAudioV80(new Float32Array(11200),16000)');
  assert.equal(c.segments.length,1);
  assert.equal(c.segments[0].length,43200);
});

test('chunked recording bounds a continuous utterance below the server size limit',()=>{
  const c=context();
  run(c,`qasrStreaming=false;globalThis.segments=[];queueQasrChunkV73=x=>segments.push(x.length);`);
  for(let i=0;i<48;i++)run(c,'collectQasrAudioV80(new Float32Array(4096).fill(.1),16000)');
  assert.equal(c.segments.length,1);
  assert.ok(c.segments[0]<=16000*12+4096);
});

test('an unready model never opens the Quran audio processor',async()=>{
  for(const info of [{engine_loaded:false,quran_specialized:true},{engine_loaded:true,quran_specialized:true,enabled:false}]){
    const c=context(async()=>({ok:true,json:async()=>info}));
    assert.equal(await run(c,'startQuranAsrV73({})'),false);
    assert.equal(run(c,'qasrActive'),false);
  }
});
