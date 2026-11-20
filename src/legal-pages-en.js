// 英語版の読み物ページ（/en/privacy・/en/terms・/en/about・/en/guide）。2026-11-20
// 辞書で切れ切れに訳すのではなく、英語で書いたページ。内容は日本語版（legal-pages.js・guide-page.js）と同じにする。
// 日本語版を書き換えたら、ここも同じように直す（tests/english-prose.test.mjs が節の数を比べる）。
import { renderLegalPage, PRIVACY_POLICY_UPDATED_AT, TERMS_UPDATED_AT, ABOUT_UPDATED_AT } from "./legal-pages.js";
import { GUIDE_UPDATED_AT } from "./guide-page.js";
import { INVITE_BONUS, INVITE_BONUS_CAP } from "./referrals.js";
import { PLAYER_COMPARE_MAX } from "./player-compare.js";
import { ALLIANCE_COMPARE_MAX } from "./alliance-compare.js";

// 「2026年11月8日」→「November 8, 2026」
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function englishDate(ja) {
  const m = String(ja).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(ja);
}
const li = items => "<ul>" + items.map(t => `<li>${t}</li>`).join("") + "</ul>";
const EN_LABELS = { lang: "en", back: "← Home", updated: "Last updated: " };

export const PRIVACY_SECTIONS_EN = [
  {
    title: "About this policy",
    body: `<p>EagleEye (the "Service") is an unofficial fan service that collects and analyzes data from the game Kingshot. The Service is not affiliated with Century Games, the company that runs Kingshot, or MightPulse.</p>
<p>This page explains what information the Service collects, how it is used, how long it is kept, and how the Service works with outside services.</p>`
  },
  {
    title: "Information we collect",
    body: li([
      `<b>Discord account information</b>: when you log in with Discord, your Discord user ID, username, display name and avatar, plus a history of login times.`,
      `<b>Google account information</b>: when you log in with Google, your Google account ID and display name. We do not collect your email address.`,
      `<b>Registered governor IDs</b>: the Kingshot governor IDs, kingdoms and type (main / alt) you register in My Kingshot.`,
      `<b>MightPulse API keys you provide</b>: keys you choose to provide. They are stored encrypted, and only the first few characters are shown on screen so you can tell them apart.`,
      `<b>Public Kingshot data</b>: public in-game information about players, kingdoms, alliances and rankings obtained through the MightPulse API, and the history of how it changes.`,
      `<b>Invite records</b>: when you sign up from an invite link, who invited whom, the sign-up time, and when the account became ADVANCED. Inviters only see the in-game name and status of the people they invited (no Discord information). The invite ranking shows each inviter's in-game name, kingdom and number of invites.`,
      `<b>Contact messages</b>: what you enter in the contact form. It is sent to a dedicated channel on the EagleEye Support Discord server.`,
      `<b>Usage and operation records</b>: feature usage, server processing logs, and errors and network results in your browser (the page shown, the type of element used, HTTP status, etc.).`
    ]) + `<p>We do not collect passwords, email addresses or payment information.</p>`
  },
  {
    title: "How we use information",
    body: li([
      `Keeping you logged in and providing features based on your role (BASIC / ADVANCED / VIP / ADMIN / OWNER)`,
      `Showing players, kingdoms, rankings and watchlists, and recording how they change`,
      `Fetching data for the whole Service with the API keys you provide (API Pool)`,
      `Answering contact requests. When you log in with Discord, you automatically join the EagleEye Support Discord server used for support (this uses Discord's <code>guilds.join</code> permission; you can leave the server at any time)`,
      `KvK notifications. On the EagleEye Support Discord server, you are automatically added to the KvK notification thread for the kingdom of your registered governor ID (a private thread only registered users from the same kingdom and the operators can see). When you are added, the bot tells you once by Discord DM. If you remove the kingdom registration, you are removed from the thread too`,
      `Investigating problems, preventing abuse and improving the Service`
    ])
  },
  {
    title: "Cookies and browser storage",
    body: li([
      `<b>Login cookie</b> (<code>eagleeye_session</code>): a signed cookie that keeps you logged in. It is valid for 7 days.`,
      `<b>Invite cookie</b> (<code>ee_ref</code>): when you open an invite link, the invite code is kept for up to 30 days and used to link you to the person who invited you on your first login. It is deleted after login.`,
      `<b>Browser storage (localStorage)</b>: stores screen settings such as the theme and comparison display settings. The settings themselves are not sent to the server.`,
      `<b>Visit counts</b>: when you open a page, we send the type of page and values stored in your browser ("first visit today / this week / this month" and "days since your last visit"), and at the start of a new visit the site you came from (the host name, to tell search and social media apart, and a marker for announcement links). The server only stores daily counts per type. It does not store the referring URL or host name, or any ID that tells people apart. Search words and other URL contents are not sent.`,
      `<b>Advertising cookies</b>: on pages that show ads, third-party vendors including Google use cookies to serve ads based on your prior visits to the Service or other websites (see "Advertising").`
    ]) + `<p>The Service itself does not issue cookies for the purpose of tracking users.</p>`
  },
  {
    title: "Outside services",
    body: li([
      `<b>Cloudflare</b>: runs the Service and stores data (database and file storage)`,
      `<b>Discord</b>: login, joining the EagleEye Support server, and contact`,
      `<b>MightPulse</b>: the source of public Kingshot data`,
      `<b>Google AdSense</b>: ads on some public pages`,
      `<b>Google Drive</b>: backups of data past its retention period (the operator's Google Drive). The Service only accesses files it created itself in Google Drive (<code>drive.file</code> permission). It does not access your Google account or Google Drive.`
    ]) + `<p>Except where required by law, we do not sell or give the information we collect to third parties.</p>`
  },
  {
    title: "Advertising",
    body: `<p>The Service may show ads on some public pages using the third-party ad service Google AdSense.</p>
${li([
  `Third-party vendors, including Google, use cookies to serve ads based on your prior visits to the Service or other websites.`,
  `Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to the Service and/or other sites on the Internet.`,
  `You can opt out of personalized advertising in <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>. You can also opt out of third-party vendors' cookies at <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">www.aboutads.info</a>.`,
  `For how Google handles information, see <a href="https://policies.google.com/technologies/ads?hl=en" target="_blank" rel="noopener noreferrer">Google's advertising policies</a>.`
])}`
  },
  {
    title: "Information sent to outside parties",
    body: `<p>On pages that show ads, your device sends information to the following company (published under Japan's Telecommunications Business Act rules on sending user information).</p>
${li([
  `<b>Recipient</b>: Google LLC (Google AdSense)`,
  `<b>Information sent</b>: identifiers such as cookies, the URL of the page you view, IP address, browser and device type, time of viewing, etc.`,
  `<b>Purpose</b>: serving ads, measuring their effect, and preventing invalid clicks`,
  `<b>How to stop it</b>: you can turn off personalized ads from the ad settings in "Advertising" above.`
])}`
  },
  {
    title: "Retention",
    body: `<p>Each type of data has a retention period. After that period, data is deleted from the database by a scheduled job once its backup (file storage and Google Drive) has been confirmed. The main periods are below (they may change for operational reasons).</p>
${li([
  `Server processing logs: 24 hours`,
  `Diagnostic records: 30 days`,
  `Login history and API usage records: 90 days`,
  `History of game data changes: up to 2 years`,
  `Account information, registered governor IDs and provided API keys: until you remove them or ask us to delete them`
])}`
  },
  {
    title: "How we protect information",
    body: li([
      `All connections are encrypted (HTTPS).`,
      `Provided API keys are stored encrypted, and the full key is never shown on screen or in logs.`,
      `Admin features are only available to operators with the ADMIN / OWNER role.`
    ])
  },
  {
    title: "Removing your data",
    body: `<p>You can remove a registered governor ID from My Kingshot at any time. To delete your account information or provided API keys, or for other requests to see or correct your data, please use the <a href="/support">contact page</a>.</p>`
  },
  {
    title: "Changes",
    body: `<p>This policy may be updated when needed. We will announce important changes on the Service.</p>`
  },
  {
    title: "Contact",
    body: `<p>For questions about this policy, please use the <a href="/support">contact page</a> (EagleEye Support Discord server).</p>`
  }
];

export const TERMS_SECTIONS_EN = [
  {
    title: "About these terms",
    body: `<p>These Terms of Service (the "Terms") set the conditions for using EagleEye (the "Service"). By using the Service, you agree to these Terms and the <a href="/privacy">Privacy Policy</a>.</p>`
  },
  {
    title: "What the Service is",
    body: `<p>The Service is an unofficial fan service that collects and analyzes data from the game Kingshot. It is not affiliated with Century Games, the company that runs Kingshot, or MightPulse, and none of these companies provide or endorse the Service.</p>`
  },
  {
    title: "Accounts and roles",
    body: li([
      `You log in to the Service with a Discord account.`,
      `Available features depend on your role (BASIC / ADVANCED / VIP / ADMIN / OWNER). Role conditions and features may change for operational reasons.`,
      `Only register governor IDs for accounts you manage yourself.`
    ])
  },
  {
    title: "Providing a MightPulse API key",
    body: li([
      `Providing an API key is optional. Provided keys are used to fetch data for the whole Service (API Pool). By providing a key, you agree to this use.`,
      `Only provide keys you obtained legitimately.`,
      `To stop the use of your key or have it deleted, please use the <a href="/support">contact page</a>. Disabling the key on the MightPulse side also stops its use on the Service.`
    ])
  },
  {
    title: "Prohibited actions",
    body: li([
      `Registering someone else's governor ID or account without their permission`,
      `Putting excessive load on the Service or outside services (such as mass access with automated tools)`,
      `Unauthorized access, exploiting vulnerabilities, or improperly obtaining other users' information`,
      `Harassment using information from the Service, or anything against the law or public order`,
      `Anything else the operator considers inappropriate`
    ])
  },
  {
    title: "Restriction and suspension",
    body: `<p>If you break these Terms, or when the operator considers it necessary, your role may be changed, your use restricted, or your account suspended without notice.</p>`
  },
  {
    title: "Disclaimer",
    body: li([
      `Data shown comes from outside services, and its accuracy, freshness and completeness are not guaranteed. It can include data up to about an hour old.`,
      `The Service may change, pause or end without notice.`,
      `The operator is not responsible for any damage caused by using, or being unable to use, the Service.`
    ])
  },
  {
    title: "Changes to these terms",
    body: `<p>These Terms may be changed when needed. We will announce important changes on the Service. By using the Service after a change, you agree to the changed Terms.</p>`
  },
  {
    title: "Contact",
    body: `<p>For questions about these Terms, please use the <a href="/support">contact page</a> (EagleEye Support Discord server).</p>`
  }
];

