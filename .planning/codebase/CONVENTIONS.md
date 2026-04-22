# Coding Conventions

**Analysis Date:** 2026-04-22

Pantry is a two-package pi-package: `berrygems/` (TypeScript extensions loaded by pi via jiti with no build step) and `morsels/` (Markdown skills). The ground truth for conventions is `AGENTS.md` (root), `berrygems/AGENTS.md`, and `morsels/AGENTS.md`. Tooling enforcement is minimal — `tsc` over `berrygems/tsconfig.json` is the only automated gate.

## Naming Patterns

**Files (berrygems):**

- Single-file extensions: `extensions/<dragon|kitty|kobold>-<feature>.ts` — themed lowercase-hyphenated names.
  - Examples: `berrygems/extensions/dragon-curfew.ts`, `berrygems/extensions/dragon-parchment.ts`, `berrygems/extensions/kitty-gif-renderer.ts`, `berrygems/extensions/kobold-housekeeping.ts`.
- Multi-file extensions: `extensions/<name>/index.ts` + siblings (`panel.ts`, `settings.ts`, `state.ts`, `bash-patterns.ts`, `AGENTS.md`).
  - Examples: `berrygems/extensions/dragon-guard/`, `berrygems/extensions/dragon-breath/`, `berrygems/extensions/dragon-websearch/`.
- Shared libs: `berrygems/lib/<kebab-name>.ts` — purpose-named, no theming.
  - Examples: `berrygems/lib/settings.ts`, `berrygems/lib/id.ts`, `berrygems/lib/cooldown.ts`, `berrygems/lib/panel-chrome.ts`, `berrygems/lib/pi-spawn.ts`.
- Writing-tone files: `berrygems/styles/<tone>.md` (`formal.md`, `friendly.md`, `minimal.md`, `narrative.md`, `personality.md`).

**Files (morsels):**

- One directory per skill: `morsels/skills/<skill-name>/SKILL.md`. `<skill-name>` is lowercase-hyphenated and MUST match the `name:` frontmatter field.
- Overflow material lives in `morsels/skills/<skill-name>/references/`.

**Functions and variables:**

- `camelCase` for functions and locals. Example from `berrygems/extensions/dragon-curfew.ts`:
  ```typescript
  function getCurfewSettings(): { enabled: boolean; startHour: number; endHour: number } { … }
  function isCurfewHour(now: Date, startHour: number, endHour: number): boolean { … }
  function getNightKey(now: Date, startHour: number): string { … }
  ```
- Module-scoped constants: `UPPER_SNAKE_CASE`.
  - `berrygems/extensions/dragon-curfew.ts:31-32`: `const CONFIRM_PHRASE = "confirm-curfew-override";` and `const NAG_INTERVAL = 5;`.
  - `berrygems/lib/settings.ts:24-25`: `const PANTRY_NAMESPACE = "pantry";`, `const LEGACY_NAMESPACE = "dotsPiEnhancements";`.
- Symbol keys for globalThis API publication: `UPPER_SNAKE_CASE` const holding `Symbol.for("pantry.<namespace>")`.
  - `berrygems/extensions/dragon-parchment.ts:220`: `const API_KEY = Symbol.for("pantry.parchment");`
  - `berrygems/extensions/dragon-lab.ts:67`: `const LAB_KEY = Symbol.for("pantry.lab");`
  - `berrygems/extensions/kitty-gif-renderer.ts:94`: `const API_KEY = Symbol.for("pantry.kitty");`
  - `berrygems/extensions/dragon-image-fetch.ts:50`: `const API_KEY = Symbol.for("pantry.imageFetch");`
  - Consumer-side keys end in `_KEY`: `PANELS_KEY`, `KITTY_KEY`, `IMAGE_FETCH_KEY` (see `berrygems/extensions/dragon-scroll.ts:38-45`).

**Symbol.for namespace — post-rename:**

- All cross-extension handles use the `pantry.<name>` prefix. Old `hoard.*` or `dotsPi.*` keys are gone from the source tree.
- Registered publishers discovered in the tree:
  - `pantry.parchment` — floating panel authority (`dragon-parchment`)
  - `pantry.kitty` — Kitty graphics / animated image rendering (`kitty-gif-renderer`)
  - `pantry.imageFetch` — image fetch helpers (`dragon-image-fetch`)
  - `pantry.breath` — carbon / energy tracking (`dragon-breath/index.ts:442-486`)
  - `pantry.lab` — experimental provider feature registry (`dragon-lab`)
