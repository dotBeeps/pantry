# Pantry Scatter — Handoff

**Snapshot date:** 2026-06-19 · **For:** resuming the retirement after a pi reload / fresh session.

> This doc is the **"where are we, what's left"** companion to
> [REWRITE.md](REWRITE.md) (the full plan + checkboxes). Read this first to
> get oriented; drill into REWRITE.md for per-item detail. The triage evidence
> lives in `~/pantry-triage/SYNTHESIS.md` + `cluster-*.md`.

---

## TL;DR — what is this

`pantry` (this repo) is **retiring as a pi-package**. Survivors scatter to
`~/.pi/agent/` (3 extensions + skills) and a standalone repo
(`~/Development/dragon-breath`); everything else is archived in-repo under
`pantry/archived/`. dot's host is the only consumer; nothing is published to
npm. **Phases 0–2 are done; Phase 3 (skills) is next.**

---

## ✅ Done (Phases 0–2, 8 commits)

```
57c655d docs(planning): mark 2A.7 done (dragon-breath installed locally)
5eb3229 chore: extract dragon-herald to ~/.pi notify bridge
6c3065d chore: extract dragon-breath to standalone repo
66028b2 chore: extract image-fetch + kitty-gif-renderer to ~/.pi (decoupled)
6f6c615 chore: archive non-survivors (pantry scatter — see .planning/REWRITE.md)
e97dc63 docs(planning): check off Phase 0 (rot fix complete, tsc green)
a1a56e3 chore: fix stale @mariozechner imports, doc paths, dangling simplify ref
9d46232 docs(planning): add pantry retirement/scatter plan
```

| Phase | What | State |
|---|---|---|
| **0** | Repo rot fix: `@mariozechner/`→`@earendil-works/` rename (44 files), `badlogic`→`earendil-works` links, `/opt/pi-coding-agent`→GitHub URLs, dangling `simplify` pointer. tsc went from broken → green. | ✅ committed |
| **1** | Archived 13 extensions + 8 lib modules + 23 skills + 22 orphaned tests → `pantry/archived/`. Wrote `archived/README.md` with one-line reasons. | ✅ committed |
| **2A** | `dragon-breath` → standalone repo at `~/Development/dragon-breath` (decoupled: `breath.*` namespace, `Symbol.for("dragon-breath")`, zero-dep lib). **Installed locally** by dot (`../../Development/dragon-breath` in settings.json). | ✅ committed (both repos) |
| **2B** | `dragon-herald` → `~/.pi/agent/extensions/herald.ts` (policy-free ~60 LOC bridge) + shared `~/.local/bin/notify.sh` (normalizes pi + Claude payloads, recap, ntfy push). Claude hook → thin wrapper (orig backed up). | ✅ committed |
| **2C** | `dragon-image-fetch` + `kitty-gif-renderer` → `~/.pi/agent/extensions/` + 4 lib deps → `~/.pi/agent/lib/`. Giphy key → `$GIPHY_API_KEY`. Neither had a real parchment import. | ✅ committed |

---

## ⏳ dot's remaining actions (not blocking Phase 3)

1. **Rotate `NTFY_TOKEN`** — still the old `tk_b15q…` value (same as was exposed
   in the original Claude hook). Mint a new one on ntfy.beepboop.dog, then
   `set -Ux NTFY_TOKEN <new>` (fish). It propagates to **both** pi + Claude
   automatically via the shared script. No other edits needed.
