// マイKingShot のページ本体（固定の HTML・中の script でデータを読む）。index.js から移動（2026-11-17・index.js を小さくするため）。
// 差し込み（テンプレートの埋め込み式）は使わない。ログイン直後の案内などは index.js の /my-player の処理で足す。
export const MY_PLAYER_PAGE_HTML = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>マイKingShot | EagleEye</title><style>
:root{color-scheme:dark;--ee-bg:#050b14;--ee-panel:#0a1728;--ee-panel2:#0d2035;--ee-line:#23415f;--ee-text:#eff8ff;--ee-sub:#8098b0;--ee-cyan:#20d7f2;--ee-blue:#4ea9ff;--ee-gold:#f6c84b;--ee-green:#49e69a}
*{box-sizing:border-box}
html{min-height:100%;background:var(--ee-bg)}
body{margin:0;min-height:100%;background:radial-gradient(ellipse at 50% -180px,rgba(32,215,242,.11),transparent 65%),linear-gradient(180deg,#071321 0%,var(--ee-bg) 420px);color:var(--ee-text);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{width:min(100%,760px);margin:0 auto;padding:18px 16px calc(44px + env(safe-area-inset-bottom))}
.back{display:inline-flex;align-items:center;gap:7px;color:#8fa9c1;text-decoration:none;font-size:12px;font-weight:850;letter-spacing:.04em;padding:8px 0}
.back:hover{color:var(--ee-cyan)}
.ee-benefits{margin:10px 0 12px;padding:12px 14px;border:1px solid rgba(250,204,21,.35);border-radius:14px;background:rgba(250,204,21,.06)}.ee-benefits b{display:block;font-size:13px;color:#fde68a;margin-bottom:6px}.ee-benefits ul{margin:0;padding-left:1.2em;font-size:13px;line-height:1.7}
.eyebrow{margin-top:23px;color:var(--ee-cyan);font-size:10px;font-weight:950;letter-spacing:.22em}
.title{font-size:clamp(28px,6vw,36px);line-height:1.12;letter-spacing:-.04em;margin:7px 0 10px;font-weight:900}
.sub{color:#9cb1c7;line-height:1.75;font-size:13px;margin:0;max-width:620px}
#app{margin-top:22px}
.card{margin-top:15px;padding:18px;border:1px solid rgba(54,91,123,.7);border-radius:19px;background:linear-gradient(145deg,rgba(13,32,53,.98),rgba(7,19,33,.98));box-shadow:0 12px 30px rgba(0,0,0,.16);overflow:hidden}
.card h2{font-size:17px;line-height:1.35;font-weight:900;letter-spacing:-.02em;color:#f0f8ff}
.label{display:block;margin:16px 0 8px;color:#c6d8e8;font-size:12px;font-weight:850}
.input,.select{width:100%;min-height:48px;padding:13px 14px;border-radius:12px;border:1px solid #2d4a66;background:#06111e;color:#f3f9ff;font-size:16px;box-sizing:border-box;outline:none}
.input:focus,.select:focus{border-color:var(--ee-cyan);box-shadow:0 0 0 3px rgba(32,215,242,.12)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;width:100%;min-height:47px;padding:12px 14px;border:1px solid rgba(32,215,242,.4);border-radius:12px;background:linear-gradient(135deg,#16b9d4,#168dbd);color:#03121c;font-weight:900;font-size:14px;cursor:pointer;transition:filter .15s,transform .15s}
.btn:hover{filter:brightness(1.08)}.btn:active{transform:scale(.99)}.btn:disabled{opacity:.55;cursor:wait}
.btn.danger,.danger{background:#351b28;border:1px solid #71364b;color:#ffd8e2}
.muted{color:#8fa8bf;font-size:12px;line-height:1.75}
.ok{color:#6ff0ad}.warn{color:var(--ee-gold)}.error{margin-top:12px;color:#ff9cae;line-height:1.6}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:11px 0;border-bottom:1px solid rgba(54,82,109,.5);font-size:13px;color:#a9bfd3}
.row:last-child{border-bottom:0}.value{font-weight:850;text-align:right;overflow-wrap:anywhere;color:#eaf5ff}
.account{margin-top:13px;padding:14px;border:1px solid #24425e;border-radius:15px;background:rgba(4,15,27,.72)}
.account-head{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#eff8ff}
.badge{padding:5px 9px;border-radius:999px;background:#1b344b;color:#c5d9e9;font-size:10px;font-weight:900;white-space:nowrap}
.badge.main{background:rgba(246,200,75,.15);color:#f9d66d;border:1px solid rgba(246,200,75,.3)}
.badge.sub{background:rgba(78,169,255,.14);color:#8cc7ff;border:1px solid rgba(78,169,255,.28)}
.badge.using{background:rgba(73,230,154,.14);color:#6ff0ad;border:1px solid rgba(73,230,154,.3);margin-left:4px}.use-gov{margin:0 0 10px}
.check{display:flex;align-items:center;gap:10px;margin:11px 0;color:#d7e7f5;font-size:13px}
.check-icon{flex:0 0 23px;width:23px;height:23px;border-radius:50%;display:grid;place-items:center;background:#1a3045;color:#7893aa;font-size:12px;font-weight:900;border:1px solid #2d4b65}
.check-icon.ok{background:rgba(73,230,154,.13);border-color:rgba(73,230,154,.35);color:var(--ee-green)}
.vip-card{border-color:rgba(246,200,75,.35);background:linear-gradient(145deg,rgba(37,34,27,.65),rgba(9,20,32,.98))}
.vip-card h2{color:var(--ee-gold)!important}
#msg,#key-msg,#mighty-msg{font-size:12px;line-height:1.7}
.key-guide{margin:4px 0 14px;padding:12px;border:1px solid rgba(32,215,242,.28);border-radius:12px;background:rgba(32,215,242,.06)}
.key-guide-title{display:block;font-size:13px;margin-bottom:6px;color:var(--ee-cyan)}
.key-guide-steps{margin:0 0 8px;padding-left:20px;font-size:12px;line-height:1.8;color:#d7e7f5}
.key-guide-steps code{padding:1px 5px;border-radius:5px;background:#0b192b;color:var(--ee-gold)}
.key-guide-note{font-size:11px;line-height:1.7;color:#f9d66d;margin-bottom:10px}
.key-guide-open{display:flex;text-align:center;text-decoration:none;margin-top:4px}
.btn.ghost{background:#132a40;color:var(--ee-text);border-color:var(--ee-line)}
.key-input-row{display:flex;gap:8px;align-items:stretch}
.key-input-row .input{flex:1;min-width:0}
.key-input-row .btn{flex:0 0 auto;width:auto;margin:0;padding-left:14px;padding-right:14px}
.key-format{min-height:18px;margin:6px 0 4px;font-size:11px}
.key-format.warn{color:#f9d66d}
button:focus-visible,a:focus-visible{outline:2px solid var(--ee-cyan);outline-offset:3px}
/* Compact mobile-first sizing aligned with the home dashboard */
.wrap{width:min(100%,720px);padding:14px 12px calc(34px + env(safe-area-inset-bottom))}
.back{font-size:11px;padding:5px 0}
.eyebrow{margin-top:18px;font-size:9px;letter-spacing:.18em}
.title{font-size:clamp(24px,7vw,30px);margin:5px 0 7px}
.sub{font-size:12px;line-height:1.65}
#app{margin-top:16px}
.card{margin-top:12px;padding:14px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.13)}
.card h2{font-size:15px}
.account{margin-top:10px;padding:11px;border-radius:13px}
.account-head{font-size:13px}
.row{gap:10px;padding:9px 0;font-size:12px}
.value{max-width:65%;font-size:12px}
.input,.select{min-height:44px;padding:11px 12px;font-size:15px}
.btn{min-height:43px;padding:10px 12px;font-size:13px}
.muted{font-size:11px;line-height:1.65}
.check{font-size:12px;margin:9px 0}
@media(min-width:600px){.wrap{padding:22px 18px 44px}.card{padding:18px}.account{padding:14px}.title{font-size:32px}.sub{font-size:13px}.row{font-size:13px}.value{font-size:13px}}

/* Compact expandable API key list */
.key-list-details{margin-top:10px;border:1px solid rgba(43,77,107,.55);border-radius:12px;background:rgba(4,15,27,.42);overflow:hidden}.key-list-details summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;list-style:none;color:#d6e7f5;font-size:11px;font-weight:850}.key-list-details summary::-webkit-details-marker{display:none}.key-list-details summary .muted{font-size:10px}.key-list-rows{padding:0 12px 4px}.key-list-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(54,82,109,.35);font-size:11px;color:#a9bfd3}.key-list-row small{display:block;margin-top:3px;color:#728da5;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.key-list-row strong{font-size:11px;white-space:nowrap}
/* My Kingshot information hierarchy */
.section-block{margin-top:22px}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 8px}
.section-heading h2{margin:3px 0 0;font-size:17px;font-weight:900;letter-spacing:-.025em}
.section-kicker{display:block;color:var(--ee-cyan);font-size:8px;font-weight:950;letter-spacing:.17em}
.section-count,.role-pill{flex:0 0 auto;padding:5px 9px;border:1px solid rgba(32,215,242,.24);border-radius:999px;background:rgba(32,215,242,.07);color:#8ceaf6;font-size:10px;font-weight:900}
.role-pill{border-color:rgba(143,168,191,.22);background:rgba(143,168,191,.07);color:#a9bfd3}
.role-pill.role-active{border-color:rgba(73,230,154,.25);background:rgba(73,230,154,.08);color:#6ff0ad}
.section-note{margin:0 2px 10px}
.account-list{margin-top:0;padding:10px 12px}
.account{margin-top:8px;padding:12px}
.account .btn{margin-top:10px}
.usage-line{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding:10px 2px 0;border-top:1px solid rgba(54,82,109,.45);color:#829bb2;font-size:10px}
.usage-line strong{color:#c9dbea;font-size:10px;text-align:right}
.usage-line i{font-style:normal;color:#57718a}
.action-details{margin-top:10px;border:1px solid rgba(43,77,107,.7);border-radius:15px;background:rgba(8,22,37,.7);overflow:hidden}
.action-details summary{display:flex;align-items:center;gap:11px;list-style:none;cursor:pointer;padding:12px}
.action-details summary::-webkit-details-marker{display:none}
.summary-icon{display:grid;place-items:center;flex:0 0 31px;width:31px;height:31px;border:1px solid rgba(32,215,242,.3);border-radius:10px;background:rgba(32,215,242,.08);color:var(--ee-cyan);font-size:20px}
.action-details summary strong,.action-details summary small{display:block}
.action-details summary strong{font-size:12px;color:#eaf5ff}
.action-details summary small{margin-top:3px;color:#819ab1;font-size:10px}
.summary-chevron{margin-left:auto;color:#7f9bb3;font-size:17px;transition:transform .15s}
.action-details[open] .summary-chevron{transform:rotate(180deg)}
.action-card{margin:0;border:0;border-top:1px solid rgba(43,77,107,.5);border-radius:0;box-shadow:none;background:rgba(4,15,27,.48)}
.action-card .label:first-child{margin-top:2px}
.form-help{margin-top:10px}
.subsection-title{margin:0 0 5px;font-size:14px;font-weight:900}
.section-block>.card{margin-top:0}
.section-block .vip-card{margin-top:0}


/* Collapsed account cards: keep the important identity visible, move details/actions behind a tap. */
.account-details{padding:0;overflow:hidden}
.account-summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;padding:12px}
.account-summary::-webkit-details-marker{display:none}
.account-summary-main{min-width:0;flex:1}
.account-summary-main strong,.account-summary-main small{display:block;overflow-wrap:anywhere}
.account-summary-main strong{font-size:12px;color:#eff8ff}
.account-summary-main small{margin-top:4px;color:#91a9bf;font-size:10px;line-height:1.5}
.account-summary .badge{font-size:9px}
.account-summary .summary-chevron{flex:0 0 auto;margin-left:0}
.account-details[open] .account-summary{border-bottom:1px solid rgba(54,82,109,.5)}
.account-detail-body{padding:2px 12px 12px}
.account-detail-body .row:first-child{margin-top:2px}
.account-link{display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;max-width:70%;color:#8ceaf6;text-decoration:none;font-weight:850;text-align:right;overflow-wrap:anywhere}
.account-link:hover{color:#d5fbff;text-decoration:underline;text-underline-offset:3px}
.account-link:focus-visible{outline:2px solid var(--ee-cyan);outline-offset:3px;border-radius:4px}
.account-link-icon{display:inline-grid;place-items:center;flex:0 0 19px;width:19px;height:19px;border:1px solid rgba(32,215,242,.25);border-radius:6px;background:rgba(32,215,242,.08);font-size:11px;line-height:1}
.account-summary-main .account-summary-player{display:inline;color:#8ceaf6;text-decoration:none}
.account-summary-main .account-summary-player:hover{text-decoration:underline;text-underline-offset:3px}
.key-register-details{margin-top:14px;border:1px solid rgba(43,77,107,.6);border-radius:13px;background:rgba(4,15,27,.45);overflow:hidden}
.key-register-details>summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;padding:12px;color:#d8edf8;font-size:12px;font-weight:850}
.key-register-details>summary::-webkit-details-marker{display:none}
.key-register-details>summary:after{content:"＋";margin-left:auto;color:var(--ee-cyan);font-size:17px}
.key-register-details[open]>summary:after{content:"−"}
.key-register-body{padding:0 12px 12px;border-top:1px solid rgba(43,77,107,.45)}
.key-register-body .label:first-child{margin-top:12px}

@media(prefers-reduced-motion:reduce){*,*:before,*:after{transition:none!important;animation:none!important}}
</style></head><body><main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">アカウント</div><h1 class="title">マイKingShot</h1><p class="sub">領主アカウント、APIキー、利用権限をここで管理できます。登録や確認の操作は、内容を確認してから実行してください。</p><div id="app"><div class="card">読み込み中…</div></div></main><script>
(function(){
  const app=document.getElementById("app");
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  let loadResponsesCompleted=0;
  let loadProgressActive=false;
  function showLoadProgress(completed){
    if(!loadProgressActive) return;
    const total=3;
    const percent=Math.round(completed/total*100);
    app.innerHTML='<section class="card" role="status" aria-live="polite"><h2 style="margin:0 0 8px">マイKingShotを読み込み中</h2><p class="muted" style="margin:0 0 14px">登録プレイヤー・権限・VIP情報の応答を確認しています。</p><div style="height:6px;border-radius:99px;overflow:hidden;background:#20384f"><div style="height:100%;width:'+percent+'%;border-radius:99px;background:linear-gradient(90deg,#20d7f2,#49e69a);transition:width .18s ease"></div></div><div style="display:flex;justify-content:space-between;gap:12px;margin-top:9px;font-size:12px"><span class="muted">API応答の処理</span><strong style="color:var(--ee-cyan)">'+completed+' / '+total+'</strong></div></section>';
  }
  async function fetchLoadPart(url){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    loadResponsesCompleted++;
    showLoadProgress(loadResponsesCompleted);
    return {response,data};
  }
  async function getData(){
    loadResponsesCompleted=0;
    loadProgressActive=true;
    showLoadProgress(0);
    let parts;
    try{
      parts=await Promise.all([
        fetchLoadPart("/api/me/player"),
        fetchLoadPart("/api/me/advanced"),
        fetchLoadPart("/api/me/vip")
      ]);
    }catch(error){
      loadProgressActive=false;
      throw error;
    }
    loadProgressActive=false;
    const [playerPart,advancedPart,vipPart]=parts;
    const playerRes=playerPart.response, player=playerPart.data;
    const advancedRes=advancedPart.response, advanced=advancedPart.data;
    const vipRes=vipPart.response, vip=vipPart.data;
    if(!playerRes.ok||!player.ok) throw new Error(player.message||player.error||("HTTP "+playerRes.status));
    if(!advancedRes.ok||!advanced.ok) throw new Error(advanced.message||advanced.error||("HTTP "+advancedRes.status));
    if(!vipRes.ok||!vip.ok) throw new Error(vip.message||vip.error||("HTTP "+vipRes.status));
    return {player,advanced,vip};
  }
  async function load(){
    try{
      render(await getData());
      return true;
    }catch(error){
      loadProgressActive=false;
      app.innerHTML='<div class="card error">'+esc(error.message||String(error))+'</div>';
      return false;
    }
  }
  function render(d){
    const rows=(d.player.links||[]).filter(x=>x.status==="ACTIVE");
    const limits=d.player.limits||{};
    let html='<section class="section-block"><div class="section-heading"><div><span class="section-kicker">登録アカウント</span><h2>登録済みの領主</h2></div><span class="section-count">'+esc(rows.length)+'件</span></div><p class="muted section-note">'+(limits.maxAccounts?'登録できる数：合わせて'+esc(limits.maxAccounts)+'件まで（王国は自由・各王国のメインは1つ）':'無料枠：最大2王国・各王国メイン1＋サブ1')+(rows.length>1?'<br>「この領主を使う」で、ホーム・聖剣・比較の「自分」・KvK などで使う領主を切り替えられます。':'')+'</p><div class="card account-list">';
    if(!rows.length) html+='<p class="muted">まだ登録されていません。</p>';
    for(const l of rows){
      const p=l.player||{};
      const playerName=String(p.nick_name||"プレイヤー名未取得");
      const allianceName=String(p.alliance_name||p.alliance_abbr||"");
      const allianceLabel=String(p.alliance_abbr||p.alliance_name||"同盟未取得");
      const playerUrl="/player?governor_id="+encodeURIComponent(l.governor_id);
      const allianceUrl="/alliance?kid="+encodeURIComponent(p.kid??l.kingdom_id??"")+"&tag="+encodeURIComponent(p.alliance_abbr||p.alliance_name||"");
      html+='<details class="account account-details"><summary class="account-summary"><span class="account-summary-main"><strong>王国 '+esc(l.kingdom_id)+' · '+(l.account_type==="MAIN"?"メイン":"サブ")+'</strong><small><a class="account-summary-player" href="'+playerUrl+'">♙ '+esc(playerName)+'</a>　・　戦力 '+esc(p.power!=null?Number(p.power).toLocaleString("ja-JP"):"未取得")+'<br>'+(allianceName?'<a class="account-summary-player" href="'+allianceUrl+'">⚑ '+esc(allianceLabel)+'</a>':'⚑ '+esc(allianceLabel))+'</small></span><span class="badge '+(l.account_type==="MAIN"?"main":"sub")+'">'+(l.account_type==="MAIN"?"メイン":"サブ")+'</span>'+(rows.length>1&&String(d.player.active_governor_id||"")===String(l.governor_id)?'<span class="badge using">使用中</span>':'')+'<span class="summary-chevron">⌄</span></summary><div class="account-detail-body">'+(rows.length>1&&String(d.player.active_governor_id||"")!==String(l.governor_id)?'<button class="btn use-gov" data-governor="'+esc(l.governor_id)+'">この領主を使う</button>':'')+
        '<div class="row"><span>領主ID</span><span class="value">'+esc(l.governor_id)+'</span></div>'+
        '<div class="row"><span>プレイヤー名</span><a class="account-link" href="'+playerUrl+'"><span class="account-link-icon" aria-hidden="true">♙</span>'+esc(playerName)+'</a></div>'+
        '<div class="row"><span>戦力</span><span class="value">'+esc(p.power!=null?Number(p.power).toLocaleString("ja-JP"):"未取得")+'</span></div>'+
        '<div class="row"><span>同盟名</span>'+(allianceName?'<a class="account-link" href="'+allianceUrl+'"><span class="account-link-icon" aria-hidden="true">⚑</span>'+esc(allianceLabel)+'</a>':'<span class="value">未取得</span>')+'</div>'+
        '<div class="row"><span>登録状態</span><span class="value ok">'+(l.official_verified_at?"✓ EagleEye公式認証":(l.verified?"管理者確認済み":"自己申告・未認証"))+'</span></div>'+
        '<button class="btn danger remove" data-governor="'+esc(l.governor_id)+'">この登録を解除</button></div></details>';
    }
    html+='<div class="usage-line"><span>登録状況</span><strong>'+(limits.maxAccounts?esc(limits.activeAccounts||0)+' / '+esc(limits.maxAccounts)+' アカウント <i>・</i> '+esc(limits.registeredKingdoms||0)+' 王国':esc(limits.registeredKingdoms||0)+' / 2 王国 <i>・</i> '+esc(limits.activeAccounts||0)+' アカウント')+'</strong></div></div></section>';
    html+='<details class="action-details"><summary><span class="summary-icon">＋</span><span><strong>アカウントを追加</strong><small>領主IDを新しく登録する</small></span><span class="summary-chevron">⌄</span></summary><div class="card action-card"><label class="label" for="gid">領主ID</label><input id="gid" class="input" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="例: 123456789"><label class="label" for="atype">区分</label><select id="atype" class="select"><option value="MAIN">メイン</option><option value="SUB">サブ</option></select><button class="btn" id="save">登録する</button><div class="muted form-help">同じ王国ではメイン1件＋サブ1件まで登録できます。</div><div id="msg"></div></div></details>';
    const a=d.advanced||{}; const role=String(d.vip?.role||a.role||"BASIC").toUpperCase(); const promoted=["ADVANCED","VIP","ADMIN","OWNER"].includes(role);
    const keyCount=Number(a.mightPulseKeyCount||0);
    const keyRows=Array.isArray(a.apiKeys)?a.apiKeys:[];
    const vipKeyCount=Number(d.vip?.keyCount||keyCount);
    const mightyKeyCount=Number(d.vip?.mightyKeyCount||0);
    let keyHtml='<div class="muted" style="margin-top:12px">登録済みAPIキー：'+esc(keyCount)+'本　／　⚡ Mighty対応：'+esc(mightyKeyCount)+'本</div>';
    if(keyRows.length) keyHtml+='<details class="key-list-details"><summary><span>登録済みキーの内訳</span><span class="muted">'+esc(keyRows.length)+'本を表示　⌄</span></summary><div class="key-list-rows">'+keyRows.map((k,i)=>{const vipKey=d.vip?.apiKeys?.[i]||{}; const prefix=String(k.api_key_prefix||"").trim(); const mighty=Boolean(vipKey.mighty_capable); return '<div class="key-list-row"><span>キー '+(i+1)+(prefix?'<small>'+esc(prefix)+'</small>':'')+'</span><strong class="'+(mighty?'warn':'ok')+'">'+(mighty?'⚡ Mighty':'✓ 提供済み')+'</strong></div>';}).join('')+'</div></details>';
    html+='<section class="section-block"><div class="section-heading"><div><span class="section-kicker">利用権限</span><h2>利用権限・APIキー</h2></div><span class="role-pill '+(promoted?'role-active':'')+'">'+esc(role)+'</span></div><div class="card"><h3 class="subsection-title">Advanced昇格条件</h3><p class="muted section-note">以下の2つを満たすとBASICからAdvancedへ昇格します。</p>'+(promoted?'':'<div class="ee-benefits"><b>ADVANCEDになると増えること</b><ul><li>英雄スキル・英雄専用装備・英雄の装備</li><li>領主装備・宝石</li><li>プレイヤーの座標</li><li>KvK画面（対戦相手・スコア推移・秘境の試練のステージ別比較）</li><li>ウォッチリスト：プレイヤー3人 → 20人、王国1 → 3</li></ul></div>')+
      '<div class="check"><span class="check-icon '+(a.hasPlayerLink?"ok":"")+'">'+(a.hasPlayerLink?"✓":"")+'</span><span>領主IDを1つ以上登録</span></div>'+
      '<div class="check"><span class="check-icon '+(a.hasMightPulseKey?"ok":"")+'">'+(a.hasMightPulseKey?"✓":"")+'</span><span>MightPulse APIキーを1本以上Poolへ提供</span></div>'+
      '<div class="row" style="margin-top:10px"><span>現在の権限</span><span class="value '+(promoted?"ok":"")+'">'+esc(role)+'</span></div>'+keyHtml+
      '<details class="key-register-details"'+(a.hasMightPulseKey?'':' open')+'><summary>＋ MightPulse APIキーをPoolへ提供</summary><div class="key-register-body">'+
      '<div class="key-guide"><strong class="key-guide-title">APIキーの作り方（無料・約1分）</strong><ol class="key-guide-steps">'+
      '<li>下の「MightPulseを開く」をタップ（英語のサイトが開きます）</li>'+
      '<li><b>Continue with Discord</b>（Discordで続ける）をタップし、Discordの画面で<b>認証</b></li>'+
      '<li><b>Create API key</b>（APIキーを作成）をタップ</li>'+
      '<li>表示された <code>kss_</code> で始まるキーをコピーして、EagleEyeに戻る</li>'+
      '<li>下の「貼り付け」→「APIキーをPoolへ提供する」</li></ol>'+
      '<div class="key-guide-note">⚠ キーは作成時に<b>1回だけ</b>表示されます。閉じてしまった場合は、もう一度 Create API key で作り直せば大丈夫です（料金はかかりません）。</div>'+
      '<a class="btn key-guide-open" id="open-mightpulse" href="https://api.mightpulse.com/" target="_blank" rel="noopener noreferrer">MightPulseを開く ↗</a></div>'+
      '<label class="label" for="mpkey">MightPulse APIキー</label><div class="key-input-row"><input id="mpkey" class="input" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="kss_ で始まるキーを貼り付け"><button type="button" class="btn ghost" id="paste-key">貼り付け</button></div><div id="key-format" class="muted key-format"></div><button class="btn" id="register-key">APIキーをPoolへ提供する</button><div class="muted" style="margin-top:12px">登録時に通常APIの有効性と⚡ Mighty対応を自動確認します（Mighty確認で1回APIを使用）。登録本数に上限はありません。同じAPIキーの重複登録はできません。提供したキーは暗号化してPoolへ保存され、画面には照合用の先頭部分のみ表示します。</div><div id="key-msg"></div></div></details></div></section>';
    const v=d.vip||{};
    const mightyConnected=Boolean(v.hasMightyKey);
    const mightyStatus=mightyConnected?"CONFIRMED":String(v.mightyKeyStatus||"UNCONFIRMED").toUpperCase();
    const isElevatedMightyRole=["ADMIN","OWNER"].includes(String(v.role||role).toUpperCase());
    html+='<section class="section-block"><div class="section-heading"><div><span class="section-kicker">Mighty権限</span><h2>VIP・Mighty機能</h2></div><span class="role-pill '+(mightyConnected?'role-active':'')+'">'+(mightyConnected?'確認済み':'未確認')+'</span></div><div class="card vip-card"><h2 style="margin:0 0 6px;color:#f6d365">⚡ '+(isElevatedMightyRole?"Mighty機能の利用確認":"VIPロールへの昇格")+'</h2><p class="muted" style="margin:0 0 12px">'+(isElevatedMightyRole?"Mighty対応を確認すると、VIP向けMighty機能を利用できます。現在の管理者ロールは変更されません。":"Mighty対応のMightPulse APIキーを確認すると、VIPロールへ昇格できます。")+'</p>'+
      '<div class="check"><span class="check-icon '+(mightyConnected?"ok":"")+'">'+(mightyConnected?"✓":"")+'</span><span>Mighty対応 '+(mightyConnected?"確認済み":"未確認")+'</span></div>'+
      '<div class="row"><span>現在の権限</span><span class="value '+(String(v.role||"") === "VIP"?"ok":"")+'">'+esc(v.role||role)+'</span></div>'+
      '<div id="mighty-check-area" style="margin-top:12px"><button class="btn" id="mighty-check">⚡ '+(mightyStatus==="CONFIRMED"?(isElevatedMightyRole?"Mighty機能を再確認":"VIPロールを再確認"):(isElevatedMightyRole?"Mighty機能の利用を確認":"VIPロールへの昇格を確認"))+'</button><div id="mighty-msg" class="muted" style="margin-top:10px"></div></div>'+
      (mightyStatus==="CONFIRMED"?'<div class="muted" style="margin-top:10px;color:#86efac">⚡ Mighty対応確認済み。'+(isElevatedMightyRole?"Mighty機能を利用できます。":"VIPロール判定済みです。")+'</div>':"")+
      '<div class="muted" style="margin-top:12px">登録済みのMightPulse APIキーを実際にMighty専用APIで確認した結果に基づいて判定を行います。</div></div></section>';
    app.innerHTML=html;
    document.getElementById("save").onclick=save;
    document.querySelectorAll(".remove").forEach(b=>b.onclick=()=>remove(b.dataset.governor,b));
    document.querySelectorAll(".use-gov").forEach(b=>b.onclick=()=>useGovernor(b.dataset.governor,b));
    if(document.getElementById("register-key")) document.getElementById("register-key").onclick=registerKey;
    setupKeyGuide();
    const mightyButton=document.getElementById("mighty-check");
    if(mightyButton) mightyButton.onclick=checkMighty;
  }
  async function save(){
    const input=document.getElementById("gid"), type=document.getElementById("atype"), msg=document.getElementById("msg"), button=document.getElementById("save");
    button.disabled=true; msg.textContent="";
    try{
      const r=await fetch("/api/me/player",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({governor_id:input.value.trim(),account_type:type.value})});
      const d=await r.json().catch(()=>({}));
      if(r.status===409 && d.error==="GOVERNOR_ID_ALREADY_LINKED"){
        app.innerHTML='<div class="card"><h2 style="margin-top:0">この領主IDは既に登録されています</h2><p class="muted">'+esc(d.message)+'</p><p class="muted">正当な所有者である場合は、KingShotゲーム内で本人しか表示できない情報が分かるスクリーンショットを用意してEagleEye専用サポートへ問い合わせてください。</p>'+('<a class="btn" href="/support?category=ACCOUNT&subcategory=GOVERNOR_ID&governor_id='+encodeURIComponent(input.value.trim())+'">この件について問い合わせる</a>')+'<div class="muted" style="margin-top:12px">問い合わせ番号: '+esc(d.support_request_id)+'</div><button class="btn danger" id="back">戻る</button></div>';
        document.getElementById("back").onclick=load; return;
      }
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      await load();
    }catch(e){msg.className="error";msg.textContent=e.message||String(e);}
    finally{button.disabled=false;}
  }
  async function useGovernor(governorId,button){
    if(button){button.disabled=true;button.textContent="切り替えています…";}
    try{
      const r=await fetch("/api/me/active-governor",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({governor_id:governorId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      await load();
    }catch(error){
      alert(error.message||"切り替えに失敗しました");
      if(button){button.disabled=false;button.textContent="この領主を使う";}
    }
  }
  async function remove(governorId,button){
    if(!confirm("このKingShotアカウントの登録を解除しますか？")) return;
    if(button){button.disabled=true;button.textContent="解除しています…";}
    try{
      const r=await fetch("/api/me/player",{method:"DELETE",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({governor_id:governorId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      await load();
    }catch(error){
      alert(error.message||"解除に失敗しました");
    }finally{
      if(button){button.disabled=false;button.textContent="この登録を解除";}
    }
  }
  async function checkMighty(){
    const button=document.getElementById("mighty-check"), msg=document.getElementById("mighty-msg");
    button.disabled=true; button.textContent="確認中…"; msg.className="muted"; msg.textContent="登録済みのAPIキーを確認しています。";
    try{
      const r=await fetch("/api/me/vip/mighty-check",{method:"POST",credentials:"same-origin",cache:"no-store"});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      if(d.status==="CONFIRMED"){msg.className="ok";msg.textContent="⚡ Mighty対応を確認しました。"+(["ADMIN","OWNER"].includes(String(d.role||"").toUpperCase())?"管理者ロールは維持したまま、Mighty機能を利用できます。":"VIP権限を更新しました。");button.textContent=(["ADMIN","OWNER"].includes(String(d.role||"").toUpperCase())?"⚡ Mighty機能を再確認":"⚡ VIPロールを再確認");setTimeout(load,500);}
      else if(d.status==="NOT_MIGHTY"){msg.className="warn";msg.textContent="登録済みのAPIキーではMighty対応を確認できませんでした。";setTimeout(load,500);}
      else {msg.className="warn";msg.textContent=d.message||"一時的に判定できませんでした。時間を置いて再確認してください。";button.disabled=false;button.textContent="⚡ Mighty対応を確認";}
    }catch(e){msg.className="error";msg.textContent=e.message||String(e);button.disabled=false;button.textContent="⚡ Mighty対応を確認";}
  }
  function normalizeKeyInput(value){return String(value||"").replace(/^\\s*bearer\\s+/i,"").replace(/\\s+/g,"");}
  function updateKeyFormat(){
    const input=document.getElementById("mpkey"), out=document.getElementById("key-format");
    if(!input||!out)return;
    const key=normalizeKeyInput(input.value);
    if(!key){out.className="muted key-format";out.textContent="";return;}
    if(/^kss_[A-Za-z0-9_-]{8,}$/.test(key)){out.className="ok key-format";out.textContent="✓ MightPulse APIキーの形式です";}
    else{out.className="warn key-format";out.textContent="kss_ で始まるキーではないようです。コピーした内容を確認してください。";}
  }
  function setupKeyGuide(){
    const input=document.getElementById("mpkey"), paste=document.getElementById("paste-key"), open=document.getElementById("open-mightpulse"), msg=document.getElementById("key-msg");
    if(!input)return;
    input.addEventListener("input",updateKeyFormat);
    if(paste)paste.onclick=async()=>{
      try{
        if(!navigator.clipboard||!navigator.clipboard.readText)throw new Error("clipboard unavailable");
        const text=normalizeKeyInput(await navigator.clipboard.readText());
        if(!text)throw new Error("empty");
        input.value=text;updateKeyFormat();
        if(msg){msg.className="muted";msg.textContent="貼り付けました。内容を確認して「APIキーをPoolへ提供する」をタップしてください。";}
      }catch(e){
        input.focus();
        if(msg){msg.className="muted";msg.textContent="自動で貼り付けできませんでした。入力欄を長押しして「ペースト」を選んでください。";}
      }
    };
    if(open)open.addEventListener("click",()=>{try{sessionStorage.setItem("ee-mp-key-guide","1")}catch{}});
    if(!window.__eeKeyGuideReturn){
      window.__eeKeyGuideReturn=true;
      document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState!=="visible")return;
        let pending=false;try{pending=sessionStorage.getItem("ee-mp-key-guide")==="1";sessionStorage.removeItem("ee-mp-key-guide")}catch{}
        const box=document.getElementById("mpkey");
        if(!pending||!box||box.value)return;
        const details=box.closest("details");if(details)details.open=true;
        box.scrollIntoView({block:"center",behavior:"smooth"});
        const note=document.getElementById("key-msg");
        if(note){note.className="ok";note.textContent="おかえりなさい。コピーしたキーを「貼り付け」で入力してください。";}
      });
    }
  }
  async function registerKey(){
    const input=document.getElementById("mpkey"), msg=document.getElementById("key-msg"), button=document.getElementById("register-key");
    const key=normalizeKeyInput(input?.value);
    if(!key){msg.className="error";msg.textContent="MightPulse APIキーを入力してください。";return;}
    if(!/^kss_/.test(key)&&!confirm("kss_ で始まらないキーです。このまま確認を続けますか？")) return;
    if(!confirm("このAPIキーをEagleEyeのMightPulse API Poolへ提供しますか？")) return;
    button.disabled=true; msg.className="muted"; msg.textContent="登録しています…";
    try{
      const r=await fetch("/api/me/mightpulse-key",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({api_key:key})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      msg.className="ok"; msg.textContent=d.promoted?"APIキーを登録しました。Advancedへ昇格しました。":"APIキーを登録しました。領主ID登録後にAdvanced昇格条件を満たします。";
      input.value=""; setTimeout(load,500);
    }catch(e){msg.className="error";msg.textContent=e.message||String(e);}
    finally{button.disabled=false;}
  }
  load().catch(e=>{app.innerHTML='<div class="card error">'+esc(e.message||String(e))+'</div>';});
}());
</script></body></html>`;
