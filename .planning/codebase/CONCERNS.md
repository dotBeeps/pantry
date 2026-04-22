# Codebase Concerns

**Analysis Date:** 2026-04-22

## Amputation Fallout (commit `b9c5050`)

The `chore!: amputate daemon scope, rename hoard → pantry` commit removed `storybook-daemon/`, `psi/`, `cc-plugin/`, `dragon-forge/`, `allies-parity/`, `dragon-cubed/`, two berrygems extensions, and two berrygems lib files. The rename surgery renamed ~18 `Symbol.for` keys, ~4 settings helpers, ~60 call sites, ~35 settings paths. This section documents what survived the amputation and should not have.

### Lingering `hoard` references in shipped code

These are live, user-facing references in code that pi still loads. They are not comments or archival prose — they will mis-route API calls, env vars, and settings.

**`Symbol.for("hoard.*")` lookups in published morsels (WILL BREAK cross-extension calls):**

- `morsels/skills/hoard-allies/SKILL.md:295` — `Symbol.for("hoard.allies")` documented for consumers. Berrygems publish under `pantry.*` now, so any agent following this morsel gets `undefined`.
- `morsels/skills/hoard-sending-stone/SKILL.md:17` — `Symbol.for("hoard.stone")` in the "sending a message" quick reference.
- `morsels/skills/hoard-sending-stone/SKILL.md:123` — same key, second example.
- `morsels/skills/hoard-allies/SKILL.md:218` — documented setting path `hoard.allies.confirmAbove`; berrygems settings.ts reads `pantry.*` (legacy fallback is `dotsPiEnhancements.*`, not `hoard.*`).

**`HOARD_*` env vars documented in shipped skills:**

- `morsels/skills/hoard-sending-stone/SKILL.md:203-204` — `HOARD_STONE_PORT`, `HOARD_ALLY_DEFNAME` both documented as the public env surface. The daemon that read these was amputated; consumers reading the morsel will still try to set/consume them.

**`hoard-allies` directory in berrygems extensions:**

- `berrygems/extensions/hoard-allies/` is an empty directory on disk (only a `.claude/rules/typescript.md` file — presumably a stray rule sync artifact). The git rm removed all tracked files but the empty dir remains. Pi auto-discovers `berrygems/extensions/` — an empty subdirectory is harmless but misleading, and anyone grepping `hoard-allies` in this repo will find it and assume the extension is still shipping.
- Fix: `rm -rf berrygems/extensions/hoard-allies/`.

**Skill directories named `hoard-*` still shipping:**

- `morsels/skills/hoard-allies/SKILL.md` — full skill still present, 296 lines, documents the amputated quest dispatch system including tool-whitelist env vars (`HOARD_GUARD_MODE`, `HOARD_ALLY_TOOLS`) that no longer exist in any published berrygem.
- `morsels/skills/hoard-sending-stone/SKILL.md` — full skill still present, 204 lines, documents an HTTP/SSE bus served by the amputated `storybook-daemon`.
- These two skills are the single largest piece of amputation fallout. They teach agents to call APIs that no longer exist. Either delete them outright or replace with a "removed in 2026-04-22 amputation — external harness repos ship this now" stub.

**Code comments and flavour text referencing hoard:**

- `berrygems/extensions/dragon-curfew.ts:4,37,43` — "The hoard does not need tending at 3 AM", "The hoard will still be here tomorrow", "The hoard is very concerned about you". These are curfew nudge copy. Harmless functionally but tonally inconsistent with the rename.
- `berrygems/extensions/dragon-musings.ts:4,19,87,104,111,116,127,261` — loading phrases ("Warming the hoard...", "Sorting through the hoard...", etc.) and the LLM prompt at line 261 explicitly asks for hoarding-themed phrases. This is intentional dragon flavour; fine to keep as persona, not fine if the project is trying to sever the hoard identity cleanly.
- `berrygems/lib/panel-chrome.ts:127,289` — border-style jsdoc calls "Whimsical hoard vibes" and "Frozen hoard aesthetic". Flavour text in comments; keep or scrub per rename policy.
- `berrygems/lib/pi-spawn.ts:9` — "Extracted from berrygems/extensions/hoard-allies/spawn.ts for use across…" — references a file that was amputated. Update attribution or remove.
- `berrygems/extensions/dragon-digestion.ts:1942` — `"Blocked until hoard-lab extension can detect auth type…"`. `hoard-lab` is also amputated (renamed to `pantry.lab`); the TODO now points at vapour.
- `berrygems/extensions/dragon-guard/index.ts:220` — `// ── Legacy subagent bail-out (non-hoard subagents) ──` — comment references "hoard subagents" which were the daemon-spawned allies.
- `berrygems/extensions/dragon-guard/AGENTS.md:13` — "Tool whitelist set by hoard-allies at spawn time via env vars." Describes a spawn path that no longer exists in the repo.

