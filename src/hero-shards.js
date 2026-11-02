// Hero shard calculator. Each star has six steps; MightPulse reports a hero's
// progress as `star` = completed steps (0–30, 30 = 5★ max). Costs per step were
// checked against kingshot.net, kingshotdata.com and kingshotalmanach.com
// (all agree; total 1,065 to max) and confirmed in game by the operator.

export const SHARD_STEP_COSTS = Object.freeze([
  Object.freeze([1, 1, 2, 2, 2, 2]),        // ★1 (10)
  Object.freeze([5, 5, 5, 5, 5, 15]),       // ★2 (40)
  Object.freeze([15, 15, 15, 15, 15, 40]),  // ★3 (115)
  Object.freeze([40, 40, 40, 40, 40, 100]), // ★4 (300)
  Object.freeze([100, 100, 100, 100, 100, 100]) // ★5 (600)
]);
export const SHARD_STEPS = Object.freeze(SHARD_STEP_COSTS.flat());
export const MAX_STEPS = SHARD_STEPS.length; // 30
// Heroes that only take their own (hero-specific) shards.
export const DEDICATED_SHARD_HEROES = Object.freeze(["Amadeus", "Helga", "アマデウス", "ヘルガ"]);

const clampSteps = value => Math.max(0, Math.min(MAX_STEPS, Math.floor(Number(value) || 0)));

// Shards needed to go from `fromSteps` completed steps to `toSteps`.
export function shardsBetween(fromSteps, toSteps) {
  const a = clampSteps(fromSteps), b = clampSteps(toSteps);
  let total = 0;
  for (let i = a; i < b; i++) total += SHARD_STEPS[i];
  return total;
}

export function describeProgress(steps) {
  const s = clampSteps(steps);
  if (s >= MAX_STEPS) return { star: 5, step: 0, label: "★5（最大）" };
  return { star: Math.floor(s / 6), step: s % 6, label: `★${Math.floor(s / 6)} 段階${s % 6}` };
}

