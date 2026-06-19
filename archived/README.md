# Pantry — Archived (retired 2026-06-19)

This directory holds everything retired during the **pantry scatter**. Nothing
here is installed by `pi` or shipped with the package. The contents are kept
only for git history and in case of regret — they are not maintained.

**Governing plan:** `.planning/REWRITE.md`
**Evidence:** `~/pantry-triage/SYNTHESIS.md` + `~/pantry-triage/cluster-*.md`

What survived the scatter, and where it went:

- **4 extensions kept** → `dragon-breath` (→ standalone repo — Phase 2A **done**),
  `dragon-herald` (→ `~/.pi` notify bridge — Phase 2B **done**),
  `dragon-image-fetch` + `kitty-gif-renderer` (→ `~/.pi/agent/extensions/`,
  decoupled — Phase 2C **done**). **All 4 survivors are now scattered;**
  `berrygems/extensions/` + `berrygems/lib/` are empty (only test-infra
  scaffolding, tone styles, and config remain in berrygems/).
- **~14 skills folded** into `~/.pi/agent/skills/` (Phase 3).
- **Everything else is here.**

---

## Extensions (`archived/extensions/`)

13 of 17 extensions retired. The 4 survivors stay in `berrygems/extensions/`.

| Extension | Why retired |
|---|---|
| `dragon-parchment` | Popup/panel-framework keystone; **dropped** — dot retired the whole popup stack (decision #4). Markdown popup panels not worth the maintenance. |
| `dragon-scroll` | The `popup` tool; goes with the dropped panel stack. |
| `dragon-guard` | 3-mode permission paradigm **not wanted** (decision #6); settings-panel core already dropped earlier. Distinct from `pi-permission-system`. |
| `dragon-curfew` | Persona time-guard **dropped** (decision #4); not wanted. |
| `dragon-loop` | Dropped despite a KEEP verdict (decision #6) — loop/automation capability let go. |
| `dragon-review` | Dropped despite a KEEP verdict (decision #6) — review needs covered by the `~/.pi/agent/prompts/review.md` prompt template. |
| `dragon-tongue` | **Replaced** by `pi-lens` (installed) — 37 LSPs + secrets/format/Semgrep vs tongue's TS+Go only. |
| `dragon-inquiry` | **Replaced** by `rpiv-ask-user-question` (installed; multi-Q tabs/previews/multi-select). |
| `kobold-housekeeping` | **Replaced** by `rpiv-todo` (installed; `/reload`-safe, cycle detection). |
| `dragon-digestion` | **Replaced** by `pi-context-prune` (+ `pi-context-usage`, `pi-cache-graph`, installed). Over-engineered (~3200 LOC / 22 files). |
| `dragon-websearch` | **Replaced** by `pi-web-access` (installed; web+URL+GitHub+PDF+YouTube+video). |
| `dragon-lab` | **Deprecated** — dead experiment registry, no consumers. |
| `dragon-musings` | **Deprecated** — decorative LLM-spinner that burns tokens on flavor text. |

## Shared library (`archived/lib/`)

8 of 12 `berrygems/lib/` modules retired. Only the 4 the survivors actually
import remain in `berrygems/lib/`: `settings`, `globals`, `animated-image`,
`animated-image-player`. (Verified by transitive import closure of the 4
survivors — the plan's predicted keep-list was wrong; the two image extensions
genuinely depend on the `animated-image*` modules.)

| Module | Why retired |
|---|---|
| `panel-chrome` | Only imported by the retired popup stack (parchment/scroll/tongue/inquiry/digestion). |
| `compaction-templates` | Only imported by the retired `dragon-digestion`. |
| `lsp-client` | Only imported by the retired `dragon-tongue` (→ `pi-lens`). |
| `giphy-source` | Orphaned (no live importer); panel-stack flavor. |
| `cooldown`, `id`, `pi-spawn`, `sse-client` | Orphaned — no live importer among the survivors. |

## Skills (`archived/skills/`)

54 of 54 skills now retired here — **Phase 3 is complete**: every keeper
skill's content was folded into `~/.pi/agent/skills/` (22 skills: 18
fold-standalone, `rust`, `quickshell`, plus the 2 decoupled image-doc
skills), the nugget-source skills had their unique bits extracted into those
keepers, and then *everything* in `morsels/skills/` moved here. `morsels/skills/`
is now empty. Reasons are summarized from the triage cluster reports:

| Skill | Why retired |
|---|---|
| `minecraft-fabric` | No Fabric projects; Fabric explicitly deferred. |
| `spring-boot` | Zero Spring projects anywhere. |
| `react` | Redundant with react.dev; the model already performs well on React. |
| `astro` | Low relevance, generic, and **misses Solid** (the framework carbuddy/web actually uses). |
| `js-testing` | Pure Vitest/Jest docs restatement — clearest deprecate in the cluster. |
| `api-design` | REST/OpenAPI/GraphQL textbook; TS-centric, misses Ktor/axum/gin stacks. |
| `database` | SQL/indexing textbook; ORMs miss Rust/Kotlin (no sqlx/diesel/Exposed). |
| `docker` | Docker textbook; generic = LLM territory. |
| `python` | Thin, generic; uv bits already in `dependency-management`; Python secondary. |
| `python-testing` | Distilled pytest docs; Python secondary. |
| `refactoring` | Fowler/SOLID/GoF textbook. (The dangling `simplify` pointer it referenced was fixed in Phase 0.) |
| `commit` | Commodity format + duplicated attribution; superseded by the planned `/commit` prompt. |
| `github-actions` | Generic Actions syntax = LLM territory. |
| `github-markdown` | Zero unique value; LLM authoritative on GFM. |
| `github` | **Replaced** by the GitHub MCP server (`github/github-mcp-server`) via `pi-mcp-adapter`. |
| `defuddle` | **Replaced** by `pi-web-access` (installed; same readability+turndown, +GitHub/YouTube/PDF/video). |
| `init` | Claude-Code-only (`CLAUDE.md`/`.claude/`); wrong harness for a pi-package; superseded by universal `agent-init`. |
| `init-stack` | Claude-Code-only hook mechanism; no pi equivalent. |
| `kickstart` | Claude-Code-only; overlaps `agent-init`. |
| `fetch-stacks` | Pure `.claude/` mechanism; tightest Claude coupling. |
| `kobold-housekeeping` (doc) | Coupled to its retired extension + parchment; goes with them. |
| `dragon-guard` (doc) | Follows its retired extension's fate. |
| `dragon-parchment` (doc) | Follows its retired extension's fate (popup stack dropped). |

**Phase 3 additions** (folded into `~/.pi/agent/skills/` keepers first, then
archived here — the source is retained for git history):

| Skill | Folded into | What was kept |
|---|---|---|
| `minecraft-modding` | `neoforge` | Stack-agnostic MC sections (mixins, codecs, sided-exec, datagen, perf, compat); dual-loader framing dropped. |
| `kotlin`, `java` | `neoforge` | No KFF-/mixin-specific nuggets beyond what neoforge already covers — generic remainder dropped. |
| `go-check` | `go` | Linter-triage ordering + key-linters table; command catalogs dropped. |
| `typescript-check` | `extension-designer` (references) | Pi-extension TS gotchas (jiti/symlinks/`matchesKey`/`KeyId`); tsc/eslint primer dropped. |
| `typescript` | `extension-designer` (references) | Boundary-validation rule + >4-params→options-object; generic remainder dropped. |
| `pi-events`, `pi-sessions`, `pi-tui` | `extension-designer` (references) | Event decision tree, reserveTokens/compaction gotchas, consolidated anti-patterns; raw API is in pi docs. |

The keeper skills themselves (`go`, `neoforge`, `gdscript`, `fix`, `git`,
`atproto`, `dependency-management`, `github-writing`, `extension-designer`,
`rust`, `quickshell`, etc.) live at `~/.pi/agent/skills/`, not here — this
archive holds only the retired sources.

## Tests (`archived/tests/`)

Orphaned tests for the retired extensions and lib modules above, **plus** the
image-extension/lib tests retired in Phase 2C (those modules were *extracted*
to `~/.pi/agent/`, not archived — their tests have no runner there). Moved here
so the surviving test tree (`berrygems/tests/`) stays self-consistent — only
tests for `dragon-breath`, `dragon-herald`, the `settings` lib, the shared
`createPiTestSession` helper, and the package `smoke/` install test remain.

> Note: `tsconfig.json` never included `tests/`, and `vitest` was never wired
> into the gate (the `.planning/phase 02` test-infrastructure work was
> incomplete). These tests ran neither at retirement nor as part of any
> automated gate — they're archived for history, not because they were ever
> blocking.
