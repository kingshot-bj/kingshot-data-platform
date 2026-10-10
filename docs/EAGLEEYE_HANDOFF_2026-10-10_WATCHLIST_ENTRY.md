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
