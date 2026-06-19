# Pantry Rewrite — Plan & Tracking

**Created:** 2026-06-19
**Status:** 🐣 in-progress — **Phases 0–2 complete** (repo rot fix, non-survivors archived, 4 survivors scattered). **Phase 3 next** (fold ~14 skills into `~/.pi/agent/skills/`). For the live state snapshot + non-obvious gotchas, read [HANDOFF.md](HANDOFF.md).
**Authority:** This doc governs the pantry retirement/scatter described in
`~/pantry-triage/SYNTHESIS.md`. The full per-item evidence lives in
`~/pantry-triage/cluster-*.md` (8 cluster reports). This doc is the
**executable plan** that lives in the repo it changes.

> **TL;DR:** pantry retires as a package. 2 extensions become standalone
> projects (`dragon-breath`) or a thin bridge (`dragon-herald`); 2 more are
> decoupled for inline image use (`dragon-image-fetch` + `kitty-gif-renderer`);
> the popup stack (`dragon-parchment` + `dragon-scroll` + guard-panel) is
> dropped; ~14 skills fold into `~/.pi/agent/skills/`; everything else is
> archived. dot's host is the only consumer; nothing is published to npm.

---

## 0. Decisions locked (2026-06-19, dot)

| # | Decision | Implication |
|---|---|---|
| 1 | **End-state = scatter, not lean-package.** Fold survivors into `~/.pi/agent/`; retire pantry-the-package. | No `pantry-core` package to maintain. `package.json`'s `pi` manifest gets emptied/removed. |
| 2 | **`dragon-breath` → standalone private git project** at `~/Development/dragon-breath` (**name kept**). | Consumed via `git:` source or local path. Not npm-published. |
| 3 | **`dragon-herald` → thin `notify.sh` bridge** at `~/.pi/agent/extensions/herald.ts`, shelling out to a **shared** script (symlinked from pi + Claude). | This pair *is* the ntfy notification layer; shared with Claude Code. |
| 4 | **Popup stack DROPPED** (`dragon-parchment`, `dragon-scroll`, `dragon-guard` settings-panel). No rewrite. | Removes ~3000+ LOC. `dragon-guard` core was already dropped earlier. |
| 5 | **`dragon-image-fetch` + `kitty-gif-renderer` KEPT, decoupled** from parchment — for inline in-turn images only. | Strip panel coupling; also move hardcoded Giphy key → env var. |
| 6 | **Dropped despite KEEP verdicts:** `dragon-loop`, `dragon-review`, `dragon-curfew`. | Archived in case of regret. Review via `~/.pi/agent/prompts/review.md`; loops let go. |
| 7 | **`research-and-fix` kept** (pi-subagents is staying). | Folds into `~/.pi/agent/skills/` with the others. |
| 8 | **Borderline skills folded as nuggets, not standalone:** `kotlin`, `java`, `go-check`, `rust`. | Nuggets merge into stack skills; no thin personal-default skills kept. |

---

## 1. Survivor manifest (the full keep/fold/archive list)

### 1.1 Extensions (17 total → 4 survivors, rest archived)

| Extension | Fate | Destination |
|---|---|---|
| `dragon-breath` | **standalone project** | `~/Development/dragon-breath` (private git) |
| `dragon-herald` | **refactor → thin bridge** | `~/.pi/agent/extensions/herald.ts` + shared `notify.sh` |
| `dragon-image-fetch` | **keep, decouple** | `~/.pi/agent/extensions/dragon-image-fetch.ts` (strip parchment, env-var the key) |
| `kitty-gif-renderer` | **keep, decouple** | `~/.pi/agent/extensions/kitty-gif-renderer.ts` (strip parchment render-path) |
| `dragon-parchment` | **archive** (popup stack dropped) | `pantry/archived/extensions/dragon-parchment/` |
| `dragon-scroll` | **archive** (popup tool dropped) | `pantry/archived/extensions/dragon-scroll/` |
| `dragon-tongue` | **archive** (replaced by `pi-lens`, installed) | `pantry/archived/extensions/dragon-tongue/` |
| `dragon-inquiry` | **archive** (replaced by `rpiv-ask-user-question`) | `pantry/archived/extensions/dragon-inquiry/` |
| `kobold-housekeeping` | **archive** (replaced by `rpiv-todo`) | `pantry/archived/extensions/kobold-housekeeping/` |
| `dragon-digestion` | **archive** (replaced by `pi-context-prune`) | `pantry/archived/extensions/dragon-digestion/` |
| `dragon-websearch` | **archive** (replaced by `pi-web-access`) | `pantry/archived/extensions/dragon-websearch/` |
| `dragon-guard` | **archive** (dropped; 3-mode paradigm not wanted) | `pantry/archived/extensions/dragon-guard/` |
| `dragon-curfew` | **archive** (dropped; persona time-guard) | `pantry/archived/extensions/dragon-curfew/` |
| `dragon-loop` | **archive** (dropped despite KEEP) | `pantry/archived/extensions/dragon-loop/` |
| `dragon-review` | **archive** (dropped despite KEEP; `/review` prompt covers it) | `pantry/archived/extensions/dragon-review/` |
| `dragon-lab` | **archive** (dead experiment registry) | `pantry/archived/extensions/dragon-lab/` |
| `dragon-musings` | **archive** (decorative token-burner) | `pantry/archived/extensions/dragon-musings/` |

