// 動画（CM）のひな形。scripts/social/scenes/*.json と同じ中身（tests/social-video.test.mjs で一致を確かめる）。
// 場面ファイルを足したら：node scripts/social/sync-video-presets.mjs
export const VIDEO_PRESETS = Object.freeze({
 "alliance-compare": {
  "name": "alliance-compare",
  "title": "同盟比較（聖剣争奪の下見）",
  "output": "eagleeye-alliance-compare.mp4",
  "post": [
   "聖剣争奪の相手、どれくらい強い？「EagleEye」の同盟比較で、上位3人の秘境の試練をステージごとに比べられます。",
   "{host}",
   "",
   "#キングショット #KingShot #聖剣争奪"
  ],
  "scenes": [
   {
    "slide": "text",
    "heading": "聖剣争奪の<br>相手を下見",
    "sub": "EagleEye の同盟比較",
    "seconds": 3
   },
   {
    "page": "/alliance/compare?a=1524:Pen&a=1537:LOL",
    "caption": "違う王国の同盟どうしを比べられる",
    "seconds": 4,
    "scroll": 300,
    "login": true
   },
   {
    "page": "/alliance/compare?a=1524:Pen&a=1537:LOL",
    "caption": "上位3人の秘境の試練を<br><b>ステージごと</b>に並べて比較",
    "seconds": 7,
    "scroll": 2600,
    "login": true
   },
   {
    "slide": "signup",
    "seconds": 5
   },
   {
    "slide": "outro",
    "seconds": 3
   }
  ]
 },
 "duel-data": {
  "name": "duel-data",
  "title": "領主対決：データで見る（総力≠強さ）",
  "output": "eagleeye-duel-data.mp4",
  "post": [
   "総力が大きい方が、秘境の試練では負けていた——KvK S23 の決着がついた1,073組のうち592組（55%）。",
   "領主対決の相手も、総力だけで判断しないで秘境の試練で比べよう⚔️",
   "{host}",
   "",
   "#キングショット #KingShot #領主対決"
  ],
  "scenes": [
   {
    "slide": "text",
    "heading": "総力で勝ってる<br>＝勝てる？",
    "sub": "KvK S23 の組み合わせを調べた",
    "seconds": 3
   },
   {
    "slide": "text",
    "heading": "総力が大きい方が<br>秘境の試練で負けた<br>55%",
    "sub": "1,073組中592組（EagleEye 調べ）",
    "seconds": 4
   },
   {
    "page": "/reports/kvk-s23-matchups",
    "caption": "総力に2割以上の差があっても<br><b>360組</b>は秘境の試練で逆転",
    "seconds": 5,
    "scroll": 900
   },
   {
    "page": "/player/compare?governor_id=222916605&governor_id=227081160",
    "caption": "領主対決の相手も<br><b>秘境の試練</b>で比べよう",
    "seconds": 5,
    "scroll": 2600,
    "login": true
   },
   {
    "slide": "outro",
    "seconds": 3
   }
  ]
 },
 "duel-howto": {
  "name": "duel-howto",
  "title": "領主対決：相手を下見する3ステップ",
  "output": "eagleeye-duel-howto.mp4",
  "post": [
   "領主対決の相手を3ステップで下見👀",
   "①名前で検索 ②英雄・装備をチェック ③自分と並べて秘境の試練を比較",
   "{host}",
   "",
   "#キングショット #KingShot #領主対決"
  ],
  "scenes": [
   {
    "slide": "text",
    "heading": "領主対決の相手を<br>3ステップで下見",
    "sub": "EagleEye の使い方",
    "seconds": 3
   },
   {
    "page": "/players",
    "caption": "① 相手の<b>名前</b>や領主IDで検索",
    "seconds": 4,
    "scroll": 200,
    "login": true
   },
   {
    "page": "/player?governor_id=222916605",
    "caption": "② <b>英雄・部隊</b>までチェック",
    "seconds": 5,
    "scroll": 700,
    "login": true
   },
   {
    "page": "/player/compare?governor_id=222916605&governor_id=227081160",
    "caption": "③ 自分と並べて<br><b>秘境の試練</b>を比較",
    "seconds": 5,
    "scroll": 2600,
    "login": true
   },
   {
    "slide": "signup",
    "seconds": 5
   },
   {
    "slide": "outro",
    "seconds": 3
   }
  ]
 },
 "duel-short": {
  "name": "duel-short",
  "title": "領主対決：15秒ショート",
  "output": "eagleeye-duel-short.mp4",
  "post": [
   "相手の総力、信じてる？👀",
   "見るべきは秘境の試練。EagleEye でステージごとに比べられる。",
   "{host}",
   "",
   "#キングショット #KingShot #領主対決"
  ],
  "scenes": [
   {
    "slide": "text",
    "heading": "相手の総力<br>信じてる？",
    "sub": "領主対決⚔️",
    "seconds": 2.5
   },
   {
    "page": "/player/compare?governor_id=222916605&governor_id=227081160",
    "caption": "見るべきは<br><b>秘境の試練</b>",
    "seconds": 5.5,
    "scroll": 2600,
    "login": true
   },
   {
    "slide": "text",
    "heading": "相手の実力を<br>先にチェック",
    "sub": "EagleEye（無料）",
    "seconds": 2.5
   },
   {
    "slide": "outro",
    "seconds": 3
   }
  ]
 },
 "features": {
  "name": "features",
  "title": "機能紹介（登録するとできること）",
  "output": "eagleeye-features.mp4",
  "post": [
   "キングショットの王国・同盟・プレイヤーのデータが無料で見られる「EagleEye」。",
   "ランキング・KvK・プレイヤー比較・聖剣争奪の同盟比較まで。",
   "{host}",
   "",
   "#キングショット #KingShot #聖剣争奪"
  ],
  "scenes": [
   {
    "slide": "title",
    "seconds": 3
   },
   {
    "page": "/",
    "caption": "キングショットの王国・プレイヤーのデータが<b>無料</b>で見られる",
    "seconds": 4,
    "scroll": 500
   },
   {
    "page": "/kingdom/rankings?kid=1524&board=hero_total",
    "caption": "王国ランキング<br>戦力・英雄・秘境の試練など",
    "seconds": 4,
    "scroll": 700
   },
   {
    "page": "/kvk",
    "caption": "KvKの対戦相手とスコアの推移",
    "seconds": 4,
    "scroll": 500
   },
   {
    "page": "/player?governor_id=222916605",
    "caption": "<b>無料登録</b>で、英雄の装備・領主装備まで見られる",
    "seconds": 5,
    "scroll": 1400,
    "login": true
   },
   {
    "page": "/player/compare?governor_id=222916605&governor_id=227081160&governor_id=224984906&governor_id=228822223&governor_id=227052663&governor_id=227331459",
    "caption": "最大6人を比較して、画像で共有",
    "seconds": 5,
    "scroll": 900,
    "login": true
   },
   {
    "page": "/alliance/compare?a=1524:Pen&a=1537:LOL",
    "caption": "同盟比較で<b>聖剣争奪</b>の下見<br>秘境の試練をステージごとに",
    "seconds": 6,
    "scroll": 2600,
    "login": true
   },
   {
    "page": "/settings/theme",
    "caption": "着せ替えで好きな色に",
    "seconds": 3,
    "scroll": 300
   },
   {
    "slide": "signup",
    "seconds": 5
   },
   {
    "slide": "outro",
    "seconds": 3
   }
  ]
 },
 "governor-duel": {
  "name": "governor-duel",
  "title": "領主対決（相手を下見）",
  "output": "eagleeye-governor-duel.mp4",
  "post": [
   "領主対決はじまった⚔️",
   "相手の総力が低くても油断は禁物。総力は兵士の数でも増えるから、強さとは別物。",
   "EagleEye なら相手の英雄・部隊・秘境の試練まで並べて比べられる👀",
   "{host}",
   "",
   "#キングショット #KingShot #領主対決"
  ],
  "scenes": [
   {
    "slide": "text",
    "heading": "領主対決<br>はじまった⚔️",
    "sub": "その相手、ほんとに強い？",
    "seconds": 3
   },
   {
    "slide": "text",
    "heading": "総力が高い＝強い<br>…とは限らない",
    "sub": "総力は兵士の数や建物でも増える",
    "seconds": 3.5
   },
   {
    "page": "/player/compare?governor_id=222916605&governor_id=227081160",
    "caption": "相手と<b>並べて比べる</b><br>画像で共有もできる",
    "seconds": 4.5,
    "scroll": 350,
    "login": true
   },
   {
    "page": "/player/compare?governor_id=222916605&governor_id=227081160",
    "caption": "<b>秘境の試練</b>をステージごとに<br>どこで差がついているか",
    "seconds": 6,
    "scroll": 2600,
    "login": true
   },
   {
    "slide": "signup",
    "seconds": 5
   },
   {
    "slide": "outro",
    "seconds": 3
   }
  ]
 }
});
