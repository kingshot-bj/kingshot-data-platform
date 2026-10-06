export async function renderKingdomCatalogR2BackfillPage(env, result = null) {
  let initial = {};
  try {
    initial = await env.DB.prepare("SELECT last_kid, state, batches_run, rows_archived, last_batch_count, last_batch_at, last_success_at, last_error, updated_at FROM kingdom_catalog_r2_migration WHERE migration_key = 'KINGDOM_CATALOG_R2_BACKFILL' LIMIT 1").first() || {};
  } catch (error) {
    initial = { state: "ERROR", last_error: String(error?.message || error).slice(0, 500) };
  }
  let remainingCount = 0;
  try {
    const remainingRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM kingdom_catalog WHERE r2_latest_key IS NULL AND (raw_json IS NOT NULL OR boards_json IS NOT NULL)").first();
    remainingCount = Number(remainingRow?.count || 0);
  } catch (_) { remainingCount = 0; }
  const archivedCount = Number(initial.rows_archived || 0);
  const totalTargetCount = archivedCount + remainingCount;
  const progressPct = totalTargetCount > 0 ? Math.min(100, Math.round((archivedCount / totalTargetCount) * 1000) / 10) : 0;
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
  function renderResult(result) {
    const v = result?.verification || {};
    const checked = Number(v.checked || 0);
    const failed = Number(v.failed || 0);
    const passed = checked > 0 && failed === 0 && Number(v.r2) === checked && Number(v.pointer) === checked && Number(v.rawNull) === checked && Number(v.boardsNull) === checked;
    const archived = Number(result?.archived || 0);
    const nextKid = Number(result?.nextKid || 0);
    const cls = passed ? "pass" : "fail";
    const title = passed ? "🟢 バックフィル成功" : "🔴 バックフィル不合格";
    const detail = JSON.stringify(result, null, 2);
    return '<div class="result '+cls+'"><div class="resultTitle">'+title+'</div><div class="resultCount">'+archived+' / '+(checked || archived)+' 件</div><div class="resultGrid"><div>R2保存 <b>'+Number(v.r2||0)+'/'+checked+'</b></div><div>D1ポインタ <b>'+Number(v.pointer||0)+'/'+checked+'</b></div><div>raw_json退避 <b>'+Number(v.rawNull||0)+'/'+checked+'</b></div><div>boards_json退避 <b>'+Number(v.boardsNull||0)+'/'+checked+'</b></div><div>不整合 <b>'+failed+'件</b></div><div>次回KID <b>'+nextKid+'</b></div></div><details><summary>詳細ログ</summary><pre>'+escHtml(detail)+'</pre></details></div>';
  }
  const hasSuccess = Boolean(initial.last_success_at);
  const statusKey = initial.state === "FAILED" ? "FAILED" : initial.state === "RUNNING" ? "RUNNING" : hasSuccess ? "SUCCESS" : initial.state === "COMPLETE" ? "SUCCESS" : "IDLE";
  const statusLabel = statusKey === "FAILED" ? "🔴 不合格" : statusKey === "RUNNING" ? "🟡 実行中" : statusKey === "SUCCESS" ? "🟢 完了・成功" : "⚪ 未実行";
  const statusClass = statusKey === "FAILED" ? "statusFail" : statusKey === "RUNNING" ? "statusRun" : statusKey === "SUCCESS" ? "statusPass" : "statusIdle";
  const allDone = totalTargetCount > 0 && remainingCount === 0;
  const statusKey2 = initial.state === "FAILED" ? "FAILED" : initial.state === "RUNNING" ? "RUNNING" : allDone ? "SUCCESS" : hasSuccess ? "SUCCESS" : initial.state === "COMPLETE" ? "SUCCESS" : "IDLE";
  const statusLabel2 = statusKey2 === "FAILED" ? "🔴 不合格" : statusKey2 === "RUNNING" ? "🟡 実行中" : statusKey2 === "SUCCESS" ? "🟢 完了・成功" : "⚪ 未実行";
  const statusClass2 = statusKey2 === "FAILED" ? "statusFail" : statusKey2 === "RUNNING" ? "statusRun" : statusKey2 === "SUCCESS" ? "statusPass" : "statusIdle";
  const statusSub2 = statusKey2 === "FAILED" ? "前回のバックフィルまたは検証でエラーがあります" : statusKey2 === "RUNNING" ? "バックフィルを実行中です" : allDone ? "バックフィル対象が0件です。全件退避済みです" : statusKey2 === "SUCCESS" ? "前回のバックフィルは正常に完了しています" : "まだバックフィルを実行していません";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye R2バックフィル</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:20px 14px 48px}.nav{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.nav a{color:#f59e0b;text-decoration:none;font-weight:800}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.muted{color:#94a3b8;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.stat{padding:11px;border-radius:10px;background:#0b1220;border:1px solid #334155}.stat span{display:block;color:#94a3b8;font-size:11px}.stat b{display:block;margin-top:4px;overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.actions button,.actions a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:10px 15px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;text-decoration:none;cursor:pointer}.actions a.secondary{background:#334155;color:#f8fafc}.progressCard{margin:12px 0 4px;padding:14px;border-radius:12px;background:#0b1220;border:1px solid #334155}.progressTitle{color:#94a3b8;font-size:12px;font-weight:800}.progressNumbers{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-top:5px}.progressNumbers b{font-size:24px}.progressNumbers span{color:#fbbf24;font-weight:900}.progressTrack{height:10px;margin-top:10px;border-radius:999px;background:#334155;overflow:hidden}.progressFill{height:100%;background:#22c55e;border-radius:999px}.progressPct{text-align:right;margin-top:4px;color:#94a3b8;font-size:11px;font-weight:800}.heroStatus{margin:8px 0 6px;padding:14px;border-radius:10px;font-size:28px;font-weight:900;text-align:center}.heroSub{color:#cbd5e1;font-size:13px;margin-bottom:10px}.statusPass{background:#14532d;border:1px solid #22c55e}.statusFail{background:#7f1d1d;border:1px solid #ef4444}.statusRun{background:#78350f;border:1px solid #f59e0b}.statusIdle{background:#334155;border:1px solid #64748b}.result{margin-top:12px;padding:16px;border-radius:12px;background:#0b1220;border:1px solid #334155}.result.pass{border-color:#22c55e}.result.fail{border-color:#ef4444}.resultTitle{font-size:22px;font-weight:900}.resultCount{font-size:30px;font-weight:900;margin:8px 0 14px}.resultGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.resultGrid div{padding:9px;border-radius:8px;background:#162238}.resultGrid b{display:block;margin-top:3px;font-size:16px}details{margin-top:12px}details summary{cursor:pointer;color:#94a3b8;font-weight:700}pre{white-space:pre-wrap;word-break:break-word;font-size:11px;margin-top:8px}.notice{margin-top:12px;padding:11px;border-radius:10px;background:#1e293b;color:#cbd5e1;font-size:12px;line-height:1.6}@media(max-width:560px){.grid{grid-template-columns:1fr}.actions>*{width:100%}}</style></head>
<body><main class="wrap"><nav class="nav"><a href="/owner">← OWNER CONTROL</a><a href="/status">システム状況</a></nav>
<h1>王国Catalog → R2バックフィル</h1>
<p class="muted">既存の詳細JSONをR2へ退避し、成功後にD1の詳細JSONだけをNULL化します。1回の実行は最大100件です。</p>
<section class="card"><h2>バックフィル状態</h2><div class="heroStatus ${statusClass2}">${statusLabel2}</div><div class="heroSub">${statusSub2}</div><div class="progressCard"><div class="progressTitle">バックフィル進捗</div><div class="progressNumbers"><b>${archivedCount.toLocaleString("ja-JP")} / ${totalTargetCount.toLocaleString("ja-JP")}件</b><span>残り ${remainingCount.toLocaleString("ja-JP")}件</span></div><div class="progressTrack"><div class="progressFill" style="width:${progressPct}%"></div></div><div class="progressPct">${progressPct}%</div></div><div class="grid">
<div class="stat"><span>Last KID</span><b>${Number(initial.last_kid||0)}</b></div><div class="stat"><span>Batches</span><b>${Number(initial.batches_run||0)}</b></div><div class="stat"><span>Archived rows</span><b>${Number(initial.rows_archived||0)}</b></div><div class="stat"><span>前回処理</span><b>${Number(initial.last_batch_count||0)}件 完了</b></div>
<div class="stat"><span>Last batch at</span><b>${initial.last_batch_at ? new Date(Number(initial.last_batch_at)*1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div><div class="stat"><span>Last success</span><b>${initial.last_success_at ? new Date(Number(initial.last_success_at)*1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
<div class="stat"><span>前回の検証</span><b>${initial.state === "FAILED" ? "不合格" : initial.last_success_at ? "成功" : "—"}</b></div><div class="stat"><span>Last error</span><b>${escHtml(initial.last_error||"—")}</b></div><div class="stat"><span>Updated</span><b>${initial.updated_at ? new Date(Number(initial.updated_at)*1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</b></div>
</div><div class="actions"><form method="post" action="/owner/kingdom-catalog-r2-backfill" style="margin:0;width:100%"><input type="hidden" name="action" value="run_all"><label style="display:block;width:100%;color:#cbd5e1;font-size:13px;margin-bottom:6px">全件を自動バックフィル</label><select name="batch_size" style="width:100%;min-height:46px;margin-bottom:8px;padding:10px;border-radius:9px;border:1px solid #475569;background:#0b1220;color:#f8fafc;font-weight:800;font-size:16px"><option value="10">10件</option><option value="25">25件</option><option value="50" selected>50件</option><option value="100">100件</option></select><button type="submit" style="width:100%">全件バックフィル開始</button></form></div>${result ? renderResult(result) : ""}</section>
<section class="card"><h2>安全条件</h2><div class="notice">R2保存が成功した行だけD1の <b>raw_json / boards_json</b> をNULL化します。失敗した場合はD1の詳細JSONを残します。自動連続実行は行わず、1回ずつ実行します。</div></section>
</main><script>
(function(){
  const state=${JSON.stringify(initial.state || "UNKNOWN")};
  const hasResult=${result ? "true" : "false"};
  const autoContinue=${result?.autoContinue ? "true" : "false"};
  if (autoContinue) {
    const form=document.forms[0];
    if (form) setTimeout(function(){form.submit();},400);
  } else if (state === "RUNNING") setTimeout(function(){location.reload();},3000);
  else if (hasResult) setTimeout(function(){location.reload();},1800);
})();
</script></body></html>`;
}