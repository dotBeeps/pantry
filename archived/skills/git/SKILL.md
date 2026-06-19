---
name: git
description: "Git conventions: branching strategy, rebase vs merge, interactive rebase, history surgery, stash, conflict resolution. Use when working with git branches, rebasing, cherry-picking, bisecting, resolving conflicts, or navigating git history."
license: MIT
---

# Git Conventions

Opinionated git workflow for solo and small-team development. For committing, see the `commit` skill. For GitHub operations, see the `github` skill.

## Branching Strategy

Use **GitHub Flow** — short-lived feature branches off `main`.

- Branch from `main` for every change — no long-lived develop/staging branches
- Name branches `<type>/<description>`: `feat/panel-api`, `fix/auth-timeout`, `docs/skill-guide`
- Keep branches short-lived — merge within 1–3 days, not weeks
- Delete branches after merge — `gh pr merge --delete-branch` or `git branch -d <branch>`
- Never commit directly to `main` — always PR, even for solo work (creates review trail)

## Merge Philosophy

Rebase locally, squash-merge to main.

- **Local cleanup:** `git rebase -i` to tidy commits before pushing — squash WIP, reword messages, reorder logically
- **PR integration:** squash-merge to `main` — one clean commit per PR in the mainline history
- **Never rebase shared branches** — if someone else has pulled your branch, use merge instead
- **Merge commits** are acceptable for long-lived integration branches or release merges where topology matters

**Decision tree:**
- Cleaning up local work? → `git rebase -i`
- Merging a PR to main? → squash-merge
- Integrating main back into a feature branch? → `git rebase main` (if solo) or `git merge main` (if shared)
- Release branch merge? → `git merge --no-ff` to preserve the merge point

## Interactive Rebase

The `fixup!`/`autosquash` workflow is the primary cleanup pattern.

**Setup once:**
```bash
git config --global rebase.autoSquash true
```

**During development** — make fixup commits instead of amending:
```bash
git commit --fixup=<sha>    # Creates "fixup! <original message>"
```

**Before pushing** — autosquash folds fixups into their targets:
```bash
git rebase -i --autosquash main
```

**Interactive rebase operations:**
- `pick` — keep commit as-is
- `reword` — keep commit, edit message
- `squash` — merge into previous commit, combine messages
- `fixup` — merge into previous commit, discard this message
- `edit` — pause after this commit for amendments
- `drop` — remove commit entirely

See [references/rebase-patterns.md](references/rebase-patterns.md) for detailed examples.

## History Surgery

### Bisect

Binary search for the commit that introduced a bug:

```bash
git bisect start
git bisect bad                  # Current commit is broken
git bisect good <known-good>    # Last known working commit
# Git checks out middle commit — test it, then:
git bisect good                 # or: git bisect bad
# Repeat until git identifies the first bad commit
git bisect reset                # Return to original HEAD
```

**Automate with a test script:**
```bash
git bisect start HEAD <known-good>
git bisect run ./test-script.sh   # Exit 0 = good, non-zero = bad
```

### Cherry-Pick

Apply specific commits from another branch:

```bash
git cherry-pick <sha>               # Single commit
git cherry-pick <start>..<end>      # Range (exclusive start)
git cherry-pick <sha> --no-commit   # Stage changes without committing
```

If conflicts occur: resolve, `git add`, then `git cherry-pick --continue`. Abort with `git cherry-pick --abort`.

### Reflog Recovery

The reflog tracks every HEAD movement — your undo history:

```bash
git reflog                        # Show recent HEAD movements
git checkout <reflog-sha>         # Recover a lost commit
git branch recovered <reflog-sha> # Create branch at recovered point
```

Reflog entries expire after 90 days (30 for unreachable). If you lost something, act promptly.

See [references/bisect-guide.md](references/bisect-guide.md) for advanced bisect patterns.

## Stash

Temporarily shelve changes without committing:

```bash
git stash push -m "wip: panel layout"   # Stash with descriptive message
git stash push -p                       # Interactively select hunks to stash
git stash push -- path/to/file          # Stash specific files only
git stash list                          # Show all stashes
git stash show -p stash@{0}             # Show stash contents as diff
git stash pop                           # Apply most recent stash and remove it
git stash apply stash@{2}               # Apply specific stash, keep it in list
git stash drop stash@{0}                # Delete a stash
```

- Prefer `pop` for one-off stashes — it cleans up automatically
- Use `apply` when you might need the stash again (e.g., applying to multiple branches)
- Always use `-m "message"` — unnamed stashes are impossible to identify later

## Reset & Clean

### Reset modes

```bash
git reset --soft HEAD~1    # Undo commit, keep changes staged
git reset --mixed HEAD~1   # Undo commit, unstage changes (default)
git reset --hard HEAD~1    # Undo commit, discard all changes (destructive!)
```

- `--soft` — "I want to redo this commit with different staging"
- `--mixed` — "I want to redo staging and committing"
- `--hard` — "Throw it all away" — recoverable via `git reflog` if needed

### Clean untracked files

```bash
git clean -n     # Dry run — show what would be deleted
git clean -fd    # Delete untracked files and directories
git clean -fxd   # Also delete ignored files (full reset to tracked-only state)
```

Always `git clean -n` first — clean is not undoable.

## Conflict Resolution

- Enable `rerere` to remember conflict resolutions: `git config --global rerere.enabled true`
- For binary files or known-correct sides: `git checkout --ours <file>` or `git checkout --theirs <file>`
- After resolving: `git add <file>` then `git rebase --continue` (or `git merge --continue`)
- Abort if stuck: `git rebase --abort` or `git merge --abort` — no shame, try a different approach
- For complex conflicts, use `git log --merge -p <file>` to see both sides' changes to the conflicted file

**Strategy flags (for automated resolution):**
```bash
git merge -X ours      # On conflict, prefer our changes
git merge -X theirs    # On conflict, prefer their changes
```

Use strategy flags only when you're certain one side is correct. Manual resolution is usually better.

## Git Archaeology

Find when and why code changed:

```bash
git blame <file>                        # Who changed each line, when
git blame -L 10,20 <file>              # Blame specific line range
git log -S "functionName"              # Find commits that added/removed this string (pickaxe)
git log -G "regex_pattern"             # Find commits where this regex appears in diffs
git log --all --oneline -- <path>      # History of a file (including deleted files)
git log --diff-filter=D --name-only    # Find deleted files
git show <sha>:<path>                  # View file at a specific commit
```

- `-S` finds where a string was introduced or removed — use for "when did this function appear?"
- `-G` matches the regex in diff content — use for "when did this pattern change?"
- `--follow` tracks file renames: `git log --follow <file>`