- Consumers always go through a local `_KEY` constant, never inline `Symbol.for(…)` at the call site.

**Settings keys — post-rename:**

- All settings live under the top-level `pantry.*` namespace in `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project).
- Access is exclusively via `readPantrySetting<T>(path, fallback)` or `readProjectPantrySetting<T>(cwd, path, fallback)` from `berrygems/lib/settings.ts` — never hand-roll JSON parsing.
- Dotted-path keys, tiered by extension:
  - `pantry.curfew.enabled`, `pantry.curfew.startHour`, `pantry.curfew.endHour`
  - `pantry.herald.enabled`, `pantry.herald.title`, `pantry.herald.method`, `pantry.herald.minDuration`
  - `pantry.panels.keybinds.close`, `pantry.panels.keybinds.unfocus`, `pantry.panels.focusKey`
  - `pantry.guard.autoDetect`, `pantry.guard.complexityThreshold`, `pantry.guard.llmSummaries`, `pantry.guard.dogAllowedTools`, `pantry.guard.puppyAllowedTools`, `pantry.guard.{dragon|puppy|dog|panel}Key`
  - `pantry.digestion.triggerMode`, `pantry.digestion.triggerPercentage`, `pantry.digestion.triggerFixed`, `pantry.digestion.strategy`, `pantry.digestion.copyGlobalKey`
  - `pantry.todos.gifVibePrompt`, `pantry.todos.gifRating`, `pantry.todos.gifSize`
  - `pantry.contributor.name`, `pantry.contributor.email`, `pantry.contributor.trailerFormat`, `pantry.contributor.transparencyFormat`, `pantry.contributor.includeModel`
  - `pantry.tone.default`, `pantry.tone.overrides`
  - `pantry.lab.*`
- Legacy `dotsPiEnhancements.<flatKey>` lookups still resolve as a migration fallback via the `LEGACY_MAP` in `berrygems/lib/settings.ts:76-108`. New keys MUST be added under `pantry.*`; do not add legacy entries.

**Types and interfaces:**

- `PascalCase` for exported interfaces and types.
  - `berrygems/extensions/dragon-parchment.ts`: `PanelContext`, `PanelComponent`, `PanelAnchorRef`, `AnchorSpec`, `PanelCreateOptions`.
  - `berrygems/extensions/dragon-lab.ts`: `LabFeature`, `DragonLabAPI`.
- `type` for unions / aliases; `interface` for object shapes intended for consumer implementation or extension.

## Code Style

**Formatting:**

- No `.prettierrc`, no `.eslintrc`, no `biome.json`, no `tsconfig` `lint` hooks are checked in. `berrygems/AGENTS.md:94-98` claims “Tabs for indentation, double quotes, semicolons” but **the tree is mixed**:
  - Spaces (2-space) dominate extension files: `dragon-curfew.ts`, `dragon-digestion.ts`, `dragon-herald.ts`, `dragon-image-fetch.ts`, `dragon-inquiry.ts`, `dragon-lab.ts`, `dragon-musings.ts`, `dragon-parchment.ts`, `dragon-scroll.ts`, `dragon-tongue.ts`, `kitty-gif-renderer.ts`, `kobold-housekeeping.ts`, `dragon-breath/index.ts`, `dragon-guard/index.ts`, `dragon-guard/panel.ts`, `dragon-guard/settings.ts`, `dragon-websearch/index.ts`, `berrygems/lib/settings.ts`, `berrygems/lib/id.ts`, `berrygems/lib/giphy-source.ts`, `berrygems/lib/pi-spawn.ts`.
  - Tabs in: `dragon-loop.ts`, `dragon-review.ts`, `dragon-guard/bash-patterns.ts`, `dragon-guard/state.ts`, `berrygems/lib/animated-image.ts`, `berrygems/lib/animated-image-player.ts`, `berrygems/lib/compaction-templates.ts`, `berrygems/lib/cooldown.ts`, `berrygems/lib/lsp-client.ts`, `berrygems/lib/panel-chrome.ts`, `berrygems/lib/sse-client.ts`.
  - **Rule for new code:** match the surrounding file. When creating a new file, use 2-space indentation — it matches the larger cohort and all recently-edited (April) extensions.
- Double quotes everywhere; semicolons terminate every statement.
- Trailing commas in multiline literals and parameter lists (see any recent extension).

**Linting:**

- None wired up. `tsc --project berrygems/tsconfig.json` is the only automated gate (`AGENTS.md:82-89`).
- `noUnusedLocals`, `noUnusedParameters`, and `strict: true` are all on in `berrygems/tsconfig.json:4-11`, so the compiler catches dead bindings and implicit-any.

**TypeScript specifics:**

- `satisfies` over `as` for literal typing.
  - `berrygems/extensions/dragon-guard/state.ts:103`: `} satisfies PersistedState);`
  - `berrygems/lib/panel-chrome.ts:104-185`: a stack of `} satisfies PanelSkin,` declarations.
- Avoid `as any`. The repo currently allows it **only** around globalThis interop and pi API edges where types aren't exported cleanly, e.g.:
  - `berrygems/extensions/dragon-guard/index.ts:58`: `function getPanels(): any { return (globalThis as any)[PANELS_KEY]; }` — note the explicit reason (consumer-side handle).
  - `berrygems/extensions/dragon-websearch/index.ts:219`: `(pi.registerTool as any)({…})` — pi API shape mismatch.
  - `berrygems/lib/settings.ts:228-230`: `readPantryKey` returns `any` to avoid cast noise at call sites ("avoids string → KeyId cast noise everywhere").
- `unknown` + narrowing for untrusted input, e.g. `berrygems/lib/settings.ts:44,60-68` walks `Record<string, unknown>` through `resolvePath` without trusting the shape.
- `noUnusedLocals`/`noUnusedParameters` are on — prefix unused params with `_` if you must keep the signature.
- Prefer `import type { … }` for pure-type imports (e.g. `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";` in every extension).

