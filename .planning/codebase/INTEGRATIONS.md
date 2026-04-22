# External Integrations

**Analysis Date:** 2026-04-22

> Authoritative canonical reference: [`AGENTS.md`](../../AGENTS.md) for architecture context (lines 14–35 on the dragon model, 40–62 on ally coordination). This document inventories every **external-facing surface** — APIs called out, IPC endpoints exposed, webhook/callback flows — with actual ports, paths, and file citations.

## Integration Topology (at a glance)

```
      ┌──── Giphy / Tenor / Brave / z.ai / bigmodel.cn ────┐    (external HTTP)
      │                                                    │
      │           berrygems (pi extensions, TS)            │
      │                        │                           │
      │      hoard-sending-stone :dynamic (127.0.0.1)      │
      │                        │                           │
      └────────────────────────┼───────────────────────────┘
                               │
             ┌─────────────────┴──────────────────┐
             │                                    │
      pi subprocess (spawned per beat)    ally subagents
             │                                    │
             ▼                                    │
   ┌─────────────────┐                            │
   │ storybook-daemon│◄──── MCP (:9432 / :9433) ──┤
   │  (Go, Ember +   │                            │
   │   Maren)        │◄──── SSE  (:7432 / :7433) ◄┤ psi (Qt/QML)
   └─────────────────┘                            │
       │                                          │
       │ fsnotify watch ~/Development/hoard       │
       │ (the hoard nerve)                        │
       │                                          │
       ▼                                          │
   Obsidian-compatible vault (filesystem)         │
                                                  │
       (planned) nerve.Nerve ◄─── SoulGem HTTP API :8766 ──► pi extension
                                        │
                                        │ WebSocket :8765 /leylines
                                        ▼
                                  Minecraft client
                                  (Leylines + Rumble)
                                        │
                                        ▼
                                    Baritone
```

## External APIs (outbound, over the internet)

**Image / GIF search:**

- **Giphy API** — `https://api.giphy.com/v1/stickers/search` and `https://api.giphy.com/v1/gifs/search`. Used by `berrygems/extensions/dragon-image-fetch.ts:1-2` and `berrygems/lib/giphy-source.ts:1-2`. Auth: Giphy API key read from settings (`hoard.imageFetch.*`). Content rating configurable (`g | pg | pg-13 | r`, default `r`).
- **Tenor API** — `https://tenor.googleapis.com/v2/search`. Referenced in `berrygems/extensions/dragon-image-fetch.ts:3`. Auth: Tenor (Google) API key via settings.
- Both are wrapped by a unified `fetch()` exposed at `Symbol.for("hoard.imageFetch")` so panel extensions never call providers directly.

**Web search:**

- **z.ai open-bigmodel endpoint** — `https://open.bigmodel.cn/api/paas/v4/chat/completions` (`berrygems/extensions/dragon-websearch/index.ts`). Used as the default search backend (`zai`). Note: regular endpoint supports `web_search` tools; the coding endpoint `api.z.ai` **does not**, per the in-file comment.
- **Brave Search** — `https://api.search.brave.com/res/v1/web/search` (`berrygems/extensions/dragon-websearch/index.ts`). Alternative backend. Auth: `braveApiKey` from `hoard.websearch.*`.
- **SearXNG** — self-hosted, user-configured `searxngUrl` from `hoard.websearch.*`.
- Backend selected by `hoard.websearch.backend` setting: `"zai" | "brave" | "searxng"`, default `"zai"`.

**LLM inference:**

