# MightPulse 未公開データ調査プロジェクト
## Research Project / 2026-09-27

> この文書は EagleEye 本体の開発引き継ぎとは分離した、**MightPulse API / Web UIに存在する可能性のある未公開・未文書化データ構造を調査するための研究記録**である。
>
> 目的は不正アクセスや認証回避ではなく、EagleEyeが正規に利用可能なAPI Pool経由のリクエスト範囲で、公開仕様に記載されていない追加データモデル・include・レスポンス構造の存在可能性を実測すること。

---

## 1. プロジェクト概要

### プロジェクト名

**MightPulse 未公開データ調査 / MightPulse Research Project**

### 開始日

2026-09-27

### 関連システム

- Project: KingShot Data Platform EagleEye
- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- Platform: Cloudflare Workers
- External API: MightPulse API
- API access: EagleEye API Pool
- Research UI: `/admin/mightpulse-research`
- Research API: `/api/admin/mightpulse-research`

### この研究を分離する理由

EagleEye本体の通常機能と、MightPulseに関する仮説検証は目的が異なる。

EagleEye本体:
- プレイヤー検索
- ランキング
- Watchlist
- Change Event
- 通知
- API Pool
- D1最適化

Research Project:
- 公開API仕様に存在しない可能性のあるデータの探索
- Web UIと公開APIの差分調査
- 未文書化includeの実験
- Battle / Record / Mail / Event等のデータモデル存在可能性の検証
- レスポンス構造の観測
- 今後EagleEyeへ正式採用できるデータが存在するかの判断材料作成

---

# 2. 調査の基本原則

## 2.1 正規アクセスのみ

調査は、EagleEyeが既に利用しているMightPulse APIへの正規リクエスト範囲で行う。

禁止:
- 認証回避
- 権限回避
- 隠し管理画面への侵入
- 不正なEndpointへのアクセス
- APIキーの推測
- 他ユーザーの認証情報利用
- レート制限回避
- セキュリティ機構の突破

今回のResearch Labは、既存のPlayer APIに対して追加の`include`候補を指定し、レスポンスの挙動を観測する方式。

---

## 2.2 APIキーをChatGPTへ渡さない

MightPulse APIキー本体はチャットに貼らない。

Research LabはEagleEye内部のAPI Poolを使用する。

UIに表示しない:
- API key本体
- Authorization header
- 生レスポンス
- secret値

---

## 2.3 「存在しない」と「未文書化」を区別する

重要な研究ルール。

例えば:

`include=base,battle`

が400になったとしても、

> 「MightPulseにBattleデータは存在しない」

とは断定しない。

正しくは:

> 「このAPIリクエスト形式ではbattle includeが受理されなかった」

と記録する。

同様に、200になっても、

> 「Battle APIが存在する」

とは即断しない。

レスポンスに実際の新規sectionやデータが含まれているか確認する。

---

# 3. 現時点での公開仕様に関する認識

公開MightPulse API仕様では、現時点で主に以下のデータ群が確認されている。

- Player
- Alliance
- Kingdom
- Ranking系

Playerについては以下のincludeが既知。

- `base`
- `base,ranks`
- `base,heroes,ranks,gov_gear`

またPlayerレスポンスには以下のようなキャッシュ関連フィールドが存在する。

- `fresh`
- `cached_at`
- `age_seconds`

ただし、

**`cached_at`がゲーム側元データの観測時刻を意味するかは未確定。**

この意味については別途MightPulse Probeで実測する。

---

# 4. 研究上の重要な発見

公開API仕様にBattle Report / Mail等が明示されていない一方で、MightPulseのWeb UIにはPlayerの**Record**に相当する表示が存在することを確認している。

ここから以下の仮説を立てる。

### 仮説A

Web UIと公開APIでは利用しているデータモデルが完全には同一ではない。

### 仮説B

PlayerのRecord情報は、Player APIの追加sectionとして取得できる可能性がある。

### 仮説C

Battle関連情報が存在する場合、`battle`という名前ではなく、

- record
- event
- history
- activity
- combat
- report

など別のデータモデルとして表現されている可能性がある。

### 仮説D

Web UI専用の内部APIが存在する可能性はあるが、今回のResearch Labではそこへの不正アクセスを試みない。

---

# 5. Research Lab実装

## 5.1 UI

`/admin/mightpulse-research`

ADMIN / OWNER専用。

## 5.2 API

`/api/admin/mightpulse-research`

## 5.3 実装ファイル

`src/mightpulse-research.js`

## 5.4 リクエスト方式

基本形:

```
/players/{governor_id}?include=base,<candidate>
```

候補ごとに1リクエスト。

---

# 6. 現在のResearch Candidate

現在の候補:

