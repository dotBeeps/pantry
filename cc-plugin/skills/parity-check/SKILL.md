---
name: parity-check
description: "Audit pi/cc capability parity across the hoard. Use when adding or removing a morsel, cc-plugin skill, cc-plugin agent, or berrygem extension — or when the stop-parity-check hook reports drift. Reads .claude/parity-map.json and compares it against on-disk artifacts in morsels/skills, cc-plugin/skills, cc-plugin/agents, and berrygems/extensions. Reports unregistered artifacts and stale map entries."
license: MIT
compatibility: "Designed for Claude Code (hoard cc-plugin); pi has no equivalent because the map lives on the CC side."
---

# Parity Check

Manually audit the hoard's pi ↔ cc capability parity. Complements the `stop-parity-check.fish` Stop hook (which only fires on sessions that touched parity-relevant paths) — this skill lets you run a full audit any time.

## When to Use

- You just added or removed a morsel, a cc-plugin skill, a cc-plugin agent, or a berrygem extension.
- The `stop-parity-check` hook warned about drift and you want to see the full picture.
- You're planning a refactor that will move capabilities from one side to the other.
- You want to sanity-check the parity map after a plugin install on either side.

## How It Works

The hoard maintains `.claude/parity-map.json` — a per-artifact registry describing what exists on each side of the pi/cc boundary and how each capability is covered.

**Schema:**

```json
{
  "morsels": {
    "<morsel-name>": {
      "cc": "<cross-ref or null>",
      "note": "<optional explanation>"
    }
  },
  "cc-plugin-skills": {
    "<skill-name>": { "pi": "<cross-ref or null>", "note": "..." }
  },
  "cc-plugin-agents": {
    "<agent-name>": { "pi": "<cross-ref or null>", "note": "..." }
  }
}
```

**Cross-ref values:**

| Value               | Meaning                                                                                | Disk-checked?      |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------ |
| `null`              | Intentionally unavailable on the other side                                            | no                 |
| `morsels:<name>`    | Morsel at `morsels/skills/<name>/SKILL.md`                                             | yes                |
| `cc-plugin:<name>`  | cc-plugin skill or agent at `cc-plugin/skills/<name>/` or `cc-plugin/agents/<name>.md` | yes                |
| `berrygems:<name>`  | Berrygem extension at `berrygems/extensions/<name>/`                                   | yes                |
| `cc-builtin:<name>` | External CC skill (superpowers, skill-creator, simplify, defuddle, etc.)               | no (informational) |
| `pi-builtin:<name>` | External pi capability                                                                 | no (informational) |

## Audit Procedure

Run these checks in order. Report all findings at the end — don't fix as you go.

### 1. Load the map

```
cat .claude/parity-map.json
```

If the file is missing or invalid JSON, stop and report — there's nothing to audit against.

### 2. Enumerate on-disk artifacts

```
ls morsels/skills/
ls cc-plugin/skills/
ls cc-plugin/agents/
```

### 3. Check for unregistered artifacts

For every directory in `morsels/skills/` not present in `parity-map.json[morsels]` → report "unregistered morsel: `<name>`".

Same for `cc-plugin/skills/` → `parity-map.json[cc-plugin-skills]`.

Same for `cc-plugin/agents/*.md` → `parity-map.json[cc-plugin-agents]`.

### 4. Check for stale map entries

For every entry in `parity-map.json[morsels]` → confirm `morsels/skills/<name>/SKILL.md` exists. If not, report "stale morsel entry".

Same pattern for cc-plugin-skills and cc-plugin-agents.

### 5. Check cross-references

For each non-null cross-ref with a disk-checked scheme (`morsels:`, `cc-plugin:`, `berrygems:`), verify the target path exists. Skip `cc-builtin:` and `pi-builtin:` — they're informational.

### 6. Report

Summarize findings in three groups:

- **Unregistered** — new artifacts needing a map entry
- **Stale** — map entries whose backing files are gone
- **Broken cross-refs** — map pointers aimed at missing disk paths

If all three are empty: report "parity clean".

## Adding a New Skill / Agent / Extension

When you add anything on either side:

1. Create the artifact (SKILL.md, agent .md, extension dir, etc.)
2. Add a row to `.claude/parity-map.json` in the right top-level section
3. Set the cross-ref to one of:
   - `null` + note — if this is intentionally one-sided (e.g. pi-only TUI code)
   - `morsels:<name>` / `cc-plugin:<name>` / `berrygems:<name>` — if a real counterpart exists
   - `cc-builtin:<name>` — if CC covers this via an installed skill/plugin (superpowers, skill-creator, simplify, defuddle, etc.) and you're intentionally not shipping a cc-plugin wrapper
4. Add a `note` field when the relationship isn't 1:1 (e.g. cc-plugin splits one pi capability into multiple subagents, or vice versa)
5. Re-run this skill to confirm parity clean

## Related

- `.claude/hooks/stop-parity-check.fish` — Stop hook that runs this audit automatically when a session touched parity-relevant files
- `.claude/parity-map.json` — source of truth
- `morsels/AGENTS.md` — morsel authoring conventions
- `cc-plugin/AGENTS.md` — cc-plugin authoring conventions