export function heroShardPlan(steps) {
  const s = clampSteps(steps);
  const nextStar = s >= MAX_STEPS ? MAX_STEPS : (Math.floor(s / 6) + 1) * 6;
  return {
    steps: s,
    progress: describeProgress(s),
    nextStep: s >= MAX_STEPS ? 0 : SHARD_STEPS[s],
    nextStar: shardsBetween(s, nextStar),
    max: shardsBetween(s, MAX_STEPS)
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// heroes: [{ name, displayName, steps }] for the signed-in user, or null.
export function renderHeroShardPage({ origin = "", signedIn = false, heroes = null, heroesNote = "", loginHref = "/api/auth/discord" } = {}) {
  const canonical = origin + "/tools/hero-shards";
  const starOptions = [0, 1, 2, 3, 4, 5].map(n => `<option value="${n}">★${n}</option>`).join("");
  const stepOptions = [0, 1, 2, 3, 4, 5].map(n => `<option value="${n}">段階${n}</option>`).join("");
  const table = SHARD_STEP_COSTS.map((row, i) => `<tr><th>★${i + 1}</th>${row.map(v => `<td>${v}</td>`).join("")}<td><b>${row.reduce((a, b) => a + b, 0)}</b></td></tr>`).join("");

  let mine = "";
  if (signedIn && Array.isArray(heroes) && heroes.length) {
    const rows = heroes.map(h => {
      const plan = heroShardPlan(h.steps);
      const dedicated = DEDICATED_SHARD_HEROES.includes(h.name) || DEDICATED_SHARD_HEROES.includes(h.displayName);
      return `<tr><th>${esc(h.displayName || h.name)}${dedicated ? '<small class="ded">専用欠片</small>' : ""}</th><td>${esc(plan.progress.label)}</td><td>${plan.steps >= MAX_STEPS ? "—" : plan.nextStep}</td><td>${plan.steps >= MAX_STEPS ? "—" : plan.nextStar}</td><td><b>${plan.max || "完了"}</b></td></tr>`;
    }).join("");
    const total = heroes.reduce((sum, h) => sum + (DEDICATED_SHARD_HEROES.includes(h.name) || DEDICATED_SHARD_HEROES.includes(h.displayName) ? 0 : heroShardPlan(h.steps).max), 0);
    mine = `<section class="mine"><h2>あなたの英雄</h2><div class="tbl"><table><thead><tr><th>英雄</th><th>現在</th><th>次の段階</th><th>次の★</th><th>★5まで</th></tr></thead><tbody>${rows}</tbody></table></div><p class="sum">汎用の欠片で★5まで上げる合計：<b>${total.toLocaleString("ja-JP")}</b>個（専用欠片の英雄は除く）</p><p class="hint">MightPulseで取得した編成（アリーナ防衛編成）の英雄です。${esc(heroesNote)}</p></section>`;
  } else if (signedIn) {
    mine = `<section class="mine"><h2>あなたの英雄</h2><div class="empty">${esc(heroesNote || "英雄データがまだありません。マイKingShotで領主IDを登録し、プレイヤー詳細で「詳細情報を取得」すると表示されます。")}</div></section>`;
  } else {
    mine = `<section class="cta"><h2>ログインすると自分の英雄で自動計算</h2><p>EagleEyeに領主IDを登録すると、あなたの英雄の今の★と段階を読み取り、全員分の「次の★まで」「★5まで」の必要数を一覧で表示します。</p><a class="cta-btn" href="${esc(loginHref)}">Discordでログイン</a></section>`;
  }

  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/hero-catalog">英雄カタログ</a> › 欠片計算</nav>
<h1>英雄の欠片 計算</h1>
<p class="lead">KingShotの英雄の星上げに必要な欠片の数を計算します。★は1つにつき6段階あり、段階ごとに必要数が違います。</p>
<section class="calc"><div class="row"><label>今の★<select id="cs">${starOptions}</select></label><label>段階<select id="cp">${stepOptions}</select></label></div>
<div class="row"><label>目標<select id="ts">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === 5 ? " selected" : ""}>★${n}</option>`).join("")}</select></label><label>持っている欠片<input id="have" type="number" min="0" inputmode="numeric" placeholder="0"></label></div>
<div class="result" id="result" aria-live="polite"></div></section>
${mine}
<h2>段階ごとの必要数</h2><div class="tbl"><table><thead><tr><th></th><th>段階1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>合計</th></tr></thead><tbody>${table}</tbody></table></div>
<p class="note">★5まで合計1,065個。英雄の解放には別途10個（アマデウス20個・チェンコ40個との情報あり）。アマデウスとヘルガは専用の欠片のみ使用できます。数値はコミュニティ資料（kingshot.net・kingshotdata.com ほか）で照合し、ゲーム内で確認したものです。</p>
<script>(function(){var S=${JSON.stringify(SHARD_STEPS)};function q(id){return document.getElementById(id)}function calc(){var from=Math.min(30,Number(q("cs").value)*6+Number(q("cp").value)),to=Number(q("ts").value)*6,need=0;for(var i=from;i<to;i++)need+=S[i];var have=Math.max(0,Number(q("have").value)||0),r=q("result");if(to<=from){r.innerHTML="<b>目標に到達済みです</b>";return}r.innerHTML="必要な欠片 <b>"+need.toLocaleString("ja-JP")+"</b> 個"+(have?"<br>あと <b>"+Math.max(0,need-have).toLocaleString("ja-JP")+"</b> 個"+(have>=need?"（足りています）":""):"")}["cs","cp","ts","have"].forEach(function(id){q(id).addEventListener("input",calc);q(id).addEventListener("change",calc)});calc()})();</script>`;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>英雄の欠片 計算ツール（段階ごとの必要数） | EagleEye</title><meta name="description" content="KingShotの英雄の星上げに必要な欠片の数を計算。★1〜★5の段階ごとの必要数（★5まで合計1,065個）と、持っている欠片からの残り数がわかります。"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="英雄の欠片 計算ツール | EagleEye"><meta property="og:url" content="${esc(canonical)}">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a{color:var(--ee-cyan);text-decoration:none}h1{margin:6px 0 4px;font-size:26px}.lead{margin:0 0 14px;color:var(--ee-subtext);font-size:13px;line-height:1.6}h2{margin:22px 0 8px;font-size:17px}
.calc,.mine,.cta{padding:14px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel)}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}label{display:grid;gap:4px;font-size:12px;color:var(--ee-subtext)}select,input{padding:11px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel-deep);color:var(--ee-text)}.result{margin-top:6px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--ee-cyan) 12%,var(--ee-panel));font-size:15px}.result b{font-size:22px;color:var(--ee-cyan)}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 6px;border-bottom:1px solid var(--ee-border-soft);text-align:right;white-space:nowrap}th:first-child{text-align:left}thead th{font-size:11px;color:var(--ee-subtext)}.ded{display:block;font-size:10px;color:var(--ee-warning,#f59e0b)}.sum{font-size:14px}.sum b{color:var(--ee-cyan);font-size:18px}.hint,.note{font-size:11px;color:var(--ee-subtext);line-height:1.6}.empty{font-size:13px;color:var(--ee-subtext)}
.mine,.cta{margin-top:14px}.cta{border-color:color-mix(in srgb,var(--ee-cyan) 40%,transparent)}.cta p{font-size:13px;line-height:1.6}.cta-btn{display:inline-block;padding:11px 16px;border-radius:12px;background:var(--ee-cyan);color:var(--ee-on-accent,#062033);font-weight:900;text-decoration:none}</style></head><body><main class="wrap">${body}</main></body></html>`;
}
