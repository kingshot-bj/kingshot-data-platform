# EagleEye 本体 引き継ぎ — プレイヤー比較・秘境の試練ランキング検証（2026-10-14）

## 1. 次スレの目的

プレイヤー比較機能の続きとして、秘境の試練6ランキングのAPIデータ構造を検証し、数値の見せ方・差分表示が誤解を招かないように修正する。調査だけで終わらせず、確認できた事実に基づく修正・テストまで進める。

- Repository: `kingshot-bj/kingshot-data-platform`
- Production: https://kingshot-data-platform.black-jack-kingshot.workers.dev
- Current work branch: `fix/player-compare-rich-refresh-2026-10-14`
- Main source: `src/index.js`
- Related files: `src/player-compare.js`, `src/player-compare-enhancements.js`
- Page: `/player/compare`
- Compare API: `/api/player-compare`
- Player refresh API: `/api/player/refresh`

## 2. Current state

Initial static audit is complete. No new code changes, commit, PR, or production deployment were completed for this investigation in the previous thread. The work branch exists; re-check the latest `main` and branch heads before editing.

The current `main` source already uses the rich include list `base,heroes,ranks,gov_gear` for the manual refresh path. The suspected mismatch where manual refresh only requested `base,ranks` was not confirmed; do not duplicate or regress this existing behavior.

## 3. Confirmed MightPulse API fields

The existing MightPulse Probe can return `ranks.leaderboards[]` entries with:
- `name`: ranking name
- `value`: numeric value
- `value_label`: display label (observed in actual response)
- `kingdom_rank`: rank within the kingdom
- `rank_type`: ranking type identifier

One observed sample: player ID `38960201`, kingdom `240`, request include `base,ranks`. The response was HTTP 200. The cache metadata indicated it was cached, so treat it as a sample rather than a live-current guarantee.

| Mystic Trial area | value | value_label | kingdom_rank |
|---|---:|---|---:|
| Coliseum | 10,942 | 95-2 | 1 |
| Forest of Life | 20,477 | 48-7 | 1 |
| Crystal Cave | 30,510 | 51-10 | 1 |
| Knowledge Nexus | 40,517 | 52-7 | 1 |
| Molten Fort | 50,524 | 53-4 | 1 |
| Radiant Spire | 61,153 | 116-3 | 1 |

Observed response SHA256: `8ad5f2c066b67e258c11dbe4afec542d61f866dfa5d7c27d4c96de5b33e17d97`.

The labels look like stage formats (for example, `95-2`), but the mapping from `value` to `value_label` is not established. One player's data cannot establish the conversion formula.

## 4. Current comparison UI concern

The current comparison page uses raw `value` for score presentation and player-to-player differences in the Mystic Trial comparison display. Do not claim these differences directly represent a difference in combat strength until the semantics of `value` are verified.

The previous investigation found that selecting the highest player in the current comparison as 100% makes radar geometry depend on which players are selected. The existing enhancement module has already removed that misleading normalization and uses raw per-board score cards/table instead. Preserve that improvement.

Do not invent fixed benchmarks or subtract presumed category offsets (10,000 / 20,000 / etc.) without authoritative confirmation. Do not add values across different areas. `kingdom_rank` is a rank, not a score; do not convert it into a strength percentage. Kingdom ranks from different kingdoms are not directly comparable.

## 5. Area descriptions currently used as working classification

| Area | Main development category (working classification) |
|---|---|
| Coliseum | Heroes, hero gear, exclusive widgets |
| Forest of Life | Pets and pet skills |
| Crystal Cave | Governor Charms |
| Knowledge Nexus | Academy and War Academy research |
| Molten Fort | Governor Gear |
| Radiant Spire | Combined assessment across multiple progression systems |

This is a guide-based classification, not confirmation of MightPulse's exact scoring formula.

## 6. Next actions

