export const PLAYER_COMPARE_ENHANCEMENTS = String.raw`
<style>
.power-showcase-wrap{display:none!important}
.compare-metric[hidden]{display:none!important}
.ee-build-compare{margin:14px 0;padding:12px;border:1px solid var(--border,#29425e);border-radius:14px;background:var(--panel,#102238)}.ee-build-compare>summary{font-size:13px;font-weight:700;cursor:pointer;list-style:none}.ee-build-compare>summary::-webkit-details-marker{display:none}.ee-build-compare[open]{display:grid;gap:8px}.ee-build-compare>summary:before{content:'＋';margin-right:6px}.ee-build-compare[open]>summary:before{content:'−'}.ee-build-row{padding:8px 0;border-bottom:1px solid var(--border,#29425e)}.ee-build-name{display:block;font-size:12px;margin-bottom:6px;overflow-wrap:anywhere}.ee-build-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.ee-build-value{min-width:0;padding:7px;border:1px solid var(--border,#29425e);border-radius:8px}.ee-build-value span{display:block;font-size:10px;color:var(--sub,#91a7bf);margin-bottom:4px}.ee-build-value b{display:block;font-size:11px;font-weight:600;overflow-wrap:anywhere}@media(min-width:700px){.ee-build-values{grid-template-columns:repeat(4,minmax(0,1fr))}}

.ee-compare-details{margin:14px 0;border:1px solid var(--border,#29425e);border-radius:12px;padding:10px 12px;background:var(--panel,#102238)}.ee-compare-details>summary{cursor:pointer;font-weight:700;font-size:13px;color:var(--text,#e8f3ff);padding:3px}.ee-compare-details[open]{display:grid;gap:12px}.ee-compare-details .compare-player-cards{margin-top:8px}
.ee-compare-chart-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 14px}
.ee-compare-chart-tools button{border:1px solid var(--border,#29425e);background:var(--panel,#102238);color:var(--text,#e8f3ff);border-radius:9px;padding:7px 10px;font:inherit;font-size:12px}
.ee-compare-chart-tools button[aria-pressed="true"]{border-color:#42d9ff;background:#16364d;box-shadow:0 0 0 1px #42d9ff55}
.ee-split-ring{width:min(100%,210px);aspect-ratio:1;position:relative;margin:4px auto 8px;display:grid;place-items:center}
.ee-split-ring svg{width:100%;height:100%;overflow:visible;transform:rotate(-90deg)}
.ee-split-ring circle{fill:none;stroke-width:12}
.ee-split-ring .track{stroke:var(--border,#29425e);opacity:.8}
.ee-split-ring .slice{transition:stroke-dasharray 2.2s cubic-bezier(.2,.8,.2,1),stroke-dashoffset 2.2s}
.ee-split-ring .slice-a{stroke:#ffd166;filter:drop-shadow(0 0 4px #ffd166aa)}
.ee-split-ring .slice-b{stroke:#42d9ff;filter:drop-shadow(0 0 4px #42d9ffaa)}
.ee-split-ring .ee-center{position:absolute;text-align:center;max-width:76%;font-weight:800;font-size:clamp(15px,4vw,22px);line-height:1.15}
.ee-split-ring .ee-center small{display:block;font-size:10px;font-weight:600;color:var(--sub,#91a7bf);margin-top:5px}
.ee-spark-layer{position:absolute;inset:0;pointer-events:none}
.ee-spark-layer i{position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:var(--spark);box-shadow:0 0 8px 2px var(--spark);animation:ee-spark 3.6s ease-out var(--delay) infinite;transform:rotate(var(--angle)) translateY(-38px)}
@keyframes ee-spark{0%,72%,100%{opacity:0;transform:rotate(var(--angle)) translateY(-38px) scale(.35)}8%{opacity:1}45%{opacity:.8;transform:rotate(var(--angle)) translateY(calc(-38px - var(--distance))) scale(.9)}}
.ee-compare-bars{display:grid;gap:9px;margin:12px 0;min-width:0;animation:ee-motion-in 1.4s ease both}
.ee-compare-bar-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;font-size:12px}
.ee-compare-bar-row .bar-label{grid-column:1/-1;display:flex;justify-content:space-between;gap:8px}
.ee-compare-bar-track{grid-column:1/-1;height:9px;background:var(--border,#29425e);border-radius:99px;overflow:hidden;display:flex}
.ee-compare-bar-track span{display:block;height:100%;flex:0 0 auto;max-width:100%;transition:width .8s ease}
.ee-compare-bar-track .a{background:#ffd166}.ee-compare-bar-track .b{background:#42d9ff}
.ee-compare-numeric{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;animation:ee-motion-in 1.4s ease both}
.ee-compare-numeric>div{padding:10px;border:1px solid var(--border,#29425e);border-radius:10px;text-align:center;min-width:0}
.ee-compare-numeric small{display:block;white-space:normal;overflow-wrap:normal;word-break:normal;color:var(--sub,#91a7bf);font-size:11px;line-height:1.25}
.ee-compare-numeric strong{display:block;font-size:clamp(13px,3.8vw,16px);margin-top:5px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.ee-compare-chart-note{font-size:11px;color:var(--sub,#91a7bf);text-align:center;margin:6px 0}.mystic-card{transition:transform 1.2s ease,box-shadow 1.2s ease}.mystic-card.ee-motion-in{animation:ee-motion-in 1.6s cubic-bezier(.16,1,.3,1) both}@keyframes ee-motion-in{0%{opacity:.3;transform:translateY(12px) scale(.98)}70%{opacity:1;transform:translateY(-2px) scale(1.005)}100%{transform:translateY(0) scale(1)}}
@media(prefers-reduced-motion:reduce){.ee-split-ring .slice{transition:none}.ee-spark-layer i{animation:none;display:none}}
.ee-growth-comparison{margin:14px 0;padding:12px;border:1px solid var(--border,#29425e);border-radius:14px;background:var(--panel,#102238);min-width:0}.ee-growth-comparison h2{font-size:15px;margin:0 0 5px}.ee-growth-comparison p{font-size:11px;color:var(--sub,#91a7bf);margin:0 0 12px}.ee-growth-comparison h3{font-size:12px;margin:12px 0 6px}.ee-growth-table-wrap{overflow-x:auto;max-width:100%}.ee-growth-table{width:100%;border-collapse:collapse;font-size:11px;min-width:260px}.ee-growth-table th,.ee-growth-table td{padding:7px 6px;border-bottom:1px solid var(--border,#29425e);text-align:left;vertical-align:top;overflow-wrap:anywhere}.ee-growth-table thead th{color:var(--sub,#91a7bf);font-weight:600}.ee-growth-table tbody th{font-weight:700;min-width:82px}@media(max-width:480px){.ee-growth-comparison{padding:9px}.ee-growth-table{font-size:10px}.ee-growth-table th,.ee-growth-table td{padding:6px 4px}}</style>
<script>
(function(){
const colors=['#ffd166','#42d9ff','#a18aff','#5ee6a8'];
const fmt=v=>{if(v==null||!Number.isFinite(Number(v)))return '—';try{return new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(Number(v))}catch{return String(v)}};
const safeText=e=>String(e&&e.textContent||'').trim();
function collapseDetails(){
 const sec=document.querySelector('.mystic-section');
 if(!sec)return;
 let panel=document.querySelector('.ee-compare-details');
 if(!panel){
  panel=document.createElement('details');panel.className='ee-compare-details';
  const summary=document.createElement('summary');summary.textContent='詳細プロフィール・一覧・履歴（必要なときに開く）';panel.appendChild(summary);
  sec.insertAdjacentElement('afterend',panel);
 }
 // Never move a wrapper that contains the comparison section/panel into its own descendant.
 // Doing so raises HierarchyRequestError and aborts the rest of this enhancement script.
 ['.power-showcase-wrap','.compare-player-cards','.table-wrap'].forEach(selector=>{
  document.querySelectorAll(selector).forEach(el=>{
   if(el===panel||el.contains(panel)||panel.contains(el)||el.closest('.ee-compare-details'))return;
   panel.appendChild(el);
  });
 });
}
function enhance(){
 collapseDetails();
 document.querySelectorAll('.compare-metric').forEach(row=>{const label=safeText(row.querySelector('span'));if(/^(戦力|撃破数|役場レベル|役場|VIP|VIPレベル|30日間の戦力変化)$/.test(label))row.hidden=true});
 const table=document.querySelector('.table-wrap table');
 if(table){[...table.querySelectorAll('tr')].forEach(tr=>{const label=safeText(tr.querySelector('th,td'));if(/^(戦力|撃破数|役場レベル|役場|VIP|VIPレベル|30日間の戦力変化)$/.test(label))tr.hidden=true})}
 if(table&&!document.querySelector('.ee-build-compare')){
  const rows=[...table.querySelectorAll('tr')].filter(tr=>/^(闘技場防衛編成：|防衛編成装備：|英雄スキル：|専用装備：|領主装備：)/.test(safeText(tr.querySelector('th,td'))));
  if(rows.length){
   const panel=document.createElement('details');panel.className='ee-build-compare';
   const title=document.createElement('summary');title.textContent='育成要素の比較（詳細）';panel.appendChild(title);
   const headers=[...table.querySelectorAll('thead th')].slice(1).map(safeText);
   let lastGroup='';
   rows.forEach(tr=>{const cells=[...tr.children];const rawLabel=safeText(cells[0]);const group=(rawLabel.match(/^(闘技場防衛編成|防衛編成装備|英雄スキル|専用装備|領主装備)：/)||[])[1]||'';if(group!==lastGroup){const sub=document.createElement('h3');sub.textContent=group;panel.appendChild(sub);lastGroup=group}const card=document.createElement('article');card.className='ee-build-row';
    const name=document.createElement('strong');name.className='ee-build-name';name.textContent=rawLabel.replace(/^(闘技場防衛編成：|防衛編成装備：|英雄スキル：|専用装備：|領主装備：)/,'');card.appendChild(name);
    const values=document.createElement('div');values.className='ee-build-values';
    cells.slice(1).forEach((cell,i)=>{const item=document.createElement('div');item.className='ee-build-value';const who=document.createElement('span');who.textContent=headers[i]||('プレイヤー'+(i+1));const val=document.createElement('b');val.textContent=safeText(cell)||'—';item.append(who,val);values.appendChild(item)});
    card.appendChild(values);panel.appendChild(card);
   });
   const sec=document.querySelector('.mystic-section');if(sec)sec.before(panel);else table.before(panel);
  }
 }

 const sec=document.querySelector('.mystic-section');
 if(!sec||sec.dataset.eeEnhanced==='1')return;
 const cards=[...sec.querySelectorAll('.mystic-card')];
 if(!cards.length)return;
 sec.dataset.eeEnhanced='1';
 const tools=document.createElement('div');tools.className='ee-compare-chart-tools';tools.setAttribute('aria-label','グラフ表示設定');
 const modes=[['ring','分割リング'],['bar','比較バー'],['radar','レーダー'],['number','数値']];
 let mode='ring';try{mode=localStorage.getItem('eagleeye-player-compare-chart-v1')||'ring'}catch{}
 if(!modes.some(x=>x[0]===mode))mode='ring';
 const status=document.createElement('div');status.className='ee-compare-chart-note';status.setAttribute('aria-live','polite');
 const buttons={};
 modes.forEach(([key,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.mode=key;b.setAttribute('aria-pressed',String(key===mode));b.addEventListener('click',()=>{mode=key;try{localStorage.setItem('eagleeye-player-compare-chart-v1',mode)}catch{}Object.entries(buttons).forEach(([k,node])=>node.setAttribute('aria-pressed',String(k===mode)));renderAll()});buttons[key]=b;tools.appendChild(b)});
 sec.insertBefore(tools,sec.children[1]||null);sec.insertBefore(status,tools.nextSibling);
 const readEntries=card=>[...card.querySelectorAll('.mystic-value')].map((cell,i)=>{const smalls=[...cell.querySelectorAll('small')];const name=safeText(smalls[0]);const n=cell.querySelector('.counter');const api=smalls.find(el=>/^API値\\s*[:：]/.test(safeText(el)));const apiText=api?safeText(api).replace(/^API値\\s*[:：]\\s*/, '').replace(/,/g,''):'';const raw=apiText!==''&&Number.isFinite(Number(apiText))?Number(apiText):(n&&n.dataset.target!==''&&Number.isFinite(Number(n.dataset.target))?Number(n.dataset.target):null);return{name:name||('プレイヤー'+(i+1)),score:raw,display:n?safeText(n):'—',stage:false,color:colors[i%colors.length]}});
 function renderCard(card){
  const entries=readEntries(card),available=entries.filter(x=>x.score!==null);
  const existing=card.querySelector('.mystic-ring');if(existing)existing.style.display='none';
  const values=card.querySelector('.mystic-values');let view=card.querySelector('.ee-chart-view');
  if(!view){view=document.createElement('div');view.className='ee-chart-view';if(values)values.after(view);else card.appendChild(view)}
  view.replaceChildren();
  if(entries.some(e=>e.stage)){const msg=document.createElement('div');msg.className='ee-compare-chart-note';msg.textContent='ステージ表記のランキングは数値グラフの対象外です。上のゲーム表示値で比較してください。';view.appendChild(msg);return}if(entries.length<2||available.length<2){const msg=document.createElement('div');msg.className='ee-compare-chart-note';msg.textContent='比較できる実スコアが2人分以上そろうと表示します。';view.appendChild(msg);return}
  const players=available,maximum=Math.max(1,...players.map(e=>Math.max(0,e.score))),sum=players.reduce((total,e)=>total+Math.max(0,e.score),0);
  if(mode==='ring'){
   const ring=document.createElement('div');ring.className='ee-split-ring';
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('aria-hidden','true');
   const circ=2*Math.PI*48,track=document.createElementNS(ns,'circle');track.setAttribute('class','track');track.setAttribute('cx','60');track.setAttribute('cy','60');track.setAttribute('r','48');svg.appendChild(track);
   let offset=0;players.forEach((e,i)=>{const circle=document.createElementNS(ns,'circle');circle.setAttribute('class','slice');circle.setAttribute('cx','60');circle.setAttribute('cy','60');circle.setAttribute('r','48');circle.style.stroke=colors[i%colors.length];circle.style.filter='drop-shadow(0 0 4px '+colors[i%colors.length]+'88)';const portion=sum>0?Math.max(0,e.score)/sum:1/players.length;circle.style.strokeDasharray=(portion*circ)+' '+(circ-portion*circ);circle.style.strokeDashoffset=String(-offset);offset+=portion*circ;svg.appendChild(circle)});
   ring.appendChild(svg);const center=document.createElement('div');center.className='ee-center';center.textContent=players.length+'人';const sm=document.createElement('small');sm.textContent='比較中';center.appendChild(sm);ring.appendChild(center);
   if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const layer=document.createElement('div');layer.className='ee-spark-layer';players.forEach((e,i)=>{const p=document.createElement('i');p.style.setProperty('--angle',(players.slice(0,i+1).reduce((n,x)=>n+(sum>0?Math.max(0,x.score)/sum:1/players.length),0)*360)+'deg');p.style.setProperty('--distance',(25+(i%4)*10)+'px');p.style.setProperty('--delay',(-i*240)+'ms');p.style.setProperty('--spark',colors[i%colors.length]);layer.appendChild(p)});ring.appendChild(layer)}
   const legend=document.createElement('div');legend.className='ee-compare-chart-note';legend.textContent=players.map((e,i)=>e.name+' '+fmt(e.score)).join(' ／ ');view.append(ring,legend);
  }else if(mode==='bar'){
   const wrap=document.createElement('div');wrap.className='ee-compare-bars';
   players.forEach((e,i)=>{const row=document.createElement('div');row.className='ee-compare-bar-row';const label=document.createElement('div');label.className='bar-label';const n=document.createElement('span');n.textContent=e.name;const v=document.createElement('strong');v.textContent=fmt(e.score);label.append(n,v);const track=document.createElement('div');track.className='ee-compare-bar-track';const fill=document.createElement('span');fill.className=i===0?'a':'b';fill.style.background=colors[i%colors.length];fill.style.setProperty('width',(Math.max(0,e.score)/maximum*100)+'%','important');track.appendChild(fill);row.append(label,track);wrap.appendChild(row)});view.appendChild(wrap);
  }else if(mode==='number'){
   const wrap=document.createElement('div');wrap.className='ee-compare-numeric';wrap.style.gridTemplateColumns='repeat('+Math.min(2,players.length)+',minmax(0,1fr))';
   players.forEach(e=>{const cell=document.createElement('div');const name=document.createElement('small');name.textContent=e.name;name.title=e.name;const val=document.createElement('strong');val.textContent=fmt(e.score);val.style.color=colors[players.indexOf(e)%colors.length];cell.append(name,val);wrap.appendChild(cell)});
   const sorted=[...players].sort((a,b)=>b.score-a.score),note=document.createElement('div');note.className='ee-compare-chart-note';note.textContent='順位：'+sorted.map((e,i)=>(i+1)+'. '+e.name).join(' ／ ');view.append(wrap,note);
  }else{const msg=document.createElement('div');msg.className='ee-compare-chart-note';msg.textContent='';view.appendChild(msg)}
 }
 const radarHost=document.createElement('div');radarHost.className='ee-radar-wrap';radarHost.hidden=true;
 radarHost.style.maxWidth='440px';radarHost.style.margin='12px auto';
 sec.insertBefore(radarHost,status.nextSibling);
 function renderRadar(){
  radarHost.replaceChildren();
  // Fixed internal offsets for the six Mystic Trial rankings only.
  const offsets={
   '闘技場':10000,'生命の森':20000,'水晶鉱山':30000,
   '知識の枢軸':40000,'溶岩要塞':50000,'輝光の塔':60000
  };
  const cards=[...sec.querySelectorAll('.mystic-grid > .mystic-card.is-sub:not([data-ee-custom-board])')];
  const metrics=cards.map(card=>{
   const label=safeText(card.querySelector('.mystic-name'));
   const offset=offsets[label];
   const entries=readEntries(card).map(entry=>({...entry,corrected:entry.score===null?null:entry.score-offset}));
   return {label,offset,entries};
  }).filter(row=>Number.isFinite(row.offset)&&row.entries.length>=2&&row.entries.every(entry=>Number.isFinite(entry.corrected)&&entry.corrected>=0));
  const required=['闘技場','生命の森','水晶鉱山','知識の枢軸','溶岩要塞','輝光の塔'];
  const ordered=required.map(label=>metrics.find(row=>row.label===label)).filter(Boolean);
  if(ordered.length!==6){
   status.textContent='秘境の試練6項目すべてのAPI値がそろうと、オフセット補正後のレーダーを表示します。';
   return;
  }
  const playerCount=Math.min(...ordered.map(row=>row.entries.length));
  const names=ordered[0].entries.slice(0,playerCount).map(entry=>entry.name);
  if(playerCount<2||ordered.some(row=>row.entries.slice(0,playerCount).some((entry,index)=>entry.name!==names[index]))){
   status.textContent='秘境の試練6項目で比較対象の順番が一致しないため、レーダーを表示できません。';
   return;
  }
  const maxPerAxis=2000;
  status.textContent='秘境の試練のみ。各項目はオフセット補正後の値を使用し、2,000を100%として表示します。6項目合計は12,000を100%とします。';
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 340 340');svg.setAttribute('role','img');svg.setAttribute('aria-label','オフセット補正済み秘境の試練6項目レーダーチャート');
  svg.style.width='100%';svg.style.maxWidth='440px';svg.style.display='block';svg.style.margin='0 auto';
  const cx=170,cy=158,radius=100,count=ordered.length;
  const point=(index,r)=>{const angle=(-Math.PI/2)+(Math.PI*2*index/count);return [cx+Math.cos(angle)*r,cy+Math.sin(angle)*r]};
  for(let level=1;level<=4;level++){
   const pts=ordered.map((_,i)=>point(i,radius*level/4).join(',')).join(' ');
   const poly=document.createElementNS(ns,'polygon');poly.setAttribute('points',pts);poly.setAttribute('fill','none');poly.setAttribute('stroke','var(--border,#29425e)');poly.setAttribute('stroke-width','1');svg.appendChild(poly);
   const tick=document.createElementNS(ns,'text');tick.setAttribute('x',cx+4);tick.setAttribute('y',cy-radius*level/4+11);tick.setAttribute('fill','var(--sub,#91a7bf)');tick.setAttribute('font-size','8');tick.textContent=String(level*25)+'%';svg.appendChild(tick);
  }
  ordered.forEach((row,i)=>{
   const [x,y]=point(i,radius);const line=document.createElementNS(ns,'line');line.setAttribute('x1',cx);line.setAttribute('y1',cy);line.setAttribute('x2',x);line.setAttribute('y2',y);line.setAttribute('stroke','var(--border,#29425e)');svg.appendChild(line);
   const [lx,ly]=point(i,radius+20);const label=document.createElementNS(ns,'text');label.setAttribute('x',lx);label.setAttribute('y',ly);label.setAttribute('fill','var(--text,#e8f3ff)');label.setAttribute('font-size','10');label.setAttribute('text-anchor',lx<cx-8?'end':lx>cx+8?'start':'middle');label.textContent=row.label;svg.appendChild(label);
  });
  for(let player=0;player<playerCount;player++){
   const normalized=ordered.map(row=>Math.max(0,Math.min(1,row.entries[player].corrected/maxPerAxis)));
   const pts=normalized.map((value,i)=>point(i,radius*value).join(',')).join(' ');
   const poly=document.createElementNS(ns,'polygon');poly.setAttribute('points',pts);poly.setAttribute('fill',colors[player%colors.length]);poly.setAttribute('fill-opacity','.16');poly.setAttribute('stroke',colors[player%colors.length]);poly.setAttribute('stroke-width','2.5');svg.appendChild(poly);
   normalized.forEach((value,i)=>{const [x,y]=point(i,radius*value);const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','3');dot.setAttribute('fill',colors[player%colors.length]);svg.appendChild(dot)});
  }
  const legend=document.createElement('div');legend.className='ee-compare-chart-note';legend.style.display='flex';legend.style.flexWrap='wrap';legend.style.justifyContent='center';legend.style.gap='8px 14px';
  names.forEach((name,i)=>{const item=document.createElement('span');item.style.display='inline-flex';item.style.alignItems='center';item.style.gap='5px';const swatch=document.createElement('i');swatch.style.display='inline-block';swatch.style.width='9px';swatch.style.height='9px';swatch.style.borderRadius='50%';swatch.style.background=colors[i%colors.length];const text=document.createElement('span');text.textContent=name;item.append(swatch,text);legend.appendChild(item)});
  const totals=document.createElement('div');totals.className='ee-compare-chart-note';totals.textContent=names.map((name,player)=>name+'：'+fmt(ordered.reduce((sum,row)=>sum+row.entries[player].corrected,0))+' / 12,000').join(' ／ ');
  radarHost.append(svg,legend,totals);
 }

 const candidateRows=new Map();
 [...document.querySelectorAll('.compare-player-card')].forEach(playerCard=>{
  const name=safeText(playerCard.querySelector('.pname'))||'プレイヤー';
  playerCard.querySelectorAll('.compare-metric[data-rank-score]').forEach(metric=>{
   const label=metric.getAttribute('data-compare-label')||'';
   const score=Number(metric.dataset.rankScore);
   if(!label.startsWith('ランキング：')||!Number.isFinite(score))return;
   if(!candidateRows.has(label))candidateRows.set(label,[]);
   candidateRows.get(label).push({name,score});
  });
 });
 const candidates=[...candidateRows.entries()].filter(([label,items])=>items.length>=2).map(([label,items])=>({label,items:items.slice(0,4)}));
 const customPanel=document.createElement('details');customPanel.className='ee-custom-rankings';
 const customSummary=document.createElement('summary');customSummary.textContent='追加ランキング（取得済みスコアのみ）';customPanel.appendChild(customSummary);
 const customList=document.createElement('div');customList.className='ee-custom-rank-list';
 let selected=[];try{const saved=JSON.parse(localStorage.getItem('eagleeye-player-compare-custom-rankings-v1')||'null');if(Array.isArray(saved))selected=saved.filter(x=>candidates.some(c=>c.label===x))}catch{}
 let order=[];try{const savedOrder=JSON.parse(localStorage.getItem('eagleeye-player-compare-order-v1')||'[]');if(Array.isArray(savedOrder))order=savedOrder}catch{}
 const grid=sec.querySelector('.mystic-grid');
 function saveCustom(){try{localStorage.setItem('eagleeye-player-compare-custom-rankings-v1',JSON.stringify(selected));localStorage.setItem('eagleeye-player-compare-order-v1',JSON.stringify(order))}catch{}}
 function buildCustom(item){
  const card=document.createElement('article');card.className='mystic-card is-sub';card.dataset.eeCustomBoard=item.label;
  const title=document.createElement('div');title.className='mystic-name';title.textContent=item.label.replace(/^ランキング：/,'');card.appendChild(title);
  const values=document.createElement('div');values.className='mystic-values';
  item.items.forEach((entry,i)=>{const cell=document.createElement('div');cell.className='mystic-value';cell.style.color=colors[i%colors.length];const name=document.createElement('small');name.textContent=entry.name;name.style.color=colors[i%colors.length];const value=document.createElement('span');value.className='counter';value.dataset.target=String(entry.score);value.textContent=fmt(entry.score);cell.append(name,value);values.appendChild(cell)});
  card.appendChild(values);const ranks=document.createElement('div');ranks.className='mystic-ranks';ranks.textContent='保存済みのランキング実スコア';card.appendChild(ranks);return card;
 }
 function syncCustomCards(){
  if(!grid)return;
  cards.splice(0,cards.length,...cards.filter(card=>!card.dataset.eeCustomBoard));
  grid.querySelectorAll('[data-ee-custom-board]').forEach(el=>el.remove());
  candidates.filter(c=>selected.includes(c.label)).forEach(item=>{const card=buildCustom(item);grid.appendChild(card);cards.push(card)});
  const listCards=[...grid.querySelectorAll('.mystic-card')];
  listCards.forEach((card,index)=>{if(card.dataset.eeOrderTools==='1')return;card.dataset.eeOrderTools='1';const label=card.dataset.eeCustomBoard||safeText(card.querySelector('.mystic-name'));const key=card.dataset.eeCustomBoard||('default:'+label);if(!order.includes(key))order.push(key);const tools=document.createElement('div');tools.className='ee-rank-order';tools.style.cssText='display:flex;gap:5px;justify-content:flex-end;margin-top:6px';[['↑','up'],['↓','down']].forEach(([text,dir])=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',dir==='up'?'上へ移動':'下へ移動');b.style.cssText='border:1px solid var(--border,#29425e);background:transparent;color:var(--text,#e8f3ff);border-radius:6px;padding:2px 8px';b.addEventListener('click',()=>{const current=[...grid.children],from=current.indexOf(card),to=dir==='up'?from-1:from+1;if(to<0||to>=current.length)return;if(dir==='up')grid.insertBefore(card,current[to]);else grid.insertBefore(current[to],card);order=[...grid.children].map(el=>el.dataset.eeCustomBoard||('default:'+safeText(el.querySelector('.mystic-name'))));saveCustom()});tools.appendChild(b)});card.appendChild(tools);});
  const byKey=new Map([...grid.children].map(el=>[el.dataset.eeCustomBoard||('default:'+safeText(el.querySelector('.mystic-name'))),el]));
  const sorted=order.map(k=>byKey.get(k)).filter(Boolean);byKey.forEach((el,k)=>{if(!order.includes(k))sorted.push(el)});sorted.forEach(el=>grid.appendChild(el));
 }
 candidates.forEach(item=>{const label=document.createElement('label');label.style.cssText='display:flex;gap:8px;align-items:center;padding:6px 2px;font-size:12px';const input=document.createElement('input');input.type='checkbox';input.checked=selected.includes(item.label);input.addEventListener('change',()=>{if(input.checked){if(!selected.includes(item.label))selected.push(item.label)}else selected=selected.filter(x=>x!==item.label);saveCustom();syncCustomCards();renderAll()});const text=document.createElement('span');text.textContent=item.label.replace(/^ランキング：/,'');label.append(input,text);customList.appendChild(label)});
 if(!candidates.length){const note=document.createElement('div');note.className='ee-compare-chart-note';note.textContent='追加候補はありません。両プレイヤーの保存済みスコアが確認できたランキングだけが候補に表示されます。';customList.appendChild(note)}
 customPanel.appendChild(customList);sec.appendChild(customPanel);

 function buildGrowthComparison(){
  const playerCards=[...document.querySelectorAll('.compare-player-card')];
  if(playerCards.length<2)return;
  const signature=playerCards.map(card=>card.innerText).join('\\n--PLAYER--\\n');
  const existingPanel=document.querySelector('.ee-growth-comparison');
  if(existingPanel&&existingPanel.dataset.signature===signature)return;
  if(existingPanel)existingPanel.remove();
  const records=playerCards.map(card=>({name:safeText(card.querySelector('.pname'))||'プレイヤー',heroes:new Map(),heroGear:new Map(),gear:new Map()}));
  const slotLabels={helmet:'兜',helm:'兜',head:'兜',gloves:'手袋',glove:'手袋',gauntlets:'手袋',gauntlet:'手袋',armor:'鎧',armour:'鎧',chest:'鎧',chestplate:'鎧',boots:'ブーツ',boot:'ブーツ',footwear:'ブーツ'};
  const normalizeSlot=value=>{const raw=String(value||'').trim();const key=raw.toLowerCase().replace(/[ _-]+/g,'');return slotLabels[key]||raw||'部位不明'};
  playerCards.forEach((card,index)=>card.querySelectorAll('.compare-metric').forEach(metric=>{
   const label=metric.getAttribute('data-compare-label')||'',value=safeText(metric.querySelector('strong'))||'未取得';
   if(label.startsWith('英雄：')){
    const hero=label.slice(3).trim();
    const useful=value.split(' · ').filter(part=>!/^戦力\s/.test(part));
    records[index].heroes.set(hero,useful.join(' · ')||'育成情報なし');
   }else if(label.startsWith('領主装備：')){
    const slot=label.slice(5).trim();
    const useful=value.split(' · ').filter(part=>!/^スコア\s|^戦闘力\s/.test(part));
    records[index].gear.set(slot,useful.join(' · ')||'装備情報なし');
   }
  }));
  const comparisonTable=document.querySelector('.table-wrap .compare-table');
  if(comparisonTable){
   [...comparisonTable.querySelectorAll('tbody tr')].forEach(row=>{
    const header=safeText(row.querySelector('th'));
    if(!header.startsWith('防衛編成装備：'))return;
    const rawKey=header.slice('防衛編成装備：'.length).trim();
    const split=rawKey.lastIndexOf(' / ');
    const hero=split>=0?rawKey.slice(0,split).trim():'英雄';
    const slot=split>=0?normalizeSlot(rawKey.slice(split+3)):normalizeSlot(rawKey);
    const key=hero+' / '+slot;
    records.forEach((record,index)=>{
     const cell=row.children[index+1];
     const value=cell?safeText(cell):'データなし';
     record.heroGear.set(key,{hero,value:value==='装備情報なし'?'装備データなし':value||'データなし'});
    });
   });
  }
  const commonHeroes=[...records[0].heroes.keys()].filter(name=>records.every(r=>r.heroes.has(name)));
  const allHeroGear=[...new Set(records.flatMap(r=>[...r.heroGear.keys()]))];
  const allGovernorGear=[...new Set(records.flatMap(r=>[...r.gear.keys()]))];
  if(!commonHeroes.length&&!allHeroGear.length&&!allGovernorGear.length)return;
  const panel=document.createElement('section');panel.className='ee-growth-comparison';panel.dataset.signature=signature;
  const heading=document.createElement('h2');heading.textContent='育成要素の比較';panel.appendChild(heading);
  const makeTable=(title,keys,source,missingLabel)=>{
   if(!keys.length)return;
   const sub=document.createElement('h3');sub.textContent=title;panel.appendChild(sub);
   const wrap=document.createElement('div');wrap.className='ee-growth-table-wrap';
   const table=document.createElement('table');table.className='ee-growth-table';
   const thead=document.createElement('thead'),tr=document.createElement('tr');
   const first=document.createElement('th');first.textContent='項目';tr.appendChild(first);
   records.forEach(record=>{const th=document.createElement('th');th.textContent=record.name;tr.appendChild(th)});
   thead.appendChild(tr);table.appendChild(thead);
   const tbody=document.createElement('tbody');
   keys.forEach(key=>{const row=document.createElement('tr'),th=document.createElement('th');th.textContent=key;row.appendChild(th);
    records.forEach(record=>{const td=document.createElement('td');const entry=record[source].get(key);td.textContent=entry?(typeof entry==='string'?entry:entry.value):(source==='heroGear'?('データなし'):missingLabel);row.appendChild(td)});
    tbody.appendChild(row);
   });
   table.appendChild(tbody);wrap.appendChild(table);panel.appendChild(wrap);
  };
  makeTable('共通する英雄',commonHeroes,'heroes','データなし');
  makeTable('防衛編成の英雄装備',allHeroGear,'heroGear','データなし');
  makeTable('領主装備',allGovernorGear,'gear','データなし');
  const anchor=document.querySelector('.mystic-section')||document.querySelector('.ee-compare-details');
  if(anchor)anchor.insertAdjacentElement('beforebegin',panel);
 }
 function renderAll(){cards.forEach(renderCard);radarHost.hidden=mode!=='radar';if(mode==='radar'){cards.forEach(card=>{const view=card.querySelector('.ee-chart-view');if(view)view.hidden=true});renderRadar()}else{cards.forEach(card=>{const view=card.querySelector('.ee-chart-view');if(view)view.hidden=false});status.textContent=''}cards.forEach(card=>{card.classList.remove('ee-motion-in');void card.offsetWidth;card.classList.add('ee-motion-in')})}
 syncCustomCards();buildGrowthComparison();renderAll();
}
const observer=new MutationObserver(()=>enhance());
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
</script>`;
