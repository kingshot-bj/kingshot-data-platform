/**
 * EagleEye 日本語英雄スキル辞典
 * Source: Altema KingShot Japanese hero pages. Names/descriptions/values are source-derived.
 * IMPORTANT: MightPulse skill IDs have not yet been mapped to these Japanese names.
 */
export const HERO_SKILLS_JA = {
  "アルカ": {
    source: "https://altema.jp/kingshot/chara/25",
    sourceName: "アルテマ「キングショット」アルカの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "グローリー・モーメント", initial: "30%", max: "70%", description: "自身を無敵状態にし、周囲の味方の被ダメージが低下。2秒持続。無敵中は移動・スキル発動不可、制御無効化。", },
        { name: "スプリット・ランス", initial: "70%", max: "98%", description: "前方の敵軍を貫き、攻撃力×倍率のダメージを与える。2秒間、敵が受けるダメージを20%上昇させる。" },
        { name: "リバイバル・スピリット", initial: "30%", max: "42%", description: "「グローリー・モーメント」発動後、毎秒攻撃力×倍率のHPを回復。5秒間持続。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "アシスト・アリー", initial: "14%", max: "70%", description: "5ターン毎に歩兵と弓兵の被ダメージが低下する。2ターン持続。" },
        { name: "チャンピオン・ウィル", initial: "20%, 2%", max: "100%, 10%", description: "歩兵の与ダメージと、騎兵・弓兵の与ダメージが上昇する。" },
        { name: "チャンス・オブ・フューリー", initial: "12%, 5%", max: "60%, 25%", description: "歩兵が攻撃する度にターゲットへ追加ダメージを与え、敵の被ダメージを上昇させる。1ターン持続。" }
      ]}
    ]
  },
  "アマデウス": {
    source: "https://altema.jp/kingshot/chara/1",
    sourceName: "アルテマ「キングショット」アマデウスの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "三段斬り", initial: "160%", max: "224%", description: "一定範囲内の敵を高くカチ上げ、攻撃×倍率のダメージを与える斬撃を3回行う。" },
        { name: "剣気", initial: "15%", max: "23%", description: "通常攻撃で剣気を放ち、前方直線範囲内の敵に攻撃×倍率のダメージを与える。" },
        { name: "快進撃", initial: "16%", max: "48%", description: "HPが50%以上ある際、攻撃力が上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "臨戦態勢", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が上昇する。" },
        { name: "剣術指導", initial: "5%", max: "25%", description: "味方全部隊の総攻撃力が上昇する。" },
        { name: "不義の一撃", initial: "8%", max: "40%", description: "一定確率で味方全部隊の与ダメージが50%上昇する。" }
      ]}
    ]
  }
  "エリック": {
    source: "https://altema.jp/kingshot/chara/17",
    sourceName: "アルテマ「キングショット」エリックの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ハンマー・スウィング", initial: "120%", max: "168%", description: "前方ターゲットに攻撃×倍率のダメージを与え、攻撃速度を50%低下させる。4秒持続。" },
        { name: "バトル・ボディ", initial: "8%, 8%", max: "16%, 20%", description: "攻撃を受けた際、一定確率で防御力が上昇する。2秒持続、最大5回まで重複可能。" },
        { name: "ヘビースマッシュ", initial: "80%", max: "112%", description: "扇形範囲内のターゲットに攻撃×倍率のダメージを与え、30%の確率で眩暈状態にする。1秒持続。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "浄化", initial: "4%", max: "20%", description: "敵全部隊の攻撃力を低下させる。" },
        { name: "意志", initial: "4%", max: "20%", description: "味方全部隊の被ダメージが低下する。" },
        { name: "鼓舞", initial: "5%", max: "25%", description: "味方全部隊のHPが上昇する。" }
      ]}
    ]
  },
  "ペーラ": {
    source: "https://altema.jp/kingshot/chara/18",
    sourceName: "アルテマ「キングショット」ペーラの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ジャッジカード", initial: "270%", max: "未確認", description: "ターゲットに攻撃×270%のダメージを与え、ランダムで攻撃力20%低下（2秒）または眩暈（1.5秒）を付与する。" },
        { name: "味方にサプライズ！", initial: "未確認", max: "未確認", description: "残りHP割合が最も低い味方英雄を回復。回復量はペーラの攻撃×140%を基礎値として、基礎値の5%～400%の間でランダムに決定。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "ドゥーム", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、50%の確率で敵の被ダメージを上昇させる。" },
        { name: "ラッキーカード", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、50%の確率で今回のダメージが上昇する。" },
        { name: "ガーディアンカード", initial: "10%", max: "50%", description: "40%の確率で味方全部隊の被ダメージが減少する。" }
      ]}
    ]
  },
};

export default HERO_SKILLS_JA;
