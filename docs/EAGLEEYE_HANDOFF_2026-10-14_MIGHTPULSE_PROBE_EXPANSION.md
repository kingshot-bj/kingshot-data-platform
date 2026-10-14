# EagleEye 引き継ぎ｜MightPulse Probe 拡張実装
作成日：2026-10-14（日本時間）

## 1. 次スレの最初にやること

対象リポジトリ：kingshot-bj/kingshot-data-platform  
基準ブランチ：main  
作業ブランチ：feat/mightpulse-probe-expansion-2026-10-14  
主な実装：src/index.js、src/mightpulse-probe.js、src/api-pool.js  
本番 Worker：kingshot-data-platform.black-jack-kingshot.workers.dev

**重要：まだ main へのマージも Cloudflare へのデプロイもしていない。DB migration も適用済みとは確認できていない。** 先に現在のブランチ・CI状態・差分を確認し、構文・テスト・権限・SQL・実際のMightPulse API契約を検証してから続行する。ユーザーがデプロイ確認をする前に「完了」と言わない。

このMDは実装途中の状態を記録した引き継ぎであり、現状コードが本番投入可能という意味ではない。

## 2. ユーザーが求めている最終目的

MightPulse APIを調査し、既知のコマンドだけでなく、公式公開コマンド・既存EagleEyeの取得処理・正当な範囲で調査できる未使用機能まで、管理画面から実行・観測できるProbeを作る。見つけた新データは実装候補として記録し、自動で本番コードに反映しない。

### 必須機能
- 手入力でAPIコマンド（相対パスとクエリJSON）を入力し、MightPulse APIで取得できるか単発テストできる。
- 単発実行／カテゴリ単位一括／全コマンド一括。
- 単発実行は単発で終わり、関連コマンドへ自動連鎖しない。一括実行のみ参照先を再帰調査する。
- レスポンス全体JSONの閲覧、コピー、JSON書き出し。
- フィールド辞書：パス、型、サンプル値、観測数。取得していないフィールドを推測で埋めない。
- 1コマンドごとの実行記録：コマンド名、endpoint、実行順、開始・終了時刻、手動／自動発見の理由、成功・失敗・スキップ、HTTPステータス、応答件数、リトライ数、保存先、起動元。
- 中断したバッチの再開。
- APIキー・Authorization・token・secret・passwordなどをUI・ログ・JSON出力に漏らさない。
- API 403を理由にキーを自動無効化しない。
- D1の読み書きを抑え、大きな生レスポンスはR2へ。D1はインデックス・最小限の実行メタデータ中心。
- 後日Google Driveへ長期保管する場合、移行先の成功確認前に元データを削除しない。
- 既存EagleEyeが実装済みのデータは、既存の保存・更新処理とレスポンス構造を確認した上で正規ルートに流す。新規・未実装コマンドは本番DBへ無理に書かずR2に調査用JSONを保存する。エラー応答は通常データとして保存しない。

## 3. 要件決定（既にユーザーが合意した内容）

1. 対象範囲：公式公開MightPulseコマンド、正当な範囲で観測できる未文書化機能、EagleEyeの既存データ取得処理を調査対象にする。公式コマンドと内部取得処理は別管理する。
2. 実行方式：単発、カテゴリ一括、全件一括。
3. 結果表示：全JSON＋コピー／書き出し＋フィールド辞書。差分比較は今すぐ必須ではないが、後から追加できる設計にする。
4. 保存：コマンド台帳・フィールド定義はコード管理。実行履歴・大きな生レスポンスはブラウザ／JSON書き出しとR2中心、D1負荷を低くする。
5. 利用権限：ProbeはAdmin以上。VIP契約のないAdminでもMightyキーを借りて調査できるようにする。
6. キー管理（ユーザー確定）：Probe専用キー・専用キー置き場・追加貸出同意は不要。EagleEyeの既存API Poolを全種類（SYSTEM_GENERAL／SYSTEM_WATCHLIST／USER_CONTRIBUTED）共有し、Mighty必須コマンドだけMighty確認済みキーに限定する。Probeが全キーをリースしないよう、共通の原子的リース処理で最低1キーを通常ユーザー／定期処理向けに残す。キー本体はログに残さず、貸出元・利用者・時刻・コマンド・結果を監査する。
7. 借りたキーの範囲：公式コマンド、調査で見つかった機能、EagleEyeの取得処理の全対象。
8. 保存先：実装済みデータは既存の正規保存処理へ。未実装データはR2。D1には必要最小限の索引・メタデータ。将来Google Driveへ移行しても、成功確認前にR2の元データを削除しない。
9. 一括調査：一括実行では参照先を重複排除しながら自動調査。API制限、最大件数、深さ、同時実行数に上限を設ける。実行順序・状態を全件記録し、途中再開できるようにする。
10. 新発見データ：実装候補リストで管理し、既存機能との対応・実装状況・本番反映可否を記録。コードを自動変更しない。
11. Admin/Ownerの境界：Probe実行・結果閲覧はAdmin以上。専用キー登録・無効化機能は廃止対象なのでOwner専用キー管理UI/APIを設けない。既存のProbe実行権限チェックを維持する。
12. 同時実行数：仮実装は一括で1〜4、初期値2。ユーザーの最終回答が記録されていないため、暫定値。
13. 最終安全確認・デプロイ方針：質問票の最後の確認は未完了。実装・テスト後に確認する。ユーザーはPreviewでの確認を求める方式を好まず、mainへマージしCloudflareへデプロイした上で確認することを希望している。ただし今回は未実施という状態。

