# EagleEye 引き継ぎ — 王国ウォッチリスト登録不具合優先
更新日: 2026-10-15
リポジトリ: https://github.com/kingshot-bj/kingshot-data-platform
対象ブランチ: main


## 0. 恒久運用ルール（スレッドが変わっても必ず守る）
- **Cloudflare Workers の本番デプロイは自動設定。** main にマージすれば自動デプロイされる前提で進める。手動デプロイを通常手順にしない。自動デプロイの成否は、必要に応じてGitHub Actions/Cloudflareの実行結果や本番反映で確認する。
- **Previewをユーザー確認・受け入れテストの手段として使わない。** ユーザーはPreviewを使っていない。Preview URLを渡して確認を求めたり、「Previewで見て」と案内したりしない。
- 基本フローは **作業ブランチで修正 → テスト/CI → PR → mainへマージ → 自動本番デプロイの反映確認**。Preview確認をmainマージの代替条件にしない。
- ユーザーがPreviewを使っていないことを、毎スレッドで再確認させない。このルールを引き継ぎメッセージと作業ハンドオフに継承する。
- mainマージ・自動デプロイ・本番反映は別々の事実として扱い、実際の状態を確認するまでは「デプロイ済み」「本番反映済み」と断定しない。自動デプロイ設定があることを理由に、成功確認まで省略しない。

現在の main: `4e2f3e03b4706281a6914a8efff50b2bf31527af`

## 1. 最優先目的
王国ウォッチリストの「監視を登録」ボタンから王国を登録できない問題を解決する。診断画面の未診断箇所は存在するが、ユーザー体験に直結する登録障害を先に直す。ログの見た目だけ直して完了扱いにしない。実際に登録できることを確認する。

## 2. status-64.json から確認した事実
- 対象期間は15分。systemLog.summary は event_count=72 / returned_event_count=72 / complete_window_read=true / truncated=false / count_query_error=null / event_query_error=null。
- 「監視を登録」のブラウザ CLICK イベントが2件存在する。
- その周辺に `POST /api/kingdom-watchlist?action=create` の FETCH_START/FETCH_COMPLETE が確認できなかった。
- 同じブラウザセッションでは一覧取得系 GET はHTTP 200で記録されていた。
- よって、API内部よりも先にブラウザ側で処理が止まった可能性を優先して調査する。ただしクリック時の王国番号入力状態が以前は記録されておらず、空欄バリデーションで止まったのか、イベントハンドラ未実行等なのか、JSONだけでは断定できない。
- 過去の同じJSONではイベント名・ページパス・elementId・traceIdの文字列が欠損していた。これは client telemetry の正規表現の過剰エスケープが原因で、PR #83で修正済み。

## 3. 今回 main に入った修正
### PR #83 — 診断ログ修正
- PR: https://github.com/kingshot-bj/kingshot-data-platform/pull/83
- merge commit: `27acacaecc066549549b687fee1f0fe4b1c199eb`
- ブラウザ telemetry の過剰エスケープ正規表現を修正。
- API Pool / MightPulse の診断が UNKNOWN になるケースに、operational event fallbackを追加。
- 診断ログ回帰テスト追加。
- CI成功確認済み。

### PR #84 — 王国ウォッチ登録UIと原因判別
- PR: https://github.com/kingshot-bj/kingshot-data-platform/pull/84
- merge commit / 現在の main: `4e2f3e03b4706281a6914a8efff50b2bf31527af`
- `src/index.js`
  - 王国番号が空なら明示的なエラーを表示。
  - 王国番号が1以上の整数でない場合のエラーを追加。
  - 入力欄を `aria-invalid=true` にし、視覚的にエラーを示す。
  - 登録処理中はボタンをdisabledにし、「登録中…」へ変更、`aria-busy=true`、`is-registering` classを設定。
  - finallyでボタン状態を復元。
  - `window.__eeTrackAction` 経由で `ACTION_BLOCKED` / `ACTION_START` を記録。
- `src/client-telemetry.js`
  - `ACTION_START` / `ACTION_BLOCKED` を許可。
  - 登録クリック時に王国番号そのものを保存せず、空欄か存在するかの状態のみ記録。
  - `inputState` をメタデータへ追加。
