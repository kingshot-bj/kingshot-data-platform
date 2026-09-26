# Google Sheets research transport (Apps Script)

## Why this exists

The Google Cloud project currently enforces `iam.disableServiceAccountKeyCreation`, so EagleEye cannot use the long-lived service-account JSON key transport that `src/google-sheets.js` originally supported.

For research-data accumulation, EagleEye can instead POST signed requests to a Google Apps Script Web App. Google documents that a web app can expose `doPost(e)` and can execute as the deploying user. citeturn4search0turn4search1

## Setup

1. Create or open the research Google Spreadsheet.
2. Open Extensions → Apps Script.
3. Copy `docs/google-sheets-apps-script.gs` into the Apps Script project.
4. In Apps Script Project Settings → Script properties, add:
   - `EAGLEEYE_WEBHOOK_SECRET` = a long random secret shared only with EagleEye.
5. Deploy → New deployment → Web app.
6. Execute as: Me / the deploying account.
7. Choose the access level required for the endpoint. If the endpoint is reachable anonymously, the HMAC signature in the request body is the application-level authentication layer; do not publish the secret.
8. Copy the `/exec` Web App URL.
9. Store these values as Cloudflare Worker secrets:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_WEBAPP_URL`
   - `GOOGLE_SHEETS_WEBAPP_SECRET`

## Request security

EagleEye sends:

- timestamp
- random nonce
- JSON payload
- HMAC-SHA256 signature over `timestamp.nonce.payload`

The Apps Script checks timestamp freshness, rejects nonce replays through `CacheService`, verifies the HMAC, and only then writes to the spreadsheet.

## Research-data role

Use this transport for datasets such as player history, ranking history, hero observations, governor gear observations, change events, and watchlist observations.

R2 remains the long-term raw archive. D1 remains the operational database. Google Sheets is the research/analysis layer.
