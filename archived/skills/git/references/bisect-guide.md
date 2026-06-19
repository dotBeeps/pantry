# Git Bisect Guide

Advanced bisect patterns for automated bug hunting.

## Automated Bisect with Test Script

The most powerful bisect pattern — let git run your tests automatically:

```bash
# Start bisect with known good and bad commits
git bisect start HEAD v1.2.0

# Run a test script at each step
# Exit 0 = good, 1-124/126-127 = bad, 125 = skip (can't test this commit)
git bisect run ./scripts/test-bug.sh
```

### Writing a test script

```bash
#!/bin/bash
# scripts/test-bug.sh — exits 0 if the bug is NOT present

# If the project can't build at this commit, skip it
npm run build 2>/dev/null || exit 125

# Run the specific test that reproduces the bug
npm test -- --grep "panel renders correctly" 2>/dev/null
exit $?
```

Make the script executable: `chmod +x scripts/test-bug.sh`

### Key exit codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Good — bug not present |
| 1–124, 126–127 | Bad — bug is present |
| 125 | Skip — commit can't be tested (build failure, etc.) |

## Bisect with Build Steps

For projects that need compilation:

```bash
git bisect start HEAD abc1234
git bisect run sh -c 'make clean && make && ./run-test'
```

Using `sh -c` lets you chain commands. The final exit code determines good/bad.

## Bisect a Specific Path

Limit bisect to commits that touched specific files:

```bash
git bisect start HEAD abc1234 -- src/parser/
```

Git skips commits that didn't change files in `src/parser/`.

## Viewing Bisect Results

After bisect completes:

```bash
git bisect log    # Show the full bisect history
git show          # Examine the identified bad commit
git bisect reset  # Return to original HEAD
```

## Tips

- **Narrow the range** — the closer your good/bad boundaries, the fewer steps (log₂ of commits between them)
- **Use tags or release commits as "good"** — they're easy to reference and known-stable
- **Skip broken commits** — `git bisect skip` (or exit 125 in scripts) for commits that can't be tested
- **Bisect works with any binary property** — not just bugs. "When did performance drop below X?" works too
