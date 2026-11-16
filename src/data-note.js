// 公開ページ共通の「データについて」。取得元・更新・集計対象・算出方法・欠けているデータを同じ形で書く。
// 2026-11-16 AdSense 監査：ページごとに書き方がばらばらで、集計方法や更新頻度が分からなかった。
// D1 も API も使わない（渡された数字を並べるだけ）。スタイルはこの中で完結させる（KvK ページは独自の shell のため）。

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

const SOURCE = 'ゲーム内の公開データを <a href="https://www.mightpulse.com/" target="_blank" rel="noopener noreferrer">MightPulse</a> の API から取得しています。順位・比較・分析は EagleEye が計算したものです。';
const UNOFFICIAL = "EagleEye はキングショットの公式サイトではありません。数字の誤りに気付いたら、お問い合わせからお知らせください。";

const STYLE = "margin:22px 0 8px;padding:12px 14px;border:1px dashed var(--ee-border-soft,#223b57);border-radius:13px;font-size:12.5px;line-height:1.7;color:var(--ee-subtext,#91a7bf)";

// items: [[見出し, HTML], ...]（HTML は呼び出し側で esc 済みの前提）
export function renderDataNote(items) {
  const rows = [["取得元", SOURCE], ...items.filter(([, v]) => v)];
  return `<section class="data-note-box" style="${STYLE}"><h2 style="margin:0 0 6px;font-size:14px;color:var(--ee-text,#e8f3ff)">データについて</h2><dl style="margin:0">${rows.map(([k, v]) => `<dt style="margin-top:6px;font-weight:800;color:var(--ee-text,#e8f3ff)">${esc(k)}</dt><dd style="margin:0">${v}</dd>`).join("")}</dl><p style="margin:8px 0 0">${UNOFFICIAL} <a href="/guide">使い方（ページの見方・用語集）</a>・<a href="/support">お問い合わせ</a>・<a href="/about">運営者情報</a></p></section>`;
}

const n = v => Number(v || 0).toLocaleString("ja-JP");

export function kingdomDataNote({ total = null } = {}) {
  return renderDataNote([
    ["更新", "総力・7日間の伸び・開設日数・領主数は毎日。上位10人・同盟・秘境の試練は毎月取り直し、見出しの横に取得した日を出しています。"],
    ["集計対象", total ? `キングショットの全${esc(n(total))}王国。` : "キングショットの全王国。"],
    ["算出方法", "順位は全王国の中と、開設日数の差が30日以内の王国の中で数えています。秘境の試練は種類ごとの1位の記録と上位10人の平均。この30日の動きは、30日前・7日前の記録との差です。総力は兵士の数や建物でも増えるので、強さとは比例しません。"],
    ["欠けているデータ", "記録が取れていない項目は表示していません（開設して間もない王国など）。"]
  ]);
}

export function kingdomsIndexDataNote({ total = null } = {}) {
  return renderDataNote([
    ["更新", "毎日。"],
    ["集計対象", total ? `キングショットの全${esc(n(total))}王国。` : "キングショットの全王国。"],
    ["算出方法", "ランキングは総力の大きい順と、7日間の総力の増加の大きい順です。新しい王国のランキングは開設180日以内の王国だけで数えています。"]
  ]);
}

export function kvkDataNote({ season, matched = 0, solo = 0, ready = 0 } = {}) {
  return renderDataNote([
    ["更新", `組み合わせはシーズン${esc(season)}の発表時に取得。秘境の試練の記録は、シーズン中に各王国の上位の記録を集めたものです。`],
    ["集計対象", `組み合わせ${esc(n(matched))}組${solo ? `（このほか相手のいない王国が${esc(n(solo))}）` : ""}。両方の王国の記録がそろった${esc(n(ready))}組を比べています。`],
    ["算出方法", "秘境の試練の6種類それぞれで両王国の1位の記録を比べ、上回った種類の数を出しています。KvKの勝敗の予想ではありません。総力は参考として載せています。"]
  ]);
}
