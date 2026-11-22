// ログイン直後：領主をまだ登録していない人をマイKingShotの登録欄へ案内する（2026-11-17）。
// ・新しい人：いつも案内（元のページへは「あとで戻る」リンク）。
// ・前からの人：ホームに戻るときだけ案内（共有リンクなどから来た人はそのページへそのまま）。
// ・D1 はログインのときに1回読むだけ。
export async function hasActiveGovernor(db, userId) {
  if (!db || !userId) return true;
  const row = await db.prepare("SELECT 1 AS x FROM user_player_links WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1").bind(String(userId)).first().catch(() => ({ x: 1 }));
  return Boolean(row);
}

export function onboardingPath(returnPath) {
  const next = String(returnPath || "");
  const keep = next && next !== "/" && !next.startsWith("/my-player");
  return "/my-player?welcome=1" + (keep ? "&next=" + encodeURIComponent(next) : "");
}

export async function postLoginPath(db, { userId, isNew = false, returnPath = null } = {}) {
  const goingHome = !returnPath || returnPath === "/";
  if (!isNew && !goingHome) return returnPath;
  if (await hasActiveGovernor(db, userId)) return returnPath || "/";
  return onboardingPath(returnPath);
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function welcomeBannerHtml(next = null) {
  return `<section class="ee-benefits" id="welcome"><b>👋 ようこそ！まず自分の領主IDを登録しよう（30秒）</b><ul><li>ゲームで自分のプロフィールを開き、ID の数字をコピー</li><li>下の「領主ID」の欄に貼って登録</li></ul><p class="muted" style="margin:8px 0 0">登録すると、ホームに自分の戦力・育成の推移が出て、同盟比較や聖剣の通知も使えるようになります。</p>${next ? `<p class="muted" style="margin:6px 0 0"><a href="${esc(next)}">あとで登録する（元のページへ戻る）→</a></p>` : ""}</section><script>addEventListener("load",function(){var g=document.getElementById("gid");if(g){g.scrollIntoView({block:"center"});try{g.focus({preventScroll:true})}catch(e){}}})</script>`;
}
