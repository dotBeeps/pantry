---
name: dragon-image-fetch
description: "Fetch animated GIF images from Giphy, Tenor, URLs, or local files. Optionally generate vibe-matched search queries via LLM. Use when building extensions that need to load images, or when implementing image-aware tools."
license: MIT
compatibility: "Designed for Pi (pi-coding-agent)"
---

# Dragon Image Fetch

Centralised image fetching for pantry extensions. Handles Giphy, Tenor, direct URLs, and local files. Includes an optional vibe-query generator that uses an LLM to pick search terms matching a description.

## API Access

```typescript
const IMAGE_FETCH_KEY = Symbol.for("pantry.imageFetch");
function getImageFetch(): ImageFetchAPI | undefined {
  return (globalThis as any)[IMAGE_FETCH_KEY];
}
```

Never import dragon-image-fetch directly.

## API Reference

```typescript
interface ImageFetchAPI {
  fetch(query: string, size?: string): Promise<ImageFrames | null>;
  vibeQuery(description: string, opts?: VibeQueryOpts): Promise<string>;
  clearCache(): void;
}

interface VibeQueryOpts {
  tag?: string;
  extCtx?: ExtensionContext; // required for LLM model access
}
```

## fetch()

Fetches and decodes image frames. Returns `null` on failure.

```typescript
const imageFetch = getImageFetch();
const frames = await imageFetch?.fetch("giphy:dragon coding", "small");
if (!frames) return;
```

### Source routing

| Prefix                 | Example                        | Behaviour                                        |
| ---------------------- | ------------------------------ | ------------------------------------------------ |
| `giphy:`               | `giphy:dragon coding`          | Giphy sticker search                             |
| `tenor:`               | `tenor:celebration`            | Tenor v2 search (requires `tenorApiKey` setting) |
| `http://` / `https://` | `https://example.com/anim.gif` | Direct URL download                              |
| File path              | `/tmp/anim.gif`                | Local file read                                  |
| Bare text              | `dragon coding`                | Routes to first configured source                |

### Sizes

`tiny` · `small` · `medium` (default) · `large` · `huge`

Results are LRU-cached. Cache is cleared on session switch.

## vibeQuery()

Asks an LLM to generate a search term matching a text description. Falls back to the tag or description directly if LLM is unavailable.

```typescript
const query =
  (await imageFetch?.vibeQuery("a list of bug fixes and refactoring tasks", {
    tag: "bugs",
    extCtx: ctx,
  })) ?? "bugs";
const frames = await imageFetch?.fetch(`giphy:${query}`, "tiny");
```

Vibe query results are cached for 10 minutes per description.

## clearCache()

Clears both the fetch cache and vibe-query cache:

```typescript
pi.on("session_switch" as any, async () => {
  getImageFetch()?.clearCache();
});
```

## Settings

All under `pantry.imageFetch` in `~/.pi/agent/settings.json`:

| Key               | Default      | Description                                                               |
| ----------------- | ------------ | ------------------------------------------------------------------------- |
| `sources`         | `["giphy"]`  | Source priority: `giphy`, `tenor`                                         |
| `preferStickers`  | `true`       | Prefer animated stickers over clips                                       |
| `rating`          | `"g"`        | Content rating (Giphy: g / pg / pg-13 / r)                                |
| `enableVibeQuery` | `true`       | Allow LLM vibe-query generation                                           |
| `model`           | (pi default) | LLM model for vibe queries                                                |
| `queryPrompt`     | built-in     | Prompt template — supports `{tag}`, `{description}`, `{size}`, `{source}` |
| `cacheMaxSize`    | `50`         | Maximum cached images                                                     |
| `tenorApiKey`     | —            | Required for Tenor source                                                 |

### Custom query prompt

```json
{
  "pantry": {
    "imageFetch": {
      "queryPrompt": "Pick a Giphy sticker search term (2-4 words) for this task list:\n{description}\nTag: {tag}. Reply with only the search term."
    }
  }
}
```

## Anti-Patterns

- **Don't import dragon-image-fetch directly** — use `globalThis[Symbol.for("pantry.imageFetch")]`
- **Don't call `fetch()` without null-checking** — the extension may not be loaded
- **Don't call `vibeQuery()` without `extCtx`** — it falls back silently without LLM access
- **Don't skip `clearCache()` on session switch** — vibe query results are session-scoped
