# 追記 — 王国ウォッチリスト自動再試行・状態表示の実装状況（2026-10-16 JST）

> この追記はPR #89の作業ブランチ上の実装状況。mainへのマージ・Cloudflare本番デプロイは未確認。テストスイートは実行できておらず、静的構文解析と主要条件の確認のみ完了。

## 1. 作業リンク・コミット

- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `fix/kingdom-watchlist-retry-state-2026-10-16`
- PR: https://github.com/kingshot-bj/kingshot-data-platform/pull/89
- 最新確認コミット: `a3232b3413d71254dbac6bcbcd3d1aaafb8fc50b`
- 変更ファイル:
  - `src/index.js`
  - `src/kingdom-watchlist-page.js`
  - `tests/kingdom-watchlist-retry-state.test.mjs`

## 2. 実装した内容

1. **失敗ジョブの自動再試行**
   - 再試行可能な失敗を `RETRYABLE:phase:attempt:error` 形式で記録。
   - 5分、10分、20分、40分、最大60分の指数バックオフ。
   - 初回失敗後の自動再試行は最大5回。ユーザーキャンセルやロードテスト容量待ちは自動再試行扱いにしない。
   - `RANKINGS` / `PLAYERS` のフェーズとコミット済みカーソルを使い、同じジョブを再開する。
   - 待機時間を過ぎていないジョブはスケジューラの対象に含めず、ロック取得・解除の不要なD1書き込みを抑制。
   - 手動再試行の状態遷移も、ウォッチリストロック取得後に実行する。

2. **ジョブ状態API**
   - `retryable`、`retry_attempt`、`retry_after_at` を一覧APIへ追加。
   - 古い成功時刻を今回のジョブ完了と誤認しないよう、画面側は対象ジョブIDと `COMPLETED` を確認する。
   - 15分以上進捗が止まったジョブは、再開待ちとして回復対象にする。

3. **UI**
   - 「取得・更新中」「再試行待ち」「失敗」「完了」を区別して表示。
   - 取得進捗と保存行数を表示。
   - 60秒でクライアント通信をタイムアウトし、通信待ちで画面が永久に固まるのを防止。タイムアウト後は処理状態を一覧で確認する必要があり、サーバー側処理が必ず中止されるという意味ではない。
   - 自動再試行待ちでも手動更新ボタンを利用可能にする。

## 3. 検証状況と残課題

- GitHubから変更後の3ファイルを再取得し、Workerコード（import/exportを除去した静的解析）、画面内JavaScript、テストファイルの構文解析は通過。
- 主要な再試行条件、バックオフ、ロック順序、状態表示に関する静的チェックは通過。
- **Nodeのテストスイートは未実行。GitHub Actionsの実行結果も取得できていない。**
- 本番D1への書き込み、王国収集の実機再現、Cloudflareデプロイは実施していない。
- `ranking_snapshots` の広範囲取得クエリは追加していない。
- マージ前に、回帰テストの実行結果とPR差分を確認する。マージ後もCloudflare本番への反映を別途確認し、正常なランキング取得・保存・画面表示と、エラー後の自動再試行を実機で検証する。

---

# 追記 — 王国ウォッチリスト登録・ランキング収集障害の調査引き継ぎ（2026-10-16 JST）

> この節が最新の引き継ぎ情報。以下の旧節（2026-10-10のホームUI・導線メモ）は履歴として残す。登録UIの修正コードが本番稼働しているとは確認できていない。

## A. 現在の目的と停止位置

- 対象リポジトリ：`kingshot-bj/kingshot-data-platform`
- 本番Worker：`kingshot-data-platform`
- 本番URL：`https://kingshot-data-platform.black-jack-kingshot.workers.dev`
- D1 binding：`eagleeye-db`（D1 IDはこの文書には記載しない）
- 対象機能：`/kingdom-watchlist`、`/api/kingdom-watchlist`、ランキング取得ジョブ、MightPulse API Pool
- 調査はユーザー指示により一旦停止。次スレでここから再開する。
- 最終報告進捗：60%。次の意味ある進捗報告は70%到達時。進捗は10%刻みで報告する。
- 目的は「登録ボタンが押せない/登録後に進まない問題」と「登録後のランキング収集失敗」を分け、証拠に基づいて原因を特定すること。ユーザーの実機操作ログを無関係な操作として扱わない。

