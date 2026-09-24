# I-3 Implementation Checklist

## Completed

- [x] Server-side MightPulse client
- [x] Bearer authentication boundary
- [x] Timeout handling
- [x] Retry handling for 429 and 5xx
- [x] Retry-After support
- [x] Upstream error classification
- [x] Error detail sanitization
- [x] Player lookup client
- [x] Alliance lookup client
- [x] Kingdom lookup client
- [x] API observation D1 migration
- [x] API observation normalization boundary
- [x] API observation persistence helper

## Pending runtime steps

- [ ] Register `MIGHTPULSE_API_KEY` as Cloudflare Runtime Secret
- [ ] Apply `0002_api_observations.sql` to production D1
- [ ] Add authenticated internal/player test route
- [ ] Execute real MightPulse request
- [ ] Persist first real observation
- [ ] Validate provider response against the real payload
- [ ] Connect the client to API Pool in I-5

## Boundary rule

Do not expose a raw MightPulse proxy to unauthenticated clients.

The first public player endpoint belongs to I-4 and must use EagleEye authorization, validation, observation, and persistence rules.
