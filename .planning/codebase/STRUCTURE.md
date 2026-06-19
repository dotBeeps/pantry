# Codebase Structure

**Analysis Date:** 2026-04-22

## Directory Layout

```
pantry/
├── berrygems/                        Pi extensions (TypeScript) — SHIPPED
│   ├── extensions/                   17 extensions: 14 single-file + 3 directories
│   │   ├── dragon-breath/            Carbon + energy tracking (dir extension)
│   │   │   ├── index.ts
│   │   │   ├── ENERGY_CONSUMPTION_REFERENCE.md
│   │   │   └── ENERGY_RESEARCH.md
│   │   ├── dragon-guard/             Four-tier permission guard (dir extension)
│   │   │   ├── index.ts
│   │   │   ├── panel.ts
│   │   │   ├── settings.ts
│   │   │   ├── state.ts
│   │   │   ├── bash-patterns.ts
│   │   │   ├── AGENTS.md             Extension-specific conventions
│   │   │   └── README.md
│   │   ├── dragon-websearch/         Web search tool (dir extension)
│   │   │   └── index.ts
│   │   ├── dragon-curfew.ts          Session end-of-day curfew
│   │   ├── dragon-digestion.ts       Context compaction (3155 lines)
│   │   ├── dragon-herald.ts          Desktop notifications on agent_end
│   │   ├── dragon-image-fetch.ts     Image fetch service (globalThis API)
│   │   ├── dragon-inquiry.ts         Interactive prompt flows
│   │   ├── dragon-lab.ts             Experimental provider feature opt-in
│   │   ├── dragon-loop.ts            Agent-loop diagnostics
│   │   ├── dragon-musings.ts         Scratch/thinking notes
│   │   ├── dragon-parchment.ts       Floating panel manager (2048 lines)
│   │   ├── dragon-review.ts          Code review flow (1574 lines)
│   │   ├── dragon-scroll.ts          Todo list panel
│   │   ├── dragon-tongue.ts          Writing-tone surface
│   │   ├── kitty-gif-renderer.ts     Kitty-protocol GIF rendering
│   │   ├── kobold-housekeeping.ts    Repo housekeeping (764 lines)
│   │   └── hoard-allies/             Empty husk — index.ts removed in amputation
│   │       └── .claude/rules/typescript.md
│   ├── lib/                          Shared utilities (not loaded by pi directly)
│   │   ├── animated-image.ts
│   │   ├── animated-image-player.ts
│   │   ├── compaction-templates.ts
│   │   ├── cooldown.ts
│   │   ├── giphy-source.ts
│   │   ├── id.ts                     generateId() / generateShortId()
│   │   ├── lsp-client.ts
│   │   ├── panel-chrome.ts           Skins + borders for dragon-parchment panels
│   │   ├── pi-spawn.ts               Spawning sub-pi processes
│   │   ├── settings.ts               readPantrySetting() — canonical settings access
│   │   └── sse-client.ts
│   ├── styles/                       Writing-tone Markdown presets
│   │   ├── formal.md
│   │   ├── friendly.md
│   │   ├── minimal.md
│   │   ├── narrative.md
│   │   └── personality.md
│   ├── node_modules/                 Symlinks to pi packages (@mariozechner/*)
│   ├── tsconfig.json                 Type-check config — noEmit, resolves pi packages
│   ├── package.json                  Sub-package manifest (metadata only)
│   ├── pnpm-lock.yaml
│   └── AGENTS.md                     Extension-layer conventions
├── morsels/                          Pi skills (Markdown) — SHIPPED
│   ├── skills/                       56 skills, one directory each
│   │   ├── agent-init/SKILL.md
│   │   ├── api-design/SKILL.md
│   │   ├── astro/SKILL.md
│   │   ├── atproto/SKILL.md
│   │   ├── commit/SKILL.md
│   │   ├── database/SKILL.md
│   │   ├── defuddle/SKILL.md
│   │   ├── dependency-management/SKILL.md
│   │   ├── docker/SKILL.md
│   │   ├── dragon-guard/SKILL.md           Documents the dragon-guard berrygem
│   │   ├── dragon-image-fetch/SKILL.md     Documents the dragon-image-fetch berrygem
│   │   ├── dragon-parchment/SKILL.md       Documents the dragon-parchment berrygem
│   │   ├── extension-designer/             Meta-skill for authoring berrygems
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── fetch-stacks/SKILL.md
│   │   ├── fix/SKILL.md
│   │   ├── gdscript/SKILL.md
│   │   ├── git/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   │       ├── bisect-guide.md
│   │   │       └── rebase-patterns.md
│   │   ├── git-auth/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── github/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── github-actions/SKILL.md
│   │   ├── github-markdown/SKILL.md
│   │   ├── github-writing/
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── go/SKILL.md
│   │   ├── go-check/SKILL.md
│   │   ├── go-testing/SKILL.md
│   │   ├── go-tui/SKILL.md
│   │   ├── hoard-allies/SKILL.md           (retained; berrygem extracted)
│   │   ├── hoard-sending-stone/SKILL.md    (retained; berrygem extracted)
│   │   ├── init/SKILL.md
│   │   ├── init-stack/SKILL.md
│   │   ├── java/SKILL.md
│   │   ├── js-testing/SKILL.md
│   │   ├── kickstart/SKILL.md
│   │   ├── kitty-gif-renderer/SKILL.md     Documents the kitty-gif-renderer berrygem
│   │   ├── kobold-housekeeping/SKILL.md    Documents the kobold-housekeeping berrygem
│   │   ├── kotlin/SKILL.md
│   │   ├── minecraft-fabric/SKILL.md
│   │   ├── minecraft-modding/SKILL.md
│   │   ├── neoforge/SKILL.md
│   │   ├── pi-events/SKILL.md              Pi event-lifecycle reference
│   │   ├── pi-sessions/SKILL.md            Pi session-JSONL reference
│   │   ├── pi-tui/SKILL.md                 Pi TUI component reference
│   │   ├── python/SKILL.md
│   │   ├── python-testing/SKILL.md
│   │   ├── qt/SKILL.md
│   │   ├── qtqml/SKILL.md
│   │   ├── qtquick/SKILL.md
│   │   ├── quickshell/SKILL.md
│   │   ├── react/SKILL.md
│   │   ├── refactoring/SKILL.md
│   │   ├── research-and-fix/SKILL.md
│   │   ├── rust/SKILL.md
│   │   ├── skill-designer/                 Meta-skill for authoring morsels
│   │   │   ├── SKILL.md
│   │   │   └── references/
│   │   ├── spring-boot/SKILL.md
│   │   ├── typescript/SKILL.md
│   │   └── typescript-check/SKILL.md
│   ├── .claude-plugin/plugin.json          Claude Code plugin manifest
│   ├── package.json                        Sub-package manifest (metadata only)
│   └── AGENTS.md                           Skill-layer conventions
├── den/                              Planning workspace — NOT SHIPPED
│   ├── features/                     One directory per in-flight feature
│   ├── moments/
│   └── reviews/
├── .planning/                        GSD planning state
│   └── codebase/                     This codebase map
├── .claude/                          Claude Code config (rules, settings)
├── .pi/                              Local pi session state (gitignored)
├── node_modules/                     Root-level (symlink targets for berrygems)
├── package.json                      ROOT manifest — pi.extensions + pi.skills
├── AGENTS.md                         Authoritative repo grounding
├── AGENTS.override.md                Local-only overrides (gitignored)
├── CLAUDE.md                         Claude Code-specific additions
├── ETHICS.md                         Ethical contract — read first
├── README.md
└── .gitignore

Post-amputation remnants (not shipped, not referenced by any manifest —
see CONCERNS.md for cleanup recommendation):
├── storybook-daemon/                 Stray .pi/agents/*.md + .claude/rules/go.md
├── psi/build/                        Stray Qt/QML build artifacts
├── dragon-cubed/                     Single .pi/todos/dragon-cubed.md stub
└── allies-parity/runner/             Stray .pi/agents/*.md
```