export const ABOUT_SECTIONS_EN = [
  {
    title: "About EagleEye",
    body: `<p>EagleEye is an unofficial fan service that collects kingdom, alliance and player data from the game Kingshot and presents ranking trends, KvK status and hero-building information in an easy-to-read way.</p>
${li([
  `Power trends and timelines for each kingdom (<a href="/kingdoms">Kingdoms</a>)`,
  `Hero skills (<a href="/hero-catalog">Hero catalog</a>) and a star-up shard calculator (<a href="/tools/hero-shards">Shard calculator</a>)`,
  `After logging in: player details, watchlists, KvK notifications and more`
])}`
  },
  {
    title: "Operator",
    body: li([
      `<b>Service name</b>: EagleEye`,
      `<b>Operator</b>: BJ`,
      `<b>URL</b>: https://eagleeye-ks.com`
    ])
  },
  {
    title: "Team",
    body: li([
      `<b>Operations</b>: Server 1524 (Kingshot Kingdom 1524) and the Server 1524 command`,
      `<b>Design and lead engineer</b>: BJ-nyan`,
      `<b>Engineer</b>: Amane`,
      `<b>Founding members</b>: Shiba-inu, Hanpen, Ichi-kun`
    ])
  },
  {
    title: "Contact",
    body: `<p>For questions, bug reports, data deletion requests and more, please use the <a href="/support">contact page</a>. The form on the contact page works without logging in. If you need a reply, include where to reach you (an email address or Discord username). If you are logged in, we reply in a dedicated channel on the EagleEye Support Discord server.</p>`
  },
  {
    title: "Data sources",
    body: `<p>Public in-game data is obtained through the <a href="https://www.mightpulse.com/" target="_blank" rel="noopener noreferrer">MightPulse</a> API. Some information, such as the kingdom timeline, is based on community resources, with the source stated. Data shown can be up to about an hour old, and its accuracy is not guaranteed.</p>`
  },
  {
    title: "Accuracy",
    body: li([
      `Numbers come straight from public in-game data; EagleEye never edits them by hand. Ranks, comparisons and analysis are calculated from those numbers by fixed rules.`,
      `Each page's "About this data" explains the source, update interval, what is counted and how values are calculated. Items with no record are hidden or shown as "Waiting for data", never filled with guesses.`,
      `Total power also grows with troop counts and buildings, so it isn't proportional to strength. We show Mystic Trial records alongside it as a guide to strength.`,
      `If you notice a calculation error or display problem, please tell us through the <a href="/support">contact page</a>. We will check and fix it, and list the change in the history below.`
    ])
  },
  {
    title: "Change history",
    body: li([
      `<b>November 16, 2026</b>: Fixed the number of KvK matchups (kingdoms without an opponent were counted as pairs: 1,227 → 1,219). Hero skill sources are now listed as "in-game text". Added "About this data" to each page.`,
      `<b>November 16, 2026</b>: Published four <a href="/reports">data reports</a>. Added "Last 30 days" to kingdom pages. Added how to read pages, a glossary and an FAQ to the <a href="/guide">guide</a>.`,
      `<b>November 15, 2026</b>: Kingdom pages now show rank among all kingdoms, comparison with kingdoms opened around the same time, and Mystic Trial (a guide to strength). Top 10 players and Mystic Trial for every kingdom are refreshed monthly. Wording unified to "total power".`,
      `<b>November 15, 2026</b>: Added a home page for visitors who aren't logged in. The <a href="/support">contact form</a> now works without logging in.`,
      `<b>November 10, 2026</b>: Added the <a href="/guide">guide</a> page.`,
      `<b>November 9, 2026</b>: Player compare now takes up to 6 players. Alliance compare can compare Mystic Trial between each alliance's top 3.`,
      `<b>November 8, 2026</b>: Added alliance compare.`
    ])
  },
  {
    title: "Unofficial service",
    body: `<p>The Service is not affiliated with Century Games, the company that runs Kingshot, or MightPulse. Rights to in-game names and images belong to their respective owners.</p>`
  },
  {
    title: "Advertising",
    body: `<p>To cover running costs, the Service may show ads (Google AdSense) on some public pages. See the <a href="/privacy">Privacy Policy</a> for how ads and cookies are handled.</p>`
  }
];

