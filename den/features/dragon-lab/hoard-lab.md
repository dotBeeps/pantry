# hoard-lab — Provider Beta Feature Manager

**Date:** 2026-04-07
**Status:** Draft
**Author:** Ember 🐉 + dot

---

## Overview

hoard-lab is a **provider beta feature manager** for pi extensions. It provides a safe, auth-type-aware way to opt into experimental API features — solving the problem that raw `pi.registerProvider()` cannot.

### The Problem

Pi's Anthropic provider builds the `anthropic-beta` header in `createClient()` with three auth-aware paths:

```
OAuth:   "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14"
API key: "fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14"
Copilot: "interleaved-thinking-2025-05-14" (conditional)
```

Extensions that call `pi.registerProvider("anthropic", { headers: { "anthropic-beta": "..." } })` replace the **entire** header via `Object.assign` in `mergeHeaders()`. This strips auth-specific betas — OAuth users get 401 errors because `oauth-2025-04-20` is gone.

There is no way to **append** to comma-delimited header values from extension-land.

Additionally, `models.json` rejects headers-only provider configs (requires `baseUrl`, `compat`, `modelOverrides`, or `models`).

### What hoard-lab Does

1. **Reads beta feature opt-ins** from `hoard.lab.providers.*` settings
2. **Detects auth type** per-request to include the correct base betas
3. **Assembles the complete header** — pi built-ins + auth betas + user/extension betas
4. **Registers the merged header** via `pi.registerProvider()` at the right time
5. **Exposes a globalThis API** so other extensions can request beta features
6. **Shows a panel** where users can browse and toggle available features

---

## Settings Schema

