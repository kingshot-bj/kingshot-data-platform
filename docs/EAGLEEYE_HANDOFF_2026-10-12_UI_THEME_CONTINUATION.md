# EagleEye本体 引き継ぎ — 共通UIテーマ統一（2026-10-12）

## 次スレの目的
全ページのUIテーマ棚卸しと共通化をこの地点から継続する。共通テーマ基盤と一部ページ適用はmain反映済みだが、全ページ統一は未完了。説明や計画だけで止まらず、現行コードを調査して安全な共通化を実装する。

- Repository: kingshot-bj/kingshot-data-platform
- Branch: main
- 共通テーマ: src/eagleeye-ui.js
- 大規模画面群: src/index.js
- 王国/同盟/Catalog: src/kingdom-portal.js
- 機能台帳: docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md

## デザイン方針
- 純黒ではなく紺寄りの背景、暗いネイビー系カード。
- シアンを主要アクション・選択状態のアクセントにする。
- 通常ボタンはダークネイビー系。オレンジは特別な意味がない限り避ける。
- 既存の情報設計・操作性・モバイル表示を壊さず、共通トークンを優先する。
- ホーム画面のスクロール完全なし方針を維持する。

## 共通トークン（直前に確認した値）
src/eagleeye-ui.js の EAGLEEYE_UI_TOKENS:
- navy: #07111f
- panel: #0d1b2d
- panelRaised: #13263d
- border: #25415f
- text: #e8f3ff
- subtext: #8fa4ba
- cyan: #22d3ee
- blue: #60a5fa
- gold: #f7c948
- success: #22c55e
- warning: #f59e0b
- error: #ef4444

## 直近に確認したコミット
- a141209ab1840d71b8d34d5f6edf5fcd04ec9094 — kingdom portal pagesへ共通テーマ基盤を適用
- e9cc02f242b604c281e057c8a10cf92ed42ab220 — kingdom portalの背景/アクセント統一
- f13caf8b9b7ad308280da48426dfd4b0e6df14fc — 共通サーフェスのトークン拡張
- 1e18dac9b29b642cc4b49a33b625af8d249d0d8f — watchlistの背景と主要ボタン統一
- bacb14172d542e431c8e821ff7e4a0e008ec166a — 共通テーマCSS注入修正
- 557b2c9d5dbbc181521c49d82b99de08d05a41cd — kingdom catalogへ共通テーマ適用
- 53165941a43e488733f78acc338a43c4291aaec5 — canonical theme tokens / base styles
- b17bdb8485af0ee0c321fa6d86b83b3bc567647e — compact watchlist cards
- 33bc63d6a54ee977d9cacf411a4ee9f9ad2ccf4d — compare selectorをカードヘッダーへ移動
- 9e3b2355216a4e7044cb7a4bb9808dbece3926a5 — browser-side alliance role helper修正

## 直前に確認したファイルSHA（再開時に必ず最新を取得）
- src/eagleeye-ui.js: 618e2eab565c27684770b56097bbc9dee584ef37
- src/index.js: 4c6efeddb91c46532110e9b886ca389e70a5ba6e
- src/kingdom-portal.js: 532d8c00ce88496f0dd2800905f19f256395212e

## 棚卸し状況
| 項目 | 状況 |
|---|---|
| 共通カラー/背景基盤 | 実装済み |
| プレイヤーウォッチリスト | 適用済み |
| 王国Catalog | 適用済み |
| 王国・同盟ポータル | 適用済み |
| src/index.js内のプレイヤー詳細/検索など | 全ページ確認・統一は未完了 |
| ページ固有CSSの整理 | 未完了 |
| 全ページのトークン利用状況一覧 | 未完了 |
| ビルド/実機/本番確認 | 未確認 |

## 次スレでやること
1. mainの最新コミットと上記ファイルを再取得してSHAを確認。
2. eagleeye-ui.jsの共通CSSと各ページへの注入経路を確認。過去にCSS注入修正があるため壊さない。
3. index.js内のユーザー向けページを一覧化し、背景・カード・ボタン・入力欄・境界線・文字色を棚卸し。
4. kingdom-portal.jsなども見て、既に共通化済みの箇所を重複実装しない。
5. 効果が大きく安全な重複スタイルから既存トークンへ寄せて実装。状態色や意味のある色は維持。
6. 変更後にファイルを再取得し、可能な範囲で構文チェック/テスト。
7. コード変更・静的確認・テスト・本番デプロイを区別して報告。

## 制約
- D1 Free readsを最優先。UI作業で不要なDB/API/スキーマ変更をしない。
- 広範囲な ranking_snapshots 取得クエリを絶対に復活させない。
- 本番DB更新、Migration、Queue操作、収集/負荷テスト、外部API/OAuth等の副作用操作をしない。
- GitHub main反映と本番デプロイを混同しない。
- 作業直前にSHAを取り直し、古いSHAで上書きしない。

## 次スレ開始文
EagleEye本体の共通UIテーマ統一の続きです。まずこの引き継ぎとmainの現行 src/eagleeye-ui.js、src/index.js、src/kingdom-portal.js を読み直し、最新SHAを取得してください。共通テーマ基盤と一部ページ適用は済んでいますが、全ページ統一は未完了です。ネイビー背景・暗いネイビーカード・シアンの主要アクションを基本に、共通化できるCSSを実際に実装してください。ホームのスクロールなしを維持し、既存UIを壊さず、広範囲な ranking_snapshots クエリは絶対に復活させないでください。変更後は再取得して検証し、本番デプロイは確認できた場合のみ報告してください。