## Directory Purposes

**`berrygems/extensions/`:**

- Purpose: Home for every pi extension pantry ships.
- Contains: Either a single `.ts` file (`dragon-herald.ts`) or a directory with `index.ts` plus co-located modules (`dragon-guard/index.ts`, `dragon-guard/panel.ts`, ...).
- Key files: `dragon-parchment.ts` (the panel hub every other panel-owner depends on), `dragon-guard/index.ts` (consent gate), `dragon-digestion.ts` (compaction), `dragon-lab.ts` (provider feature gate).
- Graduation rule: Single-file extensions graduate to directories when they reach `in-progress`; at that point they gain a code-side `AGENTS.md` documenting patterns, antipatterns, and inter-extension interactions (see `berrygems/extensions/dragon-guard/AGENTS.md`).

**`berrygems/lib/`:**

- Purpose: Shared helpers imported by extensions. Never loaded directly by pi.
- Contains: `settings.ts` (canonical settings reader — always use this), `id.ts` (ID generation — never `Math.random().toString(36)`), plus panel chrome, animated-image support, LSP client, SSE client, Giphy source, pi-spawn, cooldown helpers, and compaction templates.
- Key files: `settings.ts` (every extension reads settings through here), `id.ts`, `panel-chrome.ts`.
- Rule: Before writing any utility, `grep berrygems/lib/` for an existing solution; extract to `lib/` on second use (never duplicate with a justifying comment).

