---
alwaysApply: true
---

When working with libraries, frameworks, or APIs — use Context7 MCP to fetch current documentation instead of relying on training data. This includes setup questions, code generation, API references, and anything involving specific packages.

## Steps

1. Call `resolve-library-id` with the library name and the user's question
2. Pick the best match — prefer exact names and version-specific IDs when a version is mentioned
3. Call `query-docs` with the selected library ID and the user's question
4. Answer using the fetched docs — include code examples and cite the version

## Especially for

- **Fast-moving ML libraries**: unsloth, peft, trl, transformers, datasets — API surfaces churn frequently, training flags get renamed, defaults change. Always verify against current docs before writing training scripts.
- **New language/runtime releases**: Go iterators, Python 3.12+, Node ESM changes, etc.
- **Cloud SDKs**: AWS, GCP, Azure — they change constantly.
