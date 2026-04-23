# berrygems — AGENTS.md

> **Part of [Pantry](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.
> **Governed by [ETHICS.md](../ETHICS.md)** — read before modifying permission guards, user data handling, or consent UX.

## What This Is

**berrygems** is the crystallized tool layer of the dragon. Delicious bite-sized knowledge, hardened into deterministic programmatic extensions for pi.

These extensions are what the dragon uses _through her pi body_. They're the interface between the agent and the world during a pi session — panels, permissions, diagnostics, carbon tracking, image rendering, compaction, todo management, code review, and more.

When we hit technical ceilings in what the agent can do, this is where we forge new capabilities.

## Relationship to the Pantry

- **berrygems** are pi extensions — self-contained tools that run within a pi session. Each extension loads independently; no persistent daemon coordinates them.
- **morsels** teach agents _how_ to use berrygems. Several skills exist specifically to document berrygem APIs (dragon-parchment, kitty-gif-renderer, kobold-housekeeping, extension-designer).
- **ETHICS.md** governs everything. berrygems implements user-facing consent UX (dragon-guard), privacy controls, and transparency features.

## Architecture

Extensions are TypeScript files loaded by pi via jiti — **no build step**. Each extension gets its own module context (modules are isolated between extensions).

- **Single-file extensions**: `extensions/dragon-breath.ts`
- **Multi-file extensions**: `extensions/dragon-guard/index.ts` (directory with `index.ts` entry point)
- **Shared utilities**: `lib/` — imported by extensions, not loaded by pi directly
- **Writing tones**: `styles/` — voice control for document writing (not agent personality)

### Inter-Extension Communication

Extensions communicate via `globalThis` + `Symbol.for()`, never direct imports:

```typescript
// Publisher
const API_KEY = Symbol.for("pantry.parchment");
(globalThis as any)[API_KEY] = { register, close, focusPanel };

// Consumer
const panels = (globalThis as any)[Symbol.for("pantry.parchment")];
panels?.register("my-panel", { handle, invalidate, dispose });
```

### Tool Registration

Every `pi.registerTool()` call **must** include `promptSnippet` and `promptGuidelines`:

```typescript
pi.registerTool({
  name: "my_tool",
  description: "Full description for the XML schema block",
  promptSnippet: "One-line summary for the Available Tools section",
  promptGuidelines: [
    "When to use this tool and what to expect",
    "Common mistakes to avoid",
  ],
  // ...
});
```

Without these, pi omits the tool from the system prompt's "Available tools" and "Guidelines" sections. The LLM only sees a bare XML schema block with no behavioral context — leading to misuse or non-use, especially by smaller ally models.

### Settings

All under `pantry.*` in `~/.pi/agent/settings.json`. See root AGENTS.md for the full namespace map.

## Development

```bash
# Type check
tsc --project berrygems/tsconfig.json

# Reload after changes
/reload  # in pi
```

- tsconfig resolves `@mariozechner/pi-*` via symlinks in `node_modules/`
- No eslint — type checking is the primary gate
- No test framework — manual testing via `/reload`

### Symlink Repair

If symlinks break after pi updates:

```bash
PI_MODULES="$HOME/.npm/lib/node_modules/mitsupi/node_modules"
mkdir -p node_modules/@mariozechner
ln -sf "$PI_MODULES/@mariozechner/pi-tui" node_modules/@mariozechner/pi-tui
ln -sf "$PI_MODULES/@mariozechner/pi-coding-agent" node_modules/@mariozechner/pi-coding-agent
ln -sf "$PI_MODULES/@mariozechner/pi-ai" node_modules/@mariozechner/pi-ai
ln -sf "$PI_MODULES/@mariozechner/pi-agent-core" node_modules/@mariozechner/pi-agent-core
ln -sf "$PI_MODULES/@sinclair" node_modules/@sinclair
```

## Code Style

- Tabs for indentation, double quotes, semicolons
- `satisfies` over `as`; no `any` without comment
- See root AGENTS.md for full TypeScript conventions

## Extension Inventory

See root [AGENTS.md](../AGENTS.md#berrygems--extensions) for the full feature table with status emoji.
