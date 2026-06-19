---
name: kobold-housekeeping
description: "Track tasks with tagged todos and floating panels. Use when managing work items, tracking progress, showing task lists, or grouping todos by tag in persistent overlay panels."
license: MIT
compatibility: "Designed for Pi (pi-coding-agent)"
---

# Task Tracking with Todos

Manage work items in `.pi/todos` and display them as persistent floating panels. Panels stay on screen while you work and auto-refresh when todos change.

## Two Tools, One System

| Tool | Purpose |
|------|--------|
| `todo` (built-in) | CRUD: create, update, delete, toggle, list todos in `.pi/todos` |
| `todo_panel` (extension) | Display: open, close, focus, position floating panels |

Tag todos consistently to group them into panels.

## Opening Panels

Before opening multiple panels, get layout suggestions:

```
todo_panel suggest_layout count=3
→ Panel 1: top-right 30%
  Panel 2: right-center 30%
  Panel 3: bottom-right 30%
```

Then open panels with the suggested positions:

```
todo_panel open tag="sprint" anchor="right-center" width="30%"
todo_panel open tag="bugs" anchor="bottom-right" width="30%"
todo_panel open tag="all"   # shows all todos, default position
```

To immediately focus a panel after opening, pass `focus=true`:

```
todo_panel open tag="sprint" anchor="right-center" focus=true
```

## Workflow

1. Create tagged todos with the built-in `todo` tool
2. Open a panel for that tag — it auto-refreshes on changes
3. Continue working — panels persist alongside the conversation

```
todo create title="Fix auth bug" tags=["sprint"]
todo create title="Add tests" tags=["sprint"]
todo_panel open tag="sprint" anchor="right-center"
```

## Panel Management

| Action | Effect |
|--------|--------|
| `open` | Open panel for a tag (required: `tag`; optional: `anchor`, `width`, `focus`) |
| `close` | Close a specific panel (required: `tag`) |
| `close_all` | Close every open panel |
| `focus` | Focus a panel by tag, or cycle to next if no tag given |
| `unfocus` | Remove focus from all panels |
| `list_panels` | Show all open panels with status |
| `suggest_layout` | Get position recommendations for N panels |
| `refresh` | Force re-read all panels from disk |

## Anchors

Nine positions: `top-left`, `top-center`, `top-right`, `left-center`, `center`, `right-center`, `bottom-left`, `bottom-center`, `bottom-right`.

Default: `right-center` at `30%` width.

## User Commands

Users control panels via `/todos`:

- `/todos open sprint right-center 30%`
- `/todos close sprint`
- `/todos focus` or `Alt+T` to cycle focus forward, `Shift+Tab` to cycle backward
- `/todos status` to list panels
- `/todos layout 3` for position suggestions

## Anti-Patterns

- **Wrong:** Calculating panel positions manually — use `suggest_layout`
- **Wrong:** Using `todo_panel` for CRUD — use the built-in `todo` tool
- **Wrong:** Opening many overlapping panels — check `list_panels` first and use `suggest_layout` for positioning