- **Anthropic** — used indirectly through pi. `dragon-image-fetch` defaults its vibe-query model to `"anthropic/claude-haiku-4-5"` (`berrygems/extensions/dragon-image-fetch.ts:20`). `dragon-lab` extension (`berrygems/extensions/dragon-lab.ts`) manages provider-level opt-ins / beta headers for Anthropic and reserves the shape for future Google/OpenAI entries.
- **Google / OpenAI** — framework present in `dragon-lab` for provider opt-ins; no code paths currently call them directly.
- **The storybook-daemon does NOT call any LLM provider directly.** `storybook-daemon/go.mod:6` declares `github.com/anthropics/anthropic-sdk-go v1.30.0` but `grep -rEn "anthropic\." storybook-daemon/internal/` returns nothing — the daemon delegates all inference to a spawned `pi --mode text` subprocess in `storybook-daemon/internal/thought/pi.go:33-36`. Pi owns the provider auth.

**Dragon-forge outbound:**

- Downloads **Qwen 2.5 7B Instruct** and related weights from HuggingFace as part of Unsloth's first-run flow (`dragon-forge/train.py:11` — "shared Unsloth studio env"). Configured implicitly through the out-of-tree venv; no HuggingFace token management in-repo.

## Internal IPC (all on `127.0.0.1`)

### storybook-daemon psi interfaces

| Persona | SSE port | MCP port | Source                                       |
| ------- | -------- | -------- | -------------------------------------------- |
| Ember   | **7432** | **9432** | `storybook-daemon/personas/ember.yaml:53,59` |
| Maren   | **7433** | **9433** | `storybook-daemon/personas/maren.yaml:49,55` |

**SSE interface** — `storybook-daemon/internal/psi/sse/sse.go:1-50`. HTTP+SSE server exposing:

- Thought stream (daemon-emitted text, typed `{type, text}` JSON).
- Attention ledger state snapshots.
- Inbound direct-message ingestion (dot → daemon), fed into the dragon-heart nudge channel (`sse.go:48-52`).

**MCP interface** — `storybook-daemon/internal/psi/mcp/mcp.go:1-5`. Streamable HTTP MCP server exposing 7 tools (enumerated in `storybook-daemon/internal/psi/mcp/mcp.go:251-290`):

1. `register_session` — announces a client session (session_id, provider, model, harness).
2. `memory_read` — read a note from the Obsidian vault.
3. `memory_write` — write a note into the vault.
4. `attention_state` — current pool level and status.
5. `stone_send` — post a message to the sending-stone room (cross-agent bus).
6. `stone_receive` — long-poll for incoming stone messages.
7. `quest_dispatch` — dispatch an ally subagent / quest.

Plus a sub-path for quests under `storybook-daemon/internal/psi/mcp/quests/` and a stone broker at `storybook-daemon/internal/psi/mcp/stone_broker.go`.

### MCP client registrations

- **Repo root `.mcp.json`** (`/.mcp.json:1-8`): `storybook-ember` → `http://127.0.0.1:9432/mcp` only.
- **`cc-plugin/.mcp.json`** (active): `storybook-ember` only (type `http`, `http://127.0.0.1:9432/mcp`).
- **`cc-plugin/.mcp.json.disabled`**: previously registered both `storybook-ember` (9432) and `storybook-maren` (9433). Maren MCP is still exposed by the daemon (`maren.yaml:55`) but not currently wired into CC. An `.orphaned_at` marker (`cc-plugin/.orphaned_at` — Unix ms `1776360954362` ≈ 2026-04-14) signals the plugin is in a deprecation-or-restructure state.

### psi desktop app ↔ daemon

Hardcoded in `psi/src/main.cpp:24,31`:

- SSE base URL: `http://localhost:7432` (Ember only in current build).
- MCP base URL: `http://localhost:9432`.
- Session registered as `psi-ember` with provider `ui`, model `direct`, harness `psi` (`psi/src/main.cpp:64-70`).
- `StonePoller` long-polls MCP after `sessionRegistered` fires (`psi/src/main.cpp:73-78`).
- Sub-project 3 (planned per `AGENTS.md:162`) adds the `SessionRail` for multi-persona tabs — will need Maren's `7433`/`9433` endpoints wired in.

### hoard-sending-stone (cross-pi-session bus)

