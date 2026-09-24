# EagleEye — KingShot Data Platform

KingShot のデータを集約・分析・監視するための EagleEye 基盤。

## Current architecture

- Runtime: Cloudflare Workers
- Repository: GitHub
- Production branch: `main`
- Worker entrypoint: `src/index.js`
- Cloudflare configuration: `wrangler.jsonc`

## Development policy

EagleEye is designed for browser-only development and operation.

- No local Node.js requirement
- No Docker requirement
- No local database requirement
- Secrets are never committed to Git
- External API keys are stored as Cloudflare secrets / encrypted server-side resources

## Implementation roadmap

The implementation follows the approved EagleEye A-series architecture:

1. I-0 — Development foundation
2. I-1 — Discord authentication / users
3. I-2 — D1 database foundation
4. I-3 — MightPulse API integration
5. I-4 — Player search / detail
6. I-5 — API Pool / Admin
7. I-6 — Watchlist
8. I-7 — Change Events / Timeline
9. I-8 — Discord notifications
10. I-9 — Admin completion
11. I-10 — Integration testing / release

The existing EagleEye prototype UI is retained as the starting point and will be expanded incrementally.
