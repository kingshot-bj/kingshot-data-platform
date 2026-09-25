const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlText(text) {
  return base64url(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem || "").replace(/\\n/g, "\n").trim();
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
}

async function createGoogleServiceAccountAssertion(env) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  if (!email || !privateKey) {
    const error = new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
    error.code = "GOOGLE_SHEETS_NOT_CONFIGURED";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64urlText(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claim;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  return unsigned + "." + base64url(new Uint8Array(signature));
}

async function getGoogleSheetsAccessToken(env) {
  const assertion = await createGoogleServiceAccountAssertion(env);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data?.error_description || data?.error || "GOOGLE_SHEETS_TOKEN_FAILED");
    error.code = "GOOGLE_SHEETS_TOKEN_FAILED";
    error.status = response.status;
    throw error;
  }
  return data.access_token;
}

async function googleSheetsRequest(env, path, options = {}) {
  const token = await getGoogleSheetsAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set("authorization", "Bearer " + token);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(GOOGLE_SHEETS_API + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || "GOOGLE_SHEETS_API_FAILED");
    error.code = "GOOGLE_SHEETS_API_FAILED";
    error.status = response.status;
    throw error;
  }
  return data;
}

async function ensureGoogleSheetTab(env, spreadsheetId, title) {
  const metadata = await googleSheetsRequest(
    env,
    "/" + encodeURIComponent(spreadsheetId) + "?fields=sheets(properties(sheetId,title))",
    { method: "GET" }
  );
  const existing = (metadata.sheets || []).find(sheet => sheet?.properties?.title === title);
  if (existing) return { sheetId: existing.properties.sheetId, created: false };

  const result = await googleSheetsRequest(
    "/" + encodeURIComponent(spreadsheetId) + ":batchUpdate",
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }]
      })
    }
  );
  return {
    sheetId: result?.replies?.[0]?.addSheet?.properties?.sheetId ?? null,
    created: true
  };
}

async function appendGoogleSheetValues(env, spreadsheetId, sheetTitle, headers, rows) {
  const tab = await ensureGoogleSheetTab(env, spreadsheetId, sheetTitle);
  const safeRows = Array.isArray(rows) ? rows : [];
  const headerRange = encodeURIComponent(sheetTitle + "!1:1");

  let headerValues = [];
  if (!tab.created) {
    const current = await googleSheetsRequest(
      "/" + encodeURIComponent(spreadsheetId) + "/values/" + headerRange,
      { method: "GET" }
    );
    headerValues = current.values || [];
  }

  const values = [];
  if (tab.created || !headerValues.length) values.push(headers);
  for (const row of safeRows) values.push(headers.map(header => row?.[header] ?? ""));

  if (!values.length) return { updatedRows: 0, sheetTitle };

  const range = encodeURIComponent(sheetTitle + "!A1");
  const result = await googleSheetsRequest(
    "/" + encodeURIComponent(spreadsheetId) + "/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    {
      method: "POST",
      body: JSON.stringify({
        majorDimension: "ROWS",
        values
      })
    }
  );

  return {
    updatedRows: Number(result?.updates?.updatedRows || 0),
    updatedCells: Number(result?.updates?.updatedCells || 0),
    sheetTitle
  };
}

export async function exportToGoogleSheet(env, { sheetTitle, headers, rows }) {
  const spreadsheetId = String(env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
  if (!spreadsheetId) {
    const error = new Error("GOOGLE_SHEETS_NOT_CONFIGURED");
    error.code = "GOOGLE_SHEETS_NOT_CONFIGURED";
    throw error;
  }

  const result = await appendGoogleSheetValues(env, spreadsheetId, sheetTitle, headers, rows);
  return {
    ...result,
    spreadsheetId,
    url: "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(spreadsheetId) + "/edit"
  };
}
