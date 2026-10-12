# EagleEye × MightPulse ランキング完全データマップ

最終更新: 2026-09-25

## 1. 最優先要件

EagleEye の Watchlist に登録されたプレイヤーについて、**ランキング情報を第一級データとして取得・保存・表示・履歴化する**。

「プレイヤー詳細の戦力等だけ取得して、ランキングは後回し」は採用しない。

ランキングは次の2系統を両方扱う。

1. **プレイヤー自身の順位情報** — MightPulse `/v1/players/{governor_id}?include=ranks`
2. **王国ランキングボードそのもの** — MightPulse `/v1/kingdoms/{kid}/ranks`

これにより、Watchlist の対象者が上位100位外でも、そのプレイヤー自身の順位を取得できる。一方、王国内ランキングの上位一覧・他プレイヤーとの比較にはランキングボードを使用する。

## 2. Watchlistは2階層にする

### Player Watchlist

特定プレイヤーを監視対象にする。

- 基本情報
- 戦力・役場・撃破等の変化
- **全ランキングの本人順位**
- ランキング順位/スコア変動
- 同盟所属変化
- 将来のHeroes / Governor Gear等

### Kingdom Watchlist

王国そのものを監視対象にする。

王国Watchlistでは、その王国について次を重点監視する。

- 王国基本統計
- 王国総戦力・平均戦力
- プレイヤー数/活動人口
- 同盟数
- 王国の各種順位
- **全26ランキングボード**
- 各ボード上位100件
- ボード内の順位/スコア変動
- Watchlist Playerがどのランキングに入っているか
- 同盟ランキング
- 将来的な王国状態/成長指標

Player WatchlistとKingdom Watchlistは別物だが、関連付ける。

例:

`Kingdom K123` を監視 → K123内の全ランキングを取得  
`Player 249629710` を監視 → 本人の全順位を取得  
両方を監視 → Playerの所属王国ランキング内での位置を横断表示

**王国Watchlistを追加してもランキング取得をプレイヤー単位で重複実行しない。**

## 3. MightPulse ランキングAPI

公式API仕様では、プレイヤーの `ranks` に以下が含まれる。

- power / power_rank
- kills / kills_rank
- town_center_level / town_center_rank
- migrant_score / migrant_rank
- mystic_trial / mystic_rank
- leaderboards[]: name / value / kingdom_rank

王国ランキングは `GET /v1/kingdoms/{kid}/ranks?limit=100` または `board` 指定で取得できる。

公式仕様上の全ランキングボード:

| # | board | 対象 |
|---:|---|---|
| 1 | alliance_power | Alliance |
| 2 | alliance_kills | Alliance |
| 3 | personal_power | Player |
| 4 | kills | Player |
| 5 | town_center | Player |
| 6 | rebel_conquest | Player |
| 7 | single_hero | Player |
| 8 | hero_total | Player |
| 9 | troop_power | Player |
| 10 | building_power | Player |
| 11 | research_power | Player |
| 12 | hero_no_equip | Player |
| 13 | hero_equip | Player |
| 14 | gov_gear | Player |
| 15 | gov_charm | Player |
| 16 | pet_power | Player |
| 17 | island_prosperity | Player |
| 18 | migrant_score | Player |
| 19 | mystic_trial | Player |
| 20 | coliseum | Player |
| 21 | forest_of_life | Player |
| 22 | crystal_cave | Player |
| 23 | knowledge_nexus | Player |
| 24 | molten_fort | Player |
| 25 | radiant_spire | Player |
| 26 | master_power | Player |

**合計26ボードを網羅対象とする。**

公式仕様ではランキング取得の `limit` は1〜100（既定100）。

## 4. Watchlist に対する必須データ

Watchlist Player A について最低限次を保持する。

### 3.1 個人順位

- 戦力順位
- 撃破数順位
- 役場レベル順位
- 移民スコア順位
- ミスティック・トライアル順位

### 3.2 全26ランキングとの対応

王国ランキング側から取得できる場合:

- board
- rank
- score
- player identity
- alliance identity（Alliance board の場合）
- observed_at
- source observation

さらに、Watchlist対象者については**上位100位に入っていないボードでも個人 `ranks` の順位を保持する**。

## 5. データ取得戦略

MightPulse のfreshness判定は include/section 単位で行われるため、プレイヤー取得を常に全includeで叩く設計にはしない。

### Watchlist優先

Watchlist対象者:

1. base
2. ranks ← **最優先**
3. 必要に応じ heroes
4. 必要に応じ gov_gear

