# Skill Templates

Full starter templates for each archetype with example content. Copy, rename, and adapt.

## Convention Guide Template

For language or framework rules. Target: 400–900 words.

````markdown
---
name: my-language
description: "My Language conventions: typing, error handling, idioms. Use when working with My Language source files or .xyz files."
---

# My Language Conventions

Rules beyond what the standard linter/formatter enforces.

## Idioms

- Prefer X over Y — Y causes [problem], X avoids it
- Use `standard_pattern()` for [task] — it handles [edge case] automatically
- Never do Z in production — use W instead because [reason]

## Style

- `snake_case` functions, `PascalCase` types, `UPPER_SNAKE` constants
- Line length 100 — configure in `.editorconfig` or linter
- Explicit over implicit — spell out what the code does

## Types / Typing

- Always annotate function signatures and return types
- Prefer `SomeType | None` over nullable wrappers
- Use `Protocol` / interfaces for dependency injection boundaries

## Error Handling

- Catch specific errors — never bare `catch` / `except`
- Wrap errors with context: "doing X: original error"
- Custom errors extend the standard error base, not the root

## Testing

- Test files alongside source: `foo.test.xyz`
- Table-driven / parameterized tests for multiple cases
- Inject dependencies — don't mock modules if you can restructure
- Use the project's test runner (don't assume which one)

## Structure

- Small modules with focused exports
- No `util` / `common` / `helpers` packages — name by purpose
- Keep dependency graph shallow and acyclic

## Concurrency

- Pass cancellation context explicitly — don't rely on globals
- Coordinate lifetimes with structured concurrency or wait groups
- Never fire-and-forget background work
````

## Tool/Task Skill Template

For step-by-step tool usage or task completion. Target: 200–400 words.

````markdown
---
name: my-tool
description: "Run [action], validate [output], deploy [artifact] via my-tool CLI. Use when the user needs to [specific trigger] or mentions [keywords]."
---

# My Tool

## Prerequisites

- Install: `npm install -g my-tool` (or check with `my-tool --version`)
- Required: Node 18+, API key in `$MY_TOOL_KEY`

## Quick Reference

```bash
my-tool init                    # Scaffold new project
my-tool build                   # Build artifacts
my-tool validate <file>         # Check file for errors
my-tool deploy --target prod    # Deploy to production
```

## Workflow

1. **Initialize** — Run `my-tool init` in the project root
2. **Configure** — Edit `my-tool.config.json` with project settings
3. **Build** — Run `my-tool build` and check for warnings
4. **Validate** — Run `my-tool validate dist/` to catch issues
5. **Fix** — If validation fails, fix issues and repeat from step 3
6. **Deploy** — Run `my-tool deploy` only after clean validation

## Decision Tree

- **New project?** → Start at step 1
- **Existing project, making changes?** → Start at step 3
- **CI pipeline?** → Run steps 3–4 only (deploy handled by CI)
- **Validation errors?** → Check `my-tool validate --verbose` for details

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `CONFIG_NOT_FOUND` | Missing config file | Run `my-tool init` |
| `AUTH_FAILED` | Bad or expired API key | Refresh `$MY_TOOL_KEY` |
| `BUILD_FAILED` | Syntax error in source | Check build output for file:line |

## When NOT to Use

- For one-off scripts that don't need build tooling
- When the project already uses [alternative tool] — don't mix
````

## Design/Process Skill Template

For open-ended creative or architectural work. Target: 800–1500 words.

````markdown
---
name: my-process
description: "Design and implement [artifact type] with [quality goal]. Use when asked to create, review, or redesign [specific things]."
---

# My Process

## When to Use

- Creating a new [artifact] from scratch
- Reviewing an existing [artifact] for quality or consistency
- Redesigning [artifact] based on new requirements

## Inputs to Gather

Before starting, ask the user 2–4 of these questions (skip what's already clear):

1. Who is the target audience?
2. What existing [artifacts] should this be consistent with?
3. Are there constraints (performance, accessibility, compatibility)?
4. What's the definition of "done"?

## Principles

### Principle 1: [Name]
[1–2 sentences explaining the principle and why it matters]

### Principle 2: [Name]
[1–2 sentences]

### Principle 3: [Name]
[1–2 sentences]

## Guidelines

### [Area 1]

- Do [specific action] — it achieves [goal]
- Prefer [approach A] over [approach B] for [context]
- When [condition], use [technique] instead of the default

### [Area 2]

- [Specific, actionable guidance]
- [With rationale]

### [Area 3]

- [Specific, actionable guidance]

## Anti-Patterns

❌ **[Bad Pattern Name]**
[What it looks like and why it's harmful]
```
// Bad: [concrete example of the anti-pattern]
```

✅ **Instead:**
[What to do and why it's better]
```
// Good: [concrete example of the correct approach]
```

❌ **[Another Bad Pattern]**
[Description]

✅ **Instead:**
[Correction]

## Deliverables

The output should include:

1. [Primary artifact] — [description of what it contains]
2. [Secondary artifact, if any] — [description]
3. [Optional: documentation, tests, etc.]

## Quality Checklist

- [ ] [Measurable quality criterion 1]
- [ ] [Measurable quality criterion 2]
- [ ] [Measurable quality criterion 3]
- [ ] [Measurable quality criterion 4]
- [ ] Anti-patterns avoided (check each one above)
- [ ] Deliverables complete and consistent
````

## Tips for Adapting Templates

- **Don't keep empty sections** — Remove any H2 that has no content for your skill
- **Add sections freely** — Templates are starting points, not rigid formats
- **Convention skills** should feel like a reference card — dense, scannable
- **Tool skills** should feel like a runbook — step-by-step, copy-pasteable
- **Design skills** should feel like a mentor — asking questions, then guiding
- **Cross-reference** other files with relative links: `See [API details](references/api.md)`
- **Keep the main SKILL.md under 500 lines** — move extras to `references/`