1. Fetch the latest `main` and work-branch heads; inspect relevant files and recent commits before making changes.
2. Use existing Probe output or already available records first. Compare multiple players from the same kingdom if such data can be accessed without requiring the user to do the work.
3. For each of the six boards, compare `name`, `value`, `value_label`, `kingdom_rank`, and `rank_type`. Separate confirmed observations from hypotheses.
4. If the conversion formula remains unverified, change the UI so it clearly distinguishes raw API value from the stage label and does not imply an unsupported strength difference. Avoid hiding useful raw data without reason.
5. Check tests and the comparison's 2–4-player paths. Preserve auth/role checks and API-pool behavior.
6. Keep D1 usage controlled. Do not restore broad `ranking_snapshots` scans or other broad historical reads.
7. Commit the implementation and tests on the work branch, open a PR, and merge/deploy only after checks and deployment status have actually been verified. Do not claim deployment based solely on a commit or merge.

## 7. Constraints and progress reporting

- Never fabricate or infer missing in-game values as facts. If the user can verify a value in-game, record it as pending confirmation rather than guessing.
- Preserve existing auth, roles, API pool, and D1 read/write constraints.
- Do the feasible investigation and code work before asking the user to test.
- Do not make Preview-based user confirmation a prerequisite.
- Report progress in 10% increments. Keep investigation, implementation, tests, PR/merge, and production deployment status distinct.
- Report only actions and checks that actually occurred.

## 8. References

- MightPulse API docs: https://api.mightpulse.com/
- Kingshot Database Mystic Trial guide: https://kingshotdata.com/events/mystic-trial/
- Kingshot Guide: https://kingshotguide.org/guide/kingshot-mystical-trial
- Kingshot Almanach: https://kingshotalmanach.com/events/mystic-trial/
- Kingshot Mastery: https://kingshotmastery.com/guides/mystic-trial
- Related investigation: `docs/EAGLEEYE_PLAYER_COMPARE_RANKING_INVESTIGATION_2026-10-13.md`
- Related design: `docs/EAGLEEYE_PLAYER_COMPARE_DESIGN_2026-10-13.md`
- Related benchmark notes: `docs/EAGLEEYE_PLAYER_COMPARE_FIXED_BENCHMARKS_2026-10-14.md`


---

## 9. 追記 — プレイヤー比較UIの目的と次の調査（2026-10-17）

### ユーザーが求めていること

秘境の試練の6コンテンツの進捗は、単なる順位やスコアではない。英雄・英雄装備、ペット、領主宝石、研究、領主装備などへの育成投資の度合いを推し量る指標として扱い、6分野の進捗パターンからプレイヤーごとの育成傾向や相対的に遅れている分野を読み取りたい。ユーザーはこの意図を何度も説明済みなので、次スレッドで同じ一般論を繰り返さないこと。

### 既出説明を繰り返さずに進めること

- 「6分野の育成プロフィールを見せる」という提案だけを再度提示しない。
- 現行UIの言い訳に終始せず、既存コードと実データを調べ、今より有用な表示方法を具体化する。
- `src/index.js` の `renderPlayerComparePage()`、`src/player-compare-enhancements.js`、既存Probe JSON / Observationを照合し、どのフィールドを現状どう描画しているかを追う。
- 6項目それぞれの `name` / `value` / `value_label` / `kingdom_rank` / `rank_type` を既存サンプルで照合する。まず保存済みデータを使い、比較のためだけの追加API呼び出しは増やさない。
- 同一コンテンツ内でステージ進捗を比較するための正しい順序・差分表現を検証する。欠損、100+、古い観測、表示ラベルと内部値の不一致も考慮する。
- 英雄装備・領主装備・ペットなどの実データと6項目の関連をどこまで同一Observationから確認できるかを調べる。進捗からの推測と、直接取得した育成データを混同しない。
- ステージ表記の内部変換式、カテゴリーオフセット、固定上限値は未確定。根拠なく変換したり、分野をまたいで足し合わせたり、総合育成スコアや割合を捏造しない。
- 調査結果は「既に確定済み」「今回新たに確認」「未確定」を分け、コードの具体的な箇所とテスト方法を添える。設計が固まる前のコード変更・デプロイは行わない。
- D1 Freeの読み取りを増やさず、既存Observationを優先する。広範囲な `ranking_snapshots` 読み取りは復活させない。

