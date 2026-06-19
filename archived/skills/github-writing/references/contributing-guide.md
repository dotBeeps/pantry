# CONTRIBUTING Guide Writing

Structure and conventions for CONTRIBUTING.md files.

## Purpose

A CONTRIBUTING guide answers: **"I want to help — how do I start?"** It should take a new contributor from zero to their first PR in under 30 minutes.

## Structure

```markdown
# Contributing to [Project Name]

Thanks for your interest in contributing! Here's how to get started.

## Quick Setup

```bash
# Clone the repo
git clone https://github.com/owner/repo.git
cd repo

# Install dependencies
npm install

# Run tests to verify setup
npm test

# Start development server (if applicable)
npm run dev
```

## Development Workflow

1. Create a branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Run linting: `npm run lint`
5. Commit using [Conventional Commits](https://conventionalcommits.org):
   `git commit -m "feat(scope): add new feature"`
6. Push and open a PR: `gh pr create --fill`

## What to Work On

- Check [open issues](../../issues) — anything labeled `good first issue` is a great start
- Check the [roadmap/milestones](../../milestones) for planned work
- Have an idea? Open an issue first to discuss before writing code

## Code Style

<!-- Project-specific style rules, or link to AGENTS.md / linter config -->

## Testing

<!-- How to run tests, what to test, coverage expectations -->

## Pull Request Guidelines

- One logical change per PR
- Include tests for new functionality
- Update documentation if behavior changes
- Link to the relevant issue in the PR description

## Getting Help

- Open a [discussion](../../discussions) for questions
- Tag `@maintainer` in your PR if you're stuck

## Code of Conduct

This project follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
```

## Guidelines

- **Real commands, not placeholders** — `npm install` not `<install command>`. The reader should be able to copy-paste.
- **Verify the setup steps work** — clone a fresh copy and follow your own guide
- **Link to good first issues** — don't just say "check the issues," give a filtered URL
- **Be specific about PR expectations** — "one logical change per PR" is better than "keep PRs small"
- **Include the test command** — contributors need to verify their changes pass before submitting
- **Mention the commit convention** — link to the spec or give examples
- **Keep it under 200 lines** — anything longer should be split into docs/

## Adapting for Different Project Types

### Library / Package
- Add build/compile step
- Explain how to test against a consuming project
- Document publish/release process (if contributors help with releases)

### CLI Tool
- Include "run locally without installing" command (`npx`, `go run`, `cargo run`)
- Document how to test CLI commands manually

### Web Application
- Include dev server startup
- Document environment variables (use `.env.example`)
- Explain database setup if needed

### Monorepo
- Explain workspace structure
- Show how to work on a specific package
- Document cross-package testing
