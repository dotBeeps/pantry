# Hoard Repository: Complete Skills & Extensions Audit

**Date:** 2026-04-05  
**Scope:** Comprehensive inventory of all skills in hoard monorepo + user's global skill installations

---

## Executive Summary

**Total Skills Inventory:**
- **Hoard-specific skills (morsels/):** 17
- **Global pi skills (.pi/agent/skills/):** 19 language/framework conventions
- **User skills (.agents/skills/):** 1 (context7-mcp for library docs)
- **Total:** 37 distinct skills

**Total Extensions:** 7 (berrygems/extensions/)

**Coverage Assessment:**
- ✅ **Strong:** Git workflow, GitHub operations, TypeScript/Python/Go/Rust conventions, testing, extension design
- ⚠️ **Medium:** Documentation, research/summarization, task tracking, permission control
- ❌ **Gaps:** Testing frameworks, Docker, CI/CD pipelines, performance profiling, debugging, refactoring guidance, package management, database/ORM patterns, security scanning, monitoring, containerization, frontend build tools, API design

---

## Part 1: Hoard-Specific Skills (morsels/skills/)

Located in `/home/dot/Development/hoard/morsels/skills/`

### 1. **agent-init** — Project Agent Instructions
- **Description:** Investigate a directory, interview the user, and create/update `AGENTS.md` file
- **Type:** Tool/Task
- **Scope:** AI agent initialization, AGENTS.md generation, project scanning
- **Key Features:**
  - Scans project structure (language, stack, config files)
  - Detects existing agent instruction files (AGENTS.md, CLAUDE.md, .cursorrules, etc.)
  - Interviews user about project specifics
  - Generates high-quality AGENTS.md for multi-agent support
- **Trigger:** When initializing a project for AI agents, creating AGENTS.md

### 2. **commit** — Conventional Commits
- **Description:** Create git commits following Conventional Commits format
- **Type:** Tool/Task
- **Scope:** Git commit message standards
- **Key Features:**
  - Enforces format: `<type>(<scope>): <summary>`
  - Types: feat, fix, docs, refactor, chore, test, perf, style, ci
  - Handles staging, message formatting, scope detection
  - Supports amending and fixup commits
  - Interactive commit creation
- **Trigger:** When committing changes, amending commits, or creating fixup commits

### 3. **defuddle** — Web Content Extraction
- **Description:** Extract clean markdown from web pages using Defuddle CLI
- **Type:** Tool/Task
- **Scope:** Web scraping, token optimization
- **Key Features:**
  - Removes navigation, ads, and clutter
  - Outputs clean markdown (`--md` flag)
  - Saves to file or stdout
  - Extracts metadata (title, description, domain)
  - Lower token usage vs raw HTML
- **Trigger:** When analyzing web pages, blog posts, documentation, articles

### 4. **extension-designer** — Pi Extension Development
- **Description:** Design, scaffold, and implement pi extensions with tools, TUI components, overlays, commands, event hooks
- **Type:** Convention Guide + Tool
- **Scope:** Pi extension architecture and patterns
- **Key Features:**
  - Architecture decision tree (tools, commands, events, state)
  - Extension structure templates (single file vs directory)
  - Custom tools via `pi.registerTool()`
  - Event hooks (before_agent_start, tool_call, etc.)
  - State management (reconstruction from session)
  - TUI component integration
  - Examples from hoard extensions
- **Trigger:** When creating new pi extensions, adding custom tools, building interactive TUI

### 5. **git** — Git Conventions & Workflows
- **Description:** Git branching, rebase vs merge, history surgery, conflict resolution
- **Type:** Convention Guide
- **Scope:** Solo and small-team git workflow
- **Key Features:**
  - GitHub Flow (short-lived feature branches off main)
  - Branch naming: `<type>/<description>`
  - Rebase locally, squash-merge to main
  - Interactive rebase + autosquash workflow
  - Cherry-pick patterns
  - Bisect for debugging
  - Stash management
  - Conflict resolution strategies
- **Trigger:** When working with branches, rebasing, cherry-picking, resolving conflicts

