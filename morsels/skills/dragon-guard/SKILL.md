---
name: dragon-guard
description: Three-tier permission system for tool calls — Dog (permission-gated), Puppy (read-only planning), Dragon (full implementation). Blocks potentially harmful tool calls and guides planning-first workflows.
license: MIT
compatibility: "Designed for Pi (pi-coding-agent)"
---

# Dragon Guard — Permission-Gated Tool Calls

## What It Does & Why Tools Get Blocked

**dragon-guard** is a permission system that decides whether the agent can execute each tool call based on the current mode and what the tool does.

When a tool is blocked, you'll see a message like:

> Tool use blocked in Dog Mode until permission is granted or Dragon Mode is enabled.

This happens because the extension evaluated the tool call against three rules:

1. Is the tool in the default/session allow list? → Execute
2. Is the tool in the session block list? → Block
3. Otherwise → Prompt for permission (or block without UI)

The guard does **not** prevent read-only inspection tools (`read`, `ls`, `grep`) in any mode — only tools that modify files, systems, or state.

## The Three Permission Tiers

### Dog Mode (default) — Permission-Gated

- **Safe tools auto-allowed**: `read`, `ls`, `find`, `grep` (read-only inspection)
- **Other tools require permission**: `edit`, `write`, `bash`, `questionnaire`, and any unrecognized tools
- **From the dialog you can**: Allow once, allow for this session, switch to Puppy, or switch to Dragon
- **Use when**: Exploring unfamiliar code or doing cautious analysis

### Puppy Mode — Read-Only Planning

- **Safe tools auto-allowed**: `read`, `ls`, `find`, `grep`, + safe bash commands (`cat`, `diff`, `git status`, `npm list`)
- **Mutating tools require permission**: File writes (`edit`, `write`), git mutations (`git commit`, `git push`), package changes (`npm install`), system commands (`sudo`, `kill`)
- **Bash classification**: Bash commands are scanned for read-only patterns. Chained commands (`cmd1 && cmd2`) are always considered mutating
- **From the dialog you can**: Allow once, allow for this session, or switch to Dragon
- **Use when**: Planning an implementation before writing code. Auto-triggered on complex prompts

### Dragon Mode — Full Implementation

- **All tools allowed**: No prompting, no blocking, all tool calls execute immediately
- **Best for**: Active coding, when you know what you're doing and want fast iteration
- **Status indicator**: Animated `[DRAGON MODE]` in the footer

## How to Check Current Guard Mode

Use the `/mode` command:

```
/mode
→ Current guard mode: Dog Mode
```

Or open the guard panel with `/guard` (or `Alt+G`). The panel shows:

- Current mode (Dog, Puppy, Dragon)
- Auto-detect status (ON/OFF)
- Sensitivity slider (2–8)
- LLM summaries (ON/OFF)
- Session-scoped tool overrides

## What to Do When a Tool Call is Blocked

When the guard blocks a tool call, you'll get a dialog:

```
Allow tool use?
read("/some/file.ts")
Read file contents without modifying files.

[ Allow this tool call once ]
[ Always allow read in Dog Mode (this session) ]
[ Enter Puppy Mode (read-only planning) ]
[ Enter Dragon Mode (implement now) ]
```

**Your options:**

1. **Allow this tool call once** — Let it execute just this one time. Next call will re-prompt
2. **Always allow {tool} (this session)** — Add to the allow list for this session. Persists until session ends
3. **Switch modes** — Move to Puppy (if in Dog) or Dragon to bypass guards entirely
4. **Block** — If you close the dialog or hit Escape, the call is blocked

**Strategy:**

- Use **allow once** for experimental or one-off calls
- Use **allow this session** when you know you'll call a tool repeatedly (e.g., `/edit` for a long refactor)
- Use **switch modes** if the dialog is too noisy or you're confident in what you're doing

## Commands & Keybinds

| Command         | Shortcut     | Effect                                    |
| --------------- | ------------ | ----------------------------------------- |
| `/mode`         | —            | Show current mode                         |
| `/dragon`       | `Ctrl+Alt+D` | Switch to Dragon Mode (all tools)         |
| `/puppy`        | `Ctrl+Alt+P` | Switch to Puppy Mode (read-only planning) |
| `/dog`          | `Ctrl+Alt+N` | Switch to Dog Mode (permission-gated)     |
| `/guard`        | `Alt+G`      | Toggle the guard panel                    |
| `/guard status` | —            | Show config and session overrides         |

## Tips

- **Auto-detect**: Detect complex prompts and auto-switch to Puppy Mode. Controlled by `/guard` panel → `Auto-Detect` toggle
- **Sensitivity**: Adjust how "complex" a prompt needs to be to trigger auto-Puppy (higher number = less sensitive)
- **LLM summaries**: When on, the guard uses Claude Haiku to summarize tool calls in permission dialogs ("this will delete files")
- **Reset**: Open `/guard` and press Space on the "⟲ Reset Overrides" button to clear all session-scoped tool permissions

## Example Workflow

```
1. Start in Dog Mode (default)
   → /dog or just keep it

2. Agent runs: wants to call /edit on foo.ts
   → Permission dialog appears
   → You choose "Always allow edit in Dog Mode (this session)"
   → All future /edit calls allowed this session

3. Agent tries: /bash with "npm install"
   → Blocked (Dog Mode doesn't auto-allow bash)
   → Switch to Dragon Mode
   → /dragon

4. Agent implements the rest with full tool access

5. Next session: Resets to Dog Mode
   → Permissions don't carry over (safe default)
```

## Settings

Configure dragon-guard in `~/.pi/agent/settings.json` or `.pi/settings.json`:

```json
{
  "pantry": {
    "guard": {
      "autoDetect": true,
      "complexityThreshold": 4,
      "llmSummaries": true
    }
  }
}
```

Read more in `/home/dot/Development/hoard/berrygems/extensions/dragon-guard/AGENTS.md`.
