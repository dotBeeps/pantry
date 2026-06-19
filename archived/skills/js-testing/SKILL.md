---
name: js-testing
description: "JavaScript/TypeScript testing with Jest, Vitest, and Node test runner. Covers test structure, mocking, assertions, fixtures, snapshots, coverage, and debugging failing tests. Use when writing tests, debugging test failures, setting up test frameworks, or working with jest/vitest/node:test."
license: MIT
---

# JavaScript/TypeScript Testing

Run tests with Jest, Vitest, or Node's built-in runner. This skill covers **test patterns, mocking, and debugging** — see the `typescript` skill for code conventions.

## Quick Reference

```bash
# Jest
npx jest                        # run all tests
npx jest --watch                # watch mode
npx jest path/to/file.test.ts   # single file
npx jest -t "test name"         # by name pattern
npx jest --bail                 # stop on first failure
npx jest --verbose              # show each test name
npx jest --coverage             # run with coverage
npx jest --updateSnapshot       # update snapshots (-u)

# Vitest
npx vitest                      # run + watch (dev mode)
npx vitest run                  # run once (CI mode)
npx vitest run path/to/file     # single file
npx vitest -t "test name"       # by name pattern
npx vitest --reporter=verbose   # show each test
npx vitest --coverage           # run with coverage
npx vitest --update             # update snapshots (-u)

# Node built-in (Node 18+)
node --test                     # run all test files
node --test path/to/file.js     # single file
node --test --test-name-pattern "name"
node --test-reporter spec        # human-readable output
```

## File Naming Conventions

```
src/
  foo.ts
  foo.test.ts        ← co-located unit test (preferred)
  foo.spec.ts        ← also discovered (spec = same as test)
__tests__/
  foo.test.ts        ← alternative: gathered in __tests__ dir
tests/
  integration/       ← integration tests (often separate config)
  e2e/               ← end-to-end tests (playwright, cypress, etc.)
```

Jest/Vitest discover: `**/*.test.{ts,js}`, `**/*.spec.{ts,js}`, `**/__tests__/**/*.{ts,js}`

## Test Structure

```typescript
import { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest"; // or jest

describe("UserService", () => {
  let service: UserService;

  beforeAll(() => {
    // runs once before all tests in this describe
  });

  afterAll(() => {
    // runs once after all tests in this describe
  });

  beforeEach(() => {
    // runs before each test — reset state here
    service = new UserService();
  });

  afterEach(() => {
    // runs after each test — cleanup here
    jest.clearAllMocks(); // or vi.clearAllMocks()
  });

  it("creates a user", () => {
    const user = service.create({ name: "Dot" });
    expect(user.name).toBe("Dot");
  });

  test("throws on duplicate email", () => {
    // test() and it() are identical
    expect(() => service.create({ email: "used@example.com" })).toThrow("duplicate");
  });
});
```

## Assertions

```typescript
// Equality
expect(x).toBe(42);                    // Object.is (strict, use for primitives)
expect(obj).toEqual({ a: 1 });         // deep equality
expect(obj).toMatchObject({ a: 1 });   // partial match (extra keys allowed)
expect(arr).toContain("item");
expect(arr).toContainEqual({ id: 1 }); // deep equality in array

// Truthiness
expect(x).toBeTruthy();
expect(x).toBeFalsy();
expect(x).toBeNull();
expect(x).toBeUndefined();
expect(x).toBeDefined();

// Numbers
expect(n).toBeGreaterThan(0);
expect(n).toBeCloseTo(0.3, 5);         // floating point tolerance

// Strings
expect(s).toMatch(/regex/);
expect(s).toContain("substring");

// Errors
expect(() => fn()).toThrow();
expect(() => fn()).toThrow("message");
expect(() => fn()).toThrow(TypeError);

// Negation
expect(x).not.toBe(0);
```

## Mocking

### Functions

```typescript
// Jest
const fn = jest.fn();
const fn = jest.fn().mockReturnValue(42);
const fn = jest.fn().mockResolvedValue({ id: 1 });  // async
const fn = jest.fn().mockRejectedValue(new Error()); // async reject
const fn = jest.fn().mockImplementation((x) => x * 2);

// Vitest (identical API)
const fn = vi.fn();
const fn = vi.fn().mockReturnValue(42);
const fn = vi.fn().mockResolvedValue({ id: 1 });
```

### Spying on Existing Methods

```typescript
// Spy — wraps real implementation, records calls
const spy = jest.spyOn(obj, "method");
const spy = vi.spyOn(obj, "method");

// Override implementation
spy.mockReturnValue(42);
spy.mockImplementation(() => "fake");

// Restore original after test
spy.mockRestore(); // or use afterEach(() => jest.restoreAllMocks())
```

### Module Mocking

```typescript
// Jest — hoisted, entire module replaced
jest.mock("./db", () => ({
  query: jest.fn().mockResolvedValue([]),
}));

// Vitest — also hoisted (uses babel/vite transform)
vi.mock("./db", () => ({
  query: vi.fn().mockResolvedValue([]),
}));

// Vitest: mock with factory that needs imports
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, query: vi.fn() };
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();   // clears calls/instances/results
  jest.resetAllMocks();   // + resets implementations
  jest.restoreAllMocks(); // + restores spies to originals
});
```

