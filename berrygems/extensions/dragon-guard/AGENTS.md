> **Part of [Pantry](../../../AGENTS.md)** — read root AGENTS.md for context.

# dragon-guard Extension

## What It Does

**dragon-guard** is a three-tier permission system for tool calls. It lets the user control how aggressively the agent explores the codebase and system through a modal, stateful permission model.

Three modes:

- **Puppy Mode** (`plan`): Read-only planning. Safe bash commands (`cat`, `diff`, `git status`) and read-only tools auto-allow. Mutating tools require permission. Designed for analysis and planning before implementation.
- **Dog Mode** (default, `none`): Permission-gated. Tools like `edit` and `write` prompt for confirmation before executing. Safe read-only tools (`read`, `ls`, `find`, `grep`) auto-execute. User can allow-once, allow-this-session, or switch modes from the dialog.
- **Dragon Mode** (`dragon`): All tools allowed, no prompting. Full implementation mode. Manual activation only, primary session only.

Mode state persists across session branches via session entries.

## How It Works

### Event Interception

The extension hooks into `tool_call` events and evaluates a decision tree:

```
tool_call event
├─ Dragon Mode? → allow immediately
├─ Puppy Mode?
│  ├─ Tool in session-allowed list? → allow
│  ├─ bash command safe (read-only pattern)? → allow
│  ├─ Otherwise → prompt for permission
└─ Dog Mode?
   ├─ Tool in default allowed list? → allow
   ├─ Tool in session-blocked list? → block
   ├─ Otherwise → prompt for permission
```

### Permission Dialogs

When a tool requires permission, the extension:

1. **Formats** the tool call (name + truncated JSON params)
2. **Optionally summarizes** using Haiku LLM (if `llmSummaries: true`) to explain potential impact
3. **Prompts** the user with:
   - Allow this tool call once
   - Allow {toolName} for this session
   - Switch to next tier (Puppy → Dragon, Dog → Puppy, etc.)
   - Block (Dog Mode only)

Tool summaries are LLM-accelerated to catch nuanced impact (e.g., "this bash command will delete files").

### Complexity Auto-Detection

Before agent start, if Dog Mode is active and the prompt looks complex (`complexityScore(prompt) >= threshold`), auto-switch to Puppy Mode and notify the user. Triggers on:

- Keywords: "refactor", "architecture", "migration", "plan", "design"
- Sequencing words: "first", "then", "step", "phase"
- Broad scope: "entire codebase", "all files", "throughout"

Reduces score for questions ("what is", "how does").

### Bash Classification

Puppy Mode uses pattern-based bash classification:

**SAFE_PLAN_BASH** (auto-allow in Puppy):

- Read-only: `cat`, `head`, `tail`, `diff`, `grep`, `rg`, `jq`
- Directory: `ls`, `find`, `pwd`, `tree`
- System info: `env`, `uname`, `date`, `uptime`, `du`, `df`
- Git read-only: `git status`, `git log`, `git diff`
- Package queries: `npm list`, `yarn info`, `pip freeze`

**MUTATING_BASH** (prompt in Puppy):

- File ops: `rm`, `mkdir`, `touch`, `chmod`
- Package mutations: `npm install`, `yarn add`, `pip install`
- Git mutations: `git add`, `git commit`, `git push`, `git rebase`
- Privilege: `sudo`, `su`
- System: `kill`, `systemctl start/stop`, `reboot`

Chained commands (`; && ||`) are always considered mutating.

### Session Persistence

State (mode + tool overrides) is stored via `pi.appendEntry()` as `dragon-guard-state` custom entries. Reconstructed on `session_start`, `session_switch`, `session_fork`, `session_tree`.

Tool override sets:

- `dogModeSessionAllowedTools` — tools allowed in this session (Dog Mode only)
- `dogModeSessionBlockedTools` — tools blocked in this session (Dog Mode only)
- `puppyModeSessionAllowedTools` — tools allowed in this session (Puppy Mode only)

User can reset all overrides via the guard panel.

### UI & Status

- **Footer status**: Animated mode indicator (`[DRAGON MODE]`, `[PUPPY MODE]`, etc.) with breathing color effect
- **Guard panel** (`/guard` or `Alt+G`): Settings UI for mode, auto-detect, sensitivity, LLM summaries, session overrides. ↑↓ navigate, ←→ adjust values, Space to toggle, Q to close.
- **Commands**: `/dragon`, `/puppy`, `/dog`, `/mode`, `/guard`, `/guard-settings`
- **Shortcuts**: `Ctrl+Alt+D` (dragon), `Ctrl+Alt+P` (puppy), `Ctrl+Alt+N` (dog), `Alt+G` (panel)