const ADVANCED_BENEFITS_EN = [
  "Hero skills, hero exclusive gear and hero gear",
  "Governor gear and charms",
  "Player coordinates",
  "KvK screen (opponent, score trend, Mystic Trial stage-by-stage comparison)",
  "Watchlist: players 3 → 20, kingdoms 1 → 3"
];

export const GUIDE_SECTIONS_EN = [
  {
    title: "What is EagleEye?",
    body: `<p>EagleEye is an <b>unofficial fan service</b> for viewing kingdom, alliance and player data from Kingshot. Use it for rankings, power changes, KvK and scouting for Swordland Showdown.</p>
<p>Data is collected through MightPulse. It is not an official game service.</p>`
  },
  {
    title: "Getting started (3 steps)",
    body: `<ol>
<li><b>Log in with Discord</b>: use "Log in" at the top right. Without logging in you can still see the kingdom list, rankings, hero catalog and calculators.</li>
<li><b>Register your governor ID</b>: enter your governor ID in <a href="/my-player">My Kingshot</a> (about 30 seconds). Your home page then shows your power and changes on your watchlist.</li>
<li><b>Register a MightPulse API key</b>: also in <a href="/my-player">My Kingshot</a> (free, about 1 minute). This upgrades you to <b>ADVANCED</b>.</li>
</ol>`
  },
  {
    title: "Roles (BASIC, ADVANCED, VIP)",
    body: `<p><b>BASIC</b>: logged in, nothing else.</p>
<p><b>ADVANCED</b>: free once you register a governor ID and an API key. You get:</p>${li(ADVANCED_BENEFITS_EN)}
<p>Alliance compare is also an ADVANCED feature.</p>
<p><b>VIP</b>: register a MightPulse API key with Mighty access (adds things like player CSV export).</p>`
  },
  {
    title: "The bottom menu",
    body: li([
      `<b>Home</b>: your governor, changes on your watchlist, news, and entry points to running events (KvK, Swordland Showdown).`,
      `<b>Rankings</b>: rankings per kingdom (power, kills, heroes, Mystic Trial and more). Choose which ones to show with "Ranking settings" at the top right.`,
      `<b>Search</b>: search by governor name, governor ID, kingdom number, alliance name or alliance tag. Governor IDs EagleEye doesn't have yet are fetched on the spot.`,
      `<b>Watch</b>: add players and kingdoms you care about and follow their changes.`,
      `<b>More</b>: the other features described below.`
    ])
  },
  {
    title: "Compare",
    body: li([
      `<b>Player compare</b>: pick up to ${PLAYER_COMPARE_MAX} players from your player watchlist and compare them, including Mystic Trial by stage. "Share as image" turns it into a card.`,
      `<b>Alliance compare</b> (ADVANCED and up): compare alliances, even from different kingdoms (up to ${ALLIANCE_COMPARE_MAX}). Enter a kingdom number and alliance tag. The Mystic Trial records of each alliance's top 3 are lined up stage by stage, furthest first. If you are in one of the compared alliances, you are shown as "You", with your rank in your alliance and the equivalent rank in the other alliance.`,
      `<b>Kingdom compare</b>: compare kingdoms' total power, growth, number of governors and more.`
    ])
  },
  {
    title: "Events",
    body: li([
      `<b>KvK</b>: opponent, score trend, and Mystic Trial by stage (ADVANCED and up). Still available after the event from the menu and the <a href="/kvk">KvK page</a>.`,
      `<b>Swordland Showdown</b>: while it runs, an entry point appears on Home. Matchups can't be seen from outside the game, so an alliance's R4/R5 (ADVANCED and up) register the opponent. If registrations disagree, the one registered most is shown. Once the opponent is set, you can scout them with alliance compare.`
    ])
  },
  {
    title: "Other features",
    body: li([
      `<b>Kingdom catalog and kingdom watch</b>: kingdom information and movement in kingdoms you follow.`,
      `<b>Hero catalog</b>: hero information.`,
      `<b>Calculators</b>: shard calculator, Gold calculator, Gold research calculator.`,
      `<b>Invite friends</b>: when someone from your invite link logs in for the first time, their watch slots go up by ${INVITE_BONUS.invitedSignup}. When they become ADVANCED they get +${INVITE_BONUS.invitedAdvanced}, and you get +${INVITE_BONUS.perQualifiedInvite} per person (up to ${INVITE_BONUS_CAP} slots from invites in total).`,
      `<b>Themes</b>: change the site's colors (dark and light too). Gold and wine red are limited colors from operator invites.`,
      `<b>News, system status, support</b>: announcements, the state of the service, and where to ask for help.`
    ])
  },
  {
    title: "Pages you can see without logging in",
    body: li([
      `<a href="/kingdoms">Kingdoms</a>: kingdom rankings for every kingdom (total power, 7-day power growth, under 180 days old) and search by kingdom number.`,
      `Kingdom pages (e.g. <a href="/k/1524">Kingdom 1524</a>): analysis, Mystic Trial, last 30 days, top 10 players and more.`,
      `<a href="/kvk/matchups">KvK matchups</a>: every matchup this season, compared by Mystic Trial records.`,
      `<a href="/reports">Data reports</a>: articles on what the data from every kingdom shows.`,
      `<a href="/hero-catalog">Hero catalog</a>, <a href="/tools/hero-shards">Shard calculator</a>, <a href="/tools/gold">Gold calculator</a>, <a href="/tools/gold-tech">Gold research calculator</a>, <a href="/kingdom-timeline">Kingdom timeline</a>.`
    ])
  },
  {
    title: "Reading a kingdom page",
    body: li([
      `<b>Number tiles</b>: total power, 7-day power growth, number of governors and more. The "as of" time at the top tells you when the numbers are from.`,
      `<b>Kingdom analysis</b>: where total power and 7-day growth rank among all kingdoms, and among kingdoms opened around the same time (within 30 days of the same age). Total power isn't proportional to strength, so read the rank as a guide to size.`,
      `<b>Mystic Trial (a guide to strength)</b>: for each of the 6 trials, the kingdom's best record, its rank among all kingdoms, and the top 10 average. It shows differences in how far top players have built up better than total power does.`,
      `<b>Last 30 days</b>: how total power, governors and kills changed compared with 30 and 7 days ago, and which grew most in 30 days.`,
      `<b>Top 10 by governor power, top 5 alliances</b>: headings with a date show that day's record (refreshed monthly).`,
      `<b>Related kingdoms</b>: links to kingdoms with similar power and nearby numbers (opened around the same time).`
    ])
  },
  {
    title: "Reading KvK matchups",
    body: `<p>The number in the middle, like "4-2", is how many of the 6 Mystic Trials each kingdom leads in, comparing both kingdoms' best records. It has nothing to do with the KvK schedule (prep phase days). We compare Mystic Trial rather than total power because total power also grows a lot with troop counts and buildings and isn't directly proportional to strength. It is a guide for comparison, not a prediction.</p>`
  },
  {
    title: "Glossary",
    body: li([
      `<b>Total power</b>: the in-game power. The sum of points from troops (count and tier), buildings, research, gear, heroes and more. A kingdom's total power is the sum of its governors' power. It isn't directly proportional to strength.`,
      `<b>Governor power, alliance power</b>: named after the in-game rankings. Both are kinds of power.`,
      `<b>7-day power growth</b>: the power gained in 7 days, as reported by MightPulse. No kingdom has a negative value, so losses don't appear to be subtracted.`,
      `<b>Kingdom age</b>: days since the kingdom opened.`,
      `<b>Kingdoms opened around the same time</b>: kingdoms within 30 days of the same age, used to compare kingdoms that started at about the same time.`,
      `<b>Mystic Trial "chapter-stage"</b>: how records are written. A chapter has 10 stages, so "60-7" is chapter 60, stage 7.`,
      `<b>Best record, top 10 average</b>: the record of the kingdom's furthest player, and the average of the top 10 players' records.`
    ])
  },
  {
    title: "FAQ",
    body: li([
      `<b>When is data updated?</b> Kingdom power and similar numbers are updated daily. Top 10 players, top alliances and Mystic Trial on kingdom pages are refreshed for every kingdom once a month (Mystic Trial for KvK matchups is also fetched each season). Kingdoms and players you watch after logging in are fetched more often.`,
      `<b>Why not compare strength by total power?</b> Total power also grows a lot from troop counts and building upgrades, so kingdoms with similar power can differ greatly in strength. EagleEye shows Mystic Trial records as a guide to strength as well (<a href="/reports/power-vs-mystic-2026-11">data report</a>).`,
      `<b>My kingdom has no Mystic Trial section.</b> It doesn't appear for new kingdoms where nobody has a Mystic Trial record yet.`,
      `<b>The top 10 date is old.</b> Kingdoms nobody watches are refreshed once a month, so that day's record is shown. Log in and watch the kingdom to get newer data.`,
      `<b>Where does the data come from?</b> Public in-game data from the MightPulse API. EagleEye is not an official Kingshot site.`,
      `<b>I found a wrong number.</b> Please tell us through the <a href="/support">contact page</a> (no login needed).`
    ])
  },
  {
    title: "What the labels mean",
    body: li([
      `<b>Outside top 100</b>: not in the kingdom ranking (top 100), so the value isn't known.`,
      `<b>Fetching</b>: data is being fetched in the background. Reopen the page after a moment.`,
      `<b>#N in kingdom</b>: the player's actual rank in their kingdom's ranking.`,
      `<b>Highlighted box, 👑</b>: the best value for that item.`
    ])
  },
  {
    title: "Need help?",
    body: `<p>If something doesn't work or isn't clear, please use the <a href="/support">contact page</a> (no login needed; if you are logged in, we talk in a dedicated channel on the EagleEye Support Discord server). Check the state of the service on <a href="/status">System status</a>.</p>`
  }
];

