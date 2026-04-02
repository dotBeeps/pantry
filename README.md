# 🐉 Hoard

A dragon's hoard of agent tools for [pi](https://github.com/badlogic/pi-mono) — extensions, skills, and a daemon that tends them.

Built by a small dog and a large dragon.

## Structure

```
berrygems/       Tasty pi extensions — panels, guards, tools, and tone
morsels/         Bite-sized agent skills — git, GitHub, writing, pi internals
dragon-daemon/   Go daemon — memory consolidation, vault maintenance, async operations
```

## Install

```bash
# Install everything (both pi packages)
pi install https://github.com/dotBeeps/hoard

# Or install individually
pi install https://github.com/dotBeeps/hoard/berrygems
pi install https://github.com/dotBeeps/hoard/morsels
```

## Berrygems (Extensions)

Pi extensions that add interactive tools, floating panels, permission guards, and tone management.

<details>
<summary><b>dots-panels</b> — Central panel authority</summary>

Owns all floating overlay panel lifecycle: creation, positioning, focus cycling, smart placement, collision avoidance. Other extensions create panels through its globalThis API.
</details>

<details>
<summary><b>dragon-guard</b> — Three-tier permission guard</summary>

Tool call interception with three modes:
- **Dog Mode** — permission-gated, asks before any tool execution
- **Puppy Mode** — read-only planning, blocks mutations, auto-allows safe bash
- **Dragon Mode** — unrestricted (default)

Bash command classification, session state persistence, settings panel.
</details>

<details>
<summary><b>digestion-settings</b> — Compaction tuning panel</summary>

Live-tweakable compaction settings with three trigger modes (Reserve/Percentage/Fixed), strategy presets, context usage visualization, and proactive compaction triggers.
</details>

<details>
<summary><b>todo-lists</b> — Floating todo panels with GIF mascots</summary>

Persistent floating panels showing `.pi/todos` filtered by tag. AI-powered Giphy sticker search for animated mascots. Integrates with dots-panels for positioning and focus management.
</details>

<details>
<summary><b>ask</b> — Interactive user input tool</summary>

Three input modes: select (pick from options), confirm (yes/no), text (free input). TUI overlays with cached rendering and keyboard navigation.
</details>

## Morsels (Skills)

Agent skills — on-demand knowledge packages that teach the agent how to do specific tasks.

<details>
<summary><b>git</b> — Git operations beyond basics</summary>

Interactive rebase, bisect, reflog recovery, stash workflows, worktrees. Reference guides for rebase patterns and bisect workflows.
</details>

<details>
<summary><b>commit</b> — Conventional Commits</summary>

Commit message format, scope conventions, body guidelines, AI attribution with configurable Co-authored-by trailers.
</details>

<details>
<summary><b>git-auth</b> — SSH & credential management</summary>

SSH key setup, agent forwarding, rbw (Bitwarden CLI) integration for passphrase management. Cross-triggers when git/github operations hit auth walls.
</details>

<details>
<summary><b>github</b> — GitHub CLI operations</summary>

gh CLI patterns for issues, PRs, releases, Actions, and GraphQL queries. Reference guides for gh cheatsheet and GraphQL patterns.
</details>

<details>
<summary><b>github-writing</b> — GitHub document authoring</summary>

Interview-driven workflow for writing GitHub documents with approval gates:
- 12+ document types — PRs, bugs, features, RFCs, READMEs, CONTRIBUTING, release notes, repo templates, community docs, discussions, wikis, profile READMEs
- 5 writing tones — formal, friendly, personality, narrative, minimal — configurable per document type
- Style guardrails — each tone defines what it allows and forbids
- Reference guides for every document type
</details>

<details>
<summary><b>github-markdown</b> — GitHub Flavored Markdown conventions</summary>

GFM syntax, callout blocks, mermaid diagrams, task lists, footnotes, and cross-referencing patterns.
</details>

<details>
<summary><b>extension-designer</b> — Build pi extensions</summary>

Guides creation of pi extensions: custom tools, TUI components, overlays, commands, event hooks. Includes pi-internals reference.
</details>

<details>
<summary><b>skill-designer</b> — Build agent skills</summary>

Guides creation of Agent Skills (agentskills.io spec): frontmatter, naming, body structure, templates, quality checklist.
</details>

<details>
<summary><b>dot-panels</b> — Build panel extensions</summary>

How to build and integrate floating overlay panels using the dots-panels API.
</details>

<details>
<summary><b>dots-todos</b> — Task tracking with panels</summary>

Tagged todos and floating panels for task management.
</details>

<details>
<summary><b>pi-events</b> — Event hooks</summary>

Intercept tool calls, transform input, inject context, react to model/session changes.
</details>

<details>
<summary><b>pi-sessions</b> — Sessions & state</summary>

Session tree model, state management, compaction, branching, persistence patterns.
</details>

<details>
<summary><b>pi-tui</b> — TUI components</summary>

Build custom terminal UI: overlays, widgets, footers, custom editors.
</details>

<details>
<summary><b>agent-init</b> — Generate AGENTS.md</summary>

Investigate a project and create or update its AGENTS.md file through an interview process.
</details>

## Dragon Daemon

Go daemon for async agent operations — memory consolidation (dreaming), vault maintenance, and background tasks that outlive pi sessions.

**Status:** Planned. See `.pi/plans/tone-extension.md` for the full architecture.

## License

MIT