**Also retire:** `berrygems/lib/` modules that only served archived extensions
(`panel-chrome`, `dragon-digestion-tiers`, `dragon-digestion-thrash`,
`animated-image*`, `giphy-source`, `lsp-client`) — move to
`pantry/archived/lib/`. **Keep** in `berrygems/lib/` only what the 4 survivors
still import (likely just `settings`, `id`, `cooldown`, `pi-spawn`,
`sse-client`, `compaction-templates` — ~~verify during Phase 2~~ **VERIFIED in Phase 1:** actual survivor lib closure = `settings`, `globals`, `animated-image`, `animated-image-player` only — NOT the predicted list. The two image extensions depend on `animated-image*`. The 8 retired libs are archived in `archived/lib/`; see `archived/README.md`).

### 1.2 Skills (54 total → ~14 fold + ~12 nuggets, rest archived)

**Fold into `~/.pi/agent/skills/` as standalone skills:**

| Skill | Edit before fold |
|---|---|
| `neoforge` | Fold the stack-agnostic MC sections from `minecraft-modding` (codecs/sided-exec/data-gen/perf/compat) into this skill; drop the dual-loader framing. |
| `go-tui` | As-is (v1/v2 import guidance verified correct). |
| `go-testing` | As-is. |
| `go` | As-is. |
| `qtqml` | As-is (dedup ~3 rules shared with qtquick). |
| `qt` | As-is. |
| `qtquick` | As-is. |
| `atproto` | Generalize the client-auth bullet: mention Go/`indigo` (noms, spec-driven-noms), not just `@atproto/api`. |
| `git-auth` | As-is (rbw/Bitwarden automation — strongest keeper). |
| `skill-designer` | As-is (cleanest, most reusable). |
| `extension-designer` | **Fix `@mariozechner/`→`@earendil-works/` imports** in SKILL.md + `references/*.md`; **prune pantry-coupled examples** (`berrygems/lib`, `dragon-parchment`, `dragon-digestion`). |
| `agent-init` | As-is (targets universal AGENTS.md standard). |
| `dependency-management` | Trim to command tables + preferences (bun/uv/cargo/go/gradle); compress prose. |
| `fix` | **De-Go-ify** (`go test`→"project test command", drop `*_test.go`); keep TDD discipline + never-mock-DB + 3-attempt-revert. |
| `research-and-fix` | Keep research→fix bridge + history-agent insight; keep (pi-subagents staying). |
| `github-writing` | Salvage **berrygems styles voice system** + **AI attribution/identity**; drop generic PR/issue/README template bodies. |
| `git` | **Slim**: keep only opinionated conventions (GitHub Flow, rebase-local+squash-merge, autosquash, `rerere`, `--force-with-lease`); drop command catalogs. |

**Fold as nuggets into the above (not standalone):**

