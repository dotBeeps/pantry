---
name: api-design
description: "API design patterns: REST conventions, GraphQL schemas, OpenAPI specs, versioning, error handling, pagination, authentication, and rate limiting. Use when designing APIs, writing OpenAPI specs, implementing REST endpoints, or building GraphQL schemas."
license: MIT
---

# API Design Patterns

Covers REST conventions, error handling, pagination, versioning, auth, OpenAPI, and GraphQL. Sections are independent — jump to what you need. Design the contract first, implement second.

## REST Conventions

### Resource Naming

- **Plural nouns** for collections: `/users`, `/orders`, `/blog-posts`
- **kebab-case** path segments: `/user-preferences`, not `/userPreferences`
- **Nested resources** for ownership: `/users/:id/orders` (prefer shallow nesting — max 2 levels)
- **Actions** that don't map to CRUD use verbs as sub-resources: `/orders/:id/cancel`

```
GET    /articles          → list articles
POST   /articles          → create article
GET    /articles/:id      → get article
PUT    /articles/:id      → replace article
PATCH  /articles/:id      → partial update
DELETE /articles/:id      → delete article
GET    /articles/:id/comments   → list article's comments
POST   /articles/:id/cancel     → action (not a resource)
```

### HTTP Methods & Semantics

| Method | Semantics | Safe | Idempotent |
|--------|-----------|------|------------|
| `GET` | Read; no side effects | ✓ | ✓ |
| `POST` | Create or trigger action | ✗ | ✗ |
| `PUT` | Replace entire resource | ✗ | ✓ |
| `PATCH` | Partial update | ✗ | ✗ (usually) |
| `DELETE` | Remove resource | ✗ | ✓ |

**Idempotency keys**: for non-idempotent operations (payments, email sends) accept a client-generated `Idempotency-Key` header. Store the key and replay the cached response on duplicate requests.

### Status Codes

| Code | Meaning | Use For |
|------|---------|---------|
| `200 OK` | Success with body | GET, PUT, PATCH responses |
| `201 Created` | Resource created | POST that creates; include `Location` header |
| `204 No Content` | Success, no body | DELETE, PATCH when returning nothing |
| `400 Bad Request` | Malformed request | Syntax errors, missing required fields |
| `401 Unauthorized` | Not authenticated | Missing or invalid credentials |
| `403 Forbidden` | Authenticated, not authorized | Valid token, insufficient permissions |
| `404 Not Found` | Resource not found | Also use to hide existence of forbidden resources |
| `409 Conflict` | State conflict | Duplicate email, version mismatch, out-of-stock |
| `422 Unprocessable Entity` | Validation failed | Well-formed but semantically invalid |
| `429 Too Many Requests` | Rate limited | Include `Retry-After` header |
| `500 Internal Server Error` | Unexpected failure | Never leak stack traces |

### Query Parameters

```
# Filtering
GET /orders?status=pending&user_id=123

# Sorting (prefix - for descending)
GET /products?sort=-created_at,name

# Searching
GET /articles?q=typescript+generics

# Sparse fieldsets
GET /users?fields=id,email,name

# Combined
GET /orders?status=shipped&sort=-shipped_at&page=2&per_page=20
```

---

## Error Handling

### RFC 7807 Problem Details

Consistent error shape across all endpoints. Use `application/problem+json` content type.

```json
{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The request body contains invalid fields.",
  "instance": "/orders/checkout",
  "errors": [
    { "field": "email", "code": "invalid_format", "message": "Must be a valid email address." },
    { "field": "quantity", "code": "out_of_range", "message": "Must be between 1 and 100." }
  ]
}
```

- `type` — stable URI identifying the error class (links to docs)
- `title` — human-readable, stable per error type
- `detail` — specific to this occurrence; safe to show users
- `instance` — URI of the request that triggered the error
- `errors` — array of field-level issues for validation failures

### Rules

- **Never leak**: stack traces, SQL queries, internal paths, or dependency versions
- **Separate codes from status**: `"code": "card_declined"` lets clients branch without parsing messages
- **Consistent shape**: middleware enforces it — not individual handlers
- **Log internally**: return a sanitized `detail` to clients; log the real error server-side

---

## Pagination

### Offset Pagination

Simple, supports random access. Gets slow on large offsets — DB must scan and discard rows.

