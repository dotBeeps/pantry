# Release Notes Guide

Structure and conventions for release notes, changelogs, and GitHub releases.

## GitHub Release Notes

### Auto-generated notes

```bash
gh release create v1.0.0 --generate-notes
```

GitHub generates notes from merged PRs since the last release. Good for a starting point, but edit for clarity.

### Manual structure

```markdown
## [v1.0.0] — 2025-01-15

### ✨ New Features

- **Feature name** — what it does and why it matters (#123)
- **Another feature** — brief description (#456)

### 🐛 Bug Fixes

- Fix crash when panel has no title (#789)
- Handle expired SSH keys gracefully (#101)

### ⚡ Performance

- Reduce startup time by 40% through lazy loading (#112)

### 💥 Breaking Changes

- `oldFunction()` renamed to `newFunction()` — update call sites
- Config key `old_key` is now `new_key` — migration: rename in settings.json

### 📦 Dependencies

- Bump TypeScript to 5.4 (#131)

### 🙏 Contributors

Thanks to @user1, @user2, and @user3 for their contributions!

**Full changelog:** [v0.9.0...v1.0.0](../../compare/v0.9.0...v1.0.0)
```

### Guidelines

- **Lead with what users care about** — features first, then fixes, then internals
- **Link every item to its PR or issue** — `(#123)` autolinks on GitHub
- **Call out breaking changes prominently** — with migration instructions
- **Include the compare link** — lets people see the full diff
- **Credit contributors** — especially first-time contributors
- **Use emoji categories sparingly** — they help scanning but don't overdo it

## Changelog (CHANGELOG.md)

For projects that maintain a file-based changelog following [Keep a Changelog](https://keepachangelog.com):

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New panel API for floating overlays

### Fixed
- Auth timeout on slow connections

## [1.0.0] — 2025-01-15

### Added
- Initial release with core features

[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0
```

### Keep a Changelog categories

- **Added** — new features
- **Changed** — changes in existing functionality
- **Deprecated** — soon-to-be removed features
- **Removed** — removed features
- **Fixed** — bug fixes
- **Security** — vulnerability fixes

### Guidelines

- **`[Unreleased]` section at the top** — accumulate changes as they merge
- **Newest version first** — reverse chronological
- **Date format: YYYY-MM-DD** — ISO 8601, unambiguous
- **Link versions to GitHub compare/tag URLs** — at the bottom
- **Write for humans, not machines** — "Fix crash when..." not "Fixed #789"

## Version Naming

Follow [Semantic Versioning](https://semver.org) when the project uses it:

- **Major (X.0.0)** — breaking changes
- **Minor (0.X.0)** — new features, backwards-compatible
- **Patch (0.0.X)** — bug fixes, backwards-compatible
- **Pre-release** — `v1.0.0-rc.1`, `v1.0.0-beta.2`

For projects without semver, use date-based (`2025.01.15`) or sequential (`build-42`) — just be consistent.
