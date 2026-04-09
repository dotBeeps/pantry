# Reference persona configs

These are the reference / default persona configs for storybook-daemon.
They are not loaded automatically — copy them to the standard config directory
and storybook-daemon will pick them up by name.

## Installation

```fish
mkdir -p ~/.config/storybook-daemon/personas
cp personas/ember.yaml ~/.config/storybook-daemon/personas/
cp personas/maren.yaml ~/.config/storybook-daemon/personas/
```

Then start a daemon:

```fish
storybook-daemon run ember
storybook-daemon run maren
```

## Personas

### ember

Primary coding assistant and life agent. A knowledge-hoarding dragon — warm,
a little chaotic, deeply invested in the work. Large attention pool (1000),
moderate regen (120/hr), active during working hours (quiet 23:00–06:00).
Connects to the hoard git repo body, a maw HTTP body on port 7432, and an
MCP tool server on port 9432. Refers to dot as "pup".

Contracts: `minimum-rest`, `attention-honesty`, `memory-transparency`,
`private-shelf`, `framing-honesty`.

### maren

Quest coordinator and guild master. A cunning amber fox who keeps the ledger.
Smaller attention pool (400), longer thought interval (she waits to be invoked).
Connects to a maw body on port 7433 and an MCP tool server on port 9433.
Prefixes output with `➤ Ember —`, `➤ dot —`, or `➤ both —`.
No minimum-rest gate — available whenever she's needed.

Contracts: `attention-honesty`, `private-shelf`.

## Schema

Config fields are defined in `internal/persona/types.go`. The loader reads
files from `~/.config/storybook-daemon/personas/<name>.yaml` and validates
them on load.

Supported body types: `hoard`, `maw`, `mcp`.

Supported contract rule prefixes:

- `minimum-rest: HH:MM-HH:MM` — pre-beat gate, blocks thought during rest window
- All other rules are declarative or matched by ID:
  `attention-honesty`, `memory-transparency`, `private-shelf`, `framing-honesty`
