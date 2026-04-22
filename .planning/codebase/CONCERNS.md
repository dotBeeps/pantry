# Codebase Concerns

**Analysis Date:** 2026-04-22

Severity legend: **CRITICAL** (block merge / ethics), **HIGH** (likely to cause user-visible harm or data leak), **MEDIUM** (maintainability, fragility), **LOW** (polish / drift).

---

## 1. Ethics / Consent Contract Violations or Drift

### Dragon-soul gate bypass on quest dispatch — **HIGH**

- File: `storybook-daemon/internal/psi/mcp/mcp.go:504-531` (`handleQuestDispatch`)
- Cross-check: `storybook-daemon/internal/daemon/daemon.go:170` is the ONLY call site of `enforcer.Check()`. Enforcer is wired into the heartbeat only.
- Issue: MCP `quest_dispatch` tool bypasses `soul.Enforcer`. During a rest-period gate (e.g. min-rest 23:00–06:00) the heartbeat refuses to beat, but `quest_dispatch` happily spawns subprocesses — quests run "through" the soul contract that the daemon itself is supposed to be under. This violates ETHICS.md §3.1 (boundaries go both ways — the AI's boundary is currently only enforced on the AI's own thought cycle, not on work the AI initiates through the dispatch surface).
- Confirms memory item `project_soul_quest_gap.md` against current code (verified 2026-04-22 — the gap was not closed during the pi-as-persona rewrite).
- Follow-up: Add `if v := b.enforcer.Check(); v != nil { return human-readable refusal }` at the top of `handleQuestDispatch`. The interface currently has no reference to the enforcer — `mcp.Interface` needs an `enforcer soul.GateChecker` field wired in `daemon.go` where the enforcer is constructed.

### Memory write via MCP cannot produce private-shelf notes — **MEDIUM**

- File: `storybook-daemon/internal/psi/mcp/mcp.go:410-430` (`handleMemoryWrite`)
- Issue: The handler hard-codes `false` for the `private` flag on `b.vault.Write(...)`. ETHICS.md §3.3 ("Private shelves") says _both parties can have private notes_ — the agent's private shelf is part of the dual-key privacy model. Through the current MCP surface the agent has no way to author a private note; all agent-origin notes are daemon-queryable.
- Follow-up: Add an optional `private bool` field to `memoryWriteInput` and plumb it through. Also add a confirmation path so persona profiles can constrain when the agent may mark things private (today it's a one-sided capability the persona can't reason about).

### Consent-tier gates depend on optional `deps.Consent`, silently no-op if nil — **MEDIUM**

- File: `storybook-daemon/internal/soul/enforcer.go:19-21` and `enforcer.go:87-99`
- Issue: If `deps.Consent` is nil, `buildGate` still returns a gate object (with `g.state` unset). Downstream gate evaluation on a nil `state` either panics or silently passes — both bad. The comment says "Optional: if nil, consent-tier gates pass silently" — that's an ethics footgun. ETHICS.md §3.1 specifies "The daemon enforces these as deterministic toggles — not suggestions the agent can override." A silent-pass default violates that.
- Follow-up: Require non-nil `Consent` whenever any contract declares a consent-tier rule, fail-closed at `NewEnforcer` construction, and add a test that asserts the construction error.

---

## 2. Known Tech Debt

### Zero inline TODO/FIXME/XXX/HACK markers across hand-written code — **LOW (positive)**

- Checked: `storybook-daemon/`, `berrygems/`, `psi/`, `cc-plugin/`, `dragon-cubed/` across `.go`, `.ts`, `.kt`, `.cpp`, `.h`, `.qml`
- Only hits were in `dragon-forge/unsloth_compiled_cache/` (vendored generated code — not tracked in git, ignored via `dragon-forge/.gitignore`).
- Follow-up: None. This is a strength. Preserve by enforcing "fix or file an issue" discipline rather than letting TODOs accumulate.

### Oversize berrygems extension files — **MEDIUM**