**Grand total:** 495 matches for `hoard` across `*.ts`/`*.md`/`*.json`/`*.fish` (excluding `node_modules`, `.git`, `.planning`). Most are in `den/` planning archives (intentional historical record) but several dozen are in shipped code or user-facing docs.

### Root-doc references to amputated subsystems

- `berrygems/AGENTS.md:16` — `"storybook-daemon is the persistent core — mind, soul, connectors. berrygems tools are what the daemon uses when inhabiting a pi session."` References the amputated daemon as present-tense architecture.
- `berrygems/AGENTS.md:70` — verification command: `cd /home/dot/Development/hoard && tsc --project berrygems/tsconfig.json`. Wrong path — project now lives at `/home/dot/Development/pantry`. This is the documented one-line pre-commit check; users following it will `cd` into a nonexistent directory.
- `morsels/AGENTS.md:13` — same "storybook-daemon is the persistent core" framing. The daemon no longer ships with pantry.
- `ETHICS.md:167` — `"The hoard is the first thing I'll remember."` — prose reflection about the hoard identity. Read carefully: this is Ember's first-person voice in a reflective passage. Keep if the rename is a rename-only; scrub if the hoard identity itself is being retired.

### `.claude/` config pointing at `/home/dot/Development/hoard/`

Project-local Claude Code config is broken. Every hook path and every `ETHICS.md` path in here points at the old worktree that no longer exists at `/home/dot/Development/hoard`.

- `.claude/settings.json:9` — PreToolUse hook: `fish /home/dot/Development/hoard/.claude/hooks/pre-block-gosum.fish`. Will fail on every Edit/Write (the hook exit code is silently swallowed unless it matches `*/go.sum`, so most edits succeed — but the hook itself cannot run).
- `.claude/settings.json:19,23,27` — three Stop hooks at `/home/dot/Development/hoard/.claude/hooks/…`. All three will fail on every session Stop.
- `.claude/agents/soul-reviewer.md:13,25` — system prompt literally says `"You are the Soul Reviewer — a specialist auditor for the ethics and consent subsystems of the hoard daemon."` and instructs the agent to read `/home/dot/Development/hoard/ETHICS.md`. The daemon is amputated; the subagent has no surface to review. This agent should be deleted or fully rewritten.
- `.claude/skills/hoard-verify/SKILL.md` — skill name is `hoard-verify`; its body invokes `cd /home/dot/Development/hoard/storybook-daemon` and `qmllint /home/dot/Development/hoard/psi/qml/…`. Both target subprojects are amputated. This skill cannot run.
- `.claude/hooks/stop-doc-sync.fish:140-182` — the hook body hard-codes `hoard_prefixes`, `hoard_missing`, `hoard:ally-*` naming patterns. Even if the hook path in settings.json is fixed, the hook's own logic is scanning for a retired namespace.
- `.claude/parity-map.json` — the entire parity map (147 lines) describes a pi↔cc parity surface for the amputated `cc-plugin/` package. Every `cc-plugin:*` cross-ref now points at deleted disk artifacts. Entries like `"hoard-allies": { "cc": "cc-plugin:quest" }` and `"hoard-sending-stone": { "cc": "cc-plugin:ally-status" }` are dangling on both sides. The `stop-parity-check` hook (itself dangling) reads this file.

Fix: the entire `.claude/` tree needs either a sweep-path-rewrite (`hoard` → `pantry`) followed by trimming agents/skills/hooks that reference amputated subsystems, or a blank-slate rewrite. Leaving it half-migrated is actively harmful — broken hooks fail silently.

### `AGENTS.override.md` conflicts with amputated subsystems

`AGENTS.override.md` is gitignored (see `.gitignore:39`) so it's a local-only file, but its template references amputated projects as if they were active:

