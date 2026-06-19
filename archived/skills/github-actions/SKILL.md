---
name: github-actions
description: "GitHub Actions CI/CD workflows: syntax, triggers, jobs, steps, matrix builds, caching, artifacts, secrets, reusable workflows, and composite actions. Use when creating or debugging GitHub Actions workflows, setting up CI/CD pipelines, or working with .github/workflows/ files."
license: MIT
---

# GitHub Actions CI/CD

Workflows live in `.github/workflows/*.yml`. Every push, PR, tag, or schedule can trigger one.

## Quick Reference

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:            # Manual trigger (adds "Run workflow" button)

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

### Common Triggers

```yaml
on:
  push:
    branches: [main, develop]
    tags: ["v*"]
    paths: ["src/**", "!**/*.md"]   # only when source changes

  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

  schedule:
    - cron: "0 9 * * 1"            # Mondays at 09:00 UTC

  release:
    types: [published]

  workflow_dispatch:
    inputs:
      environment:
        description: Target environment
        required: true
        default: staging
        type: choice
        options: [staging, production]

  workflow_call:                    # Makes this a reusable workflow
    inputs:
      version:
        required: true
        type: string
    secrets:
      TOKEN:
        required: true
```

## Workflow Syntax

### Jobs & Steps

```yaml
jobs:
  build:
    runs-on: ubuntu-latest          # or: macos-latest, windows-latest, self-hosted
    timeout-minutes: 30
    continue-on-error: false        # true → job failure doesn't fail the workflow

    env:
      NODE_ENV: test                # job-level env (overrides workflow-level)

    steps:
      - name: Checkout
        uses: actions/checkout@v4   # 'uses' runs an action
        with:
          fetch-depth: 0            # full history (0 = all)

      - name: Run tests
        run: npm test               # 'run' executes shell commands
        env:
          CI: true                  # step-level env (overrides job/workflow)

      - name: Always notify
        if: always()               # runs even if prior steps failed
        run: curl -X POST ${{ secrets.SLACK_HOOK }} -d '{"text":"done"}'
```

**`if` expressions:**

```yaml
if: github.ref == 'refs/heads/main'
if: github.event_name == 'pull_request'
if: needs.build.result == 'success'
if: failure()                       # only if prior step/job failed
if: cancelled()
if: always()                        # unconditional
if: ${{ !cancelled() }}
```

### Job Dependencies & Outputs

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.get-version.outputs.version }}
    steps:
      - id: get-version
        run: echo "version=$(cat VERSION)" >> $GITHUB_OUTPUT

  deploy:
    needs: [build, test]           # waits for both; gets their outputs
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying ${{ needs.build.outputs.version }}"
```

## Matrix Builds

```yaml
strategy:
  fail-fast: false                  # don't cancel other matrix jobs on failure
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: [18, 20, 22]
    include:
      - os: ubuntu-latest
        node: 20
        experimental: true          # add extra keys to specific combos
    exclude:
      - os: windows-latest
        node: 18

runs-on: ${{ matrix.os }}
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}
```

**Dynamic matrix from JSON:**

```yaml
jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.set.outputs.matrix }}
    steps:
      - id: set
        run: echo "matrix=$(jq -cn '[{env:"staging"},{env:"prod"}]')" >> $GITHUB_OUTPUT

  deploy:
    needs: setup
    strategy:
      matrix: ${{ fromJson(needs.setup.outputs.matrix) }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying to ${{ matrix.env }}"
```

## Caching

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-
```

**Language-specific patterns:**

```yaml
# npm:   path: ~/.npm  /  key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
# pnpm:  path: ~/.local/share/pnpm/store  /  key: ...-${{ hashFiles('**/pnpm-lock.yaml') }}
# uv:    path: ~/.cache/uv  /  key: ${{ runner.os }}-uv-${{ hashFiles('**/uv.lock') }}
# Go:    path: ~/.cache/go-build + ~/go/pkg/mod  /  key: ...-${{ hashFiles('**/go.sum') }}
# Cargo: path: ~/.cargo/registry + ~/.cargo/git + target/  /  key: ...-${{ hashFiles('**/Cargo.lock') }}
```

**Most language setup actions have built-in caching:**

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm                      # handles cache key + path automatically
```

## Artifacts

```yaml
# Upload (at end of job)
- uses: actions/upload-artifact@v4
  with:
    name: dist-${{ github.sha }}
    path: dist/
    retention-days: 7              # default 90

# Download (in later job)
- uses: actions/download-artifact@v4
  with:
    name: dist-${{ github.sha }}
    path: dist/

# Download all artifacts
- uses: actions/download-artifact@v4
  with:
    path: artifacts/               # each artifact gets its own subdirectory
```

## Secrets & Security

### Built-in Token

```yaml
env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}    # auto-provisioned per run
```

Default `GITHUB_TOKEN` permissions are read-only for most scopes. Grant explicitly:

```yaml
permissions:
  contents: write          # push commits, create releases
  pull-requests: write     # comment on PRs
  packages: write          # push to GHCR
  id-token: write          # OIDC (cloud auth)
