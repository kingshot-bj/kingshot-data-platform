const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";
const CALLBACK_PATH = "/api/auth/callback";
const DEFAULT_DISCORD_REDIRECT_URI = "https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback";
const SESSION_COOKIE = "eagleeye_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

import { mightPulseFetch, getMightPulsePlayer, getMightPulsePlayerRanks, getMightPulseKingdomRanks, getMightPulseKingdomAllRankings } from "./mightpulse.js";
import { savePlayerRankSnapshot, saveKingdomRankingBoard, saveKingdomRankingBoards, getLatestKingdomRankings, getRankingHistory, detectRankingChanges, detectRankingChangesForBoards } from "./ranking-store.js";
import { observationEnvelope } from "./mightpulse-normalizer.js";
import { saveApiObservation } from "./api-observations.js";
import { getLatestPlayerObservation, materializePlayer, getPlayer } from "./player-store.js";
import { configureApiPoolEncryption, addApiPoolKey, listApiPoolKeys, leaseApiKey, recordApiPoolSuccess, recordApiPoolFailure, getPoolStats } from "./api-pool.js";
import { getRetentionSettings, updateRetentionSettings, runRetentionCleanup } from "./retention.js";
import { getRankingLabel } from "./ranking-catalog.js";

async function runDataRetentionJob(env) {
  if (!env.DB) return;
  try {
    const result = await runRetentionCleanup(env.DB, { batchSize: 1000 });
    console.log("data_retention_cleanup_ok", result.deleted);
  } catch (error) {
    console.error("data_retention_cleanup_failed", error?.message || error);
  }
}

const KINGDOM_RANKING_BOARDS = [
  "alliance_power", "alliance_kills", "personal_power", "kills", "town_center",
  "rebel_conquest", "single_hero", "hero_total", "troop_power", "building_power",
  "research_power", "hero_no_equip", "hero_equip", "gov_gear", "gov_charm",
  "pet_power", "island_prosperity", "migrant_score", "mystic_trial", "coliseum",
  "forest_of_life", "crystal_cave", "knowledge_nexus", "molten_fort", "radiant_spire",
  "master_power"
];

const WATCHLIST_RANKING_LIMIT = 100;
const WATCHLIST_RANKING_BATCH = 8;
const WATCHLIST_PLAYER_BATCH = 10;

async function runKingdomWatchlistJobs(env) {
  if (!env.DB) return;
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, last_run_at FROM kingdom_watchlists WHERE enabled = 1 ORDER BY created_at ASC"
  ).all();

  for (const row of rows.results || []) {
    const active = await env.DB.prepare(
      "SELECT * FROM kingdom_watchlist_jobs WHERE watchlist_id = ? AND status IN ('RANKINGS','PLAYERS') ORDER BY created_at DESC LIMIT 1"
    ).bind(row.watchlist_id).first();

    const due = !row.last_run_at || now - Number(row.last_run_at) >= Number(row.interval_hours) * 3600;
    if (!active && !due) continue;

    let job = active;
    if (!job) {
      const jobId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, 0, 0, ?, ?)"
      ).bind(jobId, row.watchlist_id, Number(row.kid), Number(row.top_n), now, now, now).run();
      job = await env.DB.prepare("SELECT * FROM kingdom_watchlist_jobs WHERE job_id = ?").bind(jobId).first();
    }

    try {
      let result = null;
      // Immediate refresh advances through rankings and player details in one invocation.
      for (let phase = 0; phase < 2; phase++) {
        const phaseStartedAt = Date.now();
        console.log("kingdom_watchlist_phase_start", {
          watchlist_id: row.watchlist_id,
          job_id: job.job_id,
          status: job.status,
          player_cursor: Number(job.player_cursor || 0)
        });

        result = await processKingdomWatchlistJob(env, job);

        console.log("kingdom_watchlist_phase_end", {
          watchlist_id: row.watchlist_id,
          job_id: job.job_id,
          phase: result.phase,
          player_cursor: result.playerCursor ?? 0,
          player_count: result.playerCount ?? 0,
          elapsed_ms: Math.max(0, Date.now() - phaseStartedAt)
        });

        if (result.completed) break;
        job = await env.DB.prepare("SELECT * FROM kingdom_watchlist_jobs WHERE job_id = ?").bind(job.job_id).first();
        if (!job) throw new Error("WATCHLIST_JOB_NOT_FOUND_AFTER_PHASE");
      }

      if (!result) throw new Error("WATCHLIST_JOB_NO_RESULT");

      if (result.completed) {
        if (Number(result.rankingRows || 0) <= 0 || Number(result.playerCount || 0) <= 0) {
          throw new Error("WATCHLIST_COMPLETED_WITHOUT_DATA");
        }
        await env.DB.prepare(
          "UPDATE kingdom_watchlists SET last_run_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
        ).bind(now, now, now, row.watchlist_id).run();
      } else {
        await env.DB.prepare(
          "UPDATE kingdom_watchlists SET last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
        ).bind(now, row.watchlist_id).run();
      }
      console.log("kingdom_watchlist_job_progress", row.watchlist_id, result);
    } catch (error) {
      await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET status = ?, last_error = ?, updated_at = ? WHERE job_id = ?"
      ).bind(job.status === "PLAYERS" ? "PLAYERS" : "RANKINGS", String(error?.message || error).slice(0, 1000), now, job.job_id).run();
      await env.DB.prepare(
        "UPDATE kingdom_watchlists SET last_error = ?, updated_at = ? WHERE watchlist_id = ?"
      ).bind(String(error?.message || error).slice(0, 1000), now, row.watchlist_id).run();
      console.error("kingdom_watchlist_job_failed", row.watchlist_id, error?.message || error);
    }
    break;
  }
}
async function processKingdomWatchlistJob(env, job) {
  const now = Math.floor(Date.now() / 1000);

  if (job.status === "RANKINGS") {
    const startIndex = Number(job.board_index || 0);

    if (startIndex >= KINGDOM_RANKING_BOARDS.length) {
      const playerRows = await env.DB.prepare(
        "SELECT DISTINCT governor_id FROM ranking_snapshots WHERE kid = ? AND observed_at = ? AND board = 'personal_power' AND target_type = 'PLAYER' AND rank <= ? AND governor_id IS NOT NULL ORDER BY governor_id"
      ).bind(Number(job.kid), Number(job.observed_at), Number(job.top_n)).all();
      const playerIds = (playerRows.results || []).map(row => String(row.governor_id));
      await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET status = 'PLAYERS', board_index = ?, player_cursor = 0, player_ids_json = ?, updated_at = ? WHERE job_id = ?"
      ).bind(KINGDOM_RANKING_BOARDS.length, JSON.stringify(playerIds), now, job.job_id).run();
      return { completed: false, phase: "PLAYERS", playerCount: playerIds.length, rankingRows: Number(job.ranking_rows || 0) };
    }

    const fetched = await fetchKingdomRankingsBulkThroughApiPool(
      env, job.kid, WATCHLIST_RANKING_LIMIT, "KINGDOM_WATCHLIST_RANKING_BULK"
    );
    const boards = extractKingdomRankingBoards(fetched.result?.data);
    const missingBoards = KINGDOM_RANKING_BOARDS.filter(board => !Array.isArray(boards[board]) || !boards[board].length);
    if (missingBoards.length) {
      const error = new Error("BULK_RANKING_PAYLOAD_INCOMPLETE:" + missingBoards.join(","));
      error.code = "BULK_RANKING_PAYLOAD_INCOMPLETE";
      throw error;
    }

    const rankingRows = await saveKingdomRankingBoards(env.DB, {
      kid: job.kid,
      boards,
      observedAt: job.observed_at
    });

    const rankingChanges = await detectRankingChangesForBoards(env.DB, {
      kid: job.kid,
      observedAt: job.observed_at,
      boards
    });

    if (rankingChanges.length) {
      const changeStatements = rankingChanges.map(change => env.DB.prepare(
        "INSERT INTO change_events (event_id, target_type, target_id, change_type, field_name, old_value_json, new_value_json, observation_id, detected_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        crypto.randomUUID(), change.targetType, change.targetId, change.changeType, "rank",
        JSON.stringify(change.oldValue), JSON.stringify(change.newValue),
        null, change.observedAt, now
      ));
      for (let i = 0; i < changeStatements.length; i += 500) {
        await env.DB.batch(changeStatements.slice(i, i + 500));
      }
    }

    const playerRows = await env.DB.prepare(
      "SELECT DISTINCT governor_id FROM ranking_snapshots WHERE kid = ? AND observed_at = ? AND board = 'personal_power' AND target_type = 'PLAYER' AND rank <= ? AND governor_id IS NOT NULL ORDER BY governor_id"
    ).bind(Number(job.kid), Number(job.observed_at), Number(job.top_n)).all();
    const playerIds = (playerRows.results || []).map(row => String(row.governor_id));

    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET status = 'PLAYERS', board_index = ?, player_cursor = 0, player_ids_json = ?, ranking_rows = ?, updated_at = ? WHERE job_id = ?"
    ).bind(KINGDOM_RANKING_BOARDS.length, JSON.stringify(playerIds), rankingRows, now, job.job_id).run();

    return {
      completed: false,
      phase: "PLAYERS",
      board_index: KINGDOM_RANKING_BOARDS.length,
      rankingRows,
      playerCount: playerIds.length,
      bulk: true
    };
  }

  if (job.status === "PLAYERS") {
    let ids = [];
    try { ids = JSON.parse(job.player_ids_json || "[]"); } catch {}
    if (!Array.isArray(ids)) ids = [];

    const cursor = Number(job.player_cursor || 0);
    const batchIds = ids.slice(cursor, cursor + WATCHLIST_PLAYER_BATCH);

    if (!batchIds.length) {
      await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE job_id = ?"
      ).bind(now, now, job.job_id).run();
      return {
        completed: true,
        phase: "COMPLETED",
        playerCount: ids.length,
        playerRows: Number(job.player_rows || 0),
        rankingRows: Number(job.ranking_rows || 0)
      };
    }

    const concurrency = await getWatchlistApiConcurrency(env);
    const fetchedPlayers = await fetchWithConcurrency(batchIds, concurrency, async governorId => {
      try {
        return { governorId, fetched: await fetchPlayerDetailThroughApiPool(env, governorId) };
      } catch (error) {
        console.error("kingdom_watchlist_player_failed", governorId, error?.message || error);
        return { governorId, error };
      }
    });

    let playerRows = Number(job.player_rows || 0);
    for (const item of fetchedPlayers) {
      if (item.error) continue;
      const result = item.fetched.result;
      const raw = result?.data?.player || result?.data;
      if (!raw) continue;

      const observationId = crypto.randomUUID();
      const governorId = String(raw.governor_id ?? item.governorId);
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO api_observations (observation_id, provider, endpoint, target_type, target_id, observed_at, http_status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          observationId, "MIGHTPULSE", "/players/" + governorId + "?include=base,heroes,ranks,gov_gear",
          "PLAYER", governorId, job.observed_at, result?.status ?? 200, JSON.stringify(raw), job.observed_at
        ),
        env.DB.prepare(
          "INSERT INTO players (governor_id, uid, fid, nick_name, kid, power, town_center_level, vip, x, y, kills, office, online, last_active_at, last_login, avatar_url, language, shield_endtime, burn_endtime, alliance_aid, alliance_abbr, alliance_name, alliance_rank, alliance_rank_label, alliance_power, alliance_count, alliance_leader_name, observed_at, source_observation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(governor_id) DO UPDATE SET uid=excluded.uid, fid=excluded.fid, nick_name=excluded.nick_name, kid=excluded.kid, power=excluded.power, town_center_level=excluded.town_center_level, vip=excluded.vip, x=excluded.x, y=excluded.y, kills=excluded.kills, office=excluded.office, online=excluded.online, last_active_at=excluded.last_active_at, last_login=excluded.last_login, avatar_url=excluded.avatar_url, language=excluded.language, shield_endtime=excluded.shield_endtime, burn_endtime=excluded.burn_endtime, alliance_aid=excluded.alliance_aid, alliance_abbr=excluded.alliance_abbr, alliance_name=excluded.alliance_name, alliance_rank=excluded.alliance_rank, alliance_rank_label=excluded.alliance_rank_label, alliance_power=excluded.alliance_power, alliance_count=excluded.alliance_count, alliance_leader_name=excluded.alliance_leader_name, observed_at=excluded.observed_at, source_observation_id=excluded.source_observation_id, updated_at=excluded.updated_at"
        ).bind(
          governorId, raw.uid ?? null, raw.fid != null ? String(raw.fid) : null, raw.nick_name ?? null,
          raw.kid ?? job.kid, raw.power ?? null, raw.town_center_level ?? null, raw.vip ?? null,
          raw.x ?? null, raw.y ?? null, raw.kills ?? null, raw.office ?? null, raw.online ? 1 : 0,
          raw.last_active_at ?? null, raw.last_login ?? null, raw.avatar_url ?? null, raw.language ?? null,
          raw.shield_endtime ?? null, raw.burn_endtime ?? null, raw.alliance?.aid ?? null,
          raw.alliance?.abbr ?? null, raw.alliance?.name ?? null, raw.alliance?.rank ?? null,
          raw.alliance?.rank_label ?? null, raw.alliance?.power ?? null, raw.alliance?.count ?? null,
          raw.alliance?.leader_name ?? null, job.observed_at, observationId, now
        ),
        env.DB.prepare(
          "INSERT INTO player_snapshots (snapshot_id, governor_id, observation_id, observed_at, payload_json) VALUES (?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), governorId, observationId, job.observed_at, JSON.stringify(raw))
      ]);

      const ranks = result?.data?.ranks || raw?.ranks;
      if (ranks && typeof ranks === "object") {
        await savePlayerRankSnapshot(env.DB, {
          governorId, uid: raw.uid ?? null, kid: raw.kid ?? job.kid, ranks,
          observedAt: job.observed_at, sourceObservationId: observationId
        });
      }
      playerRows++;
    }

    const nextCursor = cursor + batchIds.length;
    const completed = nextCursor >= ids.length;
    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET player_cursor = ?, player_rows = ?, status = ?, completed_at = ?, updated_at = ? WHERE job_id = ?"
    ).bind(nextCursor, playerRows, completed ? "COMPLETED" : "PLAYERS", completed ? now : null, now, job.job_id).run();

    return {
      completed,
      phase: completed ? "COMPLETED" : "PLAYERS",
      playerCursor: nextCursor,
      playerCount: ids.length,
      playerRows,
      rankingRows: Number(job.ranking_rows || 0),
      concurrency
    };
  }

  return { completed: true, phase: job.status };
}

