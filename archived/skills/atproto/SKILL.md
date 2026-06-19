---
name: atproto
description: "AT Protocol / Bluesky integration rules: client auth, lexicons, records. Use when working with atproto or Bluesky APIs."
license: MIT
---

# AT Protocol Rules

Rules for Bluesky / AT Protocol integrations. Claude's training data on atproto may be stale — follow these explicitly.

## Client & Auth

- Use `@atproto/api` for TypeScript client-side Bluesky interactions
- Prefer OAuth with DPoP for new apps; app passwords are legacy
- Handle DPoP nonce rotation — servers issue fresh nonces that must be used in subsequent requests
- Always discover the authorization server via the PDS DID document, not hardcoded URLs

## Data Model

- Lexicon IDs follow reverse-DNS NSID format: `com.example.record`
- DIDs are opaque identifiers — never parse them as URLs or extract structured data from them
- Call `resolveHandle` before any DID-dependent operations (handles can change, DIDs don't)
- AT-URIs: `at://did:plc:xxx/collection/rkey` — use these for record references
- Strong refs require both `uri` (AT-URI) and `cid` — don't use one without the other

## Firehose & Indexing

- Filter firehose events by collection NSID, not by DID — it's far more efficient
- Maintain a cursor for resumable firehose consumption; never poll REST endpoints for real-time data
- Backfill via `com.atproto.sync.getRepo` before subscribing to the firehose to avoid gaps

## Common Anti-Patterns

- Don't assume users are on bsky.social — always support arbitrary PDSes
- Don't use offset pagination — atproto uses cursor-based pagination throughout
- Don't hardcode AppView URLs — discover them or make them configurable
- Don't poll for new records — use the firehose