**`berrygems/styles/`:**

- Purpose: Writing-tone presets referenced by `pantry.tone.default` and per-context `pantry.tone.overrides`.
- Contains: `formal.md`, `friendly.md`, `minimal.md`, `narrative.md`, `personality.md` — Markdown descriptions of voice, not code. Selected at runtime by name, not imported.

**`berrygems/node_modules/`:**

- Purpose: Symlinks to pi packages so `tsc` can resolve `@earendil-works/pi-tui`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@sinclair/typebox`. Targets live in `~/.npm/lib/node_modules/mitsupi/node_modules/`. Repair procedure documented in `AGENTS.md:94–102`.
- Not committed in a meaningful sense — the symlinks are reconstructed when pi is reinstalled.

**`morsels/skills/`:**

- Purpose: One directory per skill. Pi discovers every immediate subdirectory and loads its `SKILL.md`.
- Contains: 56 skills covering git/github, language tooling (go, rust, python, typescript, java, kotlin, gdscript), framework tooling (react, astro, spring-boot, minecraft-fabric, neoforge, minecraft-modding, qt, qtqml, qtquick, quickshell), writing (github-markdown, github-writing), pi internals (pi-events, pi-sessions, pi-tui), berrygem API docs (dragon-guard, dragon-image-fetch, dragon-parchment, kitty-gif-renderer, kobold-housekeeping, hoard-allies, hoard-sending-stone), meta-skills for authoring (extension-designer, skill-designer), workflow skills (commit, fix, refactoring, research-and-fix, kickstart, init, init-stack, agent-init), and data/infra (database, docker, api-design, github-actions, dependency-management, atproto, defuddle, fetch-stacks).
- Key files: `skill-designer/SKILL.md` and `extension-designer/SKILL.md` are the meta-skills that govern how new morsels and berrygems are authored.

**`morsels/.claude-plugin/plugin.json`:**

- Purpose: Makes `morsels/` loadable as a Claude Code plugin in addition to a pi-package. Identifies the plugin name as `morsels` and marks it as "Loaded by pi directly and by Claude Code via this plugin manifest".

**`den/`:**

- Purpose: Internal planning workspace — not shipped with the installed package.
- Contains: `den/features/<name>/` per in-flight feature (research notes, plans, reviews, current-state `AGENTS.md`). Sibling `den/moments/` and `den/reviews/` hold free-form planning artifacts.

**`.planning/`:**

- Purpose: Output of `/gsd-*` commands. `.planning/codebase/` holds this codebase map.

**`.claude/`:**

- Purpose: Claude Code-specific config (rules copied from `~/.claude/` by SessionStart hooks, plus project-specific rules in `.claude/rules/testing.md` and `.claude/rules/context7.md`).
- Gitignore rule: `**/.claude/rules/*` is ignored; only `testing.md` and `context7.md` are whitelisted for commit (see `.gitignore`).

**`.pi/`:**

- Purpose: Local pi session state for this repo. Gitignored.

## Key File Locations

**Root manifest:**

- `/home/dot/Development/pantry/package.json` — declares `pi.extensions: ["berrygems/extensions"]` and `pi.skills: ["morsels/skills"]`. This is how pi discovers content.

**Extension loading surfaces (pi walks these paths):**

- `/home/dot/Development/pantry/berrygems/extensions/*.ts` — every single-file extension.
- `/home/dot/Development/pantry/berrygems/extensions/*/index.ts` — every multi-file extension entry.

**Skill loading surfaces:**

- `/home/dot/Development/pantry/morsels/skills/*/SKILL.md` — every skill.

**Core utility files every extension author should know:**

- `/home/dot/Development/pantry/berrygems/lib/settings.ts` — `readPantrySetting`, `readProjectPantrySetting`, `writeProjectPantrySetting`, `readPantryKey`, `keyLabel`.
- `/home/dot/Development/pantry/berrygems/lib/id.ts` — ID generation.
- `/home/dot/Development/pantry/berrygems/lib/panel-chrome.ts` — panel skins and border rendering.

**Cross-extension hubs (publishers that other extensions depend on):**

- `/home/dot/Development/pantry/berrygems/extensions/dragon-parchment.ts` — `Symbol.for("pantry.parchment")`; every panel-owning extension consumes this.
- `/home/dot/Development/pantry/berrygems/extensions/dragon-breath/index.ts` — `Symbol.for("pantry.breath")`.
- `/home/dot/Development/pantry/berrygems/extensions/dragon-lab.ts` — `Symbol.for("pantry.lab")`.
- `/home/dot/Development/pantry/berrygems/extensions/dragon-image-fetch.ts` — `Symbol.for("pantry.imageFetch")`.
- `/home/dot/Development/pantry/berrygems/extensions/kitty-gif-renderer.ts` — `Symbol.for("pantry.kitty")`.

**Verification / dev config:**

- `/home/dot/Development/pantry/berrygems/tsconfig.json` — `noEmit: true`, `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `allowImportingTsExtensions: true`, `include: ["extensions/**/*.ts", "lib/**/*.ts"]`. Paths map `@mariozechner/*` and `@sinclair/typebox` to `../node_modules/...`.

