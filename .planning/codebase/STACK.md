# Technology Stack

**Analysis Date:** 2026-04-22

## Languages

**Primary:**

- TypeScript (ESNext target, ESNext module, strict mode) — all `berrygems/` extension and library code. Loaded at runtime by pi via jiti (no compilation step).
- Markdown — all `morsels/` skill content. Each skill is a `SKILL.md` with YAML frontmatter; no code compilation.

**Secondary:**

- YAML — skill frontmatter (between `---` fences inside `SKILL.md` files).
- JSON — package manifests and pi settings files.
- Fish shell — scripting idiom for all repo-local commands (see `AGENTS.md` code style rule: "fish, not bash").

## Runtime

**Environment:**

- Node.js (version pinned by the host `pi` install; no `.nvmrc` in this repo).
- Extensions execute inside the pi host process — pantry does not ship its own runtime.

**Package Manager:**

- pnpm (lockfile `berrygems/pnpm-lock.yaml`, `lockfileVersion: 9.0`, `autoInstallPeers: true`).
- The top-level `package.json` is a pi-package manifest, not an npm workspace root — its only non-metadata field is the `pi.*` discovery block.

**Installer:**

- `pi install <repo-url>` — pi reads the top-level `pi.extensions` / `pi.skills` arrays to discover content. No standalone install story.

## Frameworks

**Core (consumed, not bundled):**

- `@mariozechner/pi-coding-agent` — extension API surface (`ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`, `SessionBeforeSwitchEvent`, `Theme`, `DynamicBorder`, `BorderedLoader`, `getMarkdownTheme`).
- `@mariozechner/pi-tui` — terminal UI primitives (`Text`, `Box`, `Container`, `SelectList`, `SettingsList`, `Input`, `Spacer`, `fuzzyFilter`, `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth`, `getGifDimensions`, `calculateImageRows`, `getCellDimensions`, `MarkdownTheme`, `OverlayAnchor`, `OverlayHandle`, `TUI`, `isKeyRelease`, `isKeyRepeat`).
- `@mariozechner/pi-ai` — LLM invocation layer (`complete`, `StringEnum`, and types `Api`, `Model`, `UserMessage`, `Context`, `Usage`).
- `@mariozechner/pi-agent-core` — agent loop primitives (symlinked but rarely imported directly; surfaced only through pi-coding-agent).
- `@sinclair/typebox` — JSON-schema type builder (`Type`, `Static`) used for every tool parameter schema.

**Testing:**

- None wired. `AGENTS.md` is explicit: "no Vitest, no eslint, no skill linter is wired up yet." Type checking is the only automated gate; behaviour is verified manually via `/reload` in pi.

**Build/Dev:**

- `tsc` (via `berrygems/tsconfig.json`) — type-checking only (`noEmit: true`). The single pre-commit gate.
- jiti (provided by pi, not this repo) — compiles TypeScript at import time inside pi.
- No bundler, no transpile pipeline, no watch mode.

## Key Dependencies

**Critical:**

- `@mariozechner/pi-coding-agent` — pi's extension host SDK; every extension file imports from it. Resolved via symlink at `berrygems/node_modules/@mariozechner/pi-coding-agent/`.
- `@mariozechner/pi-tui` — every panel, overlay, and input handler depends on it. Resolved via symlink.
- `@mariozechner/pi-ai` — used by extensions that call LLMs directly (`dragon-musings.ts`, `dragon-inquiry.ts`, `dragon-guard/`, `dragon-scroll.ts`, `dragon-loop.ts`, `dragon-image-fetch.ts`, `lib/giphy-source.ts`). Resolved via symlink.
- `@sinclair/typebox` — mandatory for tool registration (all 11 `pi.registerTool()` call sites use `Type.*`).

**Infrastructure:**

- Node stdlib only for I/O: `node:fs`, `node:path`, `node:os`, `node:child_process`, `node:crypto`, `node:events`, `node:http`. No third-party wrappers (no axios, no undici, no express, no ws). The raw `http` module is used by `berrygems/lib/sse-client.ts`; global `fetch` is used for outbound HTTPS.
- ImageMagick (`magick` binary, shelled out via `execSync`) — required at runtime by `berrygems/lib/giphy-source.ts` and `berrygems/extensions/dragon-image-fetch.ts` for GIF frame extraction.
- `notify-send` (libnotify, optional) — desktop-notification fallback in `berrygems/extensions/dragon-herald.ts` when OSC 777 is unavailable.
- `typescript-language-server` / `tsserver` (optional, user-installed) — spawned by `berrygems/extensions/dragon-tongue.ts` via `berrygems/lib/lsp-client.ts`.

