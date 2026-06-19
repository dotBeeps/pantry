---
name: react
description: "React conventions: function components, hooks, patterns. Use when working with React projects."
license: MIT
---

# React Conventions

## Component Design

- Function components only — no class components
- One component per file; file name matches component name (`UserCard.tsx`)
- Prefer composition over inheritance — build complex UI by composing smaller components
- Keep components focused: if it does more than one thing, split it
- Controlled components over uncontrolled — lift state to the parent when the parent needs it

## Hooks

- Hooks at the top level only — never inside conditions, loops, or nested functions
- Custom hooks for shared logic — name them `use<Thing>` (e.g. `useOnlineStatus`)
- Custom hooks share logic, not state — each call gets its own state instance
- `useCallback` for memoizing function props passed to `memo`-wrapped children
- `useMemo` for expensive computations — not for every derived value
- Don't memoize by default — profile first, optimize where it matters

## State Management

- Keep state as local as possible — lift only when siblings need it
- Derive values from state instead of syncing with `useEffect`
- Use reducer (`useReducer`) when state transitions are complex or interdependent
- Avoid `useEffect` for things that can be computed during render
- "You Might Not Need an Effect" — prefer event handlers and derived state

## Props & Types

- Destructure props in the function signature
- `type` for prop definitions (not `interface` unless merging is needed)
- Use `children: React.ReactNode` for wrapper components
- Discriminated unions for variant components over optional boolean props

## Performance

- `React.memo()` only for components that re-render often with the same props
- Stable callback references via `useCallback` when passing to memoized children
- Use `key` prop correctly in lists — stable, unique IDs, never array index for dynamic lists
- Lazy load routes and heavy components with `React.lazy` + `Suspense`
- Avoid creating objects/arrays inline in JSX — they break shallow comparison

## Patterns

- Named exports for components (not default exports)
- Co-locate related files: component, styles, tests, types in the same directory
- Event handlers named `handle<Event>` (e.g. `handleClick`, `handleSubmit`)
- Callback props named `on<Event>` (e.g. `onClick`, `onSubmit`)
- Render lists with `.map()` — always provide a stable `key`

## Testing

- `*.test.tsx` files alongside source
- Test user-visible behavior, not implementation details
- Prefer `@testing-library/react` — query by role/label, not test IDs
- Never mock React hooks in tests — restructure to inject dependencies instead

## Anti-Patterns

- No `useEffect` for state synchronization — derive it or compute it
- No prop drilling beyond 2 levels — use composition or context
- No `// eslint-disable` for hook dependency warnings — fix the deps
- No `any` in component props — use `unknown` and narrow
- No index keys for dynamic lists
