# External Integrations

**Analysis Date:** 2026-04-22

## Scope Note

Pantry is a **pi-package** — two directories of authored content (`berrygems/` extensions and `morsels/` skills) that pi loads at session start. It is not a service, daemon, or webapp. The 2026-04-22 scope amputation extracted all persistent infrastructure (daemon, persona store, Ember voice, cc-plugin) to external repos, so this package no longer owns a runtime of its own.

As a result, most "integration" surfaces in a typical codebase audit (databases, auth providers, hosting platforms, CI/CD, secrets stores, monitoring) **do not apply** to pantry. The integrations that remain are:

1. **Internal interfaces** that consumers (primarily pi itself, plus other pantry extensions) integrate against — documented below.
2. **Outbound third-party HTTP APIs** called by a small set of extensions, mostly opt-in and gated by user settings.
3. **Local subprocesses** that extensions spawn on the user's machine.

No inbound webhooks. No database. No persistent server. No deployment pipeline.

## Internal Interfaces (what consumers integrate against)

### Pi Extension API (what pantry consumes from pi)

Every extension imports from `@mariozechner/pi-coding-agent`. The integration contract is the `ExtensionAPI` object passed into each extension's default export.

- **Registration surface:** `pi.registerTool()`, `pi.registerProvider()`, `pi.registerSlashCommand()`, `pi.appendEntry()`, extension lifecycle hooks.
- **Event lifecycle** (per `AGENTS.md` §Event Lifecycle): `session_start` → `input` → `before_agent_start` → `agent_start` → `turn_start` → `context` → `before_provider_request` → `tool_call` → `tool_result` → `turn_end` → `agent_end`.
- **Session model:** JSONL tree; state lives in tool result `details` or via `pi.appendEntry()`. Reconstruction happens through `ctx.sessionManager.getBranch()`.
- **Tool-registration contract:** every `pi.registerTool()` call **must** include `promptSnippet` and `promptGuidelines` or pi omits the tool from the system prompt context blocks. This is enforced by convention, not by the type system. See `berrygems/AGENTS.md` for the template.

### Pantry Inter-Extension API (what extensions expose to each other)

Cross-extension communication uses `globalThis` keyed by `Symbol.for("pantry.<name>")` — direct imports between extensions are prohibited because jiti gives each extension its own module context.

Published symbols found in-tree:

- `Symbol.for("pantry.parchment")` — panel manager published by `berrygems/extensions/dragon-parchment.ts`. Surface: `register(id, handle)`, `close(id)`, `focusPanel(id)`, plus lifecycle helpers. Consumed by any extension that puts up a floating panel.
- `Symbol.for("pantry.imageFetch")` — unified image/GIF fetcher published by `berrygems/extensions/dragon-image-fetch.ts`. Surface: `fetch(query: string, size?: string): Promise<ImageFrames | null>`. Consumed by `dragon-scroll.ts` for inline markdown images and by panel renderers that want animated backgrounds.

### Pantry Settings Namespace (what users integrate against)

