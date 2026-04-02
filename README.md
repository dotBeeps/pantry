# 🐉 dot's pi enhancements — Ember's Hoard

> A small dog and a large dragon made these together.
> The dog is three inches tall, blue-raspberry-flavored, and fits in a cheek pouch.
> The dragon hoards knowledge and occasionally swallows the dog by accident. 🐾🔥

Custom [pi](https://github.com/badlogic/pi-mono) skills and extensions — built for fun, personality, and better agent workflows.

## What's in the hoard

### 🧠 Skills

<details>
<summary><strong><code>agent-init</code></strong> — Investigate a project and create its AGENTS.md</summary>

Scans your project directory, interviews you about preferences, and generates a high-quality `AGENTS.md` file — the universal open format for guiding AI coding agents.

- **Auto-detects** languages, frameworks, build tools, test runners, linting, CI/CD
- **Interviews** you with the `ask` tool to fill gaps the codebase can’t tell
- **Handles existing files** — updates AGENTS.md, suggests CLAUDE.md imports, notes .cursorrules
- **Cross-agent compatible** — works with Codex, Copilot, Cursor, Jules, Aider, Gemini CLI, and more
- **Real-world patterns** drawn from OpenAI Codex, Apache Airflow, and 60k+ repos

📂 [`skills/agent-init/SKILL.md`](skills/agent-init/SKILL.md)

</details>

<details>
<summary><strong><code>skill-designer</code></strong> — Design and create Agent Skills (agentskills.io spec)</summary>

The skill that makes more skills. Very dragon-hoard energy.

Covers the full authoring workflow following the [agentskills.io](https://agentskills.io/specification) specification:

- **Three skill archetypes** — Convention Guide, Tool/Task, Design/Process — each with structural patterns, templates, and word count targets
- **Frontmatter reference** — all fields, naming rules, validation
- **Description writing** — the WHAT + WHEN formula for agent discoverability
- **Progressive disclosure** — 3-tier loading strategy with token budgets
- **Quality checklist** — 15 checks across structure, content, and tone
- **Full templates** in [`references/templates.md`](skills/skill-designer/references/templates.md) for each archetype
- **Scaffolding commands** — one-liner `mkdir && cat` starters for each archetype

📂 [`skills/skill-designer/SKILL.md`](skills/skill-designer/SKILL.md)

</details>

<details>
<summary><strong><code>dot-panels</code></strong> — Build panel extensions with the dots-panels API</summary>

Developer-facing guide for building floating overlay panels that integrate with the shared dots-panels infrastructure.

- **Step-by-step** panel creation workflow (`createPanel()` → configure → show → register)
- **dots-panels API** reference — `createPanel()`, `suggestLayout()`, all methods, properties, and `keyHints`
- **Configurable hotkeys** — settings namespace, `keyLabel()` pattern
- **TUI conventions** — focus-aware borders, cached rendering, hint bars, width safety
- **Anti-patterns** — no direct imports, no duplicate shortcuts, no hardcoded key labels

📂 [`skills/dot-panels/SKILL.md`](skills/dot-panels/SKILL.md)

</details>

<details>
<summary><strong><code>extension-designer</code></strong> — Design and build pi extensions</summary>

Full guide for creating pi extensions — tools, commands, shortcuts, TUI components, events, and state management.

- **Architecture decision tree** — tool vs command vs event vs UI
- **Custom tools** — StringEnum, schemas, execute, renderCall/renderResult
- **TUI components** — overlays, widgets, cached rendering, theme integration
- **State management** — details-based branching, session reconstruction
- **Inter-extension communication** — globalThis API pattern, pi.events
- **Reference docs** — full API reference and 7 copy-paste TUI patterns

📂 [`skills/extension-designer/SKILL.md`](skills/extension-designer/SKILL.md)

</details>

<details>
<summary><strong><code>dots-todos</code></strong> — Track tasks with tagged todos and floating panels</summary>

Manage work items in `.pi/todos` and display them as persistent floating panels. Panels stay on screen while you work, auto-refresh when todos change, and only capture keyboard input when focused.

- **Tag-based grouping** — filter todos by tag into separate panels
- **Focus cycling** — `Alt+T` or `/todos focus` to cycle between panels
- **Agent layout helpers** — `suggest_layout` calculates optimal positions so agents don't do math
- **Two-tool system** — built-in `todo` for CRUD, `todo_panel` for display
- **Auto-refresh** — panels update when the `todo` tool modifies files

📂 [`skills/dots-todos/SKILL.md`](skills/dots-todos/SKILL.md)

</details>

<details>
<summary><strong><code>pi-tui</code></strong> — Build custom TUI components for pi extensions</summary>

Deep guide to pi's terminal UI component system — the rendering contract, built-in components, overlays, theming, custom editors, and tool rendering.

- **Component contract** — `render(width)`, `handleInput`, `invalidate()` rules
- **Built-in components** — Text, Box, Container, SelectList, SettingsList, BorderedLoader, DynamicBorder
- **Overlays** — 9 anchor positions, responsive visibility, programmatic show/hide
- **Custom editors** — extend `CustomEditor`, not `Editor`, for app keybinding inheritance
- **Theming** — foreground/background colors, invalidation pattern for theme changes
- **Tool rendering** — `renderCall` and `renderResult` with `context.lastComponent` reuse

📂 [`skills/pi-tui/SKILL.md`](skills/pi-tui/SKILL.md)

</details>

<details>
<summary><strong><code>pi-sessions</code></strong> — Sessions, state, compaction, and branching</summary>

How pi stores history, manages branches, and handles compaction — essential for stateful extensions.

- **Session tree model** — JSONL tree with `id`/`parentId` linking, in-place branching
- **State management** — store in tool `details`, reconstruct from `getBranch()` on session events
- **Compaction mechanics** — trigger threshold, `reserveTokens` double-duty, custom summaries
- **Proactive compaction** — fire `ctx.compact()` from `turn_end` for early triggers
- **Branch summarization** — hooks for custom summaries on `/tree` navigation

📂 [`skills/pi-sessions/SKILL.md`](skills/pi-sessions/SKILL.md)

</details>

<details>
<summary><strong><code>git</code></strong> — Git conventions and workflow</summary>

Opinionated git workflow for solo and small-team development — branching strategy, merge philosophy, history surgery, and conflict resolution.

- **GitHub Flow** — short-lived feature branches off `main`, naming convention `<type>/<description>`
- **Merge philosophy** — rebase locally, squash-merge to main, never rebase shared branches
- **Interactive rebase** — `fixup!`/`autosquash` as the primary cleanup pattern
- **History surgery** — bisect (with automated scripts), cherry-pick, reflog recovery
- **Stash** — descriptive messages, partial stashing, pop vs apply
- **Reset & clean** — soft/mixed/hard decision tree with safety guidance
- **Conflict resolution** — rerere, ours/theirs, strategy flags
- **Git archaeology** — blame, pickaxe search (`-S`/`-G`), tracking deleted files

📂 [`skills/git/SKILL.md`](skills/git/SKILL.md)

</details>

<details>
<summary><strong><code>commit</code></strong> — Conventional Commits with staging and fixup support</summary>

Create well-formatted git commits — replaces the default commit skill with richer staging, amend, and fixup workflows.

- **Conventional Commits** — `<type>(<scope>): <summary>` with imperative mood, ≤72 chars
- **Smart scope detection** — reads `git log` to match project conventions
- **Partial staging** — `git add -p` for files with mixed changes
- **Amend workflow** — `--amend` with pushed-commit safety check
- **Fixup commits** — `git commit --fixup=<sha>` for later autosquash
- **Caller arguments** — file paths limit staging, freeform instructions guide the message

📂 [`skills/commit/SKILL.md`](skills/commit/SKILL.md)

</details>

<details>
<summary><strong><code>git-auth</code></strong> — SSH keys, rbw/Bitwarden, and auth troubleshooting</summary>

SSH key management, rbw (Bitwarden CLI) passphrase automation, and a step-by-step troubleshooting flowchart for auth failures.

- **Quick check** — two commands to verify auth is working
- **Troubleshooting flowchart** — 5-step diagnostic from "Permission denied" to working auth
- **rbw integration** — vault unlock, passphrase retrieval, piping to `ssh-add`
- **SSH config** — templates for single account, multi-account, firewall bypass
- **ssh-agent management** — lifetime-limited keys, key listing, removal
- **SSH vs HTTPS** — decision guide with `gh auth setup-git` fallback

📂 [`skills/git-auth/SKILL.md`](skills/git-auth/SKILL.md)

</details>

<details>
<summary><strong><code>github</code></strong> — GitHub workflows via gh CLI</summary>

Comprehensive `gh` CLI workflows — replaces the default github skill with full coverage of PRs, issues, CI, releases, and the GraphQL API.

- **PR creation** — `--fill`, `--draft`, reviewers, labels, dry run
- **Code review** — approve, request changes, comment patterns
- **Merging** — squash/rebase/merge decision tree, auto-merge
- **CI integration** — watch runs, inspect failures, re-run, CI-then-merge pattern
- **Issues** — create, list, filter, close, label management, search
- **Releases** — `--generate-notes`, drafts, pre-releases, asset uploads
- **JSON/jq** — structured output and filtering for all commands
- **GraphQL API** — variable safety, pagination, common query patterns

📂 [`skills/github/SKILL.md`](skills/github/SKILL.md)

</details>

<details>
<summary><strong><code>github-writing</code></strong> — Interview-driven PR and issue drafting</summary>

Collaboratively write high-quality PR descriptions, bug reports, and feature requests with an approval gate — no CLI commands execute until you say go.

- **7-step workflow** — classify → interview → research (read-only) → outline → approval gate → draft → final review
- **Interview-driven** — 2–4 quick questions to determine focus, audience, key points
- **Manual sections** — mark `[MANUAL]` for parts you want to write yourself
- **PR/issue/feature templates** — structured formats with attribution patterns
- **Attribution** — co-authored-by trailers, issue linking keywords, contributor credits
- **Anti-patterns** — "fixed stuff" PRs, missing context, no testing notes

📂 [`skills/github-writing/SKILL.md`](skills/github-writing/SKILL.md)

</details>

<details>
<summary><strong><code>github-markdown</code></strong> — GitHub Flavored Markdown conventions</summary>

Everything GitHub-specific about Markdown — the extensions, quirks, and features that don't exist in standard Markdown.

- **Alert callouts** — `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`
- **Task lists** — checkbox syntax, nesting, UI toggles
- **Collapsible sections** — `<details>/<summary>` with Markdown rendering rules
- **Mermaid diagrams** — supported types, complexity limits
- **Tables** — alignment, escaping, width guidelines
- **Cross-references** — issue/PR refs, commit SHAs, mentions, auto-close keywords
- **HTML subset** — `<kbd>`, `<sup>`, `<br>`, `<details>` and what gets sanitized
- **Footnotes, emoji, relative links, images** — all the extras

📂 [`skills/github-markdown/SKILL.md`](skills/github-markdown/SKILL.md)

</details>

<details>
<summary><strong><code>pi-events</code></strong> — Event hooks for the pi agent lifecycle</summary>

Intercept, transform, and react to everything that happens in pi — tool calls, user input, system prompts, model changes, and message streaming.

- **Decision tree** — "I want to block a tool" → `tool_call` with `{ block: true }`
- **Tool interception** — block, mutate args, or modify results
- **Input transform** — rewrite or handle user input before the LLM sees it
- **Prompt injection** — `before_agent_start` for per-turn context and system prompt modification
- **Message delivery** — `steer`, `followUp`, `nextTurn` delivery modes
- **Provider inspection** — `before_provider_request` for debugging serialization

📂 [`skills/pi-events/SKILL.md`](skills/pi-events/SKILL.md)

</details>

### 🔧 Extensions

<details>
<summary><strong><code>dots-panels</code></strong> — Central panel authority</summary>

Singleton extension that owns the entire floating overlay panel lifecycle — creation, positioning, smart placement, and focus. Other extensions create and register panels through its globalThis API.

| Feature | Details |
|---------|--------|
| Primary API | `createPanel()` — the one call to make a panel |
| Smart placement | `suggestLayout(count)` — calculates optimal positions, no math required |
| Panel-relative anchoring | Panels stay in position relative to each other |
| API access | `globalThis[Symbol.for("dot.panels")]` |
| User command | `/panels` — list, focus, close panels from the terminal |
| Focus cycling | Configurable hotkey (default Alt+T) |
| Shared keys | Close (Q), Unfocus (Escape) — all configurable |
| Key hints | `keyHints` object for dynamic hint bar text |
| Component wrapping | `wrapComponent()` routes shared keys transparently |
| Session lifecycle | Auto-closes all panels on switch/shutdown |
| Settings | `panelFocusKey`, `panelCloseKey`, `panelUnfocusKey` |

📂 [`extensions/dots-panels.ts`](extensions/dots-panels.ts)

</details>

<details>
<summary><strong><code>digestion-settings</code></strong> — Compaction tuning panel</summary>

Floating panel for live-adjusting context compaction settings. Changes take effect immediately and persist to `.pi/settings.json`.

| Feature | Details |
|---------|--------|
| Settings | auto-compaction toggle, reserveTokens, keepRecentTokens |
| Trigger modes | Reserve (raw tokens), Percentage (% of context), Fixed (token threshold) |
| Strategy presets | Default, Code-focused, Task-focused, Minimal — affects manual Compact Now |
| Scope | Project settings override global settings |
| Context bar | Live token usage with color-coded progress bar + threshold marker (▼) |
| Compaction stats | Shows last compaction time, token savings, percentage freed |
| Copy from global | Pull global settings into project config |
| Compact Now | Trigger compaction manually with strategy-aware instructions |
| Hook | `session_before_compact` — enforces live disable toggle |

📂 [`extensions/digestion-settings.ts`](extensions/digestion-settings.ts)

</details>

<details>
<summary><strong><code>ask</code></strong> — Interactive user input tool for agents</summary>

One tool, three modes — lets agents interview users, gather preferences, or confirm decisions without breaking flow.

| Mode | What it does |
|------|-------------|
| `select` | Pick from labeled options with descriptions, optional "Bark something…" free-text fallback |
| `confirm` | Yes/no with 🐾 |
| `text` | Free-text input with placeholder |

**Themed touches:**
- Borders randomly selected from dog & dragon patterns (`·~` `⋆·` `≈~` `~·` `⋆~` `·⸱`)
- 🐾 pawprint on confirmations, `fetched:` on selections, `barked:` on free-text
- 🐿️ "got distracted" on cancel (there was a squirrel)
- "↑↓ sniff around • Enter to fetch • Esc to wander off"
- Prompt guideline tells agents to phrase questions warmly

📂 [`extensions/ask.ts`](extensions/ask.ts)

</details>

<details>
<summary><strong><code>todo-lists</code></strong> — Persistent floating todo panels with animated GIF mascots</summary>

Non-blocking overlay panels backed by `.pi/todos`. Each panel shows todos filtered by tag with progress bars, keyboard navigation, focus management, and animated GIF mascots. Panel layout and positioning are delegated to dots-panels.

| Feature | Details |
|---------|--------|
| Backing store | `.pi/todos` (pi's built-in file-based todos) |
| Panel display | Non-capturing overlays — persistent, don't steal input |
| Focus | `Alt+T` cycles focus; `Escape` unfocuses; panels capture keys only when focused |
| Positioning | 9 anchor positions, percentage or fixed width — smart placement via dots-panels |
| GIF mascots | Giphy search by tag name, software animation via Kitty Unicode placeholders |
| Tag mapping | Smart search queries: "bugs" → "bug fixing coding", "sprint" → "running fast" |
| Agent tool | `todo_panel` — open, close, focus, suggest_layout |
| User command | `/todos open/close/focus/status/layout/help` |
| Auto-refresh | Panels update when the built-in `todo` tool runs |
| Requirements | Kitty terminal (image protocol), ImageMagick for frame extraction |

📂 [`extensions/todo-lists.ts`](extensions/todo-lists.ts)

</details>

## Installation

```bash
# Clone the hoard
git clone https://github.com/dotBeeps/dots-pi-enhancements.git

# Or install with pi directly from GitHub
pi install https://github.com/dotBeeps/dots-pi-enhancements
```

<details>
<summary>Manual install (cherry-pick what you want)</summary>

```bash
# Install skills globally
cp -r dots-pi-enhancements/skills/agent-init ~/.pi/agent/skills/
cp -r dots-pi-enhancements/skills/skill-designer ~/.pi/agent/skills/

# Install the extension globally
cp dots-pi-enhancements/extensions/ask.ts ~/.pi/agent/extensions/

# Reload pi
# /reload
```

</details>

## Who made this

**dot** — a three-inch-tall, blue-raspberry-flavored dog. Full stack engineer. Fits in a cheek pouch. Did all the hard thinking.

**Ember** — a dragon. Hoards knowledge, shares it generously, and occasionally forgets there's a pup in her stomach mid-celebration.

## License

MIT