## B. 確認できた事実

### B1. 登録APIは少なくともテスト経路で成功した

別のテスト画面 `/kingdom-watchlist-lab.html` から、実際の本番APIに対して次の呼び出しが成功した：

- `POST /api/kingdom-watchlist?action=create`
- HTTP 200、`ok: true`
- `watchlist_id` と `job_id` が返った
- 状態は `RANKINGS`
- HOME王国件数が1に増加

これは登録APIが常に壊れているわけではない証拠。ただし、既存の通常画面が正常とは言えず、テスト経路の成功だけで登録UX修正完了とも言えない。

### B2. 通常画面の問題と、置き換え実装

実機iPhone Safariでは、既存の登録ボタンが一瞬ローディング表示になった後に通常状態へ戻り、画面が `読み込み中…` のままになる症状が報告された。

関連するmainコミット（GitHub上の履歴）：

- テスト画面：`07c559dfd6b10f5f900764c0ea9211b7ce039279`
  - https://github.com/kingshot-bj/kingshot-data-platform/commit/07c559dfd6b10f5f900764c0ea9211b7ce039279
- テスト画面ルート追加：`071520567622a79ef81047e3a07ade475059d02a`
  - https://github.com/kingshot-bj/kingshot-data-platform/commit/071520567622a79ef81047e3a07ade475059d02a
- 王国ウォッチリスト置き換えUI：`d34875b252b00f5e9664e900343c4dc0605bd254`
  - https://github.com/kingshot-bj/kingshot-data-platform/commit/d34875b252b00f5e9664e900343c4dc0605bd254
- `src/index.js` から置き換えUIを呼ぶ変更：`660d96ea7a91592a0b007a91b148523e4d56ca9a`
  - https://github.com/kingshot-bj/kingshot-data-platform/commit/660d96ea7a91592a0b007a91b148523e4d56ca9a
- 回帰テスト追加：`c62465d7a0ad0bc0f3b843dba8bd9a97173a0fe2`
  - https://github.com/kingshot-bj/kingshot-data-platform/commit/c62465d7a0ad0bc0f3b843dba8bd9a97173a0fe2

これらのGitHub上のコミット存在は確認材料だが、現行本番へのデプロイ成功は未確認。最後に確認できた成功デプロイは2026-10-15 22:13:12 JST時点の古いコードで、識別子は `9434dd75-eaed-4b04-860b-2d9c6ff19f41`。置き換えUIのコミットより前なので、本番反映済みと扱わない。

### B3. 収集ジョブはMightPulse/API Poolの失敗を記録

ユーザー提供の最新状態ファイル `status-72.json`（取得時刻 2026-10-16 01:15:44 JST相当）の内容から、少なくとも以下を確認：

- 王国1526：`RANKING_FETCH_FAILED:alliance_power:NO_API_POOL_KEY_AVAILABLE`
  - `created_at=1792080033`（2026-10-16 01:00:33 JST）
  - trace/job関連ID：`482c938b-ec89-49c3-ab7c-51230e521f3a`
  - watchlist ID：`a2c011ab-f9ec-4442-be72-884cf4ac6787`
- 王国2471：ランキング取得失敗。MightPulse側HTTP 521、メッセージ `RANKING_FETCH_FAILED:alliance_power:MightPulse API request failed.`
  - およそ2026-10-16 01:09:23–01:09:24 JST
  - trace：`dda3cf50-6d3d-4d53-bb7f-dc90468c6b82`
- プレイヤー `225623582` のMightPulse API呼び出しでHTTP 522および526が記録された。
  - 522 trace：`pool-a19e82e7-2b51-44a4-9915-7e87b6302b33`
  - 526関連trace：`mp-c9e9e9e8-1fc3-429c-a76e-d4961e0a4ab2`、`pool-88645d9c-b423-47fe-9d8d-5b2edc159e1f`
