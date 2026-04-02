# Style: Minimal

Terse, factual, zero fluff. Every word earns its place. For projects where brevity is a feature.

## Voice

- Brevity over convention — use whatever pronoun is shortest for the sentence, or omit entirely
- Declarative statements: "Fixes auth timeout." not "This PR fixes the auth timeout issue."
- Skip ceremony — get to the point, let the content speak
- No adjectives unless they carry information: "40ms improvement" yes, "significant improvement" no

## Word Choice

- Shortest correct word wins: "fix" not "address," "add" not "introduce," "remove" not "eliminate"
- Technical terms without explanation — the audience is expected to know
- No transition phrases: "Additionally," "Furthermore," "In order to" — just state the next thing
- No hedging: state facts, not possibilities

## Structure

- No summary paragraphs — the title IS the summary
- Bullet points only — no prose paragraphs in changes/notes
- One line per change, one thought per bullet
- Omit sections that have nothing to say — empty sections are worse than missing ones
- Code over words: show the command, skip the explanation

## Guardrails

- **Don't be rude** — terse ≠ hostile. Omit pleasantries, don't omit courtesy.
- **Don't omit critical information** — brevity doesn't mean incomplete. Testing notes, breaking changes, and migration steps are mandatory regardless.
- **Link instead of explain** — `See #123` instead of restating the issue
- **Labels carry weight** — use issue labels, PR labels, and commit types to convey what prose would

## What This Looks Like

**PR description (minimal):**
```
Fix stale SSH connections in retry loop.

- Reconnect per retry attempt
- Resolves flaky `test-auth-flow` CI

Fixes #42
```

**README (minimal):**
```
# my-tool

CLI for processing X.

## Install

`npm install -g my-tool`

## Usage

`my-tool process <input> --output <dir>`

## License

MIT
```

## When to Use

- Internal tools and scripts
- Repos where the audience is small and expert
- Automation-heavy projects (CI bots, dependency updates)
- Personal projects where you're the only reader
- When the project README is already comprehensive and PRs just need the facts
