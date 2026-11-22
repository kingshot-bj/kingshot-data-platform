# キングショットのゲーム知識（EagleEye の表示・分析を作るときの前提）

最終更新：2026-11-15。出典はファン運営の攻略サイト・Wiki・公式 X（下の「出典」）。公式の仕様書は無いので、数値や細かい仕組みは「コミュニティの調査」として扱い、断定しない。

## いちばん大事な前提：総力は強さと比例しない（オーナー確認済み）

- ゲーム内の「個人総力」「同盟総力」「王国の総力」は、**兵士・建物・研究・領主装備・英雄などの点数を足した合計**。兵士は数と段階（T1〜T10、黄金兵 TG）で大きく増え、建物の強化でも増える。
- そのため **総力が近い2人（2つの王国）でも、戦闘の強さは大きく違うことがある**。総力が低くても、攻撃・殺傷力・兵種の組み合わせ・英雄装備が強ければ、総力が高い相手に勝てる。
- EagleEye では、**総力を「強さ」「勝ちやすさ」として書かない**。総力のランキングは「総力（規模）の順位」としてだけ出す。勝敗の予想もしない（今までどおり）。

## 戦闘で効くもの（コミュニティの解説）

- **兵士の能力値**：攻撃・防御・殺傷力（Lethality）・HP。研究・英雄装備・領主装備・宝石（チャーム）・英雄スキルで上がる。
- **兵種の相性**：歩兵 > 騎兵 > 弓兵 > 歩兵。歩兵は前衛（壁）、弓兵は主なダメージ源、騎兵は中衛。編成の比率で結果が変わる。
- **兵士の段階**：T1〜T10・黄金兵（TG）。上の段階ほど1体あたりの能力も総力も高い。
- **英雄**：遠征スキル（集結・駐屯・遠征で効く）と討伐スキル（討伐＝英雄だけで戦う）。世代（第1〜第7世代…）が新しいほど強い傾向。
- **行軍の兵数（March Capacity）**：一度に送れる兵士の数。

## 集結（ラリー）と駐屯

- 集結では、**集結主（リーダー）の英雄・英雄装備・領主装備・能力値が使われる**。参加者の英雄装備や領主装備は効かないとする解説が多い。
- 参加者で効くのは、**送る兵士の数と段階**、そして**英雄の遠征スキルのうち一番上のもの**など。
- そのため KvK や聖剣争奪では、**集結を主催するトップ層の強さ**で結果が決まりやすい（EagleEye の KvK 組み合わせが「総力ではなく秘境の試練の1位の記録」で比べているのはこのため）。

## イベント

- **KvK（Kingdom of Power／王国対抗戦）**：2つの王国が組み合わされる。まず**準備フェーズ（約5日）**で日替わりのお題をこなしてポイントを競い、勝った王国が**戦闘フェーズ**で相手の王城を攻める側になる（自分の王城は守られる）。王城を一定時間（2.5〜3時間とする解説がある）占領した同盟が勝ち。準備フェーズの勝敗がとても大事。
- **秘境の試練（Mystic Trial）**：2025-10-28 のアップデートで追加（公式 X）。役場19で解放。6つの種類（闘技場・生命の森・水晶鉱山・知識の枢軸・溶岩要塞・輝光の塔）を週替わりで進める PvE。**月〜土は全員同じ兵士で挑む**ので、兵士の数ではなく**アカウントの育成（英雄・装備・研究など）の強さ**が出やすい、とする解説がある。種類ごとに試される要素が違う（例：闘技場は英雄と英雄装備）。→ EagleEye では「総力より強さに近い目安」として使える。
- **聖剣争奪（Swordland Showdown）**：隔週の日曜。同盟総力の上位20同盟が参加できる、とする解説がある。組み合わせの決め方は解説によって違う（相手の戦力・部隊の戦力・勝率など）。ゲームの外からは組み合わせが分からない（EagleEye では同盟の R4・R5 に登録してもらっている）。
- **熊狩り（Bear Hunt）**：同盟の集結で熊にダメージを与える PvE。弓兵の殺傷力・攻撃が大事とする解説が多い。

## EagleEye での書き方のルール

- 表示は**「総力」に統一**（2026-11-15・ゲームの表記に合わせた。以前は「総戦力」）。**規模の数字**として説明する。「強い王国」「強さの順位」とは書かない。
- 強さの目安として出すなら、**秘境の試練の記録**（特に月〜土の同条件の部分）・**英雄の総力**・**撃破数**など、総力以外の数字を組み合わせ、どれも「目安」と書く。
- 勝敗の予想はしない。ゲーム内の仕様を断定せず、分からないことは書かない。

## 出典（2026-11-15 に検索。各サイトはこの環境から直接は開けなかったため、検索結果の要約に基づく）

- 総力の内訳と、総力が戦闘効率を表さないという解説：[WIN Kingshot Guide「Power in Kingshot explained」](https://kingshotwin.com/how-power-works/)、[The Lie of Troop Statistics](https://www.kingshotapp.com/guides/the-lie-of-troop-statistics-combat-formula)
- 集結・駐屯の仕組み：[KingShot rally, garrison & troop mechanics](https://kingshotsim.com/rally-and-troops)、[Rallies - WIN Kingshot Guide](https://kingshotwin.com/guides/gameplay/rallies/)、[Advanced Rally Guide](https://kingshotguides.com/guide/advanced-rally-guide/)
- 兵種の相性・能力値：[Battle Mechanics Guide](https://kingshotmastery.com/guides/battle-mechanics-guide)、[Troops Guide](https://kingshotmastery.com/guides/kingshot-troop-guide)
- 装備：[Kingshot Gear Guide](https://kingshotmastery.com/guides/kingshot-gear-guide)、[アルテマ 領主装備・英雄装備育成論](https://altema.jp/kingshot/soubiikusei)、[アルテマ 装備強化の優先度](https://altema.jp/kingshot/soubikyouka)
- KvK：[Kingdom of Power - Kingshot Wiki](https://kingshotwiki.com/events/kingdom-of-power/)、[Kingshot KvK Guide (wizardstower)](https://wizardstower.com/guides/kingshot/kvk)
- 秘境の試練：[Kingshot 公式 X（2025-10-28 アップデート）](https://x.com/Kingshot_Mobile/status/1983013662462812545)、[Mystic Trial Guide (kingshotpro)](https://kingshotpro.com/mystic-trial-guide.html)
- 聖剣争奪：[Swordland Showdown - Kingshot Wiki](https://kingshotwiki.com/events/swordland-showdown/)
