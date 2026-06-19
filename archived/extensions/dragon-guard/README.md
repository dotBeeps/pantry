# dragon-guard extension

Guard rails for pi with three modes:

- **Dog Mode** (default): permission-gated neutral mode.
- **Puppy Mode**: read-only planning mode (display name for plan mode) with breathing light-blue text and periodic white sheen.
- **Dragon Mode**: implementation mode with breathing rainbow aura.

## Commands

- `/mode` – show current mode
- `/puppy` (alias: `/plan`) – enter read-only planning mode
- `/dragon` – enter implementation mode
- `/dog` (alias: `/nomode`) – enter Dog Mode
- `/guard-settings` – interactive Dog Mode allow/block configuration

## Shortcuts

- `Ctrl+Alt+P` – Puppy Mode
- `Ctrl+Alt+D` – Dragon Mode
- `Ctrl+Alt+N` – Dog Mode

## Behavior

- Starts in **Dog Mode** on new sessions.
- In **Dog Mode**, before any tool not on the extension config allowlist (`GUARD_CONFIG.dogModeAllowedTools`, default: `read`, `ls`, `find`, `grep`, `questionnaire`) runs, pi prompts:
  - allow the tool call once,
  - always allow that tool in Dog Mode for this session,
  - enter Puppy Mode,
  - or enter Dragon Mode.
- `/guard-settings` lets you manage Dog Mode session allowlist + blocklist in-TUI.
- Dog Mode session blocklist takes precedence over allowlist.
- The prompt includes `ToolName(parameters)` plus a one-line expected-impact summary generated with Anthropic Haiku.
- If prompt complexity is high, pi auto-enters **Puppy Mode** before acting.
- In **Puppy Mode**, safe read-only tools run directly; restricted tools (including mutating bash, edit/write, or subagent) trigger a guard prompt with options to allow once, allow for session, switch to Dragon Mode, or stay in Puppy planning mode.
- In **Dragon Mode**, all tools are allowed.