- **Local HTTP+SSE server** started by the primary pi session: `berrygems/extensions/hoard-sending-stone/server.ts:107` binds `127.0.0.1` on a **dynamic port** (`listen(preferredPort ?? 0, "127.0.0.1")`).
- Discovery: the active port + token are written to `~/.pi/hoard-sending-stone.json` (`berrygems/extensions/hoard-sending-stone/index.ts:27`).
- Subagent pi processes read `HOARD_STONE_PORT` from their inherited env to locate the server (`berrygems/extensions/hoard-sending-stone/client.ts:14-24`).
- Endpoints: `POST /message` (fan-in from subagents) and SSE fan-out to subscribers.
- Exposed to other extensions via `Symbol.for("hoard.stone")` on globalThis.

### Dragon-cubed WebSocket bridge

**SoulGem → Leylines:** WebSocket client in Go.

- Default URL: `ws://localhost:8765/leylines` (`dragon-cubed/soulgem/cmd/serve.go:38-39`). Overridable via `--leylines` flag.
- Client implementation: `dragon-cubed/soulgem/internal/leylines/client.go` using `github.com/gorilla/websocket`.
- Frames: `HandshakeMessage`, `StateMessage`, `EventMessage`, `ErrorMessage` (see `dragon-cubed/soulgem/cmd/serve.go:59-80`).

**Leylines (server, inside Minecraft client):**

- Path `/leylines`, max frame 65,536 bytes (`dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/server/LeylineServer.kt:18-19`).
- Netty-based (`io.netty.bootstrap.ServerBootstrap` + `WebSocketServerProtocolHandler`) using Minecraft's bundled Netty.
- Port is configurable — constructor takes `port` parameter; default pulled from mod config (not hardcoded in source file).
- Extension point: `dev.dragoncubed.leylines.extension.LeylineExtension` service — Rumble registers via `META-INF/services/...` SPI (`dragon-cubed/rumble/src/main/resources/META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension`).

**SoulGem HTTP API (for the pi extension):**

- Default: `:8766` (`dragon-cubed/soulgem/cmd/serve.go:40-41` — `flagAPI string = ":8766"`).
- Implementation: `dragon-cubed/soulgem/internal/api/server.go`.
- Consumed by `dragon-cubed/soulgem/extension/soulgem.js` (pi extension bundled with the soulgem binary). Routes include `/api/agents` (list/dispatch dispatched pi agents — see `dragon-cubed/soulgem/cmd/agents.go:25,44,50`).
- `--pi` flag points at the `pi` binary for agent dispatch (`dragon-cubed/soulgem/cmd/serve.go:42-43`).

## Databases & Persistent Storage

**No relational / document databases anywhere.** Confirmed by `grep -rEn "sqlite|sql.Open|database/sql|bbolt|postgres|mongo" storybook-daemon/internal/` returning zero results. Everything is filesystem:

- **Obsidian-compatible markdown vault** — persona memory. Declared in `storybook-daemon/internal/memory/note.go:1` as "Obsidian-compatible markdown vault for persona memory." Each note is a markdown file with YAML frontmatter (`key`, `kind`, `private`, `pinned`, `created`, `updated`, `tags`). Private notes are locked behind `ErrPrivate` per ETHICS.md private-shelf contract (`storybook-daemon/internal/memory/vault.go:17-18`). Tier metadata: `consent/low | consent/medium | consent/high` (`storybook-daemon/internal/memory/tier.go:12-16`). Vault location is per-persona at runtime (not in repo).
- **Persistent pi session JSONL** — one file per persona, accumulated across heartbeats. Spawned as `pi --mode text ... --session <path>` in `storybook-daemon/internal/thought/pi.go:31`. **Sessions are JSONL trees** — AGENTS.md:376-379 warns that state must live inside tool-result `details` or `pi.appendEntry()`, never external files (breaks branching).
- **Conversation ledger** — a vault-compacting output capture (`storybook-daemon/internal/conversation/` package; wired into both SSE and MCP at `storybook-daemon/internal/psi/mcp/mcp.go:41-56`).
- **Pi session logs** — JSONL at `~/.pi/agent/sessions/` (per user memory `reference_session_logs`).
- **Claude Code session logs** — JSONL at `~/.claude/projects/<project>/` (per user memory `reference_session_logs`). Both corpora are walked by `dragon-forge/extract.py` to build the fine-tuning dataset.
- **Dragon-forge artifacts** — `dragon-forge/out/dataset.jsonl` (training corpus), `dragon-forge/seed/containment.jsonl` (22 role-coded seed exchanges per `AGENTS.md:174`), `dragon-forge/out/` adapters.

