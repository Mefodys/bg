#!/usr/bin/env python3
"""Build a local three-column before/after/highlighted-difference viewer."""
import json,sys,os
from pathlib import Path
from compare import decode
report=Path(sys.argv[1]).resolve()
data=json.loads((report/'comparison.json').read_text())
items=[]
for s in data['scenarios']:
 w,h,pixels=decode(report/s['diff'])
 points=[];pos=0
 while True:
  pos=pixels.find(b'\xff\x00\x40\xff',pos)
  if pos<0:break
  if pos%4==0:points.append((pos//4%w,pos//4//w))
  pos+=4
 groups=[]
 for x,y in points:
  related=[g for g in groups if g[0]-12<=x<=g[2]+12 and g[1]-12<=y<=g[3]+12]
  if related:
   g=related[0];g[0]=min(g[0],x);g[1]=min(g[1],y);g[2]=max(g[2],x);g[3]=max(g[3],y)
   for other in related[1:]:
    g[0]=min(g[0],other[0]);g[1]=min(g[1],other[1]);g[2]=max(g[2],other[2]);g[3]=max(g[3],other[3]);groups.remove(other)
  else:groups.append([x,y,x,y])
 items.append({**s,'before':os.path.relpath(s['before'],report),'after':os.path.relpath(s['after'],report),'width':w,'height':h,'regions':groups})
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Screenshot comparison</title>
<style>body{margin:20px;font:15px system-ui;color:#222838;background:#f7f8fc}h1{font-size:22px}header{display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:16px}select{max-width:95vw;padding:8px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}section{min-width:0}h2{font-size:18px;margin:10px 0}.pane{height:70vh;overflow:auto;background:white;border:1px solid #dfe1ea;border-radius:8px}.canvas{position:relative;width:100%;line-height:0}.canvas>img{width:100%;height:auto}.canvas svg{position:absolute;inset:0;width:100%;height:100%}.diff .base{opacity:.4}.diff .pixels{position:absolute;inset:0;mix-blend-mode:multiply}.summary{padding:12px;background:white;border-radius:8px;margin:12px 0}button{padding:8px}label{white-space:nowrap}#regions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}small{color:#616981}</style>
<h1>Old → new → highlighted changes</h1><h2 id="status"></h2><p id="revisions"></p><small>Same-revision repeat on fixed data. Differences indicate capture instability.</small>
<header><label>Scenario <select id="scenario"></select></label><label>Zoom <input id="zoom" type="range" min="100" max="600" step="25" value="100"><span id="scale">100%</span></label><button id="reset">Reset</button></header><div class="summary" id="summary"></div><div id="regions"></div>
<main><section><h2>Left — old</h2><div class="pane"><div class="canvas"><img id="before"></div></div></section><section><h2>Center — new</h2><div class="pane"><div class="canvas"><img id="after"></div></div></section><section><h2>Right — highlighted changes</h2><div class="pane"><div class="canvas diff"><img class="base" id="base"><img class="pixels" id="pixels"><svg id="overlay"></svg></div></div></section></main>
<p>Red marks only changed pixels. Region buttons zoom and synchronize all three panels.</p>
<script>const data=DATA;const frames=FRAMES;const select=document.querySelector('#scenario');const zoom=document.querySelector('#zoom');const panes=[...document.querySelectorAll('.pane')];let current,sync=false;
document.querySelector('#status').textContent=data.status||'';document.querySelector('#status').style.color=data.status==='REGRESSION'?'#cc0033':'#222838';document.querySelector('#revisions').textContent='Old: '+data.beforeSHA+' · New: '+data.afterSHA;
frames.forEach((f,i)=>select.add(new Option(f.id+' — '+f.changedPixels+' px',i)));
function scale(){document.querySelector('#scale').textContent=zoom.value+'%';document.querySelectorAll('.canvas').forEach(c=>c.style.width=zoom.value+'%')}
function render(){current=frames[select.value];['before','after'].forEach(k=>document.querySelector('#'+k).src=current[k]);document.querySelector('#base').src=current.after;document.querySelector('#pixels').src=current.diff;const svg=document.querySelector('#overlay');svg.setAttribute('viewBox',`0 0 ${current.width} ${current.height}`);svg.innerHTML=current.regions.map(([x,y,r,b])=>`<rect x="${Math.max(0,x-5)}" y="${Math.max(0,y-5)}" width="${r-x+11}" height="${b-y+11}" fill="none" stroke="#e6003c" stroke-width="2"/>`).join('');document.querySelector('#summary').textContent=current.changedPixels===0?'Pixels match: no changes.':`${current.status||'CHANGED'}: Changed ${current.changedPixels} of ${current.totalPixels} pixels. DOM state ${current.observedStateMatches?'matches':'differs'}.`;const regions=document.querySelector('#regions');regions.replaceChildren();current.regions.forEach((r,i)=>{const b=document.createElement('button');b.textContent='Region '+(i+1);b.onclick=()=>{zoom.value=400;scale();requestAnimationFrame(()=>{const ratio=panes[0].clientWidth*4/current.width;panes.forEach(p=>{p.scrollLeft=Math.max(0,(r[0]+r[2])/2*ratio-p.clientWidth/2);p.scrollTop=Math.max(0,(r[1]+r[3])/2*ratio-p.clientHeight/2)})})};regions.append(b)});zoom.value=100;scale();panes.forEach(p=>p.scrollTo(0,0))}
panes.forEach(p=>p.addEventListener('scroll',()=>{if(sync)return;sync=true;panes.forEach(o=>{if(o!==p){o.scrollLeft=p.scrollLeft;o.scrollTop=p.scrollTop}});requestAnimationFrame(()=>sync=false)}));select.onchange=render;zoom.oninput=scale;document.querySelector('#reset').onclick=()=>{zoom.value=100;scale();panes.forEach(p=>p.scrollTo(0,0))};render();</script></html>'''
if data['beforeSHA']!=data['afterSHA']:
 page=page.replace('Same-revision repeat on fixed data. Differences indicate capture instability.','Fixed-data revision comparison. Inspect every EXPECTED FEATURE CHANGE or REGRESSION before merging.')
page=page.replace('DATA',json.dumps({k:v for k,v in data.items() if k!='scenarios'})).replace('FRAMES',json.dumps(items))
(report/'gallery.html').write_text(page+'\n')
print(report/'gallery.html')
