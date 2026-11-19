// ログイン後のホームの英語版（/en・オーナー・アドミンだけのテスト実装・2026-11-19）。
// ・日本語のホーム（renderHome）をそのまま作り、ここの辞書で英語に置き換える（ホームの作りを二重にしないため）。
// ・ゲーム内の用語は MightPulse の API が返す英語に合わせる（power→Power・town_center_level→Town Center・kills→Kills・
//   governor_id→Governor ID・Mystic Trial・Swordland Showdown・Swordland Summit League・Governor Duel・Kingdom of Power）。
// ・日本語のホームの文を変えたら、ここにも足す（tests/english-home.test.mjs が「英語のホームに日本語が残っていない」ことを確かめる）。
// ・行き先のページはまだ日本語（英語版ができたら i18n.js の EN_PAGES に足す）。

// [日本語, 英語]。長いものから順に置き換える（短い語が長い文の一部を先に壊さないように）。
export const HOME_EN = [
  // <head>
  ["キングショット（KingShot）分析・攻略ツール｜王国・プレイヤー観測 | EagleEye", "Kingshot analysis dashboard — kingdoms and governors | EagleEye"],
  ["キングショット（KingShot）の分析・攻略に役立つ非公式ファンサイト。王国・同盟・プレイヤーのランキング推移、KvKの戦況と秘境の試練の比較、英雄の育成情報を見やすくまとめています。欠片計算・黄金計算などの攻略ツールも無料で使えます。", "Unofficial Kingshot fan site: kingdom, alliance and governor ranking trends, KvK status and Mystic Trial comparisons, hero builds, plus free shard and gold calculators."],
  ["キングショット（KingShot）の王国・同盟・プレイヤーのデータと、英雄の欠片・黄金・T11研究の計算ツールをまとめた非公式ファンサービス", "Unofficial Kingshot fan service with kingdom, alliance and governor data and calculators for hero shards, gold and T11 research"],
  ['"alternateName":["イーグルアイ","EagleEye キングショット"]', '"alternateName":["EagleEye Kingshot"]'],
  ['"inLanguage":"ja"', '"inLanguage":"en"'],
  // 見出し・案内
  ["キングショット 分析・攻略ダッシュボード", "Kingshot analysis dashboard"],
  ["KingShot 観測ダッシュボード", "Kingshot observation dashboard"],
  ["王国とプレイヤーの動きを、ひと目で。", "Kingdoms and governors at a glance."],
  ["ランキング・検索・ウォッチは下のバーから", "Rankings, search and watchlist are in the bar below"],
  ["主要メニュー", "Main menu"],
  ["メインナビゲーション", "Main navigation"],
  ["その他の機能", "More features"],
  // 自分の領主
  ["領主IDを登録すると、自分の戦力や育成の推移がここに出ます", "Register your Governor ID to see your power and progress here"],
  ["マイKingShotで登録 →", "Register in My Kingshot →"],
  ["マイKingShotを開く", "Open My Kingshot"],
  ["マイKingShot", "My Kingshot"],
  ["あなたの領主", "Your governor"],
  ["'+esc(ago(m.observed_at))+'の取得", "'+'fetched '+esc(ago(m.observed_at))+'"],
  ["最新を取得中…", "Fetching latest…"],
  ["⇄ 使う領主を切り替える（'+esc(m.link_count)+'件登録中）", "⇄ Switch governor ('+esc(m.link_count)+' registered)"],
  ["まず領主IDを登録しよう（30秒）", "Start by registering your Governor ID (30 sec)"],
  ["自分の戦力・役場・ウォッチ中の変化がホームに出るようになります。", "Your power, Town Center and watchlist changes will appear on your home screen."],
  ["あと1ステップでADVANCED", "One step to ADVANCED"],
  ["MightPulseのAPIキー（無料・約1分）を登録すると、英雄の装備・領主装備・KvK画面が見られます。", "Register a MightPulse API key (free, about 1 min) to unlock hero gear, governor gear and the KvK screen."],
  ["領主IDを登録する", "Register Governor ID"],
  ["APIキーを登録する", "Register API key"],
  // 聖剣・領主対決・KvK（MightPulse の英語名）
  ["⚔️ 領主対決 開催中", "⚔️ Governor Duel is on"],
  ["・相手を検索して、英雄・部隊・秘境の試練を比べよう", " · Search your opponent and compare heroes, troops and Mystic Trial"],
  ["相手を検索して、英雄・部隊・秘境の試練を比べよう", "Search your opponent and compare heroes, troops and Mystic Trial"],
  ["相手を探す →", "Find opponent →"],
  ["a.querySelector('b').textContent='⚔️ '+(ev.label||'聖剣争奪')", "a.querySelector('b').textContent='⚔️ '+(ev.name||'Swordland Showdown')"],
  ["⚔️ 聖剣争奪", "⚔️ Swordland Showdown"],
  ["b.textContent='今回の相手：王国'+ev.matchup.kid+'の '+ev.matchup.tag+'（'+ev.matchup.count+'人が登録'+(ev.matchup.memberReported?'・メンバーの報告':'')+'）'", "b.textContent='This round: Kingdom '+ev.matchup.kid+' '+ev.matchup.tag+' ('+ev.matchup.count+' reported'+(ev.matchup.memberReported?', by members':'')+')'"],
  ["今回の対戦相手を登録しよう（R4・R5）", "Register this round's opponent (R4/R5)"],
  ["対戦相手が登録されると、ここに表示されます（R4・R5 が使っていない同盟はメンバーも登録できます）", "The opponent shows here once registered (members can register if no R4/R5 uses EagleEye)"],
  ["開く →", "Open →"],
  ["対戦相手・スコア・日ごとの推移", "Opponent, score and daily trend"],
  ["<small>対戦相手・スコア</small>", "<small>Opponent and score</small>"],
  ["ADVANCED以上", "ADVANCED+"],
  ["📤 相手王国と比べて画像で共有 →", "📤 Compare with the opponent kingdom and share →"],
  ['t.textContent="シーズン"+(k.season||"")+" 終了 · 王国 "+k.kid+" vs 王国 "+k.opponent+"　"', 't.textContent="Season "+(k.season||"")+" ended · Kingdom "+k.kid+" vs Kingdom "+k.opponent+"  "'],
  ['st.textContent=has?(w>l?"勝利":w<l?"敗北":"引き分け"):"終了"', 'st.textContent=has?(w>l?"Won":w<l?"Lost":"Draw"):"Ended"'],
  ['t.textContent="王国 "+k.kid+" vs 王国 "+k.opponent+"　"', 't.textContent="Kingdom "+k.kid+" vs Kingdom "+k.opponent+"  "'],
  ['st.textContent=has?(w>l?"リード中":w<l?"追う展開":"互角"):"シーズン"+(k.season||"")', 'st.textContent=has?(w>l?"Leading":w<l?"Behind":"Even"):"Season "+(k.season||"")'],
  // 今日の作戦・マイルストーン
  ["3つの作戦で、EagleEyeを毎日ちょっと便利に", "Three daily missions to get more out of EagleEye"],
  ["今日の作戦はすべて達成！", "All of today's missions done!"],
  ['xt.textContent=xn?"次："+xn.title', 'xt.textContent=xn?"Next: "+xn.title'],
  ["今日の作戦", "Today's missions"],
  ['d.milestones.total+" 達成"', 'd.milestones.total+" achieved"'],
  ['mt.textContent="🎉 達成："', 'mt.textContent="🎉 Achieved: "'],
  ['.join("、")+(mu.length>2?" ほか"+(mu.length-2)+"件":"")', '.join(", ")+(mu.length>2?" and "+(mu.length-2)+" more":"")'],
  ["使い方と成長でバッジが増えていきます", "Earn badges as you use EagleEye and grow"],
  ["マイルストーン", "Milestones"],
  ['<span class="ee-milestone-status">準備中</span>', '<span class="ee-milestone-status">Coming soon</span>'],
  ["<small>準備中</small>", "<small>Coming soon</small>"],
  // 最近の変化
  ["ウォッチ中のプレイヤーの新しい変化", "New changes in your watched governors"],
  ["ウォッチ中のプレイヤー・7日間", "Watched governors · last 7 days"],
  ["この7日間、ウォッチ中のプレイヤーに変化はありません。", "No changes in your watched governors in the last 7 days."],
  ["変化を読み込めませんでした。", "Could not load changes."],
  ["最近の変化", "Recent changes"],
  ['return Math.max(1,Math.floor(d/60))+"分前"', 'return Math.max(1,Math.floor(d/60))+"m ago"'],
  ['return Math.floor(d/3600)+"時間前"', 'return Math.floor(d/3600)+"h ago"'],
  ['return Math.floor(d/86400)+"日前"', 'return Math.floor(d/86400)+"d ago"'],
  ['var FIELD={power:"戦力",town_center_level:"役場",vip:"VIP",x:"X座標",y:"Y座標",kills:"撃破数",alliance_aid:"同盟",alliance_name:"同盟",alliance_rank:"同盟ランク",alliance_power:"同盟戦力",alliance_count:"同盟人数"}', 'var FIELD={power:"Power",town_center_level:"Town Center",vip:"VIP",x:"X",y:"Y",kills:"Kills",alliance_aid:"Alliance",alliance_name:"Alliance",alliance_rank:"Alliance rank",alliance_power:"Alliance power",alliance_count:"Alliance members"}'],
  // 集計・ステータス
  ["ウォッチ中のプレイヤー", "Watched governors"],
  ["ウォッチ中の王国", "Watched kingdoms"],
  ["<em id=\"playerCount\">0</em> 人", "<em id=\"playerCount\">0</em>"],
  ["未読のお知らせ", "Unread news"],
  ["システム稼働中", "System online"],
  ["システム状況を確認", "Check system status"],
  ["接続中…", "Connecting…"],
  ["読み込み中…", "Loading…"],
  // ツール
  ["英雄の欠片計算", "Hero shard calculator"],
  ["★5までの必要数", "Shards needed up to 5★"],
  ["黄金研究計算", "Gold research calculator"],
  ["T11研究の必要数", "T11 research costs"],
  ["建物ごとのG1〜8", "G1–G8 per building"],
  ["黄金テクノロジー研究", "Gold technology research"],
  ["英雄・黄金の解放時期", "When heroes and gold unlock"],
  ["英雄スキル・専用装備・英雄の装備", "Hero skills, exclusive gear, hero gear"],
  ["全英雄のスキル", "Skills of every hero"],
  ["王国タイムライン", "Kingdom timeline"],
  ["秘境の試練で比較", "Compared by Mystic Trial"],
  ["KvK組み合わせ", "KvK matchups"],
  ["戦力・成長・KvK", "Power, growth, KvK"],
  ["自分のデータ・登録", "Your data and registration"],
  ["ウォッチから比較画像", "Comparison images from your watchlist"],
  ["あなた専用のリンクで仲間を招待・月間ランキング", "Invite friends with your own link · monthly ranking"],
  ["色テーマを選ぶ", "Choose a color theme"],
  // メニュー（eagleeye-ui.js）
  ["聖剣（争奪・リーグ）", "Swordland (Showdown/League)"],
  ["王国ウォッチ", "Kingdom watch"],
  ["王国カタログ", "Kingdom catalog"],
  ["英雄カタログ", "Hero catalog"],
  ["同盟比較", "Alliance compare"],
  ["欠片計算", "Shard calculator"],
  ["黄金計算", "Gold calculator"],
  ["友だち招待", "Invite friends"],
  ["通知の設定", "Notification settings"],
  ["オーナー管理", "Owner admin"],
  ["システム状況", "System status"],
  ["比較・共有", "Compare & share"],
  ["王国一覧", "Kingdoms"],
  ["王国を探す", "Find a kingdom"],
  ["王国検索", "Kingdom search"],
  ["ランキング", "Rankings"],
  ["ウォッチ", "Watch"],
  ["お知らせ", "News"],
  ["着せ替え", "Themes"],
  ["更新情報", "Updates"],
  ["招待する", "Invite"],
  ["使い方", "How to use"],
  ["その他", "More"],
  ["ツール", "Tools"],
  ["ホーム", "Home"],
  ["アカウント", "Account"],
  ["ログアウト", "Log out"],
  ["閉じる ×", "Close ×"],
  ["Discordへ接続中", "Connecting to Discord"],
  ["Discordへ移動", "Go to Discord"],
  ["サポート", "Support"],
  ["利用規約", "Terms"],
  ["プライバシーポリシー", "Privacy policy"],
  ["運営者情報", "About"],
  ["領主ID", "Governor ID"],
  ["alt=\"BJにゃん\"", "alt=\"BJ Nyan\""],
  ["<span>診断</span>", "<span>Diagnostics</span>"],
  ["<span>管理</span>", "<span>Admin</span>"],
  // 下のメニュー・数字の単位
  ["<span>検索</span>", "<span>Search</span>"],
  ['aria-label="検索"', 'aria-label="Search"'],
  ['<em id="kingdomCount">0</em> 王国', '<em id="kingdomCount">0</em>'],
  ['"<span><i>王国</i>', '"<span><i>Kingdom</i>'],
  ['"<span><i>戦力</i>', '"<span><i>Power</i>'],
  ['"<span><i>役場</i>', '"<span><i>Town Center</i>'],
  ['"<span><i>同盟</i>', '"<span><i>Alliance</i>'],
  // 役場のレベル（Lv.30 の先・黄金＝TG）
  ['return "Lv.30（"+(l-30)+"/5）"', 'return "Lv.30 ("+(l-30)+"/5)"'],
  ['return "黄金"+g+(st?"（"+st+"/5）":"")', 'return "TG"+g+(st?" ("+st+"/5)":"")'],
  ['var label = "黄金" + g + (st ? "（" + st + "/5）" : "");', 'var label = "TG" + g + (st ? " (" + st + "/5)" : "");'],
  ['"Lv.30（" + sub + "/5）"', '"Lv.30 (" + sub + "/5)"'],
  ["textContent='〜'+(t.getUTCMonth()+1)+'/'+t.getUTCDate()+'", "textContent='until '+(t.getUTCMonth()+1)+'/'+t.getUTCDate()+'"],
  // 全ページ共通の部品（あとから差し込まれる：その他メニュー・案内帯・ADVANCED の案内・処理中の表示・プレビューの帯）
  ['addLink("/admin/diagnostics","診断"', 'addLink("/admin/diagnostics","Diagnostics"'],
  ['addLink("/admin","管理"', 'addLink("/admin","Admin"'],
  ['aria-label","閉じる"', 'aria-label","Close"'],
  ['aria-label="閉じる"', 'aria-label="Close"'],
  ['>あとで<', '>Later<'],
  ['>しばらく表示しない<', ">Don't show for a while<"],
  ['"まず領主IDを登録しよう（30秒）":"あと1ステップでADVANCED：APIキーを登録"', '"Start by registering your Governor ID (30 sec)":"One step to ADVANCED: register an API key"'],
  ['isKey?"あと1ステップでADVANCED":"まず領主IDを登録しよう"', 'isKey?"One step to ADVANCED":"Start by registering your Governor ID"'],
  ['"MightPulseのAPIキー（無料・約1分）を登録すると、見られる情報が一気に増えます。":"領主IDを登録すると（30秒）、自分の戦力や役場の推移がホームに出て、ADVANCEDへの最初の一歩になります。"', '"Register a MightPulse API key (free, about 1 min) to unlock much more data.":"Register your Governor ID (30 sec) to see your power and Town Center trend on your home screen — the first step to ADVANCED."'],
  ['["英雄スキル・専用装備・英雄の装備","領主装備・宝石","プレイヤーの座標","KvK画面（対戦相手・スコア推移・秘境の比較）","ウォッチ：プレイヤー3人→20人、王国1→3"]', '["Hero skills, exclusive gear and hero gear","Governor gear and gems","Governor coordinates","KvK screen (opponent, score trend, Mystic Trial comparison)","Watchlist: governors 3→20, kingdoms 1→3"]'],
  ['["自分の戦力・役場の推移がホームに","ウォッチ中の変化のお知らせ","あと1ステップでADVANCED"]', '["Your power and Town Center trend on your home screen","Alerts for watchlist changes","One step to ADVANCED"]'],
  ['(button.textContent||"ボタン").trim()+"、処理中"', '(button.textContent||"Button").trim()+", processing"'],
  ['endsWith("、処理中")', 'endsWith(", processing")'],
  ['"同じ操作が現在実行中です。処理完了を待ってください。"', '"The same action is already running. Please wait for it to finish."'],
  ["🧪 PREVIEW — 開発版 / 本番ユーザーには表示されません ・ ", "🧪 PREVIEW — development build, not shown to production users · "],
  ["ログイン切り替え", "Switch login"]
];

