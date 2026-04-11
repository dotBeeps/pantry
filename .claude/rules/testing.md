# Testing Philosophy

Global testing rules that apply across all projects.

## Core Rules

- **Never mock the database.** Use real DB via testcontainers or SQLite in-memory. Mock/prod divergence masks real failures.
- **TDD: red-green-refactor.** Write a failing test first, make it pass, then clean up.
- **Bug fix workflow:** Write a failing unit test that reproduces the bug _before_ touching any code. That test becomes the regression guard.
- **Test behavior, not implementation.** Test public API and contracts, not internal details. Don't reach into private state.

## Conventions

- **Go**: `*_test.go`, table-driven tests with `t.Run` subtest names, stdlib `testing` package preferred
- **TypeScript**: `*.test.ts`, use the project's configured test runner (Vitest or Jest)
- **Java**: JUnit 5, `@DataJpaTest` for repo tests, Testcontainers for integration
- **Kotlin**: same as Java rules
- **Python**: `pytest` with `test_*.py` files, fixtures in `conftest.py`, never mock the DB

## Scope

- Unit tests: pure functions, business logic, edge cases
- Integration tests: DB access, external API calls — use real infrastructure
- Don't write tests for framework glue code or auto-generated code

## ML / Fine-Tuning

- **Never scale training without a smoke test.** A 1-micro-batch forward+backward that asserts finite loss is the minimum viable gate before committing to a full run.
- **Validate data before training.** First 5 rows + token length distribution + label balance before every new run.
- **Seed validation:** cross-check trigger words in seeds against existing persona/config for conflicts before upsampling.
