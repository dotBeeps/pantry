---
name: astro
description: "Astro conventions: islands architecture, content collections, routing. Use when working with Astro projects."
license: MIT
---

# Astro Conventions

## Architecture

- Islands architecture — ship zero JS by default, hydrate only interactive components
- Server-first rendering; use `client:*` directives only when client-side interactivity is needed
- Prefer `.astro` components for static content; use framework components (React, Vue, Svelte) only for interactive islands
- Static output (`hybrid` or `static`) by default — opt individual routes into SSR with `export const prerender = false`

## Project Structure

- `src/pages/` — file-based routing, one file per route
- `src/layouts/` — shared page shells (HTML boilerplate, head, nav, footer)
- `src/components/` — reusable UI components
- `src/content/` — content collections (Markdown, MDX, JSON, YAML)
- `src/styles/` — global CSS; prefer scoped `<style>` in components
- `public/` — static assets served as-is (no processing)

## Components

- Frontmatter (`---` fences) runs at build/request time on the server — never in the browser
- Use `<slot />` for composition, named slots for multi-region layouts
- Props via `Astro.props` — destructure in frontmatter
- Scoped styles by default; use `is:global` only when necessary
- Avoid deeply nested component hierarchies — Astro components are cheap, keep them flat

## Client Directives

- `client:load` — hydrate immediately on page load (use sparingly)
- `client:idle` — hydrate when browser is idle (good default for non-critical interactivity)
- `client:visible` — hydrate when scrolled into view (below-the-fold content)
- `client:media` — hydrate at specific breakpoints
- `client:only="react"` — skip SSR entirely, client-render only (escape hatch)
- Never add a `client:*` directive to `.astro` components — only framework components

## Content Collections

- Define schemas in `src/content.config.ts` using `defineCollection` and Zod
- Query with `getCollection()` / `getEntry()` — type-safe by default
- Use `render()` to get the `<Content />` component from an entry
- Prefer content collections over raw `import.meta.glob` for structured data

## Data Fetching

- Fetch in frontmatter — it runs server-side, no client bundle impact
- Use `Astro.params` for dynamic route segments
- Use `Astro.cookies` and `Astro.request` in SSR routes
- Redirect with `Astro.redirect()`, not client-side navigation hacks

## Server Islands

- `server:defer` on an Astro component makes it a server island — renders async, outside the main page flow
- Use for personalized or dynamic content on otherwise static pages
- Provide fallback content inside the component tag for loading state

## Middleware

- `src/middleware.ts` — runs before every route
- Use for auth checks, redirects, request decoration
- Call `next()` to continue the chain; return a `Response` to short-circuit

## Style

- Scoped `<style>` is the default — styles only affect the current component
- Global styles go in `src/styles/` and import from layouts
- Use CSS custom properties for theming over JS-based solutions
- Prefer native CSS features over PostCSS/Sass unless the project already uses them

## Testing

- Use Vitest + `@testing-library/dom` for component behavior tests
- `astro check` for type checking `.astro` files
- Playwright or Cypress for E2E route testing
