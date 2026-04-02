# Repository Templates Guide

GitHub issue templates, PR templates, and discussion category forms that live in `.github/`.

## Directory Structure

```
.github/
├── ISSUE_TEMPLATE/
│   ├── config.yml              # Template chooser configuration
│   ├── bug-report.yml          # Bug report form (YAML)
│   └── feature-request.yml     # Feature request form (YAML)
├── PULL_REQUEST_TEMPLATE.md    # Default PR template
└── DISCUSSION_TEMPLATE/
    └── announcements.yml       # Discussion category form
```

## Issue Template (YAML Form)

Modern GitHub issue templates use YAML forms — structured fields that render as a form in the browser.

```yaml
name: Bug Report
description: Report a bug or unexpected behavior
title: "[Bug]: "
labels: ["bug", "triage"]
assignees: []
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting! Please fill out the sections below.

  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: A clear description of the bug.
      placeholder: "When I click X, Y happens instead of Z..."
    validations:
      required: true

  - type: textarea
    id: reproduce
    attributes:
      label: Steps to reproduce
      description: Minimal steps to trigger the bug.
      value: |
        1.
        2.
        3.

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: What should have happened?
    validations:
      required: true

  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Low — cosmetic or minor
        - Medium — broken feature with workaround
        - High — broken feature, no workaround
        - Critical — data loss or security issue
    validations:
      required: true

  - type: input
    id: version
    attributes:
      label: Version
      description: "What version are you using?"
      placeholder: "v1.2.3 or commit SHA"

  - type: textarea
    id: logs
    attributes:
      label: Logs or screenshots
      description: Paste error output, stack traces, or attach screenshots.
      render: shell
```

### Field types

| Type | Use for |
|------|---------|
| `markdown` | Instructions, headings, context (not user input) |
| `textarea` | Multi-line free text, logs, reproduction steps |
| `input` | Single-line text — version numbers, URLs |
| `dropdown` | Fixed choices — severity, category, platform |
| `checkboxes` | Multiple-select — agree to CoC, confirm steps taken |

### Template chooser config

```yaml
# .github/ISSUE_TEMPLATE/config.yml
blank_issues_enabled: false    # Force template use (no blank issues)
contact_links:
  - name: Questions & Support
    url: https://github.com/owner/repo/discussions
    about: Ask questions in Discussions instead of opening issues.
  - name: Security Vulnerabilities
    url: https://github.com/owner/repo/security/advisories/new
    about: Report security issues privately.
```

## Feature Request Template

```yaml
name: Feature Request
description: Propose a new feature or enhancement
title: "[Feature]: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem or motivation
      description: What problem does this solve?
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How should this work?
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: What else did you consider?

  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Mockups, examples, related issues.
```

## PR Template

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->

## Summary

<!-- What changed and why? -->

Fixes #

## Changes

- <!-- Key change -->

## Testing

- [ ] <!-- How was this tested? -->

## Checklist

- [ ] Tests pass locally
- [ ] Documentation updated (if applicable)
- [ ] No breaking changes (or documented in Notes)
```

### Tips

- Keep the PR template short — long templates get ignored
- Use HTML comments (`<!-- -->`) for instructions — they're invisible in the rendered PR
- The `Fixes #` line with no number prompts the author to fill it in
- Checklist items should be verifiable, not aspirational

## Discussion Templates

```yaml
# .github/DISCUSSION_TEMPLATE/announcements.yml
title: "[Announcement]: "
labels: ["announcement"]
body:
  - type: textarea
    id: content
    attributes:
      label: Announcement
      description: Share your news.
    validations:
      required: true
```

## Guidelines

- **Keep required fields minimal** — 2–3 required fields max. Optional fields with good placeholders get better data than mandatory fields that get "asdf"
- **Use dropdowns for known categories** — severity, platform, feature area. Saves triage time.
- **Disable blank issues** if you want all issues to use templates — `blank_issues_enabled: false`
- **Add contact links** for redirecting support questions to Discussions
- **Test your templates** — create a test issue to verify the form renders correctly
- **Update templates when categories change** — stale dropdown options cause confusion
