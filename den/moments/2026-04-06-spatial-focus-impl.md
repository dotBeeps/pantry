# Spatial Focus Implementation Session

**Date:** 2026-04-06
**Status:** Implemented, pending manual testing via `/reload`

## What We Did

Replaced dragon-parchment's linear focus cycling (`Alt+T` / `Shift+Tab`) with a full spatial panel management system: directional focus navigation, panel resize, and panel nudge.

## Changes (7 files, +457 / -86)

| File | Delta | What Changed |
|------|-------|-------------|
| `dragon-parchment.ts` | +390/-72 | Core rewrite — spatial nav, resize, nudge, focus history stack |
| `dragon-inquiry.ts` | +17/-4 | `passthroughToPanel()` routes 4 directional focus keys |
| `kobold-housekeeping.ts` | +7/-4 | 3 call sites: `cycleFocus` → `focusDirection`, help text |
| `dragon-digestion.ts` | +2/-2 | Help text fallback strings |
| `dragon-guard/index.ts` | +1/-1 | Help text fallback strings |
| `dragon-musings.ts` | minor | Unrelated (stash artifact) |
| `settings.ts` | -1 | Removed dead `panels.focusKey` legacy mapping |

## New Features

### Spatial Focus Navigation
- `focusDirection("left" | "right" | "up" | "down")` method
- Nearest-neighbor algorithm: half-plane filter + weighted scoring (primary distance + 0.3× secondary penalty)
- When unfocused, first press focuses nearest panel to terminal center
- No-op at edges (no wrapping)

### Focus History Stack
- Replaced `focusOrder[]` with `_focusHistory[]` (MRU stack with dedup)
- On panel close: walks history to auto-focus the previously-focused surviving panel
- `unfocusAll()` preserves history (Escape → re-enter focus works)

### Panel Resize
- `resizePanel(id, "wider" | "narrower" | "taller" | "shorter")`
- Symmetric from center (vim-split style)
- Min 20 cols × 5 rows, max full terminal, step 2 cells
- Uses `_reopenPanel()` helper for silent close + recreate

### Panel Nudge
- `nudgePanel(id, "left" | "right" | "up" | "down")`
- Converts anchor-based positioning to absolute on first nudge
- Encodes position as `top-left` anchor + `margin:0` + `offsetX/Y`
- Terminal edge clamping

### Focus-on-Open Default
- `focusOnOpen` now defaults to `true` (was `false`)

## Final Keybinds

| Modifier | Keys | Action |
|----------|------|--------|
| `Alt+Shift+` | `←↓↑→` | Spatial focus navigation |
| `Alt+Ctrl+` | `←↓↑→` | Resize panel |
| `Ctrl+Shift+` | `←↓↑→` | Nudge panel position |
| `Escape` | | Unfocus all |
| `Q` | | Close focused panel |
| `J` / `K` | | Scroll content (no conflict with focus keys) |
| `[` / `]` | | Cycle panel skin |

### Keybind Journey
1. Started with `Alt+H/J/K/L` (vim-style) → switched to arrows to avoid Ctrl+H=backspace and Shift+H=uppercase risks
2. Tried `Alt+Arrows` for focus → conflicts with pi's word cursor movement (`tui.editor.cursorWordLeft/Right`) and message dequeue (`Alt+Up`)
3. Tried `Ctrl+Arrows` → conflicts with pi's word cursor + tree fold/unfold
4. Landed on all double-modifier combos — `Alt+Shift`, `Alt+Ctrl`, `Ctrl+Shift` — no conflicts with any pi builtins

## Removed

- `cycleFocus()` method (deprecated alias routes to `focusDirection("right")`)
- `cycleVirtualFocus()` compat alias (same)
- `FOCUS_KEY` constant (`alt+t`)
- `focusReverse` keybind (`shift+tab`)
- `hoard.panels.focusKey` setting
- `hoard.panels.keybinds.focusReverse` setting
- Legacy map entry `"panels.focusKey": "panelFocusKey"` in settings.ts

## API Surface Changes

### Added to globalThis `Symbol.for("hoard.parchment")`
- `focusDirection(dir)` — spatial focus
- `resizePanel(id, dir)` — resize
- `nudgePanel(id, dir)` — nudge

### Changed
- `keyHints.spatialFocusKey` replaces `keyHints.focusKey`
- `rawKeys.focusLeft/Right/Up/Down` replaces `rawKeys.focus`

### Deprecated (still present as stubs)
- `cycleFocus()` → routes to `focusDirection("right")`
- `cycleVirtualFocus()` → same
- `setVirtualFocus()` → routes to `setFocus()`
- `getVirtualFocusId()` → routes to `getFocusedId()`

## Type Check
Zero new errors. 9 pre-existing `session_switch`/`session_fork` errors across 4 files unchanged.

## Still TODO
- [ ] Manual testing via `/reload`
- [ ] Make resize/nudge step sizes read from settings (`hoard.panels.resizeStep`, `hoard.panels.nudgeStep`)
- [ ] Update `morsels/skills/dragon-parchment/SKILL.md` docs
- [ ] Update `den/plans/panel-spatial-focus.md` and `panel-spatial-focus-implementation.md` to reflect final keybind choices

## Process Notes
- Used parallel subagent workers with git worktrees — 5 workers, each on a different file
- Main parchment rewrite (Phases 1-4) was one worker; Phase 5 consumer updates split across 4 workers
- Workers ran in parallel since they touched different files; merged via `git apply`
- One worker (kobold-housekeeping) had patch conflicts due to stash-popped extra files — applied edits manually
- Worker 1 made creative deviations from spec (different min sizes, step sizes, keybind modifiers, resize direction naming) — some were kept (naming, double-modifier keybinds), some were corrected (step sizes)
