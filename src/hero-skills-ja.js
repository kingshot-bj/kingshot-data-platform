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
  },
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
  },,
  "ディエゴ": {
    source: "https://altema.jp/kingshot/dai8sedai",
    sourceName: "アルテマ「キングショット」第8世代の英雄一覧",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "完全無欠", max: "攻撃力×380%のシールド", description: "周囲に剣気の盾を形成。ダメージを受けるとシールド値から優先して減少。5秒持続。" },
        { name: "健在の剣心", max: "敵攻撃力-5%、自身攻撃力は威圧した敵英雄数×5%上昇", description: "敵の攻撃力を低下させ、自身の攻撃力が上昇する。3秒持続。" },
        { name: "影渡し", max: "通常攻撃回避15%、会心20%", description: "敵の通常攻撃を一定確率で回避し、攻撃時に一定確率で会心の一撃となる。" },
        { name: "重剣無鋒", type: "専用装備", max: "追加シールド攻撃力×95%、被ダメージの30%反射", description: "「完全無欠」のシールド値を追加。シールド持続中に受けたダメージの一部を敵へ反射する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "防守の指導", max: "全軍総防御力+15%、総HP+10%", description: "味方全軍の総防御力と総HPを上昇させる。" },
        { name: "無形の剣気", max: "50%の確率で追加ダメージ50%", description: "味方全部隊が攻撃時、一定確率で追加ダメージを与える。" },
        { name: "凛然なる剣気", max: "総殺傷力+25%", description: "味方全部隊の総殺傷力を上昇させる。" },
        { name: "大巧不工", type: "専用装備", max: "防衛部隊の防御力+15%", description: "防衛部隊の防御力を上昇させる。" }
      ]}
    ]
  },
  "リズ": {
    source: "https://altema.jp/kingshot/dai8sedai",
    sourceName: "アルテマ「キングショット」第8世代の英雄一覧",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ビッグバブル", max: "攻撃力×300%の範囲ダメージ", description: "対象を1.5秒間行動不能にし、対象と周囲の敵に範囲ダメージを与える。" },
        { name: "スロウポーション", max: "攻撃力×140%、攻撃速度-50%", description: "敵単体にダメージを与え、周囲の敵の攻撃速度を50%低下させる。3秒持続。" },
        { name: "ライトポーション", max: "攻撃速度+30%", description: "自身の攻撃速度が上昇する。" },
        { name: "スプラッシュバブル", type: "専用装備", max: "自身攻撃力+24%、追加範囲ダメージ攻撃力×70%", description: "自身の攻撃力が上昇。「ビッグバブル」の行動不能終了時に周囲へ追加ダメージを与える。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "パワーブースター", max: "50%の確率で総殺傷力+50%", description: "ラウンド毎に一定確率で発動し、味方全部隊の総殺傷力を上昇させる。" },
        { name: "エナジーブースター", max: "総HP+25%", description: "味方全部隊の総HPを上昇させる。" },
        { name: "ライドマスター", max: "騎兵は50%の確率で追加ダメージ150%", description: "味方の騎兵部隊が攻撃時、一定確率で追加ダメージを与える。" },
        { name: "ハイパーブースター", type: "専用装備", max: "防衛部隊の殺傷力+15%", description: "防衛部隊の殺傷力を上昇させる。" }
      ]}
    ]
  },
  "ルナ": {
    source: "https://altema.jp/kingshot/dai8sedai",
    sourceName: "アルテマ「キングショット」第8世代の英雄一覧",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "スターフォール", max: "攻撃力×300%、眩暈1.5秒", description: "一定範囲内の対象にダメージを与え、眩暈状態にする。" },
        { name: "バラージアロー", max: "攻撃力×140%", description: "一定範囲内の敵にダメージを与える。" },
        { name: "バラージアロー", max: "撃破ごとに攻撃力+2.5%、最大15層", description: "敵ユニットを1体撃破する毎に攻撃力が上昇する。最大15層まで重複可能。" },
        { name: "星霊の残光", type: "専用装備", max: "星霊HPは初期HPの30%、5秒存在", description: "星霊を召喚し、周囲の敵の攻撃を引き寄せる。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "月光の灯火", max: "総攻撃力+25%", description: "味方全部隊の総攻撃力を上昇させる。" },
        { name: "密林の復讐", max: "敵全体の総攻撃力-50%", description: "2ターン毎に敵全体の総攻撃力を低下させる。1ターン持続。" },
        { name: "閃光の矢", max: "弓兵は攻撃毎に追加ダメージ50%", description: "味方の弓兵部隊が攻撃する度、対象に追加ダメージを与える。" },
        { name: "月輝の力", type: "専用装備", max: "集結部隊の攻撃力+15%", description: "集結部隊の攻撃力を上昇させる。" }
      ]}
    ]
  },
};

export default HERO_SKILLS_JA;