### Subagent Filtering

When the daemon spawns a subagent (child process), `PI_SUBAGENT_DEPTH > 0` causes the extension to bail out entirely. This prevents guard prompts and context injections from confusing worker processes.

## Configuration

All settings live under `pantry.guard.*` in `~/.pi/agent/settings.json` or `.pi/settings.json`:

| Setting                            | Type     | Default                                                   | Notes                                         |
| ---------------------------------- | -------- | --------------------------------------------------------- | --------------------------------------------- |
| `pantry.guard.autoDetect`          | bool     | `true`                                                    | Auto-switch to Puppy Mode for complex prompts |
| `pantry.guard.complexityThreshold` | number   | `4`                                                       | Score threshold (higher = less sensitive)     |
| `pantry.guard.llmSummaries`        | bool     | `true`                                                    | Use Haiku to summarize tool calls in dialogs  |
| `pantry.guard.dogAllowedTools`     | string[] | `["read", "ls", "find", "grep", "questionnaire"]`         | Default Dog Mode whitelist                    |
| `pantry.guard.puppyAllowedTools`   | string[] | `["read", "ls", "find", "grep", "questionnaire", "bash"]` | Default Puppy Mode whitelist                  |
| `pantry.guard.dragonKey`           | string   | `"ctrl+alt+d"`                                            | Keyboard shortcut to Dragon Mode              |
| `pantry.guard.puppyKey`            | string   | `"ctrl+alt+p"`                                            | Keyboard shortcut to Puppy Mode               |
| `pantry.guard.dogKey`              | string   | `"ctrl+alt+n"`                                            | Keyboard shortcut to Dog Mode                 |
| `pantry.guard.panelKey`            | string   | `"alt+g"`                                                 | Keyboard shortcut to toggle guard panel       |

Example `.pi/settings.json`:

```json
{
  "pantry": {
    "guard": {
      "autoDetect": false,
      "complexityThreshold": 5,
      "llmSummaries": false,
      "dogAllowedTools": ["read", "ls", "find", "grep", "bash"],
      "puppyAllowedTools": ["read", "ls", "find", "grep", "bash"]
    }
  }
}
```

## Patterns & Anti-Patterns

### Patterns

1. **Use Dog Mode for exploratory work** — safe default that encourages intentional tool use.
2. **Auto-detect + Puppy Mode for large tasks** — let complexity detection kick in, then review the plan before implementing.
3. **Session-scoped overrides** — "always allow {tool}" persists for the current session but resets on session switch (prevents permission creep).
4. **LLM summaries for risky commands** — useful for catching subtle file mutations (e.g., `sed` edits) that regex patterns might miss.
5. **Bash patterns for Puppy Mode** — e.g., `git status`, `npm list` are allowed without prompting (safe inspection).

### Anti-Patterns

1. **Disabling the guard** — setting all tools to allowed breaks the intent. Use Dragon Mode explicitly instead.
2. **Over-permissive `dogAllowedTools`** — resist adding `edit`, `write`, or `bash` to defaults; use session overrides for specific tasks.
3. **Ignoring LLM summaries** — for complex tool calls, summaries catch edge cases the guard's rules don't.
4. **Chained bash commands in Puppy Mode** — `cat x.txt && rm y.txt` is always mutating (blocked by `&&`), but users sometimes expect it to pass because `cat` is safe.
5. **Relying on bash patterns alone** — some mutations are subtle (e.g., `tee` is in MUTATING because it can write). Patterns are best-effort.

### Extension Integration Notes

- **No direct tool mutation** — the guard blocks tool calls at the event level, never modifies tool definitions or handlers.
- **Session persistence is branch-aware** — each session branch reconstructs state from its own entry list, so mode/overrides don't bleed across branches.
- **Panel manager dependency** — the guard panel requires `dragon-parchment` to be loaded. If unavailable, `/guard` commands still work (status, mode switches) but the UI panel won't render.
- **Subagent isolation** — subagent child processes skip the extension entirely (check `PI_SUBAGENT_DEPTH`), so guard constraints don't leak into worker reasoning.

## File Structure

```
dragon-guard/
├── index.ts           Entry point, event hooks, commands, UI rendering
├── settings.ts        Settings readers (pantry.guard.*), mutable accessors
├── state.ts           Mode, tool policies, session persistence, reconstruction
├── panel.ts           Guard panel component (chrome, items, input, render)
└── bash-patterns.ts   Safe/mutating bash regex patterns, classification
```
