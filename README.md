# 🐉 dot's pi enhancements — Ember's Hoard

> A small dog and a large dragon made these together.
> The dog is three inches tall, blue-raspberry-flavored, and fits in a cheek pouch.
> The dragon hoards knowledge and occasionally swallows the dog by accident. 🐾🔥

Custom [pi](https://github.com/badlogic/pi-mono) skills and extensions — built for fun, personality, and better agent workflows.

## What's in the hoard

### 🧠 Skills

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

### 🔧 Extensions

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
# Install the skill globally
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
