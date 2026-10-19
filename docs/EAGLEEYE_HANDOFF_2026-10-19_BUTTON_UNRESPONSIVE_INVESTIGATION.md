# EagleEye ボタン無反応調査 引き継ぎ

更新日: 2026-10-19（JST）
リポジトリ: `kingshot-bj/kingshot-data-platform`
基準 main commit: `c1c13b7d7ef54514f10036e1fe06b5f3a05cd511`

## 次スレでの作業指示

**ボタンが反応しない問題の根本原因調査を、この地点から再開する。進捗は10%刻み（10%、20%、30%…）で報告する。** 報告は単なる経過説明ではなく、確認したコード・証拠・判明事項を添える。原因を確定する前に修正を断定しない。必要ならコード全体を追い、原因特定後に最小修正と回帰確認を行う。

ユーザーはデプロイ状況を自分で確認するため、デプロイ確認を依頼・前提にしない。

## 症状・経緯

- 全体的にボタンが反応しない／クリックしても処理が進まない症状が報告された。
- PR #151「Fix global button action guard blocking interactions」をマージしたが、ユーザーから改善していないと報告。
- 続けて PR #152「Stop global action guard from blocking page buttons」をマージしたが、ユーザーから「かわってない」と報告。
- よって、共通クリックガードが原因だという仮説だけでは説明・解決できていない。まだ根本原因は未確定。

## GitHub 状態

- PR #151: https://github.com/kingshot-bj/kingshot-data-platform/pull/151
  - マージコミット: `39607a0703cc79f17ae1d09d89fb8ee3c121f28d`
- PR #152: https://github.com/kingshot-bj/kingshot-data-platform/pull/152
  - マージコミット / 調査基準 main: `c1c13b7d7ef54514f10036e1fe06b5f3a05cd511`
- 調査対象の共通コード: `src/index.js`
- main 上で確認したファイル SHA: `f8088c50499ab16f4ad988b5a95e6376a181f22f`
- 本文書は調査継続用の引き継ぎであり、ボタン無反応の修正を含まない。

## 直近で確認した事実

### 1. `installGlobalActionGuard()`（src/index.js およそ 5098–5169 行）

現在の capture-phase click handler は、クリックをキャンセルせず、対象ボタンを `window.__eagleEyeCurrentActionButton` に設定するだけ。従って、現在のコードではこの click handler 自体が直接クリックを止めているとは確認できない。

一方、同関数内の capture-phase submit handler には次の処理が残っている。

- `form.dataset.eagleSubmitting = "1"` を設定する。
- 以降の同じフォームの submit では `preventDefault()` と `stopImmediatePropagation()` を実行する。
- submit 後の `setTimeout(..., 0)` で `button[type=submit]` / `input[type=submit]` を disabled にする。
- この共通処理内では `eagleSubmitting` のリセットや、`eagleFormDisabled` によるボタンの再有効化を確認できていない。

これは少なくとも**フォームの2回目以降の送信を妨げたり、JSで処理するフォームの送信ボタンを無効のまま残したりする可能性がある**。ただし、全ページの全ボタンが反応しない現象全体の根本原因だとはまだ断定できない。

### 2. `installMutatingRequestGuard()`（およそ 5060–5097 行）

- `POST/PUT/PATCH/DELETE` の同一 method + URL + body の同時リクエストを `CLIENT_REQUEST_IN_PROGRESS` で拒否する仕組み。
- fetch 完了時に現在のアクションボタンを解放する処理があるが、現在の click handler は通常 `eagleBusy` を設定しないため、関連処理の整合性は再確認が必要。
- これは条件が一致する重複リクエストに関係する処理であり、全クリック無反応の原因と確定したわけではない。

### 3. 共通スクリプトの挿入

- `applyEagleEyeTheme(html)` が共通テーマスクリプト、プログレスバー、telemetry をページ HTML に挿入する。
- `setup()` は `applySavedTheme()`, `markEnvironment()`, `installMutatingRequestGuard()`, `installGlobalActionGuard()`, `installRoleBar()`, `installThemeToggle()`, `loadRole()` などを実行する。
- プログレスバー CSS には `pointer-events: none` があり、少なくともそのオーバーレイがクリックを覆う設計とは確認できていない。
- 他にもページ固有のクリックリスナーや委譲イベントが存在する。

## 進捗

**現時点の自己申告進捗: 30%。** 調査範囲は共通ガードの一部までで、原因確定・再現条件特定・回帰検証は未完了。次回は前回の30%から続ける。

## 次に行う調査（優先順）

1. **main の最新状態を取り直す。** 他作業のマージを考慮し、上記 SHA を固定の最新とみなさない。
2. **ページ横断の実装を追う。** `src/index.js` 全体から、共通 HTML/JS 挿入、初期化順、イベント委譲、`disabled` / `pointer-events` / `preventDefault` / `stopPropagation` / `stopImmediatePropagation` / `onclick` / `addEventListener` を検索し、全体症状を説明できる経路を特定する。
3. **submit 制御の影響を確認。** `eagleSubmitting` と `eagleFormDisabled` の全参照、フォームの送信後処理、再試行・成功・失敗時の再有効化を追跡する。関連する全フォームで共通制御とページ固有制御が競合していないか確認する。
4. **共通テーマスクリプトの実行条件を追う。** `applyEagleEyeTheme` による HTML 書き換え、script の配置、DOMContentLoaded / readyState、初期化例外の握りつぶし（空 catch）を調査。JavaScript の実行エラーで後続初期化が止まる経路を調べる。
5. **CSS/DOM の遮蔽を確認する。** fixed/sticky 要素、透明 overlay、z-index、pointer-events、親要素の disabled 状態や DOM 再生成を確認する。
6. **ページ別ハンドラーを調べる。** ボタンの代表ページだけでなく、共通部品と複数の主要ページでイベント登録・実行条件を確認し、症状が全ページ共通か一部かをコード上で切り分ける。
7. **仮説を証拠で絞る。** 可能なら既存テストやコード解析で、クリックイベントの伝播、フォーム再送信、二重リクエスト、初期化順を検証する。ユーザーが未報告の実機ログやブラウザーコンソールの結果を見たかのように扱わない。
8. 根本原因を特定してから最小修正を実装し、関連テスト・ビルド・既存機能への影響を確認する。必要な場合にのみ修正 PR を作成する。

## 調査ルール

- 10%刻みで報告し、各報告に「確認したこと」「証拠」「未確定点」「次の作業」を簡潔に含める。
- ユーザーの「変わっていない」という実機結果を事実として扱い、同じ仮説の小変更を繰り返さない。
- 全体症状を説明できる根拠がないうちは、フォーム送信制御だけを根本原因と断定しない。
- 無関係な本番変更・高負荷テストは避ける。
- デプロイの確認はユーザー側で行うため、依頼しない。
