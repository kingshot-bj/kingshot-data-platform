// SNS投稿セットを「今すぐ作る」：オーナー画面のボタンから GitHub Actions の「SNS weekly pack」を動かす。
// ・投稿はしない（post: false 固定）。作るのと R2 への保存だけ。投稿は毎週の定期実行か、GitHub から手動で選んだ時だけ。
// ・鍵は Worker のシークレット SOCIAL_GITHUB_DISPATCH_TOKEN（このリポジトリの Actions だけ動かせる鍵）。無ければボタンは「未設定」。
// ・D1 は使わない。状態は GitHub の実行一覧から読む。鍵の値は画面にもログにも出さない。
export const SOCIAL_WORKFLOW = Object.freeze({ owner: "kingshot-bj", repo: "kingshot-data-platform", workflow: "social-weekly.yml", ref: "main" });

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
const API = `https://api.github.com/repos/${SOCIAL_WORKFLOW.owner}/${SOCIAL_WORKFLOW.repo}/actions/workflows/${SOCIAL_WORKFLOW.workflow}`;

function token(env) { return String(env?.SOCIAL_GITHUB_DISPATCH_TOKEN || "").trim(); }
function headers(env) {
  return { authorization: `Bearer ${token(env)}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "EagleEyeSocialRun/1.0" };
}

function summarizeRun(run) {
  if (!run) return null;
  return { status: String(run.status || ""), conclusion: run.conclusion == null ? null : String(run.conclusion), event: String(run.event || ""), createdAt: String(run.created_at || ""), url: String(run.html_url || "") };
}

export async function socialRunStatus(env, fetchImpl = fetch) {
  if (!token(env)) return { ok: true, configured: false, running: false, last: null };
  const res = await fetchImpl(`${API}/runs?per_page=5`, { headers: headers(env) }).catch(() => null);
  if (!res) return { ok: false, configured: true, error: "GITHUB_UNAVAILABLE" };
  if (!res.ok) return { ok: false, configured: true, error: res.status === 401 || res.status === 403 || res.status === 404 ? "GITHUB_TOKEN_REJECTED" : "GITHUB_UNAVAILABLE" };
  const runs = (await res.json().catch(() => ({})))?.workflow_runs || [];
  return { ok: true, configured: true, running: runs.some(r => ACTIVE.has(String(r.status))), last: summarizeRun(runs[0]) };
}

export async function triggerSocialRun(env, fetchImpl = fetch) {
  if (!token(env)) return { ok: false, error: "NOT_CONFIGURED" };
  // 作成中なら重ねて動かさない（同じ週の分を上書きし合うだけで、Actions の時間がむだになる）。
  const status = await socialRunStatus(env, fetchImpl);
  if (!status.ok) return { ok: false, error: status.error };
  if (status.running) return { ok: false, error: "ALREADY_RUNNING", last: status.last };
  const res = await fetchImpl(`${API}/dispatches`, {
    method: "POST", headers: { ...headers(env), "content-type": "application/json" },
    body: JSON.stringify({ ref: SOCIAL_WORKFLOW.ref, inputs: { post: false } })
  }).catch(() => null);
  if (!res) return { ok: false, error: "GITHUB_UNAVAILABLE" };
  if (res.status !== 204 && !res.ok) return { ok: false, error: res.status === 401 || res.status === 403 || res.status === 404 ? "GITHUB_TOKEN_REJECTED" : "GITHUB_UNAVAILABLE" };
  return { ok: true };
}
