const MAX_ROWS_PER_REQUEST = 2000;
const MAX_SKEW_SECONDS = 300;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const timestamp = Number(body.timestamp);
    const nonce = String(body.nonce || "");
    const payload = String(body.payload || "");
    const signature = String(body.signature || "");

    if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SKEW_SECONDS) {
      throw new Error("INVALID_TIMESTAMP");
    }
    if (!nonce || !payload || !signature) throw new Error("INVALID_REQUEST");

    const secret = PropertiesService.getScriptProperties().getProperty("EAGLEEYE_WEBHOOK_SECRET");
    if (!secret) throw new Error("WEBHOOK_SECRET_NOT_CONFIGURED");

    const expectedBytes = Utilities.computeHmacSha256Signature(
      timestamp + "." + nonce + "." + payload,
      secret
    );
    const expected = Utilities.base64EncodeWebSafe(expectedBytes).replace(/=+$/g, "");
    if (expected !== signature) throw new Error("INVALID_SIGNATURE");

    const cache = CacheService.getScriptCache();
    const nonceKey = "eagleeye_nonce_" + nonce;
    if (cache.get(nonceKey)) throw new Error("REPLAY_DETECTED");
    cache.put(nonceKey, "1", MAX_SKEW_SECONDS);

    const request = JSON.parse(payload);
    const spreadsheetId = String(request.spreadsheetId || "").trim();
    const sheetTitle = String(request.sheetTitle || "").trim();
    const headers = Array.isArray(request.headers) ? request.headers.map(String) : [];
    const rows = Array.isArray(request.rows) ? request.rows : [];

    if (!spreadsheetId || !sheetTitle || !headers.length) throw new Error("INVALID_DATA");
    if (rows.length > MAX_ROWS_PER_REQUEST) throw new Error("TOO_MANY_ROWS");

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    let sheet = spreadsheet.getSheetByName(sheetTitle);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetTitle);

    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const hasHeader = firstRow.some(value => String(value) !== "");
    if (!hasHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    if (!rows.length) {
      return json({ ok: true, updatedRows: 0, updatedCells: 0, sheetTitle });
    }

    const values = rows.map(row => headers.map(header => {
      const value = row && row[header] !== undefined && row[header] !== null ? row[header] : "";
      if (typeof value === "object") return JSON.stringify(value);
      return value;
    }));

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);

    return json({
      ok: true,
      updatedRows: values.length,
      updatedCells: values.length * headers.length,
      sheetTitle
    });
  } catch (error) {
    return json({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function json(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
