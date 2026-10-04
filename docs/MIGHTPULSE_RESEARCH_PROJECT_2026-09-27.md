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


---

# 24. Research Labの上位目的・研究の本質

> **重要：この章はResearch Projectの最上位方針である。**
>
> 以後、研究スレッドが変わっても、この章を読めば「なぜこの研究をしているのか」「何を最終的に実現したいのか」を再説明せずに引き継げることを目的とする。

## 24.1 研究の本質

Research Labの目的は、MightPulseの未公開・未文書化データを見つけること自体ではない。

特定のBattle API、Record API、未文書化includeを発見することも最終目的ではない。

それらはすべて、KingShotのゲーム内部で発生しているプレイヤー状態・戦闘結果・各種補正・英雄能力・スキル挙動などの関係を、実測データから解明するための手段・観測手段である。

Research Labの本質は、

**EagleEyeで正規に取得できる観測データを長期的・多角的に蓄積し、それを研究者であるChatGPTが分析・仮説化・実験・検証することで、KingShotの戦闘システムおよび勝敗を決める要因を可能な限り解明すること。**

である。

## 24.2 最終的な実用目的

研究によって得られた知識を、単なる分析で終わらせない。

最終的には、

**EagleEyeで対戦相手の構成を取得し、その情報をResearch Labで解明された戦闘知識・モデルと組み合わせ、相手に対して自軍がどのような英雄・部隊・構成・戦術を選択すべきかをChatGPTが導き出せる状態**

を目指す。

特にKVK等の実戦において、

1. 相手Playerの構成をEagleEyeから取得する。
2. 相手の英雄・スキル・装備・研究・ステータス・その他取得可能な情報を把握する。
3. Research Labで蓄積・検証された戦闘知識と照合する。
4. 相手構成に対する自軍候補を比較する。
5. 戦闘結果に影響する複数の要因を考慮する。
6. その相手に対して最適と考えられる編成・戦術をChatGPTが導き出す。
7. 実戦結果を再び研究材料としてResearch Labへ戻す。

最終的な価値は、**「相手を調べられるEagleEye」から、「相手を調べ、その相手にどう戦うべきかまで導き出せるEagleEye + Research Lab」へ発展させること**にある。

## 24.3 勝敗を単純なバフ％だけで説明しない

重要な研究原則として、**戦闘の勝敗をバフパーセンテージだけで説明しない。**

バフ％の解析は重要な研究テーマの一つだが、勝敗には複数の要因が関与する可能性がある。

研究対象として少なくとも以下を考慮する。

### プレイヤー側の状態

- 基礎・各種ステータス
- 各種Buff / Debuff
- 装備
- 英雄
- 英雄レベル
- 英雄スキル
- スキル効果
- スキル発動条件
- スキル発動確率
- 研究
- 施設・建築等の補正
- VIP等の補正
- 部隊構成
- 兵種
- その他ゲーム内状態

### 戦闘そのもの

- 攻撃側 / 防御側
- 対戦相手の構成
- 部隊・兵種の組み合わせ
- 英雄の組み合わせ
- スキルの発動順・タイミング
- 発動確率に伴う結果の揺らぎ
- 戦闘条件
- 戦闘中に発生するBuff / Debuff
- その他、観測によって発見される未知の要因

したがって、Research Labでは「バフが高いから勝った」のような単純な説明を最終結論としない。

必要なのは、

**どの要因が、どの条件で、どの程度、戦闘結果に影響したのか**

を可能な限り切り分けることである。

## 24.4 戦闘レポートは答えではなく観測結果

Battle Reportが取得可能になった場合でも、Battle Reportそのものを最終目的としない。

Battle Reportは、戦闘結果、適用された可能性のある補正、部隊状況、英雄・スキル挙動、ダメージ・撃破等、その他戦闘中に観測可能な情報を研究するための観測結果として扱う。

例えば、

「戦闘レポートに攻撃+35%と表示された」

ことだけでは研究完了ではない。

研究者は、

- その35%が何から構成されているのか
- 表示値と実際の戦闘結果にどのような関係があるのか
- 他のステータスとどのように組み合わされているのか
- 英雄スキル等がその結果をどう変化させるのか
- 同一条件で複数回観測した場合に結果がどう変動するのか

