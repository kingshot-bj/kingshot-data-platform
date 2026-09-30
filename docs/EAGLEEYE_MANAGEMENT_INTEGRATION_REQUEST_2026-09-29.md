# EagleEye Management Integration Request

- Created: 2026-09-29
- Source project: EagleEye Management
- Target project: EagleEye main
- Target repository: `kingshot-bj/kingshot-data-platform`
- Management repository: `kingshot-bj/eagleeye-management`（新規）
- Status: Coordination document

## 1. Purpose

EagleEye Management is being developed as an independent management / control-plane system for EagleEye.

Management and EagleEye main are separate projects and repositories. They must be developed independently while maintaining strict compatibility at their integration boundaries.

This document is the formal channel for requesting changes or additions to EagleEye main that are required by Management.

## 2. Fundamental development boundary

### EagleEye main

Repository:

`kingshot-bj/kingshot-data-platform`

Owns the EagleEye core system, including:

- SERVICE_USAGE event generation
- Queue Producer
- core player / kingdom features
- MightPulse data acquisition
- Watchlist processing
- actual Google Drive integration processing
- actual Discord integration processing
- EagleEye user-facing functionality
- EagleEye Admin functionality

### EagleEye Management

Repository:

`kingshot-bj/eagleeye-management`

Owns:

- Management Dashboard
- SERVICE_USAGE usage analytics
- Queue / R2 / DLQ monitoring and management
- recovery operations
- Google Drive archive state monitoring / management
- Collection Catalog
- Management-specific permissions
- Management Audit Log
- operational controls

Management must not be implemented by modifying EagleEye main directly.

## 3. Important: repository reading is allowed and encouraged

The development boundary applies to **editing**, not to **reading**.

Management development should actively inspect the latest EagleEye main branch whenever integration behavior depends on it.

Management may and should read:

- current source code
- database schema
- migrations
- Queue configuration
- R2 implementation
- SERVICE_USAGE implementation
- API routes
- authentication / authorization boundaries
- Google Drive integration
- Discord integration
- related commits and recent changes
- existing documentation

This is required to prevent logical inconsistencies between the two systems.

Management must not assume that an old design document accurately represents the current implementation when the main branch provides newer evidence.

## 4. EagleEye main must not be directly edited by Management

Management development must NOT:

- modify EagleEye main source files directly
- modify EagleEye main migrations directly
- commit to EagleEye main
- change EagleEye main configuration directly
- change EagleEye main behavior solely for Management convenience

If a change is required in EagleEye main, Management must document the requirement and request the change through this integration-request mechanism.

## 5. Change request flow

The standard flow is:

1. Management identifies a required integration capability.
2. Management reads the current EagleEye main implementation and schema.
3. Management determines exactly what is missing or incompatible.
4. Management records the requirement in an integration request MD.
5. EagleEye main project reviews the request.
6. EagleEye main implements and tests the requested change.
7. Management reads the resulting main-branch implementation again.
8. Management continues implementation based on the verified interface.

No Management-side implementation should depend on an unverified assumption about an EagleEye main change.

## 6. Existing Google Drive / Discord responsibility split

The actual Google Drive and Discord integration processing remains in EagleEye main.

Management does NOT take ownership of the existing integration implementation.

Management may:

- inspect integration state
- display status
- detect failures
- request recovery operations through an agreed boundary
- display archive / notification state
- maintain Management-side operational records

Management must not duplicate or silently replace the existing Google Drive / Discord processing logic.

## 7. SERVICE_USAGE boundary

Current intended route:

EagleEye user action
→ SERVICE_USAGE event
→ Cloudflare Queue
→ Queue Consumer
→ R2 archive
→ Google Drive long-term archive

Important constraints:

- SERVICE_USAGE event bodies must NOT be stored in D1.
- D1 Free-tier row reads are a primary optimization constraint.
- Management must not introduce a D1-based SERVICE_USAGE event store.
- event_id + batch_id double idempotency is a formal design requirement.
- event_id must remain stable through Queue / Consumer / R2 / Drive processing.
- Management should use the actual main-branch implementation as the source of truth when integrating.

## 8. R2 / Queue / DLQ boundary

Management is expected to monitor and eventually operate:

- Queue status
- backlog
- R2 archive state
- DLQ state
- retry / recovery state
- emergency archive state

However, the exact API and resource-access boundary must be agreed with EagleEye main before Management implements write-side operations.

Management must not assume that monitoring access automatically grants permission to mutate EagleEye main resources.

