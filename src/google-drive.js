const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64urlText(text) { return base64url(new TextEncoder().encode(text)); }
function pemToArrayBuffer(pem) {
  const normalized = String(pem || "").replace(/\\n/g, "\n").trim();
  const base64 = normalized.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0)).buffer;
}
async function createGoogleServiceAccountAssertion(env) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  if (!email || !privateKey) { const error = new Error("GOOGLE_DRIVE_NOT_CONFIGURED"); error.code = "GOOGLE_DRIVE_NOT_CONFIGURED"; throw error; }
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64urlText(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/drive.file", aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + base64url(new Uint8Array(signature));
}
async function getGoogleDriveAccessToken(env) {
  const assertion = await createGoogleServiceAccountAssertion(env);
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) { const error = new Error(data?.error_description || data?.error || "GOOGLE_DRIVE_TOKEN_FAILED"); error.code = "GOOGLE_DRIVE_TOKEN_FAILED"; error.status = response.status; throw error; }
  return data.access_token;
}

/**
 * Explicitly upload one R2 object to Google Drive.
 * Not wired to cron, retention, or automatic deletion.
 */
export async function uploadR2ObjectToGoogleDrive(env, { archiveBucket, key, fileName = null, mimeType = "application/x-ndjson", folderId = null } = {}) {
  if (!archiveBucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  if (!key) throw new Error("GOOGLE_DRIVE_SOURCE_KEY_REQUIRED");
  const parentFolderId = String(folderId || env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  if (!parentFolderId) throw new Error("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED");
  const object = await archiveBucket.get(key);
  if (!object) { const error = new Error("R2_OBJECT_NOT_FOUND"); error.code = "R2_OBJECT_NOT_FOUND"; throw error; }
  const accessToken = await getGoogleDriveAccessToken(env);
  const name = String(fileName || key.split("/").pop() || "eagleeye-archive.ndjson.gz");
  const metadata = JSON.stringify({ name, parents: [parentFolderId], mimeType });
  const boundary = "eagleeye_drive_" + crypto.randomUUID();
  const encoder = new TextEncoder();
  const prefix = encoder.encode("--" + boundary + "\r\n" + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + metadata + "\r\n" + "--" + boundary + "\r\n" + "Content-Type: " + mimeType + "\r\n\r\n");
  const suffix = encoder.encode("\r\n--" + boundary + "--\r\n");
  const body = new Blob([prefix, object.body, suffix]);
  const response = await fetch(GOOGLE_DRIVE_UPLOAD_URL + "?uploadType=multipart&fields=id,name,mimeType,size,parents,webViewLink", {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "multipart/related; boundary=" + boundary },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) { const error = new Error(data?.error?.message || data?.error || "GOOGLE_DRIVE_UPLOAD_FAILED"); error.code = "GOOGLE_DRIVE_UPLOAD_FAILED"; error.status = response.status; throw error; }
  return { sourceKey: key, driveFileId: data.id, name: data.name, mimeType: data.mimeType, size: Number(data.size || 0), parents: data.parents || [], webViewLink: data.webViewLink || null };
}