# Compositor Bleed Fix Session — 2026-04-03

## The Bug

NonCapturing overlays (floating panels) composite ON TOP of capturing widgets (ask prompts) in pi's TUI. The compositor uses a flat painter's algorithm with no z-order awareness — it just paints overlays over base content in `focusOrder` order. When a capturing widget replaces the editor via `ctx.ui.custom()`, panels bleed through visually.

Related upstream issues:
- **#1355 / PR #1916** — Original nonCapturing overlay feature (Kenji Pa). Author noted overlays are "like windows" and suggested z-order/focus-based rendering. Merged as minimal +46 lines.
- **#2759/#2760 / PR #2758** — Our viewport scroll corruption fix (also panel-related).
- **#2783** — Width overflow crash in compositor (tab stops + compositing drift).

The specific bleed-over-capturing-widget bug was **unfiled** — we discovered it through our panel work.

## What We Tried

### Attempt 1: `setCapturingWidget` flag (upstream)
Added `_capturingWidget` boolean to TUI class. When true, `compositeOverlays()` filters out nonCapturing overlays. `showExtensionCustom` sets it when entering/exiting widget mode.

- ✅ Worked — panels suppressed during ask, no bleed
- ❌ Required upstream pi-mono changes (2 files, 27 lines)
- ❌ Blunt instrument — hides ALL panels, not just overlapping ones
- Extension-side opt-out via `setTimeout(() => tui.setCapturingWidget(false), 0)` to bring panels back

**Result:** Functional but too invasive for upstream PR. Also killed the spinner (statusContainer.clear) which needed save/restore.

### Attempt 2: Widget as capturing overlay (upstream)
Instead of replacing the editor, show the widget as a capturing overlay (`width: 100%`, `anchor: bottom-left`). Compositor's natural paint order handles z-order — panels paint first, widget paints over them.

- ❌ Changed rendering behavior of all non-overlay widgets
- ❌ Visual artifacts — widget didn't render correctly as overlay
- Reverted immediately after testing

**Result:** Too invasive. Changes fundamental widget rendering model.

### Attempt 3: `queueMicrotask` timing (extension-side)
Called `setCapturingWidget(false)` from extension via `queueMicrotask()`.

- ❌ Wrong queue order — our microtask ran BEFORE pi's `.then()` microtask
- Microtasks are FIFO; ours was queued first inside the factory, pi's `.then` queued after

**Result:** Didn't fire in the right order.

### Attempt 4: `suspend()` + `setTimeout(resume, 0)` (extension-side) ✅
```typescript
function activateAskMode(): void {
    const panels = getPanels();
    panels?.setAskActive?.(true);
    panels?.suspend?.();
    setTimeout(() => panels?.resume?.(), 0);
}
```

- `suspend()` calls `setHidden(true)` on all panel overlay handles
- Panels removed from compositor during widget setup frame
- `setTimeout(0)` runs on macrotask queue — after ALL microtasks drain (including pi's `.then()`)
- `resume()` calls `setHidden(false)` — panels reappear after widget is stable
- Panels composite on top but somehow render cleanly alongside the ask widget

**Result:** 2 lines. Pure extension-side. No upstream changes. Panels persist through ask prompts without bleed.

## Key Learnings

### JavaScript Event Loop
- **Microtasks** (`Promise.then`, `queueMicrotask`) — run immediately after current code, FIFO, drain completely before macrotasks
- **Macrotasks** (`setTimeout`, `setInterval`, I/O) — run after ALL microtasks drain
- `setTimeout(0)` is NOT instant — it waits for the entire microtask queue to flush
- This ordering was critical: factory runs → microtasks drain (pi's .then sets up widget) → macrotask fires (our resume)

### Compositor Architecture
- `compositeOverlays()` is a flat painter's algorithm — no regions, no z-order awareness
- Overlays paint in `focusOrder` order over base content
- `setHidden(true)` removes overlay from compositor entirely (not just visual — it's filtered in `isOverlayVisible`)
- NonCapturing overlays were added as minimal feature (#1355) without spatial awareness

### Engineering Approach
- Started with upstream fix (clean, correct) → too invasive for PR
- Tried architectural refactor (overlay-based widget) → changed too much
- Ended with timing hack (suspend/resume) → 2 lines, works perfectly
- Sometimes the "hack" is the right answer when you can't change the platform

## Session Texture

dot suggested the flicker fix approach after we'd gone through three upstream attempts. "what if we do our flicker fix like we did with our upstream fix but just flickering our overlay layer instead of at a deeper level" — which is exactly the `suspend()/resume()` pattern.

Celebrated with a panel party — all three panels visible alongside ask prompts. dot took a nap in my stomach. Learned about macrotasks. Made a dragon pun ("macro, like a dragon"). Good session.

## Files Changed

### pi-mono (all reverted — zero upstream changes)
- `packages/tui/src/tui.ts` — tried `_capturingWidget` flag, reverted
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — tried widget changes, reverted

### hoard
- `berrygems/extensions/ask.ts` — `activateAskMode()` with suspend/setTimeout/resume pattern
