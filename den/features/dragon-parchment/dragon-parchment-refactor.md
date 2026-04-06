# Dragon Parchment Refactor Plan

Status: Approved  
Date: 2026-04-05

## Overview

Modularize and clean up the panel + GIF stack:

- Rename `hoard-gallery` → `dragon-parchment` (panel foundation)
- Extract Kitty rendering into optional `kitty-gif-renderer` extension
- Extract image fetching into `dragon-image-fetch` extension + morsel
- Replace mascot-style GIFs with inline image syntax throughout
- Generalize text wrapping for inline images
- Polish panel focus logic

---

## New Extension Map

```
berrygems/extensions/
  dragon-parchment.ts       (was: hoard-gallery.ts)
  dragon-scroll.ts          updated: inline images via kitty-gif-renderer
  kobold-housekeeping.ts    updated: no own GIF code, depends on kitty-gif-renderer
  dragon-image-fetch.ts     NEW: multi-source image querying with LLM vibe queries
  kitty-gif-renderer.ts     NEW: Kitty protocol rendering + float/inline text wrapping
  dragon-guard/             unchanged
  dragon-tongue.ts          unchanged
  dragon-inquiry.ts         unchanged
  dragon-digestion.ts       unchanged
```

```
morsels/skills/
  dragon-parchment/         (was: hoard-gallery/) — panel foundation docs
  kobold-housekeeping/      updated: inline image syntax, no mascot concept
  dragon-image-fetch/       NEW: image sources, config, {placeholder} prompts, model
  kitty-gif-renderer/       NEW: how to use renderer in panels, dependencies, degradation
```

---

## Inline Image Syntax

Follows standard markdown image rules. Qualifiers are an extension via `|` separator.

```markdown
![alt](source)                   → standard markdown block image, centered
![alt](source|size)              → block image, sized, centered
![alt](source|size|right)        → float right — text wraps on the left
![alt](source|size|left)         → float left — text wraps on the right
![alt](source|size|inline)       → inline — text on both sides of the image
```

**Source**: any valid markdown image source — `./file.png`, `https://...`, `giphy:query`, `tenor:query`  
**Size**: `tiny` | `small` | `medium` | `large` | `huge`  
**Float**: `left` | `right` | `inline` (omit = centered block, no wrapping)

Without qualifiers, `![alt](url)` renders exactly as standard markdown — no special behavior.
The `|` system is only activated when qualifiers are present.

### Float modes

**`left` / `right`** — image anchored to one edge, text fills the opposite side:
```
[image  ] text wraps on the right side here
[image  ] continuing for as many rows as the image is tall
[image  ] then text resumes full width after
full width text resumes here and continues normally
```

**`inline`** — image punches a rectangular hole in the text flow, prose fills **both** sides
simultaneously for however many rows the image occupies, then resumes full width:
```
ember is a dragon [-----] that likes eating
knowledge and     [-----] sweet treats.
Her favorites are [-----] academic research papers
on coding, and small blue dogs that taste like blue
raspberry and that block her view of the screen.
```

For tiny inline images, this naturally collapses to a single line with text on both sides.
For larger images, the bilateral wrap continues for the full image height — the image
behaves like a rectangular hole the text flows around. Same mode, scales with image size.

Image is centered horizontally by default. Horizontal position is determined by
`floor((innerW - imgCols) / 2)` for the left margin.

### Rendering algorithm (inline mode)
1. Reflow all remaining text (after image marker) as a single word stream
2. For each image row: pack words greedily into `leftW` cols, then `rightW` cols
   — `leftW = floor((innerW - imgCols) / 2)`, `rightW = innerW - leftW - imgCols`
3. Render each row as: `leftSegment + imagePlaceholderRow + rightSegment`
4. Once `imgRows` exhausted: remaining words reflow at full `innerW`

### Examples

```markdown
![relaxing dragon](giphy:dragon napping|small|right)
Text flows naturally to the left of the image.
Multiple lines work fine — wrapping continues until the image height is exhausted.

![party](./assets/confetti.png|tiny|left)
Text flows to the right of a left-floated local image.

Look, a tiny gif ![wag](giphy:dog wagging|tiny|inline) right in the middle of a sentence!

Ember is a dragon ![ember](giphy:dragon coding|small|inline) that likes eating knowledge
and sweet treats. Her favorites are academic research papers on coding, and small blue
dogs that taste like blue raspberry.

![banner](https://example.com/header.png|medium)
Centered full-width image, no wrapping. Standard markdown behavior with explicit size.
```

---

## `dragon-parchment` (renamed from hoard-gallery)

**Symbol key**: `"hoard.parchment"` (clean break — no shim)

### Changes from hoard-gallery
- File rename + Symbol key rename
- `createPanel()` options: add `focusOnOpen?: boolean`
- Focus cycling: Shift+Tab for reverse direction
- Focus cycling: skip hidden/closed panels
- Focus cycling: no-op if only one panel open
- Focus cycling: `1/N` panel counter shown in footer hint
- `todo_panel` tool: add `focus?: boolean` to `open` action

### No other behavioral changes
Panel creation, positioning, collision avoidance, skins, layout — all unchanged.

---

## `kitty-gif-renderer` (new optional berrygem + morsel)

**Responsibility**: Kitty Graphics Protocol rendering only. Protocol-specific, optional.

**Global API**: `Symbol.for("hoard.kitty")`

