'use strict';
const ns='http://www.w3.org/2000/svg';
const dots=document.getElementById('demo-dots');
for(let i=1;i<=6;i++){
  const angle=i*Math.PI/3;
  const dot=document.createElementNS(ns,'circle');
  dot.setAttribute('cx',120+105*Math.cos(angle));
  dot.setAttribute('cy',120+105*Math.sin(angle));
  dot.setAttribute('r',4.2);dots.append(dot);
}
const range=document.getElementById('demo-range');
function preview(){
  const minutes=Number(range.value),interval=Math.floor(minutes/5),laps=Math.floor(minutes/30);
  const ratio=minutes%5/5;
  const fill=interval%2===0?ratio:1-ratio;
  document.getElementById('demo-progress').style.strokeDashoffset=659.734*(1-fill);
  [...dots.children].forEach((dot,index)=>dot.classList.toggle('earned',index<interval%6));
  const label=`${Math.floor(minutes)}m`;
  document.getElementById('demo-time').textContent=label;
  document.getElementById('demo-output').textContent=label;
  const badge=document.getElementById('demo-laps');badge.hidden=!laps;badge.textContent=`◉ × ${laps}`;
  document.getElementById('stay-preview').setAttribute('aria-label',`${Math.floor(minutes)}分。${laps}周回、${interval%6}つのドットを獲得`);
  let description;
  if(minutes===0)description='開くだけで、自動スタート。最初の5分が始まります。';
  else if(minutes===30)description='6つのドットが、ひとつの周回印に。次のサイクルへ。';
  else if(minutes>=30)description=`1周を残して、次のサイクルへ。${interval%6}つ目のドットを${interval%2===0?'育てて':'残して'}います。`;
  else description=`${interval%6}つのドット。次の5分を、${interval%2===0?'満たして':'ほどいて'}いる途中。`;
  document.getElementById('demo-description').textContent=description;
}
range.addEventListener('input',preview);
document.querySelectorAll('[data-minute]').forEach(button=>button.addEventListener('click',()=>{range.value=button.dataset.minute;preview();}));
preview();
const pad=n=>String(n).padStart(2,'0');
function clock(){
  const now=new Date();
  document.getElementById('preview-hour').textContent=pad(now.getHours());
  document.getElementById('preview-minute').textContent=pad(now.getMinutes());
  document.getElementById('preview-second').textContent=pad(now.getSeconds());
  document.getElementById('preview-date').textContent=`${pad(now.getMonth()+1)}.${pad(now.getDate())} ${['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][now.getDay()]}`;
}
clock();
let tick;
function schedule(){clearInterval(tick);if(!document.hidden)tick=setInterval(clock,1000);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)clock();schedule();});schedule();
