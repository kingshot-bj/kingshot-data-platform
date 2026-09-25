// Display names are based on official Japanese Kingshot terminology where verified.
// API keys remain in English for machine compatibility. Unverified names are marked provisional.
export const RANKING_CATALOG = Object.freeze([
  { key: "personal_power", ja: "戦力", target: "PLAYER", status: "VERIFIED" },
  { key: "kills", ja: "撃破数", target: "PLAYER", status: "VERIFIED" },
  { key: "town_center", ja: "役場レベル", target: "PLAYER", status: "VERIFIED" },
  { key: "rebel_conquest", ja: "反乱軍討伐", target: "PLAYER", status: "PROVISIONAL" },
  { key: "single_hero", ja: "単英雄戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "hero_total", ja: "英雄総戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "troop_power", ja: "兵士戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "building_power", ja: "建築戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "research_power", ja: "科学戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "hero_no_equip", ja: "英雄装備なし戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "hero_equip", ja: "英雄装備戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "gov_gear", ja: "領主装備戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "gov_charm", ja: "領主宝石戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "pet_power", ja: "ペット戦力", target: "PLAYER", status: "PROVISIONAL" },
  { key: "island_prosperity", ja: "オアシス島繁栄度", target: "PLAYER", status: "PROVISIONAL" },
  { key: "migrant_score", ja: "移民スコア", target: "PLAYER", status: "VERIFIED" },
  { key: "mystic_trial", ja: "秘境の試練", target: "PLAYER", status: "VERIFIED" },
  { key: "coliseum", ja: "コロシアム", target: "PLAYER", status: "VERIFIED" },
  { key: "forest_of_life", ja: "生命の森", target: "PLAYER", status: "VERIFIED" },
  { key: "crystal_cave", ja: "水晶鉱山", target: "PLAYER", status: "VERIFIED" },
  { key: "knowledge_nexus", ja: "知識の枢軸", target: "PLAYER", status: "VERIFIED" },
  { key: "molten_fort", ja: "溶岩要塞", target: "PLAYER", status: "VERIFIED" },
  { key: "radiant_spire", ja: "輝光の塔", target: "PLAYER", status: "VERIFIED" },
  { key: "master_power", ja: "マスターパワー", target: "PLAYER", status: "PROVISIONAL" },
  { key: "alliance_power", ja: "同盟戦力", target: "ALLIANCE", status: "VERIFIED" },
  { key: "alliance_kills", ja: "同盟撃破数", target: "ALLIANCE", status: "VERIFIED" }
]);

export const RANKING_CATALOG_BY_KEY = Object.freeze(
  Object.fromEntries(RANKING_CATALOG.map(item => [item.key, item]))
);

export function getRankingLabel(key) {
  return RANKING_CATALOG_BY_KEY[key]?.ja || String(key || "");
}