## Configuration

**Environment:**

- No `.env` file expected or read by this package (none found at repo root; none referenced in code).
- Pi-level configuration lives in `~/.pi/agent/settings.json` (global) and `.pi/settings.json` (per project). All pantry settings are nested under the `pantry.*` namespace.
- Runtime-only env vars (read, never written by this package):
  - `PANTRY_GUARD_MODE` — checked by `berrygems/extensions/dragon-guard/index.ts`, `dragon-scroll.ts`, `kobold-housekeeping.ts` to detect ally-mode subprocesses.
  - `PANTRY_ALLY_TOOLS` — ally tool whitelist, consumed by `berrygems/extensions/dragon-guard/index.ts`.
  - `PI_SUBAGENT_DEPTH` — subagent nesting counter, read by `dragon-guard/index.ts`.
  - `HOME` / `USERPROFILE` — used across `berrygems/lib/settings.ts`, `lib/pi-spawn.ts`, `lib/giphy-source.ts`, `extensions/dragon-digestion.ts`, `extensions/dragon-image-fetch.ts`, `extensions/dragon-scroll.ts`, `extensions/dragon-websearch/index.ts`.
- Settings access is centralized through `readPantrySetting()` / `readPantryKey()` in `berrygems/lib/settings.ts`; direct JSON parsing is banned by convention.

**Build:**

- `berrygems/tsconfig.json` — the only build-adjacent config. Key flags: `"strict": true`, `"noEmit": true`, `"allowImportingTsExtensions": true`, `"moduleResolution": "bundler"`, `"noUnusedLocals": true`, `"noUnusedParameters": true`. `paths` aliases map `@mariozechner/pi-*` and `@sinclair/typebox` to `../node_modules/...` so `tsc` resolves against pi's installed copies via the berrygems symlinks.
- `berrygems/node_modules/@mariozechner/` — four symlinks (`pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`) pointing into `~/.npm/lib/node_modules/mitsupi/node_modules/@mariozechner/`. `berrygems/node_modules/@sinclair` is symlinked the same way.

## Platform Requirements

**Development:**

- Node.js + pi installed via npm global (`~/.npm/lib/node_modules/mitsupi/`). The symlink-repair script in `AGENTS.md` targets this exact path.
- TypeScript compiler on PATH (for the `tsc --project berrygems/tsconfig.json` pre-commit gate).
- Fish shell for the documented command snippets (not strictly required, but all examples are fish).
- Optional: ImageMagick (`magick`), `notify-send`, `typescript-language-server` for extensions that shell out.

**Production:**

- Same machine that runs pi. Pantry has no deployable surface of its own — it ships as content that pi loads. No container, no service, no server binary.

## Linters / Formatters

- `tsc` with `strict`, `noUnusedLocals`, `noUnusedParameters` — the sole automated quality gate.
- No ESLint config anywhere in the repo (confirmed by `AGENTS.md` and absence of `.eslintrc*`, `eslint.config.*`).
- No Prettier config file; `AGENTS.md` names prettier as "ground truth" but no config is committed, so formatting relies on editor defaults + the stated convention of tabs, double quotes, semicolons.
- No skill linter for `morsels/` — frontmatter is reviewed by hand per `AGENTS.md` §Pre-Commit Checklist.

## Repository Manifests

- `/home/dot/Development/pantry/package.json` — root pi-package manifest with `pi.extensions` and `pi.skills` discovery arrays.
- `/home/dot/Development/pantry/berrygems/package.json` — name/version metadata only; no `dependencies` or `scripts`.
- `/home/dot/Development/pantry/berrygems/pnpm-lock.yaml` — empty importers block (`importers: { .: {} }`); lockfile is present but records no resolved dependencies because all pi-mono packages come in via symlink.
- `/home/dot/Development/pantry/morsels/package.json` — name/version metadata only.
- No Kotlin or Python metadata exists in this repo (the scope amputation on 2026-04-22 removed `dragon-cubed`/Kotlin and any Python-side concerns from the pi-package; a `dragon-cubed/` directory still sits at the repo root but is out of scope for pantry and is listed in `.gitignore` build-output patterns).

---

_Stack analysis: 2026-04-22_