## 10. 追記 — レーダーチャートの軸別100%基準（2026-10-17）

ユーザーの重要な設計仮説：6項目の100%基準は一律に揃えるべきではない可能性が高い。各項目は異なる育成分野を評価し、到達上限・進行速度・育成コストが異なると考えられるため、全軸を同じ数値上限や同じ最大ステージに合わせると、実態を誤って見せるおそれがある。

### 次に検証すること

- まずAPIのオフセット仮説とステージ変換式を保存済みサンプルで検証する。オフセットを除いた値は、各項目内での到達ステージを表す候補であり、そのまま「育成度%」とはみなさない。
- レーダーの100%は、各項目ごとに独立した基準として設計する。候補は、ゲーム内の実際の最大到達値・固定上限が確認できればそれを使うこと。上限が存在しない／確認できない場合、100%を「最大育成」と呼ばず、十分な観測データに基づく項目別の固定基準（例：事前に固定したパーセンタイルや基準プレイヤー帯）を検討する。
- 比較対象に選んだプレイヤーの中の最大値を100%にする方式は禁止。プレイヤーを追加・削除しても同じプレイヤーのレーダー形状が変わらないこと。
- 6軸の尺度が同一の意味を持つと誤認させない。100%基準の意味を軸ごとに明示し、基準値・算出方法・更新方法を文書化する。
- 実データで裏付けるまでは、架空の上限値・育成%を表示しない。まず保存済みサンプルの値と value_label を照合し、各項目の進捗値を復元できるかテストで確認する。
## 11. 調査結果 — 秘境の試練の上限有無（2026-10-17）

### 公開資料の調査結果

- Kingshot公式告知（https://kingshot.net/game-announcements/18-a-new-journey-awaits-with-the-coming-mystic-trial）は、各ゾーンのステージ挑戦、勝利による進行、再オープン時の進捗リセットと過去ステージのRaidを説明しているが、最終ステージ番号・最大ステージ・上限値は記載していない。
- Kingshot Database（https://kingshotdata.com/events/mystic-trial/）は、各ゾーンの解放条件、育成要素、ステージ1-10クリアでRaid解放、一定地点では育成が進むまで次のステージを突破できないことを説明している。最終ステージや固定上限は記載していない。
- Kingshot Mastery（https://kingshotmastery.com/guides/mystic-trial）は、6ゾーンの役割、ステージ1-10クリア目標、育成強化による進行を説明しているが、最大ステージは明記していない。
- 公開プロフィール/APIサンプルには100を超えるステージ表記（例：Radiant Spire 116-3）が存在する。少なくとも全項目共通の低い上限を仮定する根拠はない。ただし、これだけで上限が存在しないとは断定できない。

### 結論（現時点）

公開資料からは、6項目それぞれの最終ステージ／最大値は確認できなかった。したがって「上限なし」と断言するのではなく、「公開資料では上限未確認」と扱う。ユーザーの実機観察どおり、育成や機能解放に応じて次のステージへ順次進む設計と整合する資料はあるが、無限に続くことの証明にはならない。

### レーダー設計への影響

- 各項目の100%を「ゲーム内最大」と定義するのは、最大値が確認できるまで保留する。
- 各項目を独立した軸にし、暫定的には到達ステージ／サブステージを実値で比較する。100%表示を急ぐ場合も、実際の最大値と誤認させず、項目別の固定基準（例：基準到達ライン）として明示する。
- 100%基準をプレイヤー選択に連動させない。基準は項目ごとに固定し、変更履歴を管理する。
- 次の調査では、既存Observation/Probeから確認できる最高到達値の分布を項目別に集計し、複数プレイヤー・複数王国の実データでステージ値の符号化式も検証する。観測上の最高値はゲーム上限とは区別する。D1の広範囲読み取りや追加API呼び出しは避ける。