All pantry settings live under `pantry.*` in `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project). Access is centralized through `readPantrySetting()` and `readPantryKey()` in `berrygems/lib/settings.ts`; a fallback reader checks the legacy `dotsPiEnhancements` flat namespace for migration.

Known top-level keys in use (grepped from `readPantrySetting(...)` / `readPantryKey(...)` call sites):

- `pantry.musings.*` — `enabled`, `cacheTurns`, `cycleMs`, `generateContextual`, `maxGenerations`, `model`, `prompt` (`dragon-musings.ts`).
- `pantry.websearch` (object) — `enabled`, `backend` (`zai | brave | searxng`), `braveApiKey`, `searxngUrl`, `zaiModel`, `maxResults` (`dragon-websearch/index.ts`).
- `pantry.imageFetch.*` — `sources`, `preferStickers`, `rating`, `enableVibeQuery`, `model`, `queryPrompt`, `cacheMaxSize`, `tenorApiKey` (`dragon-image-fetch.ts`).
- `pantry.herald.*` — `enabled`, `title`, `method`, `minDuration` (`dragon-herald.ts`).
- `pantry.guard.*` — `dogKey`, `dragonKey`, `panelKey`, `puppyKey` (`dragon-guard/`).
- `pantry.breath.gridRegion` — terminal grid region (`dragon-breath/`).
- `pantry.digestion.copyGlobalKey` — clipboard binding (`dragon-digestion.ts`).
- `pantry.panels.keybinds.*` — focus/nudge/resize/scroll/skin keybindings (panel chrome consumed by any panel-hosting extension).
- `pantry.contributor.*` — `name`, `email`, `trailerFormat`, `transparencyFormat`, `includeModel` (AI attribution, referenced by skills).
- `pantry.tone.default` / `pantry.tone.overrides.*` — writing-tone selection, resolved against `berrygems/styles/*.md`.

### Skill Loader Contract (what morsels integrate against)

Morsels integrate with any agent harness that can load Markdown skills. Pi discovers `morsels/skills/` via the root `package.json` `pi.skills` array.

- **Directory shape:** one directory per skill under `morsels/skills/`, each containing `SKILL.md`, optional `references/`.
- **Required frontmatter:** `name` (lowercase-hyphenated, must match directory), `description` (what + when + trigger keywords, ≤1024 chars), `license: MIT`.
- **Optional frontmatter:** `compatibility` — set when the skill is pi-specific (`"Designed for Pi (pi-coding-agent)"`) or requires external tooling (see `morsels/skills/defuddle/`, `morsels/skills/git-auth/`).
- **Size budget:** `SKILL.md` stays under 500 lines; overflow moves to `references/`.

## Outbound APIs & External Services

### LLM Providers (routed through `@mariozechner/pi-ai`)

Pantry never holds LLM API keys. All model calls go through pi's configured model registry and provider credentials.

- `complete()` from `@mariozechner/pi-ai` is used by `dragon-musings.ts`, `dragon-inquiry.ts`, `dragon-loop.ts`, `dragon-guard/index.ts`, `dragon-scroll.ts`, `dragon-image-fetch.ts`, and `berrygems/lib/giphy-source.ts`.
- Default preferred model: `anthropic/claude-haiku-4-5` (hardcoded in `dragon-musings.ts`, `dragon-guard/index.ts`, `dragon-image-fetch.ts`'s `DEFAULT_VIBE_MODEL`, `lib/giphy-source.ts`'s `VIBE_MODEL`). Fallback order in `dragon-musings.ts`: `anthropic`, `google`, `openai` via `ctx.modelRegistry.find(provider, model)`.
- Anthropic provider-header override in `berrygems/extensions/dragon-lab.ts` — registers `pi.registerProvider("anthropic", { headers: { "anthropic-beta": ... } })` to gate on-demand Anthropic beta features (e.g. `anthropic.context-management`). The extension mirrors pi-ai's hardcoded beta list and warns that it overwrites pi's base value entirely.

### Web Search Backends (`berrygems/extensions/dragon-websearch/index.ts`)

Three user-selectable backends; none are required, all are opt-in via `pantry.websearch.backend`:

- **Z.ai (`backend: "zai"`)** — `POST https://open.bigmodel.cn/api/paas/v4/chat/completions` with `tools: [{ type: "web_search", web_search: { enable: true } }]`. API key read from pi's configured Z.ai provider credentials (not from a pantry-owned env var). Default model `glm-4-flash`.
- **Brave Search (`backend: "brave"`)** — `GET https://api.search.brave.com/res/v1/web/search`. API key supplied via `pantry.websearch.braveApiKey` setting.
- **SearXNG (`backend: "searxng"`)** — user-hosted instance URL from `pantry.websearch.searxngUrl`. No credential; trust model is "your own SearXNG."

### GIF / Sticker Sources (`berrygems/extensions/dragon-image-fetch.ts`, `berrygems/lib/giphy-source.ts`)

- **Giphy** — `GET https://api.giphy.com/v1/stickers/search` and `GET https://api.giphy.com/v1/gifs/search`. API key is **hardcoded in-source** (`GlVGYHkr3WSBnllca54iNt0yFbjz7L65`) at `berrygems/extensions/dragon-image-fetch.ts:52` and `berrygems/lib/giphy-source.ts:36`. This is Giphy's publicly-documented demo/community key, not a secret — but it is a surface worth flagging in any future concerns audit.
- **Tenor** — `GET https://tenor.googleapis.com/v2/search`. API key is **not** hardcoded; read from `pantry.imageFetch.tenorApiKey` (`dragon-image-fetch.ts:176`). Tenor is optional — used only when enabled in `pantry.imageFetch.sources`.
- **Direct HTTP(S) URL / local file path** — `dragon-image-fetch.ts` and `lib/giphy-source.ts` also accept raw URLs and filesystem paths (with `~/` expansion via `process.env.HOME`) through `fetchImageFromSource()`.

### Client-side AI content filter

Both Giphy call sites maintain an `AI_BLOCK_WORDS` list (`ai`, `generated`, `midjourney`, `dalle`, `stable diffusion`, `dreamimaginations`, `aiart`, `artificial`, `neural`, `deepdream`) that drops results whose title/username/slug match. This is an ethical filter, not a security one — it exists to keep AI-generated imagery out of pantry UIs by policy.

## Local Subprocesses

Pantry shells out to local binaries via `node:child_process`. These are host-machine integrations, not network ones.

- **`magick` (ImageMagick)** — `execSync` in `berrygems/extensions/dragon-image-fetch.ts` (lines 224, 238) and `berrygems/lib/giphy-source.ts` (lines 152, 166). Used to read GIF frame delays and coalesce frames into PNG sequences.
- **`notify-send` (libnotify)** — `execSync` in `berrygems/extensions/dragon-herald.ts:47` as the Linux fallback when OSC 777 terminal notifications aren't available.
- **OSC 777 escape sequence** — `dragon-herald.ts` writes `\x1b]777;notify;<title>;<body>\x07` directly to stdout. Works in Ghostty, WezTerm, iTerm2, foot, rxvt-unicode.
- **`pi` binary** — `berrygems/lib/pi-spawn.ts` resolves the pi binary (via `which pi` or `$HOME/.npm/bin/pi`) and spawns subprocess pi instances with `--tools`, `--model`, `--thinking-level`, `--append-system-prompt` arguments, collecting NDJSON output. Used by ally/subagent dispatch.
- **`tsserver` / LSP servers** — `berrygems/lib/lsp-client.ts` spawns LSP servers via `spawn(config.command, config.args)`. `berrygems/extensions/dragon-tongue.ts` currently uses this for TypeScript diagnostics (`tsserver`) with `execSync("which <cmd>")` availability checks at line 85; also shells out to fallback linters at line 237.
- **`git`** — shelled out by several extensions and by many morsels (git, git-auth, github, commit, fix). Pantry does not wrap git through a library.

## Local Network Client

- **Generic SSE client** — `berrygems/lib/sse-client.ts` uses raw `node:http` to connect to a local Server-Sent Events endpoint. Default hostname `127.0.0.1` (line 39), consumer must supply the port and path. **Not currently imported by any extension in-tree** — the library exists as reusable infrastructure (a grep for `sse-client` across `berrygems/extensions/` returns zero matches). Present for future local-daemon integrations (e.g. psi/sending-stone-style harnesses) without shipping the daemon itself.

## Data Storage

- **Databases:** None. Pantry has no ORM, no connection string, no SQL.
- **File storage:** Pi's own session JSONL files at `~/.pi/agent/sessions/` (pantry reads via `ctx.sessionManager`, never writes there directly). The memory vault at `~/.pi/agent/memory/` (global) and `.pi/memory/` (project) is pi-managed; pantry extensions only read/write through pi's memory tools.
- **Caches:**
  - `berrygems/extensions/dragon-image-fetch.ts` — in-memory LRU for fetched image frames (size governed by `pantry.imageFetch.cacheMaxSize`, default 50) plus a vibe-query cache with `VIBE_CACHE_TTL_MS = 10 * 60 * 1000`.
  - `berrygems/lib/giphy-source.ts` — on-disk scratch under `tmpdir()` for GIF download + frame extraction; cleaned up in place.

## Authentication & Identity

- **Auth provider:** None. Pantry does not authenticate anyone and has no sign-in flow.
- **AI contributor identity:** Defined in pi settings under `pantry.contributor.*` (name, email, `trailerFormat`, `transparencyFormat`, `includeModel`). Skills (git commit, github PR authoring, etc.) read these to emit `Co-authored-by` trailers and transparency notes. If the block is absent, AI attribution is skipped silently.

## Monitoring & Observability

- **Error tracking:** None. No Sentry, no Datadog, no telemetry export.
- **Logs:** `console.debug` in one spot (`berrygems/lib/giphy-source.ts:363`, vibe-generation failure). Otherwise errors propagate through pi's own tool-result / agent-event channels.
- **Metrics:** `berrygems/extensions/dragon-breath/` tracks per-session token and carbon estimates for display in the dragon-breath panel; data lives in-session (via `pi.appendEntry()` / tool-result details), not exported anywhere.

## CI/CD & Deployment

- **Hosting platform:** None — no deployable artifact.
- **CI pipeline:** None in-repo. No `.github/workflows/` committed. Pre-commit gate is manual: `tsc --project berrygems/tsconfig.json` plus `/reload` in pi.
- **Distribution:** GitHub clone + `pi install https://github.com/dotBeeps/pantry`. No npm publish, no binary release.

## Environment Configuration

**Runtime env vars read by pantry code:**

- `PANTRY_GUARD_MODE` — ally-mode detection. `berrygems/extensions/dragon-guard/index.ts:189`, `berrygems/extensions/dragon-scroll.ts:713`, `berrygems/extensions/kobold-housekeeping.ts:423`.
- `PANTRY_ALLY_TOOLS` — ally tool whitelist. `berrygems/extensions/dragon-guard/index.ts:190`.
- `PI_SUBAGENT_DEPTH` — subagent nesting counter. `berrygems/extensions/dragon-guard/index.ts:221`.
- `HOME` / `USERPROFILE` — path resolution. `berrygems/lib/settings.ts:31`, `berrygems/lib/pi-spawn.ts:60,128`, `berrygems/lib/giphy-source.ts:234`, `berrygems/extensions/dragon-digestion.ts:939`, `berrygems/extensions/dragon-image-fetch.ts:343`, `berrygems/extensions/dragon-scroll.ts` (`~/` expansion), `berrygems/extensions/dragon-websearch/index.ts:192`.

**Secrets location:** `.env` files not used. Secrets live in pi's per-provider credential store (LLM API keys) or in `~/.pi/agent/settings.json` under `pantry.*` for pantry-specific keys (e.g. `pantry.websearch.braveApiKey`, `pantry.imageFetch.tenorApiKey`). The Giphy API key is hardcoded in-source; no other secrets are embedded.

## Webhooks & Callbacks

- **Incoming webhooks:** None. Pantry has no HTTP server. `berrygems/lib/sse-client.ts` is a _client_ (outbound connection to `127.0.0.1`); it does not listen.
- **Outgoing webhooks:** None structured. Outbound traffic is all direct fetch/http calls to the services listed above.

## MCP Servers

No MCP server is shipped by this repo. The prior hoard-era MCP surfaces (psi dual SSE+MCP, etc.) left with the daemon during the 2026-04-22 scope amputation. `berrygems/extensions/hoard-allies/` is a placeholder directory (contains only a `.claude/rules/typescript.md`, no code).

Pi itself may expose MCP tools to pantry extensions through its tool registry, but that is pi's surface, not pantry's.

---

_Integration audit: 2026-04-22_