Settings live under `hoard.lab.*` in `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project).

```json
{
  "hoard": {
    "lab": {
      "providers": {
        "anthropic": {
          "betaFeatures": ["context-management-2025-06-27"],
          "customHeaders": {}
        }
      },
      "panel": {
        "showOnStartup": false
      }
    }
  }
}
```

### Setting Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `hoard.lab.providers.<name>.betaFeatures` | `string[]` | `[]` | Beta feature strings to append to the provider's beta header. Anthropic: comma-joined into `anthropic-beta`. |
| `hoard.lab.providers.<name>.customHeaders` | `Record<string, string>` | `{}` | Additional HTTP headers to merge into requests. Use with caution — these replace, not append. |
| `hoard.lab.panel.showOnStartup` | `boolean` | `false` | Auto-open the Feature Lab panel on session start. |

### Per-Provider Notes

**Anthropic:** Beta features are comma-separated in the `anthropic-beta` header. hoard-lab handles the assembly. Users only list the features they want to add beyond pi's built-in set.

**Google / OpenAI:** No beta header convention currently. `customHeaders` can be used for arbitrary headers. `betaFeatures` is reserved for future use.

---

## Architecture

### The Header Merge Pipeline

Pi's current header assembly in `anthropic.ts createClient()`:

```
mergeHeaders(
  builtInHeaders,    // { "anthropic-beta": "fine-grained-...,interleaved-..." }
  model.headers,     // from model definition (usually undefined)
  optionsHeaders,    // from registerProvider / getApiKeyAndHeaders
)
```

`mergeHeaders` = `Object.assign` — last value wins per key. So `optionsHeaders["anthropic-beta"]` replaces the built-in value entirely.

### Auth-Type Detection

Anthropic uses three auth paths in `createClient()`:

| Auth Type | Token Pattern | Required Betas | Identity Headers |
|-----------|--------------|----------------|------------------|
| OAuth | `sk-ant-oat*` | `claude-code-20250219`, `oauth-2025-04-20` | `user-agent`, `x-app` |
| API Key | `sk-ant-api*` or other | (none beyond built-in) | (none) |
| GitHub Copilot | Bearer (via model.provider) | (interleaved only, conditional) | Copilot-specific |

Detection: `apiKey.includes("sk-ant-oat")` (see `isOAuthToken()` in anthropic.ts line 518).

**Problem:** Auth type is resolved per-request inside `createClient()`, but `registerProvider` sets headers at registration time (before any request). The extension can't know the auth type at init.

### Conditional Beta Considerations

Pi conditionally includes `interleaved-thinking-2025-05-14` — it's skipped for models with adaptive thinking (`supportsAdaptiveThinking()` checks for Opus 4.6 / Sonnet 4.6). Our header override would re-include it for those models. This is likely harmless (the API ignores irrelevant betas) but worth noting.

---

## Solution Evaluation

### Option A: `before_provider_request` Payload Injection

**How:** Modify the request payload in the `before_provider_request` event handler.

**Verdict: ❌ IMPOSSIBLE.** The `onPayload` callback only modifies the request body (JSON payload). HTTP headers are set on the `Anthropic` client at construction time via `defaultHeaders`. There is no per-request header override path through `onPayload`.

### Option B: Comprehensive `registerProvider` — Include ALL Betas for ALL Auth Types

**How:** Always include OAuth betas (`claude-code-20250219`, `oauth-2025-04-20`) alongside standard betas, regardless of actual auth type.

```typescript
pi.registerProvider("anthropic", {
  headers: {
    "anthropic-beta": [
      "claude-code-20250219",          // OAuth — harmless on API key?
      "oauth-2025-04-20",              // OAuth — harmless on API key?
      "fine-grained-tool-streaming-2025-05-14",
      "interleaved-thinking-2025-05-14",
      "context-management-2025-06-27", // user opt-in
    ].join(","),
  },
});
```

**Pros:**
- Simple. One `registerProvider` call at init.
- No auth detection needed.
- If Anthropic ignores unknown/irrelevant betas, this just works.

**Cons:**
- **Unknown:** Does Anthropic reject `oauth-2025-04-20` on API key requests? Research from the kobold suggests non-Anthropic upstreams (Vertex AI) reject unknown betas with 400, but direct Anthropic API may silently ignore them. **Needs empirical testing.**
- **Unknown:** Does `claude-code-20250219` cause side effects on API key auth? It may enable Claude Code-specific tool name remapping (see `toClaudeCodeName()` in anthropic.ts).
- Fragile to pi updates adding new built-in betas.

**Verdict: ⚠️ PROMISING — needs one test.** If Anthropic's API silently ignores irrelevant betas, this is the simplest correct solution.

### Option C: Pi-Mono PR — Append-Aware Header Merging

**How:** Propose a change to pi-mono:

Option C1: Add an `appendHeaders` field to `ProviderConfig` that comma-appends values instead of replacing:
```typescript
interface ProviderConfig {
  headers?: Record<string, string>;      // existing — replaces
  appendHeaders?: Record<string, string>; // new — comma-appends
}
```

Option C2: Change `mergeHeaders` to be comma-aware for known headers:
```typescript
function mergeHeaders(...sources) {
  // For "anthropic-beta", comma-join instead of replace
}
```

Option C3: Add `headers` to the `before_provider_request` return type:
```typescript
// Extension handler return
return { ...payload, __headers: { "anthropic-beta": "...,context-management-..." } };
```

**Pros:**
- Cleanest long-term solution.
- Auth-safe — pi handles the base betas, extensions only append.
- No fragility to pi updates.

**Cons:**
- Requires upstream PR acceptance. Unknown timeline.
- Multiple design options; needs discussion with pi maintainer.

**Verdict: ✅ BEST LONG-TERM — but blocks on upstream.**

### Option D: Session-Start Auth Detection

**How:** In `session_start`, call `ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` to get the resolved API key. Check the token pattern. Build and register the correct header.

```typescript
pi.on("session_start", async (_event, ctx) => {
  if (ctx.model?.provider !== "anthropic") return;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) return;
  const isOAuth = auth.apiKey.includes("sk-ant-oat");
  const betas = buildBetaHeader(isOAuth, userBetaFeatures);
  pi.registerProvider("anthropic", { headers: { "anthropic-beta": betas } });
});
```

**Pros:**
- Auth-aware — only includes OAuth betas when actually using OAuth.
- No risk of sending OAuth betas on API key auth.

**Cons:**
- **Timing:** `registerProvider` at init is queued and applied when runner binds. But calling it in `session_start` happens AFTER bind — it calls `ModelRegistry.registerProvider()` directly. The client is created per-request, so late registration works.
- **Model switching:** If the user switches models mid-session (e.g., from Anthropic OAuth to Google), the Anthropic header stays registered. Harmless for non-Anthropic providers (they ignore `anthropic-beta`). But if the user switches from API key to OAuth mid-session... `model_select` event would need to re-detect.
- More complex than Option B.
- Still fragile to pi adding new built-in betas.

**Verdict: ⚠️ CORRECT but COMPLEX.** Only needed if Option B fails (i.e., Anthropic rejects irrelevant betas).

### Option E: Environment Sniffing

**How:** Check `process.env.ANTHROPIC_API_KEY` pattern at init.

**Verdict: ❌ UNRELIABLE.** Auth can come from `~/.pi/agent/auth.json`, OAuth flow, or environment. Environment is only one of several sources. Also doesn't handle runtime auth changes.

### Recommendation

**Phase 1: Try Option B** (comprehensive header). Run a single test:

```bash
# Test: does Anthropic accept OAuth betas on API key auth?
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk-ant-api-..." \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
```

- **If 200:** Ship Option B. Simple, works, no auth detection needed.
- **If 400/error:** Fall back to Option D (session-start detection).

**Phase 2: File pi-mono PR** (Option C) for the clean long-term solution. Once merged, hoard-lab simplifies to just reading settings and calling `appendHeaders`.

---

## Header Assembly

### Known Anthropic Beta Features

| Feature | Added By | Required For |
|---------|----------|--------------|
| `fine-grained-tool-streaming-2025-05-14` | Pi built-in | Tool streaming |
| `interleaved-thinking-2025-05-14` | Pi built-in (conditional) | Extended thinking (non-adaptive models) |
| `claude-code-20250219` | Pi OAuth path | Claude Code identity |
| `oauth-2025-04-20` | Pi OAuth path | OAuth authentication |
| `context-management-2025-06-27` | User opt-in | Context management edits |

### Assembly Logic (Option B)

```typescript
function buildAnthropicBetaHeader(userFeatures: string[]): string {
  const baseBetas = [
    // Always include — pi's built-in set
    "fine-grained-tool-streaming-2025-05-14",
    "interleaved-thinking-2025-05-14",
    // Always include — OAuth compatibility (harmless on API key if Anthropic accepts)
    "claude-code-20250219",
    "oauth-2025-04-20",
  ];

  // Deduplicate: user features that aren't already in base
  const baseSet = new Set(baseBetas);
  const extras = userFeatures.filter(f => !baseSet.has(f));

  return [...baseBetas, ...extras].join(",");
}
```

### Assembly Logic (Option D — Fallback)

```typescript
function buildAnthropicBetaHeader(isOAuth: boolean, userFeatures: string[]): string {
  const betas = [
    "fine-grained-tool-streaming-2025-05-14",
    "interleaved-thinking-2025-05-14",
  ];

  if (isOAuth) {
    betas.push("claude-code-20250219", "oauth-2025-04-20");
  }

  const baseSet = new Set(betas);
  const extras = userFeatures.filter(f => !baseSet.has(f));
  return [...betas, ...extras].join(",");
}
```

---

## Panel UI — Feature Lab

Registered via dragon-parchment as panel ID `"lab"`.

### Layout

```
🧪 Feature Lab

  Anthropic (OAuth)
  ─────────────────────
    ✓ fine-grained-streaming   Built-in
    ✓ interleaved-thinking     Built-in
    ✓ oauth-2025-04-20         Auth
    ✓ context-management       Active
    ○ prompt-caching-2025      Available

  Google
  ─────────────────────
    (no beta features configured)

  ─────────────────────
  Status: 5 features active