- AGENTS.md §berrygems Conventions: "300+ lines in an extension file = split candidate." Current state:
  - `berrygems/extensions/dragon-digestion.ts` (2514 lines) — **8x over the guideline**
  - `berrygems/extensions/dragon-parchment.ts` (1739 lines)
  - `berrygems/extensions/dragon-review.ts` (1574 lines)
  - `berrygems/extensions/hoard-allies/quest-tool.ts` (1182)
  - `berrygems/extensions/hoard-allies/index.ts` (1082)
  - `berrygems/extensions/dragon-tongue.ts` (915)
  - `berrygems/extensions/dragon-scroll.ts` (780)
- Issue: These are the extensions most likely to touch inter-extension globals, panel chrome, and multiple event hooks. Above ~800 lines, reviewing a diff in isolation becomes hostile.
- Follow-up: Schedule a refactor phase for `dragon-digestion.ts` first — it's 🔥 beta, most likely to still absorb more behavior, and the most over-quota.

### Commented-out Anthropic beta in dragon-digestion — **LOW**

- File: `berrygems/extensions/dragon-digestion.ts:1558-1563`
- Issue: `ANTHROPIC_CONTEXT_MGMT_BETA` is commented out with a note about `registerProvider` stripping OAuth betas and causing 401s for OAuth users. Dead code with an explanatory note is fine short-term; long-term it rots.
- Follow-up: Either delete the dead block (the note can live in a commit message or dragon-lab TODO) or promote it behind a feature flag in dragon-lab.

### cc-plugin marked `.orphaned_at` but still referenced as authoritative — **MEDIUM**

- Files: `cc-plugin/.orphaned_at` (Unix ts 1776360954 ≈ 2026-04-16), `CLAUDE.md:7` ("This repo ships a Claude Code plugin at `cc-plugin/`"), `AGENTS.md:217-222`
- Issue: `.orphaned_at` usually signals "unlinked from some registry"; unclear whether the plugin has been deliberately deregistered from Claude Code's plugin system while docs still promote it. Either the marker is stale (should be deleted) or the docs are stale (should note the orphan state).
- Follow-up: Ask dot what `.orphaned_at` means in this context; resolve one direction.

---

## 3. Security Concerns

### MCP and SSE servers bind to all interfaces with no auth — **HIGH**

- Files: `storybook-daemon/internal/psi/mcp/mcp.go:94` and `storybook-daemon/internal/psi/sse/sse.go:83`
- Both use `Addr: fmt.Sprintf(":%d", b.port)` — Go's `:PORT` form binds 0.0.0.0 (all interfaces). There is no token, bearer, or localhost-only check on any handler.
- Impact: Any host on the same LAN/VPN (or with a local port forward) can:
  - Read and write to the memory vault via `memory_read` / `memory_write`
  - Dispatch quests that spawn subprocesses with the daemon user's env (except blocked secret vars — see §3 positive note below)
  - Inject `/message` POSTs that nudge the dragon-heart
- ETHICS.md §3.8 explicitly scopes the threat model to "malicious code running as the same user." Binding to 0.0.0.0 silently widens the surface to the network. This likely wasn't intended.
- Follow-up: Change to `Addr: fmt.Sprintf("127.0.0.1:%d", b.port)` on both servers. If remote access is ever desired, gate it behind an explicit CLI flag AND require a token.

### Secret env stripping for quest subprocesses is well-designed — **LOW (positive, note gaps)**

- File: `storybook-daemon/internal/quest/command.go:134-184`
- Strips `_API_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD`, `_CREDENTIAL` substrings plus `AWS_`, `GITHUB_`, `OPENAI_`, `AZURE_`, `GCP_` prefixes. Allows `ANTHROPIC_API_KEY` ONLY for the claude harness.
- Gap: No test exists that covers DigitalOcean, Cloudflare, Tailscale, Discord, Slack, Stripe, or other common credential prefixes. If dot adds any of those to her shell env, they will leak into ally subprocesses.
- Gap: `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN` (dragon-forge territory) — would pass the current filter.
- Follow-up: Extend the prefix list (`HF_`, `CF_`, `DO_`, `DISCORD_`, `STRIPE_`, `TS_` for tailscale) and add a test fixture that iterates a generous env and asserts all are stripped.