## 9. Integration API boundary

Where Management requires information or operations from EagleEye main, prefer an explicit API / resource permission boundary.

Potential interface categories include:

- service usage status
- queue status
- archive status
- DLQ status
- Drive archive state
- recovery request
- operational health
- collection configuration state

The exact endpoints, authentication method, authorization rules, request/response schemas, and mutation permissions should be finalized based on the current EagleEye main implementation.

## 10. Production verification rule

Neither project may describe a capability as production-confirmed unless it has actually been verified in the production environment.

In particular, do not treat:

- successful deployment
- successful build
- source-code presence
- local test success
- configuration existence

as proof that an end-to-end production flow is working.

This applies especially to:

Queue → Consumer → R2 → Google Drive,
DLQ recovery,
Discord notifications,
and Management integration APIs.

## 11. EagleEye main existing design constraints

Management development must preserve the following EagleEye main constraints:

- Do not revive broad `ranking_snapshots` retrieval queries.
- Prefer `kingdom_ranking_current` for current ranking data.
- Prioritize D1 Free-tier row-read reduction.
- Do not add SERVICE_USAGE event bodies to D1.
- Do not arbitrarily redesign existing EagleEye features for Management.
- Existing Google Drive / Discord integration remains in EagleEye main.

## 12. Current requests to EagleEye main

At Management project start, EagleEye main should review and provide/implement, where necessary:

1. A clearly defined Management integration API boundary.
2. Read-only operational status interfaces for Queue / R2 / DLQ / Drive where needed.
3. Secure authentication / authorization for Management-originated requests.
4. Explicit mutation endpoints for approved recovery operations, where required.
5. Request / response schemas that Management can depend on.
6. Any required event / batch identifiers needed for operational tracing.
7. Any missing batch_id implementation required to satisfy the formal event_id + batch_id idempotency design.
8. Documentation of resource permissions required by Management.

These are requests for review, not permission for Management to directly modify EagleEye main.

## 13. Management-side assumptions must be verified

Before implementing an integration against EagleEye main, Management should verify:

- endpoint actually exists
- request schema actually matches
- response schema actually matches
- authentication actually works
- authorization actually permits the operation
- resource binding is correct
- production behavior has actually been tested when production confirmation is required

If any assumption is false, Management should create or update an integration request rather than silently adapting the main system.

## 14. Two-way project independence

The same boundary applies in reverse.

EagleEye main should not directly modify the Management repository merely because Management functionality is needed.

Requests affecting Management should be communicated through the Management project / repository.

The goal is two independent systems with explicit integration contracts rather than a shared codebase with hidden coupling.

## 15. Current Management implementation phases

Management development is planned in this order:

### Phase 0 — Foundation
- repository
- architecture
- authentication
- API boundary
- permissions
- Management D1 purpose

### Phase 1 — Read-only monitoring
- Queue
- backlog
- R2
- DLQ
- Drive archive state

### Phase 2 — Usage Analytics
- daily / period
- feature / operation
- user usage
- popular players / kingdoms
- watchlist usage
- export usage

### Phase 3 — Operations / Recovery
- Manual Flush
- DLQ retry
- Drive recovery
- audit

### Phase 4 — Collection Catalog

### Phase 5 — Management permissions / Audit

### Phase 6 — Production failure test

## 16. Non-negotiable rule

**Management may read EagleEye main freely and should actively do so to maintain integration correctness. Management may not directly edit EagleEye main.**

When a main-side change is required:

**Management → Integration Request MD → EagleEye main project → implementation / verification → Management re-check**

This document is the shared development boundary between the two projects.

## 18. Current-main inspection update — 2026-09-29

Management inspected the current `main` branch after this request was created.

### Confirmed from source

- `wrangler.jsonc` currently binds:
  - D1: `DB`
  - R2: `ARCHIVE`
  - R2 bucket: `eagleeye-archive`
  - Queue Producer: `SERVICE_USAGE_QUEUE`
  - Queue: `eagleeye-service-usage`
  - Queue Consumer: `eagleeye-service-usage`
  - DLQ: `eagleeye-service-usage-dlq`
- Queue settings currently include:
  - max batch size 100
  - max batch timeout 30 seconds
  - max retries 5
  - max concurrency 1