async function getWatchlistApiConcurrency(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND pool_type IN ('SYSTEM_WATCHLIST','SYSTEM_GENERAL') AND status = 'AVAILABLE'"
  ).first();
  return Math.max(1, Math.min(4, Number(row?.count || 1)));
}

async function fetchWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) workers.push(runWorker());
  await Promise.all(workers);
  return results;
}

async function renderKingdomWatchlistPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>ログインが必要です。</p><a href="/api/auth/discord">Discordでログイン</a>`;
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>王国ウォッチリスト｜EagleEye</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1000px;margin:auto;padding:18px 14px 40px;background:#0f172a;color:#f8fafc}.back{color:#94a3b8;text-decoration:none}.admin-badge{float:right;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900}.card{background:#162238;border:1px solid #334155;border-radius:16px;padding:18px;margin:14px 0}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}label{display:grid;gap:6px;font-weight:800;font-size:13px}input,select,button{padding:11px 12px;border:1px solid #475569;border-radius:10px;background:#0b1220;color:#fff;font:inherit}input{width:140px}button{background:#f59e0b;color:#111827;border:0;font-weight:900;cursor:pointer}.danger{background:#7f1d1d;color:#fff}.muted{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rank{padding:0;border:1px solid #334155;border-radius:12px;background:#111b2d;overflow:hidden}.rank summary{list-style:none;cursor:pointer;padding:12px 13px}.rank summary::-webkit-details-marker{display:none}.rank-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.rank-title{font-weight:900;font-size:14px}.rank-meta{font-size:11px;color:#94a3b8;margin-top:3px}.rank-preview{font-size:11px;color:#cbd5e1;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rank-body{padding:0 10px 10px}.rank-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:7px;padding:8px 3px;border-top:1px solid #26364f;font-size:12px}.rank-no{font-weight:900;color:#fbbf24;text-align:center}.rank-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank-score{font-variant-numeric:tabular-nums;color:#e2e8f0;font-weight:800}.rank-tools{display:flex;gap:8px;align-items:center;margin:0 0 12px}.rank-tools select{flex:1;min-width:0}.rank-tools button{width:auto}.section-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.section-title small{color:#94a3b8;font-size:11px}.empty{padding:12px;color:#94a3b8}.error{color:#fca5a5}.ok{color:#86efac}.player-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.player-card{padding:12px;border:1px solid #334155;border-radius:12px;background:#111b2d}.player-name{font-weight:900}.player-meta{margin-top:5px;font-size:12px;color:#cbd5e1;line-height:1.6}@media(max-width:650px){.grid,.player-grid{grid-template-columns:1fr}}@media(max-width:520px){.admin-badge{float:none;display:inline-block;margin-left:8px}.row>*{width:100%}input,select,button{width:100%}.rank-tools button{width:auto}.card{padding:14px}.grid{gap:8px}}
</style></head><body>
<a class="back" href="/">← EagleEye</a>
<h1>王国ウォッチリスト</h1>
<div id="msg" class="muted">読み込み中…</div>
<section class="card"><h2>王国を監視対象に追加</h2><div class="row">
<label>王国番号<input id="kid" type="number" min="1" placeholder="例: 1524"></label>
<label>ランキング上位<select id="top"><option value="5">TOP 5</option><option value="10">TOP 10</option></select></label>
<label>更新間隔<select id="interval"><option value="1">1時間</option><option value="3">3時間</option><option value="6">6時間</option><option value="12">12時間</option></select></label>
<button id="create">監視を登録</button></div></section>
<div id="list"></div><div id="detail"></div>
<script>
(function(){
  function el(id){return document.getElementById(id);}
  function esc(v){return String(v == null ? "" : v).replace(/[&<>"]/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m];});}
  function api(url,options){return fetch(url,options).then(function(r){return r.text().then(function(t){var d;try{d=JSON.parse(t);}catch(e){throw new Error("API応答エラー（HTTP "+r.status+"）");}if(!r.ok||d.ok===false)throw new Error(d.error||("HTTP "+r.status));return d;});});}
  window.EAGLEEYE_PROGRESS_TIMER = null;
  function syncProgressPolling(watchlists) {
    var active = (watchlists || []).some(function(w) {
      return w.job_status === "RANKINGS" || w.job_status === "PLAYERS";
    });
    if (active && !window.EAGLEEYE_PROGRESS_TIMER) {
      window.EAGLEEYE_PROGRESS_TIMER = setInterval(load, 3000);
    } else if (!active && window.EAGLEEYE_PROGRESS_TIMER) {
      clearInterval(window.EAGLEEYE_PROGRESS_TIMER);
      window.EAGLEEYE_PROGRESS_TIMER = null;
    }
  }
  function load(){
    return api("/api/kingdom-watchlist").then(function(d){
      el("list").innerHTML="";
      var ws=d.watchlists||[];
      window.EAGLEEYE_OWNER = ${auth.role === "OWNER"};
      ws.forEach(function(w){
        var card=document.createElement("div"); card.className="card";
        card.innerHTML="<h2>王国 "+esc(w.kid)+"</h2><p>上位"+esc(w.top_n)+"人 / "+esc(w.interval_hours)+"時間ごと / "+(w.enabled?"稼働中":"停止中")+"</p><p class='muted'>最終成功: "+(w.last_success_at?new Date(w.last_success_at*1000).toLocaleString("ja-JP"):"未実行")+"</p>";
        if(w.job_status){
          var progress=document.createElement("p"); progress.className="muted";
          progress.textContent="更新中: "+(w.job_status==="RANKINGS"?"ランキング取得中…":"プレイヤー "+esc(w.job_player_cursor||0)+"/"+esc(w.top_n));
          card.appendChild(progress);
        }
        var row=document.createElement("div"); row.className="row";
        var view=document.createElement("button"); view.textContent="ランキングを見る"; view.onclick=function(){showData(w.watchlist_id);};
        var toggle=document.createElement("button"); toggle.textContent=w.enabled?"停止":"再開"; toggle.onclick=function(){toggleWatch(w.watchlist_id,!w.enabled);};
        var del=document.createElement("button"); del.textContent="削除"; del.className="danger"; del.onclick=function(){deleteWatch(w.watchlist_id);};
        row.appendChild(view);row.appendChild(toggle);row.appendChild(del);
        if(window.EAGLEEYE_OWNER){
          var refresh=document.createElement("button"); refresh.textContent="今すぐ更新"; refresh.onclick=function(){refreshWatch(w.watchlist_id);};
          row.appendChild(refresh);
        }
        card.appendChild(row);el("list").appendChild(card);
      });
      el("msg").innerHTML="<span class='ok'>監視対象 "+ws.length+"件</span>";
      syncProgressPolling(ws);
    }).catch(function(e){el("msg").innerHTML="<span class='error'>読み込み失敗: "+esc(e.message)+"</span>";});
  }
  function toggleWatch(id,enabled){
    return api("/api/kingdom-watchlist?action=toggle",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({watchlist_id:id,enabled:enabled})}).then(load).catch(function(e){alert(e.message);});
  }
  function refreshWatch(id){
    if(!confirm("この王国を今すぐ更新しますか？"))return;
    el("msg").innerHTML="<span class='muted'>即時更新を開始しています…</span>";
    return api("/api/kingdom-watchlist?action=refresh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({watchlist_id:id})})
      .then(function(d){
        el("msg").innerHTML=d.already_running
          ? "<span class='muted'>すでに更新中です。</span>"
          : "<span class='ok'>即時更新を開始しました。</span>";
        return load();
      })
      .catch(function(e){el("msg").innerHTML="<span class='error'>即時更新失敗: "+esc(e.message)+"</span>";});
  }
  function deleteWatch(id){
    if(!confirm("この監視対象を削除しますか？"))return;
    return api("/api/kingdom-watchlist?watchlist_id="+encodeURIComponent(id),{method:"DELETE"}).then(function(){el("detail").innerHTML="";return load();}).catch(function(e){alert(e.message);});
  }
  function showData(id){
    el("detail").innerHTML='<div class="card">ランキングデータを読み込み中…</div>';
    api("/api/kingdom-watchlist/data?watchlist_id="+encodeURIComponent(id)).then(function(d){
      var boards={}; (d.rankings||[]).forEach(function(r){if(!boards[r.board])boards[r.board]=[];boards[r.board].push(r);});
      var order=["alliance_power","alliance_kills","personal_power","kills","town_center","rebel_conquest","single_hero","hero_total","troop_power","building_power","research_power","hero_no_equip","hero_equip","gov_gear","gov_charm","pet_power","island_prosperity","migrant_score","mystic_trial","coliseum","forest_of_life","crystal_cave","knowledge_nexus","molten_fort","radiant_spire","master_power"];
      var labels={"alliance_power":"同盟戦力","alliance_kills":"同盟撃破数","personal_power":"戦力","kills":"撃破数","town_center":"役場レベル","rebel_conquest":"反乱軍討伐","single_hero":"単英雄戦力","hero_total":"英雄総戦力","troop_power":"兵士戦力","building_power":"建築戦力","research_power":"科学戦力","hero_no_equip":"英雄装備なし戦力","hero_equip":"英雄装備戦力","gov_gear":"領主装備戦力","gov_charm":"領主宝石戦力","pet_power":"ペット戦力","island_prosperity":"オアシス島繁栄度","migrant_score":"移民スコア","mystic_trial":"秘境の試練","coliseum":"コロシアム","forest_of_life":"生命の森","crystal_cave":"水晶鉱山","knowledge_nexus":"知識の枢軸","molten_fort":"溶岩要塞","radiant_spire":"輝光の塔","master_power":"マスターパワー"};
      function score(v,b){
        if(v===null||v===undefined||v==="") return "-";
        var n=Number(v);
        if(!Number.isFinite(n)) return String(v);
        if(b==="town_center") return "Lv."+n;
        var abs=Math.abs(n), unit="", value=n;
        if(abs>=1000000000){unit="B";value=n/1000000000;}
        else if(abs>=1000000){unit="M";value=n/1000000;}
        else if(abs>=1000){unit="K";value=n/1000;}
        if(unit){
          var digits=Math.abs(value)>=100?0:Math.abs(value)>=10?1:2;
          return value.toFixed(digits).replace(/\\.?0+$/,"")+" "+unit;
        }
        return new Intl.NumberFormat("ja-JP",{maximumFractionDigits:0}).format(n);
      }
      function nameFor(r){
        return r.nick_name || r.name || r.abbr || (r.governor_id ? "領主 "+r.governor_id : r.aid ? "同盟 "+r.aid : "-");
      }
      var available=order.filter(function(b){return boards[b]&&boards[b].length;});
      var h='<div class="card"><div class="section-title"><h2>王国 '+esc(d.watchlist.kid)+' ランキング</h2><small>'+available.length+'種 / TOP '+esc(d.watchlist.top_n)+'</small></div>';
      h+='<div class="rank-tools"><select id="rankFilter"><option value="ALL">すべてのランキング</option><option value="PLAYER">プレイヤーランキング</option><option value="ALLIANCE">同盟ランキング</option></select><button id="expandRanks" type="button">全て展開</button></div>';
      h+='<div class="grid" id="rankGrid">';
      available.forEach(function(b){
        var rows=boards[b].slice().sort(function(a,z){return Number(a.rank||999999)-Number(z.rank||999999)}).slice(0,d.watchlist.top_n);
        var preview=rows.slice(0,3).map(function(r){return (r.rank||"-")+"位 "+nameFor(r);}).join(" / ");
        var target=(rows[0]&&rows[0].target_type)||"PLAYER";
        h+='<details class="rank" data-target="'+esc(target)+'" data-board="'+esc(b)+'"><summary><div class="rank-head"><span class="rank-title">'+esc(labels[b]||getRankingLabel(b)||b)+'</span><span class="rank-meta">'+(target==="ALLIANCE"?"同盟":"プレイヤー")+'</span></div><div class="rank-preview">'+esc(preview)+'</div></summary><div class="rank-body">';
        rows.forEach(function(r){
          h+='<div class="rank-row"><span class="rank-no">'+esc(r.rank||"-")+'</span><span class="rank-name">'+esc(nameFor(r))+'</span><span class="rank-score">'+esc(score(r.score,b))+'</span></div>';
        });
        h+='</div></details>';
      });
      h+='</div><p class="muted" style="font-size:11px;margin-top:12px">ランキング名はゲーム内表記に合わせて順次確定します。</p>';
      h+='<div class="section-title" style="margin-top:22px"><h2>観測プレイヤー</h2><small>'+esc((d.players||[]).length)+'人</small></div><div class="player-grid">';
      (d.players||[]).forEach(function(p){h+='<div class="player-card"><div class="player-name">'+esc(p.nick_name||p.governor_id)+'</div><div class="player-meta">戦力 '+esc(p.power==null?"-":new Intl.NumberFormat("ja-JP").format(p.power))+' / 役場 '+esc(p.town_center_level==null?"-":p.town_center_level)+'<br>'+esc(p.alliance_abbr||p.alliance_name||"-")+'</div></div>';});
      if(!(d.players||[]).length) h+='<div class="empty">まだ観測プレイヤーがありません。</div>';
      h+='</div></div>';el("detail").innerHTML=h;
      var filter=el("rankFilter"), grid=el("rankGrid"), expand=el("expandRanks");
      filter.addEventListener("change",function(){
        Array.from(grid.querySelectorAll(".rank")).forEach(function(card){card.style.display=(filter.value==="ALL"||card.dataset.target===filter.value)?"":"none";});
      });
      expand.addEventListener("click",function(){
        var cards=Array.from(grid.querySelectorAll(".rank")).filter(function(card){return card.style.display!=="none";});
        var shouldOpen=cards.some(function(card){return !card.open;});        cards.forEach(function(card){card.open=shouldOpen;});
        expand.textContent=shouldOpen?"全て閉じる":"全て展開";
      });
    }).catch(function(e){el("detail").innerHTML='<div class="card error">読み込み失敗: '+esc(e.message)+'</div>';});
  }
  el("create").addEventListener("click",function(){
    var kidValue=String(el("kid").value||"").trim();
    var topValue=String(el("top").value||"").trim();
    var intervalValue=String(el("interval").value||"").trim();
    if(!kidValue){
      el("msg").innerHTML="<span class='error'>登録失敗: 王国番号を入力してください。</span>";
      el("kid").focus();
      return;
    }
    var payload={kid:Number(kidValue),top_n:Number(topValue),interval_hours:Number(intervalValue)};
    api("/api/kingdom-watchlist?action=create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)})
    .then(function(){el("kid").value="";el("msg").innerHTML="<span class='ok'>監視対象を登録しました。</span>";return load();})
    .catch(function(e){
      el("msg").innerHTML="<span class='error'>登録失敗: "+esc(e.message)+"</span>";
    });
  });
  load();
}());
</script></body></html>`;
}
async function handleKingdomRankingHistoryApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const kid = Number(url.searchParams.get("kid"));
  const board = url.searchParams.get("board");
  const targetId = url.searchParams.get("target_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  if (!Number.isInteger(kid) || kid < 1 || !board || !targetId) return json({ ok: false, error: "KID_BOARD_TARGET_REQUIRED" }, 400);
  const history = await getRankingHistory(env.DB, { kid, board, targetId, limit });
  return json({ ok: true, kid, board, target_id: targetId, history });
}

async function handleKingdomWatchlistDataApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const watchlistId = url.searchParams.get("watchlist_id");
  if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);

  const watch = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
  ).bind(watchlistId, auth.discord_id).first();
  if (!watch) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);

  const board = url.searchParams.get("board");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || watch.top_n), 1), 100);

  let rankings;
  if (board) {
    rankings = await env.DB.prepare(
      "WITH latest AS (SELECT MAX(observed_at) AS observed_at FROM ranking_snapshots WHERE kid = ? AND board = ?) SELECT board, target_type, target_id, rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at FROM ranking_snapshots WHERE kid = ? AND board = ? AND observed_at = (SELECT observed_at FROM latest) ORDER BY rank ASC LIMIT ?"
    ).bind(watch.kid, board, watch.kid, board, limit).all();
  } else {
    rankings = await env.DB.prepare(
      "WITH latest AS (SELECT board, MAX(observed_at) AS observed_at FROM ranking_snapshots WHERE kid = ? GROUP BY board), ranked AS (SELECT r.board, r.target_type, r.target_id, r.rank, r.score, r.uid, r.governor_id, r.nick_name, r.aid, r.abbr, r.name, r.observed_at, ROW_NUMBER() OVER (PARTITION BY r.board, r.target_type ORDER BY r.rank ASC) AS rn FROM ranking_snapshots r JOIN latest l ON l.board = r.board AND l.observed_at = r.observed_at WHERE r.kid = ?) SELECT board, target_type, target_id, rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at FROM ranked WHERE rn <= ? ORDER BY board ASC, rank ASC"
    ).bind(watch.kid, watch.kid, limit).all();
  }

  const players = await env.DB.prepare(
    "WITH latest AS (SELECT board, MAX(observed_at) AS observed_at FROM ranking_snapshots WHERE kid = ? AND target_type = 'PLAYER' GROUP BY board), ranked AS (SELECT r.governor_id, r.uid, r.nick_name, r.kid, r.rank, r.board, r.observed_at, ROW_NUMBER() OVER (PARTITION BY r.board ORDER BY r.rank ASC) AS rn FROM ranking_snapshots r JOIN latest l ON l.board = r.board AND l.observed_at = r.observed_at WHERE r.kid = ? AND r.target_type = 'PLAYER' AND r.governor_id IS NOT NULL), top_players AS (SELECT DISTINCT governor_id FROM ranked WHERE rn <= ?), latest_players AS (SELECT p.governor_id, p.uid, p.nick_name, p.kid, p.power, p.town_center_level, p.vip, p.kills, p.x, p.y, p.alliance_abbr, p.alliance_name, p.online, p.last_active_at, p.observed_at FROM players p JOIN top_players t ON t.governor_id = p.governor_id) SELECT * FROM latest_players ORDER BY power DESC, governor_id ASC"
  ).bind(watch.kid, watch.kid, watch.top_n).all();

  const changes = await env.DB.prepare(
    "SELECT governor_id, board, rank, score, observed_at FROM ranking_snapshots WHERE kid = ? AND target_type = 'PLAYER' ORDER BY observed_at DESC LIMIT ?"
  ).bind(watch.kid, Math.min(watch.top_n * 26 * 5, 5000)).all();

  return json({
    ok: true,
    watchlist: watch,
    rankings: rankings.results || [],
    players: players.results || [],
    ranking_observations: changes.results || []
  });
}

