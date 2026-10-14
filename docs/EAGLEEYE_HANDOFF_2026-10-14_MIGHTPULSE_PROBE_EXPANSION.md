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
6. キー管理：Probe専用キーと、EagleEye利用時点で提供済みとみなす既存USER_CONTRIBUTEDキーの両方を利用する。Probe専用の追加貸出同意フラグは設けない。通常コマンドは利用可能な提供キーを候補にし、Mighty必須コマンドだけMighty確認済みキーに限定する。貸出元・利用者・時刻・コマンド・結果を監査できるようにする。キー本体はログに残さない。
7. 借りたキーの範囲：公式コマンド、調査で見つかった機能、EagleEyeの取得処理の全対象。
8. 保存先：実装済みデータは既存の正規保存処理へ。未実装データはR2。D1には必要最小限の索引・メタデータ。将来Google Driveへ移行しても、成功確認前にR2の元データを削除しない。
9. 一括調査：一括実行では参照先を重複排除しながら自動調査。API制限、最大件数、深さ、同時実行数に上限を設ける。実行順序・状態を全件記録し、途中再開できるようにする。
10. 新発見データ：実装候補リストで管理し、既存機能との対応・実装状況・本番反映可否を記録。コードを自動変更しない。
11. Admin/Ownerの境界：既存コードを見て仮案を作ったが、この質問へのユーザーの明確な最終回答は未確認。現実装ではProbe専用キー登録・無効化をOwner専用に寄せ、Probe実行・結果閲覧はAdmin以上と仮定している。確定要件として扱わず、次スレでユーザーの合意を確認する。
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
- Probe専用キーの登録、一覧、リース、解放、無効化、Mighty確認状態の管理
- archiveMightPulseProbeRecord：R2へ生記録、D1へ実行メタデータを保存。R2失敗時にもD1記録を試みる処理を追加

### src/api-pool.js
- 暗号化関数 encryptSecret をexportし、Probe専用キーを既存の暗号化方式で保存できるようにした。
- 本番キー管理とProbe専用キーは別テーブルにする方針。

### src/index.js
- /admin/mightpulse-probe のUI拡張
- 手入力コマンドの単発実行
- カテゴリ／全件バッチ、参照先の自動発見、バッチ状態のD1保存、再開API
- 実行履歴のD1一覧とR2レコード読み戻し
- フィールド辞書表示、JSONコピー・ダウンロード
- Owner専用Probeキー管理UIとAPI（登録、一覧、無効化、Mighty権限チェック）
- Probe実行では本番SYSTEM_*キーを借りず、Probe専用キーを優先し、次にユーザー提供Mightyキーを使う構造を入れた。実際の貸出許諾の連携は要検証。

### Migration
- migrations/0061_mightpulse_probe_runs.sql：Probe実行メタデータ用テーブル
- migrations/0062_mightpulse_probe_keys.sql：Probe専用キー用テーブル
- migrations/0063_mightpulse_probe_batches.sql：バッチ再開用状態テーブルとrunメタデータ列追加

### Tests / CI
- tests/mightpulse-probe.test.mjs：手入力検証、秘密情報マスク、R2/D1アーカイブ、コマンド台帳、辞書、参照抽出などの単体テストを追加
- .github/workflows/mightpulse-probe-checks.yml：Node 22で node --check と node --test tests/mightpulse-probe.test.mjs を実行するワークフロー

## 6. 直近で取得確認できたファイルSHA

作業ブランチからの直近取得時点：
- src/index.js: dca6cb29c1f48daed80366c764fcf72aafd4389f
- src/mightpulse-probe.js: ed7b29be16964490ac41bd1d5eb7c627f9299ed6
- src/api-pool.js: 4edeaf7c32006b8ea5a6febb6fb7bc4ae3a056e3
- tests/mightpulse-probe.test.mjs: 2babd5a56c877a7e89bb0f4549ea18e7f609b8f2
- migrations/0061_mightpulse_probe_runs.sql: fe959d623d2d82960c683e1ef4d2b58b69975c04
- migrations/0062_mightpulse_probe_keys.sql: e70adb01c2e8f720578baac141820ebc3d465708
- migrations/0063_mightpulse_probe_batches.sql: 64ca41c2ad77a87286e03000afd4f3a669338c28
- .github/workflows/mightpulse-probe-checks.yml: 86bfb659cc9959ef778940901fb8190702265b74