| Source skill | Fold into | What to salvage |
|---|---|---|
| `minecraft-modding` | `neoforge` | stack-agnostic MC sections (see above) |
| `rust` | new slim `rust` skill OR `dependency-management` | error-handling split, ownership tree, concurrency; enrich with carbuddy workspace conventions + `cargo nextest`/`deny` + edition-2024 |
| `kotlin` | `neoforge` (or a kotlin note) | any KFF-specific Kotlin bits; drop the generic remainder |
| `java` | `neoforge` | mixin-specific Java notes; drop generic remainder |
| `go-check` | `go` | linter-triage ordering + linter→symptom table |
| `typescript-check` | `extension-designer` | "Pi Extension Projects" section (jiti/symlinks/`matchesKey`/`KeyId` gotchas); drop tsc/eslint primer |
| `typescript` | a slim note or drop | Boundary-Validation rule + >4-params→options-object rule; drop generic ~80% |
| `gdscript` | (expand in place) | add gdformat/gdlint/gdparse workflow + 4.x typed containers + correct headless-test note; then fold |
| `pi-events` | `extension-designer` references | anti-patterns + decision tree (after import fix); raw API is in pi docs |
| `pi-sessions` | `extension-designer` references | compaction gotchas with line refs (after import fix) |
| `pi-tui` | `extension-designer` references | remaining anti-patterns (after import fix); or drop — heaviest overlap with pi's `tui.md` |

**Archive (move to `pantry/archived/skills/`):**

`minecraft-fabric`, `spring-boot`, `js-testing`, `react`, `astro`,
`refactoring` *(also fix dangling `simplify` pointer first)*, `api-design`,
`database`, `docker`, `python`, `python-testing`, `commit`, `github-actions`,
`github-markdown`, `github` *(ops layer → GitHub MCP via `gh mcp`)*,
`defuddle` *(→ `pi-web-access`)*, `init`, `init-stack`, `kickstart`,
`fetch-stacks` *(Claude-Code-only)*, and the berrygem-doc skills whose
extensions archived: `dragon-guard`, `dragon-image-fetch` *(doc — the
extension survives, so keep this doc, decoupled)*, `dragon-parchment`,
`kitty-gif-renderer` *(doc — extension survives, keep decoupled)*,
`kobold-housekeeping`.

> **Net:** ~17 standalone skills land in `~/.pi/agent/skills/` (the fold list
> above, including a slim `rust` if enriched). ~11 more contribute nuggets
> then archive. ~26 archive outright.

---

## 2. Execution plan (phased; each phase = 1 commit unless noted)

### Phase 0 — repo-wide rot fix (1 commit, benefits everything)

Do this first; it benefits even items being archived (in case of regret) and
is the prerequisite for the kept pi-API skills.

- [x] **0.1** `sed` import rename across `pi-events`, `pi-sessions`, `pi-tui`,
      `extension-designer` (+ `references/*.md`):
      `@mariozechner/pi-` → `@earendil-works/pi-` (covers `-coding-agent`,
      `-ai`, `-tui`).
- [x] **0.2** Fix `pantry/README.md` link: `github.com/badLogic/pi-mono` →
      `github.com/earendil-works/pi-mono`.