- Line 7: `storybook-ember MCP: :9432` — storybook-daemon amputated; the MCP tool `mcp__storybook-ember__*` referenced in `.claude/agents/soul-reviewer.md:9-11` will fail to resolve.
- Line 8: `storybook-maren MCP: :9433` — same.
- Line 9: `stone HTTP bus: :9431` — `stone` is the sending-stone HTTP bus served by storybook-daemon. Amputated.
- Line 21: "GPU availability for dragon-forge, local Ollama endpoint, Minecraft server address for dragon-cubed testing". Both `dragon-forge/` and `dragon-cubed/` were amputated from this repo.

This file does not conflict with AGENTS.md per se (AGENTS.md says nothing about any of this), but it references subsystems that AGENTS.md no longer documents. The user should update the template to reflect which sub-projects actually live in their external harness repos.

### Empty leftover directories from the amputation

`git rm` removed the tracked files but left empty-ish directories with untracked content on disk. These will confuse grep sweeps and `find` tools.

- `storybook-daemon/` — 180 KB, contains `internal/` and `quests/`. Untracked `storybook-daemon/.pi/agents/*.md` (17 ally agent files), `storybook-daemon/.claude/rules/go.md`.
- `psi/` — 33 MB, contains `psi/build/` (gitignored build output — `.gitignore:31`).
- `allies-parity/` — 38 MB, contains `runner/` including a full `node_modules/`.
- `dragon-cubed/` — 16 KB, effectively empty but listed in `.gitignore:29-35` for Gradle/build output.
- `berrygems/extensions/hoard-allies/` — 16 KB, one stray file (`/.claude/rules/typescript.md`).

Fix: `rm -rf storybook-daemon psi allies-parity dragon-cubed berrygems/extensions/hoard-allies` (after confirming any local unpushed work is preserved in the new external repos).

### Dangling `den/` planning archives for amputated subsystems

`den/features/` still holds planning for all the amputated subsystems: `dragon-daemon/`, `dragon-forge/`, `dragon-cubed-migration/`, `hoard-allies/`, `hoard-meta/`, `hoard-sending-stone/`. These total 149 hoard-reference lines.

- If `den/` is internal planning history (per root AGENTS.md:54, "not shipped"), this is fine as archive.
- But these planning docs cross-reference live code (e.g., `den/features/hoard-allies/AGENTS.md` linked from `morsels/skills/hoard-allies/SKILL.md:24` as `den/features/hoard-allies/AGENTS.md for details` — a live user-facing link into the archive).
- `den/features/hoard-meta/AGENTS.md:1-9` describes itself as "Cross-cutting hoard concerns — overall architecture, ethics, design reviews, and audit inventory." The subsystem it documents is gone.

Recommended: either move these into `den/features/archive/` with a dated prefix, or add a banner to each AGENTS.md marking the feature as extracted-to-external-repo.

## Tech Debt

### Berrygems

**Oversized extension files** (AGENTS.md §Structural Rules: "300+ lines in an extension file = split candidate"):

- `berrygems/extensions/dragon-digestion.ts` — 3155 lines, single `registerTool`. 10x the documented split threshold.
- `berrygems/extensions/dragon-parchment.ts` — 2048 lines. Panel API + implementation + kitty integration + image fetch integration in one file. Same file mentions three different `Symbol.for()` keys.
- `berrygems/extensions/dragon-review.ts` — 1574 lines.
- `berrygems/extensions/dragon-tongue.ts` — 1061 lines.
- `berrygems/extensions/dragon-scroll.ts` — 986 lines.
- `berrygems/extensions/dragon-guard/index.ts` — 829 lines (directory-form, but still oversized).
- `berrygems/extensions/kobold-housekeeping.ts` — 764 lines.
- `berrygems/extensions/dragon-inquiry.ts` — 761 lines.

Nine extensions exceed the 300-line threshold. Split candidates all.

**Legacy settings namespace fallback:**

- `berrygems/lib/settings.ts:25,74,117` reads `dotsPiEnhancements` as legacy fallback. The rename from `hoard.*` to `pantry.*` suggests a re-migration would be cleaner. Keeping two legacy namespaces indefinitely has a tail cost — every new setting needs a shim.

**`no any` policy vs grep reality:**

- AGENTS.md:219 forbids `any` without an explanatory comment. The inter-extension pattern `(globalThis as any)[Symbol.for(...)]` is everywhere (16+ files) and has no explanatory comment per occurrence. This is a convention the tooling can't enforce; the `as any` is typed-hole-by-design for dynamic dispatch. Either bless a typed helper (`getGlobal<T>(key: symbol): T | undefined`) in `lib/` or update AGENTS.md to exempt this specific pattern.