1. `pet`
2. `pets`
3. `mail`
4. `messages`
5. `inbox`
6. `record`
7. `records`
8. `battle`
9. `battles`
10. `battle_report`
11. `battle_reports`
12. `combat`
13. `combat_report`
14. `combat_reports`
15. `report`
16. `reports`
17. `event`
18. `events`
19. `history`
20. `activity`

---

# 7. 1回のResearchで記録する情報

Research Labは以下を結果として取得する。

## Request

- candidate
- requested_include

## HTTP

- HTTP status
- elapsed_ms

## Cache

- fresh
- cached_at
- age_seconds

## Structure

- payload top-level keys
- player keys
- 新規section

## Security

以下は保存・表示しない。

- API key
- Authorization
- raw response

---

# 8. 結果の読み方

## ケース1: HTTP 200 + 新規sectionあり

最重要。

例:

```
candidate = record
status = 200
new_sections = ["record"]
```

この場合、

**そのincludeが実際に新しいデータsectionを返した可能性が高い。**

次に確認:

- sectionの型
- 配列かobjectか
- timestamp
- ID
- event type
- battle関連フィールド
- playerとの紐付け
- データ件数
- 更新頻度

---

## ケース2: HTTP 200 + 新規sectionなし

意味:

> include値はエラーにならなかったが、新しいデータsectionは確認できなかった。

これは「データが存在しない」の証明ではない。

---

## ケース3: HTTP 400

意味:

> そのinclude形式は現在のAPI仕様では受理されなかった。

未公開データ不存在の証明ではない。

---

## ケース4: HTTP 404

意味:

> 該当リクエスト経路・リソースとして認識されなかった。

これも内部データ不存在の証明ではない。

---

## ケース5: HTTP 401 / 403

権限・認証・API Poolの問題を疑う。

研究対象データそのものの存在判定には使用しない。

---

## ケース6: HTTP 429

レート制限。

調査を停止し、時間を置く。

レート制限を回避するための仕組みは作らない。

---

# 9. 明日実施する最初の実験

現在D1が停止中のため、実験はD1復旧後に実施する。

## Step 1

最新mainをDeploy。

## Step 2

ADMIN / OWNERで:

`/admin/mightpulse-research`

を開く。

## Step 3

既知の有効なGovernor IDを入力。

## Step 4

最初から20候補全部を実行せず、以下を優先する。

### 優先度A

1. `record`
2. `records`
3. `battle`
4. `battle_report`
5. `combat`
6. `mail`
7. `messages`

### 優先度B

8. `event`
9. `events`
10. `history`
11. `activity`
12. `report`
13. `reports`

### 優先度C

14. `pet`
15. `pets`
16. `inbox`
17. `battles`
18. `combat_report`
19. `combat_reports`
20. `battle_reports`

---

# 10. 実験結果記録

## Experiment 001

Date:
2026-09-__

Governor ID:
[記録しない / 必要なら内部管理]

### record

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- payload keys:
- player keys:
- observation:

### records

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- observation:

### battle

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- observation:

### battle_report

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- observation:

### combat

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- observation:

### mail

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- observation:

### messages

- HTTP:
- elapsed:
- fresh:
- cached_at:
- age_seconds:
- new_sections:
- observation:

---

# 11. もし有望なsectionが見つかった場合

例えば:

```
record: 200
new_sections: ["record"]
```

となった場合、次の段階へ進む。

## Phase 2

同じGovernor IDについて時間を変えて複数回取得。

推奨:

- T0
- T+30秒
- T+60秒
- T+120秒
- T+5分
- T+15分

比較:

- section hash
- 件数
- ID
- timestamp
- event type
- cached_at
- age_seconds

---

# 12. Battle情報の存在を確認するための判定

Battle関連データが見つかった場合、単にsection名だけで判断しない。

例えば以下のような構造を探す。

- battle_id
- report_id
- attacker
- defender
- attacker_id
- defender_id
- winner
- loser
- troops
- casualties
- kills
- power
- timestamp
- created_at
- occurred_at
- battle_type
- event_type

ただし、フィールド名はMightPulseの実レスポンスを優先する。

---

# 13. Recordの意味を調査する

Recordが見つかった場合、最重要なのは「Recordとは何か」の分類。

候補:

### A. 戦闘記録

Battle / Combat / Report等の情報。

### B. プレイヤー活動履歴

Login / Activity / State change等。

### C. 王国イベント履歴

Kingdom / Event等。

### D. プレイヤー変更履歴

Power / Alliance / Town Center等。

### E. その他

MightPulse独自の履歴モデル。

---

# 14. EagleEyeへの採用条件

研究でデータが取得できたとしても、即座にEagleEye本体へ組み込まない。

最低条件:

