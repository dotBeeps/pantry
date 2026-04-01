# AGENTS.md

## Project Overview

A [pi](https://github.com/badlogic/pi-mono) package containing custom Agent Skills and TUI extensions. Installable via `pi install https://github.com/dotBeeps/dots-pi-enhancements`. No build step — pi loads TypeScript extensions and Markdown skills directly.

## Repository Structure

```
extensions/          TypeScript pi extensions (loaded by convention)
skills/              Agent Skills — each subdirectory has a SKILL.md
  agent-init/        Generates AGENTS.md files for projects
  skill-designer/    Guides creation of new Agent Skills
package.json         pi-package manifest (convention discovery, no explicit pi key needed)
```

Pi auto-discovers `extensions/` and `skills/` directories — no manifest paths required.

## Adding a New Skill

Follow the `skill-designer` skill and its quality checklist. Key rules:

- **Archetype first** — classify as Convention Guide (400–900 words), Tool/Task (200–400 words), or Design/Process (800–1500 words), then use the matching template from `skills/skill-designer/references/templates.md`
- **Directory name = `name` field** — lowercase, hyphens only, 1–64 chars
- **Description formula** — `[What it does — verbs] + [When to use — triggers]`, aim for 100–200 chars
- **Body under 500 lines** — split detailed reference into `references/` subdirectory
- **Headings** — H1 title, H2 sections, no deeper than H3
- **Directive tone** — "Do X", not "You could X"
- **Rationale with rules** — "Prefer X over Y — because Z"
- **Anti-patterns** — show the wrong approach alongside the correct one

Scaffold:
```bash
mkdir -p skills/my-skill
# Then write skills/my-skill/SKILL.md with frontmatter + body
```

## Adding a New Extension

Extensions are single TypeScript files in `extensions/`. Follow patterns established in `ask.ts`:

- **Imports** — use `@mariozechner/pi-coding-agent` for `ExtensionAPI`, `@mariozechner/pi-tui` for TUI components, `@sinclair/typebox` for schemas, `@mariozechner/pi-ai` for `StringEnum`
- **`StringEnum`** — use instead of plain string unions for enum parameters (Google model compatibility)
- **`Type.Object`** — define all parameters with `@sinclair/typebox` schemas including `description` fields
- **`promptSnippet`** — one-line summary so agents see the tool in their prompt
- **`promptGuidelines`** — array of usage hints telling agents when and how to invoke the tool
- **`renderCall` / `renderResult`** — implement both for clean, themed TUI display
- **JSDoc header** — opening comment block explaining what the extension does and its modes/features
- **Error handling** — gracefully handle `!ctx.hasUI` (non-interactive mode) and invalid parameters
- **Naming** — one tool per file, filename matches tool name

Reference: pi extension docs at `/opt/pi-coding-agent/docs/extensions.md` and examples at `/opt/pi-coding-agent/examples/extensions/`.

## Code Style

- **TypeScript** — tabs for indentation, double quotes, semicolons
- **Markdown** — ATX headings (`#`), bullet lists with `-`, fenced code blocks with language tags
- **Skill frontmatter** — YAML between `---` fences, `name` and `description` required

## Commits

Use Conventional Commits: `<type>(<scope>): <summary>`

- `feat` for new skills or extensions
- `fix` for bug fixes
- `docs` for README or skill content updates
- `refactor` for restructuring without behavior change
- Scope is the skill or extension name: `feat(agent-init): add interview step`
- Summary ≤72 chars, imperative mood, no trailing period
- Update `README.md` when adding or removing skills/extensions