- [x] **0.3** Replace `/opt/pi-coding-agent/docs/...` paths with GitHub URLs
      (so they don't rot again): `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/...`.
- [x] **0.4** Remove the dangling `simplify` pointer in
      `morsels/skills/refactoring/SKILL.md` (no such skill exists in pantry).
- [x] **0.5** Verify `tsc --project berrygems/tsconfig.json` still passes
      (Phase 0 is docs + imports only; should be safe).

**Commit:** `chore: fix stale @mariozechner imports, doc paths, dangling simplify ref`

### Phase 1 — archive non-survivors (1 commit)

- [x] **1.1** Create `pantry/archived/{extensions,skills,lib}/` (also `archived/tests/{extensions,lib}/` for orphaned tests).
- [x] **1.2** Move every extension NOT in the survivor list
      (§1.1) into `pantry/archived/extensions/`.
- [x] **1.3** Move every skill NOT in the fold/nugget lists (§1.2) into
      `pantry/archived/skills/`.
- [x] **1.4** Move retired-only `berrygems/lib/` modules into
      `pantry/archived/lib/` (verify each against the 4 survivors' imports first).
- [x] **1.5** Add `pantry/archived/README.md` explaining: "Retired 2026-06-19
      during pantry scatter. Kept for git history; not installed. See
      `.planning/REWRITE.md`." Include a one-line reason per archived item
      (pull from `~/pantry-triage/cluster-*.md`).
- [x] **1.6** Verify the survivors still type-check: `tsc --project berrygems/tsconfig.json`
      (may need to prune now-dangling imports into archived lib).

**Commit:** `chore: archive non-survivors (pantry scatter — see .planning/REWRITE.md)`

### Phase 2 — scatter survivors (multiple commits, parallelizable)

These are independent efforts; order doesn't matter. None block each other.

#### 2A — `dragon-breath` → standalone project

- [x] **2A.1** `git init` a new private repo at `~/Development/dragon-breath`.
- [x] **2A.2** Copy `berrygems/extensions/dragon-breath/` (+ only the
      `berrygems/lib/` modules it imports) into the new repo.
- [x] **2A.3** Set up `package.json` with `pi: { extensions: [...] }` and
      `keywords: ["pi-package"]`; pin peer deps (`@earendil-works/pi-*`,
      `typebox`) in `peerDependencies`, not bundled.
- [x] **2A.4** Write a README documenting the carbon/energy model, settings,
      and the `dragon-breath` globalThis API (if any).
- [x] **2A.5** Decouple from pantry internals (no `pantry.*` symbol refs
      unless self-contained).
- [ ] **2A.6** Create the private GitHub repo `dotBeeps/dragon-breath` and push
- [x] **2A.7** Install into pi: `pi install git:github.com/dotBeeps/dragon-breath`
      (or `pi install ~/Development/dragon-breath`).
      *(2A.7 DONE: dot installed locally — `"../../Development/dragon-breath"`
      in `~/.pi/agent/settings.json` packages. 2A.6 still open: no GitHub remote
      configured yet; repo is local-only until dot pushes to `dotBeeps/dragon-breath`.)*
- [x] **2A.8** Remove `dragon-breath` from `pantry/berrygems/extensions/`

**Commit (in pantry):** `chore: extract dragon-breath to standalone repo`
**Commit (in dragon-breath):** initial standalone release.

#### 2B — `dragon-herald` → thin `notify.sh` bridge

- [x] **2B.1** Write `~/.pi/agent/extensions/herald.ts` (~40–80 LOC):
      - Subscribe to pi's agent-end / waiting-for-input event (confirm exact
        event name against
        `~/Development/pantry/berrygems/extensions/dragon-herald.ts` and pi's
        `docs/extensions.md`).
      - `child_process.execFile` the shared script path (configurable, default
        `~/.pi/agent/notify.sh`).
      - Pass event type + short message payload via argv (and/or stdin).
      - **No business logic in the extension** — no markdown stripping, no
        recap generation.
- [x] **2B.2** Write the shared `~/.local/bin/notify.sh`:
      - Reuse markdown-strip + min-duration-skip logic from
        `~/.claude/hooks/ntfy.sh` and the retired `dragon-herald`.
      - Branch on event type: idle/waiting → fork recap worker (cheap model
        `-p` call, ≤40 words) + POST to ntfy; permission/other → push raw.
      - Recursion guard (mirror `CLAUDE_NTFY_SKIP`).
      - **Token via env var** (`$NTFY_TOKEN`), never hardcoded. Rotate the
        exposed `tk_…` in the existing `~/.claude/hooks/ntfy.sh`.
- [x] **2B.3** Symlink: `~/.pi/agent/notify.sh` → `~/.local/bin/notify.sh`,
      and repoint `~/.claude/hooks/ntfy.sh` to it (or symlink) so both
      harnesses share one script.
- [x] **2B.4** `set -Ux NTFY_TOKEN <rotated-token>` (fish universal var).
- [ ] **2B.5** Test: trigger a pi agent_end → confirm ntfy push arrives.
      *(DEFERRED: verified notify.sh logic in NOTIFY_DRY_RUN mode across all
      branches — pi agent_end (long forks recap worker, short skips via
      min-duration), errored, Claude permission/idle. Live ntfy push + the
      recap headless call (`claude -p`) confirmed by dot on /reload.)*
- [x] **2B.6** Remove `dragon-herald` from `pantry/berrygems/extensions/`.

**Commit (in pantry):** `chore: extract dragon-herald to ~/.pi notify bridge`

#### 2C — `dragon-image-fetch` + `kitty-gif-renderer` decouple

- [x] **2C.1** Copy both into `~/.pi/agent/extensions/`.
- [x] **2C.2** Strip the `dragon-parchment` panel coupling from each
      (render-path, `createPanel` calls). Keep the fetch + render primitives
      for inline in-turn image use.
- [x] **2C.3** **Move the hardcoded Giphy API key in `dragon-image-fetch` to
      an env var** (`$GIPHY_API_KEY`) — security fix flagged in the triage.
      `set -Ux GIPHY_API_KEY <key>` (recover existing key from the source).
- [x] **2C.4** Verify both still type-check and load standalone in pi.
- [x] **2C.5** Remove both from `pantry/berrygems/extensions/`.

**Commit (in pantry):** `chore: extract image-fetch + kitty-gif-renderer to ~/.pi (decoupled)`

### Phase 3 — fold skills into `~/.pi/agent/skills/` (1 commit)

- [ ] **3.1** For each skill in the §1.2 "fold standalone" list: copy into
      `~/.pi/agent/skills/`, applying the per-skill edit noted.
- [ ] **3.2** For each "fold as nugget" source: extract the noted nugget into
      its target skill, then move the source to `pantry/archived/skills/`.
- [ ] **3.3** Verify each folded skill's frontmatter is valid (`name`,
      `description` per agentskills.io spec; `name` ≤64 chars `[a-z0-9-]`).
