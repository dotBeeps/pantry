# 🐉 Pantry

A dragon's pantry of agent content for [pi](https://github.com/badlogic/pi-mono) — extensions and skills, nothing more.

Built by a small dog and a large dragon.

## What's in it

Pantry is a **pi-package**: two directories of authored content that pi picks up when you install the repo.

```
berrygems/       Pi extensions — panels, guards, tools, tone
morsels/         Agent skills — git, GitHub, writing, pi internals, language tooling
```

That's the whole repo. No daemon, no runtime, no services to babysit.

## Install

```bash
pi install https://github.com/dotBeeps/pantry
```

Pi reads the `pi` field in `package.json` to find content:

```json
{
  "pi": {
    "extensions": ["berrygems/extensions"],
    "skills": ["morsels/skills"]
  }
}
```

Drop new extensions into `berrygems/extensions/` and new skills into `morsels/skills/` — pi finds them on the next install.

## Berrygems — Extensions

Pi extensions in `berrygems/extensions/`. Interactive tools, floating panels, permission guards, tone management — the pieces that change how pi feels to use. Each extension is either a single `.ts` file or a directory with `index.ts`.

## Morsels — Skills

Harness-agnostic skills in `morsels/skills/`. Each skill is an on-demand knowledge package — git workflows, GitHub automation, writing conventions, pi internals, language tooling, and a handful of meta-skills for authoring new extensions and skills.

## Feature Lifecycle

| emoji | state       | meaning                                   |
| ----- | ----------- | ----------------------------------------- |
| 💭    | idea        | Described but not yet researched or built |
| 📜    | researched  | Research gathered, not yet coded          |
| 🥚    | planned     | Fully spec'd, no code yet                 |
| 🐣    | in-progress | Being actively built                      |
| 🔥    | beta        | Usable, manually tested                   |
| 💎    | complete    | Stable and signed off                     |

## Further reading

- [AGENTS.md](AGENTS.md) — repo conventions, verification commands, per-directory guidance
- [ETHICS.md](ETHICS.md) — the grounding contract this work is built on

## License

MIT