## 4. 今回の追加要望（忘れない）

ユーザーの追加発言：
> あ、あとコマンド手入力で入れてマイトパルスAPIでそのコマンドでなにかデータ取得できるか試せるといいな

対応として、相対パスとクエリJSONを入力する手動GETフォームを追加。外部URL・ホスト指定・パストラバーサルを拒否する検証関数を用意。これは重要要件なので残す。

## 5. 現在ブランチに追加済みの主な変更

### src/mightpulse-probe.js
- コマンドカタログ MIGHTPULSE_PROBE_COMMANDS（現状13エントリー。公式全コマンドを網羅した完成版ではない）
- buildCatalogProbeCommand：カタログコマンドとパラメータからパス／クエリを組み立てる
- validateManualProbeCommand：相対パス、長さ、クエリ型などを検証。secret風のクエリ名拒否も追加
- redactProbeSecrets：秘密値を再帰的にマスク
- buildProbeFieldDictionary：フィールドパス、型、観測数、サンプル（最大400フィールド）
- extractProbeReferences：Player / Kingdom / Alliance参照候補の抽出
- APIキー専用管理機能は持たない。既存API Poolのキーを借り、Mighty確認済み判定はAPI Poolのメタデータを使う。
- archiveMightPulseProbeRecord：R2へ生記録、D1へ実行メタデータを保存。R2失敗時にもD1記録を試みる処理を追加

### src/api-pool.js
- Probe専用キーのための暗号化・保存処理は不要。既存API Poolの暗号化、リース、成功／失敗、クールダウン処理を再利用する。

### src/index.js
- /admin/mightpulse-probe のUI拡張
- 手入力コマンドの単発実行
- カテゴリ／全件バッチ、参照先の自動発見、バッチ状態のD1保存、再開API
- 実行履歴のD1一覧とR2レコード読み戻し
- フィールド辞書表示、JSONコピー・ダウンロード
- Probe専用キー管理UI/APIを削除。
- Probeは既存API Poolの3種すべてを利用し、Mighty必須コマンドはMighty確認済みキーに限定。`reserveAvailableKeys: 1` により、リース可能キーをすべてProbeが占有しないようにする。

### Migration
- migrations/0061_mightpulse_probe_runs.sql：Probe実行メタデータ用テーブル
- migrations/0062_mightpulse_probe_keys.sql：旧実装の互換用スキーマ。新しいProbe実行コードからは参照しない（0064の既存migration依存があるため、migration履歴の監査前に削除・改変しない）。
- migrations/0063_mightpulse_probe_batches.sql：バッチ再開用状態テーブルとrunメタデータ列追加

### Tests / CI
- tests/mightpulse-probe.test.mjs：手入力検証、秘密情報マスク、R2/D1アーカイブ、コマンド台帳、辞書、参照抽出などの単体テストを追加
- .github/workflows/mightpulse-probe-checks.yml：Node 22で node --check と node --test tests/mightpulse-probe.test.mjs を実行するワークフロー

## 6. 現在のブランチ状態とファイルSHA

作業ブランチ：`feat/mightpulse-probe-expansion-2026-10-14`  
直近の確認対象コミット：`e83e5bbdece376d48779f5e7596a8ffffb83b383`（ファイル更新コミット。PR head SHA は最新状態を再確認すること）

