export const PLAYER_COMPARE_ENHANCEMENTS = String.raw`
<style>
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
function enhance(){
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
 function renderAll(){cards.forEach(renderCard);status.textContent=mode==='radar'?'レーダー：比較尺度の一致が未確認のため利用を保留しています。':''}
 renderAll();
}
const observer=new MutationObserver(()=>enhance());
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
</script>`;
