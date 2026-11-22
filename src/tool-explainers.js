// ツールページの「計算の例と数字の読み方」。2026-11-16 AdSense：ツールが入力欄と表だけで、読み物としての中身が薄かった。
// 数字はすべて各ツールの表（SHARD_STEP_COSTS・GOLD_COSTS・TECH_NODES）からその場で計算する。
// 表にない攻略の判断（どの英雄・建物を優先するか等）は書かない。

import { SHARD_STEP_COSTS, MAX_STEPS, shardsBetween, describeProgress } from "./hero-shards.js";
import { GOLD_COSTS, MAX_TG, goldBetween, GOLD_NAME, REFINED_GOLD_NAME } from "./gold-calculator.js";
import { TECH_NODES, TECH_BRANCHES, techBetween, DUST_NAME, COIN_NAME } from "./gold-tech.js";

const fmt = n => Number(n).toLocaleString("ja-JP");
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const STYLE = "<style>.tool-explain{margin:22px 0 8px}.tool-explain h2{font-size:17px;margin:0 0 8px}.tool-explain h3{font-size:14px;margin:14px 0 4px}.tool-explain p,.tool-explain li{font-size:13px;line-height:1.75;color:var(--ee-subtext,#91a7bf)}.tool-explain ul{margin:4px 0;padding-left:1.2em}.tool-explain b{color:var(--ee-text,#e8f3ff)}</style>";

function section(title, blocks) {
  return `${STYLE}<section class="tool-explain"><h2>${title}</h2>${blocks.map(([h, body]) => `<h3>${h}</h3>${body}`).join("")}</section>`;
}

export function heroShardExplainer() {
  const total = shardsBetween(0, MAX_STEPS);
  const starTotals = SHARD_STEP_COSTS.map(r => r.reduce((a, b) => a + b, 0));
  const last = starTotals[starTotals.length - 1];
  const ex = (from, to) => `<li>${describeProgress(from).label} → ${describeProgress(to).label}：<b>${fmt(shardsBetween(from, to))}個</b></li>`;
  // 各★の最後の段階だけ多い（★5 はすべて同じ）
  const jumps = SHARD_STEP_COSTS.map((r, i) => ({ star: i + 1, before: r[4], lastStep: r[5] })).filter(j => j.lastStep > j.before);
  return section("計算の例と数字の読み方", [
    ["計算の例", `<ul>${ex(0, 6)}${ex(12, 18)}${ex(18, 24)}${ex(24, MAX_STEPS)}${ex(0, MAX_STEPS)}</ul>`],
    ["必要数は後半に集中する", `<p>★5までの合計${fmt(total)}個のうち、最後の6段階（表の★5の行）だけで<b>${fmt(last)}個（${pct(last, total)}%）</b>、その前の6段階（★4の行）で${fmt(starTotals[3])}個（${pct(starTotals[3], total)}%）です。表の★1〜★3の行は合わせて${fmt(starTotals[0] + starTotals[1] + starTotals[2])}個（${pct(starTotals[0] + starTotals[1] + starTotals[2], total)}%）なので、育成の後半ほど欠片が必要になります。</p>`],
    ["各★の最後の段階だけ多い", `<p>${jumps.map(j => `★${j.star}の行は段階5まで${fmt(j.before)}個ずつで、段階6が<b>${fmt(j.lastStep)}個</b>`).join("、")}です。次の★の直前で必要数が増えるので、「あと1段階」でも思ったより多く必要になることがあります。</p>`]
  ]);
}