### Mock Assertions

```typescript
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith("arg1", expect.any(Number));
expect(fn).toHaveBeenLastCalledWith("last arg");
expect(fn).toHaveBeenNthCalledWith(1, "first call arg");

// Access call history directly
fn.mock.calls;            // [[...args], [...args]]
fn.mock.results;          // [{ type: "return", value: ... }]
fn.mock.instances;        // [this, this]
```

## Async Testing

```typescript
// Preferred: async/await
it("fetches user", async () => {
  const user = await fetchUser(1);
  expect(user.id).toBe(1);
});

// Promise resolves/rejects matchers
it("resolves to user", () => {
  return expect(fetchUser(1)).resolves.toMatchObject({ id: 1 });
});

it("rejects on missing", () => {
  return expect(fetchUser(999)).rejects.toThrow("Not found");
});

// Fake timers (for setTimeout, setInterval, Date)
beforeEach(() => { jest.useFakeTimers(); });  // or vi.useFakeTimers()
afterEach(() => { jest.useRealTimers(); });

it("calls after delay", () => {
  const fn = jest.fn();
  setTimeout(fn, 1000);
  jest.advanceTimersByTime(1000);
  expect(fn).toHaveBeenCalled();
});
```

## Snapshot Testing

```typescript
// File snapshot — stored in __snapshots__/
it("renders correctly", () => {
  const output = renderComponent(<Button label="Click" />);
  expect(output).toMatchSnapshot();
});

// Inline snapshot — stored in the test file itself
it("formats user", () => {
  expect(formatUser({ name: "Dot", role: "admin" })).toMatchInlineSnapshot(`
    "Dot (admin)"
  `);
});
```

Update stale snapshots:
```bash
npx jest --updateSnapshot   # or -u
npx vitest --update         # or -u
```

Snapshots drift silently — review diffs carefully before accepting updates. Delete the snapshot file to regenerate from scratch.

## Coverage

```bash
# Run with coverage
npx jest --coverage
npx vitest --coverage       # requires @vitest/coverage-v8 or coverage-istanbul

# Open HTML report
open coverage/lcov-report/index.html
```

Coverage output columns:
| Column | Meaning |
|--------|---------|
| **Stmts** | Statements executed |
| **Branch** | If/else branches taken |
| **Funcs** | Functions called |
| **Lines** | Lines hit |
| **Uncovered** | Line numbers missed |

Branch coverage is the most meaningful signal — 100% line coverage can hide untested code paths.

Configure thresholds in `jest.config.ts`:
```typescript
coverageThreshold: {
  global: { lines: 80, branches: 70 }
}
```

## When to Write What Kind of Test

| Layer | Scope | Tools | Run Time |
|-------|-------|-------|----------|
| **Unit** | Single function/class | Jest/Vitest + mocks | < 1ms |
| **Integration** | Module + real deps (DB, FS) | Jest/Vitest + testcontainers | ~100ms |
| **E2E** | Full stack in browser | Playwright, Cypress | ~1–10s |

Guidelines:
- **Unit**: pure functions, business logic, edge cases
- **Integration**: DB queries, HTTP handlers, file I/O — mock the network, use real DB
- **E2E**: critical user journeys only — slow and brittle, keep minimal

## Debugging Failing Tests

```bash
# Show full test names and individual results
npx jest --verbose

# Stop after first failure
npx jest --bail
npx jest --bail=3            # stop after 3 failures

# Run only tests matching a name pattern
npx jest -t "UserService"
npx vitest -t "UserService"

# Run only one file
npx jest path/to/foo.test.ts

# Disable test caching (Jest caches transforms)
npx jest --no-cache

# Node debugger — add debugger statement, run with inspect
node --inspect-brk node_modules/.bin/jest --runInBand

# Disable parallel execution (easier to debug)
npx jest --runInBand         # serial
npx vitest --pool=forks --poolOptions.forks.singleFork=true
```

### In-file Scoping

```typescript
// Focus: only this test/describe runs (remove before committing!)
it.only("this one", () => { ... });
describe.only("this group", () => { ... });

// Skip: this test/describe is skipped
it.skip("broken test", () => { ... });
describe.skip("wip group", () => { ... });

// Todo: marks test as planned but not implemented
it.todo("handle empty input");
```

### Common Failures and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Cannot find module` | Missing import or bad path | Check path, install dep, check tsconfig paths |
| Mock not working | Module cached before mock applied | Move `jest.mock()` to top of file (auto-hoisted) |
| Test leaks state | Shared mutable object | Reset in `beforeEach`, don't share across tests |
| Async test passes erroneously | Missing `await` or `return` | Always `await` or `return` promises |
| `open handle` warning | Unclosed server/connection | Call `.close()` in `afterAll` |
| Snapshot mismatch | Component changed | Review diff, run `--updateSnapshot` if intentional |
| Flaky timing test | Real `setTimeout` in test | Use fake timers (`jest.useFakeTimers()`) |