## Import Organization

Observed order across extension files (see `berrygems/extensions/dragon-curfew.ts:23-27`, `berrygems/extensions/dragon-parchment.ts:19-33`):

1. **External / pi packages first**, starting with type-only imports:
   ```typescript
   import type {
     ExtensionAPI,
     ToolCallEventResult,
   } from "@mariozechner/pi-coding-agent";
   import type {
     OverlayAnchor,
     OverlayHandle,
     TUI,
   } from "@mariozechner/pi-tui";
   import { matchesKey, isKeyRelease, isKeyRepeat } from "@mariozechner/pi-tui";
   import { StringEnum } from "@mariozechner/pi-ai";
   import { Type, type Static } from "@sinclair/typebox";
   ```
2. **Node stdlib** (only when needed): `import { execSync } from "node:child_process";`, `import { readFileSync, existsSync } from "node:fs";`. Always use the `node:` prefix.
3. **Relative imports from `../lib/`** (extensions) or `./<sibling>.ts` (multi-file extensions):
   ```typescript
   import {
     readPantrySetting,
     readPantryKey,
     keyLabel,
   } from "../lib/settings.ts";
   import {
     setDefaultSkin,
     getSkin,
     type PanelSkin,
   } from "../lib/panel-chrome.ts";
   ```

- **Always include the `.ts` extension** in relative imports — pi's jiti loader and `tsconfig.json`'s `allowImportingTsExtensions: true` require it.

**Path aliases (tsconfig, not consumer-facing):**

- Defined in `berrygems/tsconfig.json:13-17` to resolve `@mariozechner/pi-*` and `@sinclair/typebox` through the symlinks at `berrygems/node_modules/`.
- There are no `@/` or app-level aliases — relative paths within `berrygems/` only.

## Shared-Library-First Rule

From `AGENTS.md:224-230` and `berrygems/AGENTS.md`:

- Before writing a utility, `grep berrygems/lib/` for an existing solution. On the second use, extract to `berrygems/lib/` — never duplicate with a comment.
- `readPantrySetting()` from `berrygems/lib/settings.ts` for **all** settings access. Never hand-roll JSON parsing.
- `generateShortId()` / `generateId()` / `generatePrefixedId(prefix)` from `berrygems/lib/id.ts` (which wraps `node:crypto.randomUUID()`). Never `Math.random().toString(36)`.
- Available libs (in `berrygems/lib/`): `settings`, `id`, `cooldown`, `pi-spawn`, `panel-chrome`, `compaction-templates`, `animated-image`, `animated-image-player`, `giphy-source`, `sse-client`, `lsp-client`.
- Absent from the current tree (documented elsewhere but removed): `ally-taxonomy`, `local-server` are referenced in `AGENTS.md:230` but not present under `berrygems/lib/` post-amputation.

## Immutability