### Morsels

**Skills for amputated sub-packages still shipping** — see "Amputation Fallout" above. Active mis-routing risk, not passive debt.

**Redundancy between morsel teachers and berrygem source:**

- AGENTS.md:186 and morsels/AGENTS.md both state "Some morsels document specific berrygem APIs" (e.g., dragon-parchment, kitty-gif-renderer, kobold-housekeeping, extension-designer). Four skills whose contract is "stay in sync with berrygem code." No automated linkage check — only the `.claude/parity-map.json` + `stop-doc-sync.fish` hook, both currently broken per above.

### ETHICS.md

- Line 167 retains the hoard-era reflection passage. If the rename is pure (same persona, new repo name) this is fine. If the amputation is also an identity severance, this needs a rewrite. The document currently reads ambiguously on this point.

## Known Bugs

**`tsc --project berrygems/tsconfig.json` fails from pantry root:**

- `berrygems/extensions/dragon-breath/index.ts(20,50): error TS2307: Cannot find module '../lib/settings.ts'`.
- Root cause: `berrygems/tsconfig.json` doesn't `include` the nested `extensions/dragon-breath/index.ts` import paths correctly, or the relative `../lib/settings.ts` resolves one level too shallow for the subdirectory extension. Other subdir extensions (`dragon-guard/index.ts`, `dragon-websearch/index.ts`) import `../../lib/settings.ts` (two dots); `dragon-breath/index.ts:20` imports `../lib/settings.ts` (one dot).
- Fix: change `berrygems/extensions/dragon-breath/index.ts:20` from `"../lib/settings.ts"` to `"../../lib/settings.ts"`.
- Impact: AGENTS.md §Verification declares "one automated gate: tsc over the berrygems source." That gate is currently red. Any commit passing pre-commit by skipping the check ships broken.

## Fragile Areas

### Cross-extension communication via `globalThis` + `Symbol.for`

- Files: 16+ extensions use this pattern.
- Why fragile: no type safety on the globalThis slot. A publisher that renames its API surface has no compile-time way to notify consumers. The `hoard.*` → `pantry.*` key rename in this commit is a live example — every consumer site needed a manual edit. Three morsels still have the old key (listed above).
- Safe modification: introduce a typed registry in `berrygems/lib/` (`registry.ts` — `register<T>(key: symbol, api: T)` / `get<T>(key: symbol): T | undefined`). Migrate extensions one at a time. Not urgent, but the next rename will repeat the miss.
- Test coverage: none. AGENTS.md:82 admits "no Vitest, no eslint, no skill linter is wired up yet."

### Dragon-guard Ally Mode env-var surface

- Files: `berrygems/extensions/dragon-guard/index.ts:210-223`, `berrygems/extensions/dragon-guard/AGENTS.md:13,104,161`.
- Why fragile: Ally Mode is activated by env vars (`HOARD_GUARD_MODE`, `HOARD_ALLY_TOOLS`, etc.) set by the amputated `hoard-allies` berrygem. Nothing in this repo sets those vars anymore. The ally-mode code path is dead but still loaded on every pi startup. AGENTS.md:104 still documents `PI_SUBAGENT_DEPTH` as the bail-out mechanism for subagents, but the subagent producer is gone.
- Test coverage: manual only; guard mode changes are tested by `/reload` in pi.

### Symbolic-key string drift

- Files: berrygems extensions and morsels both hard-code `Symbol.for("pantry.*")` strings.
- Why fragile: 18 keys were renamed in this commit. A single missed string = broken inter-extension dispatch with no runtime error (the consumer just gets `undefined` and quietly no-ops). Three morsels survived the rename with old keys (see Amputation Fallout).
- Safe modification: centralize key names as exported constants in `berrygems/lib/` (e.g., `lib/globals.ts` exports `PARCHMENT_KEY = Symbol.for("pantry.parchment")`). Extensions import the constant instead of repeating the string. Morsels document the constant name, not the string literal.

### `.claude/` hook infrastructure