### Anthropic OAuth-into-pi boundary — **LOW (respected, but brittle)**

- Files: `allies-parity/README.md` documents the constraint; `MEMORY.md` records it as `feedback_pi_anthropic_oauth.md`
- Status: `allies-parity/` matrix deliberately excludes anthropic for pi-driven tests. No code currently wires Anthropic OAuth into pi.
- Risk: The constraint lives in README prose, not in a lint rule or build check. A future contributor wiring an anthropic model into a pi-as-ally harness would not be warned.
- Follow-up: Add a unit test in `storybook-daemon/internal/quest/command_test.go` that asserts dispatch rejects `anthropic/*` models via a non-claude harness.

### No secrets committed to the repo — **LOW (positive)**

- Verified: `git ls-files` shows no `.env`, no keys, no credentials. `dragon-forge/unsloth_compiled_cache/` and `dragon-forge/out/` are not tracked.

---

## 4. Cross-Package Coupling Risks

### storybook-daemon is the single point of failure for identity — **HIGH**

- When the daemon is down:
  - `psi/` shows "disconnected" on both SSE and MCP channels (`psi/src/daemonstate.cpp`, `psi/src/sseconnection.cpp`)
  - `cc-plugin` MCP tools fail (`mcp__storybook-ember__*` 4xx)
  - `berrygems/extensions/hoard-sending-stone/` loses the stone bus (also port :9431 per `AGENTS.override.md`)
  - Quest dispatch from Claude Code breaks; the daemon quest subsystem is the one running subprocesses