SHAは各ファイルのblob SHAで、ブランチのHEADコミットSHAとは限らない。次スレでブランチHEADと最新CIを再取得すること。

## 7. 未完了・最優先で監査すべき点

**今のコードは初期実装段階。テスト・本番デプロイ済みとは扱わない。**

1. 構文・CI再確認：初回のCIでテストのアーカイブキーassertionに問題が見つかり修正した。その後の最新CI成功は未確認。直近の全編集後に再実行・結果確認する。
2. SQLバインド数／migration：archiveMightPulseProbeRecordのD1 INSERT列とbind引数の数が合っているか、0061→0062→0063の順で適用可能かを確認。既存migration番号の競合もmainと比較する。Cloudflare D1に未適用のままデプロイしない。
3. キー暗号化：configureApiPoolEncryption と encryptSecret/decryptSecret の使用を確認。専用キーの追加・取得・リース・無効化をDB mockと実D1相当テストで検証。
4. Mighty権限チェック：現在 /kvk/matchups を使ってMighty権限を判定する仮実装。API契約上そのendpointが妥当か、401/403/429/5xxをどう区別するか確認。403でもキー本体を無効化しないこと。
5. 借用キーの同意と貸出監査：現在のフォールバックは leaseApiKey(... poolTypes: ["USER_CONTRIBUTED"]) を呼ぶ。Probe専用の追加貸出同意フラグは不要（ユーザー確定：EagleEyeにキーを提供した時点で利用同意済み）。通常コマンドはmightyOnly:false、Mighty必須コマンドはmightyOnly:trueで利用候補を分ける。既存の状態・無効化・クールダウン・リース条件を維持し、貸出中のキーが本番処理と競合しないことを確認する。専用キーと借用キーの双方で確実な解放を検証する。
6. 本番データ汚染防止：Probe結果を既存の本番保存ルートへ書き込まない。既存データ反映の要件は「既存保存ロジックに対応していることを確認した場合のみ」。今のバッチ処理はR2調査保存を基本とし、通常のEagleEye保存への安全な振り分けはまだ完成していない。
7. バッチの再開ロジック：pending_json / seen_json / inFlight の保存タイミング、並行ワーカーの競合、途中でWorkerが停止した場合のin-flight再投入、同じバッチIDを別ユーザーが再開できないこと、同じバッチが並行実行されないことを確認。D1の状態更新が重複／逆行しないようにする。
8. バッチ応答サイズ：一括APIが全結果を1レスポンスに返す構造は、R2に大きいJSONを保存してもAPIレスポンスが肥大化しうる。レスポンスには概要と実行IDのみを返し、詳細は履歴からR2読込にする方式を検討。D1は大きなpayloadを保持しない。
9. カテゴリ一括の対象引数：全コマンドで同じパラメータを使うため、governor_id / kid / tagが空なら一部はSKIPPEDになる。UIに必須入力を明示し、未入力を明確に表示。カテゴリ一括の前に対象パラメータを検証する。
10. カタログは13件のみ：公式API全件・EagleEye既存取得処理全件を網羅していない。既存 src/mightpulse.js の各関数・各endpoint、ドキュメント、既存呼び出し箇所を照合してコマンド台帳を完成させる。未確認endpointを公式と断言しない。
11. Mighty判定とカタログの権限：コマンドごとの requiresMighty が暫定。実際のAPI契約に基づいて修正する。
12. 履歴UIの動作：履歴APIはD1メタデータを返し、詳細をR2から読み込む実装を追加。HTMLエスケープ、失敗記録の開き方、JSONの秘密マスク、存在しないR2オブジェクトの表示を確認。
13. JSON export / copy：UIのコピー・ダウンロードが成功／失敗時に正しく動くか、実ブラウザで確認。
14. R2失敗：R2失敗時にD1記録を残し、UIに「未保存」を正しく表示。生データが保存できていないのに保存成功と表示しない。
15. キー登録時の疎通テスト：登録前の /kingdoms がそのキーで通常権限の有効性を確認できるか、API仕様を確認。疎通失敗の際にキーを誤って登録・破棄しない。
16. 手入力APIの制約：GET専用で相対パスのみ。最大パス長、queryのscalar値制限、外部URL・host-relative・traversal拒否をテスト。ユーザーが入力した任意パスの監査・レート制限も必要。
17. 監査記録：user ID、Discord ID、role、コマンド、時刻、状態、HTTP status、R2 object keyを必要な範囲で記録。APIキーそのもの、Authorizationヘッダー、secret queryは保存しない。
18. 同時実行／API制限：初期値2、上限4は仮。API Poolの既存lease・cooldown・rate limitと矛盾しないこと。429はcooldown、403は自動無効化なし。
19. 実装候補リスト：新規発見フィールドを既存機能と紐づける候補テーブル／JSON管理はまだ未実装。自動コード変更は禁止。
20. Google Driveアーカイブ：長期保管・成功検証・削除禁止ルールは未実装。
21. EagleEye本番取得処理との照合：src/mightpulse.js、API pool、保存処理を確認し、各既存取得をProbeのcatalog/processに紐付ける。既存のD1読み込みを無駄に増やさない。