```

### Panel Items

When focused, users can navigate features with ↑↓ and toggle with Space/Enter:

| Item | Interaction | Notes |
|------|------------|-------|
| Built-in features | Read-only | Shows ✓, cannot be disabled |
| Auth features | Read-only | Shows ✓ when detected, ○ otherwise |
| User features | Toggle | Space/Enter enables/disables, writes to settings |
| Available features | Toggle | Known features not yet enabled |

### Feature Status Indicators

| Icon | Meaning |
|------|---------|
| `✓` (green) | Active — included in the header |
| `○` (dim) | Available — can be enabled |
| `⚠` (yellow) | Enabled but may not work (e.g., header injection blocked) |
| `✗` (red) | Error — feature caused an API error |

### Auth Detection Display

The panel header shows the detected auth type for each provider:

- `Anthropic (OAuth)` — detected `sk-ant-oat-*` token
- `Anthropic (API Key)` — detected `sk-ant-api-*` token
- `Anthropic (Unknown)` — couldn't detect (no request yet)

Auth type is updated on `session_start` and `model_select` events.

---

## globalThis API

Exposed at `Symbol.for("hoard.lab")` for cross-extension communication.

```typescript
interface HoardLabAPI {
  /**
   * Request a beta feature be included for a provider.
   * Takes effect on the next registerProvider call (usually immediate).
   * Returns true if the feature was added, false if already present.
   */
  requestBeta(provider: string, feature: string): boolean;