export function goldExplainer() {
  const rows = Object.entries(GOLD_COSTS).map(([key, b]) => ({ key, label: b.label, ...goldBetween(key, 0, MAX_TG) }));
  const all = rows.reduce((a, r) => ({ gold: a.gold + r.gold, refined: a.refined + r.refined }), { gold: 0, refined: 0 });
  const tc = rows.find(r => r.key === "town_center");
  const g5to8 = Object.keys(GOLD_COSTS).reduce((a, k) => { const v = goldBetween(k, 5, MAX_TG); return { gold: a.gold + v.gold, refined: a.refined + v.refined }; }, { gold: 0, refined: 0 });
  const g0to5 = Object.keys(GOLD_COSTS).reduce((a, k) => a + goldBetween(k, 0, 5).gold, 0);
  return section("計算の例と数字の読み方", [
    ["建物1つをG8まで（なし → G8）", `<ul>${rows.map(r => `<li>${r.label}：<b>${GOLD_NAME}${fmt(r.gold)}</b>・${REFINED_GOLD_NAME}${fmt(r.refined)}</li>`).join("")}</ul>`],
    ["全部の建物をそろえる場合", `<p>表の8つの建物をすべてG8にすると、${GOLD_NAME}<b>${fmt(all.gold)}</b>・${REFINED_GOLD_NAME}<b>${fmt(all.refined)}</b>です。そのうち役場だけで${GOLD_NAME}の${pct(tc.gold, all.gold)}%を使います。全部の建物をG5までにするのに${GOLD_NAME}${fmt(g0to5)}、G5からG8までに${GOLD_NAME}${fmt(g5to8.gold)}・${REFINED_GOLD_NAME}${fmt(g5to8.refined)}が必要です。</p>`],
    ["G6からは精製黄金も必要", `<p>G1〜G5は${GOLD_NAME}だけですが、G6〜G8は${REFINED_GOLD_NAME}も必要です（表の「+」の数字）。${GOLD_NAME}が足りていても${REFINED_GOLD_NAME}が足りずに止まることがあるので、「手持ち」に両方を入れると残りが分かります。</p>`]
  ]);
}

export function goldTechExplainer() {
  const per = TECH_NODES.reduce((a, n) => { const v = techBetween(n.key, 0, n.max); return { dust: a.dust + v.dust, coin: a.coin + v.coin }; }, { dust: 0, coin: 0 });
  const troops = TECH_BRANCHES.length;
  const big = TECH_NODES.map(n => ({ n, ...techBetween(n.key, 0, n.max) })).sort((a, b) => b.dust - a.dust);
  const top = big.filter(x => x.dust === big[0].dust);
  const heal = TECH_NODES.find(n => n.key === "heal");
  const firstThree = ["base", "tier2_left", "tier2_right"].reduce((a, k) => a + techBetween(k, 0, TECH_NODES.find(n => n.key === k).max).dust, 0);
  return section("計算の例と数字の読み方", [
    ["全部の研究を最大にする場合", `<p>1兵種のすべての研究を最大Lvにするには、${DUST_NAME}<b>${fmt(per.dust)}</b>・${COIN_NAME}<b>${fmt(per.coin)}</b>です。${troops}兵種すべてなら${DUST_NAME}${fmt(per.dust * troops)}・${COIN_NAME}${fmt(per.coin * troops)}になります。</p>`],
    ["どの研究が重いか", `<p>いちばん${DUST_NAME}が多いのは${top.map(x => x.n.name.replace("{兵}", "〇兵")).join("と")}で、それぞれ${fmt(top[0].dust)}個（1兵種の合計の${pct(top[0].dust, per.dust)}%）です。最初の研究と2段目の2つを合わせても${fmt(firstThree)}個（${pct(firstThree, per.dust)}%）なので、ツリーの下の段ほど重くなります。</p>`],
    ["Lvが上がるほど1回が重い", `<p>たとえば${heal.name.replace("{兵}", "〇兵")}は Lv.1 が${DUST_NAME}${fmt(heal.dust[0])}個、最後の Lv.${heal.max} は${fmt(heal.dust[heal.max - 1])}個で、約${Math.round(heal.dust[heal.max - 1] / heal.dust[0])}倍です。今のLvと目標を入れると、残りの分だけを計算できます。</p>`]
  ]);
}
