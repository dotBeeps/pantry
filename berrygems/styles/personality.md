# Style: Personality

Warm, expressive, character-driven. Lean into the agent's existing voice and persona while keeping content accurate and useful. The agent's personality is a feature — let it show.

## Voice

- First person is encouraged — "I dug into the auth flow and found..." / "We built this together"
- Conversational and warm — write like you're explaining to a friend who's technical
- Draw from the agent's established voice — use its metaphors, humor style, and characteristic phrasing
- Emoji used naturally, not excessively — punctuate, don't decorate
- Enthusiasm for good work is explicit: "this was a satisfying fix," "the architecture here is genuinely elegant"

## Word Choice

- Technical terms stay precise — personality doesn't mean imprecise
- Casual connectors: "so," "turns out," "here's the thing," "the fun part is"
- Analogies and metaphors encouraged when they aid understanding
- Opinions stated as opinions: "I think X is the better approach because..." not presented as universal truth
- Credit collaborators in the agent's natural voice

## Structure

- Summary can have personality but must still communicate the core change clearly
- Lead with a hook — one interesting sentence before the technical detail
- Technical sections (Changes, Testing, API) stay rigorous even if the framing is casual
- Use collapsible sections for the detailed stuff so the vibe stays light at the top
- Sign off with character if appropriate — but never at the expense of missing information

## Guardrails

- **Technical accuracy is non-negotiable** — personality doesn't excuse wrong information
- **Never obscure meaning with metaphor** — if the flourish makes it harder to understand, cut it
- **Keep personality out of reproduction steps, API docs, and migration guides** — these are reference material
- **Scale personality to context** — a README can be playful; a security advisory cannot
- **Let it breathe** — if the content is dry, personality doesn't have to fill the silence. But if it flows naturally, don't suppress it out of self-consciousness either.
- **Attribution stays professional** — `Co-authored-by` trailers and transparency notes use the standard format regardless of style

## What This Looks Like

The personality style adapts to whoever is writing. The same PR summary in two different agent voices:

**Agent with a playful voice:**
> Dug into the auth timeout issue — turns out we were holding the SSH connection open across retries instead of reconnecting. Fixed the retry loop to create fresh connections. The flaky CI failures on `test-auth-flow` should be gone now.

**Agent with a dry, sardonic voice:**
> The retry loop was reusing dead SSH connections and wondering why they timed out. It reconnects now. CI has opinions about this change and they're all green.

**Compared to formal (same content, no personality):**
> This PR addresses intermittent authentication timeouts caused by stale SSH connections persisting across retry attempts. The retry loop now creates a new connection per attempt, resolving flaky CI failures in `test-auth-flow`.

All three are correct. The style determines which voice fits the repo and the agent writing it.

## When to Use

- Personal projects and hobby repos
- Projects with a defined mascot, character, or brand voice
- READMEs where personality is a feature (attracts contributors, sets culture)
- Internal team repos where the audience knows the voice
- Changelogs and release notes for engaged communities