を調べる。

## 24.5 最終的に目指す解析モデル

最終的には、以下のようなブラックボックスを段階的に解明する。

    相手Player構成
          +
    自軍Player構成
          +
    英雄
          +
    英雄スキル
          +
    スキル発動確率・条件
          +
    装備
          +
    研究
          +
    Buff / Debuff
          +
    部隊・兵種
          +
    戦闘条件
          +
    その他未知要因
          |
          v
       戦闘内部処理
          |
          v
        戦闘結果

研究者は、この入力から結果までの関係を実測データから分解し、

- 既知の要因
- 強く影響している要因
- 条件付きで影響する要因
- 確率的に影響する要因
- 相互作用している可能性がある要因
- 未知の要因

を分類していく。

最終的には、**実戦前に相手構成を見た段階で、候補となる自軍編成・戦術を比較検討できるだけの戦闘モデルを構築すること**を目指す。

モデルは推測だけで確定しない。

**実測 → 仮説 → 予測 → 実戦/実験 → 結果比較 → モデル更新**

を繰り返し、検証された範囲だけを確度の高い知識として扱う。

## 24.6 研究者としてのChatGPTの役割

Research LabにおけるChatGPTは、単なる検索補助やデータ表示担当ではない。

**ChatGPTが研究者として以下を担当する。**

### 研究設計

- 何がまだ分かっていないかを整理する
- 必要なデータを特定する
- 観測可能な変数を整理する
- 実験条件を設計する
- 比較対象を決める

### 仮説形成

- 観測結果から仮説を作る
- 複数の説明候補を比較する
- 仮説ごとに必要な追加データを決める

### データ解析

- EagleEyeの蓄積データを横断する
- 時系列変化を調べる
- 相関関係を調べる
- 条件別に比較する
- 戦闘結果との関係を調べる
- 確率的な挙動を分析する

### 実験設計・検証

- 仮説を検証するための次の実験を設計する
- 変数をできるだけ切り分ける
- 実験結果を予測と比較する
- 仮説を維持・修正・棄却する

### 実戦への適用

- 相手構成を解析する
- 利用可能な自軍候補を比較する
- 既知の戦闘モデルから対策を導く
- 不確実性がある場合はそれを明示する
- 実戦結果を次の研究材料に戻す

## 24.7 EagleEyeとResearch Labの役割分担

### EagleEye

**観測・収集・蓄積・提示する基盤。**

主な役割:

- Player情報の取得
- Ranking情報の取得
- Watchlist
- Change Event
- API Pool
- D1
- R2
- 長期データ蓄積
- 対戦相手の構成把握
- Research Labへ提供する観測材料の確保

### Research Lab

**蓄積された観測データからゲームの仕組みを解明する研究環境。**

主な役割:

- 未文書化データの探索
- Player Record / Battle / Combat / Report等の調査
- 戦闘データの構造解析
- 戦闘結果の解析
- 英雄・スキル・発動確率の解析
- Buff / Debuffの解析
- 構成・兵種・装備・研究等の影響分析
- 戦闘モデルの構築
- 仮説検証
- 実戦への知識適用

### ChatGPT

**Research Labの研究者。**

EagleEyeが収集したデータを材料として、Research Labの研究計画・解析・仮説形成・検証・実戦への適用を担う。

## 24.8 研究は循環型である

Research Labは、一度モデルを作って終了するプロジェクトではない。

    EagleEyeで観測
          |
          v
      データ蓄積
          |
          v
    ChatGPTが分析
          |
          v
       仮説形成
          |
          v
       実験設計
          |
          v
     実戦・実験
          |
          v
       結果観測
          |
          v
     モデル更新
          |
          v
     次の観測へ戻る

したがって、**Research Labは「APIを探して終わる研究所」ではなく、KingShotの戦闘システムについて継続的に知識を蓄積・更新する研究プロジェクト**である。

