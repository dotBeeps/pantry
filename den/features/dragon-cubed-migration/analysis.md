# Dragon-Cubed Monorepo Migration Analysis

**Date:** 2026-04-07
**Status:** Research complete — ready for planning

---

## Current State Summary

**dragon-cubed** is a three-component Minecraft body:

| Component | Language | Build System | Module Path |
|---|---|---|---|
| **SoulGem** | Go 1.26.1 | `go build` | `dev.dragoncubed/soulgem` |
| **Leylines** | Kotlin/Java | Gradle 8.14 (NeoForge mod) | `net.dragoncubed.leylines` |
| **Rumble** | Kotlin/Java | Gradle 8.14 (Baritone extension) | `net.dragoncubed.rumble` |

- Gradle uses a multi-project `settings.gradle.kts` at root including `leylines` and `rumble`
- SoulGem is a standalone Go module under `soulgem/`
- Repo size: ~72K excluding .git/build artifacts; .git is 56K (5 commits — very young)
- No CI/CD workflows exist yet (`.github/` is empty in both repos)
- No git remote configured on dragon-cubed

---

## 1. Directory Placement

### Option A: `dragon-cubed/` at root (RECOMMENDED)

```
hoard/
├── berrygems/
├── dragon-cubed/       ← here, parallel to dragon-daemon
│   ├── soulgem/        Go orchestrator
│   ├── leylines/       NeoForge mod (Kotlin)
│   ├── rumble/         Baritone extension (Kotlin)
│   ├── settings.gradle.kts
│   ├── AGENTS.md
│   └── ...
├── dragon-daemon/
├── morsels/
└── den/
```

**Pros:**
- Matches existing layout: `dragon-daemon/` and `dragon-cubed/` are siblings — both are "dragon" subsystems
- AGENTS.md already describes this placement: *"dragon-cubed — currently a separate repository, planned for monorepo integration"*
- Each has its own isolated build toolchain (Go vs Gradle) — no conflicts
- `pi install` only cares about `berrygems/` and `morsels/` — dragon-cubed is invisible to pi

**Cons:**
- Root gets one more top-level directory (currently 6 visible dirs → 7)

### Option B: `bodies/` parent directory

```
hoard/
├── bodies/
│   ├── dragon-cubed/
│   └── dragon-daemon/   ← would need to move
└── ...
```

**Pros:** Clean semantic grouping if more bodies emerge

**Cons:**
- Requires moving `dragon-daemon/` — breaks all import paths (`github.com/dotBeeps/hoard/dragon-daemon/...`), every Go file, every CI reference
- Premature abstraction — only 2 bodies exist. Reorganize later if needed.
- Disrupts established contributor muscle memory

**Verdict: Option A.** Root-level `dragon-cubed/` alongside `dragon-daemon/`. Simple, matches existing patterns, zero disruption.

---

## 2. Build System Conflicts

**No conflicts.** The build systems are entirely disjoint:

| Concern | hoard today | dragon-cubed adds |
|---|---|---|
| **Go** | `dragon-daemon/` (Go 1.26, own `go.mod`) | `dragon-cubed/soulgem/` (Go 1.26.1, own `go.mod`) |
| **TypeScript** | `berrygems/` (jiti, no build) | Nothing |
| **Gradle** | None | `dragon-cubed/` root with `settings.gradle.kts` |
| **JDK** | Not required | JDK 21 (NeoGradle) |

Key points:
- Go modules are self-contained — two `go.mod` files at different paths coexist perfectly
- Gradle wrapper (`gradlew`) is self-contained — lives inside `dragon-cubed/`, doesn't affect root
- No shared `package.json` — dragon-cubed has no Node/TS components
- The root `hoard/` has no top-level build system that dragon-cubed would conflict with

**One consideration:** Go version alignment. daemon uses `go 1.26`, SoulGem uses `go 1.26.1`. Minor mismatch — harmless, but worth standardizing to `1.26.1` across both.

---

## 3. Git History Preservation

### Options

| Approach | History preserved? | Complexity | Clean? |
|---|---|---|---|
| **Fresh copy** (just copy files) | ❌ No | Trivial | ✅ Cleanest |
| **`git subtree add`** | ✅ Full | Low | ⚠️ Merge commit |
| **`git filter-repo` + merge** | ✅ Full, rewritten to subdir | Medium | ✅ Clean |

### Recommendation: Fresh copy

**Why:**
- dragon-cubed has only **5 commits**. The history is trivial.
- Preserving 5 commits via subtree merge adds tooling complexity and a merge commit for negligible value
- A single migration commit (`feat(dragon-cubed): integrate into hoard monorepo`) is clean and self-documenting
- The original repo can be archived at `github.com/dotBeeps/dragon-cubed` with a pointer to hoard