async function handleKingdomWatchlistApi(request, env, ctx) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  if (request.method === "GET" && action === "list") {
    const rows = await env.DB.prepare(
      "SELECT w.watchlist_id, w.kid, w.top_n, w.interval_hours, w.enabled, w.last_run_at, w.last_success_at, w.last_error, w.created_at, w.updated_at, j.status AS job_status, j.board_index AS job_board_index, j.player_cursor AS job_player_cursor, j.ranking_rows AS job_ranking_rows, j.player_rows AS job_player_rows FROM kingdom_watchlists w LEFT JOIN kingdom_watchlist_jobs j ON j.job_id = (SELECT j2.job_id FROM kingdom_watchlist_jobs j2 WHERE j2.watchlist_id = w.watchlist_id ORDER BY j2.created_at DESC LIMIT 1) WHERE w.discord_id = ? ORDER BY w.created_at DESC"
    ).bind(auth.discord_id).all();
    return json({ ok: true, watchlists: rows.results || [] });
  }

  if (request.method === "POST" && action === "create") {
    const body = await request.json().catch(() => ({}));
    const kidRaw = String(body.kid ?? "").trim();
    const topRaw = String(body.top_n ?? "").trim();
    const intervalRaw = String(body.interval_hours ?? "").trim();
    const kid = Number(kidRaw);
    const topN = Number(topRaw);
    const intervalHours = Number(intervalRaw);
    const invalidFields = [];
    if (!kidRaw || !Number.isInteger(kid) || kid < 1) invalidFields.push("kid");
    if (!topRaw || ![5, 10].includes(topN)) invalidFields.push("top_n");
    if (!intervalRaw || ![1, 3, 6, 12].includes(intervalHours)) invalidFields.push("interval_hours");
    if (invalidFields.length) {
      return json({
        ok: false,
        error: "INVALID_WATCHLIST_SETTINGS",
        message: "監視設定の値が不正です。",
        invalid_fields: invalidFields,
        received: { kid: body.kid ?? null, top_n: body.top_n ?? null, interval_hours: body.interval_hours ?? null }
      }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO kingdom_watchlists (watchlist_id, discord_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, ?)"
    ).bind(id, auth.discord_id, kid, topN, intervalHours, now, now).run();
    return json({ ok: true, watchlist_id: id });
  }

  if (request.method === "POST" && action === "refresh") {
    if (auth.role !== "OWNER") return json({ ok: false, error: "OWNER_ONLY" }, 403);
    const body = await request.json().catch(() => ({}));
    const watchlistId = String(body.watchlist_id || "").trim();
    if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);

    const row = await env.DB.prepare(
      "SELECT watchlist_id, kid, top_n, interval_hours, enabled FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(watchlistId, auth.discord_id).first();
    if (!row) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);
    if (!Number(row.enabled)) return json({ ok: false, error: "WATCHLIST_DISABLED" }, 409);

    const active = await env.DB.prepare(
      "SELECT job_id, status, board_index, player_cursor, ranking_rows, player_rows FROM kingdom_watchlist_jobs WHERE watchlist_id = ? AND status IN ('RANKINGS','PLAYERS') ORDER BY created_at DESC LIMIT 1"
    ).bind(watchlistId).first();
    if (active) {
      return json({
        ok: true,
        started: false,
        already_running: true,
        job: active
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const jobId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, 0, 0, ?, ?)"
    ).bind(jobId, watchlistId, Number(row.kid), Number(row.top_n), now, now, now).run();

    await env.DB.prepare(
      "UPDATE kingdom_watchlists SET last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
    ).bind(now, watchlistId).run();

    // OWNERの「今すぐ更新」はキュー投入だけで終わらせず、同じWorkerの
    // waitUntilで即座に1ジョブ進める。HTTPレスポンスは待たせない。
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(runKingdomWatchlistJobs(env).catch(error => {
        console.error("kingdom_watchlist_immediate_run_failed", watchlistId, error?.message || error);
      }));
    }

    return json({
      ok: true,
      started: true,
      immediate: true,
      queued: true,
      job_id: jobId,
      message: "更新Jobを即時実行しました。"
    });
  }

  if (request.method === "POST" && action === "toggle") {
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled ? 1 : 0;
    await env.DB.prepare(
      "UPDATE kingdom_watchlists SET enabled = ?, updated_at = ? WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(enabled, Math.floor(Date.now() / 1000), String(body.watchlist_id || ""), auth.discord_id).run();
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    await env.DB.prepare(
      "DELETE FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(url.searchParams.get("watchlist_id"), auth.discord_id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
export default {
  async scheduled(controller, env, ctx) {
    await runKingdomWatchlistJobs(env);
    const minute = new Date(controller.scheduledTime || Date.now()).getUTCMinutes();
    if (minute === 0) await runDataRetentionJob(env);
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/kingdom-watchlist/history") return await handleKingdomRankingHistoryApi(request, env);
      if (url.pathname === "/api/kingdom-watchlist/data") return await handleKingdomWatchlistDataApi(request, env);
      if (url.pathname === "/api/kingdom-watchlist") return await handleKingdomWatchlistApi(request, env, ctx);
      if (url.pathname === "/kingdom-watchlist") return new Response(await renderKingdomWatchlistPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      if (url.pathname === "/api/auth/discord") return await startDiscordLogin(request, env);
      if (url.pathname === CALLBACK_PATH) return await handleDiscordCallback(request, env);
      if (url.pathname === "/api/auth/logout") return logout(request);
      if (url.pathname === "/api/me") return await handleMe(request, env);
      if (url.pathname === "/api/admin/mightpulse/player") return await handleMightPulsePlayerTest(request, env);
      if (url.pathname === "/api/admin/rankings/player") return await handleRankingPlayerTest(request, env);
      if (url.pathname === "/api/admin/rankings/board") return await handleRankingBoardTest(request, env);
      if (url.pathname === "/api/admin/data-retention") return await handleDataRetentionApi(request, env);
      if (url.pathname === "/api/admin/api-pool/keys") return await handleApiPoolKeys(request, env);
      if (url.pathname === "/api/admin/api-pool/add") return await handleApiPoolAdd(request, env);
      if (url.pathname === "/api/admin/api-pool/move") return await handleApiPoolMove(request, env);
      if (url.pathname === "/api/admin/api-pool/revoke") return await handleApiPoolRevoke(request, env);
      if (url.pathname === "/api/admin/api-pool/delete") return await handleApiPoolDelete(request, env);
      if (url.pathname === "/api/admin/api-pool/test-player") return await handleApiPoolTestPlayer(request, env);
      if (url.pathname === "/admin/data-retention") return new Response(await renderDataRetentionPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      if (url.pathname === "/admin/api-pool") return new Response(await renderApiPoolAdminPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      if (url.pathname === "/api/player/refresh") return await handlePlayerRefresh(request, env);
      if (url.pathname === "/api/player") return await handlePlayerApi(request, env);
      if (url.pathname === "/api/player/history") return await handlePlayerHistoryApi(request, env);
      if (url.pathname === "/api/player/changes") return await handlePlayerChangesApi(request, env);
      if (url.pathname === "/players") return new Response(await renderPlayerSearchPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      if (url.pathname === "/player/history") return new Response(await renderPlayerHistoryPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      if (url.pathname === "/player/changes") return new Response(await renderPlayerChangesPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      if (url.pathname === "/player") return new Response(await renderPlayerPage(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
      return new Response(await renderHome(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
    } catch (error) {
      console.error("EagleEye request error:", error);
      return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
    }
  }
};

function getConfig(env) {
  return {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    sessionSecret: env.EAGLEEYE_SESSION_SECRET,
    redirectUri: env.DISCORD_REDIRECT_URI || DEFAULT_DISCORD_REDIRECT_URI
  };
}

async function startDiscordLogin(request, env) {
  const config = getConfig(env);
  if (!config.clientId || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }

  const redirectUri = config.redirectUri;
  const state = await createStateToken(config.sessionSecret);
  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": authorize.toString(),
      "Cache-Control": "no-store"
    }
  });
}

async function handleDiscordCallback(request, env) {
  const config = getConfig(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!config.clientId || !config.clientSecret || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }
  if (!code || !state) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE", reason: "missing_callback_state" }, 400);
  }
  if (!(await verifyStateToken(state, config.sessionSecret))) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE", reason: "invalid_state_signature" }, 400);
  }

  const redirectUri = config.redirectUri;
  const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    console.error("Discord token exchange failed:", tokenResponse.status);
    return json({ ok: false, error: "DISCORD_TOKEN_EXCHANGE_FAILED" }, 502);
  }

  const token = await tokenResponse.json();
  const userResponse = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: "Bearer " + token.access_token }
  });

  if (!userResponse.ok) {
    console.error("Discord user lookup failed:", userResponse.status);
    return json({ ok: false, error: "DISCORD_USER_LOOKUP_FAILED" }, 502);
  }

  const discordUser = await userResponse.json();
  const now = Math.floor(Date.now() / 1000);
  const sessionPayload = {
    sub: String(discordUser.id),
    username: discordUser.username || null,
    global_name: discordUser.global_name || null,
    avatar: discordUser.avatar || null,
    iat: now,
    exp: now + SESSION_MAX_AGE
  };
  if (env.DB) {
    const userResult = await upsertUser(env.DB, discordUser, now);
    if (userResult?.status === "DISABLED") {
      return json({ ok: false, error: "USER_DISABLED" }, 403);
    }
  }

  const session = await signPayload(sessionPayload, config.sessionSecret);

  const responseHeaders = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  responseHeaders.append("Set-Cookie", serializeCookie(SESSION_COOKIE, session, {
    maxAge: SESSION_MAX_AGE, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, {
    status: 302,
    headers: responseHeaders
  });
}
async function upsertUser(db, discordUser, now) {
  const discordId = String(discordUser.id);
  const existing = await db.prepare(
    `SELECT user_id, status FROM users WHERE discord_id = ? LIMIT 1`
  ).bind(discordId).first();

  if (existing?.status === "DISABLED") {
    return { status: "DISABLED" };
  }

  const userId = existing?.user_id || crypto.randomUUID();
  await db.prepare(
    `INSERT INTO users (
      user_id, discord_id, username, global_name, avatar, role, status,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, 'BASIC', 'ACTIVE', ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      global_name = excluded.global_name,
      avatar = excluded.avatar,
      updated_at = excluded.updated_at,
      last_login_at = excluded.last_login_at`
  ).bind(
    userId,
    discordId,
    discordUser.username || null,
    discordUser.global_name || null,
    discordUser.avatar || null,
    now,
    now,
    now
  ).run();

  return { status: "ACTIVE", user_id: userId };
}

function logout(request) {
  const headers = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, { status: 302, headers });
}

async function handleRankingPlayerTest(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  try {    const result = await getMightPulsePlayerRanks(env, governorId);
    const raw = result.data?.player || result.data;
    const ranks = raw?.ranks || result.data?.ranks;
    if (!ranks) return json({ ok: false, error: "PLAYER_RANKS_MISSING" }, 502);

    const saved = env.DB ? await savePlayerRankSnapshot(env.DB, {
      governorId,
      uid: raw?.uid ?? result.data?.uid ?? null,
      kid: raw?.kid ?? result.data?.kid ?? null,
      ranks,
      observedAt: Math.floor(Date.now() / 1000)
    }) : null;

    return json({ ok: true, governor_id: governorId, saved_snapshot: Boolean(saved), ranks });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
      status: error?.status || 0
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }
}

async function handleRankingBoardTest(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = url.searchParams.get("kid");
  const board = url.searchParams.get("board");
  if (!kid || !board) return json({ ok: false, error: "KID_AND_BOARD_REQUIRED" }, 400);

  try {
    const result = await getMightPulseKingdomRanks(env, kid, { board, limit: 100 });
    const payload = result.data;
    const entries = payload?.rankings || payload?.entries || payload?.data || [];
    const saved = env.DB ? await saveKingdomRankingBoard(env.DB, {
      kid,
      board,
      entries,
      observedAt: Math.floor(Date.now() / 1000)
    }) : 0;
    return json({ ok: true, kid, board, count: Array.isArray(entries) ? entries.length : 0, saved_rows: saved });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
      status: error?.status || 0
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }
}

async function handleMightPulsePlayerTest(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);

  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  try {
    const result = await getMightPulsePlayer(env, governorId, { include: "base" });
    if (env.DB) {
      const observation = observationEnvelope({
        endpoint: "/players/:governor_id",
        httpStatus: result.status,
        raw: result.data
      });
      await saveApiObservation(env.DB, observation);
    }
    return json({
      ok: true,
      provider: "MIGHTPULSE",
      target_type: "PLAYER",
      target_id: governorId,
      upstream_status: result.status,
      saved_observation: Boolean(env.DB)
    });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
      status: error?.status || 0,
      diagnostic: {
        name: error?.name || null,
        message: error?.message || null,
        details: error?.details || null
      }
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }
}


async function requireAdmin(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return { error: json({ ok: false, error: "UNAUTHORIZED" }, 401) };
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return { error: json({ ok: false, error: "ADMIN_REQUIRED" }, 403) };
  if (!env.DB) return { error: json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503) };
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  return { auth };
}

async function handleDataRetentionApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    if (request.method === "GET") {
      return json({ ok: true, settings: await getRetentionSettings(env.DB) });
    }
    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const settings = await updateRetentionSettings(env.DB, body, guard.auth.user_id);
    if (contentType.includes("application/json")) {
      return json({ ok: true, settings });
    }
    return new Response(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>保存しました - EagleEye</title>
<style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.card{text-align:center;padding:32px 28px;border:1px solid #334155;border-radius:16px;background:#162238;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.ok{font-size:42px;margin-bottom:8px}.title{font-size:24px;font-weight:900}.sub{margin-top:8px;color:#94a3b8}
</style>
<meta http-equiv="refresh" content="1;url=/admin/data-retention">
</head><body><div class="card"><div class="ok">✓</div><div class="title">保存しました</div><div class="sub">データ保存期間の設定を更新しました。</div></div></body></html>`, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
  } catch (error) {
    console.error("Data retention settings error:", error);
    return json({ ok: false, error: error?.message || "RETENTION_UPDATE_FAILED" }, 400);
  }
}

async function handleApiPoolKeys(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const keys = await listApiPoolKeys(env.DB);
    return json({ ok: true, keys: keys.map(k => ({
      ...k,
      key_fingerprint: k.key_fingerprint ? String(k.key_fingerprint).slice(0, 16) + "…" : null,
      last_error_message: k.last_error_message || null
    })), stats: await getPoolStats(env.DB) });
  } catch (error) {
    console.error("API pool list error:", error);
    return json({ ok: false, error: "API_POOL_READ_FAILED" }, 500);
  }
}

async function handleApiPoolAdd(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
    const poolType = String(body.pool_type || "SYSTEM_GENERAL");
    const result = await addApiPoolKey(env.DB, {
      poolType,
      label: String(body.label || "").trim() || null,
      apiKey: String(body.api_key || "").trim(),
      contributedByUserId: poolType === "USER_CONTRIBUTED" ? guard.auth.user_id : null,
      consentVersion: poolType === "USER_CONTRIBUTED" ? "v1" : null
    });
    if (contentType.includes("application/json")) return json({ ok: true, key: result }, 201);
    return new Response(null, { status: 302, headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API pool add error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_ADD_FAILED" }, 400);
  }
}

async function handleApiPoolMove(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;

  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }

    const keyId = String(body.key_id || "").trim();
    const poolType = String(body.pool_type || "").trim();
    const allowed = ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"];
    if (!keyId || !allowed.includes(poolType)) {
      return json({ ok: false, error: "INVALID_POOL_MOVE" }, 400);
    }

    const row = await env.DB.prepare(
      "SELECT key_id, pool_type, status FROM api_pool_keys WHERE key_id = ? LIMIT 1"
    ).bind(keyId).first();

    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (row.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_REVOKED" }, 409);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE api_pool_keys SET pool_type = ?, updated_at = ? WHERE key_id = ?"
    ).bind(poolType, now, keyId).run();

    if (contentType.includes("application/json")) {
      return json({ ok: true, key_id: keyId, pool_type: poolType });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("API pool move error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_MOVE_FAILED" }, 400);
  }
}


async function handleApiPoolRevoke(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) body = await request.json();
    else body = Object.fromEntries((await request.formData()).entries());

    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);

    const row = await env.DB.prepare("SELECT key_id, status FROM api_pool_keys WHERE key_id = ? LIMIT 1").bind(keyId).first();
    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (row.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_ALREADY_REVOKED" }, 409);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE api_pool_keys SET status = 'REVOKED', revoked_at = ?, cooldown_until = NULL, updated_at = ? WHERE key_id = ?").bind(now, now, keyId).run();

    if (contentType.includes("application/json")) return json({ ok: true, key_id: keyId, status: "REVOKED" });
    return new Response(null, { status: 302, headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API pool revoke error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_REVOKE_FAILED" }, 400);
  }
}


async function handleApiPoolDelete(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) body = await request.json();
    else body = Object.fromEntries((await request.formData()).entries());

    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);

    const row = await env.DB.prepare(
      "SELECT key_id, status FROM api_pool_keys WHERE key_id = ? LIMIT 1"
    ).bind(keyId).first();
    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);

    // Hard delete: remove leases and usage history, then remove the encrypted key record.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_leases WHERE key_id = ?").bind(keyId),
      env.DB.prepare("DELETE FROM api_pool_usage WHERE key_id = ?").bind(keyId),
      env.DB.prepare("DELETE FROM api_pool_keys WHERE key_id = ?").bind(keyId)
    ]);

    if (contentType.includes("application/json")) {
      return json({ ok: true, key_id: keyId, deleted: true });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("API pool hard delete error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_DELETE_FAILED" }, 400);
  }
}

async function handleApiPoolTestPlayer(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  let lease = null;
  try {
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose: "ADMIN_TEST",
      targetType: "PLAYER",
      targetId: governorId
    });
    const result = await getMightPulsePlayer(env, governorId, { include: "base", apiKey: lease.api_key });
    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      endpoint: "/players/:governor_id",
      targetType: "PLAYER",
      targetId: governorId,
      purpose: "ADMIN_TEST",
      httpStatus: result.status,
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining")
    });
    const sourcePlayer = result?.data?.player || {};
    const sourceTownCenterLevel = sourcePlayer.town_center_level ?? null;
    const sourceFresh = result?.data?.fresh ?? null;
    const sourceAgeSeconds = result?.data?.age_seconds ?? null;
    const payload = {
      ok: true,
      provider: "MIGHTPULSE",
      target_type: "PLAYER",
      target_id: governorId,
      upstream_status: result.status,
      key_id: lease.key_id,
      source_town_center_level: sourceTownCenterLevel,
      source_fresh: sourceFresh,
      source_age_seconds: sourceAgeSeconds,
      eagleeye_town_center_display: formatTownCenterLevel(sourceTownCenterLevel)
    };
    if (new URL(request.url).searchParams.get("format") === "json") {
      return json(payload);
    }
    return new Response(renderApiPoolTestResult(governorId, payload), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
  } catch (error) {
    if (lease) {
      const cooldown = error?.status === 429 ? 60 : error?.status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = error?.status === 401;
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        endpoint: "/players/:governor_id",
        targetType: "PLAYER",
        targetId: governorId,
        purpose: "ADMIN_TEST",
        httpStatus: error?.status || 0,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable
      });
    }
    const status = Number(error?.status || 0);
    const responseStatus = status >= 400 && status < 600 ? status : 502;
    const payload = {
      ok: false,
      error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
      status,
      diagnostic: error?.details || null
    };
    if (new URL(request.url).searchParams.get("format") === "json") {
      return json(payload, responseStatus);
    }
    return new Response(renderApiPoolTestResult(governorId, payload), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
  }
}

function renderApiPoolTestResult(governorId, result) {
  const esc = escapeHtml;
  const ok = result?.ok === true;
  const title = ok ? "API Pool テスト成功" : "API Pool テスト失敗";
  const status = result?.status ?? result?.upstream_status ?? "-";
  const diagnostic = result?.diagnostic || null;
  const sourceDiagnostics = ok
    ? "<div class='detail'><b>元データ確認</b><div class='meta'>MightPulseの役場レベル: " + esc(result?.source_town_center_level ?? "-") + "<br>EagleEye表示: " + esc(result?.eagleeye_town_center_display ?? "-") + "<br>Provider Fresh: " + esc(result?.source_fresh === true ? "YES" : "NO / cached") + "<br>Provider Age: " + esc(result?.source_age_seconds != null ? Math.round(result.source_age_seconds / 3600) + "時間" : "-") + "</div></div>"
    : "";
  const details = diagnostic
    ? "<div class='detail'><b>詳細</b><pre>" + esc(JSON.stringify(diagnostic, null, 2)) + "</pre></div>"
    : "";
  const message = ok
    ? "領主ID " + esc(governorId) + " のデータ取得に成功しました。API Pool → MightPulse の接続は正常です。"
    : "MightPulseへの接続またはAPIリクエストに失敗しました。";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + title + "</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:700px;margin:auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.card{margin-top:20px;padding:20px;border:1px solid #334155;border-radius:16px;background:#162238}.status{font-size:20px;font-weight:900}.ok{color:#86efac}.ng{color:#fca5a5}.meta{margin-top:12px;color:#cbd5e1;line-height:1.8}.detail{margin-top:16px}.detail pre{white-space:pre-wrap;overflow:auto;padding:12px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px}.btn{display:inline-block;margin-top:16px;padding:11px 14px;border-radius:10px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><div class='card'><div class='status " + (ok ? "ok" : "ng") + "'>" + title + "</div><div class='meta'>" + message + "<br>HTTP Status: " + esc(status) + (ok ? "" : "<br>対象: 領主ID " + esc(governorId)) + "</div>" + details + "<a class='btn' href='/admin/api-pool'>管理画面へ戻る</a></div></main></body></html>";
}

function parseHeaderNumber(headers, name) {
  const value = headers?.get?.(name);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;}

async function renderDataRetentionPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const s = await getRetentionSettings(env.DB);
  const esc = escapeHtml;
  const options = (selected) => [
    [0, "永久保存"],
    [7, "7日"],
    [14, "14日"],
    [30, "30日"],
    [60, "60日"],
    [90, "90日"],
    [180, "180日"],
    [365, "1年"],
    [730, "2年"],
    [1095, "3年"],
    [1825, "5年"],
    [3650, "10年"]
  ].map(([v,l]) => "<option value='" + v + "'" + (Number(selected) === v ? " selected" : "") + ">" + l + "</option>").join("");
  const field = (name,label,hint) => "<label><span>" + esc(label) + "</span><select name='" + name + "'>" + options(s[name]) + "</select><small>" + esc(hint) + "</small></label>";
  const updated = s.updated_at ? formatUnix(s.updated_at) : "-";
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye データ保存期間</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.admin-badge{position:fixed;top:14px;right:14px;z-index:10;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.6px;box-shadow:0 6px 20px rgba(0,0,0,.25)}.wrap{max-width:760px;margin:auto;padding:56px 16px 24px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px}.card{padding:18px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}label{display:block;margin-top:14px}label span{display:block;font-weight:800;font-size:14px}select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}small{display:block;margin-top:5px;color:#94a3b8;line-height:1.5}button{margin-top:18px;padding:13px 17px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;width:100%}.danger{border-color:#7f1d1d}.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><h1 class='title'>データ保存期間</h1><div class='card'><b>自動クリーンアップ</b><div class='hint'>毎時の定期処理で古い履歴を少しずつ削除します。現在値・最新状態は維持します。「永久保存」を選ぶと、そのデータ種別は自動削除しません。</div><div class='mono' style='margin-top:10px'>最終設定更新: " + esc(updated) + "</div></div><form method='post' action='/api/admin/data-retention'><div class='card'>" +
    field("api_observations_days","API観測データ","MightPulseの生レスポンス。容量が最も増えやすいデータです。最新の対象データは保持します。") +
    field("player_snapshots_days","プレイヤースナップショット","プレイヤー状態の時系列履歴。") +
    field("ranking_snapshots_days","ランキングスナップショット","王国ランキングの順位・スコア履歴。") +
    field("player_rank_snapshots_days","プレイヤーランキング履歴","プレイヤー個人のランキング情報の履歴。") +
    field("change_events_days","変更イベント","順位変動・戦力変動などEagleEyeが検出した変更履歴。") +
    field("api_pool_usage_days","API Pool使用履歴","APIキーの利用・残量・結果の監査ログ。") +
    "<button type='submit'>保存期間を更新</button></div></form><div class='card'><b>推奨初期値</b><div class='hint'>API観測14日 / プレイヤー90日 / ランキング180日 / プレイヤーランキング180日 / 変更イベント2年 / API Pool使用90日。必要になったら後から延長できます。</div></div></main></body></html>";
}

async function renderApiPoolAdminPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const keys = await listApiPoolKeys(env.DB);
  const stats = await getPoolStats(env.DB);
  const rows = keys.map(k => "<tr><td>" + escapeHtml(k.pool_type) + "</td><td>" + escapeHtml(k.label || "-") + "</td><td>" + escapeHtml(k.status) + "</td><td>" + escapeHtml(k.key_fingerprint ? String(k.key_fingerprint).slice(0,16) + "…" : "-") + "</td><td>" + escapeHtml(k.remaining_minute ?? "-") + "</td><td>" + escapeHtml(formatUnix(k.last_used_at)) + "</td><td>" + (k.status === "REVOKED" ? "-" : "<form method=\"post\" action=\"/api/admin/api-pool/move\" style=\"display:flex;gap:6px;align-items:center\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><select name=\"pool_type\" style=\"margin:0;padding:7px;width:auto\"><option value=\"SYSTEM_GENERAL\"" + (k.pool_type === "SYSTEM_GENERAL" ? " selected" : "") + ">GENERAL</option><option value=\"SYSTEM_WATCHLIST\"" + (k.pool_type === "SYSTEM_WATCHLIST" ? " selected" : "") + ">WATCHLIST</option></select><button type=\"submit\" style=\"margin:0;padding:7px 9px\">移動</button></form><form method=\"post\" action=\"/api/admin/api-pool/revoke\" style=\"display:inline\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#7f1d1d;color:#fff\">無効化</button></form><form method=\"post\" action=\"/api/admin/api-pool/delete\" style=\"display:inline\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#991b1b;color:#fff\">完全削除</button></form>") + "</td></tr>").join("");
  const statText = stats.map(s => s.pool_type + ": " + s.status + "=" + s.count).join(" / ");
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye API Pool</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.admin-badge{position:fixed;top:14px;right:14px;z-index:10;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.6px;box-shadow:0 6px 20px rgba(0,0,0,.25)}.wrap{max-width:900px;margin:auto;padding:56px 16px 24px}.back{color:#94a3b8}.title{font-size:28px}.card{padding:16px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}input,select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}button{margin-top:12px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{text-align:left;padding:9px;border-bottom:1px solid #334155;white-space:nowrap} .scroll{overflow:auto}label{display:block;margin-top:10px;font-size:12px;color:#cbd5e1}</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><h1 class='title'>API Pool 管理</h1><div class='card'><a href='/admin/data-retention' style='color:#f59e0b;font-weight:900;text-decoration:none'>データ保存期間を管理 →</a><div class='hint'>履歴・生APIデータの自動削除期間を設定できます。</div></div><div class='card'><b>Pool Status</b><div class='hint'>" + escapeHtml(statText || "登録キーなし") + "</div></div><div class='card'><b>APIキー登録</b><div class='hint'>キー本体は保存時に暗号化され、画面には表示しません。</div><form method='post' action='/api/admin/api-pool/add'><label>Pool<select name='pool_type'><option>SYSTEM_GENERAL</option><option>SYSTEM_WATCHLIST</option><option>USER_CONTRIBUTED</option></select></label><label>ラベル<input name='label' placeholder='例: Main Key'></label><label>MightPulse API Key<input name='api_key' type='password' autocomplete='off' required></label><button type='submit'>登録</button></form></div><div class='card'><b>登録済みキー</b><div class='scroll'><table><thead><tr><th>Pool</th><th>Label</th><th>Status</th><th>Fingerprint</th><th>Remaining/min</th><th>Last Used</th><th>Pool移動</th></tr></thead><tbody>" + (rows || "<tr><td colspan='7'>なし</td></tr>") + "</tbody></table></div></div><div class='card'><b>テスト</b><form method='get' action='/api/admin/api-pool/test-player'><label>領主ID<input name='governor_id' id='gid' placeholder='223636495' required></label><button type='submit'>Pool経由で取得</button></form></div></main></body></html>";
}

async function fetchThroughWatchlistApiPool(env, {
  path,
  endpoint = path,
  targetType,
  targetId,
  purpose,
  include = null,
  query = null
}) {
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  let lease = null;
  let poolType = "SYSTEM_WATCHLIST";
  try {
    try {
      lease = await leaseApiKey(env.DB, {
        poolType: "SYSTEM_WATCHLIST",
        purpose,
        targetType,
        targetId
      });
    } catch (error) {
      if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
      poolType = "SYSTEM_GENERAL";
      lease = await leaseApiKey(env.DB, {
        poolType,
        purpose,
        targetType,
        targetId
      });
    }

    const result = await mightPulseFetch(env, path, {
      query: query || (include ? { include } : undefined),
      apiKey: lease.api_key
    });

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      endpoint,
      targetType,
      targetId,
      purpose,
      httpStatus: result.status,
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
      remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
    });

    return { result, pool_type: poolType, key_id: lease.key_id };
  } catch (error) {
    if (lease) {
      const status = Number(error?.status || 0);
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = status === 401;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        endpoint,
        targetType,
        targetId,
        purpose,
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
      });
    }
    throw error;
  }
}

async function fetchKingdomRankingsBulkThroughApiPool(env, kid, limit, purpose = "KINGDOM_WATCHLIST_RANKING_BULK") {
  return fetchThroughWatchlistApiPool(env, {
    path: `/kingdoms/${encodeURIComponent(kid)}`,
    endpoint: "/kingdoms/:kid?include=boards",
    targetType: "KINGDOM",
    targetId: String(kid),
    purpose,
    query: { include: "boards", limit }
  });
}

function extractKingdomRankingBoards(payload) {
  const expected = new Set(KINGDOM_RANKING_BOARDS);
  const containers = [
    payload?.boards,
    payload?.kingdom?.boards,
    payload?.data?.boards,
    payload?.data?.kingdom?.boards,
    payload?.result?.boards,
    payload?.result?.data?.boards,
    payload?.rankings,
    payload?.data?.rankings
  ];

  const out = {};

  function addBoard(board, value) {
    if (!board || !expected.has(String(board))) return;
    let entries = value;
    if (entries && !Array.isArray(entries) && typeof entries === "object") {
      entries = entries.rankings ?? entries.entries ?? entries.rows ?? entries.items ?? entries.data;
    }
    if (Array.isArray(entries) && entries.length) out[String(board)] = entries;
  }

  for (const container of containers) {
    if (!container) continue;
    if (Array.isArray(container)) {
      for (const item of container) {
        if (!item || typeof item !== "object") continue;
        addBoard(item.board ?? item.key ?? item.type ?? item.name, item.rankings ?? item.entries ?? item.rows ?? item.items ?? item.data);
      }
    } else if (typeof container === "object") {
      for (const [board, value] of Object.entries(container)) addBoard(board, value);
    }
  }

  for (const board of expected) {
    if (out[board]) continue;
    const value = payload?.[board] ?? payload?.data?.[board] ?? payload?.kingdom?.[board];
    addBoard(board, value);
  }

  return out;
}

async function fetchKingdomRankingThroughApiPool(env, kid, board, limit, purpose = "KINGDOM_WATCHLIST_RANKING") {
  return fetchThroughWatchlistApiPool(env, {
    path: `/kingdoms/${encodeURIComponent(kid)}/ranks`,
    endpoint: "/kingdoms/:kid/ranks",
    targetType: "KINGDOM",
    targetId: String(kid),
    purpose,
    query: { board, limit }
  });
}

async function fetchPlayerDetailThroughApiPool(env, governorId, purpose = "KINGDOM_WATCHLIST_PLAYER") {
  return fetchThroughWatchlistApiPool(env, {
    path: `/players/${encodeURIComponent(governorId)}`,
    endpoint: "/players/:governor_id",
    targetType: "PLAYER",
    targetId: String(governorId),
    purpose,
    query: { include: "base,heroes,ranks,gov_gear" }
  });
}

async function fetchPlayerThroughApiPool(env, governorId, purpose = "PLAYER_LOOKUP") {
  if (!env.DB) throw new Error("DB_NOT_CONFIGURED");
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);

  const id = String(governorId || "").trim();
  if (!id) {
    const error = new Error("GOVERNOR_ID_REQUIRED");
    error.code = "GOVERNOR_ID_REQUIRED";
    error.status = 400;
    throw error;
  }

  let lease = null;
  try {
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose,
      targetType: "PLAYER",
      targetId: id
    });

    const result = await getMightPulsePlayer(env, id, {
      include: "base",
      apiKey: lease.api_key
    });

    const observationEnvelopeData = observationEnvelope({
      endpoint: "/players/:governor_id",
      httpStatus: result.status,
      raw: result.data
    });
    const savedObservation = await saveApiObservation(env.DB, observationEnvelopeData);
    const observation = {
      ...observationEnvelopeData,
      observation_id: savedObservation.observation_id,
      payload: result.data
    };

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      endpoint: "/players/:governor_id",
      targetType: "PLAYER",
      targetId: id,
      purpose,
      httpStatus: result.status,
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining")
    });

    return { result, observation, key_id: lease.key_id };
  } catch (error) {
    if (lease) {
      const status = Number(error?.status || 0);
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = status === 401;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        endpoint: "/players/:governor_id",
        targetType: "PLAYER",
        targetId: id,
        purpose,
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
      });
    }
    throw error;
  }
}

async function handlePlayerApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const refresh = url.searchParams.get("refresh") === "1";
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    let player = await getPlayer(env.DB, governorId);
    let observation = await getLatestPlayerObservation(env.DB, governorId);
    let source = "D1";

    if (!observation || refresh) {
      const fetched = await fetchPlayerThroughApiPool(env, governorId, refresh ? "PLAYER_REFRESH" : "PLAYER_LOOKUP");
      observation = fetched.observation;
      player = await materializePlayer(env.DB, observation);
      source = "MIGHTPULSE";
    } else if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation);
    }

    const visiblePlayer = filterPlayerForRole(player, auth.role);

    return json({
      ok: true,
      player: visiblePlayer,
      source,
      freshness: {
        provider: "MIGHTPULSE",
        fresh: observation.payload?.fresh ?? null,
        cached_at: observation.payload?.cached_at ?? null,
        age_seconds: observation.payload?.age_seconds ?? null,
        eagleeye_observed_at: observation.observed_at
      }
    });
  } catch (error) {
    console.error("Player API error:", error);
    const status = Number(error?.status || 0);
    if (error?.message === "NO_API_POOL_KEY_AVAILABLE") {
      return json({ ok: false, error: "NO_API_POOL_KEY_AVAILABLE" }, 503);
    }
    if (status === 404) return json({ ok: false, error: "PLAYER_NOT_FOUND" }, 404);
    if (status === 401) return json({ ok: false, error: "MIGHTPULSE_UNAUTHORIZED" }, 502);
    return json({
      ok: false,
      error: error?.code || "PLAYER_READ_FAILED"
    }, status >= 400 && status < 600 ? status : 502);
  }
}

async function handlePlayerRefresh(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  try {
    const fetched = await fetchPlayerThroughApiPool(env, governorId, "PLAYER_REFRESH");
    const player = await materializePlayer(env.DB, fetched.observation);
    return json({
      ok: true,
      player: filterPlayerForRole(player, auth.role),
      refreshed: true,
      freshness: {
        provider: "MIGHTPULSE",
        fresh: fetched.observation.payload?.fresh ?? null,
        cached_at: fetched.observation.payload?.cached_at ?? null,
        age_seconds: fetched.observation.payload?.age_seconds ?? null,
        eagleeye_observed_at: fetched.observation.observed_at
      }
    });
  } catch (error) {
    console.error("Player refresh error:", error);
    const status = Number(error?.status || 0);
    if (error?.message === "NO_API_POOL_KEY_AVAILABLE") return json({ ok: false, error: "NO_API_POOL_KEY_AVAILABLE" }, 503);
    if (status === 404) return json({ ok: false, error: "PLAYER_NOT_FOUND" }, 404);
    return json({ ok: false, error: error?.code || "PLAYER_REFRESH_FAILED" }, status >= 400 && status < 600 ? status : 502);
  }
}

async function renderPlayerSearchPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player Search</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>`;
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  let rows = [];

  if (q && env.DB) {
    const like = `%${q}%`;
    const searchResult = await env.DB.prepare(
      `SELECT governor_id, nick_name, kid, power, town_center_level, alliance_name, observed_at
       FROM players
       WHERE governor_id LIKE ?
          OR nick_name LIKE ?
          OR CAST(kid AS TEXT) LIKE ?
          OR alliance_name LIKE ?
       ORDER BY power DESC
       LIMIT 30`
    ).bind(like, like, like, like).all();
    rows = searchResult.results || [];
  }

  const results = rows.map(row => `
    <a class="result" href="/player?governor_id=${encodeURIComponent(row.governor_id)}">
      <div class="result-main">
        <div class="name">${escapeHtml(row.nick_name || "Unknown Player")}</div>
        <div class="sub">領主ID ${escapeHtml(row.governor_id)} · 王国 ${escapeHtml(row.kid ?? "-")}</div>
        <div class="sub">${escapeHtml(row.alliance_name || "同盟なし")}</div>
      </div>
      <div class="power">${escapeHtml(formatNumber(row.power))}</div>
    </a>`).join("");

  const numericGovernorId = /^\d{7,12}$/.test(q);
  const body = q
    ? (rows.length > 0 ? results : (numericGovernorId
      ? `<a class="lookup" href="/player?governor_id=${encodeURIComponent(q)}">領主ID ${escapeHtml(q)} をデータ取得して表示する →</a>`
      : `<div class="empty">該当するプレイヤーが見つかりません。<br><span>領主名・領主ID・王国・同盟名は、EagleEyeに保存済みのデータから検索します。</span></div>`))
    : `<div class="hint">領主名・領主ID・王国・同盟名から検索できます。<br><span>領主IDで検索した領主が未登録でも、EagleEyeが取得して詳細を表示します。</span></div>`;
