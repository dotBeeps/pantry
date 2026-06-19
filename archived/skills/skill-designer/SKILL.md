---
name: skill-designer
description: "Design and create Agent Skills (agentskills.io spec). Use when building new SKILL.md files, scaffolding skill directories, or reviewing existing skills for quality. Covers frontmatter, naming, description writing, body structure, progressive disclosure, templates, and validation."
license: MIT
compatibility: "Designed for Pi (pi-coding-agent); Claude Code uses skill-creator + superpowers:writing-skills instead."
---

# Skill Designer

Design, scaffold, and validate Agent Skills following the [agentskills.io specification](https://agentskills.io/specification) and best practices extracted from high-quality production skills.

## When to Use

- Creating a new skill from scratch
- Reviewing or improving an existing skill
- Scaffolding a skill directory structure
- Writing effective descriptions for agent discoverability

## Workflow

1. **Classify** — Determine the skill archetype (see [Archetypes](#archetypes))
2. **Name** — Choose a valid name following [Naming Rules](#naming-rules)
3. **Describe** — Write a trigger-quality description (see [Description Writing](#description-writing))
4. **Structure** — Scaffold the directory and SKILL.md body using the appropriate [template](references/templates.md)
5. **Validate** — Run the [Quality Checklist](#quality-checklist)
6. **Review** — Check progressive disclosure balance (see [Progressive Disclosure](#progressive-disclosure))

**Co-shipping rule:** If a skill documents an extension's behavior, skill updates ship with the code that adds or changes the behavior — never as a follow-up task. An undocumented feature is incomplete work.

## Archetypes

Every skill fits one of three archetypes. Choose based on what the skill teaches the agent to do.

### Convention Guide (400–900 words)

Language or framework rules the agent should follow. Examples: `typescript`, `go`, `python`, `react`, `rust`.

**Pattern:** H1 title → 6–8 H2 sections → bullet points with inline rationale.

**Sections to include:** Idioms, Style, Types/Typing, Error Handling, Testing, Structure, Concurrency (if applicable).

**Key traits:**

- Bullets state the rule, then explain WHY — `Prefer X over Y — reason`
- "Never" and "Always" used sparingly and precisely
- Anti-patterns paired with correct approach
- Mentions what tooling it's "beyond" (e.g., "beyond what gofmt enforces")
- No external links — self-contained
- Consistent section names across skills of the same archetype

### Tool/Task Skill (200–400 words)

Step-by-step instructions for using a specific tool or completing a task. Examples: `commit`, `github`, `summarize`, `uv`, `mermaid`.

**Pattern:** H1 title → Prerequisites → Quick Reference → Numbered workflow → Code blocks.

**Key traits:**

- Code blocks show actual executable commands with inline comments
- Numbered workflow steps (Write → Validate → Fix → Ship)
- Decision trees for branching logic ("If X, do Y; otherwise Z")
- Quick Reference / cheatsheet section for common operations
- Explicit "when NOT to use" guidance

### Design/Process Skill (800–1500 words)

Coaching-style guidance for open-ended creative or architectural work. Examples: `frontend-design`.

**Pattern:** H1 title → Inputs to Gather → Philosophy → Principles → Detailed Guidelines → Anti-Patterns → Deliverables → Quality Checklist.

**Key traits:**

- Asks clarifying questions before starting ("Ask 2–4 questions")
- Design thinking section before implementation details
- Anti-patterns with concrete bad examples
- Deliverables definition (what the output should look like)
- Self-validation checklist at the end

## Naming Rules

The `name` field in frontmatter:

- **1–64 characters**, lowercase `a-z`, digits `0-9`, hyphens `-` only
- Must **not** start or end with a hyphen
- Must **not** contain consecutive hyphens (`--`)
- **Must match** the parent directory name exactly

```
✅ pdf-processing, data-analysis, code-review, go, react
❌ PDF-Processing, -pdf, pdf--processing, my skill, skill_name
```

## Description Writing

The description is the **activation trigger** — it determines whether the agent loads this skill. It appears in the system prompt as part of a compact catalog (~50–100 tokens per skill). The full SKILL.md loads only when the agent decides the skill is relevant.

### Formula

```
[What it does — concrete actions, 2-4 verbs] + [When to use — specific triggers/contexts]
```

### Good Examples

```yaml
description: "Extract text and tables from PDF files, fill PDF forms, and merge multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction."

description: "TypeScript conventions: ESM, strict mode, patterns. Use when working with TypeScript or .ts/.tsx files."

description: "Design and implement distinctive, production-ready frontend interfaces with strong aesthetic direction. Use when asked to create or restyle web pages, components, or applications."
```

### Bad Examples

```yaml
description: "Helps with PDFs."           # Too vague — won't trigger
description: "A useful coding skill."      # No specifics at all
description: "Does stuff with TypeScript." # Missing trigger context
```

### Tips

- Include file extensions or keywords the user might mention (`.ts`, `.tsx`, `PDF`, `commit`)
- State the archetype implicitly — "conventions" for guides, "extract/fill/merge" for tools
- Max 1024 characters, but aim for 100–200 characters — dense and specific

## Frontmatter Reference

```yaml
---
name: my-skill # Required. Must match directory name.
description: "What + When" # Required. Max 1024 chars. The activation trigger.
license: MIT # Optional. License name or file reference.
compatibility: "Requires Node 18" # Optional. Max 500 chars. Environment needs.
metadata: # Optional. Arbitrary key-value pairs.
  author: my-org
  version: "1.0"
allowed-tools: Bash Read # Optional. Space-delimited pre-approved tools.
disable-model-invocation: false # Optional. Hide from system prompt if true.
---
```

**Required fields:** `name` and `description` only. A skill missing `description` will NOT be loaded.

## Progressive Disclosure

Skills load in three tiers — design for this:

| Tier             | What Loads                           | When                             | Budget                   |
| ---------------- | ------------------------------------ | -------------------------------- | ------------------------ |
| **Catalog**      | `name` + `description`               | Session start (always)           | ~50–100 tokens           |
| **Instructions** | Full `SKILL.md` body                 | When agent activates skill       | <5000 tokens recommended |
| **Resources**    | `scripts/`, `references/`, `assets/` | When instructions reference them | As needed                |

### Guidelines

- Keep `SKILL.md` under **500 lines**
- Move detailed reference material to `references/` files
- Keep file references **one level deep** from SKILL.md — no deeply nested chains
- Use relative paths: `./scripts/process.sh`, `references/REFERENCE.md`
- Scripts should be self-contained with clear error messages

### Directory Structure

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Optional: executable helper code
│   └── validate.sh
├── references/           # Optional: on-demand documentation
│   └── api-reference.md
└── assets/               # Optional: templates, schemas, static resources
    └── template.json
```

## Quality Checklist

Run through this after drafting a skill:

### Frontmatter

- [ ] `name` is lowercase, hyphens only, matches directory name
- [ ] `description` states WHAT + WHEN with specific trigger keywords
- [ ] `description` is 100–200 characters (max 1024)
- [ ] No missing required fields (`name`, `description`)

### Body Structure

- [ ] Correct archetype template used (convention / tool / design)
- [ ] H1 title, H2 sections — no deeper than H3 for scannability
- [ ] Under 500 lines / ~5000 tokens
- [ ] Detailed reference material split into `references/` files

### Content Quality

- [ ] Rules include rationale ("Prefer X — because Y")
- [ ] Anti-patterns shown alongside correct patterns
- [ ] Code blocks use actual executable commands (not pseudocode)
- [ ] Instructions are agent-directed ("Do X", not "You could X")
- [ ] No ambiguous guidance — specific and actionable

### Progressive Disclosure

- [ ] Only `name` + `description` needed to decide relevance
- [ ] Full SKILL.md is self-sufficient once loaded
- [ ] File references use relative paths from skill root
- [ ] Referenced files are focused and individually useful

### Tone

- [ ] Prescriptive for convention skills ("Always", "Never" with rationale)
- [ ] Procedural for tool skills (numbered steps, decision trees)
- [ ] Coaching for design skills (questions before guidance)

## Scaffolding a New Skill

When creating a skill, scaffold the directory structure first:

```bash
# Convention guide
mkdir -p my-skill && cat > my-skill/SKILL.md << 'SKILL'
---
name: my-skill
description: "[Language/Framework] conventions: [key areas]. Use when working with [file types or contexts]."
---

# [Language/Framework] Conventions

## Idioms

## Style

## Error Handling

## Testing

## Structure
SKILL
```

```bash
# Tool/Task skill
mkdir -p my-skill/scripts && cat > my-skill/SKILL.md << 'SKILL'
---
name: my-skill
description: "[Action verbs] via [tool/method]. Use when [specific trigger contexts]."
---

# [Tool Name]

## Prerequisites

## Quick Reference

## Workflow

## Troubleshooting
SKILL
```

```bash
# Design/Process skill
mkdir -p my-skill/references && cat > my-skill/SKILL.md << 'SKILL'
---
name: my-skill
description: "[Design/architect/plan] [what]. Use when asked to [create/review/redesign] [specific artifacts]."
---

# [Process Name]

## When to Use

## Inputs to Gather

## Principles

## Guidelines

## Anti-Patterns

## Deliverables

## Quality Checklist
SKILL
```

For full templates with example content, see [references/templates.md](references/templates.md).

## Common Mistakes

| Mistake                               | Fix                                              |
| ------------------------------------- | ------------------------------------------------ |
| Vague description ("helps with code") | Add specific verbs, file types, trigger contexts |
| Body > 500 lines                      | Split into `references/` files                   |
| Rules without rationale               | Add "— because..." after each rule               |
| Absolute paths in body                | Use relative paths from skill root               |
| No anti-patterns section              | Show wrong approach alongside correct one        |
| H4+ heading nesting                   | Flatten to H2/H3 — agents scan, not read         |
| Instructions say "you could"          | Say "Do X" — be directive, not suggestive        |
| Name doesn't match directory          | Rename directory or update `name` field          |