### 6. **git-auth** — SSH Key Management
- **Description:** SSH key management, rbw/Bitwarden automation, auth troubleshooting
- **Type:** Tool/Task
- **Scope:** Git authentication and SSH setup
- **Key Features:**
  - SSH key loading and management
  - ssh-agent troubleshooting
  - rbw (Bitwarden CLI) integration for passphrases
  - GitHub SSH testing
  - Permission error diagnosis
  - Key passphrase automation
- **Trigger:** When hitting SSH permission errors, managing keys, needing git auth

### 7. **github** — GitHub CLI Workflows
- **Description:** GitHub operations via `gh` CLI: PRs, issues, CI runs, releases, reviews, API queries
- **Type:** Tool/Task
- **Scope:** GitHub interactions
- **Key Features:**
  - PR creation (`--fill`, `--draft`, reviewers, labels)
  - Code review (approve, request changes, comment)
  - Issue management (create, list, close)
  - CI/CD (run checks, view status, cancel)
  - Releases (create, draft, pre-release)
  - GraphQL API queries
  - Gist operations
- **Trigger:** When creating PRs, reviewing code, managing issues, checking CI status

### 8. **github-markdown** — GitHub Flavored Markdown
- **Description:** GFM conventions: task lists, callout alerts, collapsible sections, mermaid, tables, cross-references
- **Type:** Convention Guide
- **Scope:** Markdown rendering on GitHub
- **Key Features:**
  - Task lists with checkboxes and nesting
  - Alert callouts (NOTE, TIP, IMPORTANT, WARNING, CAUTION)
  - Collapsible `<details>` sections
  - Mermaid diagram embedding
  - Table formatting
  - Footnotes
  - GFM link shorthand
  - Image sizing
- **Trigger:** When writing markdown for GitHub READMEs, issues, PRs

### 9. **github-writing** — GitHub Document Authoring
- **Description:** Write effective GitHub documents: PRs, issues, READMEs, CONTRIBUTING, release notes, community templates
- **Type:** Tool/Task
- **Scope:** GitHub document composition
- **Key Features:**
  - Writing style system (formal, friendly, personality, narrative, minimal)
  - Tone settings in `~/.pi/agent/settings.json`
  - PR description framework (what, why, testing, breaking changes)
  - Issue templates (bug, feature, question formats)
  - README structure (problem, solution, quick start, advanced)
  - CONTRIBUTING guide templates
  - Release notes and changelog patterns
  - Approval workflow (draft before commit)
  - Per-document style overrides
- **Trigger:** When drafting PRs, issues, READMEs, release notes, community docs

### 10. **go-check** — Go Verification
- **Description:** Run `go vet`, `golangci-lint`, `go test`; interpret output and fix errors
- **Type:** Tool/Task + Convention Guide
- **Scope:** Go code quality and testing
- **Key Features:**
  - `go vet` output interpretation (printf format, unreachable code, lock copying)
  - `golangci-lint` error parsing (maligned structs, unused vars, shadow vars)
  - `go test` with race detection
  - Test failure diagnosis
  - Common Go linting issues and fixes
- **Trigger:** When checking Go code, running linters, debugging test failures

### 11. **hoard-gallery** — Panel Development API
- **Description:** Build floating overlay panels using the hoard-gallery infrastructure
- **Type:** Tool/Task + Reference
- **Scope:** Panel extension authoring
- **Key Features:**
  - Panel lifecycle management (create, position, focus, close)
  - API access via `globalThis[Symbol.for("hoard.gallery")]`
  - Properties: tui, theme, cwd, size
  - Methods: createPanel(), suggestLayout(), getGeometry(), close(), list()
  - Focus cycling and keyboard routing
  - Panel geometry tracking (anchor, width, height)
  - Backward compatibility with lower-level registration
  - Examples from hoard extensions
- **Trigger:** When creating new panel extensions, integrating panels with other extensions

### 12. **kobold-housekeeping** — Task Tracking with Todos
- **Description:** Track tasks with tagged todos and floating panels
- **Type:** Tool/Task
- **Scope:** Task management and persistence
- **Key Features:**
  - Two-tool system: built-in `todo` (CRUD) + `todo_panel` (display)
  - Tag-based grouping
  - Persistent panels that auto-refresh on todo changes
  - Panel positioning suggestions
  - Command interface (`/todos`)
  - Panel management (open, close, focus, list)
