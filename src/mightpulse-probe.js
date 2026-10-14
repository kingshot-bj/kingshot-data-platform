import { encryptSecret, decryptSecret } from "./api-pool.js";

const SECRET_FIELD = /(?:^key$|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password|credential)/i;

export const MIGHTPULSE_PROBE_COMMANDS = [
  { id:"player_base", category:"Player", label:"Player 基本情報", method:"GET", endpoint:"/players/{governor_id}", query:{include:"base"}, requiresMighty:false, references:["governor_id","kid"] },
  { id:"player_ranks", category:"Player", label:"Player ランキング", method:"GET", endpoint:"/players/{governor_id}", query:{include:"ranks"}, requiresMighty:false, references:["governor_id","kid"] },
  { id:"player_full", category:"Player", label:"Player 全セクション", method:"GET", endpoint:"/players/{governor_id}", query:{include:"base,heroes,ranks,gov_gear"}, requiresMighty:false, references:["governor_id","kid"] },
  { id:"player_uid", category:"Player", label:"Player 内部UID検索", method:"GET", endpoint:"/players/{uid}", query:{id_type:"uid",include:"base"}, requiresMighty:false, references:["governor_id","kid"] },
  { id:"kingdom_list", category:"Kingdom", label:"王国一覧", method:"GET", endpoint:"/kingdoms", query:{page:1,size:24}, requiresMighty:false, references:["kid"] },
  { id:"kingdom_detail", category:"Kingdom", label:"王国詳細", method:"GET", endpoint:"/kingdoms/{kid}", query:{}, requiresMighty:false, references:["kid"] },
  { id:"kingdom_boards", category:"Ranking", label:"王国 全ランキングボード", method:"GET", endpoint:"/kingdoms/{kid}", query:{include:"boards",limit:100}, requiresMighty:false, references:["governor_id","kid","alliance_tag"] },
  { id:"kingdom_ranks", category:"Ranking", label:"王国ランキング一覧", method:"GET", endpoint:"/kingdoms/{kid}/ranks", query:{limit:100}, requiresMighty:false, references:["governor_id","kid","alliance_tag"] },
  { id:"kingdom_rank_board", category:"Ranking", label:"指定ランキング", method:"GET", endpoint:"/kingdoms/{kid}/ranks", query:{board:"personal_power",limit:100}, requiresMighty:false, references:["governor_id","kid","alliance_tag"] },
  { id:"alliance_detail", category:"Alliance", label:"同盟詳細・メンバー", method:"GET", endpoint:"/alliances/{kid}/{tag}", query:{include:"info,roster"}, requiresMighty:false, references:["governor_id","kid","alliance_tag"] },
  { id:"kingdom_events", category:"Mighty", label:"王国イベント", method:"GET", endpoint:"/kingdoms/{kid}/events", query:{}, requiresMighty:true, references:["kid"] },
  { id:"kingdom_kvk", category:"Mighty", label:"王国KvK情報", method:"GET", endpoint:"/kingdoms/{kid}/kvk", query:{}, requiresMighty:true, references:["kid"] },
  { id:"kingdom_kvk_scores", category:"Mighty", label:"王国KvKスコア", method:"GET", endpoint:"/kingdoms/{kid}/kvk/scores", query:{}, requiresMighty:true, references:["kid"] },
  { id:"kvk_matchups", category:"Mighty", label:"全KvKマッチアップ", method:"GET", endpoint:"/kvk/matchups", query:{}, requiresMighty:true, references:["kid"] },
  { id:"eagleeye_player_refresh", category:"EagleEye Retrieval", label:"EagleEye内部：プレイヤー詳細更新", method:"GET", endpoint:"/players/{governor_id}", query:{include:"base,heroes,ranks,gov_gear"}, requiresMighty:false, references:["governor_id","kid"], command_kind:"EAGLEEYE_INTERNAL" },
  { id:"eagleeye_player_rank_refresh", category:"EagleEye Retrieval", label:"EagleEye内部：プレイヤーランキング更新", method:"GET", endpoint:"/players/{governor_id}", query:{include:"base,ranks"}, requiresMighty:false, references:["governor_id","kid"], command_kind:"EAGLEEYE_INTERNAL" },
  { id:"eagleeye_kingdom_rank_refresh", category:"EagleEye Retrieval", label:"EagleEye内部：王国ランキング保存処理", method:"GET", endpoint:"/kingdoms/{kid}/ranks", query:{board:"personal_power",limit:100}, requiresMighty:false, references:["governor_id","kid","alliance_tag"], command_kind:"EAGLEEYE_INTERNAL" },
  { id:"eagleeye_alliance_roster_refresh", category:"EagleEye Retrieval", label:"EagleEye内部：同盟名簿取得", method:"GET", endpoint:"/alliances/{kid}/{tag}", query:{include:"info,roster"}, requiresMighty:false, references:["governor_id","kid","alliance_tag"], command_kind:"EAGLEEYE_INTERNAL" },
  { id:"eagleeye_alliance_rosters", category:"EagleEye Retrieval", label:"EagleEye内部：上位同盟名簿を連鎖取得", method:"GET", endpoint:"/kingdoms/{kid}/ranks", query:{board:"alliance_power",limit:10}, requiresMighty:false, references:["kid","alliance_tag"], command_kind:"EAGLEEYE_INTERNAL_BATCH" },
  { id:"eagleeye_kingdom_events_refresh", category:"EagleEye Retrieval", label:"EagleEye内部：王国イベント取得", method:"GET", endpoint:"/kingdoms/{kid}/events", query:{}, requiresMighty:true, references:["kid"], command_kind:"EAGLEEYE_INTERNAL" },
  { id:"eagleeye_kvk_refresh", category:"EagleEye Retrieval", label:"EagleEye内部：KvKデータ取得", method:"GET", endpoint:"/kingdoms/{kid}/kvk", query:{}, requiresMighty:true, references:["kid"], command_kind:"EAGLEEYE_INTERNAL" }
];

