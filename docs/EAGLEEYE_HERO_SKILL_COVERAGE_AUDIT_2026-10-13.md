# EagleEye 日本語英雄スキル網羅監査

更新日: 2026-10-13（更新）  
対象: kingshot-bj/kingshot-data-platform / main

## 運用ルール（必須）

- 日本語ゲーム内表記を優先する。
- 外部ページに明記された名前・説明・数値だけを登録する。
- 不明なスキル名、説明、倍率、スキルID対応は推測で補完しない。
- 見つからない項目は「ゲーム内確認待ち」として明示し、ユーザーに確認依頼する。
- 攻略サイト由来の情報と、ゲーム内で直接確認した情報を区別する。
- MightPulseの数値skill IDと日本語名の対応は、根拠が取れるまで未確定のままにする。

## 母集団（アルテマの英雄一覧に基づく暫定監査対象）

出典: https://altema.jp/kingshot/charalist  
SSR一覧: https://altema.jp/kingshot/ssreiyuu  
SR一覧: https://altema.jp/kingshot/sreiyuu  
R一覧: https://altema.jp/kingshot/reiyuu

| 英雄 | レアリティ/世代 | 辞典登録 | 出典/メモ |
|---|---|---|---|
| アマデウス | SSR/第1世代 | 済 | https://altema.jp/kingshot/chara/1 |
| ヘルガ | SSR/第1世代 | 済 | https://altema.jp/kingshot/chara/2 |
| サロ | SSR/第1世代 | 済 | https://altema.jp/kingshot/chara/3 |
| ジェベル | SSR/第1世代 | 済 | https://altema.jp/kingshot/chara/4 |
| ゾーイ | SSR/第2世代 | 未 | 個別ページURL要確認 |
| ヒルデ | SSR/第2世代 | 未 | 個別ページURL要確認 |
| マリン | SSR/第2世代 | 未 | https://altema.jp/kingshot/chara/15 |
| エリック | SSR/第3世代 | 済 | https://altema.jp/kingshot/chara/17 |
| ペーラ | SSR/第3世代 | 済 | https://altema.jp/kingshot/chara/18 |
| イェーガー | SSR/第3世代 | 未 | 個別ページURL要確認 |
| アルカ | SSR/第4世代 | 済 | https://altema.jp/kingshot/chara/25 |
| マーゴ | SSR/第4世代 | 未 | 個別ページURL要確認 |
| ローザ | SSR/第4世代 | 未 | 個別ページURL要確認 |
| 龍飛 | SSR/第5世代 | 未 | 個別ページURL要確認 |
| スルード | SSR/第5世代 | 未 | 個別ページURL要確認 |
| ビビアン | SSR/第5世代 | 未 | 個別ページURL要確認 |
| トリトン | SSR/第6世代 | 未 | 個別ページURL要確認 |
| ソフィア | SSR/第6世代 | 未 | 個別ページURL要確認 |
| ヤン | SSR/第6世代 | 未 | 個別ページURL要確認 |
| チャールズ | SSR/第7世代 | 済 | https://altema.jp/kingshot/chara/32 |
| アイヴァ | SSR/第7世代 | 済 | 個別ページで登録内容の再照合が必要 |
| レン&ロン | SSR/第7世代 | 済 | 個別ページで登録内容の再照合が必要 |
| ディエゴ | SSR/第8世代 | 済 | 世代ページから収録 |
| リズ | SSR/第8世代 | 済 | 世代ページから収録 |
| ルナ | SSR/第8世代 | 済 | 世代ページから収録 |
| クイン | SR | 未 | 個別ページURL要確認 |
| ハワード | SR | 未 | 個別ページURL要確認 |
| ダイアナ | SR | 未 | 個別ページURL要確認 |
| チェンコ | SR | 未 | https://altema.jp/kingshot/chara/8 |
| ゴードン | SR | 未 | 個別ページURL要確認 |
| あまね | SR | 未 | 個別ページURL要確認 |
| インウー | SR | 未 | 個別ページURL要確認 |
| ファハド | SR | 未 | 個別ページURL要確認 |
| オリーブ | R | 未 | 個別ページURL要確認 |
| エドウィン | R | 未 | 個別ページURL要確認 |
| スミス | R | 未 | https://altema.jp/kingshot/chara/12 |
| フォルスト | R | 未 | 個別ページURL要確認 |

## 監査ステータスの定義

- 済: 辞典データが一部以上存在する。英雄の全スキル網羅を意味しない。
- 未: 日本語スキル辞典への登録がまだない。
- URL要確認: 個別記事の実URLを確認してから利用する。URLを推測してアクセスしない。

## 次の作業順

1. 未登録のSSRを世代順に調査し、討伐・遠征・専用装備の項目を確認する。
2. SR・Rを個別ページで調査する。
3. 各英雄の3種スキル（英雄により数が異なる場合はページ記載に従う）の初期値・最大値・説明を照合する。
4. ソースに値がなければ「未確認」と記録し、補完しない。
5. MightPulse ID対応は別監査。英雄名とIDの対応を推測で作らない。
6. 辞典の各英雄を「全項目確認済み / 一部確認 / ゲーム内確認待ち」に分ける。

## 確認できた根拠の例

- 第1世代ページにはアマデウス、ヘルガ、ジェベル、サロのスキル名・効果・初期値・最大値が掲載されている。
- ヘルガ: https://altema.jp/kingshot/chara/2
- ジェベル: https://altema.jp/kingshot/chara/4
- サロ: https://altema.jp/kingshot/chara/3
- SSR一覧: https://altema.jp/kingshot/ssreiyuu
- SR一覧: https://altema.jp/kingshot/sreiyuu
- R一覧: https://altema.jp/kingshot/reiyuu

注意: 39英雄は2026-10-13時点で参照したアルテマ一覧の暫定母集団。これをゲーム内全英雄の絶対数とは断定しない。