直近のファイルblob SHA：
- `src/index.js`: `a21ca0d1efeab42c05f09958e9f6c387378e02a2`
- `src/mightpulse-probe.js`: `2f1b27f420422beecd1bb8bdba9b8f6f19a28870`
- `src/api-pool.js`: `70f10dbbdb88978f5102a4c48c2d9263cd604d3b`
- `tests/mightpulse-probe.test.mjs`: `f838ff7d9110907254010375173a229101035930`
- `tests/mightpulse-probe-contract.test.mjs`: `c2c2b7c75a2b3b0f6819f3c2111b6be60bf45ff1`
- `migrations/0061_mightpulse_probe_runs.sql`: `fe959d623d2d82960c683e1ef4d2b58b69975c04`
- `migrations/0062_mightpulse_probe_keys.sql`: `e70adb01c2e8f720578baac141820ebc3d465708`
- `migrations/0063_mightpulse_probe_batches.sql`: `6c34bbb5a9d2f06c74e1f8c739256bbbd4c0884d`
- `migrations/0064_mightpulse_probe_key_audit.sql`: `9af372dc598ca705f2fe7416714250b58de6b0ba`
- `migrations/0065_mightpulse_probe_batch_lease.sql`: `a944bca3f6ddc1c9fe9c0a7d968153e4a662acbe`
- `.github/workflows/mightpulse-probe-checks.yml`: `81be6314aa0a0c276c9c79fa53b0f65e045fca15`

SHAは各ファイルのblob SHAであり、HEADコミットSHAとは別。最新のPR head/branch HEADは作業再開時に再取得すること。

## 7. 未完了・最優先で監査すべき点

**現時点でmainへのマージ・本番デプロイ・本番migration適用は未完了。CI成功も未確認。**

1. **構文・テスト・CI**：最新ファイルの `node --check` と `node --test tests/mightpulse-probe*.test.mjs` の成功結果が必要。GitHub Actions lookupでは最新コミットの実行結果が確認できていない。コンテナからGitHubへのネットワーク接続も利用できず、ローカル実行は未完了として扱う。
2. **Migration番号・本番D1ジャーナル（デプロイ阻害事項）**：mainには `migrations/0064_mightpulse_probe_key_audit.sql` が既に存在する一方、mainでは `0061`、`0062`、`0063` が見つからず、作業ブランチ側にある。0064は `mightpulse_probe_keys` と `mightpulse_probe_runs` をALTERするため、リモートD1の `d1_migrations` と実テーブルを確認せずに `wrangler d1 migrations apply --remote` を実行してはいけない。既に0064が適用済みか、テーブル／列が手動作成済みかを確認し、必要なら既存migrationの再実行ではなく安全なreconciliation手順を設計する。workflow `eagleeye-d1-apply-pending-migrations.yml` は保留migrationを一括適用するため、現状のまま手動起動しない。
3. **API Poolリース予備枠**：Probeは `SYSTEM_GENERAL`、`SYSTEM_WATCHLIST`、`USER_CONTRIBUTED` を共有し、`reserveAvailableKeys: 1` で最低1キーを残す。SQLのCOUNTとUPDATEが並行リクエスト時にも予約枠を守るか、複数pool typeのbind数、Mighty限定時の候補選択、成功／失敗／例外時の解放をテストする。
4. **旧専用キーmigration**：runtimeコードと `src/mightpulse-probe.js` から専用キー管理機能は削除済み。0062と0064の旧テーブル／監査列は既存migration履歴との依存があるため残している。runtimeがこれらを参照しないことをテストで維持し、migration順序を確認する前に削除・改変しない。
5. **秘密情報保護**：成功・失敗・保存失敗・R2失敗のすべてでAPIキー／Authorization／token等がAPIレスポンス、R2記録、D1メタデータに出ないことをテストする。Probeの保存エラーも `safeProbeErrorMessage` でマスクする変更を追加済み。
6. **Mighty判定**：`/kvk/matchups` のAPI契約は未確証。成功レスポンスだけでMighty確認済みにしてよいか、実データと仕様の裏付けが必要。失敗時は `UNCONFIRMED` とし、キーを自動無効化しない。
7. **本番データ汚染防止**：既存の本番保存ルートへ流すのは、コマンドID allowlist・レスポンス形状・プレイヤーID等を検証できるものだけ。未確認のコマンドやエラー応答はR2の調査記録のみとし、推測で保存しない。
8. **バッチ再開・権限**：pending_json / seen_json / inFlightの保存タイミング、Worker停止時の再開、作成者照合、同一バッチの排他リース、Admin以上の実行権限をテストする。
9. **APIコマンド網羅率**：カタログは全公式APIコマンドを網羅した完成版ではない。未知の仕様を推測で確定せず、実際に取得できたデータだけを記録する。
10. **マージ・デプロイ**：上記すべてのテストとmigration事前確認が終わるまではPR #63をdraftのままにし、mainへのマージ、Cloudflare本番デプロイ、リモートmigration適用を行わない。
