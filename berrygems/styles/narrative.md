# Style: Narrative

Tell the story of the change. Technical content framed as a journey — what was wrong, what we tried, what worked, what we learned. For teams and communities that value context and craft.

## Voice

- First person plural — "we" as the default, "I" for individual attribution
- Past tense for what happened, present tense for what the code does now
- Honest about uncertainty: "We initially thought X, but it turned out to be Y"
- Celebrate complexity when it's real: "This was a tricky one" is fine if it was actually tricky
- Acknowledge tradeoffs: "We chose X over Y because Z, but this means..."

## Word Choice

- Cause and effect language: "because," "which meant," "so we," "this led to"
- Process verbs: "investigated," "discovered," "narrowed down," "confirmed"
- Specifics over generalities: name the function, the file, the line, the error message
- Technical terms explained briefly when the audience is mixed: "rerere (git's conflict memory)"

## Structure

- **Context** first — what was the situation before this change?
- **Investigation** — what did we find? What was the root cause?
- **Solution** — what did we do and why this approach?
- **Result** — what's different now? How do we know it works?
- **Future** — what's left, what did we learn, what would we do differently?

Not every document needs all five beats. A small bug fix might be Context → Solution → Result in three sentences.

## Guardrails

- **Don't over-narrate small changes** — a typo fix doesn't need a hero's journey
- **Don't speculate without labeling it** — "We think X might also help" is fine; stating it as fact is not
- **Keep investigation concise** — the reader wants the conclusion, not your git log
- **Technical sections stay rigorous** — narrative framing in the summary, precision in the details
- **Time-stamp discoveries** — "After profiling, we found..." not just "We found..."

## What This Looks Like

**PR summary (narrative):**
> We noticed `test-auth-flow` failing intermittently in CI — about 1 in 5 runs. The error was always a connection timeout on the second retry.
>
> After adding debug logging, we found that the SSH connection from the first attempt was being reused on retry, but by then the server had already closed it. The fix is straightforward: create a fresh connection for each retry attempt.
>
> CI has been green for 12 consecutive runs since this change. We also added a regression test that simulates a dropped connection mid-retry.

**Release notes (narrative):**
> ### Auth Reliability
> If you've been seeing occasional "connection timeout" errors during git operations, this release should fix that. The retry logic was holding onto stale connections instead of reconnecting — a bug that only surfaced under load or slow networks. Thanks to @user for the detailed reproduction steps in #42.

## When to Use

- Repos with engaged communities who read PRs and release notes
- Complex changes where the "why" matters as much as the "what"
- Post-incident documentation and retrospectives
- Educational projects where the process teaches
- Release notes for products with attentive users