- **Trigger:** When managing work items, tracking progress, showing task lists

### 13. **pi-events** — Event Hooks Reference
- **Description:** Intercept and transform pi events: tool calls, input, system prompt, model changes, streaming
- **Type:** Reference + Convention Guide
- **Scope:** Pi extension event lifecycle
- **Key Features:**
  - Decision tree for event selection
  - Tool call interception and blocking
  - Tool result modification
  - Input transformation
  - System prompt injection
  - Compaction and session hooks
  - Model change reactions
  - Full event reference with return types
  - Code examples for each event type
- **Trigger:** When hooking into agent lifecycle, blocking/modifying tool calls, injecting context

### 14. **pi-sessions** — Session State Management
- **Description:** Manage session state, branching, compaction, persistence in pi extensions
- **Type:** Convention Guide + Reference
- **Scope:** Pi session architecture and state patterns
- **Key Features:**
  - Session tree model (JSONL with parent references)
  - State reconstruction pattern from branch
  - Tool result details for persistence
  - Branching awareness (prevent external file state divergence)
  - Compaction internals
  - Session event handling
  - Stateful extension examples
- **Trigger:** When building stateful extensions, handling branching, persisting state

### 15. **pi-tui** — TUI Component Building
- **Description:** Build custom TUI components for pi extensions: overlays, widgets, footers, custom editors
- **Type:** Convention Guide + Reference
- **Scope:** Terminal UI component architecture
- **Key Features:**
  - Component contract (render, handleInput, invalidate)
  - Built-in components: Text, Box, Container, Spacer, Markdown, Image, SelectList, SettingsList, Input, Editor
  - Overlay and fullscreen layouts
  - Theming and color system
  - Animation patterns
  - Keyboard input routing
  - Focus management
  - Width constraints and ANSI-safe truncation
  - Copy-paste patterns from references
- **Trigger:** When creating interactive terminal UI, building overlay panels, custom tool rendering

### 16. **skill-designer** — Agent Skill Creation
- **Description:** Design and create Agent Skills (agentskills.io spec)
- **Type:** Convention Guide + Tool
- **Scope:** Skill authoring standards
- **Key Features:**
  - Skill archetypes (Convention Guide, Tool/Task, Research)
  - Naming rules and validation
  - Description writing for discoverability
  - SKILL.md structure and templates
  - Frontmatter (name, description, optional fields)
  - Progressive disclosure patterns
  - Quality checklist
  - Body structure by archetype
  - References folder for long content
- **Trigger:** When creating new skills, reviewing existing skills, scaffolding skill directories

### 17. **typescript-check** — TypeScript Verification
- **Description:** Run `tsc` and `eslint`; interpret errors and fix patterns
- **Type:** Tool/Task + Convention Guide
- **Scope:** TypeScript code quality
- **Key Features:**
  - `tsc` error code reference (TS2307, TS2339, TS2345, etc.)
  - Error parsing and triage
  - Common TS errors and fixes
  - Project-wide type checking
  - Single-file filtering
  - ESLint integration (though TSConfig is primary)
  - Count and group errors
- **Trigger:** When checking TypeScript, running type checkers, debugging TS compilation

---

## Part 2: Hoard Extensions (berrygems/extensions/)

Located in `/home/dot/Development/hoard/berrygems/extensions/`

### 1. **dragon-inquiry** (`dragon-inquiry.ts`) — Interactive User Input
- **Purpose:** Agent-callable tool for interactive user input
- **Modes:**
  - `select` — Pick from options (with optional free-text fallback)
  - `confirm` — Yes/No question
  - `text` — Free-text input
- **Features:**
  - Branded TUI with panel-chrome styling
  - Option descriptions and hints
  - Custom answer entry in select mode
  - Themed borders and rendering
  - Non-blocking modal overlay
- **Key Exports:** Extension registration via `pi.registerTool()`
- **Dependencies:** pi-tui (Editor, Text, Key), pi-ai (StringEnum), panel-chrome shared lib

