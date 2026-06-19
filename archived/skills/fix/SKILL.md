---
name: fix
description: "Fix a bug with a regression test first, then minimum-change fix. Use when the user reports a bug, asks to fix a specific failure, or says /fix. Enforces TDD red-green workflow and caps attempts."
license: MIT
---

# /fix

Fix a bug. No plan docs. Ship working code.

## Steps

1. **Analyze** — read the relevant code. Max 3 file reads, 2 minutes. Identify the root cause in 1-2 sentences. If you can't find it in 3 reads, say so and ask dot to narrow the scope.

2. **Write a failing test first** — in the appropriate `*_test.go` file, write a table-driven test that reproduces the bug. Run it with `go test ./... -run <TestName>` and confirm it fails. This is the regression guard.

3. **Implement the fix** — change the minimum code necessary. Do not refactor surrounding code. Do not add comments to code you didn't write.

4. **Verify** — run `go build ./...` then `go test ./...`. Both must pass.

5. **If tests fail** — do NOT patch over the failure. Step back, re-read the root cause, and fix properly. Max 3 attempts total. On attempt 3 failure, revert all changes, explain what you learned, and propose two alternative approaches.

## Rules

- Never stay in plan mode. Start implementing after step 1.
- Never mock the database or fake infrastructure in tests.
- Never skip the failing-test step — even for "obvious" fixes.
- If the bug is in a component with no existing tests, write the first test for it.

## When not to use

- Root cause is unclear or the bug spans multiple systems — use `/research-and-fix`.
- Adding a new feature (no pre-existing failure) — this is a bug-fix workflow, not a feature one.
- Refactoring or style cleanup — no regression test to anchor the change.
- Pure documentation or comment changes — no test, no fix loop.
- Fixing flaky tests — diagnose flake first; a regression test on flake masks it.