## 24.9 最終到達イメージ

    【入力】

    EagleEyeが取得した相手Player情報
      - 英雄
      - 装備
      - 研究
      - 各種ステータス
      - 部隊
      - その他取得可能な構成情報

    +

    自軍の候補情報

            |
            v

    【Research Lab / ChatGPT】

      過去の大量の観測データ
      + 戦闘レポート
      + 英雄スキル解析
      + 発動確率解析
      + Buff / Debuff解析
      + 部隊・兵種相性解析
      + 戦闘モデル

            |
            v

      相手に対する候補編成を比較
            |
            v
      不確実性・条件・リスクも考慮
            |
            v

    【出力】

    「この相手に対して、どの編成・戦術を採用すべきか」

この状態をKVK等の実戦で利用し、**実際の結果を再びResearch Labへ戻してモデルを改善する。**

## 24.10 研究上の重要な区別

今後の研究スレッドでは、以下を混同しない。

| 項目 | 位置付け |
|---|---|
| 未文書化include探索 | 手段 |
| Record探索 | 手段 |
| Battle / Combat / Report探索 | 手段 |
| MightPulseレスポンス構造解析 | 手段 |
| Playerデータ蓄積 | 手段・観測基盤 |
| Battle Report解析 | 重要な研究対象 |
| Buff％解析 | 重要な研究テーマの一つ |
| 英雄スキル解析 | 重要な研究テーマ |
| スキル発動確率解析 | 重要な研究テーマ |
| 部隊・兵種相性解析 | 重要な研究テーマ |
| 戦闘計算モデルの構築 | 研究上の主要目標 |
| 相手構成から最適編成を導く | **最終的な実用目標** |
| KVK等の実戦で活用する | **最終的な実戦目的** |

## 24.11 次スレッドで絶対に失ってはいけない前提

新しい研究スレッドを開始した場合、以下を前提として扱う。

1. Research LabはEagleEye本体とは目的を分けた研究プロジェクトである。
2. MightPulse未文書化データ探索は研究の目的ではなく、研究のための手段である。
3. Battle / Record / Combat / Report探索も手段である。
4. 戦闘勝敗はバフ％だけで説明しない。
5. 英雄、英雄スキル、スキル発動確率、装備、研究、Buff / Debuff、部隊・兵種、戦闘条件、その他未知の要因を含めて研究する。
6. 研究者はChatGPTである。
7. ChatGPTは観測データから仮説を立て、実験を設計し、結果を解析し、モデルを更新する。
8. EagleEyeは相手Playerの構成を含む観測データを取得・蓄積する基盤である。
9. 最終的には、EagleEyeで取得した相手構成を元に、ChatGPTが相手に対する最適な編成・戦術を導き出せる状態を目指す。
10. その最終用途はKVK等の実戦である。
11. 実戦結果は再びResearch Labへ戻し、モデル改善に利用する。
12. 研究は一回限りではなく、継続的な観測→仮説→実験→検証→更新の循環である。

**新しいスレッドでは、この目的をユーザーに再説明させない。**



---

# 25. 王国全体のプレイヤー・同盟発見性調査（2026-10-04）

> **目的**
>
> 「王国情報を取得しただけで、その王国に存在する全プレイヤーのGovernor IDや全同盟を取得できるのか」
> 「ランキング100位以下のプレイヤーをどのように発見できるのか」
> を、公開MightPulse API仕様と現在のEagleEye実装の両面から整理する。
>
> 本章は**調査結果の記録であり、現時点では実装変更を意味しない。**

## 25.1 結論

現時点で確認できる公開API仕様では、

- 王国基本情報APIから王国内の全プレイヤーID一覧は取得できない
- 王国基本情報APIから全同盟一覧は取得できない
- 王国ランキングAPIは1回の取得で最大100件
- 公開仕様上、101位以降を取得するための `page` / `offset` 等のページング仕様は確認できない
- ただし、100位以下のプレイヤーを**必ず取得不能という意味ではない**
- 複数ランキングを横断してプレイヤーを発見する方法がある
- 同盟を発見できれば、同盟Rosterからその同盟のメンバーをまとめて取得できる
- したがって「ランキング100位以下＝取得不能」ではなく、問題の本質は**ランキング外プレイヤーの発見経路**である

