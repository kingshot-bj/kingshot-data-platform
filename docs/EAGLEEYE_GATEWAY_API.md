# EagleEye Read-Only Gateway API

## Purpose
External read-only entry point for future ChatGPT/JARVIS access to EagleEye operational state.

## V1 endpoints
- GET /api/gateway/v1/status — diagnostic state plus existing Cloudflare D1/Workers/R2 analytics.
- GET /api/gateway/v1/diagnostics?limit=100 — recent normalized diagnostic events.

## Authentication
Use `Authorization: Bearer <gateway-token>`.

The token is read from the Cloudflare Worker Secret `EAGLEEYE_GATEWAY_TOKEN`.
Never commit the value to GitHub, put it in `wrangler.jsonc`, or paste it into chat.

## Read-only boundary
The Gateway does not:
- write Gateway request logs to D1
- write to R2
- call MightPulse
- lease or consume API Pool keys
- create Gateway-specific tables
- persist ChatGPT requests/responses
- expose API keys, Worker secrets, Discord sessions, or raw MightPulse responses

The diagnostics endpoint selects normalized diagnostic columns only and does not return `metadata_json`.

## Rollout
The API may be deployed before the secret is configured. Until `EAGLEEYE_GATEWAY_TOKEN` exists on the Worker, requests return `503 GATEWAY_NOT_CONFIGURED`.

Do not use the Gateway during the D1 baseline measurement unless specifically needed. First real use should be after the post-optimization test baseline is captured.

## Future
This API is for current operational state only. A future historical Library API remains a separate read boundary for R2/permanent archive data.
