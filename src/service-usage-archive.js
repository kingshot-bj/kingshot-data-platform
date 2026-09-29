const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HALF_DAY_HOURS = 12;

function getJstWindow(date = new Date()) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const hour = jst.getUTCHours();
  const startHour = hour < HALF_DAY_HOURS ? 0 : 12;
  const datePart = `${year}/${month}/${day}`;
  const label = startHour === 0 ? "00-12" : "12-24";
  return {
    key: `service-events/${datePart}/${label}.ndjson.gz`,
    datePart,
    label,
    startHour
  };
}

async function gzipText(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function gunzipText(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function normalizeEvent(value) {
  if (!value || typeof value !== "object") throw new Error("SERVICE_USAGE_INVALID_EVENT");
  if (!value.event_id || !value.occurred_at || !value.operation) {
    throw new Error("SERVICE_USAGE_INVALID_EVENT");
  }
  return value;
}

async function readExistingEvents(bucket, key) {
  if (!bucket) throw new Error("ARCHIVE_BUCKET_UNAVAILABLE");
  const object = await bucket.get(key);
  if (!object) return [];
  const buffer = await object.arrayBuffer();
  const text = await gunzipText(buffer);
  return text.split("\n").filter(Boolean).map(line => normalizeEvent(JSON.parse(line)));
}

function mergeEvents(existing, incoming) {
  const byId = new Map();
  for (const event of existing) byId.set(String(event.event_id), event);
  for (const event of incoming) byId.set(String(event.event_id), event);
  return [...byId.values()].sort((a, b) => {
    const at = String(a.occurred_at || "");
    const bt = String(b.occurred_at || "");
    return at.localeCompare(bt);
  });
}

export async function writeServiceUsageBatch(bucket, events) {
  if (!bucket) throw new Error("ARCHIVE_BUCKET_UNAVAILABLE");
  if (!Array.isArray(events) || !events.length) return { written: 0, key: null };

  const normalized = events.map(normalizeEvent);
  const windows = new Map();

  for (const event of normalized) {
    const window = getJstWindow(new Date(event.occurred_at));
    if (!windows.has(window.key)) windows.set(window.key, []);
    windows.get(window.key).push(event);
  }

  let written = 0;
  const results = [];

  for (const [key, windowEvents] of windows) {
    const existing = await readExistingEvents(bucket, key);
    const merged = mergeEvents(existing, windowEvents);
    const ndjson = merged.map(event => JSON.stringify(event)).join("\n") + "\n";
    const body = await gzipText(ndjson);

    await bucket.put(key, body, {
      httpMetadata: {
        contentType: "application/x-ndjson",
        contentEncoding: "gzip",
        cacheControl: "private, no-store"
      },
      customMetadata: {
        archive_type: "SERVICE_USAGE",
        schema_version: "1",
        window_timezone: "Asia/Tokyo",
        window: getJstWindow(new Date(windowEvents[0].occurred_at)).label,
        event_count: String(merged.length),
        updated_at: new Date().toISOString()
      }
    });

    written += windowEvents.length;
    results.push({ key, incoming: windowEvents.length, total: merged.length });
  }

  return { written, keys: results };
}

export async function handleServiceUsageQueue(batch, env) {
  if (!env.ARCHIVE) {
    for (const message of batch.messages) message.retry();
    throw new Error("SERVICE_USAGE_ARCHIVE_UNAVAILABLE");
  }

  const events = [];
  for (const message of batch.messages) {
    try {
      events.push(normalizeEvent(message.body));
    } catch (error) {
      console.error("service_usage_invalid_message", error?.message || error);
      message.ack();
    }
  }

  if (!events.length) return { processed: 0 };

  try {
    const result = await writeServiceUsageBatch(env.ARCHIVE, events);
    for (const message of batch.messages) {
      if (message.body && events.some(event => String(event.event_id) === String(message.body?.event_id))) {
        message.ack();
      }
    }
    console.log("service_usage_r2_batch_ok", JSON.stringify(result));
    return { processed: events.length, result };
  } catch (error) {
    console.error("service_usage_r2_batch_failed", error?.message || error);
    for (const message of batch.messages) {
      if (message.body && events.some(event => String(event.event_id) === String(message.body?.event_id))) {
        message.retry();
      }
    }
    throw error;
  }
}