---

## 25.2 王国基本情報API

対象:

```
GET /v1/kingdoms/{kid}
```

主目的は王国の集計・概要情報取得。

確認できる代表的な情報:

- 王国ID
- プレイヤー数
- アクティブ人数
- 同盟数
- 王国開設日・経過日数
- 総戦力
- 平均戦力
- 各種戦力
- 王国Health
- 各種王国指標

重要:

**このAPIを取得しただけでは、王国内の全プレイヤーのGovernor ID一覧は得られない。**

同様に、`alliance_count` 等の同盟数を知ることはできても、公開仕様上「王国内の全同盟一覧」をこのAPIから取得する仕組みは確認できない。

---

## 25.3 王国ランキングAPI

対象:

```
GET /v1/kingdoms/{kid}/ranks?limit=100
```

ランキング対象によってプレイヤーまたは同盟の情報を取得できる。

プレイヤー系ランキングでは、対象者の識別に利用できる情報として、

- UID
- Governor ID
- 名前
- スコア / ランキング値

等が取得できる。

同盟系ランキングでは、

- 同盟ID
- 同盟略称（tag / abbr）
- 同盟名
- スコア / 戦力

等を同盟発見に利用できる。

### 重要な制約

公開仕様で確認できるランキング取得は最大100件。

また、現時点の公開ドキュメントでは、

```
page=2
offset=100
start=101
```

等によって101位以降を取得する正式なページング仕様は確認できていない。

したがって、

**「personal_powerの101〜200位を公開ランキングAPIだけで取得する」**

という方法は、現時点では公開仕様上の正規手段として確認できていない。

---

## 25.4 「100位以下は取得不能」ではない

ここは重要。

ランキングAPIの100件制限は、

**プレイヤーデータそのものの取得上限ではなく、プレイヤーをランキング経由で発見できる件数の制約**

と考えるべき。

Governor ID等が既に分かっていれば、

```
GET /v1/players/{id}
```

で、そのプレイヤーがランキング101位以下であっても個別情報を取得できる。

したがって問題は、

> 101位以下のプレイヤーのIDをどう発見するか

である。

---

## 25.5 複数ランキングを横断したプレイヤー発見

KingShotには複数のランキングboardが存在する。

例:

- `personal_power`
- `kills`
- `town_center`
- `hero_total`
- `single_hero`
- `troop_power`
- `building_power`
- `research_power`
- `hero_equip`
- `gov_gear`
- `gov_charm`
- `pet_power`
- `migrant_score`
- `mystic_trial`
- `coliseum`
- `master_power`
- その他公開されているboard

各boardの上位100人を取得してGovernor ID / UIDを集合化すると、

```
personal_power TOP100
        UNION
kills TOP100
        UNION
town_center TOP100
        UNION
hero_total TOP100
        UNION
...
```

という形で、単一ランキングのTOP100を超えて多数のプレイヤーを発見できる可能性がある。

### ただし

これは「王国内全プレイヤーを取得できる」ことを意味しない。

ランキングのどれにも上位100位以内に入らないプレイヤーは、依然としてランキング経由では発見できない可能性がある。

したがって、

**複数ランキング横断 = 発見範囲を広げる方法**

であり、

**全プレイヤー一覧APIの代替が保証されているわけではない。**

---

## 25.6 同盟APIによる別ルート

対象:

```
GET /v1/alliances/{kid}/{tag}?include=info
GET /v1/alliances/{kid}/{tag}?include=roster
```

同盟APIは、王国IDと同盟tag / abbrを指定して対象同盟を取得する方式。

`roster` を利用できれば、対象同盟のメンバーをまとめて取得できる。

代表的なメンバー情報:

- UID
- Governor ID
- 名前
- 戦力
- 役場レベル
- 撃破数
- 同盟内順位
- オンライン状態
- 最終活動日時

等。

したがって、同盟tagを発見できれば、

```
同盟発見
  ↓
/v1/alliances/{kid}/{tag}?include=roster
  ↓
同盟メンバー一覧
  ↓
Governor ID / UIDを取得
```

