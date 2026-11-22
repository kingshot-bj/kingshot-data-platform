# EagleEye 日本語英雄スキル辞典 — 調査・実装メモ

作成日: 2026-10-13  
対象: `kingshot-bj/kingshot-data-platform` / `main`

## 実装

- データ定義: `src/hero-skills-ja.js`
- 表示: `src/index.js` のプレイヤー比較ページ下部「日本語英雄スキル辞典（確認済み分）」
- 登録済み英雄: アルカ、アマデウス、エリック、ペーラ、ディエゴ、リズ、ルナ、チャールズ、アイヴァ、レン&ロン（計10英雄）
- 登録項目: 討伐/遠征の区分、スキル名、出典で確認できた効果・倍率、出典URL、確認日
- スマートフォン幅では辞典内テーブルを横スクロール可能にした
- D1のスキーマ・読み取り処理は変更していない
- MightPulseの `skill_levels[].id` と日本語スキル名の対応は未確認。推測による紐付けは禁止。

## 日本語出典

- アルカ: https://altema.jp/kingshot/chara/25
- アマデウス: https://altema.jp/kingshot/chara/1
- エリック: https://altema.jp/kingshot/chara/17
- ペーラ: https://altema.jp/kingshot/chara/18
- 第7世代（チャールズ、アイヴァ、レン&ロン）: https://altema.jp/kingshot/dai7sedai
- 第8世代（ディエゴ、リズ、ルナ）: https://altema.jp/kingshot/dai8sedai
- 第1世代一覧: https://altema.jp/kingshot/dai1sedai
- 第2世代一覧: https://altema.jp/kingshot/dai2sedai
- 第3世代一覧: https://altema.jp/kingshot/dai3sedai
- 第4世代一覧: https://altema.jp/kingshot/dai4sedai
- 第5世代一覧: https://altema.jp/kingshot/dai5sedai
- 第6世代一覧: https://altema.jp/kingshot/dai6sedai
- 第7世代一覧: https://altema.jp/kingshot/dai7sedai

## 調査で確認したこと

- アルテマの世代別ページは、討伐スキル・遠征スキル・専用装備スキルの日本語名と効果を掲載している。
- 世代別ページで確認できるのは主に掲載レベルの効果。初期値・レベル別の全段階が載っていない項目は、初期値を推測せず未登録にする。
- 第7世代ページではチャールズ、アイヴァ、レン&ロンの討伐・遠征スキルを確認して登録した。
- 第8世代ページではディエゴ、リズ、ルナの討伐・遠征スキルを確認して登録した。
- ページ上の記載を転記したもので、ゲーム内画面との完全一致を独立検証したわけではない。

## 未完了・次の調査対象

1. 第1〜第8世代の未収録英雄を追加（世代一覧で確認した英雄: 第1世代 アマデウス/ヘルガ/ジェベル/サロ等、第2世代ゾーイ/ヒルデ等、第3世代イェーガー、第4世代マーゴ/ローザ、第5〜7世代、第8世代の残り）。
2. SR/R英雄のスキルを追加。
3. 各英雄個別ページで初期値・最大値・レベルごとの変化を調査。
4. ゲーム内日本語表記と出典の差異を照合。
5. MightPulseのスキルIDとの対応を、実データ・ゲーム内画面等で確定。
6. Workerビルド、Cloudflareデプロイ、本番・iPhone実機表示確認。

## 検証の境界

辞典モジュールとページ側の静的構文検査は別途実施する。GitHubへの反映は行うが、Cloudflareへのデプロイや実機動作確認を行ったとは扱わない。
