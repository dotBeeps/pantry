# README Writing Guide

Structure and conventions for repository READMEs and profile READMEs.

## Repository README Structure

A good README answers three questions fast: **What is this? How do I use it? How do I contribute?**

### Essential Sections (in order)

```markdown
# Project Name

> One-line description — what it does and who it's for.

## Quick Start

<!-- Install + first working command in under 60 seconds -->

```bash
npm install my-tool
my-tool init
```

## Features

- **Feature 1** — what it does and why it matters
- **Feature 2** — keep it scannable, not prose
- **Feature 3**

## Installation

<!-- Detailed installation for different platforms/methods -->

## Usage

<!-- Core workflows, common commands, configuration -->

## API / Reference

<!-- If applicable — link to docs site or inline reference -->

## Contributing

<!-- Brief pointer to CONTRIBUTING.md or inline guide -->

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](LICENSE)
```

### Guidelines

- **Quick Start in the first 20 lines** — users decide in seconds whether to keep reading
- **Show, don't tell** — code blocks over paragraphs. A working example beats a feature list.
- **Badges sparingly** — CI status, version, license are useful. 15 badges is noise.
- **Screenshots/GIFs for visual projects** — one hero image at the top if the project has a UI
- **Table of contents** for READMEs over ~200 lines — GitHub auto-generates one in the sidebar, but inline TOC helps in other contexts
- **Keep it current** — outdated install instructions are worse than none

### Optional Sections

Add these when relevant:

- **Prerequisites** — runtime versions, system dependencies
- **Configuration** — config files, environment variables, defaults
- **Architecture** — high-level overview for contributors (or link to docs)
- **FAQ** — common questions, especially "why not X?"
- **Acknowledgments** — credits, inspiration, dependencies
- **Roadmap** — what's planned (link to issues/milestones)

## Profile README

GitHub renders `<username>/<username>/README.md` as your profile page.

```markdown
# Hi, I'm [Name] 👋

[1–2 sentences: what you do, what you're interested in]

## Currently

- 🔭 Working on [project](link)
- 🌱 Learning [topic]
- 💬 Ask me about [expertise]

## Projects

| Project | Description |
|---------|-------------|
| [name](link) | one-liner |
| [name](link) | one-liner |

## Links

- [Blog](url) · [Twitter](url) · [Email](mailto:)
```

### Profile tips

- Keep it short — this is a landing page, not a résumé
- Pin your best 6 repositories instead of listing everything
- Use GitHub stats widgets sparingly — they add noise and slow rendering
- Update it when your focus changes

## Organization README

GitHub renders `<org>/.github/profile/README.md` on the org page.

Focus on:
- What the org does (1–2 sentences)
- Key projects (table or bullet list with links)
- How to get involved (contributing, discussions, hiring)
- Links to docs, website, community channels