- 後続スナップショットでは `availableKeys: 24`、`activeLeases: 0`、最新キー状態 `AVAILABLE` と記録されている。これは後の時点の状態であり、失敗した瞬間に対象操作で使えるキーがあったことの証明ではない。
- 多数のキーが後から `AVAILABLE` に戻る更新記録もある。「キーが一度失敗したら永久に復旧しない」とは結論づけない。
- Workers観測値には `cpuTimeP99Percent=100`、`cpuTimeP99State=EXHAUSTED`、`cpuTimeMsPercent=100`、`cpuTimeMsState=EXHAUSTED`、errors 317、requests 23,124、subrequests 58,497が含まれる。全体負荷の疑いとして確認する価値はあるが、これだけで今回の個別エラーの原因と断定しない。
- Cloudflare billing APIは403 Authentication error。請求額は確認できておらず、推計を実額として扱わない。

## C. 未確定事項・注意すべき実装リスク

1. 通常の `/kingdom-watchlist` 画面が `読み込み中…` から進まない根本原因は未確定。
2. `NO_API_POOL_KEY_AVAILABLE` が発生した時点で、`alliance_power` に適格なキーがなかった理由は未確定。単純な全キー枯渇とは限らず、キーの機能・利用可否・リース・クールダウン・Mighty判定・プール種別・同時実行・CPU制限を分けて調べる。
3. HTTP 521/522/526は記録上の観測結果。個別エラーの原因を、キー不足・MightPulse側障害・Cloudflare CPU制限のいずれか一つに早合点しない。
4. 置き換えUIは作成直後に `/api/kingdom-watchlist?action=refresh` を追加呼び出しする。作成API自体が初回更新を開始している場合、`WATCHLIST_REFRESH_IN_PROGRESS` または `現在更新中です` を一時エラーとして誤表示する可能性を確認する。
5. 置き換えUIの完了判定 `COMPLETED/SUCCESS/DONE` または `last_success_at` の存在は、古い成功時刻を現在ジョブの完了と誤認する可能性がある。ジョブID・開始時刻と結び付けて判定できるか調査する。
6. 置き換えUIによる既存機能の退行リスク：ランキング詳細表示、プレイヤーウォッチの星/お気に入り機能などを、既存画面と比較して確認する。
7. 現時点でテスト成功・本番反映・根本原因解決を示す十分な証拠はない。

## D. 次スレでの再開手順（優先順）

1. GitHub mainのHEAD、直近コミット、`src/index.js`、`src/kingdom-watchlist-page.js`、関連API実装、回帰テストを取得し、現在の状態を確定する。
2. status-72の該当ログを基準に、2026-10-16 01:00–01:16 JSTの時間帯をJSTに統一して追跡する。王国1526の `NO_API_POOL_KEY_AVAILABLE`、王国2471の521、プレイヤーの522/526を別々のリクエストとして追う。別のユーザー操作を混同しない。
3. API Poolで `alliance_power` 要求がキー選定を行う条件と、`NO_API_POOL_KEY_AVAILABLE` を返す全条件をコードから列挙する。失敗時刻に候補キーが実際に適格だったかを検証し、後時点の `AVAILABLE` 件数から逆算しない。
4. Workers CPU制限/エラーとジョブ失敗の時刻を比較する。相関があっても因果と断定しない。
5. UI側は「作成」「初回ジョブ開始」「進捗取得」「一覧再読込」を別々に追跡し、成功した作成APIと失敗する表示状態の境界を特定する。
6. 本番D1に書き込む再現テストや追加収集を無断で実行しない。副作用のある実機操作は、ユーザーが実行した時刻とtraceを明示的に対応させる。
7. 修正時はテストを実行し、既存の詳細ランキング・お気に入り機能の退行も確認する。GitHubコミットとCloudflare本番デプロイを分けて報告する。
8. 進捗報告は10%刻み。現状60%、次の報告目標70%。確認できていないことは明確に「未確認」と記す。

## E. 次スレ開始メッセージ

> EagleEye本体の王国ウォッチリスト障害調査を再開する。まずGitHub mainの `docs/EAGLEEYE_HANDOFF_2026-10-10_WATCHLIST_ENTRY.md` の先頭に追記された「王国ウォッチリスト登録・ランキング収集障害の調査引き継ぎ（2026-10-16 JST）」を読み、次に現行mainの `src/index.js`、`src/kingdom-watchlist-page.js`、API Poolとランキング取得実装、関連テストを確認する。
>
> 重要：通常UIの登録/読み込み問題と、登録後のランキング収集エラーは分けて調査する。status-72の王国1526 `NO_API_POOL_KEY_AVAILABLE`、王国2471 HTTP 521、プレイヤーHTTP 522/526をJST時刻とtrace IDで追跡する。後時点のavailable key数だけで失敗時の原因を断定しない。GitHubへの反映と本番デプロイを混同しない。D1 Free readsを優先し、広範囲な `ranking_snapshots` 取得クエリを絶対に復活させない。調査は60%地点から再開し、進捗は10%刻みで報告する。