1. 正規API経由で安定取得できる
2. レート制限内で運用可能
3. データ構造が一定期間安定
4. データの意味を説明できる
5. 更新頻度が確認できる
6. D1負荷を許容できる
7. API Pool設計に適合する
8. MightPulse利用規約・公開仕様上の問題がない
9. EagleEyeユーザーに提供する価値が明確
10. 既存Player/Watchlist/Change Eventを壊さない

---

# 15. D1との関係

Research Lab自体の研究結果はD1へ保存しない。

理由:

- 研究実験でD1を圧迫しない
- 実験結果は一時的
- 生レスポンスを恒久保存しない
- API Pool usageだけ既存機構で記録される

現在D1 free-tier daily row read limitに到達しているため、D1復旧前のResearch実験は行わない。

---

# 16. API Poolとの関係

Research Labは既存API Poolを利用する。

研究専用API keyを新規発行する設計ではない。

現状:

```
Research Lab
    ↓
EagleEye API Pool
    ↓
MightPulse API
```

これにより本番EagleEyeと研究時のAPI利用状況を同じPool管理体系で扱える。

---

# 17. Rate Limitへの注意

「全候補を調査」は最大20 API requests。

候補は順番に実行する。

並列大量リクエストは行わない。

429が出た場合:

- 実験停止
- cooldown
- API Pool health確認
- 必要なら後日再試験

レート制限を突破する目的の並列化・key rotationは行わない。

---

# 18. 現時点の仮説一覧

| ID | 仮説 | 状態 |
|---|---|---|
| H-001 | MightPulse Web UIと公開APIでデータモデルが完全には同一でない | 未検証 |
| H-002 | Player Record情報が追加includeで取得できる | 未検証 |
| H-003 | Battle情報がRecord/Event/Combat等の別sectionとして存在する | 未検証 |
| H-004 | Battle Report専用Endpointは公開仕様には存在しない | 公開仕様上は未掲載 |
| H-005 | `cached_at`はゲーム元データ観測時刻とは限らない | 検証中 |
| H-006 | 公開APIに記載されていないincludeが存在する可能性がある | 未検証 |

---

# 19. 研究結果の分類

今後、候補ごとに以下のステータスを付ける。

### UNKNOWN

まだ十分に調査していない。

### REJECTED

現在の正規API形式では受理されなかった。

### ACCEPTED_NO_DATA

受理されたが新しいデータsectionを確認できなかった。

### FOUND

新しいsection / データを確認。

### PROMISING

実用価値がありそうで追加実験が必要。

### VERIFIED

複数回の実験でデータ構造・意味・更新挙動を確認。

### EAGLEEYE_CANDIDATE

EagleEye本体への採用候補。

---

# 20. 現在の実装コミット

Research Lab関連:

- `810267dc574ddcbaae429b5ca84f7ec435daf146`
  - `feat: add MightPulse research candidate probe`

- `82d500c751baa3d00af90fd08c099526dbbf733a`
  - `feat: add MightPulse Research Lab`

- `e21d005aeb5d62172ee7afb921fd10f1aec5d1f0`
  - `fix: compare MightPulse Probe with prior result`

現在のEagleEye main基準:
- `cc31dd35fb49bf3151b332bc9e0e52351b96b18e`

---

# 21. 関連するEagleEye文書

本研究とEagleEye本体を混同しない。

本体引き継ぎ:
`docs/EAGLEEYE_HANDOFF_2026-09-27.md`

本研究:
`docs/MIGHTPULSE_RESEARCH_PROJECT_2026-09-27.md`

EagleEye本体の実装仕様は本体handoffを正とする。

MightPulseの未公開データに関する仮説・実験結果は本研究文書を正とする。

---

# 22. 次回開始時の一言

新しい研究スレッドでは:

> 「GitHubの `docs/MIGHTPULSE_RESEARCH_PROJECT_2026-09-27.md` を読んで、最新mainも確認してMightPulse未公開データ調査を続けて。」

と伝える。

---

# 23. 研究のゴール

最終的な目的は「隠しAPIを見つけること」ではない。

目的は、

**MightPulseがEagleEyeから正規に取得可能なデータ範囲を実測し、KingShotのプレイヤー・戦闘・履歴・イベント情報をどこまで高精度に扱えるかを明らかにすること。**

特に以下を明らかにする。

1. Player Recordの正体
2. Battle / Combat / Report系データの存在
3. Mail / Message系データの存在
4. Event / Activity / History系データの存在
5. 各データの更新頻度
6. cached_at / age_secondsの意味
7. API Poolでの現実的な取得コスト
8. EagleEye本体への採用可能性

この研究結果をもとに、将来的にEagleEyeの機能範囲を拡張する。