**Grounding documents:**

- `/home/dot/Development/pantry/AGENTS.md` — authoritative repo conventions (layout, verification, inter-extension patterns, settings namespace, contributor identity).
- `/home/dot/Development/pantry/ETHICS.md` — ethical contract; read before consent/privacy/memory work.
- `/home/dot/Development/pantry/CLAUDE.md` — Claude Code-specific additions.
- `/home/dot/Development/pantry/README.md` — user-facing overview.
- `/home/dot/Development/pantry/berrygems/AGENTS.md` — extension-layer conventions.
- `/home/dot/Development/pantry/morsels/AGENTS.md` — skill-layer conventions.
- `/home/dot/Development/pantry/berrygems/extensions/dragon-guard/AGENTS.md` — example of a graduated extension's inner conventions.

## Naming Conventions

**Files (berrygems):**

- Extensions: kebab-case, always `dragon-<name>.ts`, `kitty-<name>.ts`, `kobold-<name>.ts`, or `hoard-<name>.ts` — the prefix loosely categorizes by creature (dragon = core dragon capabilities, kitty = kitty-terminal-protocol, kobold = repo/housekeeping, hoard = ally/spawn coordination). The prefix is a flavor cue, not a typed taxonomy.
- Library modules: kebab-case noun or noun-phrase (`settings.ts`, `panel-chrome.ts`, `animated-image-player.ts`).
- Tone files: single lowercase word in `berrygems/styles/` (`formal.md`, `friendly.md`, `minimal.md`, `narrative.md`, `personality.md`).