```
GET /posts?page=3&per_page=20

{
  "data": [...],
  "pagination": {
    "page": 3,
    "per_page": 20,
    "total": 843,
    "total_pages": 43
  }
}
```

Use for: admin UIs, small datasets, when users need to jump to arbitrary pages.

### Cursor Pagination

Fast at any depth. No random access. Consistent under inserts/deletes.

```
GET /posts?cursor=eyJpZCI6MTIzfQ&limit=20

{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTQzfQ",
    "prev_cursor": "eyJpZCI6MTI0fQ",
    "has_next": true,
    "has_prev": true
  }
}
```

Cursor encodes the sort key(s) — typically base64-encoded JSON `{"id": 123}` or `{"created_at": "...", "id": 123}` for tie-breaking.

**Total counts**: expensive on large tables (`COUNT(*)` requires a full scan or estimate). Return `total` only if the UI genuinely needs it; use `has_next` for infinite scroll.

**Link headers** (RFC 5988): `Link: <…?cursor=abc>; rel="next", <…?cursor=xyz>; rel="prev"`

---

## Versioning

### URL Versioning (Recommended)

```
/v1/users
/v2/users
```

Simple, visible, easy to test in a browser, cacheable. Most common approach. Put the version at the root — don't nest it mid-path.

### Header Versioning

```
Accept: application/vnd.myapi+json;version=2
```

Keeps URLs clean but harder to test, harder to route at the CDN/proxy layer.

### When to Version

**Breaking changes require a new version:**
- Removing or renaming a field
- Changing a field's type
- Changing URL structure
- Removing an endpoint
- Changing authentication scheme

**Backward-compatible changes that don't need versioning:**
- Adding optional request fields
- Adding new response fields (clients must ignore unknown fields)
- Adding new endpoints
- Adding new optional query parameters

**Deprecation**: add `Deprecation` and `Sunset` response headers, document the migration path, give clients ≥ 6 months before removal.

---

## Authentication & Authorization

### Bearer Tokens

```
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

- **JWT**: self-contained, stateless — validate signature + claims locally; include `exp`, `iat`, `sub`
- **Opaque tokens**: look up in DB/cache — revocable, simpler to invalidate

Prefer short-lived JWTs (15 min) with longer-lived refresh tokens. Store access tokens in memory; refresh tokens in `HttpOnly` cookies.

### API Keys

For **server-to-server** auth. Hash the key before storing (store `SHA-256(key)`, send the raw key once at creation). Include a key prefix for identification: `sk_live_abc123...`.

```
Authorization: Bearer sk_live_abc123...
# or
X-API-Key: sk_live_abc123...
```

### OAuth 2.0 Flows

| Flow | Use When |
|------|----------|
| **Authorization Code + PKCE** | User-facing apps (web, mobile, SPA) |
| **Client Credentials** | Server-to-server, no user context |
| **Device Code** | TVs, CLIs, headless devices |

Don't implement OAuth from scratch — use a library or auth provider.

### Rate Limiting

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1714000000
```

- **Token bucket**: allows bursts; refills at a steady rate
- **Sliding window**: prevents boundary bursts; higher memory cost
- Scope limits per: IP (unauthenticated), API key, user, tier
- Return remaining quota on every response, not just 429s

### CORS

```
# Preflight response headers
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key
Access-Control-Max-Age: 86400
```

Never use `Access-Control-Allow-Origin: *` with `Authorization` headers — browsers reject it. List origins explicitly or reflect a validated allowlist.

---

## OpenAPI / Swagger

### Spec Structure

```yaml
openapi: "3.1.0"
info:
  title: My API
  version: "1.0.0"

paths:
  /users/{id}:
    get:
      operationId: getUser
      summary: Get user by ID
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: User found
          content:
            application/json:
              schema: { $ref: "#/components/schemas/User" }
        "404":
          $ref: "#/components/responses/NotFound"

components:
  schemas:
    User:
      type: object
      required: [id, email, created_at]
      properties:
        id:         { type: string, format: uuid }
        email:      { type: string, format: email }
        created_at: { type: string, format: date-time }

    ProblemDetail:
      type: object
      required: [type, title, status]
      properties:
        type:     { type: string, format: uri }
        title:    { type: string }
        status:   { type: integer }
        detail:   { type: string }
        instance: { type: string }

    PaginatedResponse:
      type: object
      required: [data, pagination]
      properties:
        data: { type: array, items: {} }
        pagination:
          type: object
          properties:
            next_cursor: { type: string }
            has_next:    { type: boolean }

  responses:
    NotFound:
      description: Resource not found
      content:
        application/problem+json:
          schema: { $ref: "#/components/schemas/ProblemDetail" }

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []
```