export const MIGHTPULSE_PROBE_FIELD_DICTIONARY_LIMIT = 400;

export function buildProbeFieldDictionary(payload) {
  const fields = new Map();
  const seenValues = new Map();
  function valueType(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
    return typeof value;
  }
  function sampleValue(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return "[array:" + value.length + "]";
    return "{object}";
  }
  function visit(value, path, depth) {
    if (fields.size >= MIGHTPULSE_PROBE_FIELD_DICTIONARY_LIMIT || depth > 9) return;
    const type = valueType(value);
    if (path) {
      const prior = fields.get(path);
      const sample = sampleValue(value);
      fields.set(path, { path, type: prior?.type === type ? type : prior ? "mixed" : type, observed:true, observations:(prior?.observations || 0)+1 });
      if (!seenValues.has(path)) seenValues.set(path, []);
      const samples = seenValues.get(path);
      if (samples.length < 3 && !samples.some(item => JSON.stringify(item) === JSON.stringify(sample))) samples.push(sample);
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 3)) visit(item, path ? path + "[]" : "[]", depth + 1);
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) visit(child, path ? path + "." + key : key, depth + 1);
    }
  }
  visit(payload, "", 0);
  return [...fields.values()].map(field => ({ ...field, samples:seenValues.get(field.path) || [] })).sort((a,b)=>a.path.localeCompare(b.path));
}

export function extractProbeReferences(payload, { maxReferences = 20, maxDepth = 8, kingdomId = null } = {}) {
  const found = new Map();
  const seenObjects = new Set();
  function walk(value, depth, inheritedKid = null) {
    if (!value || typeof value !== "object" || depth > maxDepth || found.size >= maxReferences) return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) walk(item, depth + 1, inheritedKid);
      return;
    }
    const kidValue = value.kid ?? value.kingdom_id ?? value.kingdomId ?? inheritedKid;
    const kid = kidValue == null ? null : String(kidValue).trim();
    for (const [key, raw] of Object.entries(value)) {
      if (raw == null) continue;
      const val = String(raw).trim();
      if (!val) continue;
      if (["governor_id","governorId","fid"].includes(key) && /^\d{4,20}$/.test(val)) found.set("player:" + val, { type:"PLAYER", governor_id:val, kid });
      if (["kid","kingdom_id","kingdomId"].includes(key) && /^\d{1,8}$/.test(val)) found.set("KINGDOM:" + val, { type:"KINGDOM", kid:val });
      if (["abbr","alliance_tag","allianceTag"].includes(key) && kid && /^[A-Za-z0-9_\-]{1,20}$/.test(val)) found.set("ALLIANCE:" + kid + ":" + val, { type:"ALLIANCE", kid, tag:val });
      if (raw && typeof raw === "object") walk(raw, depth + 1, kid);
      if (found.size >= maxReferences) break;
    }
  }
  walk(payload, 0, kingdomId == null ? null : String(kingdomId));
  return [...found.values()].slice(0, maxReferences);
}

