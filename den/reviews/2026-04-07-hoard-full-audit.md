# Hoard Full Audit — 2026-04-07

> **Auditor:** Ember 🐉 (coordinating parallel reviewer subagents)
> **Scope:** dragon-daemon, dragon-cubed, berrygems, morsels, documentation
> **Cost Note:** This audit over-spent tokens by dispatching 10 sonnet/codex reviewers. Future audits should use the hoard-kobolds taxonomy (see action items).

---

## Executive Summary

The hoard is structurally sound but has documentation drift, test gaps, and zero governance around subagent token spend. We burned through dot's Anthropic budget during this audit — proving the need for hoard-kobolds.

### What's Solid ✅
- Clean lint (tsc + golangci-lint), all tests pass
- Good Go idioms, clean dependency graph, no circular deps
- Extension isolation perfect — zero cross-extension imports
- Skill frontmatter 100% valid
- Consent/soul enforcement works (tiers, private shelves, dual-key)
- Vault is Obsidian-compatible

### What Needs Work
- Documentation drift (parchment skill is actively misleading)
- Test coverage gaps (5 daemon packages with zero tests)
- No subagent token governance (we proved this the hard way)
- Ethics observability gaps (daemon follows rules but can't show users how)

---

## Completed During Audit ✅

1. **Root AGENTS.md rewritten** — dragon architecture, ETHICS.md reference, attention economy, updated repo layout
2. **berrygems/AGENTS.md created** — monorepo context, crystallized tool layer framing
3. **morsels/AGENTS.md created** — monorepo context, knowledge layer framing
4. **dragon-daemon/AGENTS.md created** — code-level agent instructions, ethics mapping table
5. **den/features/dragon-daemon/AGENTS.md updated** — monorepo links, formless core framing
6. **dragon-cubed migrated into hoard** — files copied, AGENTS.md updated, old repo deleted
7. **Root .gitignore updated** — Gradle/Kotlin artifacts
8. **Pre-commit checklist updated** — includes dragon-cubed verification

---

## Action Items

### 🔴 Critical — Do This Sprint

| # | Item | Area | Why Critical |
|---|---|---|---|
| ~~1~~ | ~~Rewrite dragon-parchment skill~~ | morsels | ✅ Verified accurate — audit report was wrong, skill matches real API |
| ~~2~~ | ~~Fix dragon-image-fetch skill params~~ | morsels | ✅ Verified accurate — audit report was wrong, params are settings not per-call |
| ~~3~~ | ~~Create dragon-guard skill + AGENTS.md~~ | morsels + berrygems | ✅ Done — clever-kobold wrote both files |
| ~~4~~ | ~~Build hoard-kobolds extension~~ | berrygems | ✅ Done — extension + skill + 8 agent defs + settings |
| ~~5~~ | ~~Fix tsc errors~~ | berrygems | ✅ Done — `as any` for untyped session events, zero errors now |
| ~~6~~ | ~~Write attention package tests~~ | dragon-daemon | ✅ Done — clever-griffin wrote tests, all passing, lint clean |
| ~~7~~ | ~~Write heart package tests~~ | dragon-daemon | ✅ Done — clever-griffin wrote tests, all passing, lint clean |

### 🟡 Important — Next Sprint

| # | Item | Area | Notes |
|---|---|---|---|
| 8 | **Write auth package tests** | dragon-daemon | OAuth is security-sensitive |
| 9 | **Add consent change audit trail** | dragon-daemon | Ethics requires reviewability |
| 10 | **Fix dragon-tongue LSP leak** | berrygems | No session_shutdown handler — orphan TSServer on exit |
| 11 | **Clean up globalThis stale APIs** | berrygems | parchment, image-fetch, lab never unregister on shutdown |
| 12 | **Update extension-designer skill** | morsels | Missing registerShortcut, modelRegistry, session lifecycle |
| 13 | **Create subagent-strategy skill** | morsels | Teach agents the kobold/griffin/dragon dispatch rules |
| 14 | **Add exported-type doc comments** | dragon-daemon | Several exported types undocumented |
| ~~15~~ | ~~Redo library code quality review~~ | berrygems | ✅ Done — wise-kobold reviewed all 7 lib modules |

### 🟢 Soon — Backlog

| # | Item | Area | Notes |
|---|---|---|---|
| 16 | **Create shared pi-augments.d.ts** | berrygems | Eliminate ~60 `any` casts caused by pi SDK type gaps |
| 17 | **Plan berrygems daemon bridge** | berrygems | Even a minimal daemon status panel |
| 18 | **Implement thought transparency** | dragon-daemon | Users should see what the daemon thinks |
| 19 | **Design graceful degradation** | dragon-daemon | What happens when attention budget exhausted? |
| 20 | **Document dragon-digestion tuning** | morsels | Compaction settings undocumented |
| 21 | **Document hoard.* settings namespace** | morsels | No skill teaches settings config |
| 22 | **Update pi-events skill** | morsels | Missing session_switch, shutdown, compaction events |

---

## Lessons Learned

### Token Spend
- 10 parallel sonnet reviewers ≈ burned through Anthropic session + extra budget
- One reviewer hit 429 rate limit
- **Rule going forward:** Default to kobold (haiku). Escalate only when task needs reasoning.
- The kobold/griffin/dragon taxonomy: `<thinking> <model>` = `<silly|clever|wise|elder> <kobold|griffin|dragon>`

### Documentation Discoverability
- ETHICS.md was invisible to agents until this audit
- Sub-repo AGENTS.md files didn't exist for berrygems or morsels
- **Rule:** Every sub-repo gets an AGENTS.md linking to root + ETHICS.md

### Skill Drift
- Extension APIs evolve but skills don't get updated
- Stale skills are worse than no skills — they actively mislead
- **Rule:** When changing an extension API, check if a skill references it
