# Community Documents Guide

Templates and conventions for CODE_OF_CONDUCT, SECURITY, FUNDING, and LICENSE files.

## CODE_OF_CONDUCT.md

Most projects adopt an existing code of conduct rather than writing one from scratch.

### Contributor Covenant (most common)

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, caste, color, religion, or sexual
identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

<!-- Full text at https://www.contributor-covenant.org/version/2/1/code_of_conduct/ -->
```

**Recommended:** Use the full [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) text. GitHub offers it as a template when creating the file.

### Enforcement

Every CoC needs:
- **Contact method** — email address or form for reporting
- **Response timeline** — "We will respond within 48 hours"
- **Consequences** — what happens when the CoC is violated

### Creating via GitHub

```bash
# GitHub offers CoC templates in the web UI:
# Repository → Add file → Create new file → Type "CODE_OF_CONDUCT.md"
# GitHub shows template options automatically
```

## SECURITY.md

Tells security researchers how to report vulnerabilities privately.

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report security issues via [GitHub Security Advisories](../../security/advisories/new)
or email security@example.com.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

### Response timeline

- **Acknowledgment:** within 48 hours
- **Assessment:** within 1 week
- **Fix or mitigation:** depends on severity, but we aim for 30 days

### Disclosure

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).
We'll work with you on timing and credit you in the advisory (unless you prefer anonymity).
```

### Guidelines

- **Always include a private reporting method** — GitHub Security Advisories or an email
- **State supported versions** — researchers need to know if a version is still maintained
- **Set timeline expectations** — even rough ones show you take reports seriously
- **Mention disclosure policy** — coordinated disclosure is the standard

## FUNDING.yml

GitHub Sponsors and other funding configuration.

```yaml
# .github/FUNDING.yml
github: [username]                    # GitHub Sponsors
ko_fi: username                       # Ko-fi
buy_me_a_coffee: username             # Buy Me a Coffee
open_collective: project-name         # Open Collective
custom: ["https://example.com/donate"] # Custom URLs
```

Only include platforms you actually use. GitHub renders these as a "Sponsor" button on the repo.

## LICENSE

### Choosing a license

| License | Permits | Requires | Prohibits |
|---------|---------|----------|-----------|
| **MIT** | Commercial use, modification, distribution | License notice | — |
| **Apache 2.0** | Commercial use, modification, distribution, patent use | License notice, state changes | — |
| **GPL 3.0** | Commercial use, modification, distribution | Disclose source, same license, license notice | — |
| **BSD 2-Clause** | Commercial use, modification, distribution | License notice | — |
| **Unlicense** | Everything | Nothing | — |

**When in doubt:** MIT for libraries, Apache 2.0 for projects with patent concerns, GPL 3.0 for copyleft.

### Creating via GitHub

```bash
# GitHub offers license templates:
# Repository → Add file → Create new file → Type "LICENSE"
# GitHub shows license picker automatically
```

### Placement

- `LICENSE` or `LICENSE.md` in the repo root
- Reference in README: `[MIT](LICENSE)` or `[Apache 2.0](LICENSE)`
- Reference in package.json/Cargo.toml/pyproject.toml: `license = "MIT"`

## .github/profile/README.md

Organization profile README. Renders on the org's GitHub page.

```markdown
# [Org Name]

[1–2 sentences: what this org does]

## Key Projects

| Project | Description |
|---------|-------------|
| [name](link) | one-liner |

## Contributing

[How to get involved — link to contributing guides, discussions]

## Links

[Website](url) · [Docs](url) · [Twitter](url)
```

Keep it focused — this is a landing page, not documentation.