export function buildCatalogProbeCommand(commandId, params = {}) {
  const entry = MIGHTPULSE_PROBE_COMMANDS.find(item => item.id === String(commandId || ""));
  if (!entry) throw new Error("UNKNOWN_PROBE_COMMAND");
  const values = { governor_id:params.governor_id, uid:params.uid || params.governor_id, kid:params.kid, tag:params.tag };
  const path = entry.endpoint.replace(/\{([a-z_]+)\}/g, (_, key) => {
    const value = values[key];
    if (value == null || String(value).trim() === "") throw new Error("PROBE_PARAMETER_REQUIRED:" + key);
    return encodeURIComponent(String(value).trim());
  });
  const query = { ...entry.query };
  if (entry.id === "kingdom_rank_board" && params.board) query.board = String(params.board);
  if (entry.id === "kingdom_rank_board" && params.limit) query.limit = Math.min(100, Math.max(1, Number(params.limit) || 100));
  if (entry.id === "kingdom_list") {
    query.page = Math.max(1, Number(params.page) || 1);
    query.size = Math.min(24, Math.max(1, Number(params.size) || 24));
  }
  return { ...entry, path, query };
}

export function validateManualProbeCommand(input = {}) {
  const rawPath = String(input.path || "").trim();
  if (!rawPath || rawPath.length > 500) throw new Error("PROBE_PATH_REQUIRED_OR_TOO_LONG");
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) {
    throw new Error("PROBE_PATH_MUST_BE_RELATIVE");
  }
  const pathOnly = rawPath.split("?")[0];
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathOnly); }
  catch { throw new Error("PROBE_PATH_INVALID_PERCENT_ENCODING"); }
  if (/(?:%2f|%5c)/i.test(pathOnly) || decodedPath.includes("\\") || decodedPath.split("/").some(segment => segment === "." || segment === "..")) {
    throw new Error("PROBE_PATH_TRAVERSAL_NOT_ALLOWED");
  }
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(pathOnly)) throw new Error("PROBE_PATH_HAS_INVALID_CHARACTERS");
  const query = input.query == null || input.query === "" ? {} : input.query;
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("PROBE_QUERY_MUST_BE_JSON_OBJECT");
  const entries = Object.entries(query);
  if (entries.length > 50) throw new Error("PROBE_QUERY_TOO_MANY_FIELDS");
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key)) throw new Error("PROBE_QUERY_INVALID_FIELD_NAME");
    if (/(?:^key$|api[_-]?key|authorization|token|secret|password|credential)/i.test(key)) throw new Error("PROBE_QUERY_SECRET_FIELD_NOT_ALLOWED");
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw new Error("PROBE_QUERY_VALUES_MUST_BE_SCALARS");
    if (typeof value === "string" && value.length > 2000) throw new Error("PROBE_QUERY_VALUE_TOO_LONG");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("PROBE_QUERY_INVALID_NUMBER");
  }
  if (JSON.stringify(query).length > 12000) throw new Error("PROBE_QUERY_TOO_LARGE");
  return { path: pathOnly, query };
}

export function redactProbeSecrets(value, depth = 0) {
  if (depth > 30) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.map(item => redactProbeSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = SECRET_FIELD.test(key) ? "[REDACTED]" : redactProbeSecrets(child, depth + 1);
  }
  return out;
}