// ミッション・マイルストーンの名前（/api/home/summary?lang=en）。
export const MISSION_TITLES_EN = Object.freeze({
  my_player: "Check your governor", watchlist: "Check watchlist changes", kingdom: "View kingdom rankings", kvk: "Check KvK matchups",
  compare: "Compare governors", player: "Look up a governor", hero: "Use hero tools and calculators", news: "Read the news", share: "Share as an image",
  w_days: "Open EagleEye on 5 days", w_variety: "Use 6 kinds of features", w_share: "Share an image once"
});
export const MILESTONE_TITLES_EN = Object.freeze({
  first_step: "First step", governor_link: "Governor verified", observer: "Observer", watcher: "Lookout", owner_invite: "Staff invite",
  herald: "Herald", kingdom_top10: "Kingdom top 10", week_clear: "Weekly missions cleared"
});
export function englishSummaryTitles(summary) {
  if (summary?.missions?.daily) summary.missions.daily = summary.missions.daily.map(m => ({ ...m, title: MISSION_TITLES_EN[m.key] || m.title }));
  if (summary?.milestones?.unseen) summary.milestones.unseen = summary.milestones.unseen.map(m => ({ ...m, title: MILESTONE_TITLES_EN[m.key] || m.title }));
  return summary;
}

const ORDERED = HOME_EN.slice().sort((a, b) => b[0].length - a[0].length);
// 全ページ共通の部品（index.js の applyEagleEyeTheme があとから差し込む）も訳すため、Response にもかける。
export async function translateHomeResponse(response) {
  const text = translateHomeToEnglish(await response.text());
  return new Response(text, { status: response.status, headers: response.headers });
}

// 日本語のホームの HTML → 英語。html の lang、API の言語（?lang=en）、行き先（/ → /en）もここで変える。
export function translateHomeToEnglish(html) {
  let out = String(html).replace('<html lang="ja"', '<html lang="en"');
  for (const [ja, en] of ORDERED) out = out.split(ja).join(en);
  out = out.replace(/fetch\("\/api\/home\/summary"/g, 'fetch("/api/home/summary?lang=en"');
  return out;
}