```typescript
kitty.loadImage(frames: ImageFrames, size: ImageSize): Promise<LoadedImage>
kitty.renderFloat(lines: string[], image: LoadedImage, innerW: number, float: "left" | "right"): string[]
kitty.renderInline(line: string, image: LoadedImage, position: number): string
kitty.disposeImage(image: LoadedImage): void

interface LoadedImage {
  player: AnimatedImagePlayer;
  cols: number;
  rows: number;
  loaded: boolean;
}
```

**Source**: extracted from dragon-scroll + kobold-housekeeping  
**Degradation**: if Kitty protocol unavailable, skip rendering silently — no crash  
**Optional**: panels without images don't load this extension at all

---

## `dragon-image-fetch` (new berrygem + morsel)

**Responsibility**: Multi-source image querying. Returns `ImageFrames`. No rendering knowledge.

**Global API**: `Symbol.for("hoard.imageFetch")`

```typescript
imageFetch.fetch(query: string, size: ImageSize): Promise<ImageFrames | null>
imageFetch.vibeQuery(description: string, opts: VibeQueryOpts): Promise<string>
imageFetch.clearCache(): void
```

### Sources (configurable)
- `giphy` — sticker-preferred, rating-filtered (current behavior)
- `tenor` — alternative GIF source
- _(extensible: add more via settings)_

### Settings Schema
```json
{
  "hoard": {
    "imageFetch": {
      "sources": ["giphy"],
      "preferStickers": true,
      "rating": "r",
      "enableVibeQuery": true,
      "model": "claude-haiku-4-5",
      "queryPrompt": "Find a fun animated {size} for: {description}. Tag: {tag}. Return only search keywords.",
      "cacheMaxSize": 50
    }
  }
}
```

**{Placeholders} in queryPrompt**: `{description}`, `{tag}`, `{size}`, `{source}`

**Source**: extracted from `berrygems/lib/giphy-source.ts`  
**Also extracts**: `generateVibeQuery()` logic from kobold-housekeeping

---

## Mascot Removal

Mascots are entirely replaced by inline image syntax.

**kobold-housekeeping**: strip all mascot code (loadMascot, setupMascot, disposeMascot, line-merging).
Todos can include GIFs by embedding `![gif](giphy:vibe|tiny|right)` in the todo content or panel header string — no special mascot layer needed.

**dragon-scroll**: kill `gif` and `gifSize` tool params. GIFs go in content as `![alt](giphy:query|size|float)`.

---

## Migration

| Old | New |
|-----|-----|
| `hoard-gallery.ts` | `dragon-parchment.ts` |
| `Symbol.for("hoard.gallery")` | `Symbol.for("hoard.parchment")` |
| `gif: "query"` tool param | `![alt](giphy:query\|size\|float)` in content |
| `gifSize: "small"` tool param | inline in image syntax |
| kobold mascot corner GIF | `![](giphy:vibe\|tiny\|right)` in todo content |
| `berrygems/lib/giphy-source.ts` | moved into `dragon-image-fetch.ts` |
| `animated-image-player.ts` | moved into `kitty-gif-renderer.ts` |
| `berrygems/lib/` GIF utils | split between the two new extensions |

---

## Phased Work

### Phase 1 — Rename + Focus Polish
- `hoard-gallery.ts` → `dragon-parchment.ts`
- `Symbol.for("hoard.gallery")` → `Symbol.for("hoard.parchment")` everywhere
- Update all consumers (kobold-housekeeping, dragon-scroll, dragon-tongue, etc.)
- Update AGENTS.md architecture table
- Focus: `focusOnOpen` option in `createPanel()`
- Focus: Shift+Tab reverse cycling
- Focus: skip hidden panels, no-op on single panel
- Focus: `1/N` counter in footer hint
- `todo_panel` tool: `focus` param on `open` action

### Phase 2 — Extract kitty-gif-renderer
- New `berrygems/extensions/kitty-gif-renderer.ts`
- Pull `AnimatedImagePlayer`, line-merging, float render from dragon-scroll + kobold-housekeeping
- Expose `Symbol.for("hoard.kitty")` API
- Update dragon-scroll + kobold-housekeeping to consume it
- New `morsels/skills/kitty-gif-renderer/` skill

### Phase 3 — Extract dragon-image-fetch
- New `berrygems/extensions/dragon-image-fetch.ts`
- Extract `giphy-source.ts`, `generateVibeQuery()`
- Multi-source config, {placeholder} prompts, model selection
- Expose `Symbol.for("hoard.imageFetch")` API
- New `morsels/skills/dragon-image-fetch/` skill

### Phase 4 — Generalize Inline Images
- dragon-scroll: parse `|left` / `|right` / `|inline` qualifiers
- dragon-scroll: `inline` mode — image sits within a text line, text on both sides
- dragon-scroll: kill `gif` and `gifSize` tool params
- kobold-housekeeping: strip all mascot code, use inline syntax in content
- Standard markdown `![alt](url)` without qualifiers: unchanged behavior

### Phase 5 — Skill Rewrites
- `morsels/skills/hoard-gallery/` → `dragon-parchment/`: full rewrite
- `morsels/skills/kobold-housekeeping/SKILL.md`: replace mascot section with inline image syntax
- `morsels/skills/dragon-image-fetch/SKILL.md`: new
- `morsels/skills/kitty-gif-renderer/SKILL.md`: new

---

## Notes

- `panel-chrome.ts` — untouched (text-only rendering is correct)
- `hoard.todos.*` settings namespace — kept for todo-specific config
- `todo` ↔ `todo_panel` tool split — kept (native tool manages files, panel tool manages display)
- No deprecation shim for Symbol key rename — clean break, all consumers are in this repo