### 2. **hoard-gallery** (`hoard-gallery.ts`) — Central Panel Authority
- **Purpose:** Owns ALL panel lifecycle, positioning, focus cycling, smart placement
- **Key Capabilities:**
  - `createPanel()` API for consumer extensions
  - Geometry tracking and smart positioning
  - Focus cycling (Alt+T or configurable key)
  - Collision avoidance and layout suggestions
  - Session-aware panel persistence
  - Keyboard routing (shared keys: Esc, Q, focus)
- **Features:**
  - Panel skins (19+ themes)
  - Configurable hotkeys from settings
  - Per-panel skin overrides
  - PanelContext passed to component factories
  - Published to globalThis via Symbol.for("hoard.gallery")
- **Integration:** Core infrastructure; required by other panel-based extensions (dragon-scroll, kobold-housekeeping, dragon-digestion, dragon-tongue)

### 3. **dragon-digestion** (`dragon-digestion.ts`) — Compaction Tuning Panel
- **Purpose:** Live-tweakable floating panel for compaction (context digestion) settings
- **Key Features:**
  - Display current compaction settings and context usage
  - Toggle auto-compaction on/off
  - Adjust reserveTokens, keepRecentTokens
  - Three trigger modes: Reserve (raw tokens), Percentage (% of context), Fixed (threshold)
  - Strategy presets for manual compaction (Default, Code, Task, Minimal)
  - Context usage bar with threshold marker
  - Last compaction stats (timestamp, token savings, % freed)
  - `/digestion` command to open/close
  - Alt+C shortcut
  - Press `g` to copy from global config
  - Persists to project `.pi/settings.json`
  - Session hook safety net (`session_before_compact`)
- **Panel Integration:** Uses hoard-gallery

### 4. **dragon-scroll** (`dragon-scroll.ts`) — Markdown Popup Panels
- **Purpose:** Tool + command for showing scrollable markdown content in floating panels
- **Key Features:**
  - Registers `popup` tool (agent-callable) and `/popup` command (user-callable)
  - Markdown rendering with code highlighting
  - Scrolling within fixed width
  - Panel positioning (anchor: top-left, center, bottom-right, etc.)
  - Custom width (percentages or columns)
  - Animated GIF mascots (Giphy integration with vibe queries)
  - Panel updates by ID (create or update existing)
  - Close by ID or closeAll()
  - Image embedding support (Kitty virtual placements)
- **Panel Integration:** Uses hoard-gallery

### 5. **kobold-housekeeping** (`kobold-housekeeping.ts`) — Todo Panels
- **Purpose:** Persistent floating panels for `.pi/todos` file system
- **Key Features:**
  - Registers `todo_panel` tool (agent-callable) and `/todos` command (user-callable)
  - Tag-based grouping (open tag-specific panels)
  - Auto-refresh on todo changes (watches `.pi/todos`)
  - Focus cycling (Alt+T)
  - Layout suggestions via `suggest_layout()`
  - Animated GIF mascots (vibe-driven)
  - Panel state management (open, close, focus, list)
  - Backed by pi's built-in todo system (not session state)
- **Panel Integration:** Uses hoard-gallery

### 6. **dragon-tongue** (`dragon-tongue.ts`) — Lint Panel
- **Purpose:** Live diagnostics via LSP + floating panel (language-agnostic)
- **Key Features:**
  - Auto-detects project languages (TypeScript, Go, etc.)
  - Starts appropriate LSP servers (typescript-language-server, gopls)
  - Merges diagnostics into unified panel
  - Fallback to compiler commands (tsc, go vet) when LSP unavailable
  - File grouping and expandable errors
  - Severity levels (error, warning, info, hint)
  - Code jumping (click line to navigate)
  - `/lint` command and `lint` tool
  - File watching for real-time updates
  - Extensible LanguageServerConfig + FallbackConfig
- **Panel Integration:** Uses hoard-gallery
- **Dependencies:** LSP client implementation (lsp-client.ts shared lib)

### 7. **dragon-guard** (`dragon-guard/` directory) — Three-Tier Permission Control
- **Purpose:** Permission gating for tool execution
- **Modes:**
  - **Dog Mode** (default): All tools prompt for permission
  - **Puppy Mode**: Read-only tools auto-allowed, restricted tools prompt
  - **Dragon Mode**: All tools allowed (full implementation)
