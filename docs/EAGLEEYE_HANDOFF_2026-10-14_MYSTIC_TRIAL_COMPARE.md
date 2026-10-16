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
