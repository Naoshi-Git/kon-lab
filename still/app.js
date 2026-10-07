'use strict';
const DEMO = new URLSearchParams(location.search).get('demo')==='1';
let demoPaused=false;
if(DEMO){document.documentElement.classList.add('demo-root');document.body.classList.add('demo');const kind=new URLSearchParams(location.search).get('preview');if(kind==='clock')document.body.classList.add('demo-clock');if(kind==='stay')document.body.classList.add('demo-single');}
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const dayKey = (time = Date.now()) => { const d = new Date(time); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const duration = ms => { const s = Math.floor(ms/1000); return s >= 3600 ? `${Math.floor(s/3600)}:${pad(Math.floor(s/60)%60)}:${pad(s%60)}` : `${pad(Math.floor(s/60))}:${pad(s%60)}`; };
const minutes = ms => { const m=Math.floor(ms/60000); return m>=60?`${Math.floor(m/60)}h ${pad(m%60)}m`:`${m}m`; };
function setText(node,text){ if(node.textContent!==text) node.textContent=text; }
function read(key, fallback) { if(DEMO)return fallback; try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
let storageWarning = false;
function write(key, value) { if(DEMO)return; try { localStorage.setItem(key, JSON.stringify(value)); } catch { if (!storageWarning) { $('notice').textContent = 'Records unavailable. Timing continues here.'; storageWarning = true; } } }
const prefs = read('still.preferences.v2', {});
const focus = { state:'idle', phase:'focus', length: Math.min(120, Math.max(1, Number(prefs.focusMinutes)||25))*60000, elapsed:0, last:Date.now() };
prefs.focusMinutes=focus.length/60000;
const stopwatch = { state:'idle', elapsed:0, last:Date.now() };
const stay = { state:'running', elapsed:0, last:Date.now(), hiddenAt:null, dayAmounts:{} };
let records = read('still.records.v2', {});
let ticker, wakeLock, awakeWanted = false;
const saved = read('still.session.v3', null);
if (saved && Number.isFinite(saved.elapsed) && saved.elapsed >= 0 && saved.state==='running') {
  const away = Date.now() - saved.hiddenAt;
  if (away >= 0 && away <= 30000) {
    Object.assign(stay, saved, { last:Date.now(), hiddenAt:null });
  }
}
for(let i=1;i<=6;i++) {
  const angle=i*Math.PI/3;
  const node=document.createElementNS('http://www.w3.org/2000/svg','circle');
  node.setAttribute('cx',60+55*Math.cos(angle)); node.setAttribute('cy',60+55*Math.sin(angle)); node.setAttribute('r',2.7);
  $('stay').querySelector('.milestones').append(node);
}
function announce(message) { $('notice').textContent = message; }
function saveSession(hiddenAt=Date.now()) { write('still.session.v3', { state:stay.state, elapsed:stay.elapsed, hiddenAt, dayAmounts:stay.dayAmounts }); }
function credit(from,to) {
  // Split visible time at local midnight, so each day's total and best stay accurate.
  while(from<to) {
    const d=new Date(from); const midnight=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime();
    const end=Math.min(to,midnight), amount=end-from, key=dayKey(from);
    const row=records[key] ||= { total:0, best:0 };
    stay.dayAmounts[key]=(stay.dayAmounts[key]||0)+amount;
    row.total+=amount; row.best=Math.max(row.best,stay.dayAmounts[key]);
    from=end;
  }
}
function advance(now) {
  for(const timer of [focus,stopwatch]) {
    if(timer.state==='running') timer.elapsed+=Math.max(0,now-timer.last);
    timer.last=now;
  }
  if(focus.state==='running' && focus.elapsed>=focus.length) {
    focus.elapsed=focus.length; focus.state='done'; bloom('focus');
  }
  if((!DEMO || !demoPaused) && stay.state==='running' && stay.hiddenAt===null && !document.hidden) {
    const oldMark=Math.floor(stay.elapsed/300000);
    const delta=Math.max(0,now-stay.last); stay.elapsed+=delta; credit(stay.last,now);
    if(Math.floor(stay.elapsed/300000)>oldMark) bloom('stay');
  }
  stay.last=now;
}
function bloom(id) { const orb=$(id); orb.classList.remove('celebrate'); void orb.offsetWidth; orb.classList.add('celebrate'); }
function renderOrb(id,timer,ratio,text,phase,label) {
  const mode=$(id+'-mode');
  mode.classList.toggle('engaged',timer.state!=='idle'); mode.classList.toggle('paused',timer.state==='paused');
  mode.classList.toggle('done',timer.state==='done');
  setText(mode.querySelector('.value'),text); setText(mode.querySelector('.phase'),phase);
  mode.querySelector('.progress').style.strokeDashoffset=345.576*(1-Math.max(0,Math.min(1,ratio)));
  $(id).setAttribute('aria-label',label);
}
function render() {
  const now=new Date();
  setText($('hours'),pad(now.getHours())); setText($('minutes'),pad(now.getMinutes())); setText($('seconds'),pad(now.getSeconds()));
  setText($('date'),`${pad(now.getMonth()+1)}.${pad(now.getDate())} ${['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][now.getDay()]}`);
  renderOrb('focus',focus,focus.elapsed/focus.length,duration(focus.length-focus.elapsed),focus.state==='done'?'DONE':focus.state==='paused'?'PAUSED':focus.phase==='focus'?'FOCUS':'REST',`Focus ${duration(focus.length-focus.elapsed)}. ${focus.state==='done'?'Tap for next phase':focus.state==='idle'?'Tap to start. Swipe to set minutes':'Tap to pause or resume. Hold while paused to reset'}`);
  renderOrb('stopwatch',stopwatch,(stopwatch.elapsed%60000)/60000,duration(stopwatch.elapsed),stopwatch.state==='paused'?'PAUSED':stopwatch.state==='running'?'RUNNING':'',`Stopwatch ${duration(stopwatch.elapsed)}. Tap to start, pause or resume. Hold while paused to reset`);
  const segment=Math.floor(stay.elapsed/300000), fraction=(stay.elapsed%300000)/300000;
  // A continuous ten-minute triangle: fill for five minutes, then erase for five.
  const ratio=segment%2===0?fraction:1-fraction;
  $('stay').querySelector('.progress').style.strokeDashoffset=345.576*(1-ratio);
  setText($('stay').querySelector('.value'),minutes(stay.elapsed));
  $('stay').setAttribute('aria-label',`Stay ${minutes(stay.elapsed)}. Automatic. ${segment%2===0?'Filling':'Erasing'} five-minute cycle.`);
  const marks=Math.floor((stay.elapsed%1800000)/300000);
  const laps=Math.floor(stay.elapsed/1800000), today=records[dayKey()]||{total:0,best:0};
  setText($('total'),minutes(today.total)); setText($('best'),minutes(today.best)); setText($('laps'),String(laps));
  $('lap-badge').hidden=laps===0;
  const newLap=laps!==Number($('stay-mode').dataset.laps||0);
  if(newLap && laps>0) {
    bloom('lap-badge'); $('stay-mode').classList.add('folding');
    setTimeout(()=>{ $('stay-mode').classList.remove('folding'); render(); },900);
  }
  $('stay').querySelectorAll('.milestones circle').forEach((node,i)=>node.classList.toggle('earned',$('stay-mode').classList.contains('folding') || i<marks));
  $('stay-mode').dataset.laps=String(laps);
  if(DEMO && window.parent!==window)window.parent.postMessage({type:'still-demo-time',elapsed:stay.elapsed},'*');
}
function tick() { const now=Date.now(); advance(now); render(); write('still.records.v2',records); saveSession(); ticker=setTimeout(tick,1000-Date.now()%1000); }
function toggle(id) {
  advance(Date.now());
  const timer=id==='focus'?focus:stopwatch;
  if(timer.state==='done') {
    timer.phase=timer.phase==='focus'?'rest':'focus'; timer.length=timer.phase==='rest'?300000:(Number(prefs.focusMinutes)||25)*60000;
    timer.elapsed=0; timer.state='running';
  } else timer.state=timer.state==='running'?'paused':'running';
  timer.last=Date.now(); render(); saveSession();
}
function longPress(id) {
  advance(Date.now()); const timer=id==='focus'?focus:stopwatch;
  if(timer.state==='paused') {
    timer.state='idle'; timer.elapsed=0;
    if(id==='focus') { timer.phase='focus'; timer.length=(Number(prefs.focusMinutes)||25)*60000; }
  }
  render(); saveSession();
}
for(const id of ['focus','stopwatch']) {
  const orb=$(id); let gesture=null;
  orb.addEventListener('contextmenu',e=>e.preventDefault());
  orb.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    orb.setPointerCapture(e.pointerId);
    gesture={x:e.clientX,y:e.clientY,minutes:Math.round(focus.length/60000),moved:false,held:false};
    gesture.timeout=setTimeout(()=>{if(gesture&&!gesture.moved){gesture.held=true;longPress(id);}},650);
  });
  orb.addEventListener('pointermove',e=>{
    if(!gesture) return;
    const dy=gesture.y-e.clientY;
    if(Math.hypot(dy,e.clientX-gesture.x)>9){gesture.moved=true;clearTimeout(gesture.timeout);}
    if(id==='focus'&&focus.state==='idle'&&gesture.moved){
      focus.length=Math.max(1,Math.min(120,gesture.minutes+Math.round(dy/10)))*60000;
      prefs.focusMinutes=Math.round(focus.length/60000); render();
      const mode=$('focus-mode');mode.classList.add('engaged');mode.querySelector('.phase').textContent='SET MINUTES';
    }
  });
  orb.addEventListener('pointerup',()=>{if(!gesture)return;clearTimeout(gesture.timeout);if(!gesture.held&&!gesture.moved)toggle(id);write('still.preferences.v2',prefs);gesture=null;render();});
  orb.addEventListener('pointercancel',()=>{if(gesture)clearTimeout(gesture.timeout);gesture=null;render();});
  // Keyboard and assistive-technology clicks do not produce pointer gestures.
  orb.addEventListener('click',e=>{if(e.detail===0)toggle(id);});
  orb.addEventListener('keydown',e=>{
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();longPress(id);}
    if(id==='focus'&&focus.state==='idle'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();focus.length=Math.max(60000,Math.min(7200000,focus.length+(e.key==='ArrowUp'?60000:-60000)));prefs.focusMinutes=focus.length/60000;write('still.preferences.v2',prefs);render();}
  });
}
async function acquireWake() {
  if(!awakeWanted||document.hidden||wakeLock) return;
  if(!('wakeLock' in navigator)){announce('Screen wake lock is unavailable on this device.');awakeWanted=false;updateWake();return;}
  try { wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;updateWake();}); }
  catch { announce('Screen wake lock unavailable. Check device settings and retry.');awakeWanted=false; }
  updateWake();
}
function updateWake(){ $('awake').setAttribute('aria-pressed',String(Boolean(wakeLock)));$('awake').textContent=wakeLock?'●':'◌'; }
$('awake').addEventListener('click',async()=>{awakeWanted=!awakeWanted;if(awakeWanted)await acquireWake();else{await wakeLock?.release();wakeLock=null;updateWake();}});
function leave() {
  if(stay.hiddenAt!==null)return;
  // The final visible slice must be credited even if visibility already changed.
  const now=Date.now(); if(!DEMO && stay.state==='running'){const delta=Math.max(0,now-stay.last);stay.elapsed+=delta;credit(stay.last,now);}
  stay.last=now;advance(now);stay.hiddenAt=now;clearTimeout(ticker);write('still.records.v2',records);saveSession(now);
}
function returnToPage() {
  const now=Date.now();
  if(stay.hiddenAt!==null){
    if(now-stay.hiddenAt>30000){stay.elapsed=0;stay.dayAmounts={};}
    stay.hiddenAt=null;stay.last=now;
  }
  clearTimeout(ticker);tick();acquireWake();
}
document.addEventListener('visibilitychange',()=>document.hidden?leave():returnToPage());
window.addEventListener('pagehide',leave);window.addEventListener('pageshow',()=>{if(!document.hidden)returnToPage();});
tick();
if(!DEMO && 'serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(()=>announce('Offline storage unavailable. Online use still works.'));
}
if(DEMO) window.addEventListener('message',event=>{
  if(event.source!==window.parent)return;
  if(event.data?.type==='still-demo-pause'){advance(Date.now());demoPaused=Boolean(event.data.paused);stay.last=Date.now();return;}
  if(event.data?.type==='still-demo-clock'){
    focus.state='running';focus.elapsed=2000;focus.last=Date.now();stopwatch.state='running';stopwatch.elapsed=2000;stopwatch.last=Date.now();
  } else if(event.data?.type!=='still-demo-stay')return;
  const value=Number(event.data.minutes);
  if(!Number.isFinite(value))return;
  stay.elapsed=Math.max(0,Math.min(120,value))*60000;stay.last=Date.now();
  if(typeof event.data.paused==='boolean')demoPaused=event.data.paused;
  records[dayKey()]={total:stay.elapsed,best:stay.elapsed};render();
});