## 8. セキュリティ・運用上の注意

- ProbeはAdmin以上の想定。キー登録・無効化・Mighty権限確認APIはOwner限定の仮実装。
- 本番SYSTEM_GENERAL / SYSTEM_WATCHLISTキーをProbeに借りない。これはコード上の意図で、実際の全経路を監査する。
- USER_CONTRIBUTEDキーはEagleEye利用時点で提供済み・利用同意済みとして扱い、Probe専用の追加同意フラグは作らない。Mighty必須コマンドはMighty確認済みキーに限定し、既存のキー状態・リース・無効化ルールは維持する。
- 403はMighty権限不足の可能性があり、キーが無効とは限らない。自動停止しない。
- APIキー本体は画面の登録欄から送信後にクリアし、登録後は再表示しない。fingerprintは先頭数文字だけ表示。
- D1に生レスポンスを入れない。生JSONはR2。履歴用D1列は小さいメタデータだけ。
- API endpointやレスポンス構造の推測を公式仕様として書かない。取得できなかったものを勝手に補完しない。
- 本番へのマージ・デプロイ前に、CI成功、migrationの順序、API契約、権限、R2/D1保存、実行履歴のテストを済ませる。

## 9. 次スレでの具体的な作業順

1. 作業ブランチのHEAD、draft PR、最新GitHub Actions結果を取得。
2. 変更差分を監査。src/index.jsは巨大ファイルなので、関係箇所を関数単位で読み、置換ミス・重複処理・閉じ括弧を確認。
3. node --check src/index.js、node --check src/mightpulse.js、node --check src/mightpulse-probe.js と node --test tests/mightpulse-probe.test.mjs を通す。CIログも確認。
4. 0061/0062/0063 migrationの既存番号・SQL・bind数を確認。
5. API Poolの leaseApiKey / recordApiPoolSuccess / recordApiPoolFailure / releaseApiLease の実際の引数仕様と、Mighty貸出同意を監査。
6. カタログを既存 src/mightpulse.js と照合し、公式endpointと内部取得プロセスを別のリストにする。
7. 手入力単発、カテゴリ一括、全件一括、再開、失敗保存、R2読込、キー権限のテストを追加。
8. 新規発見データの実装候補台帳を追加。
9. ユーザーへ10%刻みで進捗を報告（実装タスク）。Previewを確認手段として提案しない。
10. ユーザーの意図に沿ってmainへマージしCloudflareへデプロイする段階に進むのは、テスト・権限・migrationの安全性を確認してから。実デプロイの結果を明示し、ユーザーの本番画面確認を待つ。

## 10. 次スレに貼る開始メッセージ

この引き継ぎMDを読んで、EagleEyeのMightPulse Probe拡張を続けてください。リポジトリは kingshot-bj/kingshot-data-platform、作業ブランチは feat/mightpulse-probe-expansion-2026-10-14 です。mainへのマージ・Cloudflareデプロイはまだしていません。まず現在のブランチHEAD、draft PR、GitHub Actionsの最新結果を確認し、差分・構文・テスト・migration・API PoolのMighty貸出同意とリース処理を監査してください。特に手入力コマンド、単発／カテゴリ／全件一括、参照先の自動調査、R2保存・D1最小メタデータ、履歴からの再開、キー秘密情報の保護を壊さないでください。未確認のAPI仕様を推測で確定せず、既存本番データの保存ロジックへ無条件で書き込まないでください。進捗は10%刻みで報告してください。