**Migration steps:**
```bash
# From hoard root
cp -r /home/dot/Development/dragon-cubed/ ./dragon-cubed/
rm -rf dragon-cubed/.git
# Review .gitignore (merge into root or keep dragon-cubed's own)
git add dragon-cubed/
git commit -m "feat(dragon-cubed): integrate minecraft body into hoard monorepo

Migrates SoulGem (Go orchestrator), Leylines (NeoForge mod), and
Rumble (Baritone extension) from standalone repo.

Previous repo: github.com/dotBeeps/dragon-cubed (archived)"
```

---

## 4. Shared Code Between dragon-daemon and dragon-cubed

### Current state: No shared code

- **dragon-daemon** Go module: `github.com/dotBeeps/hoard/dragon-daemon`
- **SoulGem** Go module: `dev.dragoncubed/soulgem`
- They share zero imports. SoulGem uses `gorilla/websocket` + `cobra`; daemon uses `fsnotify` + `slog` + its own internal packages.

### Future shared code: The `body.Body` interface

This is the critical integration point. The daemon already defines:

```go
// internal/body/body.go
type Body interface {
    ID() string
    Type() string              // e.g. "minecraft"
    Start(ctx context.Context) error
    Stop() error
    State(ctx context.Context) (sensory.BodyState, error)
    Execute(ctx context.Context, name string, args map[string]any) (string, error)
    Tools() []ToolDef
    Events() <-chan sensory.Event
}
```

And has `internal/body/hoard/` as a concrete implementation. A `minecraft` body would:
1. Live at `dragon-daemon/internal/body/minecraft/`
2. Import and implement the `body.Body` interface
3. Connect to SoulGem's HTTP/WebSocket API to relay commands to the Minecraft world

**SoulGem itself remains standalone** — it's the Minecraft-side orchestrator that talks to Leylines via WebSocket. The daemon doesn't embed SoulGem; it connects to it over the network.

### Recommended approach: No Go module merge

Keep `soulgem/` and `dragon-daemon/` as separate Go modules. The daemon's `minecraft` body type will be a network client that speaks SoulGem's API. Shared protocol types (if needed) can live in a lightweight `dragon-cubed/soulgem/pkg/protocol/` package that both can import, but this is a Phase 4+ concern.

---

## 5. CI/CD Impact

### Current state: No CI exists in either repo

Neither repo has `.github/workflows/`. This is a greenfield opportunity.

### Recommended verification matrix post-migration

Add to the Pre-Commit Checklist in root AGENTS.md:

```bash
# dragon-cubed: SoulGem (Go)
cd dragon-cubed/soulgem && go build ./...
cd dragon-cubed/soulgem && go vet ./...

# dragon-cubed: Leylines + Rumble (Gradle)
cd dragon-cubed && ./gradlew build
```

### Future CI considerations

- **Gradle builds are slow** (~30s+ cold, JVM startup). Use path-based triggers so Gradle only runs when `dragon-cubed/leylines/` or `dragon-cubed/rumble/` change.
- **JDK 21 dependency** — CI runners need JDK 21 for NeoGradle. Use `actions/setup-java@v4`.
- **Gradle wrapper committed** — `gradlew` + `gradle/wrapper/` are already in the repo, so CI doesn't need Gradle installed.
- **SoulGem Go checks** can share the same Go setup as dragon-daemon but run independently.

---

## 6. AGENTS.md Updates

### Files to create/update:

| File | Action | Content |
|---|---|---|
| `hoard/AGENTS.md` | **Update** | Change dragon-cubed entry from "external — pending monorepo integration" to active. Update repo layout tree. Add Gradle verification steps to Pre-Commit Checklist. |
| `dragon-cubed/AGENTS.md` | **Update** | Rewrite to reflect monorepo context. Remove standalone repo setup instructions. Add: role as a daemon body, relationship to `dragon-daemon/internal/body/`, build/verify commands, import path conventions. |
| `den/features/dragon-cubed-migration/AGENTS.md` | **Create** | Migration tracking doc — current state, what's done, what's pending. |

### dragon-cubed/AGENTS.md should cover:

1. **Role:** Minecraft body for the dragon daemon — SoulGem orchestrates, Leylines senses, Rumble acts
2. **Relationship to daemon:** SoulGem exposes HTTP+WebSocket API; daemon's `minecraft` body type connects as a client
3. **Build commands:** `./gradlew build` (mods), `cd soulgem && go build ./...` (orchestrator)
4. **Ethics:** Link to root ETHICS.md — observation of Minecraft world state is covered by consent tiers
5. **Three-component architecture:** SoulGem (Go CLI → HTTP server), Leylines (NeoForge mod → game hooks), Rumble (Baritone → pathfinding/mining)

---

