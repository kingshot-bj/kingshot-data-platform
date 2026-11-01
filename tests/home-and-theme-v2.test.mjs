import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeLegacyPalette, EAGLEEYE_NAV_CSS } from "../src/eagleeye-ui.js";
import { eagleEyeThemesCss } from "../src/themes.js";
import { buildHomeSummary } from "../src/home-summary.js";

const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("translucent legacy colours in <style> follow the theme tokens by role", () => {
  const out = normalizeLegacyPalette('<style>.a{background:linear-gradient(1deg,rgba(13,34,54,.98),rgba(6,18,31,.9));border:1px solid rgba(43,77,107,.68);color:rgba(32,215,242,.5);box-shadow:0 0 4px rgba(0,0,0,.4)}.b{color:rgba(13,34,54,.5)}</style><script>c.fillStyle="rgba(32,215,242,.5)"</script>');
  assert.match(out, /background:linear-gradient\(1deg,color-mix\(in srgb,var\(--ee-panel-raised\) 98%,transparent\),color-mix\(in srgb,var\(--ee-panel\) 90%,transparent\)\)/);
  assert.match(out, /border:1px solid color-mix\(in srgb,var\(--ee-border\) 68%,transparent\)/);
  assert.match(out, /color:color-mix\(in srgb,var\(--ee-cyan\) 50%,transparent\)/);
  assert.match(out, /rgba\(0,0,0,\.4\)/, "black shadows are untouched");
  assert.match(out, /\.b\{color:rgba\(13,34,54,\.5\)\}/, "a navy surface colour used as text is not remapped");
  assert.match(out, /fillStyle="rgba\(32,215,242,\.5\)"/, "scripts are untouched");
  assert.equal(normalizeLegacyPalette(out), out, "idempotent");
});

test("home uses theme tokens, the shared nav accent follows the theme", () => {
  assert.match(index, /--cyan:var\(--ee-cyan,#20d7f2\)/);
  assert.match(index, /--bg:var\(--ee-bg,#050b14\)/);
  assert.ok(!EAGLEEYE_NAV_CSS.includes("color:#20d7f2"), "nav active colour is a token");
  assert.match(EAGLEEYE_NAV_CSS, /var\(--ee-cyan,#20d7f2\)/);
});

test("home shows the personal summary and stays readable", () => {
  assert.match(index, /id="homeMe"/);
  assert.match(index, /id="homeChanges"/);
  assert.match(index, /fetch\("\/api\/home\/summary"/);
  assert.match(index, /url\.pathname === "\/api\/home\/summary"/);
  assert.match(index, /\.ee-app \.ee-tile small\{font-size:10px/);
  assert.match(index, /\.ee-app \.ee-main\{overflow-y:auto/);
});

test("themes give KvK opponents a colour that contrasts with the accent", () => {
  const css = eagleEyeThemesCss();
  assert.match(css, /data-ee-skin="sakura"[^}]*--ee-rival:#60a5fa/);
  assert.match(css, /data-ee-skin="ember"[^}]*--ee-rival:#60a5fa/);
  const kvk = readFileSync(new URL("../src/kvk.js", import.meta.url), "utf8");
  assert.ok(!/[^,(]#f87171/.test(kvk.replace(/var\(--ee-rival,#f87171\)/g, "")), "opponent colour is the --ee-rival token");
});

function fakeDb(data) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      let args = [];
      const s = {
        bind: (...a) => { args = a; return s; },
        first: async () => { calls.push(sql); if (sql.includes("user_player_links")) return data.link; if (sql.includes("kvk_scores")) return data.kvk; return null; },
        all: async () => { calls.push(sql); if (sql.includes("player_watchlists")) return { results: data.watched }; if (sql.includes("change_events")) return { results: data.events.filter(() => args.length) }; return { results: [] }; }
      };
      return s;
    }
  };
}

test("home summary filters by visibility and role, and hides stale activity changes", async () => {
  const db = fakeDb({
    link: { governor_id: "900", kingdom_id: 1524, kid: 1524, nick_name: "BJ", power: 100, town_center_level: 38, alliance_abbr: "TNC", observed_at: 1 },
    kvk: { kid: 1524, season: 23, opponent: 1530, score: 5, opponent_score: 3 },
    watched: [{ governor_id: "901", name: "にゃっぷ" }],
    events: [
      { target_id: "901", field_name: "online", old_value_json: "0", new_value_json: "1", detected_at: 10 },
      { target_id: "901", field_name: "power", old_value_json: "1", new_value_json: "2", detected_at: 9 }
    ]
  });
  const hidden = new Set(["base_power"]);
  const summary = await buildHomeSummary(db, { user_id: "u1", discord_id: "111", role: "BASIC" }, {
    visible: key => !hidden.has(key),
    changeVisible: change => change.field_name !== "online" && !(change.field_name === "power" && hidden.has("base_power")),
    now: 100
  });
  assert.equal(summary.me.nick_name, "BJ");
  assert.equal(summary.me.power, null, "power hidden by visibility settings");
  assert.equal(summary.kvk, null, "BASIC users do not get the KvK score");
  assert.deepEqual(summary.changes, []);
  const advanced = await buildHomeSummary(db, { user_id: "u1", discord_id: "111", role: "ADVANCED" }, { visible: () => true, changeVisible: c => c.field_name !== "online", now: 100 });
  assert.equal(advanced.kvk.opponent, 1530);
  assert.deepEqual(advanced.changes.map(c => c.field), ["power"]);
});