### Tooling

```bash
npx @redocly/cli lint openapi.yaml          # validate spec
npx openapi-typescript openapi.yaml -o src/api/types.ts  # TS types
npx @redocly/cli preview-docs openapi.yaml  # serve docs locally
```

Write the spec first — generate types and mocks before writing any implementation.

---

## GraphQL Patterns

### Schema Design

```graphql
# Types: PascalCase. Fields: camelCase.
type Article {
  id:        ID!
  title:     String!
  body:      String!
  author:    User!
  tags:      [String!]!
  createdAt: DateTime!
}

# Queries
type Query {
  article(id: ID!): Article
  articles(first: Int, after: String, filter: ArticleFilter): ArticleConnection!
}

# Mutations use Input types
type Mutation {
  createArticle(input: CreateArticleInput!): CreateArticlePayload!
  updateArticle(id: ID!, input: UpdateArticleInput!): UpdateArticlePayload!
}

input CreateArticleInput {
  title: String!
  body:  String!
  tags:  [String!]
}

type CreateArticlePayload {
  article: Article
  errors:  [UserError!]!
}

type UserError {
  field:   [String!]
  message: String!
}
```

### Connection Pattern (Pagination)

```graphql
type ArticleConnection {
  edges:    [ArticleEdge!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type ArticleEdge {
  node:   Article!
  cursor: String!
}

type PageInfo {
  hasNextPage:     Boolean!
  hasPreviousPage: Boolean!
  startCursor:     String
  endCursor:       String
}
```

### Error Handling

Return errors inside the payload (not the top-level `errors` array) for expected failures — partial success is valid:

```graphql
# Prefer: domain errors in payload
mutation {
  createArticle(input: { title: "" }) {
    article { id }
    errors { field message }  # validation failures here
  }
}

# Top-level errors array: for unexpected/system failures only
```

### N+1 and DataLoader

Every field resolver that fetches from a DB will N+1 without batching. Use DataLoader to batch and cache within a request:

```typescript
const userLoader = new DataLoader(async (ids: string[]) => {
    const users = await db.user.findMany({ where: { id: { in: ids } } });
    return ids.map(id => users.find(u => u.id === id) ?? null);
});

// In resolver — called N times, batched into 1 query
const author = await userLoader.load(article.authorId);
```

### When REST is Better

- **Simple CRUD**: REST is less infrastructure, easier to cache with HTTP semantics
- **File uploads**: GraphQL multipart is messy; use a REST endpoint
- **Public APIs**: REST + OpenAPI has wider tooling and client support
- **CDN caching**: GET requests cache naturally; GraphQL POSTs need persisted queries

---

## General Best Practices

### Contract-First Design

Write the OpenAPI spec (or GraphQL schema) before implementing. Share it with consumers early; generate mocks from it so frontend and backend can develop in parallel.

### Webhooks

- **Sign payloads**: HMAC-SHA256 of the body with a shared secret; verify before processing
- **Retry with backoff**: retry on non-2xx for up to 24h with exponential backoff
- **Deliver at least once**: include an event ID so receivers can deduplicate
- **Expose delivery logs**: let customers see attempts and replay failed events

### Bulk Operations

```
POST /users/batch
{ "items": [{...}, {...}] }
→ { "results": [{ "status": 201, "id": "..." }, { "status": 422, "errors": [...] }] }

DELETE /messages?user_id=123&read=true   # bulk delete via query
```

Return per-item results instead of all-or-nothing — lets callers retry individual failures without re-sending the whole batch.

### HATEOAS

Embed links in responses so clients can discover actions without hardcoding URLs. Worth it for **public APIs with long-lived clients**. Overkill for internal APIs where you control both sides.

### Content Negotiation

`Accept: application/json` / `application/problem+json` (errors). `Content-Type: multipart/form-data` for file uploads.

### Documentation

- Treat docs as a deliverable: auth guide, quickstart, endpoint reference, error code glossary, changelog
- Provide runnable examples (curl, language-specific snippets); version the docs alongside the API
