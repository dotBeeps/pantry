# Architecture

**Analysis Date:** 2026-04-22

## Pattern Overview

**Overall:** Pi-package — a monorepo of authored _content_ that the [pi](https://github.com/badlogic/pi-mono) coding-agent harness loads at session start. Pantry itself is not an application and has no runtime, no daemon, and no executable entry point. It is two directories of content registered under the `pi` field of the root `package.json`, discovered by the pi harness after `pi install`.

**Key Characteristics:**

- **Two shipped packages, one manifest.** `berrygems/extensions/` (TypeScript) and `morsels/skills/` (Markdown) are the only content that leaves the repo. They are discovered through `pi.extensions` and `pi.skills` in `/home/dot/Development/pantry/package.json`.
- **No build step.** Pi loads `.ts` extensions directly via `jiti` and loads Markdown skills as files; there is no compile, bundle, or transpile gate. The only automated gate is `tsc --project berrygems/tsconfig.json` for type checking.
- **Module isolation between extensions.** Pi loads each extension in its own module context, so extensions cannot `import` each other. Cross-extension APIs are published and consumed exclusively via `globalThis[Symbol.for("pantry.<name>")]`.
- **Content vs. code split.** Berrygems are the programmatic/deterministic layer (tools, panels, guards, diagnostics). Morsels are harness-agnostic knowledge packets; some morsels document berrygem APIs but most are general-purpose (git, github, language tooling, writing).
- **Flat ownership, no frameworks.** There is no dependency injection, no service container, no router. Each extension is a plain TypeScript file with a default-exported function that receives pi's `ExtensionAPI` and wires itself in.

## Layers

**Shipped content (packaged & installed):**

**1. Extensions layer — `berrygems/extensions/`:**

- Purpose: Programmatic, deterministic tools pi loads into each session.
- Location: `berrygems/extensions/` (17 extensions total — 14 single-file, 3 multi-file directories).
- Contains: One default-exported `function (pi: ExtensionAPI)` per file; calls to `pi.registerTool()`, `pi.registerCommand()`, and `pi.on(event)` inside that function wire the extension to the pi runtime.
- Depends on: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, `@sinclair/typebox` (all resolved via symlinks in `berrygems/node_modules/`), plus `berrygems/lib/*` for shared utilities.
- Used by: The pi harness at session start.

**2. Shared library layer — `berrygems/lib/`:**

- Purpose: In-process helpers that multiple extensions import. Not loaded by pi directly.
- Location: `berrygems/lib/` (11 modules).
- Contains: `settings.ts` (settings reader — `readPantrySetting`, `readProjectPantrySetting`, `writeProjectPantrySetting`), `id.ts` (`generateId`, `generateShortId`), `cooldown.ts`, `pi-spawn.ts`, `sse-client.ts`, `panel-chrome.ts`, `compaction-templates.ts`, `animated-image.ts`, `animated-image-player.ts`, `giphy-source.ts`, `lsp-client.ts`.
- Depends on: Node stdlib and pi package types only.
- Used by: Extensions in `berrygems/extensions/` — via relative imports (`../lib/settings.ts`).

**3. Tone/style layer — `berrygems/styles/`:**

- Purpose: Document-writing voice presets (`formal`, `friendly`, `minimal`, `narrative`, `personality`) selected via `pantry.tone.default` + per-context overrides.
- Location: `berrygems/styles/` (5 Markdown files).
- Contains: Plain Markdown tone descriptions, no code.
- Used by: Extensions that produce written output; selected from settings, not imported.

**4. Skills layer — `morsels/skills/`:**

- Purpose: Markdown skill packages that agents load on demand.
- Location: `morsels/skills/` (56 skills).
- Contains: One directory per skill, each with a `SKILL.md` file (YAML frontmatter + Markdown body). Some skills include a `references/` subdirectory for overflow content (`git/references/`, `github/references/`, `extension-designer/references/`, `git-auth/references/`, `github-writing/references/`, `skill-designer/references/`).
- Depends on: Nothing — skills are plain Markdown.
- Used by: The pi harness (which surfaces them to the model via skill loading) and any other harness that can consume agentskills.io-compatible skills.

**Non-shipped workspace directories (present in the working tree but not part of the installed package):**

**5. Planning workspace — `den/`:**

- Purpose: Per-feature planning artifacts (research, plans, reviews, current state).
- Location: `den/features/` (one subdirectory per in-flight feature, e.g. `dragon-breath/`, `dragon-digestion/`, `hoard-allies/`), plus `den/moments/` and `den/reviews/`.
- Not shipped — ignored at install time because nothing in the pi manifest points at it.

**6. GSD planning state — `.planning/`:**

- Purpose: Output of `/gsd-*` commands, including this codebase map.
- Location: `.planning/codebase/`.

**7. Amputation remnants:** `storybook-daemon/`, `psi/`, `dragon-cubed/`, `allies-parity/` directories are leftover husks from the 2026-04-22 scope amputation (see CONCERNS.md). Their only remaining contents are stray `.pi/agents/*.md` scout files, `.claude/rules/*.md` copies, a Qt `build/` tree under `psi/`, and a single `.pi/todos/*.md` stub under `dragon-cubed/`. Nothing in these directories is referenced by the root `package.json` or by any shipped code. Similarly, `berrygems/extensions/hoard-allies/` holds only a `.claude/rules/typescript.md` file — its `index.ts` was deleted in the amputation, so the directory is effectively empty as an extension.

## Data Flow

**Extension discovery & load (session start):**

1. User runs `pi install /path/to/pantry` (or installs from GitHub). Pi reads `pi.extensions: ["berrygems/extensions"]` and `pi.skills: ["morsels/skills"]` from `/home/dot/Development/pantry/package.json`.
2. On each pi session start, pi enumerates files and directories under `berrygems/extensions/`. Single-file `.ts` extensions are loaded directly; directory extensions (e.g. `dragon-guard/`, `dragon-breath/`, `dragon-websearch/`) are loaded by resolving their `index.ts`.
3. Pi loads each extension's module with `jiti` (TypeScript runtime), giving each its own module context. Pi then calls the module's default export with an `ExtensionAPI` instance: `export default function (pi: ExtensionAPI) { ... }`.
4. Inside that default function the extension calls `pi.registerTool(...)`, `pi.registerCommand(...)`, `pi.on(event, handler)`, and/or `(globalThis as any)[Symbol.for("pantry.<name>")] = api` to publish a cross-extension API.
5. Skills under `morsels/skills/*/SKILL.md` are indexed by pi's skill loader. Skills are surfaced to the model for on-demand consumption — they are not "run" in any sense.

**Per-session request/response flow (what extensions hook into):**

Pi's event lifecycle as documented in `AGENTS.md` (lines 141–150):

```
session_start → user types → input (can intercept/transform)
  → before_agent_start (inject message, modify system prompt)
  → agent_start
    → turn_start → context (modify messages) → before_provider_request
      → tool_call (can BLOCK or MUTATE args)
      → tool_result (can MODIFY result)
    → turn_end
  → agent_end
```

Extensions register handlers on these events via `pi.on("<event>", handler)`. For example, `dragon-herald.ts:129–158` hooks `agent_start` and `agent_end` to fire desktop notifications; `dragon-guard/index.ts` gates `tool_call`; `dragon-digestion.ts` hooks compaction-relevant events.

**Settings flow:**

1. Settings live in `~/.pi/agent/settings.json` (global) and `.pi/settings.json` (project). Never read by hand — extensions always call `readPantrySetting<T>(path, fallback)` from `berrygems/lib/settings.ts`.
2. The reader first resolves the dotted path under the `pantry.*` namespace, then falls back to legacy flat keys under `dotsPiEnhancements.*` (migration shim — see `berrygems/lib/settings.ts:76–108` for the full legacy key map).
3. Project overrides are read via `readProjectPantrySetting(cwd, path, fallback)` at `berrygems/lib/settings.ts:154–179` and written via `writeProjectPantrySetting` at `berrygems/lib/settings.ts:185–220`.

**Cross-extension communication flow:**

1. Publisher extension assigns its API object to `globalThis` under a well-known symbol at load time: e.g. `(globalThis as any)[Symbol.for("pantry.parchment")] = { createPanel, close, focusPanel }` (`berrygems/extensions/dragon-parchment.ts:220`).
2. Consumer extensions fetch it at use-time, always through the symbol: `const panels = (globalThis as any)[Symbol.for("pantry.parchment")]`.
3. Because pi gives each extension its own module context, direct `import` between extensions is impossible; the `globalThis` dance is the only supported bridge.

**State-persistence flow:**

- Per-session state lives in pi session JSONL trees. Extensions store durable facts inside tool result `details` objects or via `pi.appendEntry()` so that session branching remains intact. Reconstruction happens on session events by walking `ctx.sessionManager.getBranch()`. Extensions never write their own side-files for session state.
- The memory vault at `~/.pi/agent/memory/` and `.pi/memory/` is the intentional exception — it is cross-session by design.

## Key Abstractions

**`ExtensionAPI` (imported from `@mariozechner/pi-coding-agent`):**

- Purpose: The contract every extension receives as its default-export argument. Provides `registerTool`, `registerCommand`, `on`, `appendEntry`, and access to the session/context.
- Examples: `berrygems/extensions/dragon-herald.ts:123`, `berrygems/extensions/dragon-guard/index.ts`, `berrygems/extensions/dragon-scroll.ts:711`.
- Pattern: Every extension's top-level export is `export default function (pi: ExtensionAPI) { ... }` — the function body is the full extension registration.

**`ExtensionContext` (imported from `@mariozechner/pi-coding-agent`):**

- Purpose: The per-invocation context passed to event handlers and tool implementations. Provides access to the session manager, current cwd, TUI, and model metadata.
- Examples: `berrygems/extensions/dragon-guard/index.ts:14–16`, `berrygems/extensions/dragon-parchment.ts:20–22`.

**`globalThis[Symbol.for("pantry.<name>")]` — the cross-extension API bus:**

- Purpose: The only supported way for extensions to share state or call each other.
- Registered symbols in the tree:
  - `pantry.parchment` — panel management (publisher: `berrygems/extensions/dragon-parchment.ts:220`; consumers: `dragon-guard`, `dragon-tongue`, `dragon-scroll`, `dragon-digestion`, `dragon-inquiry`, `kobold-housekeeping`).
  - `pantry.kitty` — kitty-protocol GIF rendering (publisher: `berrygems/extensions/kitty-gif-renderer.ts:94`; consumer: `dragon-scroll`).
  - `pantry.breath` — carbon/energy tracking (publisher: `berrygems/extensions/dragon-breath/index.ts:480`).
  - `pantry.imageFetch` — image fetching service (publisher: `berrygems/extensions/dragon-image-fetch.ts:50`; consumer: `dragon-scroll`).
  - `pantry.lab` — experimental provider feature opt-ins (publisher: `berrygems/extensions/dragon-lab.ts:67`; consumer: `dragon-digestion.ts:2629`).
- Pattern: Always `Symbol.for("pantry.<name>")`, never bare strings. Consumers must treat missing publishers as acceptable — the API is an optional coordination surface, not a hard dependency.

**Panel component contract (`PanelComponent`, defined in `berrygems/extensions/dragon-parchment.ts:57–66`):**

- Purpose: Shape every floating panel must implement to be hosted by dragon-parchment.
- Methods: `render(width)`, `invalidate()`, optional `handleInput(data)`, optional `dispose()`.
- Creation path: consumers call `panels.createPanel(id, factory, options)` instead of using pi's overlay API directly.

**Tool registration pattern:**

- Every `pi.registerTool()` call must include `promptSnippet` and `promptGuidelines` alongside `name`, `description`, and parameter schema. Without these two fields pi omits the tool from the system prompt's "Available Tools" and "Guidelines" sections and the LLM sees only a bare XML schema — which smaller ally models silently ignore. This is enforced as convention in `berrygems/AGENTS.md:44–60`. Example usage: `berrygems/extensions/dragon-scroll.ts:715` and `:841`.

**Skill abstraction:**

- Each skill is a directory with `SKILL.md`. Frontmatter: required `name` (must match directory, lowercase-hyphenated), `description` (what + when + trigger keywords, max 1024 chars), `license: MIT`. Optional: `compatibility` (for pi-specific or tool-dependent skills), `metadata`, `allowed-tools`. See `morsels/AGENTS.md:36–53`. Body is free-form Markdown ≤500 lines; overflow lives in a `references/` subdirectory.
- Skills ship as content. There is no loader, no registry, no lifecycle — pi reads the directory tree and surfaces skills by name and description.

## Entry Points

**There are no executable entry points in this repo.** Pantry is not an application.

**What serves as an "entry point" from pi's perspective:**

- `/home/dot/Development/pantry/package.json` — the manifest with `pi.extensions` and `pi.skills` arrays that pi reads on install.
- Each file directly under `berrygems/extensions/` (for single-file extensions) and each `index.ts` inside a subdirectory there (for multi-file extensions). Pi imports these, invokes their default export, and registration happens as a side effect.
- Each `morsels/skills/*/SKILL.md` — surfaced to the model through pi's skill system.

**Developer entry points (not runtime):**

- `tsc --project /home/dot/Development/pantry/berrygems/tsconfig.json` — the sole automated verification gate (see `berrygems/tsconfig.json` — `noEmit: true`, `include: ["extensions/**/*.ts", "lib/**/*.ts"]`).
- `/reload` inside pi — reloads the extensions without restarting the session; the primary manual test loop.

## Error Handling

**Strategy:** Extensions defend against their own failures but are expected to never crash the agent. Best-effort patterns dominate — e.g. `dragon-herald.ts:155–157` wraps all notification dispatch in `try { ... } catch { /* never crash */ }`.

**Patterns:**

- **Settings fall back silently.** `readPantrySetting<T>(path, fallback)` at `berrygems/lib/settings.ts:125–148` returns `fallback` for any missing file, bad JSON, or absent key — there is no throw path.
- **Missing cross-extension APIs are tolerated.** Consumers use optional chaining: `panels?.register(...)` rather than asserting presence. If `dragon-parchment` is not loaded, panel-owning extensions degrade quietly.
- **Tool handlers wrap their own side-effects.** Network calls, shell execs, and filesystem writes are wrapped in `try/catch` with the failure mode returned inside the tool result `details` rather than thrown up into the agent loop.
- **No custom error classes.** Narrowing uses `error instanceof Error` checks where it matters (project TypeScript convention). `unknown` in catches, not `any` — enforced by `strict: true` in `berrygems/tsconfig.json`.

## Cross-Cutting Concerns

**Logging:**

- No logging framework. Extensions that need visibility write to panels (`dragon-parchment`-hosted components) or emit notifications (`dragon-herald`). Raw `console.log` is avoided in shipped code — diagnostic output flows through pi's UI surfaces.

**Validation:**

- Tool parameter schemas use `@sinclair/typebox` (`Type.*`) to produce JSON Schema for pi's tool registry. See import in `berrygems/extensions/dragon-digestion.ts:37`. Schemas are the validation layer — pi rejects malformed calls before they reach tool handlers.

**Authentication:**

- No auth is owned by pantry itself. Extensions that talk to external services (e.g. `dragon-image-fetch`, `dragon-websearch`) read credentials from environment variables or from `~/.pi/agent/settings.json` via `readPantrySetting`. The `git-auth` morsel documents the external `rbw`/Bitwarden flow for git credentials.

**Permissions / consent:**

- `dragon-guard` (`berrygems/extensions/dragon-guard/`) owns the four-tier permission model (Puppy/Dog/Ally/Dragon modes) and gates `tool_call` events before they run. It is the canonical consent-UX surface and is governed directly by `ETHICS.md`.

**Settings namespace:**

- All persistent configuration lives under `pantry.*` in `~/.pi/agent/settings.json`. Per-namespace tiers (e.g. `pantry.guard.*`, `pantry.digestion.*`, `pantry.contributor.*`, `pantry.tone.*`) are documented in `AGENTS.md` and enumerated in the legacy migration map at `berrygems/lib/settings.ts:76–108`.

**AI contributor identity & tone:**

- `pantry.contributor.*` supplies the persona name, email, and `Co-authored-by`/transparency trailer templates that skills reference (see `AGENTS.md:182–198`). `pantry.tone.default` plus per-context `pantry.tone.overrides` drives which file in `berrygems/styles/` governs written output voice.

---

_Architecture analysis: 2026-04-22_
