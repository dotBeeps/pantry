---
name: kitty-gif-renderer
description: "Render animated GIF images using the Kitty terminal graphics protocol. Use when building panel extensions that need to display inline animated images, or when integrating float/inline image rendering alongside text content."
license: MIT
compatibility: "Designed for Pi (pi-coding-agent)"
---

# Kitty GIF Renderer

Optional extension that renders animated images using the Kitty terminal graphics protocol. Extensions that use images check for this at runtime — if it's not loaded, they degrade gracefully.

## API Access

```typescript
const KITTY_KEY = Symbol.for("pantry.kitty");
function getKitty(): KittyAPI | undefined {
  return (globalThis as any)[KITTY_KEY];
}
```

Always treat the result as optional. Never import kitty-gif-renderer directly.

## API Reference

```typescript
interface KittyAPI {
  loadImage(frames: ImageFrames, opts: LoadImageOpts): LoadedImage;
  disposeImage(image: LoadedImage): void;
  createMerger(image: LoadedImage, innerW: number): FloatMerger;
}

interface LoadImageOpts {
  maxCols: number;
  maxRows: number;
  onReady?: () => void; // called when image is ready to display
}

interface LoadedImage {
  player: AnimatedImagePlayer;
  cols: number;
  rows: number;
}

interface FloatMerger {
  hasMore: boolean; // true while image rows remain
  mascotWidth: number; // image column width (for content narrowing)
  nextLine(content: string): { content: string; gap: number; mascot: string };
  flushLines(): Array<{ gap: number; mascot: string }>;
}
```

## Loading an Image

```typescript
const kitty = getKitty();
if (!kitty) return; // not available — skip image

let ref: LoadedImage | null = null;

const loaded = kitty.loadImage(imageData, {
  maxCols: 24,
  maxRows: 12,
  onReady: () => {
    if (ref !== loaded) return; // stale ref guard
    invalidate();
    tui.requestRender();
  },
});
ref = loaded;
```

Images transmit asynchronously. Always guard `onReady` against stale references — the panel may have been disposed or the image replaced before the callback fires.

## Disposing an Image

```typescript
kitty.disposeImage(loaded);
ref = null;
```

Stops animation, deletes the Kitty virtual placement, frees terminal memory. Call in `dispose()` and whenever you replace an image.

## Float Merging

`createMerger` produces a `FloatMerger` for flowing text alongside an image:

```typescript
const merger = kitty.createMerger(loaded, innerW);

// Consume lines while image rows remain
while (merger.hasMore && moreContent) {
  const { content, gap, mascot } = merger.nextLine(textLine);
  // Right float
  lines.push(content + " ".repeat(gap) + mascot);
  // Left float
  // lines.push(mascot + " ".repeat(gap) + content);
}

// Flush remaining image rows after content ends
for (const { gap, mascot } of merger.flushLines()) {
  lines.push(" ".repeat(gap) + mascot);
}
```

`nextLine(content)` narrows content to fit alongside the image and returns the Kitty placeholder for the current row. `gap` fills the remaining space to reach `innerW` total columns.

## Graceful Degradation

```typescript
const kitty = getKitty();
if (!kitty) {
  lines.push(theme.fg("dim", "[image not available]"));
  return lines;
}
```

Don't hard-fail. Panels must render correctly without images.

## Anti-Patterns

- **Don't import kitty-gif-renderer directly** — use `globalThis[Symbol.for("pantry.kitty")]`
- **Don't skip the stale-ref guard in `onReady`** — async load races with disposal
- **Don't assume Kitty is available** — always check `getKitty()` and degrade gracefully
- **Don't forget `disposeImage`** — Kitty virtual placements persist until explicitly deleted
