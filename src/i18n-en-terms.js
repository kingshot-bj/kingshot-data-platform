// 英語版の辞書：ゲームの用語（MightPulse の API のキー・値の英語）。2026-11-20
// ・ランキングの種類：MightPulse のボードのキー（personal_power など）から英語名を作る。
// ・装備：MightPulse が返す英語の部位・品質（index.js の *_JA の逆）。
import { RANKING_BOARD_LABELS } from "./kingdom-terminology.js";
import { RANKING_CATALOG } from "./ranking-catalog.js";

export const BOARD_NAMES_EN = Object.freeze({
  alliance_power: "Alliance Power", alliance_kills: "Alliance Kills", personal_power: "Personal Power", kills: "Kill Count", town_center: "Town Center Level",
  rebel_conquest: "Rebel Conquest", single_hero: "Hero Power", hero_total: "Total Hero Power", troop_power: "Troop Power", building_power: "Building Power",
  research_power: "Research Power", hero_no_equip: "Hero Power (without gear)", hero_equip: "Hero Power (with gear)", gov_gear: "Governor Gear", gov_charm: "Governor Charms",
  pet_power: "Pet Power", island_prosperity: "Island Prosperity", migrant_score: "Migrant Score", mystic_trial: "Mystic Trial", coliseum: "Coliseum",
  forest_of_life: "Forest of Life", crystal_cave: "Crystal Cave", knowledge_nexus: "Knowledge Nexus", molten_fort: "Molten Fort", radiant_spire: "Radiant Spire", master_power: "Master Power"
});

const boardEntries = [];
for (const [key, ja] of Object.entries(RANKING_BOARD_LABELS)) if (BOARD_NAMES_EN[key]) boardEntries.push([ja, BOARD_NAMES_EN[key]]);
for (const item of RANKING_CATALOG) if (BOARD_NAMES_EN[item.key]) boardEntries.push([item.ja, BOARD_NAMES_EN[item.key]]);

export const TERMS_EN = [
  ...boardEntries,
  ["同盟撃破数", "Alliance Kills"], ["宝石", "Charms"], ["領主宝石戦力", "Governor charm power"],
  // 英雄の装備（MightPulse の部位）
  ["兜", "Helmet"], ["手袋", "Gloves"], ["鎧", "Armor"], ["靴", "Boots"], ["武器", "Weapon"], ["指輪", "Ring"], ["首飾り", "Necklace"], ["装飾品", "Accessory"],
  ["不義", "The Unrighteous"], ["信仰の旗", "Banner of Faith"], ["エオリアン", "Aeolian"],
  // 領主装備（MightPulse の部位・品質）
  ["帽子", "Head"], ["装飾", "Necklace"], ["ローブ", "Cloak"], ["ズボン", "Pants"], ["杖", "Weapon"],
  ["グッド", "Good"], ["レア", "Rare"], ["エピック", "Epic"], ["レジェンド", "Legendary"], ["神話", "Mythic"], ["通常", "Common"],
  // 複合語（短い語の置き換えが当たらないもの）
  ["VIP順", "By VIP"], ["CSV出力", "CSV export"], ["データ状況", "Data status"], ["データ鮮度", "Data freshness"], ["データ状態", "Data state"]
];
