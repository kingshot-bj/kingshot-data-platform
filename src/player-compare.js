export const PLAYER_COMPARE_MAX = 4;

export function normalizeCompareGovernorIds(values) {
  const raw = Array.isArray(values) ? values : [values];
  const result = [];
  for (const value of raw) {
    const parts = String(value ?? "").split(",");
    for (const part of parts) {
      const id = String(part || "").trim();
      if (!id || !/^\d{7,12}$/.test(id) || result.includes(id)) continue;
      result.push(id);
      if (result.length >= PLAYER_COMPARE_MAX) return result;
    }
  }
  return result;
}

export function buildPlayerCompareSeries({
  playerHistory = [],
  rankHistory = [],
  fromUnix = 0
} = {}) {
  const powerByTime = new Map();
  for (const row of playerHistory || []) {
    const ts = Number(row?.observed_at || 0);
    const power = Number(row?.player?.power);
    if (!Number.isFinite(ts) || ts < fromUnix || !Number.isFinite(power)) continue;
    powerByTime.set(ts, { observed_at: ts, power });
  }

  const rankByTime = new Map();
  for (const row of rankHistory || []) {
    const ts = Number(row?.observed_at || 0);
    const rank = Number(row?.power_rank);
    const score = Number(row?.power);
    if (!Number.isFinite(ts) || ts < fromUnix) continue;
    const current = rankByTime.get(ts) || { observed_at: ts };
    if (Number.isFinite(rank)) current.power_rank = rank;
    if (Number.isFinite(score)) current.power = score;
    rankByTime.set(ts, current);
  }

  const power = [...powerByTime.values()].sort((a,b) => a.observed_at - b.observed_at);
  const ranking = [...rankByTime.values()].sort((a,b) => a.observed_at - b.observed_at);

  return { power, ranking };
}

export function extractOptionalPlayerAssets(payload = {}) {
  const player = payload?.player && typeof payload.player === "object" ? payload.player : payload;
  const assets = [];
  const add = (type, label, value) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    assets.push({ type, label, url: text });
  };

  add("avatar", "プロフィールアイコン", player?.avatar_url);
  add("avatar_frame", "プロフィールフレーム", player?.avatar_frame_url || player?.frame_url || player?.profile_frame_url);

  const directSkinKeys = [
    ["castle_skin", "城スキン", player?.castle_skin_url || player?.city_skin_url],
    ["marching_skin", "行軍スキン", player?.marching_skin_url || player?.march_skin_url],
    ["profile_skin", "プロフィールスキン", player?.profile_skin_url]
  ];
  for (const [type, label, value] of directSkinKeys) add(type, label, value);

  const scan = (value, path = "", depth = 0) => {
    if (depth > 4 || value == null) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item, index) => scan(item, path + "[" + index + "]", depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const keyText = String(key);
      const childPath = path ? path + "." + keyText : keyText;
      if (typeof child === "string") {
        if (/(?:^|_)(?:url|icon|image|thumbnail)(?:$|_)/i.test(keyText)) {
          if (/(frame|skin|castle|city|march|avatar|profile)/i.test(childPath)) {
            const label = /frame/i.test(childPath) ? "プロフィールフレーム"
              : /castle|city/i.test(childPath) ? "城スキン"
              : /march/i.test(childPath) ? "行軍スキン"
              : /avatar|profile/i.test(childPath) ? "プロフィール画像"
              : "画像";
            add("discovered", label, child);
          }
        }
      }
      if (child && typeof child === "object") scan(child, childPath, depth + 1);
    }
  };
  scan(player?.skins, "skins");
  scan(player?.frames, "frames");
  scan(player?.cosmetics, "cosmetics");
  scan(payload?.skins, "skins");
  scan(payload?.frames, "frames");
  scan(payload?.cosmetics, "cosmetics");

  const unique = [];
  const seen = new Set();
  for (const item of assets) {
    const key = item.type + ":" + item.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