- No established mutation-vs-new-copy rule in code; many internal helpers use mutable locals (e.g. date adjustment in `berrygems/extensions/dragon-curfew.ts:83-88` with `anchor.setDate(...)`), but public API surfaces return fresh objects (`CooldownTracker.activeKeys()` at `berrygems/lib/cooldown.ts:44` builds a new array).
- `CooldownTracker` (`berrygems/lib/cooldown.ts`) encapsulates a `Map` behind methods — callers never see the internal state.
- Pi sessions are immutable JSONL trees; the guidance from `AGENTS.md:153-156` is **never store state in external files** — use `ctx.sessionManager.getBranch()` reconstruction or tool-result `details` / `pi.appendEntry()`. Breaking branching by touching external files is the primary immutability constraint here.

## Error Handling

No `thiserror`/`anyhow` equivalents or structured error library. The codebase uses plain `try/catch` with **swallow-and-default** semantics for non-critical paths:

- `berrygems/lib/settings.ts:44-54` — `parseJsonFile` returns `null` on any parse failure:
  ```typescript
  function parseJsonFile(path: string): Record<string, unknown> | null {
    try {
      if (!existsSync(path)) return null;
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  ```
- `berrygems/lib/settings.ts:190-220` — `writeProjectPantrySetting` returns `true`/`false`; any failure short-circuits to `false` silently. Callers treat failures as "not persisted, use in-memory."
- `berrygems/extensions/dragon-herald.ts:52-55,145-155` — best-effort desktop notification; failure to dispatch is non-fatal and uses `} catch {`.
- `berrygems/extensions/dragon-guard/index.ts:98-103` — JSON stringify of tool input falls back to `'{"error":"unserializable input"}'` rather than throwing.

Conventions:

- **Never throw across an extension boundary** — pi events must not crash the loop.
- **No `tracing` crate equivalent**; `pi.appendEntry()` / session events are the transport when you need observability. `console.log` is not used in production paths.
- `console.debug(…)` appears only in best-effort background paths (`berrygems/extensions/dragon-image-fetch.ts:443`, `berrygems/lib/giphy-source.ts:363`) and is the ceiling — never `console.log` / `console.error` / `console.warn` in extension code.
- Structured context: prefix `console.debug` messages with `[<extension-name>]` for filterability.

## Logging

- No logging framework. Pi's session model IS the log — use `pi.appendEntry()` or attach detail to tool result `details` per `AGENTS.md:153-156`.
- Do not add ad-hoc log files — they break session branching.
- `console.debug` with a bracketed tag (`[dragon-image-fetch]`, `[giphy-source]`) is the only direct-stdout pattern tolerated, and only for failures that would otherwise be silent.

## Comments

**File header convention:** Every extension opens with a JSDoc-style banner. Pattern from `berrygems/extensions/dragon-curfew.ts:1-21`:

```typescript
/**
 * Dragon Curfew — <one-line tagline>
 *
 * <2–6 paragraphs of what it does, when it triggers, what it consumes>
 *
 * Configurable via pantry.<namespace>.* in ~/.pi/agent/settings.json:
 *  - <key> (default: <value>)
 *
 * A small dog designed this from inside a very warm dragon.
 * The dragon let her. This was a mistake.
 */
```

- Tagline + purpose + settings list + a personality sign-off is the canonical shape (see `dragon-parchment.ts:1-17`, `dragon-lab.ts:1-12`, `dragon-herald.ts:1-22`).
- `// ── <Section> ──` horizontal rules partition long files (`// ── Constants ──`, `// ── Settings ──`, `// ── Time Helpers ──`, `// ── Public API ──`). Consistent across the codebase.
- JSDoc `/** … */` on exported functions and interfaces, inline `//` for section headers and brief notes.
- Emoji in comments and strings is normal (dragon personality) — do not strip it.

## Function Design

- **>4 parameters → options object, no exceptions** (`AGENTS.md:235`). See `PanelCreateOptions` in `berrygems/extensions/dragon-parchment.ts:92-100`.
- Small focused helpers are preferred (compare `isCurfewHour`, `formatTime`, `formatHour`, `getNightKey` each as separate functions in `dragon-curfew.ts:62-91`).
- **300+ lines in an extension file = split candidate** (`AGENTS.md:234`). `dragon-digestion.ts` (108KB), `dragon-parchment.ts` (65KB), `dragon-review.ts` (60KB) are current exceptions; new work should split at the 300-line line.
- **One tool registration per file** — `pi.registerTool(…)` appears once per extension file (`dragon-inquiry.ts:161`, `dragon-tongue.ts:892`, `kobold-housekeeping.ts:561`, etc.).
- Every `pi.registerTool()` call MUST include `promptSnippet` and `promptGuidelines` — see the template in `berrygems/AGENTS.md:44-58`. Without them, pi omits the tool from the system prompt.

