'use strict';
const frame=document.getElementById('stay-live')||document.getElementById('demo');
const range=document.getElementById('demo-range')||document.getElementById('timeline');
const output=document.getElementById('demo-output')||document.getElementById('time');
const description=document.getElementById('demo-description')||document.getElementById('explanation');
let dragging=false;
function sendSeek(){frame.contentWindow.postMessage({type:'still-demo-stay',minutes:Number(range.value),paused:dragging},'*');}
function pause(paused){frame.contentWindow.postMessage({type:'still-demo-pause',paused},'*');}
range.addEventListener('pointerdown',()=>{dragging=true;pause(true);});
range.addEventListener('input',sendSeek);
function release(){if(dragging){dragging=false;pause(false);}}
window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',release);
document.querySelectorAll('[data-minute]').forEach(button=>button.addEventListener('click',()=>{dragging=false;range.value=button.dataset.minute;sendSeek();}));
frame.addEventListener('load',sendSeek);
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||event.data?.type!=='still-demo-time')return;
 const ms=Number(event.data.elapsed);if(!Number.isFinite(ms))return;
 const seconds=Math.floor(ms/1000),minutes=ms/60000,segment=Math.floor(minutes/5),laps=Math.floor(minutes/30);
 if(!dragging)range.value=String(minutes);
 output.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 description.textContent=`${laps?`${laps}周回、`:''}${segment%6}個のドット。${segment%2===0?'リングが満ちる':'リングが消える'}区間。操作を離すと実時間で進みます。`;
});
const hero=document.getElementById('hero-preview');
if(hero)hero.addEventListener('load',()=>hero.contentWindow.postMessage({type:'still-demo-clock',minutes:12},'*'));