- Files: `.claude/hooks/*.fish`, `.claude/settings.json`, `.claude/parity-map.json`, `.claude/skills/hoard-verify/SKILL.md`, `.claude/agents/soul-reviewer.md`.
- Why fragile: all path-hardcoded to `/home/dot/Development/hoard/`. Every Stop hook and the PreToolUse hook will fail silently in this repo. The agent `soul-reviewer` will fail to read its binding contract because it reads from a dead path. Parity-check logic hard-codes `hoard-` / `hoard:ally-*` prefixes.
- Safe modification: scripted search-and-replace for `/home/dot/Development/hoard/` → `/home/dot/Development/pantry/`, then trim out the cc-plugin and daemon-specific logic.
- Test coverage: hooks are silent-failure by design; there's no verification loop.

## Security Considerations

### Settings file exposure

- Files: `berrygems/lib/settings.ts`.
- Risk: settings reader ingests `~/.pi/agent/settings.json` and `.pi/settings.json`. No schema validation on read. Malicious or corrupted settings can inject unexpected types into extension code paths.
- Current mitigation: most call sites use `readPantrySetting()` with a default value, so missing keys are safe. Type mismatches (e.g., a string where a number is expected) are not defended against.
- Recommendation: add a typebox or zod schema layer on top of `readPantrySetting()` for settings consumed by security-relevant extensions (dragon-guard's `dogAllowedTools`, `puppyAllowedTools` whitelists).

### Dragon-guard whitelist bypass surface

- Files: `berrygems/extensions/dragon-guard/index.ts`, `berrygems/extensions/dragon-guard/settings.ts`.
- Risk: `pantry.guard.dogAllowedTools` and `pantry.guard.puppyAllowedTools` are user-editable arrays. A compromised `~/.pi/agent/settings.json` could add arbitrary tools to the default-allow list. The amputated daemon used to set these via env vars for ally-mode; primary-session overrides are still settings-driven.
- Current mitigation: none — settings file permissions rely on OS-level `$HOME` isolation.
- Recommendation: log every tool added to the allow list on startup, emit a one-line nudge in the guard panel ("Puppy mode: 3 custom tools whitelisted"). Lets the user notice unexpected additions.

### Dead import paths in soul-reviewer

- File: `.claude/agents/soul-reviewer.md`.
- Risk: the agent reads `/home/dot/Development/hoard/ETHICS.md`. If that path is ever re-populated by an unrelated checkout, the agent would read a non-authoritative copy and produce misleading reviews. Low probability, non-zero.
- Current mitigation: the path is currently missing, so the agent fails to initialize. Protective by accident.
- Recommendation: delete the soul-reviewer agent entirely if the daemon it audits is gone. If the audit surface moves to an external repo, the agent lives there, not here.

## Performance Concerns

No runtime performance hotspots identified in the current scope. The oversized files (dragon-digestion.ts 3155 lines, dragon-parchment.ts 2048 lines) are JIT-loaded by pi via jiti — every `/reload` reparses them. Split-up files would marginally reduce reload latency but the real cost is cognitive, not CPU.

## Missing Critical Features

### Automated tests

- AGENTS.md:82 is explicit: "no Vitest, no eslint, no skill linter is wired up yet. Be honest about this."
- Problem: the one automated gate (`tsc`) is currently red (see Known Bugs). Nothing else validates behaviour.
- Blocks: any refactor larger than the amputation will be un-regression-testable.

### Symbol-key registry

- See Fragile Areas §Cross-extension communication. The next rename will miss call sites.

### Parity map alternative

- `.claude/parity-map.json` is dead. There's no equivalent surface for tracking which external harness repo each amputated subsystem lives in now. If a user asks "where did hoard-allies go?", the answer is not checked into this repo.

## Test Coverage Gaps

**Everything.** AGENTS.md:82 is explicit. Specific high-risk gaps:

- `berrygems/extensions/dragon-guard/` — permission gate enforcement has no test. Regressions here are user-impacting (false-allow or false-block of tool calls).
- `berrygems/lib/settings.ts` — legacy-fallback logic (`dotsPiEnhancements` → `pantry.*`) is untested. A breaking change here silently drops user settings.
- `berrygems/lib/id.ts` — ID generation has no test. Collision characteristics unverified.
- Morsels — no schema validation on `SKILL.md` frontmatter. AGENTS.md:109-111 specifies required fields but no linter enforces them.

Priority: High for dragon-guard (security-sensitive), Medium for settings (data loss), Low for id (probabilistic rather than correctness).

---

_Concerns audit: 2026-04-22_
