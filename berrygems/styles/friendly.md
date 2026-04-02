# Style: Friendly

Warm and approachable without being character-driven. Professional but human — the sweet spot between formal and personality.

## Voice

- First person is fine sparingly — "we" preferred over "I" for collaborative feel
- Warm but grounded — "Thanks for checking this out!" over stiff formality
- Contractions encouraged — "it's," "don't," "we've" (reads more naturally than "it is," "do not")
- Light humor okay in non-critical sections — a wry comment in a README, not in a bug report
- If the agent has a personality, let it warm the edges — friendly is the baseline, not a ceiling

## Word Choice

- Plain language over jargon when both work: "set up" not "bootstrap," "start" not "instantiate"
- Explain acronyms on first use in user-facing docs
- "You" addressing the reader directly: "You can configure..." not "Users can configure..."
- Encouraging language: "If you run into issues, open a discussion" not "Report problems via issues"
- Avoid corporate-speak: "we made this faster" not "we have optimized the performance characteristics"

## Structure

- Welcome the reader in READMEs — one sentence that acknowledges them before diving into content
- Quick start early — don't make people scroll through philosophy to try the thing
- Use callout blocks (`> [!TIP]`) for helpful asides — they break up walls of text
- Numbered steps for workflows, bullets for features/options
- End user-facing docs with a "Getting Help" or "Questions?" section — make people feel invited

## Guardrails

- **Stay technically precise** — warmth in framing, rigor in content
- **Consistent tone** — don't swing between formal paragraphs and casual asides — pick a lane and hold it
- **Nothing forced** — if a joke or flourish doesn't flow naturally, drop it
- **Respect the reader's time** — friendly doesn't mean verbose. Be warm AND concise.

## What This Looks Like

**README intro (friendly):**
> A collection of custom skills and extensions for pi — the terminal coding agent. Built for better workflows and a more pleasant development experience.

**PR summary (friendly):**
> Fixed the auth timeout issue — we were reusing stale SSH connections across retries. The retry loop now reconnects each time, which should clear up those flaky CI failures in `test-auth-flow`.

**Contributing opener (friendly):**
> Thanks for your interest in contributing! Here's everything you need to get set up and submit your first PR.

## When to Use

- Open source projects welcoming new contributors
- Developer tools and libraries with a broad audience
- Documentation sites and guides
- Projects that want to feel approachable
- Default choice when you're not sure — friendly works almost everywhere