**Files (morsels):**

- Skill directories: lowercase-hyphenated, must equal the `name:` frontmatter field (`morsels/skills/commit/` → `name: commit`, `morsels/skills/github-markdown/` → `name: github-markdown`). Enforced by convention in `morsels/AGENTS.md:40–50`.
- Skill body: always `SKILL.md` (uppercase filename).
- Overflow content: `<skill>/references/` subdirectory with arbitrary `.md` filenames (e.g. `git/references/bisect-guide.md`, `git/references/rebase-patterns.md`).

**Directories (extensions):**

- Multi-file extensions use the same kebab-case name as their single-file siblings (`dragon-breath/`, `dragon-guard/`, `dragon-websearch/`).
- Entry is always `index.ts`; co-located modules share the directory (`dragon-guard/panel.ts`, `dragon-guard/state.ts`, `dragon-guard/settings.ts`, `dragon-guard/bash-patterns.ts`). A graduated extension also gains `AGENTS.md` and often `README.md`.

**Settings namespace:**

- All settings live under `pantry.<area>.<key>` in `~/.pi/agent/settings.json`. Nested tiers: `pantry.panels.*`, `pantry.guard.*`, `pantry.digestion.*`, `pantry.todos.*`, `pantry.contributor.*`, `pantry.tone.*`, `pantry.herald.*`, `pantry.lab.*` (see the legacy map at `berrygems/lib/settings.ts:76–108` for the complete set that has a legacy fallback).
- Legacy flat keys under `dotsPiEnhancements.*` remain readable via the migration map in `berrygems/lib/settings.ts`.

**Cross-extension symbols:**

- Always `Symbol.for("pantry.<name>")` — never bare strings. Current registrants: `pantry.parchment`, `pantry.kitty`, `pantry.breath`, `pantry.imageFetch`, `pantry.lab`.

**TypeScript conventions (what tooling does not catch):**

- Tabs for indentation, double quotes, semicolons (per `berrygems/AGENTS.md:96–97`).
- `satisfies` over `as`; `any` requires an explanatory comment.
- Tool registrations: always include `promptSnippet` and `promptGuidelines` alongside `name`/`description`/`parameters` (see `berrygems/AGENTS.md:44–60`).
- `> 4` function parameters → options object, no exceptions.

**Feature lifecycle emoji (used in inventory tables):**

- 💭 idea → 📜 researched → 🥚 planned → 🐣 in-progress → 🔥 beta → 💎 complete (see `AGENTS.md:28–38`).

## Where to Add New Code

**New pi extension (single file):**

- File: `/home/dot/Development/pantry/berrygems/extensions/<creature-name>.ts`.
- Naming: pick a prefix that matches the feature's register — `dragon-*` for core capabilities, `kitty-*` for kitty-protocol-specific rendering, `kobold-*` for housekeeping/repo tooling.
- Shape: `export default function (pi: ExtensionAPI) { /* register tools, commands, listeners */ }`.
- Settings: read through `readPantrySetting` from `../lib/settings.ts`, placing keys under a new `pantry.<name>.*` subtree.
- Cross-extension API (if needed): publish at `(globalThis as any)[Symbol.for("pantry.<name>")]` inside the default function body.
- Tests: there is no test framework; verify manually with `/reload` in pi.
- Co-ship: add or update a `morsels/skills/<name>/SKILL.md` when the extension exposes tools or commands (the "skills and code co-ship" rule from `AGENTS.md:235`).

**New pi extension (multi-file — when it grows beyond one file):**

- Directory: `/home/dot/Development/pantry/berrygems/extensions/<name>/`.
- Entry: `index.ts` with the default-export function.
- Co-located modules: split by responsibility, not by type (`panel.ts`, `state.ts`, `settings.ts`, `<domain>.ts`).
- Add `AGENTS.md` inside the directory once the extension reaches `in-progress`, documenting inter-extension boundaries and antipatterns (template: `berrygems/extensions/dragon-guard/AGENTS.md`).
- Trigger to graduate from single file: 300+ lines, or reaching `in-progress` status, whichever comes first.