- `src/service-usage.js` currently creates `event_id` with `crypto.randomUUID()` and sends the event asynchronously to the Queue.
- `src/service-usage-archive.js` currently deduplicates archive events by `event_id` and writes canonical 12-hour R2 objects.
- `src/google-drive.js` contains `uploadR2ObjectToGoogleDrive(...)`.
- The current main Worker already exposes EagleEye Admin routes including diagnostics and R2 archive object inspection.

### Important finding: batch_id

The inspected `src/service-usage.js` and `src/service-usage-archive.js` did not show a `batch_id` implementation.

The formal Management design requires **event_id + batch_id double idempotency**.

Therefore Management treats `batch_id` as a main-side requirement that still needs review / implementation. It is NOT considered implemented merely because the architecture document specifies it.

### Important finding: Management authentication

The current main Worker has its own Discord login/session and EagleEye Admin authorization.

Management will not reuse the main application's session cookie.

A separate Management-to-main authentication and authorization boundary is required for Management integration.

### Important finding: existing Admin APIs

Existing routes such as:

- `/api/admin/diagnostics`
- `/api/admin/r2-archive-objects`
- API Pool administration routes

are EagleEye Admin interfaces.

They should not automatically be treated as Management APIs.

Management requests an explicit, minimal integration API rather than direct reuse of broad Admin functionality.

### Important finding: Google Drive

The source contains the Google Drive upload primitive, but the implementation comments state that it is not wired to cron, retention, or automatic deletion.

Therefore Management will not assume that automatic R2 → Drive lifecycle processing is active without production verification.

## 19. Concrete integration requests

Based on the current source inspection, Management requests the main project to review and, where necessary, implement:

1. A dedicated Management authentication / authorization boundary.
2. Read-only operational interfaces for Queue, backlog, DLQ, R2 archive, and Drive archive state.
3. Controlled mutation interfaces for approved recovery operations.
4. Stable request / response schemas for those interfaces.
5. Operator identity and audit context for Management-triggered mutations.
6. Idempotency handling for Management mutation requests.
7. Review / implementation of `batch_id` so the formal event_id + batch_id idempotency requirement is actually satisfied.
8. Explicit production verification of the integration path before calling it production-confirmed.

These requests do not authorize Management to modify the main repository directly.

## 20. Integration boundary principle

Management should actively read the current main branch whenever integration logic depends on it.

However:

**read freely; edit only through the main project's own development process.**

If the implementation changes after this document is reviewed, Management will re-check the main branch before relying on the previous contract.


## 21. Future Support / Inquiry Management requirement — 2026-09-30

Management has requested that the future EagleEye support system be designed as a cross-project capability.

### Intended architecture

EagleEye main:
- user-facing support form
- authenticated ticket creation
- stable ticket ID issuance
- Discord Bot integration
- private Discord support channel creation
- initial ticket message / user handoff

Discord Bot:
- private support channel per ticket
- conversation history / archive
- operator replies
- close / lock operation

EagleEye Management:
- future inquiry list
- ticket search / filtering
- ticket status
- user / ticket metadata
- operator reply
- close / reopen
- Management-side audit

### Storage constraint

Do NOT copy the full Discord conversation history into EagleEye main D1.

Discord is the initial conversation backend / archive.

If Management later needs efficient indexing/searching, prefer a lightweight Management-owned ticket metadata/index store rather than duplicating message bodies.

### Stable ticket ID

The ticket ID must remain stable across:

EagleEye main -> Discord support channel -> EagleEye Management

Avoid requiring a sequential D1 counter for initial ticket creation. A collision-resistant ticket ID is acceptable.

### Main-side integration requirements

When implementation begins, EagleEye main should provide an explicit integration boundary for Management rather than exposing broad Admin routes.

The design should account for:
- Management authentication / authorization
- ticket lookup by stable ticket ID
- ticket metadata access
- controlled operator reply
- controlled close / reopen
- operator identity / audit context
- idempotency for Management-originated mutations

### Important Discord consideration

The EagleEye OAuth flow currently authenticates the Discord user but does not by itself establish that the user is a member of the support Discord Guild.

Before creating a private ticket channel that grants access to the user, the implementation must define and verify the required Guild membership / permission path.

### Abuse / operational controls

The initial support implementation should consider:
- active-ticket limit per user
- request rate limiting / cooldown
- input length limits
- restricted operator permissions
- no Administrator permission for the bot
- closed tickets remain archived rather than being deleted

### Status

This is a future design / integration requirement only.

It is **not production-confirmed** until the complete EagleEye -> Discord Bot -> private ticket -> operator reply -> close flow is actually verified in production.