  /**
   * Remove a previously requested beta feature.
   * Returns true if it was removed, false if it wasn't present.
   */
  removeBeta(provider: string, feature: string): boolean;

  /**
   * Check if a beta feature is currently active (included in the header).
   */
  isBetaActive(provider: string, feature: string): boolean;

  /**
   * Get all active beta features for a provider.
   */
  getActiveBetas(provider: string): string[];

  /**
   * Get the detected auth type for a provider.
   * Returns "oauth" | "apikey" | "copilot" | "unknown"
   */
  getAuthType(provider: string): string;

  /**
   * Register a callback for when beta features change.
   */
  onBetaChange(callback: (provider: string, features: string[]) => void): () => void;
}
```

### Usage by dragon-digestion

```typescript
// In dragon-digestion.ts init:
const lab = (globalThis as any)[Symbol.for("hoard.lab")];
if (lab) {
  // Request the beta feature — hoard-lab handles the header
  lab.requestBeta("anthropic", "context-management-2025-06-27");
}

// In before_provider_request handler:
const lab = (globalThis as any)[Symbol.for("hoard.lab")];
const canUseContextMgmt = lab?.isBetaActive("anthropic", "context-management-2025-06-27") ?? false;
if (!canUseContextMgmt) return; // Beta not available — skip injection
```

### Extension Load Order

hoard-lab must load BEFORE dragon-digestion so the globalThis API is available. Pi loads extensions in alphabetical order by filename. Current berrygems extensions:

```
dragon-breath.ts
dragon-digestion.ts
dragon-guard/
dragon-image-fetch.ts
dragon-inquiry.ts
dragon-loop.ts
dragon-musings.ts
dragon-parchment.ts
dragon-scroll.ts
dragon-tongue.ts
hoard-lab.ts          ← would load AFTER all dragon-* extensions!
kobold-housekeeping.ts
```

**Problem:** `hoard-lab.ts` sorts after `dragon-digestion.ts`. Options:
1. Rename to `aaa-hoard-lab.ts` (ugly)
2. Rename to `dragon-lab.ts` (loads before `dragon-loop.ts` but after `dragon-inquiry.ts` — fine)
3. Use lazy initialization — dragon-digestion checks for the API on first use, not at init
4. Use `pi.events` — hoard-lab emits a "ready" event, consumers listen for it

**Recommendation:** Option 3 (lazy). dragon-digestion's `before_provider_request` handler already runs long after init. Check `lab?.isBetaActive()` at call time, not registration time.

---

## Implementation Phases

### Phase 1: Core — Settings + Header Assembly + registerProvider

**File:** `berrygems/extensions/hoard-lab.ts`
**Effort:** ~3 hours
**Dependencies:** None

1. Read `hoard.lab.providers.*` settings on init
2. Build the complete `anthropic-beta` header (Option B or D based on test results)
3. Call `pi.registerProvider("anthropic", { headers })` with the merged header
4. Re-register on `session_start` and `model_select` (to pick up auth type changes)
5. Expose globalThis API at `Symbol.for("hoard.lab")`
6. **Empirical test:** Verify Option B (comprehensive betas) works for both OAuth and API key auth

**Testing:**
- OAuth user: verify no 401 errors
- API key user: verify no 400 errors from extra OAuth betas
- Enable `context-management-2025-06-27` in settings, verify it appears in API requests

### Phase 2: Panel UI

**File:** `berrygems/extensions/hoard-lab.ts`
**Effort:** ~3 hours
**Dependencies:** Phase 1, dragon-parchment

1. Register `"lab"` panel via dragon-parchment
2. Render feature list with status indicators
3. Toggle user features with ←→/Space/Enter
4. Display detected auth type
5. `/lab` command to toggle panel

### Phase 3: Cross-Extension Integration

**File:** `berrygems/extensions/dragon-digestion.ts` (update)
**Effort:** ~1 hour
**Dependencies:** Phase 1

1. Remove hardcoded `ANTHROPIC_BETA_FEATURES` constant from dragon-digestion
2. Use `lab.requestBeta()` at init to register the needed feature
3. Gate `before_provider_request` handler on `lab.isBetaActive()`
4. Add `anthropicContextEdits` setting support (auto-requests beta when enabled)

### Phase 4: Dynamic Feature Discovery (Stretch)

**Effort:** ~2 hours
**Dependencies:** Phase 2

1. Maintain a registry of known Anthropic beta features with descriptions
2. Show "Available" features in the panel that users can opt into
3. Detect new betas from API error responses (400 with "unknown beta" → mark as removed)
4. Optionally scrape Anthropic's beta docs page for current list

---

## File Structure

```
berrygems/extensions/hoard-lab.ts     Main extension
berrygems/lib/beta-registry.ts        Known beta features + descriptions (optional, Phase 4)
```

---

## Open Questions

1. **Does Anthropic reject unknown/irrelevant beta features on API key auth?** Critical for Option B. A single curl test resolves this. If yes → fall back to Option D. If no → Option B is the winner.

2. **Does `claude-code-20250219` cause side effects on API key auth?** The `isOAuthToken` flag in `buildParams()` and `convertMessages()` controls tool name remapping (`toClaudeCodeName()`). But this flag is set from `createClient()`'s return value, not from the header. So the header alone shouldn't trigger remapping. Needs verification.

3. **Can `before_provider_request` be extended to support headers?** This would be the cleanest pi-mono PR — return `{ ...payload, __headers: { ... } }` and have the provider layer merge them into the request. Filed as a potential PR.

4. **Should features persist per-project or globally?** Currently both — global settings in `~/.pi/agent/settings.json`, project overrides in `.pi/settings.json`. This follows the existing hoard settings convention from `berrygems/lib/settings.ts`.

5. **Should hoard-lab manage non-beta headers?** The `customHeaders` field allows arbitrary headers, but it has the same replace-not-append problem for any multi-value header. Scope it to beta features initially; expand later if needed.

6. **How should hoard-lab interact with `models.json` provider headers?** If a user has both `models.json` headers and hoard-lab settings, which wins? Currently `models.json` headers feed into `optionsHeaders` alongside `registerProvider` headers. Need to verify the precedence.

---

## References

- `den/plans/dragon-digestion-v2.md` — Anthropic Context Management section, Beta Header Setup
- `pi-mono/packages/ai/src/providers/anthropic.ts` — `createClient()`, `mergeHeaders()`, `isOAuthToken()`
- `pi-mono/packages/coding-agent/src/core/model-registry.ts` — `storeProviderRequestConfig()`, `getApiKeyAndHeaders()`
- `pi-mono/packages/coding-agent/src/core/extensions/types.ts` — `registerProvider()`, `ProviderConfig`
- Kobold research on OAuth beta headers (2026-04-07): `oauth-2025-04-20` is required, `claude-code-20250219` is defensive