**New shared library utility:**

- File: `/home/dot/Development/pantry/berrygems/lib/<name>.ts`.
- Before creating: `grep -r berrygems/lib/` for an existing solution.
- Rule: extract to `lib/` only on second use. Never duplicate a utility with a justifying comment — that is explicitly disallowed by `AGENTS.md:225`.

**New skill:**

- Directory: `/home/dot/Development/pantry/morsels/skills/<name>/` (lowercase-hyphenated, matches the `name:` frontmatter field).
- File: `SKILL.md` with YAML frontmatter (`name`, `description`, `license: MIT`; `compatibility` only if pi-specific or tool-dependent).
- Keep body ≤500 lines; overflow into `morsels/skills/<name>/references/*.md`.
- If the skill documents a berrygem API, mirror the berrygem's name in the skill directory (e.g. `morsels/skills/dragon-parchment/` for `berrygems/extensions/dragon-parchment.ts`).

**New writing tone:**

- File: `/home/dot/Development/pantry/berrygems/styles/<name>.md`. Add to the documented tone presets list in `AGENTS.md`; no code change needed — tones are selected by name from settings.

**New planning artifact:**

- Directory: `/home/dot/Development/pantry/den/features/<feature-name>/`.
- Contains: `AGENTS.md` for current state, plus any research/plan/review documents. Never shipped.

**New GSD plan:**

- Location: `/home/dot/Development/pantry/.planning/` — managed by `/gsd-*` commands.

## Special Directories

**`berrygems/node_modules/`:**

- Purpose: Symlink farm pointing at pi's installed packages so `tsc` resolves `@mariozechner/*` and `@sinclair/typebox`.
- Generated: Yes (reconstructed from `~/.npm/lib/node_modules/mitsupi/node_modules/` per the repair recipe in `AGENTS.md:94–102`).
- Committed: Ignored via root `.gitignore` (`node_modules/`).

**`.pi/`:**

- Purpose: Local pi session/agent state for this repo.
- Generated: Yes.
- Committed: No — gitignored (`.pi/` in `.gitignore`).

**`.claude/`:**

- Purpose: Claude Code config.
- Generated: Partially — `.claude/rules/*` is populated by SessionStart hooks from `~/.claude/`.
- Committed: Selectively — `.gitignore` blocks most `.claude/` paths and whitelists only `.claude/rules/testing.md` and `.claude/rules/context7.md`.

**`morsels/.claude-plugin/`:**

- Purpose: Claude Code plugin manifest so `morsels/` can be loaded by Claude Code in addition to pi.
- Generated: No — hand-authored `plugin.json`.
- Committed: Yes.

**`storybook-daemon/`, `psi/`, `dragon-cubed/`, `allies-parity/`:**

- Purpose: None — these are husks left in the tree after the 2026-04-22 daemon-scope amputation. They contain only stray `.pi/agents/*.md`, `.claude/rules/*.md`, and (for `psi/`) a Qt `build/` tree. Nothing in the pi manifest, no shipped code, and no documentation references their contents.
- Generated: No.
- Committed: Currently yes, but flagged for cleanup (see CONCERNS.md).

**`berrygems/extensions/hoard-allies/`:**

- Purpose: Would have been the ally-dispatch extension, but its `index.ts` was removed in the amputation (commit `b9c5050`). Only a stray `.claude/rules/typescript.md` remains; the directory is effectively empty as an extension and does nothing at pi load time.
- Generated: No.
- Committed: Yes, but flagged for deletion (see CONCERNS.md).

**`AGENTS.override.md`:**

- Purpose: Local-only grounding overrides for the repo owner's environment.
- Generated: No.
- Committed: No — listed in `.gitignore`.

---

_Structure analysis: 2026-04-22_
