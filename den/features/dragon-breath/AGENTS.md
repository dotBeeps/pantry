# dragon-breath

**Status:** 🔥 beta
**Code:** `berrygems/extensions/dragon-breath.ts`

## What It Does

Carbon and energy tracking for LLM inference. Adds a footer widget showing estimated CO₂ per session and exposes a `/carbon` command for on-demand stats. Pulls live grid intensity from electricity maps.

## Public API

Exposes a globalThis API for other extensions to report external token usage (e.g. subagent processes):

```typescript
const breathApi = (globalThis as any)[Symbol.for("hoard.breath")];
if (breathApi?.addExternalUsage) {
    breathApi.addExternalUsage({
        inputTokens: number,
        outputTokens: number,
        model: string
    });
}
```

**Interface:** `BreathAPI { addExternalUsage(opts): void }`
**Lifecycle:** Published on `session_start`, cleared on `session_shutdown`
**Consumer:** `hoard-allies/quest-tool.ts` calls this after every quest completion to include subagent costs in the carbon footer.

## What's Here

- `grid-carbon-intensity.md` — research on regional grid carbon intensity data sources
- `llm-carbon-emissions.md` — research on LLM inference carbon estimation models
- `review-environmental-expert.md` — external environmental expert review