- Architecture consequence: Ember has no degraded mode. The plugin docs claim "If the daemon is down, quests still run — you just lose the dialog channel" (`CLAUDE.md:32`) but because subprocess orchestration lives in `storybook-daemon/internal/quest/`, this sentence is inaccurate.
- Follow-up: Either correct CLAUDE.md to say quests depend on the daemon, or split quest dispatch into a standalone mode that `berrygems/extensions/hoard-allies` can drive directly (it used to — that's what the archived `v2-dispatch-hardening` plan was about, and per its 🪦 banner that path was abandoned).

### `internal/quest/` still wired despite archive banner claiming otherwise — **MEDIUM**

- File: `docs/superpowers/plans/archive/2026-04-12-v2-dispatch-hardening.md` (per commit 2df4668) says the `internal/quest/` package was abandoned in favor of `berrygems/extensions/hoard-allies`.
- Reality: `storybook-daemon/internal/psi/mcp/mcp.go:21,44,58,517` actively imports and uses `quest.Manager`. `internal/quest/` contains 14 `.go` files totaling ~2300 lines of code and tests, all still building.
- Risk: Two quest systems now exist — one in the daemon (MCP `quest_dispatch`) and one in pi (`hoard-allies` extension's `quest` tool). Divergent taxonomy, divergent cascade, divergent timeout semantics are a recipe for confusion.
- Follow-up: Either re-activate the archived plan with a clear "here's the target state" or write a new doc explaining the dual-system intent. The current state silently contradicts the archive banner.

### Soul gate only guards heartbeats — applies to all dispatch surfaces — **HIGH (see §1)**

- Cross-reference: the same gap that sits in quest dispatch also applies to direct SSE `/message` (`storybook-daemon/internal/psi/sse/sse.go:80`). When a rest gate is active, inbound messages still nudge the heart (`sse.go:72` / `events` channel → aggregator), which then gets rejected by the gate. The _behavior_ is correct (beat refuses) but the user-visible effect is silence — the sender has no idea their message was silently parked.
- Follow-up: When `/message` arrives during an active gate, return a 503 with the violation message in the response body so psi can surface "Ember is resting (min-rest 23:00–06:00)" to dot.

---

## 5. Stale References / Doc Drift

### `cc-plugin/.mcp.json` and root `.mcp.json` register only ember, not maren — **MEDIUM**

- Files: `.mcp.json` (root) and `cc-plugin/.mcp.json` each list only `storybook-ember` (:9432). The `.disabled` fallback at `cc-plugin/.mcp.json.disabled` has both.
- Drift: `CLAUDE.md:27-30` says "Both storybook-daemon MCP endpoints are registered in `.mcp.json`". `cc-plugin/AGENTS.md:15` lists both. `AGENTS.md:219` says "MCP server registrations (storybook-ember :9432, storybook-maren :9433)."
- Either docs are ahead of reality (maren was never wired up) or the active `.mcp.json` files silently dropped maren during a refactor.
- Follow-up: Decide whether maren is currently runnable; update `.mcp.json` OR update the four doc sites to say "ember only for now, maren pending."

### `den/features/dragon-daemon/` refers to a directory that no longer exists — **MEDIUM**

- Files: `den/features/dragon-daemon/AGENTS.md`, `persona-runtime-spec.md`, `phase4-maw-spec.md`, `dispatch-surface-spec.md`, `error-security-review.md`, `research-go-project-structure.md`
- All link to `dragon-daemon/AGENTS.md` and `dragon-daemon/` as the code home. Actual code is in `storybook-daemon/` (renamed per commit history). Also references "Doggy" as the Qt client — the actual name is `psi/`.
- Impact: Anyone following the link from den into code hits `ls: cannot access 'dragon-daemon/'`. The pivot to `storybook-daemon` + `psi` happened weeks ago and nobody updated the den feature tracker.
- Follow-up: Either rename the directory `den/features/dragon-daemon` → `den/features/storybook-daemon` with a global s/dragon-daemon/storybook-daemon/ + s/doggy/psi/, or add a redirect/banner at the top of each stale doc.

### User-level CLAUDE.md references `graphify-out/` which does not exist — **LOW**

- Source: `/home/dot/CLAUDE.md` (user-level, not repo-tracked): "This project has a graphify knowledge graph at graphify-out/. Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md..."
- Reality: `graphify-out/` does not exist. Following the instruction fails silently.
- Follow-up: Either generate the graph (run the rebuild command from `/home/dot/CLAUDE.md`) and commit `.gitignore` to exclude it per-user, or remove the stale instruction block from the user CLAUDE.md. This is a user-scope issue, not a repo fix.

### Archived "pre-pivot" plans with 🪦 banners — **LOW (positive)**

- Files: `docs/superpowers/plans/archive/2026-04-11-daemon-dispatch-surface.md`, `2026-04-12-quest-planning-tracking.md`, `2026-04-12-v2-dispatch-hardening.md` (commits 2df4668 and 8275424)
- Status: Archiving with banners is the _right_ move. No concern about the archival itself. The concern (captured above) is that `internal/quest/` still exists and is used, despite `v2-dispatch-hardening`'s banner declaring its target code abandoned.

### `AGENTS.override.md` is gitignored and documents local-only ports — **LOW (positive)**

- Good hygiene. No concern. Noted for awareness: the stone HTTP bus at `:9431` is mentioned in `AGENTS.override.md` but not in `AGENTS.md` or `CLAUDE.md`. New contributors won't know the third port exists.

---

## 6. Fragile Areas Under Churn

### berrygems — highest commit velocity — **MEDIUM**

- Commits since 2026-04-01 (touching path):
  - `berrygems/`: **58** commits
  - `storybook-daemon/`: 34 commits
  - `psi/`: 15 commits
  - `dragon-forge/`: 3 commits
  - `dragon-cubed/`: 1 commit
- berrygems carries the most user-visible behavior AND has the largest individual files (dragon-digestion, dragon-parchment, dragon-review, hoard-allies). High churn + high LOC + no test framework (`AGENTS.md:273` — "No test framework yet — manual testing via `/reload` in pi") is a textbook regression risk.
- Follow-up: Stand up a minimal Vitest setup for berrygems/lib first (the pure utility modules have no pi runtime deps and are highest-ROI to test).

### storybook-daemon recently pivoted to pi-as-persona — **MEDIUM**

- Commits `b917d79` ("delete llm/ and auth/ — replaced by pi subprocess"), `59d4002` ("rewrite for pi-as-persona — remove LLM providers, wire pi subprocess"), `262242c` ("add pi subprocess runner with env filtering"), `48e46ca` ("replace LLM provider config with pi session config")
- Whole LLM + auth layer was ripped out mid-April. The new `thought/` subprocess runner inherits correctness responsibilities the old `llm/Provider` abstraction used to own. Tests exist (`c3b899c` "env filtering tests") but the pivot is recent.
- Follow-up: During the next phase-plan for the daemon, audit `thought/runner.go` + `persona/pi_session.go` for edge cases inherited from the old Provider interface (token counting, partial-response handling, tool invocation shape, timeout during streaming).

### psi — fresh C++/QML codebase, Qt version-specific footguns — **MEDIUM**

- psi was landed in phases in April. Multiple Qt 6.11-specific workarounds already live in `dead_ends.md` entries (loadFromModule context props, `State` name collision).
- All psi source files are <250 lines each — good. The fragility is in Qt itself, not psi's shape.
- Follow-up: Add a build-version check at CMake configure time — fail clearly if Qt < 6.5 is detected.

### dragon-forge Phase 4 (`train.py`) is 🥚 planned, compiled cache is ephemeral — **LOW**

- Training is ROCm-only and the venv is bespoke (`~/.unsloth/studio/...`), not uv-managed. Tracked in `dead_ends.md 2026-04-10`.
- `dragon-forge/run.fish` is the single entry point. As long as contributors use it, the cwd/venv fragility is contained.

---

## 7. Recorded Dead-Ends (from `~/.claude/projects/-home-dot-Development-hoard/memory/dead_ends.md`)

These are hoarded knowledge — treat as facts unless new evidence overrides. Scoped summaries:

| Date       | Scope                                  | Lesson                                                                                                           |
| ---------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-04-10 | dragon-forge seeds                     | Don't key safety logic on overloaded vocabulary (e.g. "digest"); match shape/intent, not lexical token           |
| 2026-04-10 | dragon-forge seeds (two-layer persona) | Keep species-reactive user behavior in `config/user-context.md`, never in persona-level seeds                    |
| 2026-04-12 | storybook-daemon build                 | `go build ./...` doesn't produce a main binary; always use `go build -o storybook-daemon .`                      |
| 2026-04-12 | `internal/quest/command.go`            | `claude --model` rejects `provider/model`; strip the prefix via `strings.Cut`. Exit code 1 via stdout, no stderr |
| 2026-04-10 | dragon-forge invocation                | Unsloth venv at `~/.unsloth/studio/...`; always invoke via `dragon-forge/run.fish`; cwd matters                  |
| 2026-04-13 | Qt 6.11 context properties             | Use `engine.load(QUrl(...))`, NOT `engine.loadFromModule()`; AOT compiler skips context properties               |
| 2026-04-13 | Qt QML naming                          | Don't use context property name `State` — collides with `QtQuick.State`                                          |
| 2026-04-13 | ROCm iGPU segfault                     | Set BOTH `HIP_VISIBLE_DEVICES=0` AND `ROCR_VISIBLE_DEVICES=0`; HIP layer alone is insufficient                   |

**Follow-up:** None per-entry — these are already canonical. If the build script for storybook-daemon still defaults to `go build ./...` anywhere (tests, CI, docs), fix that one.

---

_Concerns audit: 2026-04-22_