- `tests/kingdom-watchlist-registration-ux.test.mjs` 追加。
- CI workflow に登録UX回帰テストを追加。
- 追加修正後のCI run: https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/38685738670 （PRの最終headで全ステップ成功）
- mainマージ後のCI:
  - Probe checks: https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/38685775047 — success
  - Worker Build Validation: https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/38685775061 — success

## 4. 未完了・絶対に混同しないこと
- mainマージとCI成功は確認済み。
- **本番Cloudflare Workerにこのmainがデプロイされたこと、実際のユーザー操作で王国登録が成功することは未確認。**
- したがって「王国ウォッチ登録の問題が解決した」とはまだ言えない。今回の修正はUIフィードバックと原因を区別するログを追加した段階。
- 診断画面の一部サービスが未診断/UNKNOWNになる問題も残課題。ただし王国ウォッチ登録を先に検証する。
- status-64.json内のウォッチリストジョブには `WATCHLIST_JOB COMPLETE` があり、`rankingRows: 0`, `playerRows: 10` だった。ジョブ完了ログだけでランキングデータが正しく保存されたと判断してはいけない。今回の「登録APIが呼ばれない問題」と、登録後の初回ランキング取得・保存不具合は別々に検証する。

## 5. 次スレで最初に実施すること
1. main SHAが `4e2f3e03b4706281a6914a8efff50b2bf31527af` 以降であることを再確認。
2. Cloudflare Workersの本番デプロイ状態を確認。未デプロイなら通常のプロジェクト運用に沿ってデプロイし、実際の反映を確認する。プレビューをユーザー確認手段として提案しない。
3. 実画面で登録テストを実施し、次を一連で検証する:
   - 空欄クリック → エラーが見え、ACTION_BLOCKED/KINGDOM_ID_EMPTYが記録され、API createを呼ばない。
   - 有効な王国番号で登録 → ACTION_START、POST create、HTTP応答、DB登録、watchlist_id/job_id返却まで確認。
   - 登録後の refresh continuation が進み、最終状態・ランキング保存件数・プレイヤー保存件数が整合することを確認。
4. 本番ログを確認:
   - `ACTION_START` はあるが `FETCH_START POST /api/kingdom-watchlist` がない場合、フロントのfetch呼び出し前後を調査。
   - POSTのHTTPエラーがあれば応答コード・エラーコードからサーバー側を追う。
   - POST 200でDB登録されるのにUIが失敗表示なら、レスポンス処理または `initial_refresh_status` の分岐を調査。
   - create成功後refreshが止まる場合、`continueWatch(id)` と `action=refresh` の状態遷移・リトライを調査。
5. 実際の成功を確認するまで、コード上のテスト成功だけで完了宣言しない。
6. 進捗を聞かれたらパーセントで回答し、10%刻みで報告する。

## 6. 重要なコード位置
- 登録画面・登録ボタン・API呼び出し: `src/index.js` 内の `var creatingWatchlist=false;` 付近（王国ウォッチリスト画面）
- API handler: `async function handleKingdomWatchlistApi(request, env)`
- create route: `if (request.method === "POST" && action === "create")`
- refresh route: `if (request.method === "POST" && action === "refresh")`
- ブラウザ継続処理: `function continueWatch(id)`
- telemetry: `src/client-telemetry.js`
- 登録UX回帰テスト: `tests/kingdom-watchlist-registration-ux.test.mjs`
- CI workflow: `.github/workflows/mightpulse-probe-checks.yml`

## 7. 作業ルール
- 既存ログやコードから分かることを先に調べ、ユーザーに不要な再取得・手作業を要求しない。
- 必要な追加情報が本当にある場合だけ、目的と判明することを明示して要求する。
- 機能追加・不具合修正ごとにログ取得スキームも見直し、不足があれば同時に補う。
- D1 free-tierの読み取りコストに配慮し、広範なログ再取得や重いクエリを安易に追加しない。
- 事実・推測・未確認事項を明確に区別する。
