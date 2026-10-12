# EagleEye 英雄スキル辞典 検証マトリクス

作成日：2026-10-13
対象：`src/hero-skills-ja.js` の main
辞典コミット：`3126a1b396698cc0e669eca99521316b3f2ac0a4`

## 状態の定義

- **今回の外部資料で再照合済み**：今回の監査で外部資料を開き、英雄・スキル・初期値/最大値の対応を確認した。
- **前回監査の外部資料照合記録あり**：前の監査記録に英雄別KS-Toolkit出典と照合内容が残っている。今回この全行を再確認したという意味ではない。
- **要注意**：参照資料内に数値表と効果説明の食い違いがある。どちらかを推測で正解扱いしない。
- **今回未再照合**：この監査段階では行単位の再照合が未完了。誤りを意味しないが、今回の検証済みとも数えない。
- 実機検証済み件数は別管理とし、公開資料の照合だけでゲーム内実機確認済みとは扱わない。

## 集計

- 英雄数：37
- スキル行：256
- 今回の外部資料で再照合済み：46行
- 前回監査の外部資料照合記録あり：34行
- 今回未再照合：175行
- 要注意：出典内で数値表と説明文が不一致：1行

## 行別一覧

| 英雄 | 分類 | スキル | 初期値 | 最大値 | 状態 | 参照先 |
|---|---|---|---|---|---|---|
| アルカ | 討伐スキル | グローリー・モーメント | 30% | 70% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/25) |
| アルカ | 討伐スキル | スプリット・ランス | 70% | 98% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/25) |
| アルカ | 討伐スキル | リバイバル・スピリット | 30% | 42% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/25) |
| アルカ | 遠征スキル | アシスト・アリー | 14% | 70% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/25) |
| アルカ | 遠征スキル | チャンピオン・ウィル | 20%, 2% | 100%, 10% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/25) |
| アルカ | 遠征スキル | チャンス・オブ・フューリー | 12%, 5% | 60%, 25% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/25) |
| アルカ | 専用装備スキル | 不屈の信念 | 攻撃力+30%（2.5秒） | 攻撃力+42%（2.5秒） | 今回の外部資料で再照合済み | [専用装備資料](https://kingshotwiki.com/ja/heroes/alcar-ja/) |
| アルカ | 専用装備スキル | グローリー・オース | 防衛部隊HP+5% | 防衛部隊HP+15% | 今回の外部資料で再照合済み | [専用装備資料](https://kingshotwiki.com/ja/heroes/alcar-ja/) |
| アマデウス | 討伐スキル | 三段斬り | 160% | 224% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/1) |
| アマデウス | 討伐スキル | 剣気 | 15% | 23% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/1) |
| アマデウス | 討伐スキル | 快進撃 | 16% | 48% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/1) |
| アマデウス | 遠征スキル | 臨戦態勢 | 5% | 25% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/1) |
| アマデウス | 遠征スキル | 剣術指導 | 5% | 25% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/1) |
| アマデウス | 遠征スキル | 不義の一撃 | 8% | 40% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/1) |
| アマデウス | 専用装備スキル | 双剣防御 | 自身の被ダメージ-10% | 自身の被ダメージ-30% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/amadeus/) |
| アマデウス | 専用装備スキル | 真実の術 | 集結部隊攻撃力+5% | 集結部隊攻撃力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/amadeus/) |
| エリック | 討伐スキル | ハンマー・スウィング | 120% | 168% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/17) |
| エリック | 討伐スキル | バトル・ボディ | 8%, 8% | 16%, 20% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/17) |
| エリック | 討伐スキル | ヘビースマッシュ | 80% | 112% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/17) |
| エリック | 遠征スキル | 浄化 | 4% | 20% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/17) |
| エリック | 遠征スキル | 意志 | 4% | 20% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/17) |
| エリック | 遠征スキル | 鼓舞 | 5% | 25% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/17) |
| エリック | 専用装備スキル | ハンマー・ブレス | 与ダメージ+10% | 与ダメージ+30% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/eric/) |
| エリック | 専用装備スキル | ハンマー・ディフェンス | 防衛部隊防御力+5% | 防衛部隊防御力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/eric/) |
| ペーラ | 討伐スキル | ジャッジカード | 270% | 378% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/18) |
| ペーラ | 討伐スキル | サプライズカード | 100% | 140% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/18) |
| ペーラ | 討伐スキル | 無情な運命 | 50% | 70% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/18) |
| ペーラ | 遠征スキル | ドゥーム | 10% | 50% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/18) |
| ペーラ | 遠征スキル | ラッキーカード | 10% | 50% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/18) |
| ペーラ | 遠征スキル | ガーディアンカード | 10% | 50% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/18) |
| ペーラ | 専用装備スキル | シャッフルマジック | 浮動効果の上限・下限+30% | 浮動効果の上限・下限+150% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/petra/) |
| ペーラ | 専用装備スキル | 運命の計画 | 集結部隊攻撃力+5% | 集結部隊攻撃力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/petra/) |
| ディエゴ | 討伐スキル | 完全無欠 | 220% | 380% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/35) |
| ディエゴ | 討伐スキル | 健在の剣心 | 敵攻撃力-1% / 自身+敵英雄数×1% | 敵攻撃力-5% / 自身+敵英雄数×5% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/35) |
| ディエゴ | 討伐スキル | 影渡し | 回避3% / 会心4% | 回避15% / 会心20% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/35) |
| ディエゴ | 遠征スキル | 防守の指導 | 総防御力+3% / 総HP+2% | 総防御力+15% / 総HP+10% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/35) |
| ディエゴ | 遠征スキル | 無形の剣気 | 発動率50% / 追加ダメージ10% | 発動率50% / 追加ダメージ50% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/35) |
| ディエゴ | 遠征スキル | 凛然なる剣気 | 5% | 25% | 今回の外部資料で再照合済み | [英雄ページ](https://altema.jp/kingshot/chara/35) |
| ディエゴ | 専用装備スキル | 重剣無鋒 | 追加シールド攻撃力×55%、被ダメージの10%反射 | 追加シールド攻撃力×95%、被ダメージの30%反射 | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/diego) |
| ディエゴ | 専用装備スキル | 大巧不工 | 防衛部隊の防御力+5% | 防衛部隊の防御力+15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/diego) |
| リズ | 討伐スキル | ビッグバブル | 220% | 300% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/36) |
| リズ | 討伐スキル | スロウポーション | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/36) |
| リズ | 討伐スキル | ライトポーション | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/36) |
| リズ | 遠征スキル | パワーブースター | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/36) |
| リズ | 遠征スキル | エナジーブースター | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/36) |
| リズ | 遠征スキル | ライドマスター | 30% | 150% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/36) |
| リズ | 専用装備スキル | スプラッシュバブル | 自身攻撃力+8%、追加範囲ダメージ攻撃力×50% | 自身攻撃力+24%、追加範囲ダメージ攻撃力×70% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/liz) |
| リズ | 専用装備スキル | ハイパーブースター | 防衛部隊の殺傷力+5% | 防衛部隊の殺傷力+15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/liz) |
| ルナ | 討伐スキル | スターフォール | 220% | 300% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/37) |
| ルナ | 討伐スキル | バラージアロー | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/37) |
| ルナ | 討伐スキル | ハンティングリズム | 0.5% | 2.5% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/37) |
| ルナ | 遠征スキル | 月光の灯火 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/37) |
| ルナ | 遠征スキル | 密林の復讐 | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/37) |
| ルナ | 遠征スキル | 閃光の矢 | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/37) |
| ルナ | 専用装備スキル | 星霊の残光 | 星霊HPは初期HPの10%、5秒存在 | 星霊HPは初期HPの30%、5秒存在 | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/luna) |
| ルナ | 専用装備スキル | 月輝の力 | 集結部隊の攻撃力+5% | 集結部隊の攻撃力+15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/luna) |
| チャールズ | 討伐スキル | リベンジャー | 100% / 20% | 140% / 100% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/32) |
| チャールズ | 討伐スキル | フェアウェル | 200% | 280% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/32) |
| チャールズ | 討伐スキル | ケアフリー | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/32) |
| チャールズ | 遠征スキル | パンツァーオーラ | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/32) |
| チャールズ | 遠征スキル | 鋼鉄の身体 | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/32) |
| チャールズ | 遠征スキル | 愛と正義 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/32) |
| チャールズ | 専用装備スキル | 修理の達人 | HP50%未満で最大HP7%回復、防御力+6% | HP50%未満で最大HP35%回復、防御力+30% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/charles/) |
| チャールズ | 専用装備スキル | 華麗なる登場 | 味方全体のHP+3% | 味方全体のHP+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/charles/) |
| アイヴァ | 討伐スキル | ボマーペイント | 50% | 70% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/33) |
| アイヴァ | 討伐スキル | スポイルペイント | 25% / 5% | 35% / 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/33) |
| アイヴァ | 討伐スキル | フェイクペイント | 25% | 75% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/33) |
| アイヴァ | 遠征スキル | アナライズ | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/33) |
| アイヴァ | 遠征スキル | ライト&シャドウ | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/33) |
| アイヴァ | 遠征スキル | クール&ホット | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/33) |
| アイヴァ | 専用装備スキル | カラーセンス | 与ダメージ+25%、対象攻撃力-5% | 与ダメージ+25%、対象攻撃力-25% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/ava/) |
| アイヴァ | 専用装備スキル | クロマストーム | 味方全部隊の殺傷力+5% | 味方全部隊の殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/ava/) |
| レン&ロン | 討伐スキル | スカイハイショット | 300% | 420% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/34) |
| レン&ロン | 討伐スキル | 特製ナパーム弾 | 60% / 17% | 84% / 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/34) |
| レン&ロン | 討伐スキル | キャノンボウラー | 10% | 26% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/34) |
| レン&ロン | 遠征スキル | 砲兵隊 | 3% / 2% | 15% / 10% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/34) |
| レン&ロン | 遠征スキル | 連続砲撃 | 6% / 5% | 30% / 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/34) |
| レン&ロン | 遠征スキル | ヘビィキャノン出撃 | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/34) |
| レン&ロン | 専用装備スキル | クールな砲撃手 | 英雄・護衛の攻撃速度+6%（5秒） | 英雄・護衛の攻撃速度+14%（5秒） | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/wee-and-woo/) |
| レン&ロン | 専用装備スキル | 秘密の火薬樽 | 防衛部隊の攻撃力+5% | 防衛部隊の攻撃力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/wee-and-woo/) |
| ヘルガ | 討伐スキル | 鹿角猛進 | 160% | 224% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/2) |
| ヘルガ | 討伐スキル | 追撃攻勢 | 150% | 210% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/2) |
| ヘルガ | 討伐スキル | 怒狂 | 4% | 12% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/2) |
| ヘルガ | 遠征スキル | 守護者の誓い | 8% | 40% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/2) |
| ヘルガ | 遠征スキル | 英霊の叫び | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/2) |
| ヘルガ | 遠征スキル | 荒野の均衡 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/2) |
| ヘルガ | 専用装備スキル | 狂熱共鳴 | 与ダメージ+10% | 与ダメージ+30% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/helga/) |
| ヘルガ | 専用装備スキル | 狂熱共鳴（遠征） | 集結部隊殺傷力+5% | 集結部隊殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/helga/) |
| ジェベル | 討伐スキル | ランススパイク | 180% | 252% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/4) |
| ジェベル | 討伐スキル | 真っ向勝負 | 150% | 210% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/4) |
| ジェベル | 討伐スキル | 執念 | 20% | 60% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/4) |
| ジェベル | 遠征スキル | 赤き旗 | 8% | 40% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/4) |
| ジェベル | 遠征スキル | 勇姿 | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/4) |
| ジェベル | 遠征スキル | 戦乙女 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/4) |
| ジェベル | 専用装備スキル | 紅の意志 | 与ダメージ+10% | 与ダメージ+30% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/jabel/) |
| ジェベル | 専用装備スキル | 信頼 | 防衛部隊殺傷力+5% | 防衛部隊殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/jabel/) |
| サロ | 討伐スキル | 連続射撃 | 55% | 75% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/3) |
| サロ | 討伐スキル | 金剛不壊 | 50% | 150% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/3) |
| サロ | 討伐スキル | 工法改良 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/3) |
| サロ | 遠征スキル | 特派訓練 | 2%, 3% | 10%, 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/3) |
| サロ | 遠征スキル | リサイクル | 3%, 3% | 15%, 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/3) |
| サロ | 遠征スキル | 陣地戦の強者 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/3) |
| サロ | 専用装備スキル | 義理尽 | 攻撃力+6% | 攻撃力+24% | 今回の外部資料で再照合済み | [専用装備資料](https://kingshotwiki.com/ja/heroes/kingshot_wiki_hero_name_50017_kingshot_end-3/) |
| サロ | 専用装備スキル | 攻撃は最大の防御 | 防衛部隊攻撃力+5% | 防衛部隊攻撃力+15% | 今回の外部資料で再照合済み | [専用装備資料](https://kingshotwiki.com/ja/heroes/kingshot_wiki_hero_name_50017_kingshot_end-3/) |
| ゾーイ | 討伐スキル | ソードシールドアサルト | 60% / 被ダメージ+10% | 84% / 被ダメージ+30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/16) |
| ゾーイ | 討伐スキル | ペインエキサイトメント | 20% | 40% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/16) |
| ゾーイ | 討伐スキル | ゴッドパワー | 3% | 7% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/16) |
| ゾーイ | 遠征スキル | リッジワウンド | 発動率20% / 毎ターン8%ダメージ | 発動率20% / 毎ターン40%ダメージ | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/16) |
| ゾーイ | 遠征スキル | 感情支配 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/16) |
| ゾーイ | 遠征スキル | 無限テクニック | 発動率50% / 被ダメージ+10% | 発動率50% / 被ダメージ+50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/16) |
| ゾーイ | 専用装備スキル | デスファイト | 8% | 24% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/zoe/) |
| ゾーイ | 専用装備スキル | 不義のプリンセス | 防衛部隊攻撃力+5% | 防衛部隊攻撃力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/zoe/) |
| ヒルデ | 討伐スキル | 治療祈祷 | 200% | 280% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/14) |
| ヒルデ | 討伐スキル | 贖罪 | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/14) |
| ヒルデ | 討伐スキル | 教化 | 140% | 196% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/14) |
| ヒルデ | 遠征スキル | 苦行 | 総攻撃力+3% / 総防御力+2% | 総攻撃力+15% / 総防御力+10% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/14) |
| ヒルデ | 遠征スキル | ポーション注入 | 120% | 200% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/14) |
| ヒルデ | 遠征スキル | 意志の試練 | 発動率8% / 被ダメージ50%軽減 | 発動率40% / 被ダメージ50%軽減 | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/14) |
| ヒルデ | 専用装備スキル | 聖なる祈祷 | 30% | 70% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/hilde/) |
| ヒルデ | 専用装備スキル | タフネス | 防衛部隊HP+5% | 防衛部隊HP+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/hilde/) |
| マリン | 討伐スキル | バックウォッシュ | 200% | 280% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/15) |
| マリン | 討伐スキル | ドランカーミスト | 50% | 70% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/15) |
| マリン | 討伐スキル | ラッキーショット | 8回ごと / 0.2秒眩暈 | 5回ごと / 0.5秒眩暈 | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/15) |
| マリン | 遠征スキル | 予測不能 | 発動率8% / 与ダメージ+50% | 発動率40% / 与ダメージ+50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/15) |
| マリン | 遠征スキル | ラム酒 | 発動率20% / 総殺傷力-10% | 発動率20% / 総殺傷力-50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/15) |
| マリン | 遠征スキル | 強化ガンパウダー | 発動率50% / 与ダメージ+10% | 発動率50% / 与ダメージ+50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/15) |
| マリン | 専用装備スキル | 酒飲み | 5% | 15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/marlin) |
| マリン | 専用装備スキル | 無敵艦隊 | 集結部隊の殺傷力+5% | 15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/marlin) |
| イェーガー | 討伐スキル | デスアトラクト | 160% | 224% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/19) |
| イェーガー | 討伐スキル | 不器用な演技 | 220% / 50% | 300% / 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/19) |
| イェーガー | 討伐スキル | シークレット・ストーリー | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/19) |
| イェーガー | 遠征スキル | ストームソング | 8% | 40% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/19) |
| イェーガー | 遠征スキル | コンフリクトソング | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/19) |
| イェーガー | 遠征スキル | フェスティバルソング | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/19) |
| イェーガー | 専用装備スキル | サイレント・シレンス | ダメージ220%、沈黙3秒 | ダメージ300%、沈黙5秒 | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/jaeger) |
| イェーガー | 専用装備スキル | 賛美歌 | 防衛部隊のHP+5% | 防衛部隊のHP+15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/jaeger) |
| マーゴ | 討伐スキル | トリックアタック | 300% | 420% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/23) |
| マーゴ | 討伐スキル | トリックスルー | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/23) |
| マーゴ | 討伐スキル | クラッシュストライク | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/23) |
| マーゴ | 遠征スキル | デストロイ | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/23) |
| マーゴ | 遠征スキル | タクティクス | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/23) |
| マーゴ | 遠征スキル | トリックテクニック | 120% | 200% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/23) |
| マーゴ | 専用装備スキル | アンブッシュ | 25% | 45% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/margot/) |
| マーゴ | 専用装備スキル | デスマッチ | 防衛部隊殺傷力+5% | 防衛部隊殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/margot/) |
| ローザ | 討伐スキル | センター・アテンション | 3% / 3秒 | 7% / 5秒 | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/24) |
| ローザ | 討伐スキル | ファン・ダンス | 220% | 300% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/24) |
| ローザ | 討伐スキル | マインド・シャッター | 1% / 40% | 3% / 60% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/24) |
| ローザ | 遠征スキル | ノイズ・タイム | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/24) |
| ローザ | 遠征スキル | チャーム・ダンス | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/24) |
| ローザ | 遠征スキル | ゴールデン・リズム | 6% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/24) |
| ローザ | 専用装備スキル | オールナイト・フェスタ | 5% | 15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/rosa/) |
| ローザ | 専用装備スキル | インスパイア・ダンス | 集結部隊殺傷力+5% | 集結部隊殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/rosa/) |
| 龍飛 | 討伐スキル | 聖なる玉湯 | 80% | 120% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/26) |
| 龍飛 | 討伐スキル | 雲散霧消 | 20% | 60% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/26) |
| 龍飛 | 討伐スキル | 圧倒する力 | 16% | 48% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/26) |
| 龍飛 | 遠征スキル | 天昇豪胆 | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/26) |
| 龍飛 | 遠征スキル | 剛筋頑健 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/26) |
| 龍飛 | 遠征スキル | 杯投烈脚 | 120% | 200% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/26) |
| 龍飛 | 専用装備スキル | 呑下三百杯 | 15% | 15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/long-fei/) |
| 龍飛 | 専用装備スキル | 虚実一対 | 防衛部隊攻撃力+15% | 防衛部隊攻撃力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/long-fei/) |
| スルード | 討伐スキル | ストームアックス | 60% | 84% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/27) |
| スルード | 討伐スキル | バーサカースロー | 50% | 70% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/27) |
| スルード | 討伐スキル | ウルフバンケット | 3% | 5% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/27) |
| スルード | 遠征スキル | ファナティック | 3% / 3% | 15% / 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/27) |
| スルード | 遠征スキル | レックレス | 20% | 100% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/27) |
| スルード | 遠征スキル | アンセスター | 5% / 5% | 25% / 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/27) |
| スルード | 専用装備スキル | レイジアックス | 25% | 35% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/thrud/) |
| スルード | 専用装備スキル | ウルフキッス | 集結部隊殺傷力+5% | 集結部隊殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/thrud/) |
| ビビアン | 討伐スキル | ゴールデンショット | 180% | 252% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/28) |
| ビビアン | 討伐スキル | グッドラック | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/28) |
| ビビアン | 討伐スキル | ゴールドラッシュ | 35% | 49% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/28) |
| ビビアン | 遠征スキル | アウェイティング | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/28) |
| ビビアン | 遠征スキル | バラージショット | 20% / 5% | 100% / 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/28) |
| ビビアン | 遠征スキル | グリードトラップ | 12% | 60% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/28) |
| ビビアン | 専用装備スキル | ロイヤルシューター | 50% | 70% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/vivian/) |
| ビビアン | 専用装備スキル | フルバウンティ | 防衛部隊防御力+5% | 防衛部隊防御力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/vivian/) |
| トリトン | 討伐スキル | 潮汐の意思 | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/29) |
| トリトン | 討伐スキル | 諸王の怒り | 8% / 16% | 24% / 48% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/29) |
| トリトン | 討伐スキル | 必殺の一撃 | 20% | 28% | 要注意：出典内で数値表と説明文が不一致 | [英雄ページ](https://altema.jp/kingshot/chara/29) |
| トリトン | 遠征スキル | 律令の力 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/29) |
| トリトン | 遠征スキル | 戦争の力 | 6% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/29) |
| トリトン | 遠征スキル | 誓約の力 | 4% / 6% | 20% / 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/29) |
| トリトン | 専用装備スキル | クリスタル改造 | 10% | 30% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/triton/) |
| トリトン | 専用装備スキル | 虚実一対 | 防衛部隊防御力+5% | 防衛部隊防御力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/triton/) |
| ソフィア | 討伐スキル | マリオネット | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/30) |
| ソフィア | 討伐スキル | ペイン・マーク | 50% / 2% | 70% / 6% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/30) |
| ソフィア | 討伐スキル | マーク・ウィップ | 8% / 4% | 24% / 12% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/30) |
| ソフィア | 遠征スキル | コントラクト・バインド | 8% | 40% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/30) |
| ソフィア | 遠征スキル | パニック・ダメージ | 40% | 200% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/30) |
| ソフィア | 遠征スキル | パニック・ジエンド | 15% | 75% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/30) |
| ソフィア | 専用装備スキル | オーバーマインド・アイ | 2% | 8% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/sophia/) |
| ソフィア | 専用装備スキル | ダークナイトクイーン | 防衛部隊殺傷力+5% | 防衛部隊殺傷力+15% | 前回監査の外部資料照合記録あり | [専用装備資料](https://ks-toolkit.com/data/heroes/sophia/) |
| ヤン | 討伐スキル | メガスロー | 100% | 140% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/31) |
| ヤン | 討伐スキル | チェーンショット | 15% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/31) |
| ヤン | 討伐スキル | ヘッドショット | 3% | 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/31) |
| ヤン | 遠征スキル | アバランチ | 20% | 100% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/31) |
| ヤン | 遠征スキル | アイスゾーン | 20% | 100% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/31) |
| ヤン | 遠征スキル | アンブッシュ | 8% | 40% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/31) |
| ヤン | 専用装備スキル | ラピッドファイア | ダメージ40%、護衛対象撃破率40% | ダメージ56%、護衛対象撃破率100% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/yang) |
| ヤン | 専用装備スキル | アタックディフェンス | 集結部隊の殺傷力+5% | 集結部隊の殺傷力+15% | 今回の外部資料で再照合済み | [専用装備資料](https://www.kingshotcommand.com/hero-widgets/yang) |
| クイン | 討伐スキル | ヘッドショット | 400% | 560% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/5) |
| クイン | 討伐スキル | クイックショット | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/5) |
| クイン | 討伐スキル | 適者生存 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/5) |
| クイン | 遠征スキル | 危険予知 | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/5) |
| クイン | 遠征スキル | 弱点射撃 | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/5) |
| ハワード | 討伐スキル | 盾インパクト | 200% | 280% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/6) |
| ハワード | 討伐スキル | 盾の壁 | 5% | 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/6) |
| ハワード | 討伐スキル | 盾ブロック | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/6) |
| ハワード | 遠征スキル | プロテクト | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/6) |
| ハワード | 遠征スキル | 弱体化打撃 | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/6) |
| ダイアナ | 討伐スキル | 爆裂矢 | 210%, 70% | 290%, 98% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/7) |
| ダイアナ | 討伐スキル | 射手の才 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/7) |
| ダイアナ | 討伐スキル | 必殺 | 7% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/7) |
| ダイアナ | 遠征スキル | 強靭ボディ | 10% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/7) |
| ダイアナ | 遠征スキル | 迅速行動 | 20% | 100% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/7) |
| チェンコ | 討伐スキル | 機関銃掃射 | 55% | 75% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/8) |
| チェンコ | 討伐スキル | 防具改造 | 25% | 70% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/8) |
| チェンコ | 討伐スキル | 武器改造 | 8% | 24% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/8) |
| チェンコ | 遠征スキル | 完全武装 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/8) |
| チェンコ | 遠征スキル | アーマー | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/8) |
| ゴードン | 討伐スキル | バーベキュー | 200%, 5% | 280%, 7% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/9) |
| ゴードン | 討伐スキル | 嵐の厨房 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/9) |
| ゴードン | 討伐スキル | 非常食 | 50% | 70% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/9) |
| ゴードン | 遠征スキル | 幸せグルメ | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/9) |
| ゴードン | 遠征スキル | 暴言 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/9) |
| オリーブ | 討伐スキル | 矢の雨 | 180% | 252% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/10) |
| オリーブ | 討伐スキル | マーク | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/10) |
| オリーブ | 遠征スキル | 栽培専門家 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/10) |
| オリーブ | 遠征スキル | 食糧調達 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/10) |
| エドウィン | 討伐スキル | 自家製爆弾 | 140% | 196% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/11) |
| エドウィン | 討伐スキル | 高威力爆弾 | 10%, 0.5秒 | 20%, 1.5秒 | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/11) |
| エドウィン | 遠征スキル | 発破技士 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/11) |
| エドウィン | 遠征スキル | 巨石採掘 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/11) |
| スミス | 討伐スキル | 火炎槌 | 200% | 280% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/12) |
| スミス | 討伐スキル | 防具強化 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/12) |
| スミス | 遠征スキル | 善は急げ | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/12) |
| スミス | 遠征スキル | 鍛冶職人 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/12) |
| フォルスト | 討伐スキル | 斧旋風 | 80% | 110% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/13) |
| フォルスト | 討伐スキル | 鋭刃 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/13) |
| フォルスト | 遠征スキル | 一子相伝 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/13) |
| フォルスト | 遠征スキル | 伐採名人 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/13) |
| ファハド | 討伐スキル | サンドストーム | 1% | 5% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/20) |
| ファハド | 討伐スキル | ハヤブサの導き | 15% | 35% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/20) |
| ファハド | 討伐スキル | 砂の将軍 | 10% | 30% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/20) |
| ファハド | 遠征スキル | サンドシェード | 4% | 20% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/20) |
| ファハド | 遠征スキル | 先行者 | 20% | 100% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/20) |
| あまね | 討伐スキル | 桜花爛漫 | 1.5%, 2.5% | 3.5%, 4.5% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/22) |
| あまね | 討伐スキル | 破魔矢 | 150% | 210% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/22) |
| あまね | 討伐スキル | 神楽 | 1% | 5% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/22) |
| あまね | 遠征スキル | 三布の陣 | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/22) |
| あまね | 遠征スキル | 破魔の祈り | 10% | 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/22) |
| インウー | 討伐スキル | 散華 | 125%, 150% | 175%, 210% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/21) |
| インウー | 討伐スキル | 飛燕 | 100%, 30% | 140%, 50% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/21) |
| インウー | 討伐スキル | 双剣 | 8% | 24% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/21) |
| インウー | 遠征スキル | 戦の構え | 5% | 25% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/21) |
| インウー | 遠征スキル | 多聞 | 3% | 15% | 今回未再照合 | [英雄ページ](https://altema.jp/kingshot/chara/21) |

## 要注意項目

- **トリトン「必殺の一撃」**：アルテマの数値表は初期20%・最大28%だが、初期値/最大値の双方の効果説明は通常攻撃毎に攻撃力×20%のダメージと記載。数値表の28%が何を表すかは資料上不明瞭。現時点では変更せず、実機確認候補にする。出典：[アルテマ](https://altema.jp/kingshot/chara/29)

## 今回再照合した英雄ページ

- アルカ：[アルテマ](https://altema.jp/kingshot/chara/25)、専用装備は[Kingshot Wiki](https://kingshotwiki.com/ja/heroes/alcar-ja/)
- アマデウス：[アルテマ](https://altema.jp/kingshot/chara/1)
- エリック：[アルテマ](https://altema.jp/kingshot/chara/17)
- ペーラ：[アルテマ](https://altema.jp/kingshot/chara/18)
- ディエゴ：[アルテマ](https://altema.jp/kingshot/chara/35)、専用装備は[Alliance Command](https://www.kingshotcommand.com/hero-widgets/diego)

## 専用装備の追加資料

- リズ：[Alliance Command](https://www.kingshotcommand.com/hero-widgets/liz)
- ルナ：[Alliance Command](https://www.kingshotcommand.com/hero-widgets/luna)
- サロ：[Kingshot Wiki](https://kingshotwiki.com/ja/heroes/kingshot_wiki_hero_name_50017_kingshot_end-3/)
- マリン：[Alliance Command](https://www.kingshotcommand.com/hero-widgets/marlin)
- イェーガー：[Alliance Command](https://www.kingshotcommand.com/hero-widgets/jaeger)
- ヤン：[Alliance Command](https://www.kingshotcommand.com/hero-widgets/yang)
- 前回監査のKS-Toolkit資料：Amadeus / Eric / Helga / Jabel / Zoe / Hilde / Petra / Rosa / Margot / Vivian / Long Fei / Thrud / Sophia / Triton / Charles / Ava / Wee & Woo。各行のリンクを参照。