というプレイヤー発見ルートを作れる。

---

## 25.7 同盟をランキングから発見するルート

同盟ランキング:

```
GET /v1/kingdoms/{kid}/ranks?board=alliance_power&limit=100
```

または、

```
GET /v1/kingdoms/{kid}/ranks?board=alliance_kills&limit=100
```

等から同盟を発見できる。

そこから、

```
同盟ランキング
      ↓
同盟ID / tag / abbr
      ↓
/v1/alliances/{kid}/{tag}?include=roster
      ↓
その同盟の全メンバー
```

と進められる。

これは、ランキングTOP100外のプレイヤーを発見するための重要な別ルートになり得る。

---

## 25.8 同盟経由にも100位制約が残る

同盟ランキング自体も公開仕様では最大100件。

そのため、

```
alliance_power TOP100
```

だけでは101位以下の同盟を発見できない可能性がある。

その結果、

```
101位以下の同盟
   ↓
その同盟に所属するプレイヤー
```

も、同盟ランキングだけを入口にした場合は発見できない可能性がある。

ただし、複数の同盟ランキングや別boardを横断すれば発見範囲を広げられる可能性がある。

---

## 25.9 EagleEye現在実装との関係

2026-10-04時点のmainでは、EagleEye側に既に以下の構造が存在する。

### Kingdom Catalog

`src/kingdom-catalog.js`

```
/kingdoms
 ↓
王国一覧をページ単位で取得
 ↓
kingdom_catalog
```

これは**王国の発見**に使う仕組みであり、王国内プレイヤー一覧取得とは別物。

### Kingdom Seeder

`src/kingdom-seeder.js`

```
/kingdoms/{kid}?include=boards&limit=100
```

を使って王国current state / boardsを取得する。

これも王国内全プレイヤー一覧取得ではない。

### Alliance Catalog / Roller

`src/alliance-catalog.js`

現在の構造では、`kingdom_ranking_current` に保存された、

- `alliance_power`
- `alliance_kills`

等のランキング情報を候補として利用し、

```
ランキング上の同盟
      ↓
同盟Catalog
      ↓
同盟詳細 / Roster
```

へ進む設計になっている。

つまり現在のEagleEye実装自体が、既に

**「ランキングで同盟を発見 → 同盟Rosterからメンバーを取得」**

という発見モデルを採用している。

---

## 25.10 現時点で考えられるプレイヤー発見ルート

### Route A: 単一ランキング

```
王国
 ↓
personal_power TOP100
 ↓
最大100人発見
```

最も単純だが発見範囲が狭い。

### Route B: 複数ランキングUnion

```
王国
 ↓
複数boardを取得
 ↓
各TOP100のGovernor ID / UIDをUnion
 ↓
発見プレイヤー集合
```

単一ランキングより大幅に発見範囲を広げられる可能性がある。

### Route C: 同盟経由

```
王国
 ↓
同盟ランキング
 ↓
同盟tag発見
 ↓
同盟Roster
 ↓
同盟メンバー全員
```

ランキング外プレイヤー発見に有力。

### Route D: 複合

```
王国
 ├─ 複数プレイヤーランキング
 │      ↓
 │   プレイヤーID
 │
 └─ 複数同盟ランキング
        ↓
      同盟tag
        ↓
      同盟Roster
        ↓
      プレイヤーID
             ↓
       IDをUnion
             ↓
       個別Player API
```

現時点では、この複合ルートが「王国のプレイヤー発見範囲を最大化する」という観点で最も有望。

ただし、**全プレイヤーを網羅できることはまだ実測検証されていない。**

---

## 25.11 100位以下調査で今後確認すべき事項

今後、実装を変更する前に以下を実測・確認する。

### A. Ranking pagination

公開仕様にない、

- page
- offset
- cursor
- start
- after
- before

等が正式に利用可能か。

※ 未文書化パラメータを本番実装へ組み込む前に、正規仕様・安定性・利用規約を確認する。

### B. Ranking response

100件制限が、

- API側の固定制限なのか
- デフォルト値なのか
- boardごとの制限なのか

を確認する。

### C. 複数boardの重複率

