export async function renderKingdomCatalogR2BackfillPage(env, result = null) {
  let initial = {};
  try {
    initial = await env.DB.prepare("SELECT last_kid, state, batches_run, rows_archived, last_batch_count, last_batch_at, last_success_at, last_error, updated_at FROM kingdom_catalog_r2_migration WHERE migration_key = 'KINGDOM_CATALOG_R2_BACKFILL' LIMIT 1").first() || {};
  } catch (error) {
    initial = { state: "ERROR", last_error: String(error?.message || error).slice(0, 500) };
  }
  const initialJson = JSON.stringify({
    state: initial.state || "IDLE",
    lastKid: Number(initial.last_kid || 0),
    batchesRun: Number(initial.batches_run || 0),
    rowsArchived: Number(initial.rows_archived || 0),
    lastBatchCount: Number(initial.last_batch_count || 0),
    lastBatchAt: initial.last_batch_at == null ? null : Number(initial.last_batch_at),
    lastSuccessAt: initial.last_success_at == null ? null : Number(initial.last_success_at),
    lastError: initial.last_error || null,
    updatedAt: initial.updated_at == null ? null : Number(initial.updated_at)
  }).replace(/</g, "\\u003c");
  const resultJson = result ? JSON.stringify(result).replace(/</g, "\\u003c") : null;
  const escHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye R2バックフィル</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:20px 14px 48px}.nav{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.nav a{color:#f59e0b;text-decoration:none;font-weight:800}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.muted{color:#94a3b8;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.stat{padding:11px;border-radius:10px;background:#0b1220;border:1px solid #334155}.stat span{display:block;color:#94a3b8;font-size:11px}.stat b{display:block;margin-top:4px;overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.actions button,.actions a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:10px 15px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;text-decoration:none;cursor:pointer}.actions a.secondary{background:#334155;color:#f8fafc}.result{margin-top:12px;padding:11px;border-radius:10px;background:#0b1220;border:1px solid #334155;white-space:pre-wrap;word-break:break-word;font-size:12px}.notice{margin-top:12px;padding:11px;border-radius:10px;background:#1e293b;color:#cbd5e1;font-size:12px;line-height:1.6}@media(max-width:560px){.grid{grid-template-columns:1fr}.actions>*{width:100%}}</style></head>
<body><main class="wrap"><nav class="nav"><a href="/owner">← OWNER CONTROL</a><a href="/status">システム状況</a></nav>
<h1>王国Catalog → R2バックフィル</h1>
<p class="muted">既存の詳細JSONをR2へ退避し、成功後にD1の詳細JSONだけをNULL化します。1回の実行は最大100件です。</p>
<section class="card"><h2>現在の状態</h2><div class="muted">${escHtml(initial.state||"UNKNOWN")}</div><div class="grid">
<div class="stat"><span>Last KID</span><b>${Number(initial.last_kid||0)}</b></div><div class="stat"><span>Batches</span><b>${Number(initial.batches_run||0)}</b></div><div class="stat"><span>Archived rows</span><b>${Number(initial.rows_archived||0)}</b></div><div class="stat"><span>Last batch</span><b>${Number(initial.last_batch_count||0)}</b></div>
<div class="stat"><span>Last batch at</span><b>${initial.last_batch_at ? new Date(Number(initial.last_batch_at)*1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div><div class="stat"><span>Last success</span><b>${initial.last_success_at ? new Date(Number(initial.last_success_at)*1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
<div class="stat"><span>Last error</span><b>${escHtml(initial.last_error||"—")}</b></div><div class="stat"><span>Updated</span><b>${initial.updated_at ? new Date(Number(initial.updated_at)*1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
</div><div class="actions"><form method="post" action="/owner/kingdom-catalog-r2-backfill" style="margin:0;width:100%"><input type="hidden" name="action" value="run"><label style="display:block;width:100%;color:#cbd5e1;font-size:13px;margin-bottom:6px">1回の処理件数</label><select name="batch_size" style="width:100%;min-height:46px;margin-bottom:8px;padding:10px;border-radius:9px;border:1px solid #475569;background:#0b1220;color:#f8fafc;font-weight:800;font-size:16px"><option value="10">10件</option><option value="25">25件</option><option value="50" selected>50件</option><option value="100">100件</option></select><button type="submit" style="width:100%">選択件数をバックフィル実行</button></form><a class="secondary" href="/owner/kingdom-catalog-r2-backfill">状態を更新</a></div>${resultJson ? '<div class="result">'+escHtml(resultJson)+'</div>' : ""}</section>
<section class="card"><h2>安全条件</h2><div class="notice">R2保存が成功した行だけD1の <b>raw_json / boards_json</b> をNULL化します。失敗した場合はD1の詳細JSONを残します。自動連続実行は行わず、1回ずつ実行します。</div></section>
</main></body></html>`;
}