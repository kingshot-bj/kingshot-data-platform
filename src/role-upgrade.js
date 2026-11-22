// BASIC → ADVANCED の後押し。
// ・ADVANCED限定の表示項目（英雄スキル・装備、領主装備、座標）を BASIC には「ぼかし＋案内」で見せる
// ・マイKingShot に「ADVANCEDになると増えること」を並べる
// ・未登録の人にホーム上部・全ページ上部で最初の一歩を案内する
// どの項目を限定にするかは player_visibility_settings（オーナー管理）で決まる。ここは見せ方だけ。

export const ADVANCED_TEASER_ITEMS = Object.freeze([
  { key: "heroes_skills", label: "英雄スキル" },
  { key: "heroes_exclusive_gear", label: "英雄専用装備" },
  { key: "heroes_gear", label: "英雄の装備" },
  { key: "gov_gear_list", label: "領主装備" },
  { key: "gov_gear_gems", label: "領主装備の宝石" },
  { key: "base_coordinates", label: "座標" }
]);

// 今のロールでは見えないが ADVANCED なら見える項目。
export function lockedAdvancedItems(settings, role, isEnabled) {
  return ADVANCED_TEASER_ITEMS.filter(item => !isEnabled(settings, item.key, role) && isEnabled(settings, item.key, "ADVANCED"));
}

export const UPGRADE_URL = "/my-player";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const LOCKED_CSS = `.ee-locked{position:relative;margin:14px 0;border:1px solid rgba(250,204,21,.35);border-radius:16px;overflow:hidden;background:rgba(15,23,42,.35)}
.ee-locked-blur{padding:14px;filter:blur(5px);opacity:.75;pointer-events:none;user-select:none}
.ee-locked-blur .ee-lr{display:grid;grid-template-columns:2.6em 1fr 4.5em;gap:10px;align-items:center;margin:7px 0}
.ee-locked-blur i{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,rgba(34,211,238,.55),rgba(167,139,250,.45))}
.ee-locked-blur b{display:block;width:2.6em;height:2.6em;border-radius:10px;background:rgba(250,204,21,.45)}
.ee-locked-cta{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;text-align:center;background:linear-gradient(180deg,rgba(2,6,23,.15),rgba(2,6,23,.55))}
.ee-locked-cta strong{font-size:15px;color:#fde68a}.ee-locked-cta span{font-size:12px;color:#e2e8f0}
.ee-locked-cta a{margin-top:4px;padding:8px 16px;border-radius:999px;background:#facc15;color:#1f1300;font-weight:900;text-decoration:none;font-size:13px}
.ee-lock-inline{display:inline-flex;align-items:center;gap:6px}.ee-lock-inline em{font-style:normal;filter:blur(4px);user-select:none}
.ee-lock-inline a{font-size:11px;font-weight:900;color:#facc15;text-decoration:none;white-space:nowrap}`;

// 英雄・領主装備などのまとまったセクション用（中身は意味のないダミーをぼかす）。
export function renderLockedSection(locked) {
  const blocks = locked.filter(item => item.key !== "base_coordinates");
  if (!blocks.length) return "";
  const names = blocks.map(item => item.label).join("・");
  const rows = Array.from({ length: 4 }, (_, i) => `<div class="ee-lr"><b></b><i style="width:${88 - i * 12}%"></i><i style="width:80%"></i></div>`).join("");
  return `<section class="ee-locked" aria-label="ADVANCEDで表示される情報"><div class="ee-locked-blur" aria-hidden="true">${rows}</div><div class="ee-locked-cta"><strong>🔒 ${esc(names)}</strong><span>ADVANCEDになると見られます（領主IDとAPIキーの登録で無料で昇格）</span><a href="${UPGRADE_URL}">登録してADVANCEDになる →</a></div></section>`;
}

// 座標のような1つの値用。
export function lockedInlineValue() {
  return `<span class="ee-lock-inline"><em aria-hidden="true">123, 456</em><a href="${UPGRADE_URL}">🔒 ADVANCED</a></span>`;
}

export const ADVANCED_BENEFITS = Object.freeze([
  "英雄スキル・英雄専用装備・英雄の装備",
  "領主装備・宝石",
  "プレイヤーの座標",
  "KvK画面（対戦相手・スコア推移・秘境の試練のステージ別比較）",
  "ウォッチリスト：プレイヤー3人 → 20人、王国1 → 3"
]);

export function advancedBenefitsHtml() {
  return `<div class="ee-benefits"><b>ADVANCEDになると増えること</b><ul>${ADVANCED_BENEFITS.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
}
export const BENEFITS_CSS = `.ee-benefits{margin:10px 0 12px;padding:12px 14px;border:1px solid rgba(250,204,21,.35);border-radius:14px;background:rgba(250,204,21,.06)}.ee-benefits b{display:block;font-size:13px;color:#fde68a;margin-bottom:6px}.ee-benefits ul{margin:0;padding-left:1.2em;font-size:13px;line-height:1.7}`;

// 未登録・未昇格の人への案内（step: "link" = 領主ID未登録, "key" = APIキー未登録）。
export function onboardingStep({ role, linked }) {
  if (String(role || "").toUpperCase() !== "BASIC") return null;
  return linked ? "key" : "link";
}

export function onboardingCopy(step) {
  if (step === "link") return { title: "まず領主IDを登録しよう（30秒）", body: "自分の戦力・役場・ウォッチ中の変化がホームに出るようになります。", cta: "領主IDを登録する" };
  if (step === "key") return { title: "あと1ステップでADVANCED", body: "MightPulseのAPIキー（無料・約1分）を登録すると、英雄の装備・領主装備・KvK画面が見られます。", cta: "APIキーを登録する" };
  return null;
}
