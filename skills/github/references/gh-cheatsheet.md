# gh CLI Cheatsheet

One-page quick reference. All commands assume you're in a git repo or using `--repo owner/repo`.

## Pull Requests

| Action | Command |
|--------|---------|
| Create PR | `gh pr create --fill --assignee @me` |
| Create draft PR | `gh pr create --fill --draft` |
| View PR | `gh pr view <number>` |
| View PR diff | `gh pr diff <number>` |
| List open PRs | `gh pr list` |
| Check CI status | `gh pr checks` |
| Approve PR | `gh pr review <number> --approve` |
| Request changes | `gh pr review <number> --request-changes -b "..."` |
| Squash-merge + delete | `gh pr merge <number> --squash -d` |
| Auto-merge when ready | `gh pr merge <number> --auto --squash -d` |
| Re-request review | `gh pr edit <number> --add-reviewer user` |

## Issues

| Action | Command |
|--------|---------|
| Create issue | `gh issue create -t "Title" -b "Body"` |
| List open issues | `gh issue list` |
| Filter by label | `gh issue list -l bug` |
| Close issue | `gh issue close <number> --reason completed` |
| Add label | `gh issue edit <number> --add-label "label"` |
| Search issues | `gh issue list --search "query"` |
| Assign to self | `gh issue edit <number> --add-assignee @me` |

## CI / Workflow Runs

| Action | Command |
|--------|---------|
| List runs | `gh run list --limit 10` |
| View run | `gh run view <run-id>` |
| Watch run (blocking) | `gh run watch <run-id> --exit-status` |
| Failed logs only | `gh run view <run-id> --log-failed` |
| Re-run failed | `gh run rerun <run-id> --failed` |
| Cancel run | `gh run cancel <run-id>` |

## Releases

| Action | Command |
|--------|---------|
| Create release | `gh release create v1.0.0 --generate-notes` |
| Draft release | `gh release create v1.0.0 --generate-notes --draft` |
| Upload assets | `gh release upload v1.0.0 ./file.tar.gz` |
| List releases | `gh release list` |
| Delete release | `gh release delete v1.0.0 --yes` |

## Repository

| Action | Command |
|--------|---------|
| Clone | `gh repo clone owner/repo` |
| Fork | `gh repo fork owner/repo --clone` |
| View | `gh repo view owner/repo` |
| Create | `gh repo create name --public --source .` |

## JSON / Filtering

```bash
# List with specific fields
gh pr list --json number,title,author

# Filter with jq
gh pr list --json number,title --jq '.[] | "\(.number): \(.title)"'

# Single item fields
gh pr view 55 --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.name): \(.status)"'
```

## Auth

| Action | Command |
|--------|---------|
| Check status | `gh auth status` |
| Login | `gh auth login` |
| Setup git credentials | `gh auth setup-git` |
| Refresh token | `gh auth refresh` |