同一王国について各board TOP100を取得し、

- unique Governor ID数
- board間重複率
- 新規発見人数
- 発見率

を計測する。

### D. Alliance discovery coverage

複数同盟boardから発見できる、

- unique alliance数
- 重複率
- 推定同盟総数に対するカバー率

を確認する。

### E. Roster coverage

発見した同盟のRosterから、

- unique Governor ID数
- ランキング発見IDとの重複
- ランキング未掲載プレイヤー数

を計測する。

### F. 全体coverage

最終的に、

```
複数Player Ranking
+
複数Alliance Ranking
+
Alliance Roster
```

をUnionした場合に、

**王国の推定プレイヤー総数に対して何％を発見できるか**

を測定する。

---

## 25.12 D1 / APIコスト上の注意

この調査を実装へ進める場合、MightPulse APIだけでなくEagleEye側のD1負荷も考慮する。

特に、

```
複数board
 ×
複数王国
 ×
同盟Roster
 ×
Player詳細
```

とすると、API呼び出し数とD1書き込み・読み取りが急増する可能性がある。

現在EagleEyeではD1 free-tier row readsが重要な制約であり、

**「取得可能だから全取得する」設計にはしない。**

まずcoverage / cost / valueを測定し、必要な範囲だけを取得する。

また、既存方針として広範な`ranking_snapshots`再取得クエリを復活させない。

---

## 25.13 現時点の判定

| 調査項目 | 現時点の判定 |
|---|---|
| 王国APIから全プレイヤーID取得 | **確認できず** |
| 王国APIから全同盟一覧取得 | **確認できず** |
| Ranking TOP100取得 | **確認済み** |
| Ranking 101位以降の公開ページング | **未確認 / 公開仕様に記載なし** |
| IDが分かっている101位以下プレイヤー取得 | **可能な個別Player APIの範囲** |
| 同盟Rosterから全メンバー取得 | **可能なルートとして確認** |
| 同盟ランキングから同盟発見 | **可能なルートとして確認** |
| 複数ランキング横断 | **実装上可能な発見戦略** |
| 複数ランキング＋Rosterで全プレイヤー網羅 | **未検証** |
| 100位以下プレイヤー取得不能 | **誤り** |
| 100位以下プレイヤーの発見方法に制約がある | **正しい** |

---

## 25.14 今回の調査から得られた重要な設計上の認識

今回の調査で、問題設定を以下のように修正する。

### 誤った認識

> MightPulseは100位までしかプレイヤーを取得できない。

### 正しい認識

> MightPulse公開ランキングは1boardあたり最大100件という制約がある。
> しかし、IDが分かれば個別Player APIで取得できる。
> したがって問題は「100位以下を取得できるか」ではなく、「100位以下のプレイヤーIDをどう発見するか」である。

この違いはEagleEyeの今後の王国自動収集設計において重要。

---

## 25.15 現段階での推奨方針

現時点では実装変更を行わず、まず**Discovery Coverage Experiment**として実測する。

推奨実験:

1. 代表的な1王国を選ぶ
2. Player系boardを可能な範囲で複数取得
3. Alliance系boardを可能な範囲で複数取得
4. 各同盟のRosterを取得
5. Governor ID / UIDを全て正規化
6. Unionしてunique人数を算出
7. 王国APIのplayer_countと比較
8. どのboard / routeが新規プレイヤー発見に寄与したか計測
9. API request数を記録
10. D1 reads / writesも記録
11. coverageとコストを比較
12. その結果を見て初めて自動収集方式を決定する

この実験結果が出るまでは、

**「全プレイヤーを取得できる」または「100位以下は取得できない」と断定しない。**

---

## 25.16 調査ステータス

調査日:
**2026-10-04**

対象:
- MightPulse公開API仕様
- EagleEye最新main
- Kingdom API
- Kingdom Ranking API
- Alliance API
- Alliance Roster
- 現行Kingdom Catalog
- 現行Kingdom Seeder
- 現行Alliance Catalog / Roller

実装変更:
**なし**

次の研究:
**Discovery Coverage Experiment**

最終的な判断:
**未確定。実測が必要。**
