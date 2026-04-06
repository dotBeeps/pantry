# Research: Anthropic API OAuth Beta Headers

## Summary

OAuth authentication with the Anthropic Messages API requires the `anthropic-beta: oauth-2025-04-20` header when using Bearer tokens (`sk-ant-oat-*`). The misleading 401 error "OAuth authentication is currently not supported" actually means this beta header is **missing**, not that OAuth is unsupported. Pi/Claude Code sends both `oauth-2025-04-20` and `claude-code-20250219` together, but only `oauth-2025-04-20` is strictly required for auth to succeed.

## Findings

1. **`oauth-2025-04-20` is the mandatory header for Bearer token OAuth** — Without it, the API returns `401 {"type":"error","error":{"type":"authentication_error","message":"OAuth authentication is currently not supported."}}`. The error message is misleading; the actual fix is adding this beta header. [Source](https://github.com/openclaw/openclaw/issues/41444)

2. **Both headers appear together in practice** — Pi/Claude Code sends `anthropic-beta: oauth-2025-04-20,claude-code-20250219` (plus others). Real-world curl reproductions use both. No official docs explain what `claude-code-20250219` unlocks independently. [Source](https://github.com/bytedance/deer-flow/issues/1245)

3. **`claude-code-20250219` purpose is undocumented** — It may enable Claude Code-specific tool behaviors or have been superseded server-side. Implementations copy it defensively; no evidence it's required for OAuth itself. [Source](https://github.com/bytedance/deer-flow/issues/1245)

4. **`oauth-2025-04-20` should be injected unconditionally when an `sk-ant-oat-*` token is detected** — Some implementations wrongly overwrite the whole `anthropic-beta` header with only `oauth-2025-04-20`, dropping other betas. The correct behavior is to **append** it to existing beta values. [Source](https://github.com/BerriAI/litellm/issues/22398)

5. **Header is rejected by non-Anthropic upstreams** — Sending `oauth-2025-04-20` through LiteLLM → Vertex AI returns `400 "Unexpected value(s) oauth-2025-04-20 for the anthropic-beta header"`. Only send it for direct `api.anthropic.com` calls. [Source](https://github.com/anthropics/claude-code/issues/13770)

6. **Multiple beta values are comma-separated in a single header** — `anthropic-beta: oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,...`. No separate per-feature headers needed. No official docs on which betas can be combined, but the API accepts any valid comma-separated list.

7. **OAuth for third-party apps is being actively restricted** — Anthropic issued legal notices to third-party Claude OAuth clients (OpenCode, OpenClaw) in early April 2026, requiring Extra Usage billing or removal. The headers still work technically but the access model is changing. [Source](https://daveswift.com/claude-oauth-update/)

## Sources

- **Kept:** openclaw/openclaw#41444 (github.com) — clearest reproduction of the 401 → fix with oauth-2025-04-20
- **Kept:** bytedance/deer-flow#1245 (github.com) — shows both headers used together in practice
- **Kept:** BerriAI/litellm#22398 (github.com) — header merging bug, explains append-vs-overwrite
- **Kept:** anthropics/claude-code#13770 (github.com) — authoritative: shows header rejected on non-Anthropic upstreams
- **Kept:** daveswift.com/claude-oauth-update — context on Anthropic restricting third-party OAuth (April 2026)
- **Dropped:** docs.anthropic.com — not accessible in search results; no official OAuth beta header documentation found

## Gaps

- **No official Anthropic documentation** found explaining `oauth-2025-04-20` or `claude-code-20250219` — all findings are reverse-engineered from issue trackers.
- **What `claude-code-20250219` actually enables** is undocumented. Safe to include it alongside `oauth-2025-04-20` but its necessity is unconfirmed.
- **Combinability rules** for `anthropic-beta` values: no official matrix exists. Empirically, comma-separated values work; the API rejects individual unrecognized values.
- **Next step:** Check `https://docs.anthropic.com/en/api/beta-features` or inspect Claude Code's network traffic directly to see the exact headers it sends per request type.