```

Set `permissions:` at workflow or job level. Prefer job-level for least privilege.

### Custom Secrets

```yaml
# Repository/org secrets
${{ secrets.MY_API_KEY }}

# Environment secrets (scoped to a deployment environment)
environment: production
env:
  KEY: ${{ secrets.PROD_KEY }}
```

### OIDC for Cloud Auth (no long-lived credentials)

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/github-actions
      aws-region: us-east-1
```

### Pin Actions by SHA

```yaml
# Vulnerable — tag can be force-pushed
- uses: actions/checkout@v4

# Safe — immutable
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
```

### `pull_request_target` Warning

`pull_request_target` runs with write permissions and access to secrets — **never check out the PR's code and run it**. Use `pull_request` for untrusted code.

## Reusable Workflows

```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: "20"
    secrets:
      NPM_TOKEN:
        required: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci && npm test
```

```yaml
# Caller workflow
jobs:
  call-test:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: "22"
    secrets: inherit               # pass all secrets through
```

## Composite Actions

For reusable step sequences within the same repo. Lives at `<dir>/action.yml`.

```yaml
# .github/actions/setup-node-project/action.yml
name: Setup Node Project
description: Checkout, setup Node, install deps
inputs:
  node-version:
    default: "20"

runs:
  using: composite
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}
        cache: npm
    - run: npm ci
      shell: bash
```

```yaml
# Usage
- uses: ./.github/actions/setup-node-project
  with:
    node-version: "22"
```

**Composite vs reusable workflow:**
- **Composite action** — reusable steps, same runner, lighter weight, no `needs`/matrix
- **Reusable workflow** — full independent job with its own runner, supports matrix/secrets

## Common Patterns

### Test → Build → Deploy

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: production        # requires manual approval if configured
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - run: ./scripts/deploy.sh
```

### Concurrency (Cancel In-Progress)

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true        # cancel old run when new push arrives
```

Use `cancel-in-progress: false` for release/deploy workflows where partial runs are dangerous.

### Release Automation

```yaml
on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: gh release create ${{ github.ref_name }} dist/*.tgz --generate-notes
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Label-Based Deployment

```yaml
on:
  pull_request:
    types: [labeled]

jobs:
  deploy-preview:
    if: github.event.label.name == 'deploy-preview'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying PR #${{ github.event.pull_request.number }}"
```

## Debugging

### Enable Debug Logging

Set as repository secrets (any non-empty string value):

```
ACTIONS_STEP_DEBUG = true      # verbose step-level debug output
ACTIONS_RUNNER_DEBUG = true    # runner infrastructure debug output
```

### Local Testing with `act`

```bash
# Install
brew install act

# Run default push event
act

# Run specific workflow and job
act push -W .github/workflows/ci.yml -j test

# Pass secrets
act -s MY_SECRET=value

# List available workflows and jobs
act -l
```

### Reading Logs via `gh`

```bash
# List recent runs
gh run list --limit 10

# View failed steps only (most useful)
gh run view <run-id> --log-failed

# Watch a run live
gh run watch <run-id>

# Re-run failed jobs
gh run rerun <run-id> --failed

# Download all logs as zip
gh run download <run-id>
```

### Common Failures

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Resource not accessible by integration` | Missing `permissions` | Add `permissions:` block with required scopes |
| `Context access might be invalid` | Wrong expression syntax | Use `${{ }}` for all context reads |
| Cache miss every run | Key includes timestamp/random | Use only stable inputs (`hashFiles`, `runner.os`) |
| Job skipped silently | `if:` evaluated false | Add debug step: `- run: echo "${{ toJson(github) }}"` |
| `set-output` deprecated warning | Old output syntax | Use `echo "key=value" >> $GITHUB_OUTPUT` |
| Artifact not found across jobs | Different `name:` | Ensure upload and download use identical `name:` |
| OIDC token error | Missing `id-token: write` | Add to `permissions` at job or workflow level |
