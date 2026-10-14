const SECRET_FIELD = /(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password|credential)/i;

export function validateManualProbeCommand(input = {}) {
  const rawPath = String(input.path || "").trim();
  if (!rawPath || rawPath.length > 500) throw new Error("PROBE_PATH_REQUIRED_OR_TOO_LONG");
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\\\") || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) {
    throw new Error("PROBE_PATH_MUST_BE_RELATIVE");
  }
  const pathOnly = rawPath.split("?")[0];
  if (pathOnly.split("/").some(segment => segment === "." || segment === "..")) throw new Error("PROBE_PATH_TRAVERSAL_NOT_ALLOWED");
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(pathOnly)) throw new Error("PROBE_PATH_HAS_INVALID_CHARACTERS");
  const query = input.query == null || input.query === "" ? {} : input.query;
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("PROBE_QUERY_MUST_BE_JSON_OBJECT");
  const entries = Object.entries(query);
  if (entries.length > 50) throw new Error("PROBE_QUERY_TOO_MANY_FIELDS");
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key)) throw new Error("PROBE_QUERY_INVALID_FIELD_NAME");
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

export async function archiveMightPulseProbeRecord(env, record) {
  const id = String(record?.request_id || crypto.randomUUID());
  const now = Math.floor(Date.now() / 1000);
  const date = new Date(now * 1000).toISOString().slice(0, 10);
  const objectKey = "mightpulse-probe/" + date + "/" + id + ".json";
  const safeRecord = redactProbeSecrets(record);
  let r2Saved = false;
  let metadataSaved = false;
  let metadataError = null;

  if (env?.ARCHIVE?.put) {
    await env.ARCHIVE.put(objectKey, JSON.stringify(safeRecord), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        request_id: id,
        status: String(record?.status || "UNKNOWN").slice(0, 40),
        command_type: String(record?.command_type || "UNKNOWN").slice(0, 40),
        created_at: String(now)
      }
    });
    r2Saved = true;
  }

  if (env?.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO mightpulse_probe_runs (request_id, created_at, user_id, command_type, endpoint, status, http_status, elapsed_ms, response_bytes, r2_object_key, error_code, trigger_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        id,
        now,
        record?.user_id == null ? null : String(record.user_id).slice(0, 128),
        String(record?.command_type || "UNKNOWN").slice(0, 40),
        String(record?.endpoint || "").slice(0, 500),
        String(record?.status || "UNKNOWN").slice(0, 40),
        Number.isFinite(Number(record?.http_status)) ? Number(record.http_status) : null,
        Number.isFinite(Number(record?.elapsed_ms)) ? Number(record.elapsed_ms) : null,
        JSON.stringify(safeRecord).length,
        r2Saved ? objectKey : null,
        record?.error_code == null ? null : String(record.error_code).slice(0, 100),
        String(record?.trigger_reason || "MANUAL").slice(0, 40)
      ).run();
      metadataSaved = true;
    } catch (error) {
      metadataError = String(error?.message || error).slice(0, 300);
    }
  }

  return { request_id: id, r2_saved: r2Saved, metadata_saved: metadataSaved, object_key: r2Saved ? objectKey : null, metadata_error: metadataError };
}
