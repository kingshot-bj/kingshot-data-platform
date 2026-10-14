# EagleEye プレイヤー比較 実装引き継ぎ

更新日: 2026-10-14
対象リポジトリ: `kingshot-bj/kingshot-data-platform`
ベース: `main`（調査時点のSHA `2c9054e3db770f8c5e54033966d1a5cc998d90d2`）
作業ブランチ: `feat/player-compare-mystic-charts-2026-10-13`
PR: [#34 Implement saved ranking data in player comparison](https://github.com/kingshot-bj/kingshot-data-platform/pull/34)
進捗: **30%**（全体を調査・実装・テスト・マージ・本番反映で100%とし、10%ごとに報告）

## 1. ユーザーの確定要件

- プレイヤー比較ページは、旧「戦力バランス」中心の見せ方をやめ、秘境の試練を主役にする。
- 上段に大きな円形チャート「秘境の試練」。
- その下に6エリアの円形チャートを配置。スマホは2列×3段、PCは3列。
  1. 闘技場 `coliseum`
  2. 生命の森 `forest_of_life`
  3. 水晶鉱山 `crystal_cave`
  4. 知識の枢軸 `knowledge_nexus`
  5. 溶岩要塞 `molten_fort`
  6. 輝光の塔 `radiant_spire`
- 2〜4人を比較できること。
- 円弧、カウントアップ、発光、火花などの演出。 `prefers-reduced-motion` を尊重。
- 実データのみ。未取得値を推測・補完しない。
- score / rank / value_label（ステージ進行表示）を混同しない。
- 既存の認証・権限・API Pool・サービス使用量記録を維持。
- D1 reads/writes を増やしすぎない。広範囲の `ranking_snapshots` 読み取りを復活させない。
- ユーザーにPreview確認を求める運用にしない。最終的にはmainへマージし、本番デプロイと実動作を確認する。

## 2. 実データで確認済みのこと

ユーザー提供の MightPulse probe:
- request ID: `cc075a93-662d-4460-9e1a-f9a89134e7d5`
- governor ID: `238401393`, uid `59628755`, kingdom `1524`
- cached_at: `2026-10-13T14:35:43Z`
- `ranks.mystic_trial = 901`, `mystic_rank = 204`
- `ranks.leaderboards` に総合＋6エリアの数値 `value` がある。
- 各エリアに `value_label`（例 `20-4`）もある。これはステージ進行ラベルでスコアとは別。
- サンプルでは6エリアの `kingdom_rank` はすべて null、`kingdom_rank_label` は `100+`。nullを順位数値に変換しない。

保存経路:
- `src/ranking-store.js` は `mystic_trial`, `mystic_rank`, `leaderboards_json` を `player_rank_snapshots` に保存。
- `leaderboards_json` は `ranks.leaderboards` の配列を保存する。
- `handlePlayerRefresh` は `ranks` を含むデータを既存保存処理へ渡す。
- 問題の中心は比較APIがランキングを返していなかったこと。

## 3. 今回の変更（作業ブランチ）

`src/index.js` に変更:
- `handlePlayerCompareApi` が、各 governor ID について保存済みランキング履歴を最新1件だけ要求する処理を追加。
- `ranks_core` / `ranks_leaderboards` の既存権限設定を確認し、見えないカテゴリを返さない構造。
- `leaderboards_json` を parse して `rankings.leaderboards` として返す。
- 保存済みスナップショットの取得可否を service usage metadata に記録。
- 比較円形チャートの描画関数を改修し、2〜4人分のスコアをプレイヤー別の色で描画。
- 順位フィールドに `kingdom_rank` を優先して含め、`value_label` を補助表示。
- 総合スコアの `mystic_rank` を順位としてチャートへ渡す修正を追加中。

関連PR:
- PR #34: https://github.com/kingshot-bj/kingshot-data-platform/pull/34
- PR #34 は作成時点で open / unmerged。GitHub APIの `mergeable=false` が返ったため、マージ前に競合・差分を確認する。
- 現時点で本番デプロイは行っていない。
- 既存の設計書PR #33（doc only）も別途存在する。PR #33を実装済みと扱わない。

## 4. 重要な注意点・要確認

1. **`getPlayerRankHistory` の実際の関数シグネチャと戻り値を必ず再確認する。** 現在の呼び出しは `getPlayerRankHistory(env.DB,{governorId:id,limit:1,archiveBucket:env.ARCHIVE,historyMode:env.HISTORY_STORAGE_MODE})`。期待どおりの引数・戻り値でなければ修正が必要。誤ったシグネチャのままマージしない。
2. `player_rank_snapshots` のSQLとインデックスを確認。対象IDで最新1件を読む形にし、全件スキャンをしない。
3. 最新スナップショットがない場合、`rankingsExpected` と自動更新条件の整合性を確認。既存UIの `rankingsExpected` / `rank_refresh_expected` / `rank_snapshot_saved` 判定を再監査。
4. チャートが2人だけでなく3〜4人でも全員表示されるか確認。比較差分の意味・円弧の各色・中央表示が4人比較で正しいこと。
5. `value_label` は表示用。スコアに代入しない。 `kingdom_rank_label: "100+"` も数値順位へ変換しない。
6. 取得時刻がある場合は鮮度表示を正しくする。時刻がない場合に推測時刻を作らない。
7. HTMLを文字列連結しているファイルなので、埋め込みJSのエスケープ、構文エラー、モバイル表示を確認。
8. 既存の比較ページの他の機能（項目選択、ヒーロー/装備情報、再読み込み、最新データで比較、権限表示）を壊さない。
9. 可能ならリポジトリのテスト・lint・GitHub Actionsを実行。PR作成時点ではワークフロー実行を確認できていない。
10. マージ前に最新mainとの差分・競合を確認。成功したCIとコードレビュー相当の確認なしに「完成」と言わない。

## 5. 次に行う順序

1. まず `getPlayerRankHistory` の定義と `player_rank_snapshots` query / index を確認し、今回のAPI呼び出しを正しくする。
2. `mystic_trial` の `mystic_rank` を順位として返す正規化が反映されているか確認。
3. 比較チャートの2〜4人表示、missing / null / value_label、reduced-motionを確認。
4. `src/index.js` のJS構文・HTML生成・APIレスポンスをテスト。
5. 追加のバグを直し、10%刻みで進捗を報告（次は40%）。
6. PR #34の競合を解消し、CI/差分を確認してmainへマージ。
7. main反映後にCloudflare Workersへデプロイし、HTTP/API/実機表示を確認。成功するまでデプロイ済みと報告しない。

## 6. 次スレ開始時の最初の作業

この文書を読み、PR #34の最新状態とブランチ先端を確認する。その後、まず `getPlayerRankHistory` の関数定義を確認して、ランキングAPIの呼び出しを確実に正す。コードを確認せず、推測でマージやデプロイをしない。