## Authentication & Identity

**No OAuth / user-auth flows in-repo.** All auth is delegated:

- **pi handles its own provider auth** (Anthropic / others) through its normal config — the daemon just spawns pi with env it inherits. Dead-end on record in user memory (`feedback_pi_anthropic_oauth`): **never wire Anthropic OAuth into pi** (TOS violation + cost).
- **MCP endpoints are unauthenticated** — bound to `127.0.0.1` only. No token header or bearer auth is set by the server (`storybook-daemon/internal/psi/mcp/mcp.go` has no auth middleware).
- **SSE endpoints likewise unauthenticated** — `127.0.0.1` binding is the only boundary.
- **Sending-stone** uses a per-session token + dynamic port + `~/.pi/hoard-sending-stone.json` discovery file (not authentication per se, but a capability handoff).
- **Giphy / Tenor / Brave** keys live in `~/.pi/agent/settings.json` under `hoard.imageFetch.*` and `hoard.websearch.*`. Read via `readHoardSetting()` only.
- **AI contributor identity** (not auth, but identity-shaped): declared under `hoard.contributor.*` in settings (`AGENTS.md:406-419`) — provides `Co-authored-by` trailer + transparency format for commits. Example: `Ember 🐉 <ember-ai@dotbeeps.dev>`.
- **git-auth skill** (`morsels/skills/git-auth/`) — manages SSH + `rbw` (Bitwarden CLI) credential lookup (`AGENTS.md:134`). User-invoked; no daemon integration.

## Monitoring & Observability

- **Logging:** Go `log/slog` everywhere (structured JSON or text). `storybook-daemon/cmd/root.go` sets up `slog.New(slog.NewTextHandler(os.Stderr, ...))` per-run. `fmt.Print*` is banned outside `cmd/` by golangci-lint forbidigo rules (`AGENTS.md:287`).
- **Notifications:** `dragon-herald` extension emits OSC 777 sequences to the terminal emulator + falls back to `notify-send` (libnotify) for desktop notifications (`AGENTS.md:88`).
- **Carbon/energy tracking:** `dragon-breath` extension maintains per-request kWh and gCO₂ estimates against a built-in `ENERGY_WH_PER_1K_OUTPUT` table (`berrygems/extensions/dragon-breath.ts:28-30`). Exposes `BreathAPI` on globalThis for external usage reporting.
- **No error-tracking SaaS** (no Sentry, Honeycomb, Datadog integration).
- **No metrics / tracing** export.

## Webhooks & Callbacks

**Incoming (HTTP POST inbound):**

- `hoard-sending-stone` `POST /message` — subagent pi processes send stone messages back to the primary session (`berrygems/extensions/hoard-sending-stone/server.ts:21-30`).
- `storybook-daemon` SSE interface — dot-messages ingested via HTTP POST and pushed into the daemon as sensory events (`storybook-daemon/internal/psi/sse/sse.go:48-52`).
- `soulgem` HTTP API on `:8766` — pi extension POSTs commands and GETs state (`dragon-cubed/soulgem/internal/api/server.go`).

**Outgoing webhooks:** none configured. The daemon does not call external webhooks.

**In-process event streams:**

