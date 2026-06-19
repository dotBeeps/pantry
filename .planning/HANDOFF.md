# Pantry Scatter — Handoff

**Snapshot date:** 2026-06-19 · **For:** resuming the retirement after a pi reload / fresh session.

> This doc is the **"where are we, what's left"** companion to
> [REWRITE.md](REWRITE.md) (the full plan + checkboxes). Read this first to
> get oriented; drill into REWRITE.md for per-item detail. The triage evidence
> lives in `~/pantry-triage/SYNTHESIS.md` + `cluster-*.md`.

---

## TL;DR — what is this

`pantry` (this repo) is **retired as a pi-package**. Survivors scattered to
`~/.pi/agent/` (3 extensions + 22 skills) and a standalone repo
(`~/Development/dragon-breath`); everything else is archived in-repo under
`pantry/archived/`. dot's host is the only consumer; nothing is published to
npm. **Phases 0–4 are done — the scatter is complete.** Only **4.4** remains
(dot's GitHub decision: archive the repo, or keep as a local holding pen).

---

## ✅ Done (Phases 0–4, 10 commits)

```
2663f0a chore: fold keeper skills to ~/.pi; archive the rest              (Phase 3)
2f6d0ff docs(planning): close out Phase 2 — status → in-progress, add HANDOFF.md
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
| **3** | 22 keeper skills folded into `~/.pi/agent/skills/` (18 fold-standalone + `rust` + `quickshell` + 2 decoupled image-doc skills), per-skill edits applied; nuggets extracted from minecraft-modding/kotlin/java/go-check/typescript×2/pi-events/sessions/tui into keepers; all 31 remaining `morsels/skills/` → `archived/skills/` (now 54 total). | ✅ committed |
| **4** | Retired pantry-the-package: removed `pi` manifest from `package.json`, rewrote `README.md` as a retirement notice, prepended 🪦 RETIRED banners to `PROJECT.md` + `ROADMAP.md`. | ✅ committed |

---

## ⏳ dot's remaining actions (post-scatter)

1. **(Required) 4.4 — pantry repo fate.** Either push the 10 local commits
   and **archive the repo on GitHub** (history preserved, clearly read-only
   — recommended), or keep it as a local-only holding pen. This is the **only**
   outstanding plan item.
2. **Rotate `NTFY_TOKEN`** — still the old `tk_b15q…` value (same as was
   exposed in the original Claude hook). Mint a new one on ntfy.beepboop.dog,
   then `set -Ux NTFY_TOKEN <new>` (fish). Propagates to **both** pi + Claude
   via the shared script. No edits needed.
3. **Live-verify herald** — herald.ts was created mid-Phase-2, so it loads on
   your reload. After reload, trigger a pi turn >5s and confirm a recap push
   lands on your **pi** ntfy topic.
   - If no push: dry-run branches are verified, so the likely culprit is the
     `pi -p` recap call itself (model/auth/timeout) — debug from there.
4. **Spot-check folded skills** (Phase 3.4, deferred) — after reload,
   `/skill:neoforge`, `/skill:extension-designer`, `/skill:git-auth` should
   load.
5. **(Optional) 2A.6** — push `~/Development/dragon-breath` to private
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

## ▶️ Phase 3 — DONE (commit `2663f0a`)

22 keeper skills now live in `~/.pi/agent/skills/` (host-local, untracked by
this repo): 18 fold-standalone + `rust` + `quickshell` + 2 decoupled
image-doc skills. All per-skill edits from REWRITE §1.2 were applied
(neoforge absorbed minecraft-modding's stack-agnostic sections; atproto
generalized to Go/`indigo`; extension-designer pruned pantry examples +
rewrote `references/pi-internals.md` clean; fix de-Go-ified; dependency-
management trimmed to command tables; github-writing salvaged the voice system
into local `styles/` + attribution; git slimmed + added `--force-with-lease`/
`rerere`; gdscript enriched with gdformat/gdlint/gdparse + corrected the
GdUnit4 headless-test note; `rust` folded exactly as-is per dot's decision).

Nuggets extracted into keepers from minecraft-modding/kotlin/java/go-check/
typescript×2/pi-events/sessions/tui. All 31 remaining `morsels/skills/` →
`archived/skills/` (54 total); `morsels/skills/` is now empty.

**Verification:** `scripts/lint-skills.ts` is inoperative post-Phase-1 (its
`berrygems/lib/globals.ts` dep is archived), so frontmatter was validated with
an equivalent ad-hoc check against `~/.pi/agent/skills/` — **22/22 pass**.
Spot-checking `/skill:<name>` loads is deferred to dot's next `/reload`.

---

## 🔭 Phase 4 — DONE (commit pending this session)

Retired pantry-the-package: removed the `pi` manifest from `package.json`,
rewrote `README.md` as a retirement notice (survivor-destination table +
pointers), and prepended 🪦 RETIRED banners to `.planning/PROJECT.md` +
`ROADMAP.md` (historical content preserved below). **No Phase 5** — the plan is
phases 0–4. Only **4.4** (dot's GitHub decision) remains.

---

## 🧪 How to re-verify current state

```fish
cd ~/Development/pantry
git status -s                          # clean
git log --oneline -3                   # 2663f0a (Phase 3) + this Phase 4 commit
ls morsels/skills/ | wc -l             # 0 (empty — all folded/archived)
ls ~/.pi/agent/skills/ | wc -l         # 22 (the folded keepers)
grep -c '"pi"' package.json            # 0 (manifest removed)
ls ~/.pi/agent/extensions/             # 3 survivors + pi-tool-display
# type-check the scattered ~/.pi extensions (use absolute paths in the file):
tsc --project ~/.pi/agent/tsconfig.json   # if you saved one there (see gotcha #3)
# dragon-breath standalone:
cd ~/Development/dragon-breath; tsc --project tsconfig.json   # green
```

---

*Authored by Ember 🐉 with dot 🐕, 2026-06-19. Scatter complete; only 4.4 (GitHub decision) remains.*