- **Key Features:**
  - `autoDetect` setting for complexity-based mode switching
  - `dogAllowedTools` and `dogBlockedTools` lists
  - Tool call summaries via LLM for informed decisions
  - Persistent state (per-session, reconstructed from branch)
  - Guard panel UI (shows mode, allowed/blocked tools, mode toggle)
  - Settings in `~/.pi/agent/settings.json` under `hoard.guard.*`
  - Command interface (`/guard` to open panel)
- **Structure:**
  - `index.ts` — Main extension entry
  - `panel.ts` — Guard panel UI
  - `settings.ts` — Configuration management
  - `state.ts` — Mode and permission state
  - `bash-patterns.ts` — Pattern matching for bash safety
- **Integration:** Hooks tool_call event to intercept and gate execution

---

## Part 3: Global Pi Skills (.pi/agent/skills/)

Located in `/home/dot/.pi/agent/skills/` — 19 language/framework conventions

### Language Conventions (7 total)

1. **typescript** — ESM, strict mode, patterns, types, satisfies
2. **python** — uv tooling, typing, f-strings, comprehensions
3. **go** — Idioms, context as first param, error wrapping, generics
4. **rust** — Ownership, lifetimes, error handling, clippy compliance
5. **java** — Style, records, sealed classes, patterns, testing
6. **kotlin** — Idioms, data classes, sealed types, scope functions
7. **gdscript** — Godot 4.x, typing, signals, scene structure

### Frontend Frameworks (4 total)

8. **react** — Function components, hooks, state management, memoization
9. **astro** — Islands architecture, content collections, routing, client directives
10. **qtqml** — Qt QML type system, modules, C++ interop
11. **qtquick** — Qt Quick visual components, QML UI

### Full-Stack & Mobile (2 total)

12. **spring-boot** — Dependency injection, REST, JPA, testing
13. **atproto** — AT Protocol / Bluesky, client auth, lexicons

### Game & Desktop (3 total)

14. **minecraft-modding** — Cross-loader (Fabric/NeoForge), Kotlin, mixins, registration
15. **minecraft-fabric** — Fabric-specific conventions, Yarn mappings
16. **neoforge** — NeoForge-specific, KFF, MojMap/Parchment
17. **quickshell** — QuickShell QML for Wayland desktop shells
18. **qt** — Qt/C++/QML conventions, clang-tidy

### TUI & Systems (1 total)

19. **go-tui** — Charmbracelet ecosystem (Bubble Tea, Bubbles, Lip Gloss, Huh)

---

## Part 4: User Skills (.agents/skills/)

Located in `/home/dot/.agents/skills/` — 1 skill

### 1. **context7-mcp** — Library Documentation Fetcher
- **Purpose:** Fetch current library docs instead of relying on training data
- **Scope:** Framework/library setup, code generation, API references
- **Triggers:** React, Vue, Next.js, Prisma, Supabase, Tailwind, Express, etc.
- **Workflow:**
  1. `resolve-library-id` with library name + user question
  2. Select best match by benchmark score
  3. `query-docs` with selected library ID
  4. Incorporate fetched docs into response
- **Use:** For setup questions, code examples, API references

---

## Part 5: Coverage Analysis

### ✅ WELL-COVERED AREAS

#### Git & GitHub (5/5 skills)
- ✅ Branching, rebase, cherry-pick, bisect, conflict resolution (git)
- ✅ SSH key management and auth (git-auth)
- ✅ PR creation, reviews, issues, CI/CD, releases (github)
- ✅ GFM conventions (task lists, alerts, collapsible, mermaid, tables) (github-markdown)
- ✅ Document authoring (PR, README, CONTRIBUTING, release notes) (github-writing)
- ✅ Commit message formatting (commit)

#### TypeScript & JavaScript Development (Strong)
- ✅ Conventions (typescript skill)
- ✅ Type checking and error interpretation (typescript-check)
- ✅ React patterns (react skill)
- ✅ Astro conventions (astro skill)

#### Code Quality Tooling (Moderate-to-Strong)
- ✅ Go verification (go-check)
- ✅ Lint panels (dragon-tongue extension) — live LSP + fallback
- ✅ Type checking (typescript-check)
- ✅ Linting conventions (language skills reference clippy, golangci-lint, etc.)