- **SSE thought stream** on `/thoughts` (or similar — pattern in `psi/src/sseconnection.cpp` dereferences `m_baseUrl` to build the stream URL).
- **MCP streamable HTTP** — long-poll for `stone_receive` implemented in `storybook-daemon/internal/psi/mcp/stone_broker.go`.
- **fsnotify** events from the hoard nerve (`storybook-daemon/internal/nerve/hoard/watcher.go:1-30`) feed sensory events onto the aggregator, nudging the heart.

## CI/CD & Deployment

- **No CI configuration in-tree.** No `.github/workflows/` present (confirmed by repo-root listing). Lifecycle emoji table (`AGENTS.md:70`) mentions "Auto-update via GitHub Actions is planned" for researched-state features — the `auto-research` feature lives in `Hoard Infrastructure` as 💭 idea (`AGENTS.md:182`).
- **No Dockerfiles** for the daemon or psi; both are run as native local binaries.
- **Pi plugin distribution** — `pi install https://github.com/dotBeeps/hoard` publishes the berrygems + morsels entries declared in root `package.json:7-10` (`"pi": { "extensions": [...], "skills": [...] }`).
- **Minecraft mod distribution** — standard NeoForge mod jar output from `./gradlew build`; Baritone jar is manually dropped into `dragon-cubed/rumble/libs/` (`dragon-cubed/rumble/build.gradle.kts:6-9`).

## Required Environment Variables

**Daemon / pi side (consumed at runtime, not declared in repo):**

- `HOARD_STONE_PORT` — set by the primary session's sending-stone server and inherited by subagent pi processes for stone discovery (`berrygems/extensions/hoard-sending-stone/client.ts:14-16`).
- `HIP_VISIBLE_DEVICES=0` — forced by `dragon-forge/run.fish:17` for ROCm GPU selection.
- Provider API keys (Anthropic, etc.) — consumed by pi, not by the daemon. The daemon inherits the environment it was started in.

**Settings-file keys (`~/.pi/agent/settings.json`, namespace `hoard.*`):**

- `hoard.imageFetch.*` — Giphy/Tenor keys, sources, rating, vibe model, query prompt, cache.
- `hoard.websearch.*` — backend choice, `braveApiKey`, `searxngUrl`, `zaiModel`, `maxResults`.
- `hoard.contributor.*` — AI attribution identity.
- `hoard.breath.*`, `hoard.curfew.*`, `hoard.lab.*`, `hoard.digestion.*`, `hoard.guard.*`, `hoard.allies.*`, `hoard.herald.*`, `hoard.musings.*`, `hoard.panels.*`, `hoard.todos.*`, `hoard.tone.*` — per-extension configs (`AGENTS.md:403`).

**Never checked in:** no `.env` files in repo (confirmed — only `.envrc`-style files are absent). All secrets live in `~/.pi/agent/settings.json`.

## External Ally / Subagent Dispatch (inter-harness)

- **Pi subagents** spawned via `berrygems/lib/pi-spawn.ts:13` (`spawn` + `execSync` from `node:child_process`). Uses `pi --mode json` for NDJSON output and injects a system prompt through a temp file. Consumed by `berrygems/extensions/hoard-allies/spawn.ts`.
- **Claude Code subagents** defined in `cc-plugin/agents/ally-*.md` — 5 personalities (scout/reviewer/coder/researcher/planner) with distinct tool whitelists (see `cc-plugin/AGENTS.md:17-22`). Dispatch via CC's Agent tool in parallel "Rally" mode (`CLAUDE.md` root).
- **Quest dispatch** routes through `mcp__storybook-ember__quest_dispatch` (MCP tool declared in `storybook-daemon/internal/psi/mcp/mcp.go:286`). Implementation: `storybook-daemon/internal/quest/` (`cascade.go`, `orchestrate.go`, `taxonomy.go`, `command.go`).
- **Memory dead-end on record** (`project_soul_quest_gap` in user memory): quest_dispatch currently bypasses the rest/gate enforcement in dragon-soul — known gap, not yet fixed.

---

_Integration audit: 2026-04-22_