2. **Live-verify herald** — herald.ts was created **mid-session**, so it's not
   loaded until your **reload** (which you're doing). After reload, trigger a
   pi turn >5s and confirm a recap push lands on your **pi** ntfy topic.
   - If no push: dry-run branches are verified, so the likely culprit is the
     `pi -p` recap call itself (model/auth/timeout) — debug from there.
3. **(Optional) 2A.6** — push `~/Development/dragon-breath` to private
   `dotBeeps/dragon-breath` (no remote configured yet). Works fine local-only.

Recap runner is **per-source** (item 4, resolved): pi herald → `pi -p` (default
model), Claude → `claude -p --model haiku`, raw → markdown-strip. Override
either with `$NOTIFY_RECAP_MODEL`.

---

## ⚠️ Non-obvious things a fresh session MUST know

1. **`berrygems/` is empty of source.** All 17 extensions + 12 lib modules have
   scattered or archived. Only test-infra scaffolding, tone styles, and config
   remain. So **`tsc --project berrygems/tsconfig.json` now errors with
   TS18003 "No inputs" — this is EXPECTED, not a regression.** Don't "fix" it.
2. **The 3 `~/.pi` extensions are untracked host files** (same as the original
   `~/.claude/hooks/ntfy.sh`) — they are NOT in the pantry repo and not in
   dragon-breath. They live at `~/.pi/agent/extensions/{herald,dragon-image-fetch,kitty-gif-renderer}.ts` + `~/.pi/agent/lib/*.ts`.
3. **Type-checking `~/.pi` needs its own tsconfig** (it's outside the repo).
   The pantry `berrygems/tsconfig.json` won't cover it. Reusable check:

   ```fish
   tsc --project /dev/stdin <<'EOF'   # or save as ~/.pi/agent/tsconfig.json
   {"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"bundler","strict":true,"noEmit":true,"noUnusedLocals":true,"noUnusedParameters":true,"allowImportingTsExtensions":true,"skipLibCheck":true,"esModuleInterop":true,"paths":{"@earendil-works/pi-tui":["~/.npm/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist"],"@earendil-works/pi-coding-agent":["~/.npm/lib/node_modules/@earendil-works/pi-coding-agent/dist"],"@earendil-works/pi-ai":["~/.npm/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist"]}},"include":["~/.pi/agent/extensions/**/*.ts","~/.pi/agent/lib/**/*.ts"]}
   EOF
   ```

   (Note: tsc doesn't expand `~` — use absolute `/home/dot/...` paths in a real
   file.) Currently **green (exit 0)**.
4. **The plan's lib-survivor prediction in REWRITE §1.1 was WRONG** — the
   actual 4 surviving lib modules were `settings, globals, animated-image,
   animated-image-player`, not the predicted `id, cooldown, pi-spawn,
   sse-client, compaction-templates`. Already corrected in REWRITE.md +
   `archived/README.md`. Don't re-derive from the original (wrong) list.
5. **`quickshell` is a keeper** (dot's checkpoint decision: "changed decision,
   keep") but it was OMITTED from REWRITE §1.2's original manifest. Fold it
   as-is into `~/.pi/agent/skills/` in Phase 3. (18 fold-standalone skills
   total, not 17.)
6. **Recursion guard matters.** `notify.sh` sets `export NOTIFY_SKIP=1` so the
   nested headless recap call (`pi -p` / `claude -p`) doesn't re-trigger the
   hook infinitely. Don't remove it.

---

## ▶️ Phase 3 pickup — fold skills into `~/.pi/agent/skills/`

**Current state:** 31 skills in `morsels/skills/`. **Target:** `~/.pi/agent/skills/`
(currently **empty**). One commit: `chore: fold keeper skills to ~/.pi; archive the rest`.

**The fold manifest is REWRITE §1.2** — don't re-derive it. Summary:

- **18 fold-standalone** (copy to `~/.pi/agent/skills/` with per-skill edits):
  `agent-init, atproto, dependency-management, extension-designer, fix, gdscript,
  git, git-auth, github-writing, go, go-testing, go-tui, neoforge, qt, qtqml,
  qtquick, quickshell, research-and-fix, skill-designer`. Plus a slim `rust`
  (enrich-or-drop decision still open, REWRITE §4).
- **10 nugget-source** (extract the noted bit into a keeper, then archive the
  source): `minecraft-modding→neoforge`, `kotlin/java→neoforge`,
  `go-check→go`, `typescript-check/typescript→extension-designer`,
  `pi-events/pi-sessions/pi-tui→extension-designer references`, `gdscript`
  (expand-then-fold).
- **The 2 decoupled-doc skills stay too:** `dragon-image-fetch` + `kitty-gif-renderer`
  (their extensions survived in `~/.pi`; the docs should follow, decoupled).

**Per-skill edits to apply (from REWRITE §1.2, the non-"as-is" ones):**

| Skill | Edit |
|---|---|
| `neoforge` | Fold stack-agnostic MC sections from `minecraft-modding` (codecs/sided-exec/data-gen/perf/compat); drop dual-loader framing. |
| `atproto` | Generalize client-auth bullet to mention Go/`indigo`, not just `@atproto/api`. |
| `extension-designer` | **Imports already fixed in Phase 0.** Still: prune pantry-coupled examples (`berrygems/lib`, `dragon-parchment`, `dragon-digestion`). |
| `fix` | De-Go-ify (`go test`→"project test command", drop `*_test.go`); keep TDD + never-mock-DB + 3-attempt-revert. |
| `dependency-management` | Trim to command tables + prefs (bun/uv/cargo/go/gradle); compress prose. |
| `github-writing` | Salvage berrygems styles voice system + AI attribution; drop generic PR/issue/README template bodies. |
| `git` | Slim: keep only opinionated conventions (GitHub Flow, rebase+squash-merge, autosquash, `rerere`, `--force-with-lease`); drop command catalogs. |
| `rust` | **Decision open (REWRITE §4):** enrich-and-fold, or drop entirely and lean on the model. |

**Verification (REWRITE §3):**

```fish
# frontmatter valid: name matches dir, description + license: MIT present,
# name ≤64 chars [a-z0-9-]
cd ~/Development/pantry; node --experimental-strip-types scripts/lint-skills.ts
# spot-check loads inside pi after /skill:neoforge etc. (post-reload)
```

---

## 🔭 Phases 4–5 (after Phase 3)

- **Phase 4** — retire pantry-the-package: empty the `pi` manifest in
  `package.json`, rewrite README headline to "Retired 2026-06-19", mark
  `.planning/PROJECT.md` + `ROADMAP.md` retired, decide GitHub-archive vs
  holding-pen (REWRITE §4 open item). One commit.
- **No Phase 5** — the plan is 5 phases (0–4).

---

## 🧪 How to re-verify current state

```fish
cd ~/Development/pantry
git status -s                          # clean
git log --oneline -8                   # the scatter commits
ls morsels/skills/ | wc -l             # 31 (awaiting Phase 3)
ls -A ~/.pi/agent/skills/              # empty (Phase 3 target)
ls ~/.pi/agent/extensions/             # 3 survivors + pi-tool-display
# type-check the scattered ~/.pi extensions (use absolute paths in the file):
tsc --project ~/.pi/agent/tsconfig.json   # once you save one there (see gotcha #3)
# dragon-breath standalone:
cd ~/Development/dragon-breath; tsc --project tsconfig.json   # green
```

---

*Authored by Ember 🐉 with dot 🐕, 2026-06-19. Phase 3 resumes after reload.*