function crumbs(origin, name, path) {
  return { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/en" }, { "@type": "ListItem", position: 2, name, item: origin + "/en" + path }] };
}

export function renderPrivacyPolicyPageEn(origin = "") {
  return renderLegalPage({ ...EN_LABELS, title: "Privacy Policy", description: "EagleEye privacy policy: what we collect, cookies, advertising, information sent to outside parties, and retention.",
    canonical: origin ? origin + "/en/privacy" : "", updatedAt: englishDate(PRIVACY_POLICY_UPDATED_AT), sections: PRIVACY_SECTIONS_EN,
    related: 'Related: <a href="/terms">Terms of Service</a> · <a href="/about">About</a>' });
}
export function renderTermsPageEn(origin = "") {
  return renderLegalPage({ ...EN_LABELS, title: "Terms of Service", description: "EagleEye terms of service",
    canonical: origin ? origin + "/en/terms" : "", updatedAt: englishDate(TERMS_UPDATED_AT), sections: TERMS_SECTIONS_EN,
    related: 'Related: <a href="/privacy">Privacy Policy</a> · <a href="/about">About</a>' });
}
export function renderAboutPageEn(origin = "") {
  return renderLegalPage({ ...EN_LABELS, title: "About", description: "About EagleEye (an unofficial Kingshot data service): the operator and how to contact us.",
    canonical: origin ? origin + "/en/about" : "", updatedAt: englishDate(ABOUT_UPDATED_AT), sections: ABOUT_SECTIONS_EN,
    jsonLd: origin ? { "@context": "https://schema.org", "@graph": [
      { "@type": "AboutPage", name: "About", url: origin + "/en/about", inLanguage: "en", about: { "@id": origin + "/#org" } },
      { "@type": "Organization", "@id": origin + "/#org", name: "EagleEye", url: origin + "/", logo: origin + "/apple-touch-icon.png", contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: origin + "/support", availableLanguage: ["ja", "en"] } },
      crumbs(origin, "About", "/about")
    ] } : null,
    related: 'Related: <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>' });
}
export function renderGuidePageEn(origin = "") {
  return renderLegalPage({ ...EN_LABELS, title: "How to use EagleEye", description: "How to use EagleEye (an unofficial Kingshot data service): getting started, roles, and features like rankings, search, watchlists, compare, KvK and Swordland Showdown.",
    canonical: origin ? origin + "/en/guide" : "", updatedAt: englishDate(GUIDE_UPDATED_AT), sections: GUIDE_SECTIONS_EN,
    jsonLd: origin ? { "@context": "https://schema.org", "@graph": [
      { "@type": "WebPage", name: "How to use EagleEye", url: origin + "/en/guide", inLanguage: "en", isPartOf: { "@type": "WebSite", name: "EagleEye", url: origin + "/" } },
      crumbs(origin, "Guide", "/guide")
    ] } : null,
    related: 'Related: <a href="/about">About</a> · <a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Policy</a>' });
}
