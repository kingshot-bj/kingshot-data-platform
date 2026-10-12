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
| クイン | SR | 済 | https://altema.jp/kingshot/chara/5 |
| ハワード | SR | 済 | https://altema.jp/kingshot/chara/6 |
| ダイアナ | SR | 済 | https://altema.jp/kingshot/chara/7 |
| チェンコ | SR | 済 | https://altema.jp/kingshot/chara/8 |
| ゴードン | SR | 済 | https://altema.jp/kingshot/chara/9 |
| あまね | SR | 済 | https://altema.jp/kingshot/chara/22 |
| インウー | SR | 済 | https://altema.jp/kingshot/chara/21 |
| ファハド | SR | 済 | https://altema.jp/kingshot/chara/20 |
| オリーブ | R | 済 | https://altema.jp/kingshot/chara/10 |
| エドウィン | R | 済 | https://altema.jp/kingshot/chara/11 |
| スミス | R | 済 | https://altema.jp/kingshot/chara/12 |
| フォルスト | R | 済 | https://altema.jp/kingshot/chara/13 |

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

注意: 37英雄は2026-10-13時点で参照したアルテマ一覧の暫定母集団。これをゲーム内全英雄の絶対数とは断定しない。


## 2026-10-13 一括調査の追加結果

- `src/hero-skills-ja.js` は37英雄分の辞典データを持つ（暫定母集団37英雄を全件カバー）。
- 第2世代（ゾーイ、ヒルデ、マリン）、第3世代（イェーガー）、第4世代（マーゴ、ローザ）、第5世代（龍飛、スルード、ビビアン）、第6世代（トリトン、ソフィア、ヤン）を追加した。
- 追加項目は世代別の日本語攻略ページに明記された名前・説明・数値のみ。初期値の記載がないものは「未掲載」とし、最大値も確認できない場合は「未確認」等を使用。
- 第7・第8世代の既存登録分は、個別ページの完全性をまだ再監査していない。
- SR・R英雄12名の辞典エントリを追加済み。個別ページに掲載されたスキルを収録したが、ゲーム内表記との一致・専用装備項目・全項目の完全性は別途再監査が必要。
- 現時点で「全英雄・全スキル網羅」とは判定しない。攻略サイトに未掲載の値やゲーム内表記はユーザーのゲーム画面で確認する対象として残す。


## 2026-10-13 SR/R個別ページ追加監査

- SR 8名（クイン、ハワード、ダイアナ、チェンコ、ゴードン、あまね、インウー、ファハド）とR 4名（オリーブ、エドウィン、スミス、フォルスト）の辞典エントリを追加した。
- 参照元はアルテマ個別ページ。掲載されている初期値・最大値・説明を登録した。専用装備スキルが個別ページにあるかどうか、全項目の取りこぼしについては引き続き監査する。
- 辞典の登録英雄数は37。これは現在のアルテマ一覧の暫定母集団（SSR 25、SR 8、R 4）と一致するが、ゲーム内全英雄の絶対数や完全性を保証するものではない。
- MightPulse skill IDと日本語スキル名の対応は未確定。ID対応を推測で設定していない。


## 2026-10-13 数値欄の再照合

参照した世代別ページ:  
- 第3世代: https://altema.jp/kingshot/dai3sedai
- 第4世代: https://altema.jp/kingshot/dai4sedai
- 第5世代: https://altema.jp/kingshot/dai5sedai
- 第6世代: https://altema.jp/kingshot/dai6sedai

- 世代ページには最大レベル時の効果倍率・確率などが明記されているものがあるため、辞典の「未掲載」を一部、出典に明記された値へ修正した。
- 初期値は世代ページで確認できない場合、「未掲載」のまま保持した。
- 2026-10-13時点の静的集計: 37英雄、244スキル行。初期値が未掲載/未確認の行97、最大値が未掲載/未確認の行5、初期値と最大値の両方が具体的に登録されている行146（59.8%）。
- この59.8%は「初期値と最大値の両方に具体値があるスキル行」の比率であり、正確性・説明の完全性・ゲーム内表記一致率を表すものではない。
- 重要: 初期値が未掲載の行は、出典に初期値がないため未確認としている。最大値が埋まっていても全レベルの成長表を収録したことにはならない。
- ペーラの倍率・スキル名など、個別ページと世代一覧ページで異なる表記がある項目は別途照合を続け、ユーザー確認が必要な差分を残す。