## Module Design

- Extensions publish APIs on `globalThis` keyed by `Symbol.for("pantry.<name>")`, **never** via direct cross-extension imports (`AGENTS.md:164-174`, `berrygems/AGENTS.md:29-41`). Each extension gets its own jiti module context; direct imports would create duplicate state.
- Shared logic for multiple extensions lives in `berrygems/lib/` and is imported via relative paths.
- Multi-file extensions graduate from single `foo.ts` to `foo/index.ts` + siblings when they hit `in-progress` state, at which point the directory gains its own `AGENTS.md` (`AGENTS.md:237`).
- **Export shape:** extensions export a single default or named function invoked by pi; libs export named functions and types. No barrel / re-export files in `berrygems/lib/`.

## Skills (morsels) Conventions

- Compliant with [agentskills.io](https://agentskills.io) open standard (`morsels/AGENTS.md:34`).
- **Required frontmatter** (`morsels/AGENTS.md:45-48`):
  ```yaml
  ---
  name: skill-name # lowercase-hyphenated, MUST match directory
  description: "What the skill does AND when to use it. Include trigger keywords. Max 1024 chars."
  license: MIT # always MIT for pantry morsels
  ---
  ```
- **Optional frontmatter**: `compatibility: "Designed for Pi (pi-coding-agent)"` for pi-specific skills, or `"Requires rbw (Bitwarden CLI)"` for env-gated skills.
- **SKILL.md under 500 lines** — overflow goes to `references/` (see `morsels/skills/git/references/`, `morsels/skills/git-auth/references/`, `morsels/skills/github/references/`, `morsels/skills/skill-designer/references/`).
- **description drives discovery** — agents use it to decide when to load the skill; be specific about trigger conditions and keywords.

## Scripting

- **fish, not bash.** Snippets in project docs use fish syntax (`AGENTS.md:220`). Example from `AGENTS.md:86-88`:
  ```fish
  cd /home/dot/Development/pantry; and tsc --project berrygems/tsconfig.json
  ```
- Symlink repair block in `berrygems/AGENTS.md:83-92` also uses `set VAR value` / `ln -sf` — fish idioms.

## Commit Conventions

From `AGENTS.md:254-263` and mirrored in `morsels/skills/commit/SKILL.md`:

**Format:** `<type>(<scope>): <summary>`

- **Types:** `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `perf`, `style`, `ci`.
  - `feat` — new skills or extensions.
  - `fix` — bug fixes.
  - `docs` — README or skill content updates.
  - `refactor` — restructuring without behavior change.
- **Scope:** name of the skill, extension, or lib module (`dragon-curfew`, `parchment`, `settings`, `allies`). Detect via `git log -n 30 --pretty=format:%s` to match existing patterns.
- **Summary:** ≤72 chars, imperative mood, no trailing period.
- **Body:** optional; use when the _why_ isn't obvious. Blank line between subject and body. No `Signed-off-by`, no breaking-change footers.

**Recent examples from `git log`:**

```
chore!: amputate daemon scope, rename hoard → pantry
docs(planning): map existing hoard codebase
docs(plans): add 🪦 abandonment banners to archived pre-pivot plans
docs(plans): archive shipped + abandoned plans, clear the plans/ dir
```

**AI Attribution** (`morsels/skills/commit/SKILL.md:57-82`):

When pantry's `pantry.contributor.*` settings are configured, append a `Co-authored-by` trailer on a final blank-line-separated line. If `includeModel` is true, embed the current model id:

```
Co-authored-by: Ember 🐉 [claude-sonnet-4] <ember-ai@dotbeeps.dev>
```

If `pantry.contributor.*` is absent, **do not** add AI attribution — the user hasn't configured it. Do not use global git attribution rules to synthesize one.

**Never push from commit workflows** — the `commit` skill explicitly says "Only commit — do not push." Push is a separate, explicit step.

## Pre-Commit Checklist

From `AGENTS.md:113-117`:

1. `tsc --project berrygems/tsconfig.json` — zero errors.
2. Test extension changes with `/reload` in pi.
3. Skill frontmatter valid: `name` matches directory, `description` + `license: MIT` present; pi-specific skills have `compatibility` set.

---

_Convention analysis: 2026-04-22_
