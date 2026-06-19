---
name: go-tui
description: Go TUI conventions for Charmbracelet ecosystem (Bubble Tea, Bubbles, Lip Gloss, Huh). Use when building terminal UIs in Go with bubbletea.
license: MIT
---

# Go TUI Conventions (Charmbracelet)

Conventions for building terminal UIs with the Charmbracelet ecosystem: Bubble Tea, Bubbles, Lip Gloss, Huh, Glamour, Wish, Log, Harmonica.

## Import Paths

- v2 libraries use `charm.land` import paths: `charm.land/bubbletea/v2`, `charm.land/lipgloss/v2`, `charm.land/x`
- v1 libraries still use `github.com/charmbracelet/...` — check your `go.mod` and be consistent
- Prefer v2 for new projects — v1 is maintenance-only

## Bubble Tea (MVU Architecture)

- Every model implements `Init`, `Update`, `View` — no exceptions, no shortcuts
- `Init` returns a `tea.Cmd` for startup work (timers, initial data fetch) — return `nil` if nothing to do
- `Update` receives a `tea.Msg`, returns `(tea.Model, tea.Cmd)` — always return the model even on no-op
- `View` returns a `string` — it must be a pure function of the model with no side effects
- Use `tea.Cmd` for all I/O (HTTP calls, file reads, timers) — never block in `Update`
- Use `tea.Batch` to combine multiple commands
- Type-switch on `tea.Msg` in `Update` — handle `tea.KeyPressMsg`, `tea.WindowSizeMsg`, and your custom messages
- Custom messages are plain structs — keep them small, name them `<thing>Msg`
- Quit with `tea.Quit` command, not `os.Exit`

## Model Design

- Keep models as plain structs with value types where possible
- Break complex UIs into sub-models — each with their own `Update` and `View`
- Parent model delegates messages to child models and collects their commands
- Store terminal dimensions (`width`, `height`) on the model via `tea.WindowSizeMsg`
- Use an `enum`-style `int` for view state (e.g., `stateMenu`, `stateForm`, `stateResult`)

## Bubbles (Components)

- Use `bubbles` for standard components: `textinput`, `textarea`, `list`, `table`, `spinner`, `viewport`, `paginator`, `progress`
- Initialize components in your model's constructor, not in `Init`
- Forward relevant messages to bubble components in `Update`: `m.textInput, cmd = m.textInput.Update(msg)`
- Collect commands from all updated bubbles with `tea.Batch`
- Configure bubbles before first render — set `Width`, `Placeholder`, `CharLimit`, etc.

## Lip Gloss (Styling)

- Define styles as package-level vars or on the model — don't recreate in `View`
- Use `lipgloss.NewStyle()` and chain: `.Foreground()`, `.Background()`, `.Bold()`, `.Padding()`, `.Margin()`, `.Border()`
- Use `lipgloss.Color("63")` for ANSI256 or `lipgloss.Color("#FF00FF")` for hex — Lip Gloss auto-degrades
- Use `lipgloss.JoinHorizontal` / `lipgloss.JoinVertical` for layout composition
- Use `lipgloss.Place` for centering content in a region
- Tables: use `lipgloss/table` sub-package with `StyleFunc` for row/col-aware styling
- Render with `.Render(str)` — styles are immutable, `.Render` does not mutate

## Huh (Forms & Prompts)

- Use `huh` for interactive forms instead of hand-rolling input flows
- Structure: `huh.NewForm(groups...)` → `huh.NewGroup(fields...)` → fields (`Input`, `Select`, `MultiSelect`, `Confirm`, `Text`)
- Bind values with `.Value(&target)` — huh writes directly to your variables
- Validate with `.Validate(func(string) error)` — return `nil` for valid, `error` for invalid
- Use `.WithHideFunc` on groups for conditional/dynamic form pages
- Support accessibility: `form.WithAccessible(os.Getenv("ACCESSIBLE") != "")` for screen reader mode
- Run standalone forms with `form.Run()`, or embed in Bubble Tea with `form.WithShowHelp(false)`

## Glamour (Markdown Rendering)

- Use `glamour` to render markdown in the terminal — don't hand-roll ANSI formatting for docs/help
- Pick a style: `glamour.DarkStyle`, `glamour.LightStyle`, or `glamour.AutoStyle` (respects terminal background)
- Render with `glamour.RenderWithEnvironmentConfig(markdownStr)` for auto-detection
- Set word wrap width to match terminal width

## Log (Structured Logging)

- Use `charm.land/log` for pretty, structured terminal logging — it wraps `log/slog`
- Use for CLI feedback during non-TUI phases (setup, teardown) — not inside Bubble Tea's render loop
- Inside Bubble Tea: use `tea.LogToFile` for debug logging that doesn't corrupt the TUI

## Wish (SSH Apps)

- Use `wish` to serve Bubble Tea apps over SSH
- Middleware pattern: chain `wish.Middleware` functions for auth, logging, and app serving
- Use `bubbletea.Middleware` to wrap your Bubble Tea model as wish middleware
- Handle `ssh.Session` for per-user state — don't share mutable state across sessions

## Harmonica (Animation)

- Use `harmonica` for physics-based animations: spring, damping, friction
- Create a `harmonica.Spring` or `harmonica.FPS` animator
- Drive animations via `tea.Tick` commands — update position each frame in `Update`
- Keep animation state on the model, not in globals

## Project Structure

- `main.go` — program setup, `tea.NewProgram(model).Run()`
- `model.go` — root model, `Init`, `Update`, `View`
- `styles.go` — all Lip Gloss styles in one place
- `messages.go` — custom `tea.Msg` types
- Split sub-models into their own files when they exceed ~100 lines
- Keep commands (I/O functions returning `tea.Cmd`) near the model that uses them

## Testing

- Test `Update` by sending messages directly and asserting model state
- Test `View` by checking the returned string contains expected content
- Use `teatest` package for integration testing full programs
- Mock I/O by injecting dependencies into the model, not by mocking Bubble Tea internals

## Common Patterns

- **Loading state**: spinner bubble + custom `loadedMsg` from a `tea.Cmd`
- **Error display**: store `err` on model, render in `View` when non-nil, clear on next action
- **Key help**: use `bubbles/help` with `key.Binding` for contextual key hints
- **Responsive layout**: recalculate component widths in `tea.WindowSizeMsg` handler
