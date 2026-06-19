---
name: typescript-check
description: "Run TypeScript type checking and linting, interpret errors, and fix common patterns. Use when checking for type errors, running tsc, debugging TS compiler output, or validating TypeScript before committing."
license: MIT
---

# TypeScript Verification

Run `tsc` and `eslint` to catch errors before they reach runtime. This skill covers **running the tools and interpreting output** — see the `typescript` skill for code conventions.

## Quick Reference

```bash
# Type check a project (most common)
tsc --project tsconfig.json

# Type check without emitting (verify only)
tsc --noEmit

# Check a specific file's errors from full project check
tsc --project tsconfig.json 2>&1 | grep "filename.ts"

# Count total errors
tsc --project tsconfig.json 2>&1 | grep "error TS" | wc -l

# Group errors by code
tsc --project tsconfig.json 2>&1 | grep "error TS" | sed 's/.*error //' | sort | uniq -c | sort -rn
```

## Reading tsc Output

Format: `file(line,col): error TSXXXX: message`

```
src/foo.ts(42,10): error TS2339: Property 'bar' does not exist on type 'Foo'.
```

### Common Error Codes

| Code | Meaning | Typical Fix |
|------|---------|-------------|
| **TS2307** | Cannot find module | Check import path, install types, add path mapping |
| **TS2339** | Property does not exist | Add to interface, check spelling, narrow type |
| **TS2345** | Argument type mismatch | Add cast, fix type, widen parameter type |
| **TS2322** | Type not assignable | Check return type, add missing properties |
| **TS2347** | Untyped function + type args | Remove generic param or type the function |
| **TS2305** | Module has no exported member | Check export name, wrong module, version mismatch |
| **TS2554** | Wrong argument count | Check API docs, function signature may have changed |
| **TS2352** | Bad type assertion | Use `unknown` intermediate: `x as unknown as T` |

### Triage Strategy

1. **Fix import errors first** (TS2307, TS2305) — cascading errors disappear
2. **Fix interface/type errors** (TS2339, TS2322) — often reveals the real issue
3. **Fix argument mismatches** (TS2345, TS2554) — usually API changes
4. **Fix assertion warnings** (TS2352) — lowest priority, often just strictness

## Working with tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "paths": {
      "@scope/pkg": ["./node_modules/@scope/pkg/dist"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

Key flags:
- `noEmit` — verify without generating output files
- `allowImportingTsExtensions` — allow `.ts` in import paths (jiti, Deno, Bun)
- `skipLibCheck` — skip checking `.d.ts` files (faster, avoids third-party type bugs)
- `paths` — resolve bare specifiers to specific locations (e.g., symlinked packages)

## ESLint Integration

```bash
# Run eslint on project
eslint .

# Fix auto-fixable issues
eslint --fix .

# Check specific files
eslint src/foo.ts src/bar.ts

# Show only errors (skip warnings)
eslint --quiet .
```

When both `tsc` and `eslint` are available, run `tsc` first — type errors often cause cascading lint failures.

## Pi Extension Projects

Pi extensions load TypeScript directly via jiti — no build step. Type checking uses a `tsconfig.json` with path mappings to pi's installed packages.

If `tsc` reports `Cannot find module '@earendil-works/pi-*'`:
1. Check that `node_modules/` symlinks exist pointing to pi's packages
2. Verify `tsconfig.json` has correct `paths` entries
3. See project's AGENTS.md for symlink recreation commands

Common pi-specific type issues:
- `matchesKey()` expects `KeyId` type — cast string literals: `matchesKey(data, key as any)`
- `Theme` may be exported from `pi-coding-agent` not `pi-tui` depending on version
- Tool `execute` return types need `details` field (not optional)
