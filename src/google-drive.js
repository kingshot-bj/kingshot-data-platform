const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

function googleConfig(env) {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const redirectUri = String(env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    const error = new Error("GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED");
    error.code = "GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED";
    throw error;
  }
  return { clientId, clientSecret, redirectUri };
}

function requireRefreshToken(env) {
  const token = String(env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();
  if (!token) {
    const error = new Error("GOOGLE_DRIVE_REFRESH_TOKEN_NOT_CONFIGURED");
    error.code = "GOOGLE_DRIVE_REFRESH_TOKEN_NOT_CONFIGURED";
    throw error;
  }
  return token;
}

async function googleTokenRequest(body) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data?.error_description || data?.error || "GOOGLE_DRIVE_TOKEN_FAILED");
    error.code = "GOOGLE_DRIVE_TOKEN_FAILED";
    error.status = response.status;
    throw error;
  }
  return data;
}

export function getGoogleDriveOAuthAuthorizationUrl(env, state) {
  const { clientId, redirectUri } = googleConfig(env);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: String(state || "")
  });
  return GOOGLE_AUTH_URL + "?" + params.toString();
}

export async function exchangeGoogleDriveOAuthCode(env, code) {
  if (!code) {
    const error = new Error("GOOGLE_DRIVE_OAUTH_CODE_REQUIRED");
    error.code = "GOOGLE_DRIVE_OAUTH_CODE_REQUIRED";
    throw error;
  }
  const { clientId, clientSecret, redirectUri } = googleConfig(env);
  return googleTokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code),
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
}

async function refreshGoogleDriveAccessToken(env) {
  const { clientId, clientSecret } = googleConfig(env);
  const refreshToken = requireRefreshToken(env);
  const data = await googleTokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  return data.access_token;
}

async function driveRequest(accessToken, url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("authorization", "Bearer " + accessToken);
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || "GOOGLE_DRIVE_API_FAILED");
    error.code = "GOOGLE_DRIVE_API_FAILED";
    error.status = response.status;
    error.googleError = data?.error || null;
    throw error;
  }
  return data;
}

export async function createGoogleDriveArchiveFolder(accessToken, name = "EagleEye") {
  const metadata = {
    name: String(name || "EagleEye").slice(0, 100),
    mimeType: "application/vnd.google-apps.folder",
    appProperties: { eagleeye: "1", eagleeyeFolder: "archive" }
  };
  return driveRequest(accessToken, GOOGLE_DRIVE_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metadata)
  });
}

export async function createGoogleDriveArchiveFolderWithToken(env, name = "EagleEye") {
  const tokens = await exchangeGoogleDriveOAuthCode(env, "__NO_CODE__");
  return createGoogleDriveArchiveFolder(tokens.access_token, name);
}

export async function getGoogleDriveConnectionStatus(env) {
  const configured = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
    env.GOOGLE_OAUTH_CLIENT_SECRET &&
    env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI
  );
  const refreshConfigured = Boolean(env.GOOGLE_DRIVE_REFRESH_TOKEN);
  const folderConfigured = Boolean(env.GOOGLE_DRIVE_FOLDER_ID);
  return {
    configured,
    refreshConfigured,
    folderConfigured,
    ready: configured && refreshConfigured && folderConfigured
  };
}

