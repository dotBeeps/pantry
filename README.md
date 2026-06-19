# 🐉 Pantry — Retired 2026-06-19

> **This repo is retired.** It no longer installs anything. The `pi` manifest
> was removed from `package.json` and both content directories were emptied
> during the scatter. This repository is kept as an archive / holding pen for
> git history.

Pantry was a pi-package — a collection of TypeScript extensions and Markdown
skills for the [pi](https://github.com/earendil-works/pi) coding-agent harness,
built by a small dog and a large dragon.

## Where everything went

The survivors of the scatter live outside this repo now:

| What | Where |
|------|-------|
| `dragon-breath` (carbon/energy tracking) | `~/Development/dragon-breath` — standalone repo |
| `dragon-herald` (ntfy notifications) | `~/.pi/agent/extensions/herald.ts` + shared `~/.local/bin/notify.sh` |
| `dragon-image-fetch` + `kitty-gif-renderer` (inline images) | `~/.pi/agent/extensions/` (decoupled) |
| 22 keeper skills (git, neoforge, go, extension-designer, …) | `~/.pi/agent/skills/` |

Everything else — the popup stack, the duplicate-tool extensions superseded by
`pi-*` packages, and the ~54 skills that folded or were dropped — is preserved
under [`archived/`](archived/) with one-line reasons in
[`archived/README.md`](archived/README.md).

## The full story

- [`AGENTS.md`](AGENTS.md) — repo conventions (historical).
- [`.planning/REWRITE.md`](.planning/REWRITE.md) — **the authoritative retirement/scatter plan** (phases, decisions, survivor manifest).
- [`.planning/HANDOFF.md`](.planning/HANDOFF.md) — live state snapshot + non-obvious gotchas.
- [`ETHICS.md`](ETHICS.md) — the grounding contract (still applies to the survivors that handle user data).

## License

MIT. The archived content retains its per-file `license: MIT` declarations.