## 7. Ethics Applicability

ETHICS.md defines consent tiers and observation principles. Here's what applies to dragon-cubed:

### Directly applicable

| Principle | Relevance |
|---|---|
| **§2 Observation, not surveillance** | SoulGem observes Minecraft world state (player position, inventory, chat). This is consensual — it's dot's own game. But the principle of "narrate what you see, never what you infer about the person" still applies to how the agent describes observations. |
| **§3 Consent tiers** | dragon-cubed operates at **Tier 2 (Active Collaboration)** minimum — it's actively directed. If the daemon inhabits the body autonomously, it escalates to **Tier 3 (Autonomous Action)** which requires explicit consent. |
| **§4 Memory & vault** | If SoulGem or the daemon logs Minecraft session data to the vault, it must respect private shelves. Game chat logs could contain sensitive content. |
| **§5 Dual-key consent** | Any new observation capability (e.g., logging chat from multiplayer servers) requires consent from both parties before implementation. |

### Not directly applicable (but worth noting)

- **Body data / vulnerability design:** Minecraft body state isn't personal health data, but the principle of "don't infer emotional state from behavior" applies — don't psychoanalyze play patterns.
- **Third-party data:** If dragon-cubed operates on multiplayer servers, other players' data falls under stricter constraints. The daemon should not store or analyze other players' behavior.

### Recommended action

Add a brief ethics section to `dragon-cubed/AGENTS.md`:
```markdown
## Ethics
This body is governed by [/ETHICS.md](/ETHICS.md). Key constraints:
- World observation is consensual (Tier 2+). Autonomous inhabitation requires Tier 3 consent.
- Game chat logs may contain sensitive content — vault rules apply.
- Multiplayer: never store or analyze other players' behavior.
```

---

## 8. Risks

### Low risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Go version mismatch** | Certain (1.26 vs 1.26.1) | Standardize both to 1.26.1 |
| **`.gitignore` overlap** | Low | dragon-cubed's `.gitignore` covers Gradle/Java artifacts; hoard's covers Node/TS. Merge or keep separate — both work. |
| **Repo size growth** | Low | dragon-cubed is 72K. Gradle wrapper adds ~50K. Negligible. |

### Medium risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Gradle wrapper version drift** | Medium | Pin version in AGENTS.md. `./gradlew wrapper --gradle-version=X` to update. |
| **JDK version requirement** | Medium | Document JDK 21 requirement clearly. Not everyone has it. Consider `gradle/toolchains` auto-download. |
| **SoulGem module path change** | Medium | Currently `dev.dragoncubed/soulgem`. Should probably become `github.com/dotBeeps/hoard/dragon-cubed/soulgem` post-migration. This is a breaking change if anything external imports it (currently nothing does). |

### Low-but-painful risk

| Risk | Likelihood | Mitigation |
|---|---|---|
| **NeoForge/Minecraft version lock-in** | Low (but recurring) | NeoForge mods pin to specific MC versions. When MC updates, Leylines and Rumble need coordinated updates. This is inherent to Minecraft modding, not a monorepo issue. |
| **Large binary assets later** | Low now | Minecraft mods can accumulate resource packs, textures. Set up `.gitattributes` with LFS patterns for `*.jar`, `*.png` in `dragon-cubed/` proactively. |

### Not a risk

- **Namespace conflicts:** Go modules are path-isolated. Gradle projects are directory-isolated. No collisions possible.
- **pi package discovery:** `pi install` looks for `extensions/` and `skills/` directories. dragon-cubed has neither — completely invisible to pi.

---

## Migration Checklist

When ready to execute:

- [ ] Copy dragon-cubed into hoard (fresh copy, no git history)
- [ ] Remove `.git/` from copied directory
- [ ] Update `soulgem/go.mod` module path to `github.com/dotBeeps/hoard/dragon-cubed/soulgem`
- [ ] Fix all Go import paths in soulgem to match new module path
- [ ] Standardize Go version to 1.26.1 in both `go.mod` files
- [ ] Update `dragon-cubed/AGENTS.md` for monorepo context
- [ ] Update root `hoard/AGENTS.md` — layout tree, verification steps, feature table
- [ ] Add ethics section to `dragon-cubed/AGENTS.md`
- [ ] Verify builds: `cd dragon-cubed/soulgem && go build ./...`
- [ ] Verify builds: `cd dragon-cubed && ./gradlew build`
- [ ] Verify existing builds still pass: `tsc --project berrygems/tsconfig.json`, `cd dragon-daemon && go build ./...`
- [ ] Commit: `feat(dragon-cubed): integrate minecraft body into hoard monorepo`
- [ ] Archive original repo with pointer to hoard
- [ ] Create `den/features/dragon-cubed-migration/AGENTS.md` tracking doc
