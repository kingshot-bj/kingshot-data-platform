# EagleEye 本体 引き継ぎ — 2026-10-09 全コード監査継続

## このMDの目的

次スレッドで、KingShot Data Platform EagleEye 本体の全コード監査を途中から継続するための引き継ぎ書。現在までの詳細な指摘は、必ず次の監査記録を参照すること。

- **監査記録／機能台帳：** [EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md](./EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md)
- リポジトリ：`kingshot-bj/kingshot-data-platform`
- 監査対象ブランチ：`main`

## 現在の状態

- **全コード監査は未完了。** 次スレでは「続き」から再開し、最初からやり直したり、完了扱いにしたりしない。
- 監査MDはGitHub `main` に更新済み。2026-10-09時点のチェックポイントを監査記録末尾に追加した。
- 直近の監査記録更新コミット：`167fbf253005a6cfe9587587215be1a6755e42fe`
- 監査記録URL：<https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md>
- 本文のコード、Migration、Workflowの修正・本番デプロイ・本番DB更新・収集ジョブや負荷テスト起動は行っていない。所見は基本的に静的監査による候補であり、本番で再現済みとは限らない。

## 監査の進め方

1. `main` の実コードを読み、ルート・ハンドラー・DB SQL・Migration・Cron/Queue・R2・UIの接続を確認する。
2. 確認できた指摘は、監査記録に「根拠／影響／確度・未確認事項／対応方針」を書いて追記する。既存項目との重複を避ける。
3. 静的に確認したこと、実行経路から推測したこと、シナリオ試算、本番で実測したことを明確に区別する。
4. 全体を一巡するまでは、アプリの修正やデプロイを始めない。全体監査完了後に重大度順の修正計画を作る。

## 次スレで最初に行うこと

### 1. Workerの全ルート・認証・セッションを網羅する

`src/index.js` のルーティングを一覧化し、各ルートについて次を照合する。

- ハンドラー定義またはimport先が存在するか
- 対応するUI/APIが実際につながっているか
- HTTPメソッド制限があるか
- 未認証／BASIC／ADVANCED／VIP／ADMIN／OWNERの境界が正しいか
- ユーザーアカウントのACTIVE/DISABLED状態を適切に確認するか
- 状態変更GET、副作用を持つGET、CSRF/Origin対策の不足がないか
- Cookie/sessionのSecure、HttpOnly、SameSite、期限、失効、再発行、署名検証が整合しているか
- 不正なCookieや不正入力で500にならないか

既に記録済みの未定義レンダラー、認証チェック不足候補、Owner APIのmethod制限、GET副作用は監査MDを参照し、同じ内容を重複して追加しない。

### 2. Migration・SQL・インデックスを照合する

- `migrations/` の初期Migrationから最新までを一覧化し、テーブル・列・UNIQUE制約・インデックスと現行SQLを対応づける。
- `0008` の番号重複など既知の懸念は、実際の適用履歴が未確認の段階で即座に不具合と断定しない。
- `CREATE TABLE/INDEX` をリクエスト時に実行する箇所とMigrationとの二重管理を確認する。
- 読み取りコストが大きいSQLは、WHERE/JOIN/ORDER BYとインデックスの整合性を確認する。Query Planや本番Insightsを見ていない場合は未確認と明記する。

### 3. Cron / Queue / R2 / collection経路を照合する

- `scheduled()` から各定期処理が実際に呼ばれるか、Cron頻度と処理時間・タイムアウト・リトライが適切か確認する。
- import/定義されているだけのローラー、Retention、診断、Watchlist Scheduler、緊急履歴バッファ排出を「稼働中」と扱わない。
- `wrangler.jsonc` のbinding名、Queue名、環境別リソースがコードの参照と一致するか確認する。
- R2保存失敗時、D1 fallback、削除、再試行、並行実行時の整合性を確認する。
- UIポーリングがバックグラウンドジョブ継続を担っている機能は、画面を閉じたときの挙動も検討する。

## 現在の重要な問題候補（監査MDに詳細あり）

### 最優先候補
- 領主所有権移管で、新所有者のACTIVE行をINSERTしてから旧所有者をDISABLEDにしているため、ACTIVE `governor_id` のUNIQUE制約と衝突する可能性。
- Safety GateでCloudflare使用量の欠落値 `null` が0扱いになり、NORMAL判定へ落ちる可能性。
- RetentionがR2 bucket未指定で呼ばれた場合に、archiveせずDELETEする分岐がある。R2_ONLYの期待動作との整合性を確認する。

