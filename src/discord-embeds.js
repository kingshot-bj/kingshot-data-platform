// Discord 通知の「埋め込みカード（embed）」。文字だけの通知を、色の帯・BJにゃん・項目で見やすくする。
// 文字版（content）はフォールバック・テスト用に残し、送信時は embed を優先する。

export const EMBED_COLORS = Object.freeze({
  matchup: 0xf59e0b, // オレンジ
  win: 0x22c55e,     // 緑
  lose: 0xef4444,    // 赤
  even: 0x94a3b8,    // グレー
  mystic: 0xa78bfa,  // 紫
  news: 0x22d3ee     // 水色
});

const POSES = { matchup: "book", win: "common", mystic: "book", news: "common" };
const pose = (origin, kind) => origin && POSES[kind] ? { url: `${origin}/assets/eagleeye/bjnyan/poses/${POSES[kind]}.webp` } : undefined;
const footer = origin => ({ text: "EagleEye · " + (origin ? origin.replace(/^https?:\/\//, "") : "eagleeye-ks.com"), icon_url: origin ? origin + "/assets/eagleeye/icons/icon-192.png" : undefined });
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export function compactScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(2) + "B" : a >= 1e6 ? (n / 1e6).toFixed(1) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
}

// 「1524 ██████████░░░░░░░░ 1523」のような割合バー（20マス）。
export function shareBar(a, b, width = 20) {
  const x = Math.max(0, Number(a) || 0), y = Math.max(0, Number(b) || 0);
  const filled = x + y > 0 ? Math.round(x / (x + y) * width) : Math.round(width / 2);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function base(kind, { title, description, fields = [], origin, url, author, image }) {
  const embed = { title: clip(title, 256), color: EMBED_COLORS[kind] ?? EMBED_COLORS.news, footer: footer(origin) };
  if (description) embed.description = clip(description, 4000);
  if (url) embed.url = url;
  if (author) embed.author = { name: clip(author, 256) };
  const thumb = pose(origin, kind);
  if (thumb) embed.thumbnail = thumb;
  if (image) embed.image = { url: image };
  if (fields.length) embed.fields = fields.slice(0, 25).map(f => ({ name: clip(f.name, 256), value: clip(f.value, 1024) || "—", inline: Boolean(f.inline) }));
  return embed;
}

const kvkUrl = (origin, kid) => origin ? `${origin}/kvk?kid=${kid}` : undefined;

export function kvkMatchupEmbed({ season, kid, opponent, opponentName, power, opponentPower, origin }) {
  if (opponent == null) {
    return base("even", { title: `⚔️ KvK シーズン${season} 組み合わせ発表`, description: `王国${kid} は今回は対戦なし（不戦）です。`, author: `KvK通知 · 王国${kid}`, origin, url: kvkUrl(origin, kid) });
  }
  const fields = [];
  if (power != null || opponentPower != null) {
    fields.push({ name: `王国${kid}`, value: `総戦力 ${compactScore(power)}`, inline: true });
    fields.push({ name: `王国${opponent}${opponentName ? "（" + opponentName + "）" : ""}`, value: `総戦力 ${compactScore(opponentPower)}`, inline: true });
  }
  fields.push({ name: "秘境の試練の比較", value: "両国のデータがそろったら、このスレッドでお知らせします。" });
  return base("matchup", { title: `⚔️ KvK シーズン${season} 組み合わせ発表`, description: `王国${kid} の対戦相手は **王国${opponent}**${opponentName ? "（" + opponentName + "）" : ""} です。`, fields, author: `KvK通知 · 王国${kid}`, origin, url: kvkUrl(origin, kid) });
}

export function kvkDayEmbed({ season, kid, opponent, dayName, score, opponentScore, wins, losses, origin }) {
  const a = Number(score), b = Number(opponentScore);
  const kind = a > b ? "win" : a < b ? "lose" : "even";
  const verdict = a > b ? "🎉 勝利！" : a < b ? "敗北" : "引き分け";
  const total = a + b;
  const pct = total > 0 ? Math.round(a / total * 100) : 50;
  const fields = [
    { name: "差", value: (a - b >= 0 ? "+" : "−") + compactScore(Math.abs(a - b)) + `（${pct}% : ${100 - pct}%）`, inline: true }
  ];
  if (wins != null || losses != null) fields.push({ name: "ここまで", value: `${wins || 0}勝 ${losses || 0}敗`, inline: true });
  fields.push({ name: "スコア", value: `\`${kid}\` ${shareBar(a, b)} \`${opponent ?? "—"}\`` });
  return base(kind, { title: `KvK ${dayName} ${verdict}`, description: `王国${kid} **${compactScore(a)}** vs 王国${opponent ?? "—"} **${compactScore(b)}**`, fields, author: `KvK通知 · 王国${kid} · シーズン${season}`, origin, url: kvkUrl(origin, kid) });
}

export function kvkLeadEmbed({ season, kid, opponent, score, opponentScore, origin }) {
  const leading = Number(score) > Number(opponentScore);
  return base(leading ? "win" : "lose", {
    title: leading ? "🔥 優勢に立ちました" : "⚠️ 優勢が入れ替わりました",
    description: leading ? `王国${kid} が逆転しました。` : `王国${opponent} に逆転されました。`,
    fields: [{ name: "現在", value: `王国${kid} **${compactScore(score)}** vs **${compactScore(opponentScore)}** 王国${opponent}` }, { name: "割合", value: `\`${kid}\` ${shareBar(score, opponentScore)} \`${opponent}\`` }],
    author: `KvK通知 · 王国${kid} · シーズン${season}`, origin, url: kvkUrl(origin, kid)
  });
}

// stages: [{ label, a: "60-7", b: "61-5", win: 1|-1|0 }]
export function kvkMysticEmbed({ season, kid, opponent, wins, losses, stages, origin }) {
  const lines = stages.map(s => `${s.win > 0 ? "🟢" : s.win < 0 ? "🔴" : "⚪"} ${s.label}　${s.win > 0 ? "**" + s.a + "**" : s.a} vs ${s.win < 0 ? "**" + s.b + "**" : s.b}`);
  const kind = wins > losses ? "win" : wins < losses ? "lose" : "mystic";
  return base("mystic", {
    title: `🏔️ 秘境の試練 比較（シーズン${season}）`,
    description: `王国${kid} vs 王国${opponent}　各ステージ1位どうし\n**${wins}勝 ${losses}敗**${kind === "win" ? "で優勢" : kind === "lose" ? "で劣勢" : ""}`,
    fields: [{ name: "ステージ別", value: lines.join("\n") }],
    author: `KvK通知 · 王国${kid}`, origin, url: kvkUrl(origin, kid)
  });
}

export function announcementEmbed(item, origin = "") {
  return base("news", {
    title: "📢 " + String(item?.title || "お知らせ"),
    description: String(item?.body || ""),
    author: "EagleEye お知らせ",
    origin,
    url: origin ? origin + "/news" : undefined,
    image: item?.image_url && /^https:\/\//.test(String(item.image_url)) ? String(item.image_url) : undefined
  });
}

// 送信ボディ：embed があればカード、無ければ従来の文字。
export function discordMessageBody(content, embed) {
  if (embed) return { embeds: [embed], allowed_mentions: { parse: [] } };
  return { content: String(content || "").slice(0, 2000), allowed_mentions: { parse: [] } };
}
