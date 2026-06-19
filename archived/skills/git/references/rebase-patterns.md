# Interactive Rebase Patterns

Detailed examples for the `fixup!`/`autosquash` workflow and common rebase scenarios.

## The Autosquash Workflow

The recommended flow: make small commits during development, then clean up before pushing.

### Step 1: Develop with fixup commits

```bash
# Initial commit
git commit -m "feat(panels): add floating panel API"

# Later, realize the API needs a type fix
git commit --fixup=abc1234    # Creates "fixup! feat(panels): add floating panel API"

# Even later, add missing docs
git commit --fixup=abc1234    # Another fixup targeting the same commit
```

### Step 2: Autosquash before push

```bash
git rebase -i --autosquash main
```

Git automatically reorders fixup commits below their targets and marks them `fixup`:

```
pick abc1234 feat(panels): add floating panel API
fixup def5678 fixup! feat(panels): add floating panel API
fixup ghi9012 fixup! feat(panels): add floating panel API
pick jkl3456 docs(panels): add usage examples
```

Save and close — fixups fold into their target automatically.

## Common Rebase Scenarios

### Squash WIP commits into one

```
# Before:
pick a1b2c3d wip
pick e4f5g6h more wip
pick i7j8k9l finished the thing

# After editing:
pick a1b2c3d feat(auth): add SSH key rotation
fixup e4f5g6h more wip
fixup i7j8k9l finished the thing
```

### Reorder commits logically

Move related commits together. Just cut/paste lines in the editor:

```
# Before:
pick a1 feat: add parser
pick b2 fix: typo in README
pick c3 feat: add parser tests
pick d4 docs: update README

# After (group related work):
pick a1 feat: add parser
pick c3 feat: add parser tests
pick b2 fix: typo in README
pick d4 docs: update README
```

### Split a commit with `edit`

```
# Mark the commit to split:
edit a1b2c3d feat: add parser and tests

# Git pauses after that commit. Now:
git reset HEAD~1                    # Undo the commit, keep changes
git add src/parser.ts
git commit -m "feat: add parser"
git add tests/parser.test.ts
git commit -m "test: add parser tests"
git rebase --continue
```

### Reword a commit message

```
# Mark with reword:
reword a1b2c3d fix: typo

# Git opens editor for the new message
```

## Handling Rebase Conflicts

When a rebase hits a conflict:

1. Git pauses and shows the conflicting files
2. Resolve conflicts manually in each file
3. `git add <resolved-files>`
4. `git rebase --continue`
5. Repeat if more conflicts arise

If the rebase becomes too messy: `git rebase --abort` returns to the pre-rebase state.

**Pro tip:** If the same conflict appears repeatedly during a long rebase, enable `rerere`:

```bash
git config --global rerere.enabled true
```

Git remembers your resolutions and applies them automatically next time.

## Safety Rules

- **Never rebase commits that have been pushed to a shared branch** — other people's history breaks
- **Force-push only to your own feature branches** — `git push --force-with-lease` (safer than `--force`)
- **`--force-with-lease` rejects if someone else pushed** — prevents accidentally overwriting their work
- **Reflog is your safety net** — if a rebase goes wrong, `git reflog` shows the pre-rebase state