### 高優先度候補
- 収集ローラーなどがWorker入口から未接続に見える。接続前にR2 binding名 `R2_ARCHIVE` と `ARCHIVE` の不一致を解消・確認する必要がある。
- Retention、診断、緊急履歴バッファ排出、Watchlist Schedulerの自動実行経路が未確認。
- 公開 `/status` が60秒ごとにD1ステータス取得と直近24時間のAPI Pool使用量集計を繰り返す可能性。
- Watchlist Scheduler接続前に、全有効watchlist走査・直近24時間の使用量再集計・ACTIVEユーザー確認を設計する必要がある。
- Discord通知が候補を固定件数で取得し、claim済みイベントをSQL側で除外しないため、大量イベント時に後続通知が漏れる可能性。
- R2履歴APIが対象件数を絞る前にオブジェクト一覧を全ページ取得し、ランキング履歴では多数の本文をGETする可能性。
- Collection Semaphoreのリース期限延長関数が利用されていないように見え、長時間処理時に同時実行上限を超える可能性。
- Cloudflare Analyticsの固定limit超過時に部分集計を検知できない可能性。

### 中優先度以下の候補
- API Pool暗号化鍵にセッションSecretを共有利用しており、Secretローテーション時に復号不能になる可能性。
- API Pool leaseの非冪等リトライ、期限切れlease表示、Mighty判定の古い状態。
- Owner APIの監査ログ不整合、領主サポート申請の重複・状態遷移競合。
- API Raw Inspectorのpayloadサイズ上限不足。
- テストの標準的な自動実行入口を確認できていない。
- `/player/compare` やその他未定義レンダラー参照の候補。実際の定義・import・ビルド時の挙動を再確認する。

上記は優先度を示すための要約であり、根拠や条件は監査記録を読むこと。静的所見を本番障害と断定しない。

## D1 / ランキングに関する絶対条件

- **D1 Freeの読み取り量を最重要視する。**
- **`ranking_snapshots` の広範囲読み取りクエリを絶対に復活させない。**
- ランキング履歴・差分の設計は、対象キーで絞った既存クエリ、`kingdom_ranking_current`、R2アーカイブ、小さな索引などを優先して検討する。D1の全履歴SELECTで置き換えない。
- 数字の負荷試算は「シナリオ試算」と書き、実測と混同しない。

## 作業制約

- ユーザーから別途許可されるまで、アプリコード・Migration・Workflowの修正、デプロイ、本番DBの更新、APIキー再登録、収集・ロードテストの実行を行わない。
- Secret値、APIキー、Cookie等の機密値を監査MDや会話に書かない。
- 次スレでは、まずこの引き継ぎMDと監査記録の両方を読んでから続ける。

## 次スレ開始時の指示文

「`docs/EAGLEEYE_HANDOFF_2026-10-09_AUDIT_CONTINUATION.md` と `docs/EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md` を読んで、全コード監査の続きから開始。まず `src/index.js` の全ルートと認証/sessionの網羅確認を進め、確認済み所見を監査MDに追記する。コード修正・デプロイはまだ行わない。D1 Free読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。」


---

## 2026-10-09 継続監査追記（OAuth/session）

- 直近の監査記録更新コミット：`bfd92211898f2eab13a631e637d1a77ca0e3a261`
- 監査記録：[`EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md`](./EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md)
- 今回、`src/index.js` のDiscord OAuth開始/callback、Cookie発行、`getAuthenticatedUser()`、Owner管理APIの一部を再確認。
- 新規追加した要確認事項：
  1. OAuth stateはHMAC署名と10分の時刻確認があるが、開始ブラウザとの照合と一度きりの消費が見当たらず、ログインCSRFの可能性がある。実攻撃は未実施。
  2. D1のユーザー保存失敗を捕捉した後もセッションCookieを発行するため、callbackはログイン完了に見えても後続のD1ユーザー照会で未認証になる可能性がある。D1障害試験は未実施。
- Owner管理APIのうちユーザー一覧/ロール/状態/監査ログ/ウォッチリスト関連、API Pool再割当は、ルーター直下に認可ガードがないものでもハンドラー内部の`requireOwner()`を確認。未確認の別ルートへ一般化しない。
- `/player/compare` 未定義レンダラーは既存記録にあるため重複追記していない。
- セッションCookieの不正形式についても追記確認：`parseCookie()` の `decodeURIComponent()` だけでなく、`verifyPayload()` 内の署名部分 `decodeBase64Url()` も例外捕捉前に実行されるため、不正セッションCookieが共通catch経由で500になる可能性。既存の不正Cookie所見を拡張し、重複項目は作成していない。
- 監査全体は未完了。全ルート認証・メソッド・ACTIVE状態の照合、Migration/SQL全体照合、Cron/Queue/R2の接続照合を続ける。
- アプリコード・Migration・Workflowの変更、デプロイ、本番DB更新、収集/負荷テスト起動は行っていない。
- **D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**
