import { getKingdomCollectionCoverage } from "./kingdom-collection-stats.js";
function formatCount(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

export async function renderAdminDataCoveragePage(env, auth) {
  if (!env?.DB) {
    return `<!doctype html><html lang="ja"><body style="background:#0f172a;color:#f8fafc;font-family:system-ui;padding:32px"><h1>DB未設定</h1><p>データ登録状況を取得できません。</p></body></html>`;
  }

  const startedAt = Date.now();
  try {
    const [playerCounts, rankingKingdomCount, watchlistCounts, accountCounts, collectionCoverage] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS player_count, COUNT(DISTINCT kid) AS kingdom_count FROM players WHERE governor_id IS NOT NULL").first(),
      env.DB.prepare("SELECT COUNT(DISTINCT kid) AS count FROM kingdom_ranking_current").first(),
      env.DB.prepare("SELECT COUNT(*) AS watchlist_count, COUNT(DISTINCT kid) AS kingdom_count FROM kingdom_watchlists WHERE enabled = 1").first(),
      env.DB.prepare("SELECT role, COUNT(*) AS count FROM users GROUP BY role").all(),
      getKingdomCollectionCoverage(env.DB)
    ]);

    const players = Number(playerCounts?.player_count || 0);
    const playerKingdoms = Number(playerCounts?.kingdom_count || 0);
    const rankingKingdoms = Number(rankingKingdomCount?.count || 0);
    const watchedKingdoms = Number(watchlistCounts?.kingdom_count || 0);
    const activeWatchlists = Number(watchlistCounts?.watchlist_count || 0);
    const collection = collectionCoverage || {};
    const accountRows = accountCounts?.results || [];
    const accountByRole = new Map(accountRows.map(row => [String(row.role || "BASIC").toUpperCase(), Number(row.count || 0)]));
    const totalAccounts = accountRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const elapsedMs = Date.now() - startedAt;
    const generatedAt = new Date().toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye データ登録状況</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 16px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{margin:5px 0 8px;font-size:30px}.sub{color:#94a3b8;line-height:1.6}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{display:inline-block;margin-top:12px;padding:6px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:12px;font-weight:900}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px}.metric{padding:22px;border:1px solid #334155;border-radius:16px;background:#162238}.metric-label{color:#94a3b8;font-size:13px}.metric-value{margin-top:8px;font-size:38px;font-weight:900;letter-spacing:-1px}.metric-note{margin-top:7px;color:#64748b;font-size:12px;line-height:1.5}.section{margin-top:24px}.section h2{font-size:15px;color:#cbd5e1;margin:0 0 10px}.detail{display:grid;gap:10px}.row{display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border:1px solid #334155;border-radius:12px;background:#111c30}.row span{color:#94a3b8}.row b{font-variant-numeric:tabular-nums}.meta{margin-top:18px;color:#64748b;font-size:12px;line-height:1.6}.refresh{display:inline-block;padding:9px 12px;border:1px solid #475569;border-radius:10px;color:#e2e8f0;text-decoration:none;background:#162238}.refresh:hover{border-color:#64748b}@media(max-width:640px){.grid{grid-template-columns:1fr}.top{align-items:flex-start}.title{font-size:26px}.metric-value{font-size:34px}}</style></head><body><main class="wrap">
<div class="top"><a class="back" href="/admin">← ADMIN CONTROL</a><a class="refresh" href="/admin/data-coverage">再読み込み</a></div>
<div class="eyebrow">EAGLEEYE DATA COVERAGE</div><h1 class="title">データ登録状況</h1><p class="sub">現在のEagleEye D1に保持しているプレイヤー数と王国数を確認できます。件数はこの画面を開いた時点のD1集計値です。</p><div class="badge">ROLE: ${String(auth?.role || "ADMIN")}</div>
<div class="grid"><div class="metric"><div class="metric-label">登録プレイヤー</div><div class="metric-value">${formatCount(players)}人</div><div class="metric-note">players テーブルの現在登録件数。governor_id単位で1件です。</div></div>
<div class="metric"><div class="metric-label">登録王国</div><div class="metric-value">${formatCount(playerKingdoms)}王国</div><div class="metric-note">players テーブルに存在する kid のユニーク数。</div></div></div>
<div class="section"><h2>ユーザー・ロール</h2><div class="grid">
<div class="metric"><div class="metric-label">EagleEye登録アカウント</div><div class="metric-value">${formatCount(totalAccounts)}人</div><div class="metric-note">Discord認証で作成されたEagleEyeユーザーアカウント数。</div></div>
<div class="metric"><div class="metric-label">OWNER</div><div class="metric-value">${formatCount(accountByRole.get("OWNER") || 0)}人</div></div>
<div class="metric"><div class="metric-label">ADMIN</div><div class="metric-value">${formatCount(accountByRole.get("ADMIN") || 0)}人</div></div>
<div class="metric"><div class="metric-label">ADVANCED</div><div class="metric-value">${formatCount(accountByRole.get("ADVANCED") || 0)}人</div></div>
<div class="metric"><div class="metric-label">BASIC</div><div class="metric-value">${formatCount(accountByRole.get("BASIC") || 0)}人</div></div>
</div></div>
<div class="section"><h2>王国コレクション状況</h2><div class="detail">
<div class="row"><span>Catalog登録王国</span><b>${formatCount(collection.catalogTotal)}王国</b></div>
<div class="row"><span>取得済み王国</span><b>${formatCount(collection.collectedCount)}王国</b></div>
<div class="row"><span>未取得王国</span><b>${formatCount(collection.uncollectedCount)}王国</b></div>
<div class="row"><span>累計成功取得</span><b>${formatCount(collection.collectionCount)}回</b></div>
<div class="row"><span>運営取得</span><b>${formatCount(collection.operatorCollectionCount)}回</b></div>
<div class="row"><span>ユーザー取得</span><b>${formatCount(collection.userCollectionCount)}回</b></div>
</div></div>
<div class="section"><h2>関連データ</h2><div class="detail">
<div class="row"><span>ランキングデータが存在する王国</span><b>${formatCount(rankingKingdoms)}王国</b></div>
<div class="row"><span>有効な王国ウォッチリスト</span><b>${formatCount(activeWatchlists)}件</b></div>
<div class="row"><span>ウォッチ対象のユニーク王国</span><b>${formatCount(watchedKingdoms)}王国</b></div>
</div></div>
<div class="meta">取得時刻（日本時間）：${generatedAt}<br>集計処理：約${elapsedMs}ms<br>王国コレクションは「ランキング＋プレイヤー取得が正常完了した王国」を取得済みとして記録します。<br>※「登録王国」はプレイヤーDB基準です。ランキングだけ存在する王国は上の関連データで別に確認できます。</div>
</main></body></html>`;
  } catch (error) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye データ登録状況</title><style>body{background:#0f172a;color:#f8fafc;font-family:system-ui;padding:28px}.error{margin-top:18px;padding:16px;border:1px solid #7f1d1d;background:#3a1418;border-radius:12px;color:#fca5a5}a{color:#cbd5e1}</style></head><body><a href="/admin">← ADMIN CONTROL</a><h1>データ登録状況を取得できません</h1><div class="error">${String(error?.message || error)}</div></body></html>`;
  }
}
