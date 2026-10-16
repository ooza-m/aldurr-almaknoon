/* Shared display preferences. Stored date keys and printed Quran glyphs are unchanged. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.DurrPreferences=api;api.attach(root);}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='durr-display-preferences-v85';
  const PALETTES={
    rose:{name:'الوردي الكريمي',page:'#fbf7f2',surface:'#fffdfa',accent:'#98445f',accent2:'#783448',ink:'#49323f',ink2:'#654a58',muted:'#786471',wash:'#f1e1e7',wash2:'#f8eff2',soft:'#d9b4c1'},
    olive:{name:'الزيتوني الرملي',page:'#f8f7ef',surface:'#fffef8',accent:'#50623d',accent2:'#394b29',ink:'#303b29',ink2:'#536047',muted:'#68705d',wash:'#e5ead9',wash2:'#f1f3e8',soft:'#bdc9a3'},
    navy:{name:'الكحلي اللؤلؤي',page:'#f2f6f9',surface:'#fcfdff',accent:'#345d79',accent2:'#24455e',ink:'#263b4b',ink2:'#485f70',muted:'#647483',wash:'#dfeaf2',wash2:'#eef3f8',soft:'#b5cbdc'},
    plum:{name:'البنفسجي العاجي',page:'#f7f3fa',surface:'#fffdfd',accent:'#72548b',accent2:'#543b6c',ink:'#3f304d',ink2:'#61516d',muted:'#796b84',wash:'#eae0f1',wash2:'#f4edf8',soft:'#cdb8dd'}
  };
  const DESIGNS=[{id:'classic',name:'التصميم الكلاسيكي',available:true},{id:'floral',name:'تصميم الورد',available:false,futureDefault:true}];
  const MONTHS={gregorian:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],hijri:['محرّم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوّال','ذو القعدة','ذو الحجة']};
  const defaults={design:'classic',palette:'rose',digits:'ar',calendar:'gregorian',updatedAt:0};
  let current={...defaults},storage=null,win=null;
  const listeners=new Set(),formatters=new Map();
  const clean=value=>({design:'classic',palette:PALETTES[value?.palette]?value.palette:'rose',digits:value?.digits==='en'?'en':'ar',calendar:value?.calendar==='hijri'?'hijri':'gregorian',updatedAt:Number.isFinite(value?.updatedAt)?value.updatedAt:0});
  function get(){return {...current};}
  function digits(value,mode=current.digits){const latin=String(value).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));return mode==='en'?latin:latin.replace(/[0-9]/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);}
  function load(store){storage=store;try{const saved=JSON.parse(storage?.getItem(KEY)||'null');current=clean(saved||{digits:storage?.getItem('durr-num')});}catch(_){current={...defaults};}return get();}
  function set(patch,{external=false}={}){const next=clean({...current,...patch,updatedAt:external?patch.updatedAt:Date.now()});if(external&&next.updatedAt<=current.updatedAt)return get();current=next;
    try{storage?.setItem(KEY,JSON.stringify(current));storage?.setItem('durr-num',current.digits);}catch(_){}
    if(win)apply();listeners.forEach(fn=>fn(get()));return get();
  }
  function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
  function formatter(calendar,options={}){const settings={calendar:calendar==='hijri'?'islamic-umalqura':'gregory',...options},key=JSON.stringify(settings);if(!formatters.has(key))formatters.set(key,new Intl.DateTimeFormat('ar',settings));return formatters.get(key);}
  function localDate(y,m,d){return new Date(y,m-1,d,12);}
  function parse(value){if(Object.prototype.toString.call(value)==='[object Date]')return new Date(value);const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?localDate(+match[1],+match[2],+match[3]):new Date(NaN);}
  function key(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
  function parts(value,calendar=current.calendar){const date=parse(value),p={};formatter(calendar,{year:'numeric',month:'numeric',day:'numeric',numberingSystem:'latn'}).formatToParts(date).forEach(x=>{if(['year','month','day'].includes(x.type))p[x.type]=+x.value;});return p;}
  function format(value,options={},calendar=current.calendar){const date=parse(value);if(!Number.isFinite(+date))return '—';return formatter(calendar,{year:'numeric',month:'long',day:'numeric',...options,numberingSystem:current.digits==='en'?'latn':'arab'}).format(date);}
  function month(value,calendar=current.calendar){const date=parse(value),p=parts(date,calendar),start=localDate(date.getFullYear(),date.getMonth()+1,date.getDate()-p.day+1),days=[];let cursor=new Date(start);
    for(let i=0;i<32;i++){const now=parts(cursor,calendar);if(now.month!==p.month||now.year!==p.year)break;days.push({date:new Date(cursor),key:key(cursor),day:now.day});cursor.setDate(cursor.getDate()+1);}
    return {year:p.year,month:p.month,name:MONTHS[calendar][p.month-1],start,next:new Date(cursor),days};
  }
  function shiftMonth(value,step,calendar=current.calendar){const original=parts(value,calendar),m=month(value,calendar);let anchor=m.start;
    for(let i=0;i<Math.abs(step);i++){if(step>0)anchor=month(anchor,calendar).next;else{anchor=new Date(anchor);anchor.setDate(anchor.getDate()-1);anchor=month(anchor,calendar).start;}}
    const target=month(anchor,calendar);return target.days[Math.min(original.day,target.days.length)-1].date;
  }
  function fromParts(year,monthNumber,day=1,calendar=current.calendar){if(calendar==='gregorian')return localDate(year,monthNumber,day);
    const estimate=Math.floor(year*.970224+621.5774);let low=Math.floor(Date.UTC(estimate-2,0,1)/86400000),high=Math.floor(Date.UTC(estimate+2,11,31)/86400000),target=year*400+monthNumber*32+day;
    while(low<=high){const middle=Math.floor((low+high)/2),utc=new Date(middle*86400000),date=localDate(utc.getUTCFullYear(),utc.getUTCMonth()+1,utc.getUTCDate()),p=parts(date,calendar),rank=p.year*400+p.month*32+p.day;if(rank===target)return date;if(rank<target)low=middle+1;else high=middle-1;}
    throw Error('Invalid calendar date');
  }

  function picker(host,{value,onPick,min='',max='',isMarked=()=>false}){
    let anchor=parse(value||new Date()),mode='days';
    const draw=()=>{
      const m=month(anchor),p=parts(anchor),names=MONTHS[current.calendar];
      const head='<div class="dp-pop-head dpm-head"><button type="button" class="dp-nav" data-prev aria-label="الشهر السابق">›</button><button type="button" class="dp-my" data-mode>'+m.name+' '+digits(m.year)+' ▾</button><button type="button" class="dp-nav" data-next aria-label="الشهر التالي">‹</button></div>';
      let body='';
      if(mode==='years'){
        const cy=parts(new Date()).year;for(let y=Math.max(cy+2,p.year+1);y>=Math.min(cy-15,p.year-1);y--)body+='<button type="button" data-year="'+y+'">'+digits(y)+'</button>';
        body='<div class="dp-yearsel dpm-grid">'+body+'</div>';
      }else if(mode==='months'){
        body='<button type="button" data-years>'+digits(p.year)+' ▾</button><div class="dp-yearsel dpm-grid">'+names.map((x,i)=>'<button type="button" data-month="'+(i+1)+'">'+x+'</button>').join('')+'</div>';
      }else{
        for(let i=0;i<m.start.getDay();i++)body+='<span></span>';
        m.days.forEach(d=>{const disabled=(min&&d.key<min)||(max&&d.key>max);body+='<button type="button" class="dp-day dpm-day'+(d.key===value?' sel':'')+(d.key===key(new Date())?' today':'')+(isMarked(d.key,d.date.getDay())?' halaqa':'')+'" data-k="'+d.key+'"'+(disabled?' disabled':'')+'>'+digits(d.day)+'</button>';});
        body='<div class="dp-dow dpm-dow">'+['أحد','إثن','ثلا','أرب','خمي','جمع','سبت'].map(x=>'<span>'+x+'</span>').join('')+'</div><div class="dp-days dpm-days">'+body+'</div>';
      }
      const quick=mode==='days'?'<div class="dp-quick">'+[0,1,2].map((off)=>{const d=new Date();d.setDate(d.getDate()-off);const k=key(d),disabled=(min&&k<min)||(max&&k>max);return '<button type="button" data-k="'+k+'"'+(disabled?' disabled':'')+'>'+['اليوم','أمس','قبل يومين'][off]+'</button>';}).join('')+'</div>':'';
      host.innerHTML=head+body+quick;
    };
    host.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
      if(b.hasAttribute('data-prev')){anchor=shiftMonth(anchor,-1);mode='days';}
      else if(b.hasAttribute('data-next')){anchor=shiftMonth(anchor,1);mode='days';}
      else if(b.hasAttribute('data-mode'))mode=mode==='days'?'months':'years';
      else if(b.hasAttribute('data-years'))mode='years';
      else if(b.dataset.year){anchor=fromParts(+b.dataset.year,pYearMonth(),1);mode='months';}
      else if(b.dataset.month){anchor=fromParts(parts(anchor).year,+b.dataset.month,1);mode='days';}
      else if(b.dataset.k){onPick(b.dataset.k);return;}draw();
    };
    function pYearMonth(){return parts(anchor).month;}
    draw();return {refresh:draw};
  }

  function formatNumbers(root){if(!win||!root)return;const skip='script,style,textarea,input,.qline,.qw,.bism,.sname,[data-preserve-numerals]';
    const convert=node=>{if(node.nodeType===3&&node.parentElement&&!node.parentElement.closest(skip)){const value=digits(node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value;}};
    if(root.nodeType===3){convert(root);return;}const walker=win.document.createTreeWalker(root,win.NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))convert(node);
  }
  function apply(){const p=PALETTES[current.palette],root=win.document.documentElement;root.dataset.palette=current.palette;root.dataset.design='classic';root.dataset.digits=current.digits;root.dataset.calendar=current.calendar;
    win.document.querySelector('meta[name="theme-color"]')?.setAttribute('content',p.accent2);
    const vars={...p,clay:p.accent,'clay-soft':p.wash,parch:p.page,'parch-2':p.wash2,'wash-2':p.wash2,text:p.ink,'ink-2':p.ink2,'accent-2':p.accent2,gold:p.accent,'gold-soft':p.soft,pink:p.accent,'pink-soft':p.wash,'line':'color-mix(in srgb, '+p.ink+' 15%, transparent)','line-2':'color-mix(in srgb, '+p.ink+' 8%, transparent)','v50-glass':p.surface,'v50-glass-strong':p.surface,'v50-cloud':p.surface,'v50-sky':p.wash};
    Object.entries(vars).forEach(([k,v])=>{if(k!=='name')root.style.setProperty('--'+k,v);});formatNumbers(win.document.body);
  }
  function mount(host){if(!host||host.dataset.prefsMounted)return;host.dataset.prefsMounted='1';
    host.innerHTML='<section class="preferences-panel"><h3>المظهر والعرض</h3><p class="preferences-intro">تُحفظ الخيارات فورًا وتُطبّق على التطبيق والمصحف.</p>'
      +'<fieldset><legend>التصميم</legend><div class="design-options"><div class="design-current"><b>الكلاسيكي</b><small>متاح الآن · أربع مجموعات ألوان</small></div><button class="design-future" type="button" disabled><b>تصميم الورد</b><small>قريبًا · سيكون التصميم الافتراضي عند اكتماله</small></button></div></fieldset>'
      +'<fieldset><legend>ألوان التصميم الكلاسيكي</legend><div class="palette-grid">'+Object.entries(PALETTES).map(([id,p])=>'<button type="button" data-palette="'+id+'" aria-pressed="false"><span class="palette-swatches" aria-hidden="true">'+[p.page,p.soft,p.accent,p.ink].map(c=>'<i style="background:'+c+'"></i>').join('')+'</span><b>'+p.name+'</b></button>').join('')+'</div></fieldset>'
      +'<fieldset><legend>أرقام الواجهة</legend><div class="pref-segment" data-preserve-numerals><button type="button" data-digits="ar">عربية ١٢٣</button><button type="button" data-digits="en">إنجليزية 123</button></div><small>أرقام الآيات المطبوعة داخل صفحة المصحف تبقى كما هي.</small></fieldset>'
      +'<fieldset><legend>التواريخ والتقويم</legend><div class="pref-segment"><button type="button" data-calendar="gregorian">ميلادي</button><button type="button" data-calendar="hijri">هجري · أم القرى</button></div><small>يتغيّر العرض واختيار الأيام؛ تبقى المواعيد وسجلات الحفظ محفوظة في أيامها نفسها.</small></fieldset><p class="pref-saved" role="status" aria-live="polite"></p></section>';
    const sync=()=>{for(const attr of ['palette','digits','calendar'])host.querySelectorAll('[data-'+attr+']').forEach(b=>{const active=b.dataset[attr]===current[attr];b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active));});};
    host.addEventListener('click',e=>{const b=e.target.closest('[data-palette],[data-digits],[data-calendar]');if(!b)return;for(const attr of ['palette','digits','calendar'])if(b.dataset[attr])set({[attr]:b.dataset[attr]});host.querySelector('.pref-saved').textContent='حُفظت التفضيلات';});subscribe(sync);sync();
  }
  function attach(window){win=window;let store;try{store=win.localStorage;}catch(_){}load(store);apply();
    win.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{set(JSON.parse(e.newValue),{external:true});}catch(_){}}});
    const ready=()=>{win.document.querySelectorAll('[data-app-preferences]').forEach(mount);formatNumbers(win.document.body);const observer=new win.MutationObserver(records=>{observer.disconnect();records.forEach(r=>{if(r.type==='characterData')formatNumbers(r.target);else r.addedNodes.forEach(formatNumbers);});observer.observe(win.document.body,{subtree:true,childList:true,characterData:true});});observer.observe(win.document.body,{subtree:true,childList:true,characterData:true});};
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
  }
  return {KEY,PALETTES,DESIGNS,MONTHS,get,set,load,subscribe,digits,parts,format,month,shiftMonth,fromParts,parse,key,picker,mount,attach,formatNumbers};
});
