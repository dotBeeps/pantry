---
name: hoard-memory
description: Search, read, and write notes in Ember's persona memory vault via the storybook-daemon. Use when you want to persist observations, look up prior decisions, or retrieve context from previous sessions.
---

# Hoard Memory

Access Ember's memory vault through the storybook-daemon MCP tools.

## Search

```
mcp__storybook-ember__memory_search(query="auth middleware", limit=5)
```

Returns matching notes with key, kind, tags, summary, and last-updated timestamp.
Use `limit` to control how many results come back (default 10).

## Read a Note

```
mcp__storybook-ember__memory_read(title="<note-key>")
```

Returns the full note content including frontmatter (kind, tags, pinned, created, updated).

## Write a Note

```
mcp__storybook-ember__memory_write(
  title="<slug-style-key>",
  kind="observation",
  content="<note body>",
  tags=["tag1", "tag2"]
)
```

### Note Kinds

| Kind          | Use For                                               |
| ------------- | ----------------------------------------------------- |
| `observation` | Facts noticed about the codebase, system, or behavior |
| `insight`     | Synthesized understanding from multiple observations  |
| `decision`    | Architectural or design choices made (and why)        |
| `wondering`   | Open questions, things to investigate later           |
| `fragment`    | Loose notes, quotes, snippets not yet categorized     |

## When to Use

- **Write** after any significant discovery — decisions, insights, surprising behavior
- **Search** at session start to recall relevant prior context
- **Read** when you find a note in search results and need the full content
- **Don't write** for ephemeral task notes — use temporary files for that