#### Backend & Systems (Strong)
- ✅ Go conventions and verification
- ✅ Java and Spring Boot patterns
- ✅ Kotlin idioms
- ✅ Rust conventions

#### Pi Extension Development (Very Strong)
- ✅ Extension architecture (extension-designer skill)
- ✅ TUI components (pi-tui skill)
- ✅ Event hooks and lifecycle (pi-events skill)
- ✅ Session state management (pi-sessions skill)
- ✅ Panel development (hoard-gallery skill + hoard-gallery extension)
- ✅ Skill design (skill-designer skill)
- ✅ Project setup (agent-init skill)

#### Interactive Tools & Overlays (Strong)
- ✅ User input prompts (dragon-inquiry extension)
- ✅ Markdown panels with GIFs (dragon-scroll extension)
- ✅ Todo panels with tagging (kobold-housekeeping extension)
- ✅ Compaction tuning UI (dragon-digestion extension)
- ✅ Permission control panel (dragon-guard extension)
- ✅ Lint diagnostics panel (dragon-tongue extension)

#### Game Modding (Strong)
- ✅ Minecraft Fabric conventions
- ✅ Minecraft NeoForge conventions
- ✅ Cross-loader conventions
- ✅ Godot GDScript

#### Research & Documentation
- ✅ Web content extraction (defuddle skill)
- ✅ Library documentation fetching (context7-mcp user skill)

---

### ⚠️ MEDIUM COVERAGE AREAS

#### User Interaction & Prompting
- ✅ Interactive input (dragon-inquiry)
- ✅ Task tracking (kobold-housekeeping)
- ⚠️ Missing: Structured conversation flows, multi-step interviews, context caching, prompt engineering

#### Code Organization & Architecture
- ⚠️ Basic extension patterns covered
- ⚠️ Missing: Microservices patterns, domain-driven design, API design, SOLID principles, design patterns reference

#### Testing
- ⚠️ Referenced in conventions (languages mention their test frameworks)
- ⚠️ Missing: Testing strategy guide, TDD workflow, test patterns, mocking strategies, integration testing, CI pipeline integration

---

### ❌ GAPS — Missing Skills for Power Users

#### Developer Tools & Environments

1. **Docker & Containerization**
   - Dockerfile best practices
   - Docker Compose multi-service setup
   - Container optimization (layer caching, multi-stage builds)
   - Image registry operations
   - Docker networking and volumes
   - Podman as Docker alternative

2. **CI/CD Pipelines**
   - GitHub Actions workflow construction
   - GitLab CI / Gitea Actions patterns
   - Build matrix strategies
   - Artifact caching and management
   - Secret management
   - Deployment automation
   - Environment-specific configuration

3. **Package Management & Build Tools**
   - npm/yarn/pnpm workspace management
   - npm publishing and semver
   - Cargo package publishing
   - Maven/Gradle build tuning
   - Go module management (go.mod, go.sum)
   - Python poetry vs uv comparison

#### Testing & Quality Assurance

4. **Testing Strategies & Patterns**
   - Unit vs integration vs end-to-end distinctions
   - Test-driven development (TDD) workflow
   - Mocking and stubbing patterns
   - Property-based testing
   - Contract testing
   - Load testing and benchmarking

5. **Performance Profiling & Optimization**
   - CPU/memory profiling
   - Flame graphs (Go, Rust, Python)
   - Database query optimization
   - Network latency analysis
   - Cache strategy design
   - Bottleneck identification

6. **Security Scanning & Hardening**
   - OWASP Top 10
   - Dependency vulnerability scanning (supply chain)
   - Secret detection
   - Code-level security patterns
   - Auth/encryption best practices
   - Rate limiting and DDoS mitigation

#### Advanced Code Quality

7. **Refactoring Patterns**
   - Extract method / extract class
   - Replace magic numbers with constants
   - Replace conditionals with polymorphism
   - Introduce strategy pattern
   - Large codebase refactoring strategies
   - Backward-compatible API changes

