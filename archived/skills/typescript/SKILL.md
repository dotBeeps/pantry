---
name: typescript
description: "TypeScript conventions: ESM, strict mode, patterns. Use when working with TypeScript or .ts/.tsx files."
license: MIT
---

# TypeScript Conventions

## Module Style

- ESM only — `import`/`export`, never `require`/`module.exports`
- Named exports preferred over default exports
- Barrel files (`index.ts`) only when the module surface is stable

## Types

- `type` for aliases and unions; `interface` only when declaration merging is needed
- Never `any` — use `unknown` and narrow it, or fix the type
- Prefer `readonly` on arrays and object properties that shouldn't mutate
- Use discriminated unions over optional fields where possible

## Style

- Strict mode always (`"strict": true` in tsconfig)
- No non-null assertions (`!`) unless you've verified it can't be null — add a comment if you do
- Prefer `const` assertions (`as const`) for literal types
- `satisfies` operator over `as` for type validation without widening

## Boundary Validation

- `as` on parsed/external input is a lie to the compiler — use a validation function returning `T | null`
- `satisfies` validates shape at compile time; `as` asserts trust at the call site — different tools
- Every function receiving tool params, HTTP bodies, or parsed strings validates before processing
- Pattern: `function parseFoo(raw: string): Foo | null` over `raw.split("-") as [A, B, C]`
- If you're casting a `string.split()` result to a union type, you need a validation function instead

## Function Signatures

- >4 parameters → options object with named fields (forward-compatible, readable at call sites)
- Destructure in the function body: `function foo(opts: FooOptions) { const { a, b, c } = opts; }`
- Boolean parameters are always a smell — use an options object with named flags
- When adding a new parameter to an existing function, if it already has 4+ params, convert to options object first

## Testing

- `*.test.ts` files alongside source
- Use the project's configured runner (Vitest or Jest — don't assume)
- Never mock modules for unit tests if you can restructure to inject instead

## Node/Runtime

- Use `node:` prefix for built-in imports (`node:fs`, `node:path`)
- Top-level `await` is fine in ESM scripts
