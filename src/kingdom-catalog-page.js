export async function renderKingdomCatalogPage(request, env) {
  const url = new URL(request.url);
  const pageSize = 50;
  const requestedPage = Number(url.searchParams.get("page") || "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * pageSize;

  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM kingdom_catalog").first();
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const rows = await env.DB.prepare(
    "SELECT kid, name, status, region, language, last_seen_at FROM kingdom_catalog ORDER BY kid ASC LIMIT ? OFFSET ?"
  ).bind(pageSize, offset).all();
  const kingdoms = rows.results || [];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmtTime = value => value ? new Date(Number(value) * 1000).toLocaleString("ja-JP", {timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
  const cards = kingdoms.map(row => "<div class='card'><div class='head'><div><strong>王国 " + esc(row.kid) + "</strong><div class='name'>" + esc(row.name || "名称未取得") + "</div></div><span class='status'>" + esc(row.status || "—") + "</span></div><div class='meta'><span>Region: " + esc(row.region || "—") + "</span><span>Language: " + esc(row.language || "—") + "</span><span>最終確認: " + esc(fmtTime(row.last_seen_at)) + "</span></div></div>").join("");

  const prev = currentPage > 1
    ? "<a class='pager-btn' href='/kingdom-catalog?page=" + (currentPage - 1) + "'>← 前へ</a>"
    : "<span class='pager-btn disabled'>← 前へ</span>";
  const next = currentPage < totalPages
    ? "<a class='pager-btn' href='/kingdom-catalog?page=" + (currentPage + 1) + "'>次へ →</a>"
    : "<span class='pager-btn disabled'>次へ →</span>";

  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>王国カタログ | EagleEye</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:760px;margin:auto;padding:24px 16px 48px}.back{color:#94a3b8;text-decoration:none;font-weight:700}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{margin:5px 0 8px;font-size:30px}.sub{color:#94a3b8;line-height:1.6}.count{margin-top:18px;color:#cbd5e1;font-size:13px}.list{display:grid;gap:10px;margin-top:14px}.card{padding:15px 16px;border:1px solid #334155;border-radius:14px;background:#162238}.head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.head strong{font-size:17px}.name{margin-top:3px;color:#cbd5e1;font-size:13px}.status{padding:4px 8px;border:1px solid #475569;border-radius:999px;color:#cbd5e1;font-size:10px;font-weight:800}.meta{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:10px;color:#64748b;font-size:11px}.pager{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px}.pager-btn{display:inline-block;padding:8px 12px;border:1px solid #475569;border-radius:9px;color:#cbd5e1;text-decoration:none;font-size:12px;font-weight:800}.pager-btn.disabled{opacity:.35}.pager-info{color:#64748b;font-size:11px}.empty{margin-top:18px;padding:20px;border:1px dashed #475569;border-radius:14px;color:#94a3b8;text-align:center}@media(max-width:520px){.wrap{padding:18px 12px 36px}.title{font-size:26px}}</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><div class='eyebrow'>KINGDOM CATALOG</div><h1 class='title'>王国カタログ</h1><p class='sub'>EagleEyeが現在把握している王国の一覧です。</p><div class='count'>把握済み " + total.toLocaleString("ja-JP") + "王国 / " + currentPage + " / " + totalPages + "ページ</div><div class='list'>" + (cards || "<div class='empty'>現在、王国カタログに登録されている王国はありません。</div>") + "</div>" + (total > 0 ? "<div class='pager'>" + prev + "<span class='pager-info'>" + currentPage + " / " + totalPages + "</span>" + next + "</div>" : "") + "</main></body></html>";
}