8. **Database & ORM Patterns**
   - SQL best practices (indexing, query patterns)
   - Prisma, Hibernate, SQLAlchemy patterns
   - Database migrations
   - Transaction handling and concurrency
   - Sharding and replication
   - Connection pooling

#### API & Integration

9. **API Design & Documentation**
   - REST principles (HATEOAS, content negotiation)
   - GraphQL schema design
   - OpenAPI/Swagger documentation
   - API versioning strategies
   - Rate limiting and quota management
   - CORS and security headers

10. **Integration Testing & Contracts**
    - API contract testing
    - Webhook testing
    - Message queue integration (Kafka, RabbitMQ)
    - External service mocking vs real testcontainers

#### Development Workflow

11. **Debugging Strategies**
    - Using debuggers (gdb, lldb, delve, pdb)
    - Debug logging strategies
    - Remote debugging
    - Browser dev tools advanced usage
    - Memory leak detection

12. **Research & Learning Skills**
    - Web search best practices
    - Reading academic papers
    - Documentation navigation
    - Stack Overflow effective use
    - Community engagement

#### Frontend & Design

13. **CSS & Styling Advanced**
    - Responsive design patterns
    - CSS Grid and Flexbox mastery
    - CSS-in-JS frameworks
    - Utility-first (Tailwind) patterns
    - Animation and transitions
    - Accessibility (a11y) patterns

14. **Frontend Build Tools**
    - Webpack configuration
    - Vite setup and optimization
    - Rollup for library builds
    - Tree-shaking and dead code elimination
    - Code splitting strategies
    - Asset optimization (images, fonts)

15. **State Management & Data Fetching**
    - Redux patterns (beyond React conventions)
    - Zustand, Pinia, Jotai
    - Server state management (React Query, SWR)
    - Optimistic updates
    - Cache invalidation

#### Documentation & Communication

16. **Technical Writing**
    - API documentation (OpenAPI, AsyncAPI)
    - Architecture Decision Records (ADRs)
    - Runbooks and troubleshooting guides
    - Glossaries and terminology
    - Accessibility in docs (captions, transcripts)

17. **Visualization & Diagrams**
    - Advanced Mermaid patterns (beyond skill coverage)
    - Sequence diagrams for async flows
    - C4 model for architecture
    - UML patterns
    - Data flow diagrams

#### DevOps & Monitoring

18. **Monitoring, Logging, Observability**
    - Structured logging (JSON formats)
    - Log aggregation (ELK, Loki, Datadog)
    - Metrics collection (Prometheus, etc.)
    - Distributed tracing
    - Alert configuration
    - SLOs and error budgets

19. **Infrastructure as Code**
    - Terraform modules
    - CloudFormation / CDK
    - Helm charts for Kubernetes
    - Kubernetes best practices
    - Infrastructure testing (Terratest)

20. **Deployment & Rollback**
    - Blue-green deployments
    - Canary releases
    - Feature flags
    - Rollback strategies
    - Zero-downtime migrations
    - Secrets management (Vault, Sealed Secrets)

#### Language-Specific Gaps

21. **Python-Specific Tools**
    - Django (only Spring Boot covered for backend)
    - FastAPI patterns
    - Async Python (asyncio, trio)
    - Virtual environment management
    - Poetry-specific workflows (only uv mentioned)

22. **JavaScript/Node.js-Specific**
    - Streaming and backpressure
    - Event emitters and pub-sub
    - Worker threads
    - C++ addon development
    - Native modules

23. **Low-Level Languages**
    - C/C++ conventions (only Qt mentioned)
    - Memory safety in C
    - Assembly basics
    - Systems programming patterns

#### Emerging Technologies

24. **LLM & AI Integration**
    - Prompt engineering (beyond what context7-mcp covers)
    - RAG (Retrieval-Augmented Generation) patterns
    - Fine-tuning workflows
    - Model selection criteria
    - Cost optimization for LLM calls

25. **Web3 & Blockchain** (if relevant to user)
    - Smart contract development
    - Solidity patterns
    - Web3.js / ethers.js
    - Wallet integration

---

## Part 6: Recommendations

### Quick Wins (High-Value, Low-Effort)