王国ランキング:

- 26 board を個別に取得可能な設計にする。
- 同じ王国・同じboardについて重複取得しない。
- Watchlist対象者が存在する王国を優先する。
- 取得結果はD1へスナップショット保存する。

### API制限

MightPulseは1キーあたり60 req/min、5,000 req/day。

したがって「Watchlist 1人ごとに26 boardを取得」はしない。

**王国×boardを共有データとして取得し、その結果をWatchlist全員で再利用する。**

## 6. 履歴

ランキングは現在値だけでなく時系列を保存する。

最低限:

- observed_at
- rank
- score
- target
- board
- source observation

これにより、

- 順位上昇/下降
- スコア増減
- ランキング圏外→圏内
- 圏内→圏外
- Watchlist追加前後の履歴比較

を実装できる。

## 7. ランキング変動イベント

将来のChange Eventではランキングも対象にする。

例:

- RANK_UP
- RANK_DOWN
- RANK_IN
- RANK_OUT
- SCORE_UP
- SCORE_DOWN

ただし、順位変動判定は**同一board・同一王国・同一target**の時系列比較で行う。

## 8. Freshness

MightPulseのwrapper:

- fresh
- cached_at
- age_seconds

を保存対象とする。

EagleEyeでは少なくとも:

- FRESH
- CACHED
- STALE_FALLBACK

を区別する。

「取得要求を送った時刻」と「MightPulseが保持しているランキングの時点」は同じとは限らない。

## 9. 実装優先順位

1. ランキングデータモデル
2. MightPulseランキング取得クライアント
3. 王国×26 boardの保存
4. Player ranksの保存
5. Watchlistとランキングの紐付け
6. ランキング履歴
7. ランキング変動検知
8. UI
9. 通知

ランキングをUIだけ先に作らず、**取得→保存→履歴→Watchlist→表示**の順で実装する。

## 10. 正式なデータ境界

- MightPulse raw response: source of truth for provider response
- EagleEye normalized ranking snapshot: query/history source
- Watchlist: 「誰を重点監視するか」
- Ranking board: 「王国内で誰がどの順位か」
- Player ranks: 「対象者本人が各ランキングで何位か」

この2系統を混同しない。

## 11. 公式仕様

MightPulse公式API:
https://api.mightpulse.com/

仕様確認日: 2026-09-25


## 12. 2026-10-13 追記：プレイヤー比較でのランキング活用と未検証境界

関連調査記録: [EAGLEEYE_PLAYER_COMPARE_RANKING_INVESTIGATION_2026-10-13.md](./EAGLEEYE_PLAYER_COMPARE_RANKING_INVESTIGATION_2026-10-13.md)

### 比較機能で忘れてはいけないこと

- ユーザーが比較したい「領主装備・領主宝石・英雄育成・ペット等の強さの目安」は、個別装備の内部数値を別APIで直接取得できる前提ではなく、**ゲーム内の各ランキング値・順位を通じて比較する**。特に「秘境の試練」内に並ぶ各ランキング項目を、項目ごとに独立した比較対象として扱う。
- 個別装備や育成値がAPIから直接返ることを仮定してはならない。今回の静的コード調査だけでは、実レスポンス内の該当値・実際の取得成功・保存済みpayloadの充足を確定できていない。
- 「秘境の試練」のランキングは、バフ値や絶対的な戦闘力そのものと同義だと断定しない。ゲーム内表示名とランキングの意味を照合して使う。
- 総力は兵士数などの影響を受けるため、戦闘力そのものとして扱わない。VIP・座標・プロフィール情報はプレイヤー詳細向けで、戦闘比較の主項目に混ぜない。
- UIは小さめの円形グラフを複数配置し、設定から表示項目・順番を変更可能にする方針。ただし、円の割合に変換できる意味の明確な数値がある項目だけを円グラフ化し、順位・スコア・レベル等の尺度を混同しない。尺度が適切でない場合は数値・順位・差分で表示する。

### 実装前に必要な確認

1. 実MightPulseレスポンスの `ranks` / `leaderboards[]` の形を確認する。
2. 保存Observation payloadで実値が存在することを確認する。
3. 比較API JSONに値・順位が届いていることを確認する。
4. 最後にUI表示へ届いていることを確認する。

**「コードに取得処理がある」と「実データが取得・保存・表示されている」は別の判定である。実データの端から端までの確認が終わるまで、比較グラフ実装を完了扱いにしない。**