export async function addMightPulseProbeKey(db, { apiKey, label = null, registeredByUserId = null } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("PROBE_API_KEY_REQUIRED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const existing = await db.prepare("SELECT key_id FROM mightpulse_probe_keys WHERE key_fingerprint = ? LIMIT 1").bind(fingerprint).first();
  if (existing) throw new Error("PROBE_API_KEY_ALREADY_REGISTERED");
  const keyId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const encrypted = await encryptSecret(key);
  await db.prepare(
    "INSERT INTO mightpulse_probe_keys (key_id, label, registered_by_user_id, encrypted_key, key_fingerprint, status, mighty_capable, mighty_check_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 0, 'UNCONFIRMED', ?, ?)"
  ).bind(keyId, String(label || "Probe専用キー").slice(0, 100), registeredByUserId == null ? null : String(registeredByUserId).slice(0,128), encrypted, fingerprint, now, now).run();
  return { key_id: keyId, label: String(label || "Probe専用キー").slice(0, 100), key_fingerprint: fingerprint.slice(0, 8), status: "AVAILABLE", mighty_capable: false, mighty_check_status: "UNCONFIRMED" };
}

export async function listMightPulseProbeKeys(db) {
  const result = await db.prepare(
    "SELECT key_id, label, registered_by_user_id, key_fingerprint, status, mighty_capable, mighty_check_status, mighty_checked_at, last_used_at, last_success_at, last_error_at, last_error_code, cooldown_until, leased_until, created_at, updated_at, revoked_at FROM mightpulse_probe_keys ORDER BY created_at DESC"
  ).all();
  return (result.results || []).map(row => ({
    ...row,
    key_fingerprint: String(row.key_fingerprint || "").slice(0, 8),
    mighty_capable: Number(row.mighty_capable) === 1
  }));
}

export async function leaseMightPulseProbeKey(db, { keyId = null, mightyRequired = false, purpose = "MIGHTPULSE_PROBE", targetId = null, leaseSeconds = 120 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const leaseId = crypto.randomUUID();
  const expiresAt = now + Math.max(30, Number(leaseSeconds) || 120);
  const mightyCondition = mightyRequired ? " AND mighty_capable = 1 AND mighty_check_status = 'CONFIRMED'" : "";
  const keyCondition = keyId ? " AND key_id = ?" : "";
  const bindings = [leaseId, expiresAt, now, now, now];
  if (keyId) bindings.push(String(keyId));
  const row = await db.prepare(
    "UPDATE mightpulse_probe_keys SET lease_id = ?, leased_until = ?, updated_at = ? WHERE key_id = (SELECT key_id FROM mightpulse_probe_keys WHERE status IN ('AVAILABLE','COOLDOWN') AND (cooldown_until IS NULL OR cooldown_until <= ?) AND (leased_until IS NULL OR leased_until <= ?) AND revoked_at IS NULL" + mightyCondition + keyCondition + " ORDER BY COALESCE(last_used_at,0) ASC, created_at ASC LIMIT 1) RETURNING key_id, label, registered_by_user_id, key_fingerprint, encrypted_key, mighty_capable"
  ).bind(...bindings).first();
  if (!row) return null;
  return {
    lease_id: leaseId, key_id: row.key_id, pool_type: "PROBE_DEDICATED",
    label: row.label, key_fingerprint: String(row.key_fingerprint || "").slice(0, 8),
    mighty_capable: Number(row.mighty_capable) === 1,
    key_owner_user_id: row.registered_by_user_id || null,
    api_key: await decryptSecret(row.encrypted_key), expires_at: expiresAt
  };
}

export async function releaseMightPulseProbeKey(db, leaseId, { status = null, errorCode = null, cooldownSeconds = 0, success = false } = {}) {
  if (!leaseId) return;
  const now = Math.floor(Date.now() / 1000);
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds : null;
  const nextStatus = status || (cooldownSeconds > 0 ? "COOLDOWN" : "AVAILABLE");
  await db.prepare(
    "UPDATE mightpulse_probe_keys SET status = ?, cooldown_until = ?, last_used_at = ?, last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END, last_error_at = CASE WHEN ? IS NOT NULL THEN ? ELSE last_error_at END, last_error_code = ?, lease_id = NULL, leased_until = NULL, updated_at = ? WHERE lease_id = ?"
  ).bind(nextStatus, cooldownUntil, now, success ? 1 : 0, now, errorCode || null, now, errorCode || null, now, leaseId).run();
}

export async function revokeMightPulseProbeKey(db, keyId) {
  if (!keyId) throw new Error("PROBE_KEY_ID_REQUIRED");
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    "UPDATE mightpulse_probe_keys SET status = 'REVOKED', revoked_at = ?, lease_id = NULL, leased_until = NULL, updated_at = ? WHERE key_id = ? AND status != 'REVOKED'"
  ).bind(now, now, keyId).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function setMightPulseProbeKeyMighty(db, keyId, { capable, status, errorCode = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE mightpulse_probe_keys SET mighty_capable = ?, mighty_check_status = ?, mighty_checked_at = ?, last_error_code = ?, updated_at = ? WHERE key_id = ?"
  ).bind(capable ? 1 : 0, status || (capable ? "CONFIRMED" : "NOT_MIGHTY"), now, errorCode, now, keyId).run();
}

export async function archiveMightPulseProbeRecord(env, record) {
  const id = String(record?.request_id || crypto.randomUUID());
  const now = Math.floor(Date.now() / 1000);
  const date = new Date(now * 1000).toISOString().slice(0, 10);
  const objectKey = "mightpulse-probe/" + date + "/" + id + ".json";
  const safeRecord = redactProbeSecrets(record);
  let r2Saved = false;
  const requestedDestination = String(record?.save_destination || "R2");
  const finalDestination = () => r2Saved ? requestedDestination : requestedDestination.includes("PRODUCTION") ? "PRODUCTION" : "NONE";
  let metadataSaved = false;
  let r2Error = env?.ARCHIVE?.put ? null : "R2_NOT_CONFIGURED";
  let metadataError = null;

  if (env?.ARCHIVE?.put) {
    try {
      await env.ARCHIVE.put(objectKey, JSON.stringify(safeRecord), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: {
          request_id: id,
          batch_id: String(record?.batch_id || "").slice(0, 80),
          status: String(record?.status || "UNKNOWN").slice(0, 40),
          command_type: String(record?.command_type || "UNKNOWN").slice(0, 40),
          created_at: String(now)
        }
      });
      r2Saved = true;
    } catch {
      r2Error = "R2_ARCHIVE_FAILED";
    }
  }

  if (env?.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO mightpulse_probe_runs (request_id, created_at, user_id, actor_discord_id, actor_label, actor_role, command_type, endpoint, status, http_status, elapsed_ms, response_bytes, r2_object_key, error_code, trigger_reason, batch_id, sequence_no, discovered_from, response_count, retry_count, save_destination, key_source, key_id, key_owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        id,
        now,
        record?.user_id == null ? null : String(record.user_id).slice(0, 128),
        record?.actor_discord_id == null ? null : String(record.actor_discord_id).slice(0, 128),
        record?.actor_label == null ? null : String(record.actor_label).slice(0, 160),
        record?.actor_role == null ? null : String(record.actor_role).slice(0, 32),
        String(record?.command_type || "UNKNOWN").slice(0, 40),
        String(record?.endpoint || "").slice(0, 500),
        String(record?.status || "UNKNOWN").slice(0, 40),
        Number.isFinite(Number(record?.http_status)) ? Number(record.http_status) : null,
        Number.isFinite(Number(record?.elapsed_ms)) ? Number(record.elapsed_ms) : null,
        JSON.stringify(safeRecord).length,
        r2Saved ? objectKey : null,
        record?.error_code == null ? null : String(record.error_code).slice(0, 100),
        String(record?.trigger_reason || "MANUAL").slice(0, 40),
        record?.batch_id == null ? null : String(record.batch_id).slice(0, 80),
        Number.isFinite(Number(record?.sequence_no)) ? Number(record.sequence_no) : null,
        record?.discovered_from == null ? null : String(record.discovered_from).slice(0, 500),
        Number.isFinite(Number(record?.response_count)) ? Number(record.response_count) : null,
        Number.isFinite(Number(record?.retry_count)) ? Number(record.retry_count) : 0,
        String(finalDestination()).slice(0, 40),
        record?.key_source == null ? null : String(record.key_source).slice(0, 40),
        record?.key_id == null ? null : String(record.key_id).slice(0, 128),
        record?.key_owner_user_id == null ? null : String(record.key_owner_user_id).slice(0, 128)
      ).run();
      metadataSaved = true;
    } catch {
      metadataError = "D1_METADATA_WRITE_FAILED";
    }
  }

  return { request_id: id, r2_saved: r2Saved, metadata_saved: metadataSaved, object_key: r2Saved ? objectKey : null, r2_error: r2Error, metadata_error: metadataError };
}
