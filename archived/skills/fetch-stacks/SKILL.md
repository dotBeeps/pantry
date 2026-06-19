---
name: fetch-stacks
description: "Pull stack convention files into the current project by running detection heuristics from SessionStart hooks. Use when the user wants to refresh or load specific language/framework convention rules into .claude/rules/."
license: MIT
---

# /fetch-stacks

Pull in stack convention files for the current project by running detection heuristics from SessionStart hooks.

## Arguments

`/fetch-stacks [stack-name]` — optional. If provided, only fetch that specific stack (e.g., `go`, `typescript`, `react`). If omitted, auto-detect all applicable stacks.

## Steps

### 1 — Read the hook registry

Read `~/.claude/settings.json` and extract the `hooks.SessionStart[0].hooks` array. Each entry has a `command` field with this structure:

```
(<detection-heuristic>) && mkdir -p .claude/rules && cp /home/dot/.claude/<stack>.md .claude/rules/<stack>.md 2>/dev/null || true
```

Parse each command to extract:

- The **stack slug** — the filename without `.md` from the `cp` source path (e.g., `go-tui` from `/home/dot/.claude/go-tui.md`)
- The **full command** — the entire hook command string

### 2 — Filter by argument (if provided)

If a `stack-name` argument was given:

- Find the hook whose stack slug matches (case-insensitive, partial match is fine: `go` matches `go`, `tui` matches `go-tui`)
- If no match found, check if `~/.claude/<stack-name>.md` exists anyway and copy it directly
- If still no match, report that no stack file was found for that name

If no argument was given, use all hooks.

### 3 — Run detection and copy

For each selected hook command, run it via Bash in the current working directory. The commands are self-contained — they detect the stack, create `.claude/rules/`, and copy the file, all in one shot.

Run all selected commands in parallel where possible.

### 4 — Report results

After running, check which files now exist in `.claude/rules/` by listing the directory. Report:

- Which stack convention files were loaded (list the filenames)
- If none matched, say so

Keep the output short — just a list of what was pulled in.

## Rules

- Never modify the convention files — just copy them as the hooks do
- If `.claude/rules/` doesn't exist yet, the hook commands create it
- Don't run hooks for stacks that already have an up-to-date file in `.claude/rules/` unless the user explicitly asked for that stack by name (in which case, overwrite to get the latest)
- When no argument is given, this is a bulk "refresh all applicable stacks" operation