---

# EagleEye 本体 引き継ぎ — ホームUI・ウォッチリスト導線（2026-10-10）

## 1. 次スレの目的

ホームUI調整の続きとして、**ウォッチリストの入口をプレイヤー用・王国用の両方に正しく接続する**。現在の画面上は選択ページが存在するが、ユーザー認識では「プレイヤーウォッチリストにしか紐づいていない」状態が残っている。最初から実装をやり直さず、現行コードと実機で見えている経路の差を確認してから直すこと。

- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- Latest code change at handoff: home no-scroll change merged as `d9db0f292383d70ceb8e2c07d2764b892ace7f97` (handoff file commit will follow)
- Main source: `src/index.js`
- Existing feature inventory: `docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md`
- Existing audit handoff: `docs/EAGLEEYE_HANDOFF_2026-10-10_AUDIT_CONTINUATION.md`

## 2. 直近のユーザー要望

- ホーム画面はスクロール完全なしにしたい。
- ウォッチリストには次の2種類がある：
  - プレイヤーウォッチリスト：`/player-watchlist`
  - 王国ウォッチリスト：`/kingdom-watchlist`
- いまはプレイヤーウォッチリストにしか紐づいていないように見えるので、両方に正しくアクセスできるよう解決したい。
- 提供された実機スクリーンショット（ウォッチリスト選択画面）には2枚のカードが表示されている：
  - 「プレイヤーウォッチリスト」→ `/player-watchlist`
  - 「王国ウォッチリスト」→ `/kingdom-watchlist`
  - 説明文：「プレイヤーと王国のウォッチリストは、それぞれ独立して管理されます。」
- したがって、問題が単なる画面遷移なのか、バッジ・件数・ホームの導線・実機デプロイの古さなのかは、次スレで切り分ける必要がある。スクリーンショットだけで「両方の機能が正常」と断定しない。

## 3. 現行 main の静的確認済み内容

`src/index.js` の現行コードには、次の実装がある。

1. `/watchlist` → `renderWatchlistHubPage(request, env)` を返すルート。
2. ハブ画面にプレイヤー用カード `href="/player-watchlist"` がある。
3. ハブ画面に王国用カード `href="/kingdom-watchlist"` がある。
4. ホームの「ウォッチリスト」主要カードは `href="/watchlist"`。
5. 下部ナビの「ウォッチ」も `href="/watchlist"`。
6. 王国ウォッチリストの独立した画面/APIルートも存在する：
   - `/kingdom-watchlist`
   - `/api/kingdom-watchlist`
   - `/api/kingdom-watchlist/data`
   - `/api/kingdom-watchlist/history`
7. プレイヤーウォッチリストの画面/APIルートも存在する：
   - `/player-watchlist`
   - `/api/player-watchlist`

**要注意：ホーム内のウォッチ数表示はプレイヤー件数のみを使っている。**
- ホームカードのバッジ `#playerBadge`、下部ナビのバッジ `#navBadge` は、どちらも `/api/player-watchlist` の有効エントリー数 `pc` を表示している。
- ホームのサマリーには `PLAYER WATCH` と `KINGDOM WATCH` が別々にある。王国件数は `/api/kingdom-watchlist` の `watchlists` 配列から計算している。
- 下部ナビの「ウォッチ」バッジはプレイヤー数だけなので、ユーザーが「プレイヤーにしか紐づいていない」と感じる原因の一つである可能性がある。
- バッジを単純合算するか、2種類の件数を分けて表示するかは未決定。意味が誤解されない設計にする。

## 4. 次スレで最初に行うこと

