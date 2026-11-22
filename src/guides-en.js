// 読み物「イベントの基本」の英語版（/en/guides）。日本語版（guides.js）と同じ内容（オーナー確認済み・2026-11-19）。
// ゲームの用語は英語版のゲームの名前（Swordland Showdown・Swordland Summit League・Kingdom of Power・Mystic Trial など）。
export const GUIDES_EN = [
  {
    slug: "swordland-showdown",
    title: "What is Swordland Showdown? Flow, scoring and how to prepare",
    lead: "How the one-hour alliance-vs-alliance Swordland Showdown works, how the winner is decided, and what to prepare before it starts.",
    points: ["Two alliances fight for one hour; the side with more points at the end wins", "Capturing and holding buildings is the core; kills, Baggage Trains and Undercellars also give points", "Troops must be home and idle when the battle starts"],
    body: d => `
<h2>What kind of event is it?</h2>
<p>Swordland Showdown is an event where <b>two alliances fight on a dedicated battlefield for one hour</b>. It is held roughly every two weeks, and many guides say the battle takes place on Sundays.</p>
<p>Only <b>alliances near the top by alliance power</b> can take part (most guides say the top 20). Alliances register in units called <b>Legions</b>; guides say an alliance can field up to two Legions, each with 30 combatants and 10 substitutes.</p>

<h2>Before the battle</h2>
<ol>
<li><b>Registration</b>: the alliance leader or R4s register members into a Legion. A member can only be in one Legion.</li>
<li><b>Matchmaking</b>: the opponent is decided after registration. Guides describe the criteria differently — the power of the top registered squads, win rates, the chosen time slot, and so on.</li>
<li><b>Battle (one hour)</b>: it starts in the time slot you chose.</li>
</ol>
<p>Some guides say voting, registration and matchmaking each take two days. Schedules can differ by kingdom and round, so check the in-game event info.</p>

<h2>How the winner is decided</h2>
<p>When the hour is up, <b>the alliance with more Relic Points wins</b>. The main sources of points are broadly the same across guides:</p>
<ul>
<li><b>Capture and hold buildings</b>: the battlefield has many buildings that give points while you hold them. New buildings open over time, and many guides say <b>the large central building gives the most points</b> (it cannot be taken during the first part of the battle).</li>
<li><b>Raid Baggage Trains</b>: trains moving across the map also give points.</li>
<li><b>Undercellars</b>: they appear somewhere on the map later in the battle and give a big boost if taken quickly.</li>
<li><b>Defeat enemy troops</b>: kills give points too — though some guides say kill points only count for individuals, and buildings matter more for the alliance result.</li>
</ul>
<p>Most guides sum it up the same way: <b>coordinating building captures and rallies matters more than fighting as much as possible</b>.</p>

<h2>Do you lose troops?</h2>
<p>Guides say troops defeated in Swordland Showdown are only injured and are healed for free when they leave the battlefield, which makes it easier to join than regular combat (check the in-game rules for details).</p>

<h2>Rewards</h2>
<p>Guides say alliance rewards follow <b>the result of the first Legion</b>, and personal rewards follow <b>your personal point ranking</b>. Even the losing side receives rewards that can be spent in the Swordland shop.</p>

<h2>What to prepare</h2>
<ul>
<li><b>Bring your troops home before the start</b>: troops that are marching, healing or reinforcing cannot join.</li>
<li><b>Stay in the alliance</b>: you must be in the alliance until registration closes. Registering and not showing up is said to affect matchmaking.</li>
<li><b>Agree on roles</b>: decide who goes for which building and who leads rallies. Rally strength depends mostly on the rally leader's heroes and gear, so strong players usually lead.</li>
</ul>

<h2>Using EagleEye</h2>
<ul>
<li><b>Is it running?</b> The <a href="/swordland">Swordland page</a> and your home screen show your kingdom's Swordland Showdown period (checked daily from the MightPulse schedule; pages in Japanese).</li>
<li><b>Register your opponent</b>: matchups can't be seen from outside the game, so alliance R4/R5 register the opponent (in alliances with no R4/R5 on EagleEye, members can register too). Once registered, every member sees it on their home screen.</li>
<li><b>Compare with the opponent</b>: <a href="/alliance/compare">Alliance compare</a> lines up the opponent's top players with yours, and you can share it as an image in your alliance Discord.</li>
<li><b>Past opponents</b> stay listed on the Swordland page.</li>
</ul>
<p class="gwarn">Power (alliance or personal) measures size and does not directly equal strength. Even against a bigger opponent, the build of the players who lead rallies can change the result a lot.</p>`
  },
  {
    slug: "swordland-summit-league",
    title: "What is Swordland Summit League? How it differs from Swordland Showdown",
    lead: "How the league version of Swordland Showdown works, how it differs from the regular event, and what EagleEye's data shows about when it runs.",
    points: ["A season-long league with Swordland Showdown battles every week", "In kingdoms where EagleEye can see the schedule, the current season runs Oct 30 – Dec 15 (about six weeks)", "Some kingdoms have no league (in EagleEye's data, newer kingdoms)"],
    body: d => `
<h2>What kind of event is it?</h2>
<p>Swordland Summit League is <b>a league that uses Swordland Showdown battles every week across a season</b>. Many guides say each battle lasts one hour, just like Swordland Showdown.</p>

<h2>Differences from the regular Swordland Showdown</h2>
<ul>
<li><b>Every week</b>: Swordland Showdown is roughly every two weeks, but the league has a battle every week during the season.</li>
<li><b>Opponents from other kingdoms</b>: matchups are made within a group of kingdoms (a zone). Official help says a league needs a minimum number of registered Legions (16) in the zone to open.</li>
<li><b>Groups of similar strength</b>: guides say Legions are split into tiers by squad power ranking. Tier names differ between guides.</li>
<li><b>League points from every battle</b>: guides say you earn points whether you win or lose (more for a win), which decide the season ranking. Some guides add that Legions knocked out of the qualifiers continue in a separate points battle.</li>
</ul>

<h2>Season length and schedule</h2>
<p>Guides describe a season of about six weeks, with qualifiers in the first half and finals in the second. Others note that the schedule isn't fixed and isn't announced in advance.</p>
<p><b>What EagleEye's data shows (as of ${d})</b>: among the kingdoms of EagleEye users whose schedule shows the league, the current season runs <b>October 30 – December 15 (about six and a half weeks)</b>. Weekly matches are split at 9:00 on Monday (Japan time, 00:00 UTC).</p>

<h2>Which kingdoms and alliances can join</h2>
<p>There are entry requirements such as Town Center level (check the official help or the in-game info for exact numbers). Guides say an alliance can register up to two Legions.</p>
<p><b>What EagleEye's data shows (as of ${d}, 16 kingdoms)</b>: the league schedule appeared for kingdoms numbered 1524 and below, but not for kingdoms 1910 and above. Newer kingdoms may not be part of the league yet (treat this as a rough guide — it's a small sample).</p>

<h2>What to prepare</h2>
<ul>
<li>As with Swordland Showdown, <b>bring troops home before the start</b> and <b>agree on rally roles</b>.</li>
<li>Since battles are weekly, <b>keeping the lineup and substitutes filled every week</b> is the key to lasting the season.</li>
</ul>

<h2>Using EagleEye</h2>
<ul>
<li>The <a href="/swordland">Swordland page</a> shows the Summit League separately from Swordland Showdown (both appear when they overlap). Register a new opponent <b>every week</b>.</li>
<li>Once registered, compare with the opponent's alliance in <a href="/alliance/compare">Alliance compare</a> — including alliances from other kingdoms.</li>
<li>Past weekly opponents stay listed under "past opponents" on the Swordland page.</li>
</ul>`
  },
  {
    slug: "kvk",
    title: "What is KvK (Kingdom of Power)? Preparation and battle phases",
    lead: "How KvK works, split into the preparation phase and the battle phase — plus how to check your opponent kingdom on EagleEye.",
    points: ["Two kingdoms are matched and first compete for points in the preparation phase", "Only the kingdom that wins preparation can attack the opponent's King's Castle", "The castle result depends on occupation time per alliance"],
    body: d => `
<h2>What kind of event is it?</h2>
<p>KvK (Kingdom of Power) is an event where <b>two kingdoms are matched against each other</b>. It has two main parts: the <b>preparation phase</b> and the <b>battle phase</b>. Guides say there are requirements such as kingdom age and Town Center level.</p>

<h2>Matchmaking</h2>
<p>Opponents are said to be matched based on things like kingdom power and activity (the details differ between guides).</p>
<p><b>What EagleEye found</b>: across all 1,219 matchups in KvK season 23, the kingdom with more power was not always ahead in Mystic Trial records. Power alone doesn't decide how strong an opponent is.</p>

<h2>Preparation phase</h2>
<p>For several days (about five, according to most guides), kingdoms collect points by completing daily themes such as building, training, research and spending, and compare their totals. <b>The kingdom that wins the preparation phase becomes the attacker in the battle phase</b>; the other kingdom's castle is the one under attack.</p>
<p>That is why <b>winning the preparation phase matters so much</b>. The basic approach is to use speedups and resources on the day whose theme matches them.</p>

<h2>Battle phase</h2>
<ul>
<li>The kingdom that won preparation can move into the opponent's kingdom and attack during a set window.</li>
<li>The result depends on <b>how long the opponent's King's Castle is occupied</b>. Guides say occupation time is counted <b>per alliance</b> (one alliance holding it for a long time beats two alliances from the same kingdom splitting the time).</li>
<li>Guides say holding the turrets around the castle gives an advantage.</li>
<li>Guides also say part of the troops you lose can be recovered afterwards.</li>
</ul>
<p>Start times and durations differ between guides, so check the in-game event info.</p>

<h2>What to prepare</h2>
<ul>
<li><b>Save speedups and resources</b> for the matching preparation themes.</li>
<li><b>Train troops and check your hospital capacity</b> before the battle phase.</li>
<li>If you're the defending side, <b>check your shield (protection) timing</b>.</li>
</ul>

<h2>Using EagleEye</h2>
<ul>
<li>The <a href="/kvk">KvK page</a> shows your kingdom's current opponent, score trend and past results (ADVANCED and above; pages in Japanese).</li>
<li>Compare <b>top Mystic Trial records</b> with the opponent kingdom — a better sign of the top players' builds than power.</li>
<li>"📤 Compare with the opponent and share as image" turns <a href="/kingdom/compare">Kingdom compare</a> into an image for your kingdom Discord.</li>
<li>All matchups are listed under <a href="/kvk/matchups">KvK matchups</a>.</li>
</ul>
<p class="gwarn">EagleEye does not predict KvK results. Use the numbers to learn about your opponent.</p>`
  }
];
