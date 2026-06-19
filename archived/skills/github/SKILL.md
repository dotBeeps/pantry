---
name: github
description: "GitHub workflows via gh CLI: PRs, issues, CI runs, releases, reviews, and API queries. Use when creating pull requests, reviewing code, checking CI status, managing issues, making releases, or querying the GitHub API."
license: MIT
---

# GitHub CLI Workflows

Use `gh` for all GitHub operations. Always specify `--repo owner/repo` when not in a git directory.

## PR Creation

```bash
# Basic — auto-fill title/body from commits
gh pr create --fill --assignee @me

# Draft PR for early feedback
gh pr create --fill --draft --assignee @me

# With reviewers and labels
gh pr create --fill --reviewer user1 --reviewer org/team --label enhancement

# Verbose fill — include full commit bodies in description
gh pr create --fill-verbose --assignee @me

# Dry run — preview without creating
gh pr create --fill --dry-run

# Specify base branch (when not targeting default)
gh pr create --fill --base develop
```

**Flags to know:**
- `--fill` — title from last commit subject, body from commit bodies
- `--fill-first` — use first commit in branch (not last)
- `--fill-verbose` — include full commit message bodies
- `--draft` — mark as work-in-progress
- `--template <file>` — use a PR template from `.github/`
- `-w` / `--web` — open in browser instead of CLI

For writing high-quality PR descriptions, see the `github-writing` skill.

## Code Review

```bash
gh pr view <number>                           # View PR details
gh pr diff <number>                           # View PR diff
gh pr review <number> --approve               # Approve
gh pr review <number> --request-changes -b "Fix the null check on line 42"
gh pr review <number> --comment -b "Looks good, minor suggestions inline"
```

## Merging

**Decision tree:**
- Default feature PR → `--squash` (clean single commit on main)
- Preserving individual commits matters → `--rebase`
- Branch topology matters (release merges) → `--merge`

```bash
# Squash-merge and delete branch (most common)
gh pr merge <number> --squash --delete-branch

# Auto-merge — merges when all checks pass
gh pr merge <number> --auto --squash --delete-branch

# Rebase-merge (preserves individual commits)
gh pr merge <number> --rebase --delete-branch
```

## CI Integration

```bash
# List recent workflow runs
gh run list --limit 10

# Check CI status on current PR
gh pr checks

# Watch a run until completion (exits non-zero on failure)
gh run watch <run-id> --exit-status

# View failed step logs only
gh run view <run-id> --log-failed

# View full logs for a specific job
gh run view <run-id> --log --job <job-id>

# Re-run failed jobs
gh run rerun <run-id> --failed
```

**CI-then-merge pattern:**
```bash
gh run watch <run-id> --exit-status && gh pr merge --squash --delete-branch
```

## Issues

```bash
# Create an issue
gh issue create --title "Bug: panel flickers" --body "Steps to reproduce..."

# Create with labels and assignee
gh issue create --title "..." --body "..." --label bug --assignee @me

# List open issues
gh issue list --state open

# Filter by label
gh issue list --label bug --label urgent

# Close with reason
gh issue close <number> --reason completed

# Edit labels
gh issue edit <number> --add-label "in-progress" --remove-label "triage"

# Search issues
gh issue list --search "is:open label:bug sort:updated-desc"
```

For writing effective issue reports, see the `github-writing` skill.

## Releases

```bash
# Create release with auto-generated notes
gh release create v1.0.0 --generate-notes

# Draft release (review before publishing)
gh release create v1.0.0 --generate-notes --draft

# Pre-release
gh release create v1.0.0-rc.1 --prerelease --generate-notes

# Upload assets
gh release upload v1.0.0 ./dist/package.tar.gz ./dist/checksums.txt

# Create from specific tag with custom notes
gh release create v1.0.0 --notes "## Highlights\n- Feature X\n- Fix Y"
```

## JSON Output & Filtering

Most commands support structured output:

```bash
# Get PR fields as JSON
gh pr list --json number,title,author,labels

# Filter with jq
gh pr list --json number,title,author --jq '.[] | "\(.number): \(.title) by \(.author.login)"'

# Get specific PR details
gh pr view <number> --json title,body,reviews,statusCheckRollup
```

## GraphQL API

For complex queries not covered by subcommands:

```bash
# Query with variables (always use -F for variables, never string interpolation)
gh api graphql -F owner='dotBeeps' -F repo='project' -f query='
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      issues(first: 10, states: OPEN) {
        nodes { number title }
      }
    }
  }
'
```

**Safety rules:**
- Use `-F key=value` for variables — never interpolate strings into queries
- Use `--paginate --slurp` for large result sets with `pageInfo` + `$endCursor`
- Use `-f` for string fields, `-F` for non-string fields (numbers, booleans, enums)

See [references/gh-cheatsheet.md](references/gh-cheatsheet.md) for a one-page command reference and [references/graphql-patterns.md](references/graphql-patterns.md) for common queries.

## Labels & Milestones

```bash
# List labels
gh label list

# Create a label
gh label create "priority/high" --color FF0000 --description "Urgent issues"

# Milestones (via API — no direct subcommand)
gh api repos/{owner}/{repo}/milestones --jq '.[].title'
```
