# EagleEye 本体 引き継ぎ — 2026-10-08 UI / Mighty API Pool / キー照合

## 1. 今回の目的

MightPulse APIキー管理について以下を実施・確認した。

- My KingShotで登録済みAPIキーを個別識別できるようにした
- API Poolでも安全なキー先頭部分を表示し、本家画面との照合を可能にした
- API Poolキー詳細をiPhone Safariで開けるようにした
- Mighty対応キーを視覚的に判別できるようにした
- 現在のAPIキー登録処理は通常API有効性確認のみで、登録時Mighty判定を行っていないことを確認
- 次スレで登録時自動Mighty判定を実装する

## 2. リポジトリ

- Repository: kingshot-bj/kingshot-data-platform
- Branch: main
- Stack: Cloudflare Workers / D1 / R2 / Discord認証 / MightPulse API

## 3. APIキー表示仕様

APIキー本体はD1上で暗号化保存。画面・ログにフルキーは表示しない。

今回、暗号化キーをサーバー側で復号し、先頭部分だけを `api_key_prefix` として返すようにした。

表示例は `kss_XXXXXXXX…` 程度。フルキーは返さない。

### Fingerprint

`key_fingerprint` はMightPulse本家のIDではない。

EagleEye側でAPIキーからSHA-256を生成した、EagleEye独自のキー識別値。

用途:
- 重複登録防止
- EagleEye内部で同一キーを識別
- フルAPIキーを表示せずに管理

人間が本家画面と照合する用途ではFingerprintではなく `api_key_prefix` を使う。

## 4. My KingShot

登録済みAPIキー一覧に、各キーの先頭部分を表示。

例:

```
APIキー 1    ✓ 提供済み    kss_XXXXXXXX…
APIキー 2    ⚡ Mighty対応  kss_XXXXXXXX…
```

`getAdvancedEligibility()` から `api_key_prefix` を返す。

関連作業:
- 復号ヘルパーをAPI Pool側から利用可能にした
- My KingShot APIレスポンスへ安全な先頭部分を追加
- My KingShot UIへ表示

## 5. API Pool

### 一覧

提供者名の横に `api_key_prefix` を常時表示。

Mighty対応キーは金色系で `⚡ MIGHTY対応`。
Mighty使用中は `⚡ MIGHTY使用中`。
通常キーは `通常キー`。
未判定は `未確認`。

### 詳細

当初はJavaScriptの `openKey()` 方式だったが、iPhone Safariでタップしても開かない問題が発生。

最終的にHTML標準の `<details>/<summary>` に変更。

ユーザー実機で、カードをタップして詳細が展開することを確認済み。

詳細:
- 状態
- Pool
- 提供者
- 領主
- 王国
- Discord ID
- Mighty
- Mighty判定日時
- Remaining / min
- Remaining / day
- Lease用途
- Lease対象
- 最終使用
- 最終成功
- 最終エラー
- APIキー識別
- Fingerprint

最終関連コミット:
- `6255c2ea278d6a3a3f709721639de8ba6c93e347`
- `d46c384a549b2acd3937ce6b963d99d9f6799fbd`
- `bf7e0394825434a87f129660dc7276693ce5a509`
- `34f9e56f2685003f753731f620de9a96675a781c`

## 6. 実機でのキー照合結果

MightPulse本家にあるユーザーキーのうち、EagleEye API Poolで同一先頭部分と照合できたキーが1本あり、そのキーはMighty対応。

MightPulse本家にある残り2本はEagleEyeには登録されていなかった。

逆にEagleEyeには、本家画面の現在の3本とは一致しない別のユーザー提供キーが1本登録されている。

ユーザーは本家にある未登録2本をRevokeして新規発行し、EagleEyeへ再登録する方針。

※引き継ぎMDには実際のAPIキー文字列・先頭文字列を記録しない。

## 7. 現在のAPIキー登録処理

`registerUserMightPulseApiKeyInternal()` は現在、登録時に以下を実施:

```
入力APIキー
  ↓
MightPulse /kingdoms を呼ぶ
  ↓
通常のMightPulse APIキーとして有効か確認
  ↓
SHA-256 fingerprint生成
  ↓
重複確認
  ↓
USER_CONTRIBUTED Poolへ暗号化保存
```

つまり、現状は登録時にMighty判定していない。

Mighty判定は登録後に別途実行する必要がある。

## 8. 次スレ最重要：登録時自動Mighty判定

ユーザー要望:

「APIキーをPoolへ提供した時点で、通常キーとしてだけでなくMighty対応かどうかも自動確認する。」

推奨フロー:

```
APIキー登録
  ↓
① /kingdoms で通常APIキー有効性確認
  ↓
② Mighty専用APIを1回呼ぶ
  ↓
  ├─ 成功 → mighty_capable=1 / CONFIRMED
  ├─ 403 → mighty_capable=0 / NOT_MIGHTY
  ├─ 429 → 未確認
  └─ 5xx / timeout / retryable → 未確認
  ↓
USER_CONTRIBUTEDとして登録完了
```

重要:
- Mighty判定失敗＝APIキー登録失敗、にはしない
- 通常APIキーとして有効ならPoolには登録する
- Mighty確認だけ一時失敗した場合は未確認として保存し、後から再確認可能にする
- 登録時にMighty専用APIを1回使用することをUIで明示する

## 9. 既存Mighty判定処理

既存のユーザーMightyチェックでは `/kvk/matchups` をMighty確認に使用している。

既存フロー:

```
handleMyMightyCheckApi()
  ↓
USER_CONTRIBUTEDキー取得
  ↓
leaseApiKeyForHealthCheck()
  ↓
mightPulseFetch(env, "/kvk/matchups", ...)
  ↓
成功 → CONFIRMED
403 → NOT_MIGHTY
その他 → transient扱い
```

登録時自動判定でもこの既存ロジックを可能な限り共通化し、新しいMighty判定処理を二重実装しない。

## 10. D1 Mightyメタデータ

`api_pool_keys` に以下が存在:

- `mighty_capable`
- `mighty_checked_at`
- `mighty_check_status`
- `mighty_last_error_code`

Migration:
- `0057_api_pool_mighty_metadata.sql`

本番D1への適用・検証は完了済み。

## 11. ユーザーAPIキー登録数

以前の3本制限は撤廃済み。

現在:
`MAX_USER_CONTRIBUTED_MIGHTPULSE_KEYS = Infinity`

重複Fingerprintは拒否。
Revokedキーはアクティブキー一覧から除外。

## 12. ADMIN / OWNERとMighty

OWNER / ADMINはMighty確認済みでもロール変更しない。

- OWNER → OWNERのまま
- ADMIN → ADMINのまま
- Mighty確認済みならMighty機能を利用可能

My KingShotではOWNER/ADMINに「VIPロールへの昇格」ではなく「Mighty機能の利用確認」を表示する。

## 13. API Pool UIの今後

ユーザーから、現在のAPI Pool詳細画面は全体的に少し大きく、情報量も多いので、全体をもう少し小さくコンパクトにする要望あり。

候補:
- カード縦幅縮小
- 文字サイズを少し縮小
- バッジをコンパクト化
- 詳細展開時の余白縮小
- Fingerprintは技術情報として小さく表示
- `kss_...` は人間の照合用なのでFingerprintより優先して見せる

このコンパクト化はまだ未実装。

## 14. Safari / モバイル注意点

API PoolカードのJavaScriptクリックイベントがiPhone Safariで正常動作しない問題が発生した。

最終的に:
- JSクリック依存をやめる
- `<details>/<summary>` のネイティブ開閉を使用

で解決。

今後API Pool UIを変更する場合も、モバイルSafari実機確認を優先する。

## 15. 確定した設計方針

1. APIキー本体はフル表示しない
2. 人間用照合には `api_key_prefix`
3. EagleEye内部識別にはFingerprint
4. Mighty対応は実際にMighty APIへ投げて判定
5. APIキー登録時に通常API有効性＋Mighty判定を自動実施
6. Mighty判定失敗でも通常APIキーとして有効なら登録
7. OWNER/ADMINはロール変更しない
8. ユーザー提供キー数に上限を設けない
9. D1への不要な広範囲読み取りを増やさない
10. iPhone Safari対応を壊さない

## 16. 次スレ優先順位

### 最優先
APIキー登録時の自動Mighty判定を実装。

### 次
API Pool UIをコンパクト化。

### その後の実機確認
- 新規キー登録
- 通常キー判定
- Mightyキー判定
- 403通常キー
- 429/5xx未確認
- My KingShotのキー先頭表示
- API Poolのキー先頭表示
- API Poolのdetails開閉
- Mighty使用中表示
- OWNER/ADMINロール維持
- D1/API Pool usageへの影響

## 17. セキュリティ注意

- フルAPIキーをログ・画面・JSONに返さない
- `encrypted_key` をAPIレスポンスに含めない
- `key_fingerprint` と `api_key_prefix` は意味が違う
- Mighty判定済みキーは原則 `mighty_capable=1` かつ `mighty_check_status='CONFIRMED'` として扱う
- Mighty専用Pool leaseでは `mighty_capable=1 AND mighty_check_status='CONFIRMED'` を要求
- D1 free-tier readを考慮し、不要な全件取得を増やさない
