export const PLAYER_COMPARE_ENHANCEMENTS = String.raw`
<style>
.ee-compare-details{margin:14px 0;border:1px solid var(--border,#29425e);border-radius:12px;padding:10px 12px;background:var(--panel,#102238)}.ee-compare-details>summary{cursor:pointer;font-weight:700;font-size:13px;color:var(--text,#e8f3ff);padding:3px}.ee-compare-details[open]{display:grid;gap:12px}.ee-compare-details .compare-player-cards{margin-top:8px}
.ee-compare-chart-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 14px}
.ee-compare-chart-tools button{border:1px solid var(--border,#29425e);background:var(--panel,#102238);color:var(--text,#e8f3ff);border-radius:9px;padding:7px 10px;font:inherit;font-size:12px}
.ee-compare-chart-tools button[aria-pressed="true"]{border-color:#42d9ff;background:#16364d;box-shadow:0 0 0 1px #42d9ff55}
.ee-split-ring{width:min(100%,210px);aspect-ratio:1;position:relative;margin:4px auto 8px;display:grid;place-items:center}
.ee-split-ring svg{width:100%;height:100%;overflow:visible;transform:rotate(-90deg)}
.ee-split-ring circle{fill:none;stroke-width:12}
.ee-split-ring .track{stroke:var(--border,#29425e);opacity:.8}
.ee-split-ring .slice{transition:stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1),stroke-dashoffset 1.1s}
.ee-split-ring .slice-a{stroke:#ffd166;filter:drop-shadow(0 0 4px #ffd166aa)}
.ee-split-ring .slice-b{stroke:#42d9ff;filter:drop-shadow(0 0 4px #42d9ffaa)}
.ee-split-ring .ee-center{position:absolute;text-align:center;max-width:76%;font-weight:800;font-size:clamp(15px,4vw,22px);line-height:1.15}
.ee-split-ring .ee-center small{display:block;font-size:10px;font-weight:600;color:var(--sub,#91a7bf);margin-top:5px}
.ee-spark-layer{position:absolute;inset:0;pointer-events:none}
.ee-spark-layer i{position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;background:var(--spark);box-shadow:0 0 8px 2px var(--spark);animation:ee-spark .75s ease-out var(--delay) both;transform:rotate(var(--angle)) translateY(-38px)}
@keyframes ee-spark{0%{opacity:0;transform:rotate(var(--angle)) translateY(-38px) scale(.4)}20%{opacity:1}100%{opacity:0;transform:rotate(var(--angle)) translateY(calc(-38px - var(--distance))) scale(0)}}
.ee-compare-bars{display:grid;gap:9px;margin:12px 0}
.ee-compare-bar-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;font-size:12px}
.ee-compare-bar-row .bar-label{grid-column:1/-1;display:flex;justify-content:space-between;gap:8px}
.ee-compare-bar-track{grid-column:1/-1;height:9px;background:var(--border,#29425e);border-radius:99px;overflow:hidden;display:flex}
.ee-compare-bar-track span{height:100%;transition:width .8s ease}
.ee-compare-bar-track .a{background:#ffd166}.ee-compare-bar-track .b{background:#42d9ff}
.ee-compare-numeric{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
.ee-compare-numeric>div{padding:10px;border:1px solid var(--border,#29425e);border-radius:10px;text-align:center;min-width:0}
.ee-compare-numeric small{display:block;overflow-wrap:anywhere;color:var(--sub,#91a7bf);font-size:11px}
.ee-compare-numeric strong{display:block;font-size:16px;margin-top:3px}
.ee-compare-chart-note{font-size:11px;color:var(--sub,#91a7bf);text-align:center;margin:6px 0}
@media(prefers-reduced-motion:reduce){.ee-split-ring .slice{transition:none}.ee-spark-layer i{animation:none;display:none}}
</style>
<script>
(function(){
const colors=['#ffd166','#42d9ff','#a18aff','#5ee6a8'];
const fmt=v=>{if(v==null||!Number.isFinite(Number(v)))return '—';try{return new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(Number(v))}catch{return String(v)}};
const safeText=e=>String(e&&e.textContent||'').trim();
function collapseDetails(){
 let panel=document.querySelector('.ee-compare-details');
 if(!panel){
  panel=document.createElement('details');panel.className='ee-compare-details';
  const summary=document.createElement('summary');summary.textContent='詳細プロフィール・一覧・履歴（必要なときに開く）';panel.appendChild(summary);
  const sec=document.querySelector('.mystic-section');if(!sec)return;sec.after(panel);
 }
 ['.panel','.power-showcase-wrap','.compare-player-cards','.table-wrap'].forEach(selector=>{
  document.querySelectorAll(selector).forEach(el=>{if(el===panel||el.closest('.ee-compare-details'))return;panel.appendChild(el)});
 });
}
function enhance(){
 collapseDetails();
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
 const readEntries=card=>[...card.querySelectorAll('.mystic-value')].map((cell,i)=>{const name=safeText(cell.querySelector('small'));const n=cell.querySelector('.counter');const raw=n&&n.dataset.target!==''?Number(n.dataset.target):null;return{name:name||('プレイヤー'+(i+1)),score:Number.isFinite(raw)?raw:null,color:colors[i%colors.length]}}).slice(0,2);
 function renderCard(card){
  const entries=readEntries(card),available=entries.filter(x=>x.score!==null);
  const existing=card.querySelector('.mystic-ring');
  if(existing)existing.style.display='none';
  const values=card.querySelector('.mystic-values');
  let view=card.querySelector('.ee-chart-view');
  if(!view){view=document.createElement('div');view.className='ee-chart-view';if(values)values.after(view);else card.appendChild(view)}
  view.replaceChildren();
  if(entries.length<2||available.length<2){status.textContent='一部のランキング値が未取得のため、スコア比較グラフは表示できません。';const msg=document.createElement('div');msg.className='ee-compare-chart-note';msg.textContent='両プレイヤーの実スコアがそろうと比較できます。';view.appendChild(msg);return}
  const a=entries[0],b=entries[1],sum=Math.max(0,a.score)+Math.max(0,b.score),ratio=sum>0?Math.max(0,a.score)/sum:.5,diff=Math.abs(a.score-b.score);
  if(mode==='ring'){
   const ring=document.createElement('div');ring.className='ee-split-ring';ring.innerHTML='<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="48"></circle><circle class="slice slice-a" cx="60" cy="60" r="48"></circle><circle class="slice slice-b" cx="60" cy="60" r="48"></circle></svg><div class="ee-center"></div><div class="ee-spark-layer" aria-hidden="true"></div>';
   const circ=2*Math.PI*48,arcA=ratio*circ,arcB=(1-ratio)*circ;const slices=ring.querySelectorAll('.slice');slices[0].style.strokeDasharray=arcA+' '+(circ-arcA);slices[0].style.strokeDashoffset='0';slices[1].style.strokeDasharray=arcB+' '+(circ-arcB);slices[1].style.strokeDashoffset=String(-arcA);
   const center=ring.querySelector('.ee-center');center.textContent=fmt(diff);const sm=document.createElement('small');sm.textContent=(a.score===b.score?'同点':a.score>b.score?a.name+' が上回る':b.name+' が上回る')+' · スコア差';center.appendChild(sm);
   if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const layer=ring.querySelector('.ee-spark-layer');for(let i=0;i<14;i++){const p=document.createElement('i');p.style.setProperty('--angle',(i*360/14)+'deg');p.style.setProperty('--distance',(25+(i%4)*10)+'px');p.style.setProperty('--delay',(i*18)+'ms');p.style.setProperty('--spark',colors[i%2]);layer.appendChild(p)}}
   view.appendChild(ring);
  }else if(mode==='bar'){
   const wrap=document.createElement('div');wrap.className='ee-compare-bars';const max=Math.max(a.score,b.score,1);
   [a,b].forEach((e,i)=>{const row=document.createElement('div');row.className='ee-compare-bar-row';const label=document.createElement('div');label.className='bar-label';const n=document.createElement('span');n.textContent=e.name;const v=document.createElement('strong');v.textContent=fmt(e.score);label.append(n,v);const track=document.createElement('div');track.className='ee-compare-bar-track';const fill=document.createElement('span');fill.className=i===0?'a':'b';fill.style.width=(Math.max(0,e.score)/max*100)+'%';track.appendChild(fill);row.append(label,track);wrap.appendChild(row)});view.appendChild(wrap);
  }else if(mode==='number'){
   const wrap=document.createElement('div');wrap.className='ee-compare-numeric';[a,b].forEach(e=>{const cell=document.createElement('div');const name=document.createElement('small');name.textContent=e.name;const val=document.createElement('strong');val.textContent=fmt(e.score);cell.append(name,val);wrap.appendChild(cell)});const note=document.createElement('div');note.className='ee-compare-chart-note';note.textContent='差：'+fmt(diff)+' · '+(a.score===b.score?'同点':a.score>b.score?a.name+' が上':b.name+' が上');view.append(wrap,note);
  }else{
   const msg=document.createElement('div');msg.className='ee-compare-chart-note';msg.textContent='レーダー表示は、同じ単位・同じ評価ルールで比較できる複数項目が確認できた場合のみ有効化します。現在のランキング群は評価尺度の同一性が未確認のため、誤った合成比較を避けてリング／バー／数値を使用してください。';view.appendChild(msg);
  }
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
 const candidates=[...candidateRows.entries()].filter(([label,items])=>items.length>=2).map(([label,items])=>({label,items:items.slice(0,2)}));
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

 function renderAll(){cards.forEach(renderCard);status.textContent=mode==='radar'?'レーダー：比較尺度の一致が未確認のため利用を保留しています。':''}
 syncCustomCards();renderAll();
}
const observer=new MutationObserver(()=>enhance());
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
</script>`;