- [ ] **3.4** Spot-check 2–3 skills load as `/skill:<name>` in pi.

**Commit (in pantry):** `chore: fold keeper skills to ~/.pi; archive the rest`

### Phase 4 — retire pantry-the-package (1 commit)

- [ ] **4.1** Empty or remove the `pi` manifest in `pantry/package.json`
      (nothing left to install).
- [ ] **4.2** Update `pantry/README.md`: change the headline to "Retired
      2026-06-19 — see `.planning/REWRITE.md`. Survivors scattered to
      `~/.pi/agent/` and `~/Development/dragon-breath`."
- [ ] **4.3** Update `.planning/PROJECT.md` and `.planning/ROADMAP.md` to mark
      the project retired (they currently describe 17 extensions / 56 skills /
      `pi install github:dotBeeps/pantry` — all now stale).
- [ ] **4.4** Decide pantry repo fate: archive on GitHub, or keep as the
      `archived/` holding pen + `dragon-breath` history. (Recommendation:
      GitHub-archive the repo so the history is preserved but it's clearly
      read-only.)

**Commit:** `chore: retire pantry-the-package (scatter complete)`

---

## 3. Verification gates

| Gate | Command / check | When |
|---|---|---|
| Type-check | `tsc --project berrygems/tsconfig.json` | After Phase 0, 1, 2C |
| Survivors load in pi | `pi -e ./berrygems/extensions/dragon-breath` (etc.) in a throwaway session | After Phase 2 |
| Skills discoverable | `/skill:neoforge`, `/skill:git-auth`, etc. inside pi | After Phase 3 |
| Notify bridge works | trigger agent_end → ntfy push arrives | After Phase 2B.5 |
| No dangling imports | `grep -rn '@mariozechner\|/opt/pi-coding-agent' berrygems/ morsels/` returns nothing | After Phase 0 |
| GitHub MCP unaffected | `mcp({ search: "pull request" })` still works in pi | Unrelated to this rewrite, but verify nothing in `~/.pi` regresses |

---

## 4. Open items (none blocking Phase 0/1)

- **`dragon-breath` repo visibility:** locked = private. Confirm GitHub repo
  name (`dotBeeps/dragon-breath`) and whether to push now or keep local.
- **`notify.sh` recap model:** reuse `claude -p --model haiku` (existing
  pattern, but couples pi-notifications to the Claude binary) or switch to
  `pi -p` with a cheap model? Decide at Phase 2B.2.
- **`rust` skill fate:** enrich-and-fold, or drop entirely and lean on the
  model? Decide at Phase 3.2.
- **Pantry repo fate post-retire:** GitHub-archive vs leave as-is. Decide at Phase 4.4.

---

## 5. Cross-references

- **Source of evidence:** `~/pantry-triage/SYNTHESIS.md` + `~/pantry-triage/cluster-*.md` (8 reports)
- **Host setup context:** `~/pi-setup-plan.md` (§3.4, §5, §9)
- **pantry's own prior planning:** `.planning/PROJECT.md`, `.planning/ROADMAP.md` (now stale post-retire)
- **Ethics contract:** `ETHICS.md` (still applies to any survivor that handles user data — `dragon-guard` is archived, but `dragon-herald` handles notification content; carry the consent/privacy posture into the bridge)

---

*This doc is the single source of truth for the scatter. Update the checkboxes
as phases land; commit it alongside the work it describes.*
