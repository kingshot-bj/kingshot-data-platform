# EagleEye 日本語英雄スキル網羅監査

更新日: 2026-10-13（全世代一括調査更新）  
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
| ゾーイ | SSR/第2世代 | 一部登録 | https://altema.jp/kingshot/dai2sedai |
| ヒルデ | SSR/第2世代 | 一部登録 | https://altema.jp/kingshot/dai2sedai |
| マリン | SSR/第2世代 | 一部登録 | https://altema.jp/kingshot/dai2sedai |
| エリック | SSR/第3世代 | 済 | https://altema.jp/kingshot/chara/17 |
| ペーラ | SSR/第3世代 | 済 | https://altema.jp/kingshot/chara/18 |
| イェーガー | SSR/第3世代 | 一部登録 | https://altema.jp/kingshot/dai3sedai |
| アルカ | SSR/第4世代 | 済 | https://altema.jp/kingshot/chara/25 |
| マーゴ | SSR/第4世代 | 一部登録 | https://altema.jp/kingshot/dai4sedai |
| ローザ | SSR/第4世代 | 一部登録 | https://altema.jp/kingshot/dai4sedai |
| 龍飛 | SSR/第5世代 | 一部登録 | https://altema.jp/kingshot/dai5sedai |
| スルード | SSR/第5世代 | 一部登録 | https://altema.jp/kingshot/dai5sedai |
| ビビアン | SSR/第5世代 | 一部登録 | https://altema.jp/kingshot/dai5sedai |
| トリトン | SSR/第6世代 | 一部登録 | https://altema.jp/kingshot/dai6sedai |
| ソフィア | SSR/第6世代 | 一部登録 | https://altema.jp/kingshot/dai6sedai |
| ヤン | SSR/第6世代 | 一部登録 | https://altema.jp/kingshot/dai6sedai |
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


## 2026-10-13 一括調査の追加結果

- `src/hero-skills-ja.js` は25英雄分の辞典データを持つ。
- 第2世代（ゾーイ、ヒルデ、マリン）、第3世代（イェーガー）、第4世代（マーゴ、ローザ）、第5世代（龍飛、スルード、ビビアン）、第6世代（トリトン、ソフィア、ヤン）を追加した。
- 追加項目は世代別の日本語攻略ページに明記された名前・説明・数値のみ。初期値の記載がないものは「未掲載」とし、最大値も確認できない場合は「未確認」等を使用。
- 第7・第8世代の既存登録分は、個別ページの完全性をまだ再監査していない。
- SR・R英雄12名は未登録のまま。個別ページから情報を確認して収録する必要がある。
- 現時点で「全英雄・全スキル網羅」とは判定しない。攻略サイトに未掲載の値やゲーム内表記はユーザーのゲーム画面で確認する対象として残す。
