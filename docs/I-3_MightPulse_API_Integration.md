# EagleEye I-3 — MightPulse API Integration

## Purpose

I-3 establishes the server-side integration boundary between EagleEye and the MightPulse API.

The browser never calls MightPulse directly. All external API access is performed by the Cloudflare Worker.

## Security boundary

```
Browser
  ↓
EagleEye Public API
  ↓
Cloudflare Worker
  ↓
MightPulse Client
  ↓
MightPulse API
```

The API key is a Cloudflare Runtime Secret:

```
MIGHTPULSE_API_KEY
```

It must never be:

- committed to GitHub
- returned in an HTTP response
- included in browser JavaScript
- placed in a URL
- written to application logs
- displayed in admin UI

## Runtime configuration

Optional non-secret configuration:

```
MIGHTPULSE_API_BASE_URL=https://api.mightpulse.com/v1
```

Secret:

```
MIGHTPULSE_API_KEY=<Cloudflare Secret only>
```

The client defaults to the production base URL when the optional base URL variable is absent.

## Client responsibilities

`src/mightpulse.js` provides the first integration boundary.

Current operations:

- generic authenticated GET request
- Player lookup
- Alliance lookup
- Kingdom lookup

The client is responsible for:

1. validating required identifiers
2. constructing API URLs
3. attaching server-side authentication
4. applying request timeout
5. classifying upstream errors
6. retrying temporary failures
7. honoring Retry-After when supplied
8. sanitizing upstream error details

The client does not decide EagleEye roles, API-pool allocation, watch priority, notification policy, or D1 business state.

Those concerns remain above the client layer.

## Error classes

| Upstream | EagleEye code | Retry |
|---|---|---|
| 400 | MIGHTPULSE_BAD_REQUEST | No |
| 401 | MIGHTPULSE_UNAUTHORIZED | No |
| 404 | MIGHTPULSE_NOT_FOUND | No |
| 429 | MIGHTPULSE_RATE_LIMITED | Yes |
| 5xx | MIGHTPULSE_UPSTREAM_ERROR | Yes |
| timeout | MIGHTPULSE_TIMEOUT | Yes |
| network failure | MIGHTPULSE_NETWORK_ERROR | Yes |

Retry delays use bounded exponential-style backoff:

```
2s → 5s → 15s
```

The implementation also honors a provider Retry-After value when present, bounded to avoid an excessive wait.

## Player API contract

The first player integration target is:

```
GET /players/{governor_id}
```

Supported query parameters currently include:

```
include=base
id_type=<optional>
```

The client keeps the include value configurable so later phases can request additional player components without changing the transport layer.

## Layering rule

I-3 deliberately stops before API Pool orchestration.

```
I-3
MightPulse Client
      ↓
I-5
API Pool Manager
      ↓
API Lease
      ↓
MightPulse Client
```

This preserves the previously approved separation between:

- external API transport
- resource allocation
- watch scheduling
- data normalization
- persistence
- notifications

## Next integration step

Before exposing a public player endpoint, EagleEye must add:

1. authenticated EagleEye route
2. request validation
3. API Pool integration
4. response validation / normalization
5. observation persistence
6. current-state persistence
7. structured API usage accounting

This prevents a raw external API proxy from becoming part of the public product.