async function findExistingArchive(accessToken, folderId, sourceKey) {
  const escapedKey = String(sourceKey).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = [
    "trashed = false",
    "'" + String(folderId).replace(/'/g, "\\'") + "' in parents",
    "appProperties has { key = 'eagleeyeSourceKey' and value = '" + escapedKey + "' }"
  ].join(" and ");
  const params = new URLSearchParams({
    q,
    spaces: "drive",
    pageSize: "10",
    fields: "files(id,name,mimeType,size,parents,webViewLink,appProperties,md5Checksum)"
  });
  const data = await driveRequest(accessToken, GOOGLE_DRIVE_API_URL + "?" + params.toString(), { method: "GET" });
  return Array.isArray(data.files) ? data.files[0] || null : null;
}

/**
 * Upload one R2 object to the EagleEye folder in the personal Google Drive.
 * Authentication uses a user OAuth refresh token, not a Service Account.
 *
 * This remains an explicit transport/verification primitive. It is not wired
 * to cron, retention, or automatic R2 deletion.
 */
export async function uploadR2ObjectToGoogleDrive(env, {
  archiveBucket,
  key,
  fileName = null,
  mimeType = "application/gzip",
  folderId = null
} = {}) {
  if (!archiveBucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  if (!key) throw new Error("GOOGLE_DRIVE_SOURCE_KEY_REQUIRED");

  const parentFolderId = String(folderId || env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  if (!parentFolderId) throw new Error("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED");

  const object = await archiveBucket.get(key);
  if (!object) {
    const error = new Error("R2_OBJECT_NOT_FOUND");
    error.code = "R2_OBJECT_NOT_FOUND";
    throw error;
  }

  const accessToken = await refreshGoogleDriveAccessToken(env);
  const existing = await findExistingArchive(accessToken, parentFolderId, key);
  if (existing?.id) {
    return {
      sourceKey: key,
      driveFileId: existing.id,
      name: existing.name || null,
      mimeType: existing.mimeType || mimeType,
      size: Number(existing.size || 0),
      parents: existing.parents || [],
      webViewLink: existing.webViewLink || null,
      duplicate: true,
      verified: Number(existing.size || 0) === Number(object.size || 0),
      sourceSize: Number(object.size || 0),
      driveSize: Number(existing.size || 0),
      sourceEtag: object.etag || null,
      md5Checksum: existing.md5Checksum || null
    };
  }

  const name = String(fileName || key.split("/").pop() || "eagleeye-archive.ndjson.gz");
  const metadata = JSON.stringify({
    name,
    parents: [parentFolderId],
    mimeType,
    appProperties: {
      eagleeyeSourceKey: String(key).slice(0, 124),
      eagleeyeSourceEtag: String(object.etag || "").slice(0, 124),
      eagleeyeArchive: "1"
    }
  });

  const boundary = "eagleeye_drive_" + crypto.randomUUID();
  const encoder = new TextEncoder();
  const sourceBytes = await object.arrayBuffer();
  const prefix = encoder.encode(
    "--" + boundary + "\r\n" +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    metadata + "\r\n" +
    "--" + boundary + "\r\n" +
    "Content-Type: " + mimeType + "\r\n\r\n"
  );
  const suffix = encoder.encode("\r\n--" + boundary + "--\r\n");
  const body = new Blob([prefix, sourceBytes, suffix]);

  const data = await driveRequest(
    accessToken,
    GOOGLE_DRIVE_UPLOAD_URL + "?uploadType=multipart&fields=id,name,mimeType,size,parents,webViewLink,appProperties,md5Checksum",
    {
      method: "POST",
      headers: { "content-type": "multipart/related; boundary=" + boundary },
      body
    }
  );

  const sourceSize = Number(object.size || sourceBytes.byteLength || 0);
  const driveSize = Number(data.size || 0);
  const verified = sourceSize === driveSize;
  if (!verified) {
    const error = new Error("GOOGLE_DRIVE_SIZE_VERIFICATION_FAILED");
    error.code = "GOOGLE_DRIVE_SIZE_VERIFICATION_FAILED";
    error.details = { sourceSize, driveSize, driveFileId: data.id };
    throw error;
  }

  return {
    sourceKey: key,
    driveFileId: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: driveSize,
    parents: data.parents || [],
    webViewLink: data.webViewLink || null,
    duplicate: false,
    verified: true,
    sourceSize,
    driveSize,
    sourceEtag: object.etag || null,
    md5Checksum: data.md5Checksum || null
  };
}

export async function getGoogleDriveAccessTokenForSetup(env, tokens) {
  if (!tokens?.access_token) throw new Error("GOOGLE_DRIVE_ACCESS_TOKEN_REQUIRED");
  return tokens.access_token;
}

export async function verifyGoogleDriveRefreshToken(env) {
  const accessToken = await refreshGoogleDriveAccessToken(env);
  const params = new URLSearchParams({
    q: "trashed = false and mimeType = 'application/vnd.google-apps.folder'",
    spaces: "drive",
    pageSize: "1",
    fields: "files(id,name)"
  });
  const data = await driveRequest(accessToken, GOOGLE_DRIVE_API_URL + "?" + params.toString(), { method: "GET" });
  return { ok: true, sampleFolder: data.files?.[0] || null };
}