1. **API Design Skill** — REST/GraphQL conventions, OpenAPI documentation, versioning strategies
2. **Refactoring Patterns Skill** — Common refactoring moves with before/after code
3. **Debugging Skill** — Debugger usage, logging strategies, breakpoint setup for each language
4. **Testing Patterns Skill** — Unit vs integration, mocking, property-based testing

### High-Impact Medium-Effort

5. **CI/CD Skill** — GitHub Actions workflow patterns, matrix builds, artifact caching
6. **Database Patterns Skill** — SQL, ORM patterns (Prisma, SQLAlchemy), migrations, indexing
7. **Docker Skill** — Dockerfile best practices, layer optimization, Compose, registry
8. **Performance Profiling Skill** — CPU/memory profiling, flame graphs, bottleneck identification
9. **Frontend Build Skill** — Vite, Webpack, code splitting, tree-shaking, asset optimization
10. **Observability Skill** — Logging, metrics, traces, alerts, SLOs

### Enhancements to Existing Skills

11. Expand **typescript-check** → add eslint patterns, tsconfig settings
12. Expand **github-writing** → add API documentation patterns
13. Add **security** section to language conventions or new "Security Patterns" skill
14. Create **Go-specific** debugging/profiling guide (beyond go-check)
15. Extend **pi-events** → add tool interception patterns for common blocking scenarios

### Organization & Discoverability

16. Create a **skills index** or **navigator** skill that helps users find relevant skills
17. Add cross-skill references in frontmatter (e.g., typescript-check → testing patterns)
18. Tag skills by complexity level (beginner, intermediate, advanced)

---

## Part 7: Summary Table

| Category | Well-Covered | Medium | Gaps |
|----------|--------------|--------|------|
| **Git & GitHub** | ✅ All 5 skills present | — | — |
| **Languages** | ✅ 7 conventions | — | ❌ C/C++, Clojure, Elixir |
| **Frontend** | ✅ React, Astro, Qt | ⚠️ Vue, Svelte missing | ❌ CSS, build tools, styling |
| **Backend** | ✅ Java, Kotlin, Python, Go, Rust | ⚠️ Node.js, Django, FastAPI | ❌ Microservices, API design |
| **Testing** | ⚠️ Mentioned in conventions | ⚠️ No dedicated guide | ❌ Mocking, TDD, patterns |
| **DevOps** | ✅ Limited (permissions) | ❌ No Docker, K8s | ❌ CI/CD, monitoring, IaC |
| **Tools & Linting** | ✅ Strong (lint panel) | ⚠️ TypeScript, Go | ❌ Python, Rust formatters |
| **Pi Extensions** | ✅ Very strong (7 pieces) | — | — |
| **Performance** | ❌ Not covered | ❌ Not covered | ❌ Profiling, optimization |
| **Security** | ❌ Not covered | ❌ Not covered | ❌ Scanning, hardening |
| **Documentation** | ✅ Partial (markdown) | ⚠️ Writing covered | ❌ API docs, ADRs, diagrams |
| **Databases** | ❌ Not covered | ❌ Not covered | ❌ SQL, ORM, migrations |
| **Debugging** | ❌ Not covered | ❌ Not covered | ❌ Debuggers, logging |
| **Research** | ✅ Partial (defuddle, context7-mcp) | ⚠️ Basic | ❌ Advanced search, papers |

---

## Conclusion

The hoard monorepo provides **excellent coverage** for:
- Pi extension development (the core offering)
- Git workflows and GitHub operations
- Language conventions (7 languages + 12 frameworks)
- Interactive tools and overlays (6 extensions)

**Critical gaps** for a power user:
1. **CI/CD & Deployment** — No GitHub Actions, Docker, or deployment guidance
2. **Testing & Debugging** — No testing patterns or debugger usage guides
3. **Performance & Optimization** — No profiling or bottleneck identification
4. **Database & ORM** — No SQL or ORM patterns
5. **API Design** — No REST/GraphQL documentation guidance
6. **Frontend Tooling** — No Webpack, Vite, CSS, or styling guides
7. **Security** — No vulnerability scanning or hardening patterns
8. **Observability** — No logging, metrics, or monitoring guidance

**Recommendation:** Prioritize API Design, Testing Patterns, CI/CD, and Database Skills for maximum developer satisfaction.
