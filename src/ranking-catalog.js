export const RANKING_CATALOG = Object.freeze([
  { key: "personal_power", ja: "戦力", target: "PLAYER" },
  { key: "kills", ja: "撃破数", target: "PLAYER" },
  { key: "town_center", ja: "役場レベル", target: "PLAYER" },
  { key: "rebel_conquest", ja: "反乱軍討伐", target: "PLAYER" },
  { key: "single_hero", ja: "単英雄戦力", target: "PLAYER" },
  { key: "hero_total", ja: "英雄総戦力", target: "PLAYER" },
  { key: "troop_power", ja: "兵士戦力", target: "PLAYER" },
  { key: "building_power", ja: "建築戦力", target: "PLAYER" },
  { key: "research_power", ja: "科学戦力", target: "PLAYER" },
  { key: "hero_no_equip", ja: "英雄装備なし戦力", target: "PLAYER" },
  { key: "hero_equip", ja: "英雄装備戦力", target: "PLAYER" },
  { key: "gov_gear", ja: "領主装備戦力", target: "PLAYER" },
  { key: "gov_charm", ja: "領主宝石戦力", target: "PLAYER" },
  { key: "pet_power", ja: "ペット戦力", target: "PLAYER" },
  { key: "island_prosperity", ja: "オアシス島繁栄度", target: "PLAYER" },
  { key: "migrant_score", ja: "移民スコア", target: "PLAYER" },
  { key: "mystic_trial", ja: "ミスティックトライアル", target: "PLAYER" },
  { key: "coliseum", ja: "闘技場", target: "PLAYER" },
  { key: "forest_of_life", ja: "生命の森", target: "PLAYER" },
  { key: "crystal_cave", ja: "クリスタル洞窟", target: "PLAYER" },
  { key: "knowledge_nexus", ja: "知識の殿堂", target: "PLAYER" },
  { key: "molten_fort", ja: "溶岩要塞", target: "PLAYER" },
  { key: "radiant_spire", ja: "輝光尖塔", target: "PLAYER" },
  { key: "master_power", ja: "マスターパワー", target: "PLAYER" },
  { key: "alliance_power", ja: "同盟戦力", target: "ALLIANCE" },
  { key: "alliance_kills", ja: "同盟撃破数", target: "ALLIANCE" }
]);

export const RANKING_CATALOG_BY_KEY = Object.freeze(
  Object.fromEntries(RANKING_CATALOG.map(item => [item.key, item]))
);

export function getRankingLabel(key) {
  return RANKING_CATALOG_BY_KEY[key]?.ja || String(key || "");
}
