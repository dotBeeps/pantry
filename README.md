# 🐉 Hoard

A dragon's hoard of agent tools for [pi](https://github.com/badlogic/pi-mono) — extensions, skills, and a daemon that tends them.

Built by a small dog and a large dragon.

## Structure

```
berrygems/       Tasty pi extensions — panels, guards, tools, and tone
morsels/         Bite-sized agent skills — git, GitHub, writing, pi internals
storybook-daemon/   Go persona daemon — thought cycles, attention economy, ethical contracts, Obsidian memory
```

## Install

```bash
# Install everything (both pi packages)
pi install https://github.com/dotBeeps/hoard

# Or install individually
pi install https://github.com/dotBeeps/hoard/berrygems
pi install https://github.com/dotBeeps/hoard/morsels
```

## Feature Lifecycle

| emoji | state | meaning |
|---|---|---|
| 💭 | idea | Described but not yet researched or built |
| 📜 | researched | Research gathered, not yet coded |
| 🥚 | planned | Fully spec'd, no code yet |
| 🐣 | in-progress | Being actively built |
| 🔥 | beta | Usable, manually tested |
| 💎 | complete | Stable and signed off |

## Berrygems — Extensions

Pi extensions that add interactive tools, floating panels, permission guards, and tone management.

| | extension | description |
|---|---|---|
| 🔥 | **dragon-breath** | Carbon/energy tracking footer widget + `/carbon` command |
| 💎 | **dragon-curfew** | Bedtime enforcement — blocks tool calls during curfew hours |
| 🔥 | **dragon-digestion** | Tiered compaction system — 5 tiers of progressive context management |
| 🔥 | **dragon-guard** | Three-tier permission guard (Dog / Puppy / Dragon modes) |
| 💎 | **dragon-herald** | Desktop notifications on agent completion (OSC777 + notify-send) |
| 🔥 | **dragon-image-fetch** | Multi-source image/GIF fetch API (Giphy/Tenor/URL/file) |
| 💎 | **dragon-inquiry** | Interactive user input — select, confirm, text overlays |
| 🥚 | **dragon-lab** | Auth-aware provider beta header manager *(blocks Anthropic context management in dragon-digestion)* |
| 🐣 | **dragon-loop** | Automation loops with breakout conditions + `/loop` command |
| 🔥 | **dragon-musings** | LLM-generated contextual thinking spinner |
| 🔥 | **dragon-parchment** | Central panel authority — creation, positioning, focus cycling |
| 🔥 | **dragon-review** | Code review via `/review` and `/end-review` |
| 🔥 | **dragon-scroll** | Scrollable, updatable-by-ID markdown popup panels |
| 💎 | **dragon-tongue** | Floating diagnostics panel (LSP + tsc) |
| 🔥 | **kitty-gif-renderer** | Kitty Graphics Protocol image rendering for panels |
| 🔥 | **kobold-housekeeping** | Floating todo panels with GIF mascots |

## Morsels — Skills

On-demand knowledge packages that teach the agent how to do specific tasks.

### Pi & Hoard

| | skill | description |
|---|---|---|
| 🔥 | **agent-init** | Generate AGENTS.md files via interview |
| 🔥 | **dragon-image-fetch** | Use the dragon-image-fetch extension API |
| 🔥 | **dragon-parchment** | Build and integrate floating overlay panels |
| 🔥 | **extension-designer** | Build pi extensions with tools, TUI, overlays, events |
| 🔥 | **kitty-gif-renderer** | Integrate Kitty GIF rendering into panel extensions |
| 🔥 | **kobold-housekeeping** | Task tracking with tagged todos and floating panels |
| 💎 | **pi-events** | Event hook reference — intercept, transform, inject |
| 🔥 | **pi-sessions** | Session state, branching, compaction, persistence |
| 🔥 | **pi-tui** | Build custom TUI components, overlays, editors |
| 🔥 | **skill-designer** | Build agent skills (agentskills.io spec) |

### Git & GitHub

| | skill | description |
|---|---|---|
| 💎 | **commit** | Conventional Commits + AI attribution trailers |
| 💎 | **git** | Git operations — rebase, bisect, reflog, stash, worktrees |
| 💎 | **git-auth** | SSH key management + rbw passphrase automation |
| 💎 | **github** | gh CLI — PRs, issues, releases, Actions, GraphQL |
| 💎 | **github-actions** | GitHub Actions CI/CD workflow authoring |
| 💎 | **github-markdown** | GFM — callouts, mermaid, task lists, cross-references |
| 💎 | **github-writing** | Interview-driven authoring for PRs, READMEs, issues, releases |

### Languages & Tooling

| | skill | description |
|---|---|---|
| 💎 | **api-design** | REST/GraphQL/OpenAPI design patterns |
| 💎 | **database** | Schema design, migrations, ORMs, query optimization |
| 💎 | **defuddle** | Extract clean markdown from web pages via Defuddle CLI |
| 💎 | **dependency-management** | bun/uv/cargo/Go/Gradle dependency workflows |
| 💎 | **docker** | Dockerfiles, multi-stage builds, Compose, security |
| 💎 | **go-check** | Run go vet/golangci-lint/go test, interpret output |
| 💎 | **go-testing** | Go testing — testify, table-driven tests, benchmarks |
| 💎 | **js-testing** | JS/TS testing — Jest, Vitest, Node test runner |
| 💎 | **python-testing** | Python testing with pytest |
| 💎 | **refactoring** | Refactoring patterns, SOLID, design principles |
| 💎 | **typescript-check** | Run tsc/eslint, interpret errors, fix common patterns |

## Dragon Daemon

| | component | description |
|---|---|---|
| 🐣 | **storybook-daemon** | Go persona daemon — persistent agent runtime with event-driven thought cycles, attention economy, ethical contract enforcement (dragon-soul), Obsidian-compatible memory, and fsnotify body sensing |

## License

MIT