---

## 12. 引き継ぎ追記 — 育成要素を中心にしたプレイヤー比較UI（2026-10-17）

### 作業場所・状態
- リポジトリ：`kingshot-bj/kingshot-data-platform`
- 作業ブランチ：`feat/player-compare-build-focus-2026-10-17`
- 対象ファイル：`src/player-compare-enhancements.js`
- 実装コミット：`f0341bf4081086936243529c667b447c86a69516`
- ブランチURL：https://github.com/kingshot-bj/kingshot-data-platform/tree/feat/player-compare-build-focus-2026-10-17
- GitHub Actions「MightPulse Probe checks」：成功（run ID 38983973832）。この結果だけでUIの実表示や全テストが検証済みとはみなさない。
- マージ・本番デプロイ：未実施。
- このブランチには既存PRがある可能性があり、新規PR作成時にGitHubから「既存PRあり」のエラーが返った。PR番号をまだ特定できていない。既存PRを確認してから作業すること。

### 今回追加した内容
- 既存比較カードのDOMから英雄・領主装備の値を集める育成比較セクション `buildGrowthComparison()` を追加。
- 同じ英雄名の項目をプレイヤー間で並べて表示。
- 領主装備項目も比較表にする。
- 英雄の戦力や領主装備のスコア／戦闘力は新セクションの主比較項目から除外。
- 値が見つからない場合は推測せず「データなし」と表示。
- モバイル向けテーブルCSSを追加し、既存の `.mystic-section` より前に挿入。

### 未検証・要修正の可能性
- `src/index.js` の実DOMと照合し、`.compare-player-card`、`.compare-metric`、`data-compare-label`、`.pname`、`.compare-metric strong` の実際の構造・ラベル形式を確認する。
- 現状は既存DOMに表示されているメトリクスを利用する初期実装。通常英雄装備（ヘルメット／手袋／鎧／ブーツ）の部位別比較が実データで成立するか未確認。
- 比較セクションの表示、同一英雄の照合、欠損データ、複数プレイヤー、スマホ幅を検証する。
- 既存データが非公開・未取得・対象外の状態を区別できるか確認する。非公開の装備を「装備なし」と扱わない。
- 英雄データが闘技場防衛チーム由来なら、集結主の編成・KVK集結用セットアップと誤認させない。
- 既存API取得・Observationを優先し、比較のためだけの追加API呼び出しやD1読み書きを増やさない。
- 追加処理が既存UI・Mystic Trial表示・権限チェックに影響しないか確認する。

### 次にやること（順番）
1. 作業ブランチの最新状態と既存PRを確認する。PRを重複作成しない。
2. `src/index.js` の比較カード生成処理を確認し、比較セクションが実データを正しく拾っているか検証する。
3. 通常英雄装備の保存済みデータと描画経路を追跡し、実データが利用できる場合だけ部位別比較を追加する。
4. JavaScript構文・関連テスト・2～4人比較・モバイル表示を確認する。
5. 結果に基づいて修正し、CIの実結果を記録する。確認できていない実機表示やテストを成功扱いにしない。
6. マージ・本番デプロイは検証完了後に判断する。デプロイしたと報告するのは実際の完了確認後のみ。

### 作業時のユーザー要望
- 進捗は10%刻みで報告する。
- 不要な説明書きを増やさず、比較に役立つ育成情報を見やすくする。
- 総合戦力・撃破数・大溶鉱炉レベル・VIPを比較の主役にしない。
- 同じ英雄同士を比較し、レベル・星・専用装備・通常装備など取得できる実データを使う。
- 根拠のない総合戦闘スコアや育成度を捏造しない。
