# morsels — AGENTS.md

> **Part of [Pantry](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.
> **Governed by [ETHICS.md](../ETHICS.md)** — read before creating skills that handle user data, consent flows, or memory access.

## What This Is

**morsels** is the knowledge layer of the dragon. Yummy generalized AI snacks — general-purpose agentic skills that are inherently non-programmatic. They can't be hardened into a gem or shaped into a body, but they're quick, grab-and-go bites of knowledge for any agent.

## Relationship to the Pantry

- **berrygems** is the programmatic tool layer. Some morsels exist specifically to teach agents how to use berrygems (dragon-parchment, kitty-gif-renderer, kobold-housekeeping, extension-designer).
- **berrygems** is the programmatic tool layer. Some morsels teach agents how to use berrygems APIs directly.
- **ETHICS.md** governs everything. Skills that touch consent, privacy, memory, or observation must respect the ethical contract.

## Architecture

Skills are Markdown files loaded by pi on demand. Each skill is a directory under `skills/` containing a `SKILL.md` file.

```
morsels/
├── skills/
│   ├── commit/
│   │   └── SKILL.md
│   ├── git/
│   │   ├── SKILL.md
│   │   └── references/    # overflow content (keep SKILL.md < 500 lines)
│   └── ...
└── package.json
```

### Skill Frontmatter

Compliant with the [agentskills.io](https://agentskills.io) open standard. Full template:

```yaml
---
name: skill-name # required — must match directory name, lowercase-hyphenated
description: "What this skill does and when to use it. Include trigger keywords."
license: MIT # required — all pantry morsels are MIT
compatibility: "..." # optional — only if there are env/harness requirements
---
```

**Required fields:**

- `name` — lowercase, hyphens only, matches directory name
- `description` — describes _what_ the skill does AND _when_ to use it; include keywords that help agents identify relevant tasks; max 1024 chars
- `license` — always `MIT` for pantry morsels

**Optional fields:**

- `compatibility` — add when the skill is Pi-specific (`"Designed for Pi (pi-coding-agent)"`) or requires specific tooling (`"Requires rbw (Bitwarden CLI)"`). Omit for general-purpose skills.
- `metadata` — key-value map for additional properties not in the spec (e.g. `author`, `version`)
- `allowed-tools` — space-delimited pre-approved tool list (experimental, support varies by harness)

### Conventions

- **Keep SKILL.md under 500 lines** — move reference material to `references/` subdirectory
- **name must match directory** — `skills/commit/SKILL.md` → `name: commit`
- **description drives discovery** — agents use it to decide when to load the skill. Be specific about trigger conditions.
- **No build step** — skills are loaded as Markdown directly

## Development

No automated linting for morsels. Quality gates are:

1. Frontmatter valid (`name` matches directory, `description` + `license` present)
2. Pi-specific skills have `compatibility: "Designed for Pi (pi-coding-agent)"`
3. SKILL.md under 500 lines
4. References in `references/` subdirectory if needed
5. Manual review of content accuracy

## Skill Inventory

See root [AGENTS.md](../AGENTS.md#morsels--skills) for the full skill table with status emoji.
