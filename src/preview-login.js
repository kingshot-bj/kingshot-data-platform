// プレビュー専用の疑似ログイン（EAGLEEYE_ENV=preview のときだけ）。
// Discord のログインはプレビューの URL が毎回変わるため使えない。合言葉（PREVIEW_LOGIN_KEY）を入れると、
// 本番の users からオーナーを読んで、そのアカウントとしてのセッション Cookie を作る（D1 には書かない）。
// 「表示する権限」を選ぶと、その権限で見たときの画面を確認できる（preview_role）。
// プレビューのセッション鍵はデプロイごとに作り直すので、本番の Cookie とは互換がない。
// 2026-11-16：プレビュー全体にも合言葉をかける（公開前の機能を見られないように）。合言葉が通ると
// ゲート用の Cookie（12時間）を出し、それが無いページはこのログイン画面へ回す。「ゲストとして見る」も選べる。

export const PREVIEW_GATE_COOKIE = "eagleeye_preview_gate";
export const PREVIEW_GATE_MAX_AGE = 60 * 60 * 12;
export const GUEST = "guest";
// 合言葉なしで通すパス（ログイン画面・robots.txt）
export function isPreviewGateOpenPath(pathname) {
  return pathname === "/preview/login" || pathname === "/preview/logout" || pathname === "/robots.txt";
}
// ログイン後に戻る先（同じサイトの中だけ）
export function safeNextPath(next) {
  const v = String(next || "");
  return /^\/(?!\/)[^\s\\]*$/.test(v) && !v.startsWith("/preview/") ? v : "/";
}

export const PREVIEW_ROLES = Object.freeze([
  ["", "オーナー（本人のまま）"],
  ["guest", "ログインしない（ゲストとして見る）"],
  ["VIP", "VIP"],
  ["ADVANCED", "ADVANCED"],
  ["BASIC", "BASIC"]
]);
const ALLOWED = new Set(PREVIEW_ROLES.map(([v]) => v).filter(v => v && v !== GUEST));

export function previewRoleOf(session) {
  const r = String(session?.preview_role || "");
  return ALLOWED.has(r) ? r : "";
}

// 疑似ログインのセッションなら、表示する権限だけ差し替える（プレビュー以外では何もしない）。
export function applyPreviewRole(user, session, preview) {
  if (!preview || !user) return user;
  const role = previewRoleOf(session);
  return role ? { ...user, role } : user;
}

export function safeEqual(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0 && x.length > 0;
}

// 合言葉の総当たりを遅くする（isolate ごと・10分で10回まで）。
const failures = [];
export function previewLoginLimited(now = Date.now()) {
  while (failures.length && failures[0] < now - 600_000) failures.shift();
  return failures.length >= 10;
}
export function notePreviewLoginFailure(now = Date.now()) { failures.push(now); }
export function resetPreviewLoginFailures() { failures.length = 0; }

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

export function renderPreviewLoginPage({ message = "", configured = true, current = null, next = "/" } = {}) {
  const options = PREVIEW_ROLES.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>プレビューにログイン | EagleEye</title>
<style>body{margin:0;background:#0a1424;color:#e8f3ff;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif}main{max-width:420px;margin:0 auto;padding:32px 16px}h1{font-size:20px}p{font-size:13px;line-height:1.7;color:#91a7bf}label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700}input,select{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #223b57;background:#0f2035;color:#e8f3ff;font-size:16px}button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#22d3ee;color:#04202a;font-weight:800;font-size:15px}.msg{padding:10px 12px;border-radius:10px;background:#3b1d24;color:#ffd7de}.ok{background:#12301f;color:#c9f5da}a{color:#22d3ee}</style></head>
<body><main><h1>🧪 プレビューにログイン</h1>
<p>プレビューを見るには合言葉が必要です。「表示する権限」でオーナーのアカウントとして見るか（疑似ログイン）、ログインしないで見るかを選べます。プレビューは本番データを読むだけなので、保存する操作は実際には保存されません。</p>
${current ? `<p class="msg ok">今は「${esc(current)}」で見ています。<a href="/preview/logout">ログアウト</a></p>` : ""}
${message ? `<p class="msg">${esc(message)}</p>` : ""}
${configured ? `<form method="post" action="/preview/login"><input type="hidden" name="next" value="${esc(safeNextPath(next))}"><label for="k">合言葉</label><input id="k" name="key" type="password" autocomplete="current-password" required>
<label for="r">表示する権限</label><select id="r" name="role">${options}</select><button type="submit">ログイン</button></form>` : `<p class="msg">合言葉が設定されていません（GitHub のシークレット PREVIEW_LOGIN_KEY）。</p>`}
</main></body></html>`;
}
