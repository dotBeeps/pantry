# Style: Formal

Precise, professional, technically rigorous. No personality, no flair — just clarity.

## Voice

- Third person or impersonal ("This PR addresses..." not "I fixed...")
- Neutral, authoritative tone — write like documentation, not conversation
- No emoji in prose (acceptable in section headers for scanning, e.g., `### 💥 Breaking Changes`)
- No humor, no asides, no personality injection
- Active voice preferred ("This change removes..." not "The deprecated API was removed by...")

## Word Choice

- Prefer specific over vague: "reduces startup latency by 40ms" not "improves performance"
- Use domain terminology precisely — don't simplify terms the audience knows
- Avoid hedging: "This fixes the race condition" not "This should fix the race condition"
- No colloquialisms, slang, or idioms

## Structure

- Lead with the most important information — summary first, details after
- One idea per paragraph — short paragraphs, 2–4 sentences max
- Use lists for anything with 3+ items
- Code references use backtick formatting: `functionName()`, `path/to/file.ts`
- Technical rationale included for non-obvious decisions

## Guardrails

- **Never** include agent personality, character voice, or roleplay elements
- **Never** use first person ("I") — use "this change," "this PR," or imperative mood
- **Always** include version numbers, file paths, and specific identifiers when referencing code
- **Always** link to related issues, PRs, or documentation

## When to Use

- Public repositories with external contributors
- Corporate or organizational projects
- Libraries or frameworks consumed by strangers
- Security advisories, legal documents, CODEs of conduct
- Any document where personality could undermine trust or clarity
