# EagleEye 運用コスト・広告収益・D1負荷計測計画
## 2026-09-27 / 明日以降の実測用

この文書は、EagleEyeを「無料利用＋最低限の広告」で運営できるかを、実測値から判断するための計測・シミュレーション基準。

## 1. 方針

- EagleEyeは原則無料利用を維持する。
- 現時点では月額課金を前提にしない。
- 広告は必要最低限とし、広告過多によるUX悪化を避ける。
- 広告収益でCloudflare等の運用費を賄える構造を目指す。
- 無料枠を超えた場合は、まずCloudflare Paidへの移行を候補とする。
- Paid化してもアプリケーション設計を作り直さず継続できる構造を維持する。
- MightPulse APIはEagleEyeにとってAPI利用料の主要コストではない。無料APIであることを前提に、APIキーのrate/day制限とAPI Pool容量を管理する。
- 実測前に「何人まで使える」と断定しない。

## 2. 明日最優先で測るもの

D1の無料枠制限が解除された後、実際のEagleEye操作について計測する。

### D1
- rows_read
- rows_written
- 可能ならクエリ単位のrows_read
- 可能ならEXPLAIN QUERY PLAN
- 操作前後のD1使用量

### Workers
- request数
- CPU使用量
- 主要API endpointごとの呼び出し回数

### MightPulse
- API request数
- endpoint別request数
- API Pool key別request数
- 1日上限に対する使用率

### Watchlist
- 王国Watchlist 1件の更新/取得で発生するD1負荷
- Player Watchlist 1件の更新/取得で発生するD1負荷
- Watchlist件数を増やした場合の増加率
- polling/refresh頻度による増加率

## 3. 必ず分けて計測する対象

### A. Player Watchlist
例:
- 1ユーザー
- Player Watchlist 1 / 5 / 20 / 50 / 100件
- 手動確認
- 通常利用
- 高頻度利用

確認する:
- 1回のGET/更新
- 1日あたり
- 1ユーザーあたり
- D1 rows_read / rows_written

### B. Kingdom Watchlist
例:
- 王国Watchlist 1 / 3 / 5 / 10件
- 26 boards
- 手動確認
- 通常利用
- 高頻度利用

確認する:
- 1回の取得/更新
- 1王国あたり
- 1ユーザーあたり
- D1 rows_read / rows_written

### C. 共存ケース
必ず以下も測る。

- Kingdom Watchlist 1 + Player Watchlist 5
- Kingdom Watchlist 3 + Player Watchlist 20
- Kingdom Watchlist 5 + Player Watchlist 50
- Kingdom Watchlist 10 + Player Watchlist 100

## 4. 重要な考え方

Watchlist件数だけでは負荷を判断しない。

負荷は概念的に、

ユーザー数 × Watchlist件数 × 監視頻度 × 1回あたりのDB負荷

で決まる。

同じ「王国Watchlist 1件」でも、

- 手動で1日数回見る
- 数十分ごとに確認する
- バックグラウンド監視する

では負荷が大きく異なる。

## 5. ユーザーシナリオ

### LIGHT
- Kingdom Watchlist: 1
- Player Watchlist: 5
- 低頻度利用

### NORMAL
- Kingdom Watchlist: 3
- Player Watchlist: 20
- 通常利用

### HEAVY
- Kingdom Watchlist: 10
- Player Watchlist: 100
- 高頻度利用

各シナリオについて1日あたりのrows_read / rows_writtenを算出する。

## 6. 無料枠シミュレーション

D1 Freeの実際の当該プラン上限を基準にする。

計算:

1ユーザー1日あたりのrows_read
× ユーザー数
= 1日総rows_read

同様にrows_writtenも計算する。

その後、

無料枠上限 ÷ 1ユーザーあたりの1日使用量

から理論上のユーザー上限を算出する。

ただし実運用では100%まで使い切らず、安全余裕を設定する。

目安として:
- GREEN: 50%未満
- YELLOW: 50〜70%
- ORANGE: 70〜85%
- RED: 85%超

この色分けは運用上の目安であり、Cloudflareの公式警告基準ではない。

## 7. Paid移行後のシミュレーション

Free枠を超えた場合を想定してPaid側でも同じ計算を行う。

比較する:

- Free月額: 0円
- Paid基本料金
- D1 read超過
- D1 write超過
- D1 storage
- Workers request超過
- Workers CPU超過

円換算はシミュレーション実施時点の為替で計算し、固定レートを設計値として保存しない。

## 8. 広告収益シミュレーション

広告はクリックされることだけを収益条件として考えない。

基本モデル:

月間広告表示数
× 実測/広告サービスのRPM
÷ 1,000
= 月間広告収益

RPMは広告サービス、地域、ユーザー、広告形式等で変動するため、事前に固定値を断定しない。

最低3ケースを作る:

- LOW RPM
- BASE RPM
- HIGH RPM

実際の広告導入後はEagleEye自身の実績RPMを優先する。

## 9. 広告量の決め方

広告を先に大量配置しない。

先に必要運営費を算出する。

必要広告収益
÷ 1,000
× 1,000 / RPM

から必要月間広告表示数を算出する。

その後、

必要月間広告表示数
÷ 月間アクティブユーザー
÷ 1ユーザーあたり月間PV

から、1PVあたりに必要な広告表示数を考える。

目的は「広告を最大化する」ことではなく、

「サービス維持に必要な最低限の広告量」

を求めること。

## 10. ヘビーユーザーの考え方

EagleEyeでは利用量が多いユーザーほど、

- 検索回数
- プレイヤー詳細閲覧
- ランキング閲覧
- Player Watchlist確認
- Kingdom Watchlist確認

が増える想定。

したがって、

利用量 ↑
→ D1/Workers使用量 ↑
→ ページ閲覧 ↑
→ 広告表示 ↑
→ 広告収益 ↑

という関係を確認する。

ただし、広告収益が必ずコスト増加を上回るとは仮定しない。実測で検証する。

## 11. 広告UX方針

禁止したい方向:
- 常時広告だらけ
- 同じ画面で過剰表示
- 操作のたびに強制広告
- 広告クリックをユーザーに促す設計
- データ閲覧を不必要に広告で妨害する

優先する方向:
- 画面下部等の自然な広告枠
- 表示頻度を制御
- 同一ユーザーへの過剰表示を抑制
- EagleEyeの主要操作を邪魔しない
- 必要運営費を満たす最低限の広告量

## 12. 最終的に出す数字

明日の実測後、最低限以下を表にする。

| 指標 | LIGHT | NORMAL | HEAVY |
|---|---:|---:|---:|
| Kingdom Watchlist | 1 | 3 | 10 |
| Player Watchlist | 5 | 20 | 100 |
| D1 read/user/day | 実測 | 実測 | 実測 |
| D1 write/user/day | 実測 | 実測 | 実測 |
| Workers req/user/day | 実測 | 実測 | 実測 |
| MightPulse req/user/day | 実測 | 実測 | 実測 |
| 月間PV | 実測/推定 | 実測/推定 | 実測/推定 |
| 月間広告表示 | 実測/推定 | 実測/推定 | 実測/推定 |
| 広告収益 | シミュレーション | シミュレーション | シミュレーション |
| Cloudflare費用 | シミュレーション | シミュレーション | シミュレーション |
| 差引 | シミュレーション | シミュレーション | シミュレーション |

## 13. ユーザー数シミュレーション

最低限:

- 10 users
- 50 users
- 100 users
- 500 users
- 1,000 users
- 5,000 users
- 10,000 users

について計算する。

さらにWatchlistの組み合わせを変えて、

- 平均ユーザー
- ヘビーユーザー比率
- Watchlist利用率

を変数にする。

## 14. D1設計上の絶対条件

広告収益を増やすために無駄なDBアクセスを増やしてはいけない。

特に禁止:
- ranking_snapshotsの全件取得
- 最新100/1000/5000件の広域取得
- ユーザーごとの不要なN+1
- 無期限履歴を毎回読み込む
- UI表示に不要な列/履歴の取得

D1は「必要な対象・必要な期間・必要な列」だけ読む。

## 15. 将来のデータ配置

短期・現在状態:
- D1

大量履歴/アーカイブ:
- Google Sheets / R2等を候補

将来的にD1を「現在状態・監視制御・必要な短期データ」に集中させ、古い大量データを外部へ逃がせる構造を維持する。

## 16. 明日の作業順

1. D1制限解除を確認
2. 現在のmain/deploy状態を確認
3. Kingdom Watchlistを実測
4. Player Watchlistを実測
5. 両方を組み合わせて実測
6. D1 rows_read / rows_writtenを記録
7. Workers使用量を記録
8. MightPulse API使用量を記録
9. LIGHT/NORMAL/HEAVYを作成
10. 10〜10,000ユーザーでシミュレーション
11. Free枠限界を算出
12. Paid移行後の限界も算出
13. 広告表示数を仮定
14. LOW/BASE/HIGH RPMで広告収益を算出
15. 「最低限必要な広告量」を決定
16. 広告UXを設計

## 17. 注意

- 本文書は「計測計画」であり、現時点の実測値ではない。
- Cloudflare料金・無料枠等の数値は変更される可能性があるため、実測/シミュレーション時点で公式料金表を再確認する。
- MightPulse APIの無料利用を前提とするが、API rate/day制限は別途監視する。
- 広告収益は広告サービスの実績値を優先し、仮RPMを実績のように扱わない。
- ユーザー数上限は理論値だけでなく安全余裕を含めて判断する。
- 本番環境未確認の値を「実測値」と呼ばない。