1. GitHub `main` の `src/index.js` を再取得し、上記の導線が現行コードでも維持されているか確認。
2. ユーザーの「紐づいていない」がどの箇所を指すか、コードとスクリーンショットを見ながら具体化する。聞き返しだけで止まらず、まず全導線・バッジ・APIレスポンス形状を静的に追跡する。
3. ホームカード→`/watchlist`→各ウォッチリスト、下部ナビ→`/watchlist`、その他メニュー→`/kingdom-watchlist` の各導線を整理する。
4. 王国ウォッチのAPIレスポンス構造・件数算出・権限要件を確認し、画面とAPIの接続に抜けがないか調べる。
5. 必要な修正を小さなPRで実装し、コード上の変更と本番デプロイ状況を明確に分けて報告する。

## 5. 直近のホームUI変更履歴（GitHub main 反映済み）

- PR #9 — ログイン後のホーム右上プロフィールリンクを `/status` から `/my-player` に変更。
  - Merge commit: `798cbaf9a5a4da7adfcd3185693f2f14b9fe0fd2`
  - https://github.com/kingshot-bj/kingshot-data-platform/pull/9
- PR #10 — ホームのサマリー下と「その他」メニューにマイルストーン入口を追加。「近日公開予定」で無効化。報酬や進捗ロジックは未実装。
  - Merge commit: `776fda917818d0ad40d0f5260c305e47da8fc454`
  - https://github.com/kingshot-bj/kingshot-data-platform/pull/10
- PR #11 — iPhone幅・縦画面でホームをコンパクト化。
  - Merge commit: `bd83a2e8b5c1b531d6b6f70ddfa756f034a66d4a`
  - https://github.com/kingshot-bj/kingshot-data-platform/pull/11
- PR #12 — ホームのスクロールを完全に無効化する方針。ホーム本体 `overflow:hidden`、`100dvh`、小さいビューポート向け段階的コンパクト化。
  - Merge commit: `d9db0f292383d70ceb8e2c07d2764b892ace7f97`
  - https://github.com/kingshot-bj/kingshot-data-platform/pull/12

すべて GitHub main へのマージは確認済み。ただし、この会話内ではCloudflare本番デプロイの成功は確認できていない。GitHub反映と本番反映を混同しないこと。

## 6. UI方針

- ホームはスクロールなし。画面高に合わせて内容を縮める。
- ホームのウォッチリストカードと下部ナビ「ウォッチ」は、2種類を選べる `/watchlist` ハブを入口にする方針。
- プレイヤーと王国のウォッチリストはデータとして独立している。
- バッジの数字がプレイヤーだけを表すなら、表記・色・配置でそれが明確に伝わるようにする。王国分も含む総数にする場合は二重カウントやAPI仕様を確認してから実装する。
- D1 Free readsを最優先。バッジ表示のための不要なポーリングや重い読み取りを追加しない。

## 7. 安全・実装制約

- 広範囲な `ranking_snapshots` 取得クエリを絶対に復活させない。
- Preview設定はProduction D1/R2と共有の可能性がある。分離を確認するまで副作用テストを実行しない。
- 本番D1更新、Migration、Queue、収集/ロードテスト、外部API/OAuthを無断実行しない。
- DBスキーマ変更は今回の入口整理に不要な限り避ける。
- テストしていないものは「コード確認のみ」「実機未確認」「本番デプロイ未確認」と明記する。
- Secret、APIキー、Cookieを引き継ぎ文書に含めない。

## 8. 次スレ開始文（そのまま貼り付け）

> EagleEye本体の続きです。まず GitHub main の `docs/EAGLEEYE_HANDOFF_2026-10-10_WATCHLIST_ENTRY.md` と `src/index.js` を読み、現状を確認してください。
>
> 今回はウォッチリスト導線を直します。プレイヤーウォッチリストと王国ウォッチリストの2つがあるのに、プレイヤー側にしか紐づいていないと感じる箇所があります。現行コードでは `/watchlist` ハブ、`/player-watchlist`、`/kingdom-watchlist` が存在し、ホームカードと下部ナビは `/watchlist` に向いています。一方、ホームカード/下部ナビのバッジは `/api/player-watchlist` の件数だけを表示しています。
>
> まず導線・バッジ・APIレスポンス・権限・ホーム件数表示を静的監査し、実際にどこがプレイヤーだけに結び付いているのか特定してください。必要な修正を小さなPRで実装してください。DB/外部副作用の実行と本番デプロイ成功の未確認を混同せず、D1 Free readsを最優先し、広範囲な `ranking_snapshots` クエリを絶対に復活させないでください。
