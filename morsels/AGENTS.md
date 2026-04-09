# morsels — AGENTS.md

> **Part of [Hoard](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.
> **Governed by [ETHICS.md](../ETHICS.md)** — read before creating skills that handle user data, consent flows, or memory access.

## What This Is

**morsels** is the knowledge layer of the dragon. Yummy generalized AI snacks — general-purpose agentic skills that are inherently non-programmatic. They can't be hardened into a gem or shaped into a body, but they're quick, grab-and-go bites of knowledge for any agent.

## Relationship to the Hoard

- **berrygems** is the programmatic tool layer. Some morsels exist specifically to teach agents how to use berrygems (dragon-parchment, kitty-gif-renderer, kobold-housekeeping, extension-designer).
- **storybook-daemon** is the persistent core. Morsels are portable knowledge any body can consume — during a pi session, through a daemon-directed subagent, or standalone.
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

Required YAML between `---` fences:

```yaml
---
name: skill-name        # must match directory name
description: What this skill does and when to use it
---
```

### Conventions

- **Keep SKILL.md under 500 lines** — move reference material to `references/` subdirectory
- **name must match directory** — `skills/commit/SKILL.md` → `name: commit`
- **description drives discovery** — pi uses it to decide when to load the skill. Be specific about trigger conditions.
- **No build step** — pi loads Markdown directly

## Development

No automated linting for morsels. Quality gates are:

1. Frontmatter valid (`name` matches directory, `description` present)
2. SKILL.md under 500 lines
3. References in `references/` subdirectory if needed
4. Manual review of content accuracy

## Skill Inventory

See root [AGENTS.md](../AGENTS.md#morsels--skills) for the full skill table with status emoji.
