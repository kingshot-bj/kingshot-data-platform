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
        { name: "スプリット・ランス", initial: "70%", max: "98%", description: "前方の敵軍を貫き、攻撃力×70%（初期値）/×98%（最大強化時）のダメージを与える。2秒間、敵が受けるダメージを20%上昇させる。" },
        { name: "リバイバル・スピリット", initial: "30%", max: "42%", description: "「グローリー・モーメント」発動後、毎秒攻撃力×30%（初期値）/×42%（最大強化時）のHPを回復。5秒間持続。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "アシスト・アリー", initial: "14%", max: "70%", description: "5ターン毎に歩兵と弓兵の被ダメージが低下する。2ターン持続。" },
        { name: "チャンピオン・ウィル", initial: "20%, 2%", max: "100%, 10%", description: "歩兵の与ダメージと、騎兵・弓兵の与ダメージが上昇する。" },
        { name: "チャンス・オブ・フューリー", initial: "12%, 5%", max: "60%, 25%", description: "歩兵が攻撃する度にターゲットへ追加ダメージを与え、敵の被ダメージを上昇させる。1ターン持続。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "不屈の信念", initial: "攻撃力+30%（2.5秒）", max: "攻撃力+42%（2.5秒）", description: "「グローリー・モーメント」の効果を受けた味方の攻撃力が30%（初期）〜42%（最大強化時）増加。2.5秒持続。", source: "https://kingshotwiki.com/ja/heroes/alcar-ja/"},
        { name: "グローリー・オース", initial: "防衛部隊HP+5%", max: "防衛部隊HP+15%", description: "防衛部隊のHPが5%（初期）〜15%（最大強化時）上昇する。", source: "https://kingshotwiki.com/ja/heroes/alcar-ja/"}
      ]}
    ]
  },
  "アマデウス": {
    source: "https://altema.jp/kingshot/chara/1",
    sourceName: "アルテマ「キングショット」アマデウスの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "三段斬り", initial: "160%", max: "224%", description: "一定範囲内の敵を高くカチ上げ、攻撃×160%（初期値）/×224%（最大強化時）のダメージを与える斬撃を3回行う。" },
        { name: "剣気", initial: "15%", max: "23%", description: "通常攻撃で剣気を放ち、前方直線範囲内の敵に攻撃×15%（初期値）/×23%（最大強化時）のダメージを与える。" },
        { name: "快進撃", initial: "16%", max: "48%", description: "HPが50%以上ある際、攻撃力が上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "臨戦態勢", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が上昇する。" },
        { name: "剣術指導", initial: "5%", max: "25%", description: "味方全部隊の総攻撃力が上昇する。" },
        { name: "不義の一撃", initial: "8%", max: "40%", description: "一定確率で味方全部隊の与ダメージが50%上昇する。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "双剣防御", initial: "自身の被ダメージ-10%", max: "自身の被ダメージ-30%", description: "自身の受けるダメージが10%（初期）〜30%（最大強化時）減少する。", source: "https://ks-toolkit.com/data/heroes/amadeus/"},
        { name: "真実の術", initial: "集結部隊攻撃力+5%", max: "集結部隊攻撃力+15%", description: "集結部隊の攻撃力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/amadeus/"}
      ]}
    ]
  },
  "エリック": {
    source: "https://altema.jp/kingshot/chara/17",
    sourceName: "アルテマ「キングショット」エリックの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ハンマー・スウィング", initial: "120%", max: "168%", description: "前方ターゲットに攻撃×120%（初期値）/×168%（最大強化時）のダメージを与え、攻撃速度を50%低下させる。4秒持続。" },
        { name: "バトル・ボディ", initial: "8%, 8%", max: "16%, 20%", description: "攻撃を受けた際、初期は8%の確率で防御力が8%上昇し、最大強化時は16%の確率で20%上昇する。2秒持続、最大5回まで重複可能。" },
        { name: "ヘビースマッシュ", initial: "80%", max: "112%", description: "扇形範囲内のターゲットに攻撃×80%（初期値）/×112%（最大強化時）のダメージを与え、30%の確率で眩暈状態にする。1秒持続。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "浄化", initial: "4%", max: "20%", description: "敵全部隊の攻撃力を低下させる。" },
        { name: "意志", initial: "4%", max: "20%", description: "味方全部隊の被ダメージが低下する。" },
        { name: "鼓舞", initial: "5%", max: "25%", description: "味方全部隊のHPが上昇する。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "ハンマー・ブレス", initial: "与ダメージ+10%", max: "与ダメージ+30%", description: "自身の与ダメージが10%（初期）〜30%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/eric/"},
        { name: "ハンマー・ディフェンス", initial: "防衛部隊防御力+5%", max: "防衛部隊防御力+15%", description: "防衛部隊の防御力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/eric/"}
      ]}
    ]
  },
  "ペーラ": {
    source: "https://altema.jp/kingshot/chara/18",
    sourceName: "アルテマ「キングショット」ペーラの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ジャッジカード", initial: "270%", max: "378%", description: "ターゲットに攻撃力×270%（初期値）/×378%（最大強化時）のダメージを与え、攻撃力20%低下（2秒）または眩暈（1.5秒）をランダムに付与する。" },
        { name: "サプライズカード", initial: "100%", max: "140%", description: "残りHP割合が最も低い味方英雄を回復。攻撃力×100%（初期値）/×140%（最大強化時）を基礎値として、基礎値の5%～400%の間で回復量がランダムに決定する。" },
        { name: "無情な運命", initial: "50%", max: "70%", description: "攻撃力×50%（初期値）/×70%（最大強化時）を基礎値としてスリップダメージを与える。最終ダメージは基礎値の5%～600%の間でランダムに決定する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "ドゥーム", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、50%の確率で敵の被ダメージを上昇させる。" },
        { name: "ラッキーカード", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、50%の確率で今回のダメージが上昇する。" },
        { name: "ガーディアンカード", initial: "10%", max: "50%", description: "40%の確率で味方全部隊の被ダメージが減少する。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "シャッフルマジック", initial: "浮動効果の上限・下限+30%", max: "浮動効果の上限・下限+150%", description: "全ての「浮動」効果を持つスキルの上限と下限がそれぞれ30%（初期）〜150%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/petra/"},
        { name: "運命の計画", initial: "集結部隊攻撃力+5%", max: "集結部隊攻撃力+15%", description: "集結部隊の攻撃力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/petra/"}
      ]}
    ]
  },
  "ディエゴ": {
    source: "https://altema.jp/kingshot/chara/35",
    sourceName: "アルテマ「キングショット」ディエゴの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "完全無欠", initial: "220%", max: "380%", description: "攻撃力×220%（初期値）/380%（最大値）のシールドを形成。ダメージを受けるとシールド値から優先的に減少。5秒持続。" },
        { name: "健在の剣心", initial: "敵攻撃力-1% / 自身+敵英雄数×1%", max: "敵攻撃力-5% / 自身+敵英雄数×5%", description: "敵の攻撃力を低下させ、自身の攻撃力が威圧した敵英雄数に応じて上昇する。3秒持続。" },
        { name: "影渡し", initial: "回避3% / 会心4%", max: "回避15% / 会心20%", description: "敵の通常攻撃を一定確率で回避し、攻撃時に一定確率で会心の一撃となる。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "防守の指導", initial: "総防御力+3% / 総HP+2%", max: "総防御力+15% / 総HP+10%", description: "味方全軍の総防御力と総HPが上昇する。" },
        { name: "無形の剣気", initial: "発動率50% / 追加ダメージ10%", max: "発動率50% / 追加ダメージ50%", description: "味方全部隊は攻撃時に50%の確率で追加ダメージを与える。追加ダメージは初期10%・最大50%。" },
        { name: "凛然なる剣気", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が上昇する。" },
      ]},
      { type: "専用装備スキル", skills: [
        { name: "重剣無鋒", initial: "追加シールド攻撃力×55%、被ダメージの10%反射", max: "追加シールド攻撃力×95%、被ダメージの30%反射", description: "「完全無欠」のシールド値を追加。シールド持続中に受けたダメージの一部を敵へ反射する。", source: "https://www.kingshotcommand.com/hero-widgets/diego"},
        { name: "大巧不工", initial: "防衛部隊の防御力+5%", max: "防衛部隊の防御力+15%", description: "防衛部隊の防御力を上昇させる。", source: "https://www.kingshotcommand.com/hero-widgets/diego"}
      ]}
    ]
  },
  "リズ": {
    source: "https://altema.jp/kingshot/chara/36",
    sourceName: "アルテマ「キングショット」リズの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ビッグバブル", initial: "220%", max: "300%", description: "対象を1.5秒間行動不能にし、対象と周囲の敵に攻撃力×220%（初期値）/×300%（最大強化時）の範囲ダメージを与える。" },
        { name: "スロウポーション", initial: "100%", max: "140%", description: "敵単体に攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与え、周囲の敵の攻撃速度を50%低下させる。3秒持続。" },
        { name: "ライトポーション", initial: "10%", max: "30%", description: "自身の攻撃速度が上昇する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "パワーブースター", initial: "10%", max: "50%", description: "ラウンド毎に10%から最大50%の確率で発動し、味方全部隊の総殺傷力を50%上昇させる。" },
        { name: "エナジーブースター", initial: "5%", max: "25%", description: "味方全部隊の総HPが上昇する。" },
        { name: "ライドマスター", initial: "30%", max: "150%", description: "味方の騎兵部隊は攻撃時に50%の確率で追加ダメージを与える。追加ダメージは初期30%・最大150%。" },
      ]},
      { type: "専用装備スキル", skills: [
        { name: "スプラッシュバブル", initial: "自身攻撃力+8%、追加範囲ダメージ攻撃力×50%", max: "自身攻撃力+24%、追加範囲ダメージ攻撃力×70%", description: "自身の攻撃力が上昇。「ビッグバブル」の行動不能終了時に周囲へ追加ダメージを与える。", source: "https://www.kingshotcommand.com/hero-widgets/liz"},
        { name: "ハイパーブースター", initial: "防衛部隊の殺傷力+5%", max: "防衛部隊の殺傷力+15%", description: "防衛部隊の殺傷力を上昇させる。", source: "https://www.kingshotcommand.com/hero-widgets/liz"}
      ]}
    ]
  },
  "ルナ": {
    source: "https://altema.jp/kingshot/chara/37",
    sourceName: "アルテマ「キングショット」ルナの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "スターフォール", initial: "220%", max: "300%", description: "一定範囲内の対象に攻撃力×220%（初期値）/×300%（最大強化時）のダメージを与え、1.5秒間眩暈状態にする。" },
        { name: "バラージアロー", initial: "100%", max: "140%", description: "一定範囲内の敵に攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与える。" },
        { name: "ハンティングリズム", initial: "0.5%", max: "2.5%", description: "敵ユニットを1体撃破する毎に攻撃力が0.5%（初期値）/2.5%（最大強化時）上昇する。最大15層まで重複可能。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "月光の灯火", initial: "5%", max: "25%", description: "味方全部隊の総攻撃力が上昇する。" },
        { name: "密林の復讐", initial: "10%", max: "50%", description: "2ターン毎に敵全体の総攻撃力を低下させる。1ターン持続。" },
        { name: "閃光の矢", initial: "10%", max: "50%", description: "味方の弓兵部隊が攻撃する度、対象に追加ダメージを与える。" },
      ]},
      { type: "専用装備スキル", skills: [
        { name: "星霊の残光", initial: "星霊HPは初期HPの10%、5秒存在", max: "星霊HPは初期HPの30%、5秒存在", description: "星霊を召喚し、周囲の敵の攻撃を引き寄せる。", source: "https://www.kingshotcommand.com/hero-widgets/luna"},
        { name: "月輝の力", initial: "集結部隊の攻撃力+5%", max: "集結部隊の攻撃力+15%", description: "集結部隊の攻撃力を上昇させる。", source: "https://www.kingshotcommand.com/hero-widgets/luna"}
      ]}
    ]
  },
  "チャールズ": {
    source: "https://altema.jp/kingshot/chara/32",
    sourceName: "アルテマ「キングショット」チャールズの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "リベンジャー", initial: "100% / 20%", max: "140% / 100%", description: "前方扇形範囲の敵に攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与え、1秒間眩暈状態にする。さらに2秒間、自身の攻撃力が20%（初期値）/100%（最大強化時）上昇する。" },
        { name: "フェアウェル", initial: "200%", max: "280%", description: "周囲の敵に攻撃力×200%（初期値）/×280%（最大強化時）の範囲ダメージを与える。" },
        { name: "ケアフリー", initial: "10%", max: "50%", description: "一定確率で被ダメージを50%軽減する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "パンツァーオーラ", initial: "4%", max: "20%", description: "敵全体の総殺傷力を低下させる。" },
        { name: "鋼鉄の身体", initial: "4%", max: "20%", description: "味方全部隊の被ダメージを低下させる。" },
        { name: "愛と正義", initial: "5%", max: "25%", description: "味方全部隊の総HPを回復する。" },
      ]},
      { type: "専用装備スキル", skills: [
        { name: "修理の達人", initial: "HP50%未満で最大HP7%回復、防御力+6%", max: "HP50%未満で最大HP35%回復、防御力+30%", description: "各戦闘で1回、HPが初めて50%未満になると最大HPの7%（初期）〜35%（最大強化時）を回復し、防御力が6%（初期）〜30%（最大強化時）上昇。戦闘終了まで持続。", source: "https://ks-toolkit.com/data/heroes/charles/"},
        { name: "華麗なる登場", initial: "味方全体のHP+3%", max: "味方全体のHP+15%", description: "味方全体のHPが3%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/charles/"}
      ]}
    ]
  },
  "アイヴァ": {
    source: "https://altema.jp/kingshot/chara/33",
    sourceName: "アルテマ「キングショット」アイヴァの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ボマーペイント", initial: "50%", max: "70%", description: "小範囲に爆発性の塗料を広げ、0.5秒毎に攻撃力×50%（初期値）/×70%（最大強化時）のダメージを与える。3秒持続。" },
        { name: "スポイルペイント", initial: "25% / 5%", max: "35% / 25%", description: "0.5秒毎に攻撃力×25%（初期値）/×35%（最大強化時）のダメージを与え、対象の被ダメージを5%（初期値）/25%（最大強化時）増加させる。2秒持続。" },
        { name: "フェイクペイント", initial: "25%", max: "75%", description: "自身の防御力が上昇する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "アナライズ", initial: "5%", max: "25%", description: "敵全部隊の総防御力を低下させる。" },
        { name: "ライト&シャドウ", initial: "10%", max: "50%", description: "4ターン毎に敵全体の被ダメージを増加させる。2ターン持続。" },
        { name: "クール&ホット", initial: "5%", max: "25%", description: "味方全体の総殺傷力が上昇する。" },
      ]},
      { type: "専用装備スキル", skills: [
        { name: "カラーセンス", initial: "与ダメージ+25%、対象攻撃力-5%", max: "与ダメージ+25%、対象攻撃力-25%", description: "自身の与ダメージが25%上昇し、塗料の影響を受けた対象の攻撃力を5%（初期）〜25%（最大強化時）低下させる。", source: "https://ks-toolkit.com/data/heroes/ava/"},
        { name: "クロマストーム", initial: "味方全部隊の殺傷力+5%", max: "味方全部隊の殺傷力+15%", description: "集結開始時、味方全部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/ava/"}
      ]}
    ]
  },
  "レン&ロン": {
    source: "https://altema.jp/kingshot/chara/34",
    sourceName: "アルテマ「キングショット」レン&ロンの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "スカイハイショット", initial: "300%", max: "420%", description: "攻撃力×300%（初期値）/×420%（最大強化時）の範囲ダメージを与える。" },
        { name: "特製ナパーム弾", initial: "60% / 17%", max: "84% / 25%", description: "攻撃力×60%（初期値）/×84%（最大強化時）の範囲ダメージを与え、燃焼エリアを生成する。2秒持続し、0.5秒毎に攻撃力×17%（初期値）/×25%（最大強化時）のダメージを与える。" },
        { name: "キャノンボウラー", initial: "10%", max: "26%", description: "自身の攻撃力が上昇する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "砲兵隊", initial: "3% / 2%", max: "15% / 10%", description: "味方全部隊の総攻撃力と総殺傷力が上昇する。" },
        { name: "連続砲撃", initial: "6% / 5%", max: "30% / 25%", description: "味方全部隊の弓兵・歩兵への与ダメージが上昇する。" },
        { name: "ヘビィキャノン出撃", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、10%から最大50%の確率で50%の追加ダメージを与える。" },
      ]},
      { type: "専用装備スキル", skills: [
        { name: "クールな砲撃手", initial: "英雄・護衛の攻撃速度+6%（5秒）", max: "英雄・護衛の攻撃速度+14%（5秒）", description: "「スカイハイショット」発動後、味方英雄と護衛の攻撃速度が6%（初期）〜14%（最大強化時）上昇する。5秒持続。", source: "https://ks-toolkit.com/data/heroes/wee-and-woo/"},
        { name: "秘密の火薬樽", initial: "防衛部隊の攻撃力+5%", max: "防衛部隊の攻撃力+15%", description: "防衛部隊の攻撃力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/wee-and-woo/"}
      ]}
    ]
  },

  "ヘルガ": {
    source: "https://altema.jp/kingshot/chara/2",
    sourceName: "アルテマ「キングショット」ヘルガの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "鹿角猛進", initial: "160%", max: "224%", description: "攻撃×160%（初期値）/×224%（最大強化時）の範囲ダメージを与え、範囲内の敵を跳ね飛ばし、1秒間気絶させる。" },
        { name: "追撃攻勢", initial: "150%", max: "210%", description: "目標に攻撃×150%（初期値）/×210%（最大強化時）のダメージを与える。" },
        { name: "怒狂", initial: "4%", max: "12%", description: "ダメージを受けた際、10%の確率で攻撃力が4%（初期値）/12%（最大強化時）上昇する。3秒持続、最大5回まで重複。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "守護者の誓い", initial: "8%", max: "40%", description: "確率で味方全部隊の被ダメージを50%軽減する。" },
        { name: "英霊の叫び", initial: "5%", max: "25%", description: "味方全部隊の総攻撃力が上昇する。" },
        { name: "荒野の均衡", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が上昇する。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "狂熱共鳴", initial: "与ダメージ+10%", max: "与ダメージ+30%", description: "与ダメージが10%（初期）〜30%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/helga/"}
      ,
        { name: "狂熱共鳴（遠征）", initial: "集結部隊殺傷力+5%", max: "集結部隊殺傷力+15%", description: "集結部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/helga/"}
      ]}
    ]
  },
  "ジェベル": {
    source: "https://altema.jp/kingshot/chara/4",
    sourceName: "アルテマ「キングショット」ジェベルの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ランススパイク", initial: "180%", max: "252%", description: "範囲内の目標に攻撃×180%（初期値）/×252%（最大強化時）のダメージを与え、1.5秒間その場に拘束する。" },
        { name: "真っ向勝負", initial: "150%", max: "210%", description: "目標に攻撃×150%（初期値）/×210%（最大強化時）のダメージを与える。" },
        { name: "執念", initial: "20%", max: "60%", description: "HPが50%以下になると攻撃速度が上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "赤き旗", initial: "8%", max: "40%", description: "確率で味方全部隊の被ダメージを50%軽減する。" },
        { name: "勇姿", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、50%の確率で追加の与ダメージが上昇する。" },
        { name: "戦乙女", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が上昇する。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "紅の意志", initial: "与ダメージ+10%", max: "与ダメージ+30%", description: "与ダメージが10%（初期）〜30%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/jabel/"}
      ,
        { name: "信頼", initial: "防衛部隊殺傷力+5%", max: "防衛部隊殺傷力+15%", description: "防衛部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/jabel/"}
      ]}
    ]
  },
  "サロ": {
    source: "https://altema.jp/kingshot/chara/3",
    sourceName: "アルテマ「キングショット」サロの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "連続射撃", initial: "55%", max: "75%", description: "連続攻撃を行い、毎回攻撃力×55%（初期値）/×75%（最大強化時）のダメージを与え、目標を2秒間気絶させる。" },
        { name: "金剛不壊", initial: "50%", max: "150%", description: "HPが50%以下になると自身の防御力が上昇する。" },
        { name: "工法改良", initial: "10%", max: "30%", description: "攻撃速度が上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "特派訓練", initial: "2%, 3%", max: "10%, 15%", description: "味方全部隊の総防御力と総HPが上昇する。" },
        { name: "リサイクル", initial: "3%, 3%", max: "15%, 15%", description: "建設物のレベルアップ速度が上昇し、必要資源が減少する。" },
        { name: "陣地戦の強者", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が上昇する。" }
      ]},
      { type: "専用装備スキル", skills: [
        { name: "義理尽", initial: "攻撃力+6%", max: "攻撃力+24%", description: "攻撃力が24%上昇する。", source: "https://kingshotwiki.com/ja/heroes/kingshot_wiki_hero_name_50017_kingshot_end-3/"}
      ,
        { name: "攻撃は最大の防御", initial: "防衛部隊攻撃力+5%", max: "防衛部隊攻撃力+15%", description: "防衛部隊の攻撃力が15%上昇する。", source: "https://kingshotwiki.com/ja/heroes/kingshot_wiki_hero_name_50017_kingshot_end-3/"}
      ]}
    ]
  },
  "ゾーイ": {
    source: "https://altema.jp/kingshot/chara/16", sourceName: "アルテマ「キングショット」ゾーイの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ソードシールドアサルト", initial: "60% / 被ダメージ+10%", max: "84% / 被ダメージ+30%", description: "0.5秒毎に攻撃力×60%（初期値）/×84%（最大強化時）のダメージを与え、ターゲットの被ダメージを10%（初期値）/30%（最大強化時）上昇させる。2秒持続。" },
        { name: "ペインエキサイトメント", initial: "20%", max: "40%", description: "HPが50%を下回った際、自分のHP上限の20%（初期値）/40%（最大値）を回復。1戦闘1回。" },
        { name: "ゴッドパワー", initial: "3%", max: "7%", description: "味方全英雄の攻撃速度が上昇する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "リッジワウンド", initial: "発動率20% / 毎ターン8%ダメージ", max: "発動率20% / 毎ターン40%ダメージ", description: "味方全部隊の攻撃時、20%の確率で裂傷を付与。敵は毎ターン追加ダメージを受ける。3ターン持続。" },
        { name: "感情支配", initial: "5%", max: "25%", description: "全部隊の総攻撃力が上昇する。" },
        { name: "無限テクニック", initial: "発動率50% / 被ダメージ+10%", max: "発動率50% / 被ダメージ+50%", description: "味方全部隊の攻撃時、50%の確率で敵軍の被ダメージを上昇させる。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "デスファイト", initial: "8%", max: "24%", description: "ペインエキサイトメント発動後、攻撃力が8%（初期）〜24%（最大強化時）上昇。戦闘終了まで持続。", source: "https://ks-toolkit.com/data/heroes/zoe/"},
        { name: "不義のプリンセス", initial: "防衛部隊攻撃力+5%", max: "防衛部隊攻撃力+15%", description: "防衛部隊の攻撃力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/zoe/"}
      ]}
    ]
  },
  "ヒルデ": {
    source: "https://altema.jp/kingshot/chara/14", sourceName: "アルテマ「キングショット」ヒルデの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "治療祈祷", initial: "200%", max: "280%", description: "自軍の全英雄のHPがヒルデの攻撃力×200%（初期値）/×280%（最大強化時）分回復する。" },
        { name: "贖罪", initial: "100%", max: "140%", description: "自軍でHP割合が最も低い英雄を攻撃力×100%（初期値）/×140%（最大強化時）分回復する。" },
        { name: "教化", initial: "140%", max: "196%", description: "敵ターゲットに攻撃力×140%（初期値）/×196%（最大強化時）のダメージを与え、1秒間行動不能にする。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "苦行", initial: "総攻撃力+3% / 総防御力+2%", max: "総攻撃力+15% / 総防御力+10%", description: "味方全部隊の総攻撃力と総防御力が上昇する。" },
        { name: "ポーション注入", initial: "120%", max: "200%", description: "味方全部隊の攻撃時、25%の確率で追加ダメージを与える。" },
        { name: "意志の試練", initial: "発動率8% / 被ダメージ50%軽減", max: "発動率40% / 被ダメージ50%軽減", description: "一定確率で味方全部隊の被ダメージを50%軽減する。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "聖なる祈祷", initial: "30%", max: "70%", description: "ヒルデの回復スキルの効果が30%（初期）〜70%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/hilde/"},
        { name: "タフネス", initial: "防衛部隊HP+5%", max: "防衛部隊HP+15%", description: "防衛部隊のHPが5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/hilde/"}
      ]}
    ]
  },
  "マリン": {
    source: "https://altema.jp/kingshot/chara/15", sourceName: "アルテマ「キングショット」マリンの評価とスキル",
    checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "バックウォッシュ", initial: "200%", max: "280%", description: "攻撃力×200%（初期値）/×280%（最大強化時）の範囲ダメージを与え、1.5秒間行動不能にする。" },
        { name: "ドランカーミスト", initial: "50%", max: "70%", description: "攻撃力×50%（初期値）/×70%（最大強化時）の範囲ダメージを与える。" },
        { name: "ラッキーショット", initial: "8回ごと / 0.2秒眩暈", max: "5回ごと / 0.5秒眩暈", description: "一定回数の通常攻撃後、次の攻撃でターゲットを眩暈状態にする。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "予測不能", initial: "発動率8% / 与ダメージ+50%", max: "発動率40% / 与ダメージ+50%", description: "一定確率で味方全部隊の与ダメージが50%上昇する。" },
        { name: "ラム酒", initial: "発動率20% / 総殺傷力-10%", max: "発動率20% / 総殺傷力-50%", description: "味方全部隊の攻撃時、20%の確率で敵の総殺傷力を減少させる。2ターン持続。" },
        { name: "強化ガンパウダー", initial: "発動率50% / 与ダメージ+10%", max: "発動率50% / 与ダメージ+50%", description: "味方全部隊の攻撃時、50%の確率で与ダメージが上昇する。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "酒飲み", initial: "5%", max: "15%", description: "通常攻撃毎に、HPが最も低い味方英雄のHPを攻撃力×15%回復する。", source: "https://www.kingshotcommand.com/hero-widgets/marlin"},
        { name: "無敵艦隊", initial: "集結部隊の殺傷力+5%", max: "15%", description: "集結部隊の殺傷力が15%上昇する。", source: "https://www.kingshotcommand.com/hero-widgets/marlin"}
      ]}
    ]
  },
  "イェーガー": {
    source: "https://altema.jp/kingshot/chara/19", sourceName: "アルテマ「キングショット」イェーガーの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "デスアトラクト", initial: "160%", max: "224%", description: "範囲内の敵に攻撃力×160%（初期値）/×224%（最大強化時）のダメージを与え、2秒間眩暈状態にする。" },
        { name: "不器用な演技", initial: "220% / 50%", max: "300% / 50%", description: "成功時はターゲットに攻撃力×220%（初期値）/×300%（最大強化時）のダメージを与え、失敗時は攻撃力×50%分のHPを回復する。" },
        { name: "シークレット・ストーリー", initial: "10%", max: "30%", description: "敵への与ダメージが上昇する。3秒間持続。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "ストームソング", initial: "8%", max: "40%", description: "20%の確率で味方全部隊のダメージが上昇する。3ターン持続。" },
        { name: "コンフリクトソング", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、20%の確率で敵の総殺傷力を低下させる。2ターン持続。" },
        { name: "フェスティバルソング", initial: "5%", max: "25%", description: "味方全部隊のHPが上昇する。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "サイレント・シレンス", initial: "ダメージ220%、沈黙3秒", max: "ダメージ300%、沈黙5秒", description: "ターゲットを初期3秒/最大5秒間スキル使用不可にし、攻撃力×220%（初期値）/×300%（最大強化時）のダメージを与える。", source: "https://www.kingshotcommand.com/hero-widgets/jaeger"},
        { name: "賛美歌", initial: "防衛部隊のHP+5%", max: "防衛部隊のHP+15%", description: "防衛部隊のHPが15%上昇する。", source: "https://www.kingshotcommand.com/hero-widgets/jaeger"}
      ]}
    ]
  },
  "マーゴ": {
    source: "https://altema.jp/kingshot/chara/23", sourceName: "アルテマ「キングショット」マーゴの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "トリックアタック", initial: "300%", max: "420%", description: "敵に攻撃力×300%（初期値）/×420%（最大強化時）の範囲ダメージを与える。" },
        { name: "トリックスルー", initial: "5%", max: "25%", description: "通常攻撃を受けた際、一定確率で攻撃を受け流し、ダメージを無効化する。" },
        { name: "クラッシュストライク", initial: "100%", max: "140%", description: "攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与え、1.5秒間行動不能にする。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "デストロイ", initial: "5%", max: "25%", description: "味方全部隊の攻撃力が上昇する。" },
        { name: "タクティクス", initial: "4%", max: "20%", description: "味方全部隊が通常攻撃を受けた際、一定確率でダメージを回避する。" },
        { name: "トリックテクニック", initial: "120%", max: "200%", description: "騎兵が25%の確率で追加攻撃し、攻撃力×120%（初期値）/×200%（最大強化時）のダメージを与える。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "アンブッシュ", initial: "25%", max: "45%", description: "通常攻撃時、40%の確率で追加攻撃し、攻撃力×25%（初期）〜45%（最大強化時）のダメージを与える。", source: "https://ks-toolkit.com/data/heroes/margot/"},
        { name: "デスマッチ", initial: "防衛部隊殺傷力+5%", max: "防衛部隊殺傷力+15%", description: "防衛部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/margot/"}
      ]}
    ]
  },
  "ローザ": {
    source: "https://altema.jp/kingshot/chara/24", sourceName: "アルテマ「キングショット」ローザの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "センター・アテンション", initial: "3% / 3秒", max: "7% / 5秒", description: "味方全体の状態異常を解除し、攻撃力を上昇させる。記載時間中は状態異常の影響を受けない。" },
        { name: "ファン・ダンス", initial: "220%", max: "300%", description: "軌道上の敵に攻撃力×220%（初期値）/×300%（最大強化時）のダメージを与える。" },
        { name: "マインド・シャッター", initial: "1% / 40%", max: "3% / 60%", description: "敵全体の攻撃速度と治療効果を低下させる。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "ノイズ・タイム", initial: "10%", max: "50%", description: "40%の確率で味方全体の与ダメージが上昇する。" },
        { name: "チャーム・ダンス", initial: "4%", max: "20%", description: "敵全体のダメージを低下させる。" },
        { name: "ゴールデン・リズム", initial: "6%", max: "30%", description: "弓兵の総攻撃力が上昇する。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "オールナイト・フェスタ", initial: "5%", max: "15%", description: "センター・アテンション発動後、自身の攻撃力が5%（初期）〜15%（最大強化時）上昇。戦闘終了まで持続。", source: "https://ks-toolkit.com/data/heroes/rosa/"},
        { name: "インスパイア・ダンス", initial: "集結部隊殺傷力+5%", max: "集結部隊殺傷力+15%", description: "集結部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/rosa/"}
      ]}
    ]
  },
  "龍飛": {
    source: "https://altema.jp/kingshot/chara/26", sourceName: "アルテマ「キングショット」龍飛の評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "聖なる玉湯", initial: "80%", max: "120%", description: "攻撃速度が4秒間上昇し、制御効果を無効化する。" },
        { name: "雲散霧消", initial: "20%", max: "60%", description: "HPが50%未満になると、被ダメージが低下する。" },
        { name: "圧倒する力", initial: "16%", max: "48%", description: "HPが50%未満になると攻撃力が上昇する。以前参照した世代一覧ページには別英雄のスキル名が混入していたため、個別ページ記載を採用。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "天昇豪胆", initial: "10%", max: "50%", description: "40%の確率で味方全部隊の被ダメージが減少する。" },
        { name: "剛筋頑健", initial: "5%", max: "25%", description: "全軍の総防御力が上昇する。" },
        { name: "杯投烈脚", initial: "120%", max: "200%", description: "味方全部隊の攻撃時、25%の確率で追加ダメージを与える。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "呑下三百杯", initial: "15%", max: "15%", description: "聖なる玉湯の持続時間が1.5秒延長。延長中、与ダメージの15%分HPを回復。", source: "https://ks-toolkit.com/data/heroes/long-fei/"},
        { name: "虚実一対", initial: "防衛部隊攻撃力+15%", max: "防衛部隊攻撃力+15%", description: "防衛部隊の攻撃力が15%上昇する。", source: "https://ks-toolkit.com/data/heroes/long-fei/"}
      ]}
    ]
  },
  "スルード": {
    source: "https://altema.jp/kingshot/chara/27", sourceName: "アルテマ「キングショット」スルードの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ストームアックス", initial: "60%", max: "84%", description: "ランダムなターゲット（英雄優先）に攻撃力×60%（初期値）/×84%（最大強化時）の範囲ダメージを与える。" },
        { name: "バーサカースロー", initial: "50%", max: "70%", description: "範囲内のターゲットに攻撃力×50%（初期値）/×70%（最大強化時）のダメージを与え、1.5秒間眩暈状態にする。" },
        { name: "ウルフバンケット", initial: "3%", max: "5%", description: "味方全体の攻撃力が3%（初期値）/5%（最大強化時）上昇する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "ファナティック", initial: "3% / 3%", max: "15% / 15%", description: "歩兵と弓兵の被ダメージが3%（初期値）/15%（最大強化時）低下し、与ダメージが同率上昇する。" },
        { name: "レックレス", initial: "20%", max: "100%", description: "騎兵の攻撃時、20%の確率で敵全体に追加ダメージを与える。追加ダメージは攻撃力の20%（初期値）/100%（最大強化時）。" },
        { name: "アンセスター", initial: "5% / 5%", max: "25% / 25%", description: "騎兵が4回攻撃する度、味方全部隊の与ダメージが5%（初期値）/25%（最大強化時）上昇し、被ダメージが同率低下する。2ターン持続。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "レイジアックス", initial: "25%", max: "35%", description: "ストームアックス使用後、25%（初期）〜35%（最大強化時）の確率でターゲットを1秒間眩暈状態にする。", source: "https://ks-toolkit.com/data/heroes/thrud/"},
        { name: "ウルフキッス", initial: "集結部隊殺傷力+5%", max: "集結部隊殺傷力+15%", description: "集結部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/thrud/"}
      ]}
    ]
  },
  "ビビアン": {
    source: "https://altema.jp/kingshot/chara/28", sourceName: "アルテマ「キングショット」ビビアンの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ゴールデンショット", initial: "180%", max: "252%", description: "敵後列のターゲット（英雄優先）に攻撃力×180%（初期値）/×252%（最大強化時）の範囲ダメージを与え、攻撃速度を50%低下させる。2秒持続。" },
        { name: "グッドラック", initial: "100%", max: "140%", description: "敵ターゲット（英雄優先）に攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与える。50%の確率でクリティカルヒットとなり、ダメージが2倍になる。" },
        { name: "ゴールドラッシュ", initial: "35%", max: "49%", description: "範囲内の敵ターゲットに攻撃力×35%（初期値）/×49%（最大強化時）のダメージを毎秒与える。3秒持続。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "アウェイティング", initial: "5%", max: "25%", description: "味方全部隊の攻撃時、ターゲットの被ダメージが5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "バラージショット", initial: "20% / 5%", max: "100% / 15%", description: "味方全部隊が4回攻撃する毎に、次の攻撃でターゲットに20%（初期値）/100%（最大強化時）の追加ダメージを与える。さらにターゲットは次の攻撃を受ける際、5%（初期値）/15%（最大強化時）の追加ダメージを受ける。" },
        { name: "グリードトラップ", initial: "12%", max: "60%", description: "弓兵部隊が4回攻撃する毎に罠を発動し、敵全体に12%（初期値）/60%（最大強化時）の追加ダメージを与える。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "ロイヤルシューター", initial: "50%", max: "70%", description: "スキル使用のたびに、ランダムなターゲット（英雄優先）へ攻撃力×50%（初期）〜70%（最大強化時）のダメージ。", source: "https://ks-toolkit.com/data/heroes/vivian/"},
        { name: "フルバウンティ", initial: "防衛部隊防御力+5%", max: "防衛部隊防御力+15%", description: "防衛部隊の防御力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/vivian/"}
      ]}
    ]
  },
  "トリトン": {
    source: "https://altema.jp/kingshot/chara/29", sourceName: "アルテマ「キングショット」トリトンの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "潮汐の意思", initial: "100%", max: "140%", description: "2秒間無敵状態になり、前方へ突進して攻撃力×100%（初期値）/×140%（最大強化時）の範囲ダメージを与える。" },
        { name: "諸王の怒り", initial: "8% / 16%", max: "24% / 48%", description: "自身の攻撃力が8%（初期値）/24%（最大強化時）、防御力が16%（初期値）/48%（最大強化時）上昇する。4秒持続。" },
        { name: "必殺の一撃", initial: "20%", max: "28%", description: "個別ページの数値表は初期20%・最大28%。説明文では通常攻撃毎に攻撃力×20%のダメージと記載されており、最大値の意味は要確認。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "律令の力", initial: "5%", max: "25%", description: "味方全部隊の総防御力が5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "戦争の力", initial: "6%", max: "30%", description: "味方全部隊の与ダメージが6%（初期値）/30%（最大強化時）上昇する。" },
        { name: "誓約の力", initial: "4% / 6%", max: "20% / 30%", description: "味方歩兵の総HPが4%（初期値）/20%（最大強化時）、騎兵と弓兵の総HPが6%（初期値）/30%（最大強化時）上昇する。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "クリスタル改造", initial: "10%", max: "30%", description: "トリトンの与ダメージが10%（初期）〜30%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/triton/"},
        { name: "虚実一対", initial: "防衛部隊防御力+5%", max: "防衛部隊防御力+15%", description: "防衛部隊の防御力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/triton/"}
      ]}
    ]
  },
  "ソフィア": {
    source: "https://altema.jp/kingshot/chara/30", sourceName: "アルテマ「キングショット」ソフィアの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "マリオネット", initial: "100%", max: "140%", description: "範囲内の敵に攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与え、1秒間混乱状態にする。" },
        { name: "ペイン・マーク", initial: "50% / 2%", max: "70% / 6%", description: "範囲内のターゲットに攻撃力×50%（初期値）/×70%（最大強化時）のダメージを与え、被ダメージを2%（初期値）/6%（最大強化時）上昇させる。4秒持続。" },
        { name: "マーク・ウィップ", initial: "8% / 4%", max: "24% / 12%", description: "ペイン・マーク付与時に自身の攻撃力が8%（初期値）/24%（最大強化時）上昇し、マーク対象への与ダメージが4%（初期値）/12%（最大強化時）増加する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "コントラクト・バインド", initial: "8%", max: "40%", description: "毎ターン8%（初期値）/40%（最大強化時）の確率で味方全部隊の被ダメージを50%軽減する。" },
        { name: "パニック・ダメージ", initial: "40%", max: "200%", description: "2ターン毎に敵を恐怖状態にし、次ターンに追加の騎兵攻撃ダメージ40%（初期値）/200%（最大強化時）を与える。恐怖は1ターン継続。" },
        { name: "パニック・ジエンド", initial: "15%", max: "75%", description: "味方全部隊の恐怖状態の敵への与ダメージが15%（初期値）/75%（最大強化時）上昇する。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "オーバーマインド・アイ", initial: "2%", max: "8%", description: "攻撃時2%（初期）〜8%（最大強化時）の確率でターゲットを1秒間混乱状態にする。混乱状態の敵は周囲のターゲットを無差別に攻撃する。", source: "https://ks-toolkit.com/data/heroes/sophia/"},
        { name: "ダークナイトクイーン", initial: "防衛部隊殺傷力+5%", max: "防衛部隊殺傷力+15%", description: "防衛部隊の殺傷力が5%（初期）〜15%（最大強化時）上昇する。", source: "https://ks-toolkit.com/data/heroes/sophia/"}
      ]}
    ]
  },
  "ヤン": {
    source: "https://altema.jp/kingshot/chara/31", sourceName: "アルテマ「キングショット」ヤンの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "メガスロー", initial: "100%", max: "140%", description: "直線上の敵に攻撃力×100%（初期値）/×140%（最大強化時）の範囲ダメージ。雪の精霊が戻り、再び同ダメージを与える。" },
        { name: "チェーンショット", initial: "15%", max: "30%", description: "15%（最大30%）の確率で特製の銃による連撃を行い、ターゲットに追加ダメージを1回与える。" },
        { name: "ヘッドショット", initial: "3%", max: "15%", description: "ダメージ時に一定確率で会心が発生する。" },
      ]},
      { type: "遠征スキル", skills: [
        { name: "アバランチ", initial: "20%", max: "100%", description: "味方全部隊が4ターン毎に1度追加攻撃を行い、追加ダメージを与える。" },
        { name: "アイスゾーン", initial: "20%", max: "100%", description: "弓兵が攻撃する度、40%の確率で対象に20%（初期値）/100%（最大強化時）の追加ダメージを与える。" },
        { name: "アンブッシュ", initial: "8%", max: "40%", description: "毎ターン一定確率で全軍の与ダメージが上昇する。発動率は初期8%、最大40%。" },
      ]}
      ]},
      { type: "専用装備スキル", skills: [
        { name: "ラピッドファイア", initial: "ダメージ40%、護衛対象は即時撃破", max: "ダメージ56%、護衛対象は即時撃破", description: "連続5回射撃し、ランダムな敵に攻撃力×40%（初期値）/×56%（最大強化時）のダメージを与える。対象が護衛なら即座に撃破する。", source: "https://www.kingshotcommand.com/hero-widgets/yang"},
        { name: "アタックディフェンス", initial: "集結部隊の殺傷力+5%", max: "集結部隊の殺傷力+15%", description: "集結部隊の殺傷力が5%（初期値）/15%（最大強化時）上昇する。", source: "https://www.kingshotcommand.com/hero-widgets/yang"}
      ]}
    ]
  },
  "クイン": {
    source: "https://altema.jp/kingshot/chara/5", sourceName: "アルテマ「キングショット」クインの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "ヘッドショット", initial: "400%", max: "560%", description: "敵に攻撃力の400%（初期値）/560%（最大強化時）のダメージを与える。" },
        { name: "クイックショット", initial: "10%", max: "30%", description: "クインの攻撃速度が10%（初期値）/30%（最大強化時）上昇する。" },
        { name: "適者生存", initial: "10%", max: "30%", description: "クインの与ダメージが10%（初期値）/30%（最大強化時）増加する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "危険予知", initial: "4%", max: "20%", description: "自軍全体が受けるダメージが4%（初期値）/20%（最大強化時）減少する。" },
        { name: "弱点射撃", initial: "10%", max: "50%", description: "味方全部隊の攻撃時、50%の確率で追加の与ダメージが10%（初期値）/50%（最大強化時）上昇する。" }
      ]}
    ]
  },
  "ハワード": {
    source: "https://altema.jp/kingshot/chara/6", sourceName: "アルテマ「キングショット」ハワードの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "盾インパクト", initial: "200%", max: "280%", description: "敵に攻撃力の200%（初期値）/280%（最大強化時）の範囲ダメージを与え、ノックバックさせる。" },
        { name: "盾の壁", initial: "5%", max: "15%", description: "味方全英雄の防御力が5%（初期値）/15%（最大強化時）上昇する。" },
        { name: "盾ブロック", initial: "10%", max: "30%", description: "自身の被ダメージが10%（初期値）/30%（最大強化時）低下する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "プロテクト", initial: "4%", max: "20%", description: "味方全部隊の被ダメージが4%（初期値）/20%（最大強化時）減少する。" },
        { name: "弱体化打撃", initial: "4%", max: "20%", description: "敵全部隊の総攻撃力が4%（初期値）/20%（最大強化時）低下する。" }
      ]}
    ]
  },
  "ダイアナ": {
    source: "https://altema.jp/kingshot/chara/7", sourceName: "アルテマ「キングショット」ダイアナの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "爆裂矢", initial: "210%, 70%", max: "290%, 98%", description: "敵1体に攻撃力の210%（初期値）/290%（最大強化時）のダメージを与え、周囲の小範囲の敵にも攻撃力の70%（初期値）/98%（最大強化時）のダメージを与える。" },
        { name: "射手の才", initial: "10%", max: "30%", description: "攻撃速度が10%（初期値）/30%（最大強化時）上昇する。" },
        { name: "必殺", initial: "7%", max: "20%", description: "会心率が7%（初期値）/20%（最大強化時）上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "強靭ボディ", initial: "10%", max: "20%", description: "領主体力の消耗が10%（初期値）/20%（最大強化時）減少する。" },
        { name: "迅速行動", initial: "20%", max: "100%", description: "出征速度が20%（初期値）/100%（最大強化時）上昇する。" }
      ]}
    ]
  },
  "チェンコ": {
    source: "https://altema.jp/kingshot/chara/8", sourceName: "アルテマ「キングショット」チェンコの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "機関銃掃射", initial: "55%", max: "75%", description: "扇状範囲内の敵に0.5秒毎に攻撃力の55%（初期値）/75%（最大強化時）のダメージを与える。2秒間持続。" },
        { name: "防具改造", initial: "25%", max: "70%", description: "防御力が25%（初期値）/70%（最大強化時）上昇する。" },
        { name: "武器改造", initial: "8%", max: "24%", description: "攻撃力が8%（初期値）/24%（最大強化時）上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "完全武装", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "アーマー", initial: "4%", max: "20%", description: "自軍全体の被ダメージが4%（初期値）/20%（最大強化時）減少する。" }
      ]}
    ]
  },
  "ゴードン": {
    source: "https://altema.jp/kingshot/chara/9", sourceName: "アルテマ「キングショット」ゴードンの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "バーベキュー", initial: "200%, 5%", max: "280%, 7%", description: "自軍全体がゴードンの攻撃力×200%（初期値）/×280%（最大強化時）に相当するHPを回復し、攻撃力が5%（初期値）/7%（最大強化時）上昇する。4秒間持続。" },
        { name: "嵐の厨房", initial: "10%", max: "30%", description: "自身の被ダメージが10%（初期値）/30%（最大強化時）低下する。" },
        { name: "非常食", initial: "50%", max: "70%", description: "5秒毎に攻撃力×50%（初期値）/×70%（最大強化時）分のHPを回復する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "幸せグルメ", initial: "5%", max: "25%", description: "味方全部隊の総HPが5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "暴言", initial: "5%", max: "25%", description: "味方全部隊の総攻撃力が5%（初期値）/25%（最大強化時）上昇する。" }
      ]}
    ]
  },
  "オリーブ": {
    source: "https://altema.jp/kingshot/chara/10", sourceName: "アルテマ「キングショット」オリーブの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "矢の雨", initial: "180%", max: "252%", description: "攻撃×180%（初期値）/×252%（最大強化時）のダメージを与える。" },
        { name: "マーク", initial: "10%", max: "30%", description: "ターゲットに狩人の印を付与し、今回の攻撃の与ダメージが10%（初期値）/30%（最大強化時）上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "栽培専門家", initial: "5%", max: "25%", description: "街の製粉場の生産量が5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "食糧調達", initial: "5%", max: "25%", description: "出征時、パンの採集速度が5%（初期値）/25%（最大強化時）上昇する。" }
      ]}
    ]
  },
  "エドウィン": {
    source: "https://altema.jp/kingshot/chara/11", sourceName: "アルテマ「キングショット」エドウィンの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "自家製爆弾", initial: "140%", max: "196%", description: "ターゲットとその周囲の敵に攻撃力×140%（初期値）/×196%（最大強化時）のダメージを与える。" },
        { name: "高威力爆弾", initial: "10%, 0.5秒", max: "20%, 1.5秒", description: "10%（初期値）/20%（最大強化時）の確率で目標を0.5秒（初期値）/1.5秒（最大強化時）間気絶させる。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "発破技士", initial: "5%", max: "25%", description: "街の石材工場の生産量が5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "巨石採掘", initial: "5%", max: "25%", description: "出征時、石材の採集速度が5%（初期値）/25%（最大強化時）上昇する。" }
      ]}
    ]
  },
  "スミス": {
    source: "https://altema.jp/kingshot/chara/12", sourceName: "アルテマ「キングショット」スミスの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "火炎槌", initial: "200%", max: "280%", description: "前方扇形範囲の敵に攻撃力×200%（初期値）/×280%（最大強化時）のダメージを与える。" },
        { name: "防具強化", initial: "10%", max: "30%", description: "自身の被ダメージが10%（初期値）/30%（最大強化時）低下する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "善は急げ", initial: "5%", max: "25%", description: "街の鉄鉱場の生産量が5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "鍛冶職人", initial: "5%", max: "25%", description: "出征時、鉄鉱の採集速度が5%（初期値）/25%（最大強化時）上昇する。" }
      ]}
    ]
  },

  "フォルスト": {
    source: "https://altema.jp/kingshot/chara/13", sourceName: "アルテマ「キングショット」フォルストの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "斧旋風", initial: "80%", max: "110%", description: "素早く斧を振り回し、0.5秒毎に周囲の敵にダメージを与える。3秒間持続。" },
        { name: "鋭刃", initial: "10%", max: "30%", description: "与ダメージが上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "一子相伝", initial: "5%", max: "25%", description: "街の伐採場生産量が上昇する。" },
        { name: "伐採名人", initial: "5%", max: "25%", description: "出征時、木材の採集速度が上昇する。" }
      ]}
    ]
  },

  "ファハド": {
    source: "https://altema.jp/kingshot/chara/20", sourceName: "アルテマ「キングショット」ファハドの評価とスキル", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "サンドストーム", initial: "1%", max: "5%", description: "範囲内の敵の攻撃力を1%（初期値）/5%（最大強化時）低下させる。2秒持続。" },
        { name: "ハヤブサの導き", initial: "15%", max: "35%", description: "サンドストーム発動後、自身と周囲の味方の攻撃力が15%（初期値）/35%（最大強化時）上昇する。2秒持続。" },
        { name: "砂の将軍", initial: "10%", max: "30%", description: "ファハドの攻撃速度が10%（初期値）/30%（最大強化時）上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "サンドシェード", initial: "4%", max: "20%", description: "敵全体の与ダメージを4%（初期値）/20%（最大強化時）低下させる。" },
        { name: "先行者", initial: "20%", max: "100%", description: "モンスター討伐部隊の出征速度が20%（初期値）/100%（最大強化時）上昇する。" }
      ]}
    ]
  },
  "あまね": {
    source: "https://altema.jp/kingshot/chara/22", sourceName: "アルテマ「あまねの評価とスキル」", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "桜花爛漫", initial: "1.5%, 2.5%", max: "3.5%, 4.5%", description: "味方全体の英雄と護衛の攻撃力・攻撃速度が上昇する。4秒持続。" },
        { name: "破魔矢", initial: "150%", max: "210%", description: "相手に攻撃力に応じたダメージを与える。" },
        { name: "神楽", initial: "1%", max: "5%", description: "通常攻撃を3回行う度に自身の攻撃速度が上昇する。戦闘終了まで持続。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "三布の陣", initial: "5%", max: "25%", description: "味方全部隊の攻撃力が上昇する。" },
        { name: "破魔の祈り", initial: "10%", max: "50%", description: "野戦病院の治療速度が上昇する。" }
      ]}
    ]
  },
  "インウー": {
    source: "https://altema.jp/kingshot/chara/21", sourceName: "アルテマ「インウーの評価とスキル」", checkedAt: "2026-10-13",
    groups: [
      { type: "討伐スキル", skills: [
        { name: "散華", initial: "125%, 150%", max: "175%, 210%", description: "攻撃力×100%、125%（初期値）/×100%、175%（最大強化時）の順に斬撃を3回行い、3回目は範囲ダメージとなる。※2・3撃目の倍率を表示。" },
        { name: "飛燕", initial: "100%, 30%", max: "140%, 50%", description: "ターゲットに攻撃力×100%（初期値）/×140%（最大強化時）のダメージを与え、攻撃速度を30%（初期値）/50%（最大強化時）低下させる。2秒持続。" },
        { name: "双剣", initial: "8%", max: "24%", description: "自身の攻撃力が8%（初期値）/24%（最大強化時）上昇する。" }
      ]},
      { type: "遠征スキル", skills: [
        { name: "戦の構え", initial: "5%", max: "25%", description: "味方全部隊の総殺傷力が5%（初期値）/25%（最大強化時）上昇する。" },
        { name: "多聞", initial: "3%", max: "15%", description: "科学研究の速度が3%（初期値）/15%（最大強化時）上昇する。" }
      ]}
    ]
  },
};

export default HERO_SKILLS_JA;
