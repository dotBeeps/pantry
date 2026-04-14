# pi-as-Persona: Replace Daemon LLM Providers with Persistent pi Session

**Date:** 2026-04-13
**Status:** Design approved, pending implementation plan
**Scope:** Replace daemon's llamacli/anthropic providers with pi subprocess per beat, persistent session file

## Summary

The daemon stops owning LLM inference. Instead of `provider.Run()` with internal tool dispatch, the thought cycle spawns a pi subprocess per beat using a persistent session file. Pi IS the persona — it carries multi-turn context natively, dispatches its own tools, and accesses daemon services (memory, stone, quests) via MCP. The daemon keeps what pi can't do: heartbeat, soul enforcement, sensory aggregation, attention economy, and memory vault.

## Architecture

### Beat Flow

```
heart fires
  → soul.Check() (gate: rest, consent)
  → ledger.AboveFloor() (attention gate)
  → build sensory context message (nerves, events, attention, pinned memories)
  → spawn pi --mode text -p --system-prompt <startup-prompt> --session <persona.jsonl> "<context>"
  → capture stdout → onText → fireOutput (SSE broadcast) + ledger.Append
  → soul.Verify() (audit: attention, memory, framing, private-shelf)
  → ledger.Spend("beat", costs.beat)
```

### System Prompt (built once at startup)

If `persona.system_prompt` is set in YAML → use it verbatim.

Otherwise, compose from:

1. **Persona identity** — name, flavor, voice from persona YAML
2. **User context** — read from `~/.config/storybook-daemon/user-context.md`

The composed prompt is written to a temp file at startup and passed to every pi invocation via `--system-prompt <path>`. The temp file is cleaned up on daemon shutdown.

### pi Subprocess Command

```
pi --mode text -p \
   --model <persona.llm.model> \
   --system-prompt <system-prompt.md> \
   --thinking <persona.llm.thinking> \
   --session <~/.config/storybook-daemon/sessions/ember.jsonl> \
   "<sensory context message>"
```

**Environment:** Filtered (same as ally quest dispatch — strips `_API_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD`, `_CREDENTIAL`, AWS/GITHUB/OPENAI/AZURE/GCP namespaces) + `HOARD_STONE_PORT=<mcp_port>` for MCP access.

### What pi Can Do via Daemon MCP

| Tool                              | Purpose                            |
| --------------------------------- | ---------------------------------- |
| `memory_search`                   | Search the persona's vault         |
| `memory_read`                     | Read a specific note               |
| `memory_write`                    | Write to the vault                 |
| `attention_state`                 | Self-awareness of attention budget |
| `stone_send` / `stone_receive`    | Ally communication                 |
| `quest_dispatch` / `quest_status` | Dispatch its own allies            |

### Context Message (sensory-only)

Pi owns conversation memory via its session file. The beat message is sensory context only — no conversation replay:

```
## Sensory Context — 2026-04-13 14:32:05

**Attention:** 847 units

### Pinned Memories
**[daily-focus]** working on psi sub-project 2...

### Nerve States
**hoard-git** (hoard):
Recent commits: ...

### Recent Events
- [sse] message — hey Ember, check the tests
- [hoard-git] commit — fix(psi): ...
```

### Conversation Ledger (slimmed)

The ledger no longer injects conversation history into the context message. It still:

- Captures pi's output for psi ConversationStream display
- Captures dot's messages (from SSE POST /message) for psi display
- Compacts to vault for long-term searchable memory
- Provides text for the soul's framing audit to scan

### Attention Cost Model

Per-tool costs are replaced by a flat per-beat cost. The daemon can't inspect pi's internal tool usage, so it charges once per thought cycle.

```yaml
costs:
  beat: 15 # flat cost per thought cycle (replaces per-tool costs)
```

## What Changes

### Removed

| Component                                         | Reason                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `internal/llm/` package                           | Provider interface, anthropic, llamacli — all replaced by pi |
| `internal/auth/` package                          | Pi OAuth loading — pi handles its own auth                   |
| `dispatchTool()` in cycle.go                      | Pi dispatches its own tools via MCP                          |
| `buildTools()` in cycle.go                        | No daemon-side tool definitions needed                       |
| `CostConfig.Think/Speak/Remember/Search/Perceive` | Replaced by `CostConfig.Beat`                                |

### Modified

| File                              | Change                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/thought/cycle.go`       | Replace `provider.Run()` with pi subprocess spawn. Remove tool dispatch. Build sensory-only context.                                        |
| `internal/daemon/daemon.go`       | Remove provider construction, OAuth loading. Build system prompt at startup. Create sessions dir. Clean up temp prompt file on shutdown.    |
| `internal/persona/types.go`       | Replace `LLMConfig` provider/model/max_tokens with pi-specific fields: model, thinking. Add `CostConfig.Beat`. Remove per-tool cost fields. |
| `internal/conversation/ledger.go` | Remove `Render()` from context injection. Keep `Append()` and compaction for psi/vault/soul.                                                |

### New

| File                     | Responsibility                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/thought/pi.go` | `runPi()` — spawn pi subprocess, capture output, handle errors. Session file management. Environment filtering (reuse pattern from quest/command.go). |

### Unchanged

- Dragon-heart (beat timing, jitter, nudge)
- Dragon-soul (gates + audits)
- Sensory aggregation (nerves → events)
- Memory vault
- Conversation ledger (output capture path)
- Psi interfaces (SSE + MCP)
- Psi Qt app
- Quest manager / stone broker

## Persona Config Changes

### Before

```yaml
llm:
  provider: llamacli
  model: /path/to/model.gguf
  max_tokens: 2048
  binary_path: /path/to/llama-cli
  gpu_layers: 999
  temperature: 0.7

costs:
  think: 5
  speak: 15
  remember: 25
  search: 15
  perceive: 8
```

### After

```yaml
llm:
  model: "claude-sonnet-4-6" # pi model identifier
  thinking: "medium" # off, low, medium, high

costs:
  beat: 15 # flat cost per thought cycle
```

### User Context File

`~/.config/storybook-daemon/user-context.md` — markdown file describing the user. Read at startup, included in the composed system prompt. Already exists at `dragon-forge/config/user-context.md` — needs to be copied/symlinked to config dir.

## Session File Management

- Path: `~/.config/storybook-daemon/sessions/<persona-name>.jsonl`
- Created automatically on first beat if it doesn't exist
- Pi appends to it each beat (multi-turn context accumulates)
- Not managed by the daemon beyond creating the directory — pi owns the file

## Error Handling

- **pi exits non-zero:** Log the error and stderr, skip the beat. Don't retry — the next scheduled beat will try again. The heart keeps ticking.
- **pi times out:** The beat function runs under the heart's context. If the daemon is shutting down, context cancellation kills the pi subprocess. No separate per-beat timeout for now — pi manages its own execution time.
- **Session file corrupt:** If pi can't resume the session, it will fail. Log and let the user investigate. Don't auto-delete the session file — it may contain valuable context.

## Testing

- `internal/thought/` — test `buildContextMessage` produces sensory-only output (no conversation section)
- `internal/thought/` — test `runPi` constructs correct command args, env filtering, session path
- Build verification: `go build ./...`
- Integration: start daemon, send message via psi, verify pi responds and output appears in ConversationStream
