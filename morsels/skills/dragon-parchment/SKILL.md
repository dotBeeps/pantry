---
name: dragon-parchment
description: "Build and integrate floating overlay panels using the dragon-parchment API. Use when creating new panel extensions, adding panels to existing extensions, or working with the globalThis panel infrastructure."
license: MIT
compatibility: "Designed for Pi (pi-coding-agent)"
---

# Panel Development

Build floating overlay panels that integrate with dragon-parchment — the central authority for panel lifecycle, positioning, focus cycling, smart placement, and session management.

## API Access

```typescript
const PANELS_KEY = Symbol.for("pantry.parchment");
function getPanels(): any {
  return (globalThis as any)[PANELS_KEY];
}
```

Never import `dragon-parchment.ts` directly — jiti isolates module caches per extension entry point.

## PanelContext

The factory passed to `createPanel()` receives a `PanelContext`:

```typescript
interface PanelContext {
  tui: TUI;
  theme: Theme;
  cwd: string;
  isFocused: () => boolean;
  focusIndex: () => { index: number; total: number } | null; // 1-based position in cycle
}
```

## PanelComponent

```typescript
interface PanelComponent {
  render(width: number): string[]; // each line MUST NOT exceed width
  invalidate(): void;
  handleInput?(data: string): void; // extension-specific keys only
  dispose?(): void;
}
```

## Adding a Panel

```typescript
const panels = getPanels();
if (!panels) return "dragon-parchment not loaded";

let myComp: MyComponent | null = null;

panels.createPanel(
  "my-panel",
  (panelCtx) => {
    myComp = new MyComponent(panelCtx);
    return {
      render: (w) => myComp!.render(w),
      invalidate: () => myComp!.invalidate(),
      handleInput: (data) => myComp!.handleInput(data),
      dispose: () => myComp!.cleanup(),
    };
  },
  {
    anchor: "right-center",
    width: "30%",
    focusOnOpen: true, // optional — focus immediately after open
    onClose: () => {
      myComp = null;
    },
  },
);

// Clean up on session events
pi.on("session_switch", async () => {
  myComp = null;
});
pi.on("session_shutdown", async () => {
  myComp = null;
});
```

## Focus Counter in Hint Bar

```typescript
const kh = getPanels()?.keyHints;
const idx = panelCtx.focusIndex();
const counter = idx ? ` ${idx.index}/${idx.total}` : "";
const hint = panelCtx.isFocused()
  ? th.fg(
      "dim",
      `↑↓ nav · ${kh?.focused ?? "Q close · Escape unfocus"}${counter}`,
    )
  : th.fg("dim", `${kh?.unfocused ?? "Alt+T focus"} · /mycommand help`);
```

## keyHints

```typescript
const kh = getPanels()?.keyHints;
kh.focusKey; // "Alt+T"
kh.focusReverseKey; // "Shift+Tab"
kh.closeKey; // "Q"
kh.unfocusKey; // "Escape"
kh.focused; // "Q close · Escape unfocus"
kh.unfocused; // "Alt+T focus"
kh.focusReverse; // "Shift+Tab prev"
```

## Smart Placement

```typescript
// Auto-placed — dragon-parchment picks the best free position
panels.createPanel("my-panel", factory);

// Suggest positions before opening multiple panels at once
const suggestions = panels.suggestLayout(2);
panels.createPanel("panel-a", factoryA, suggestions[0]);
panels.createPanel("panel-b", factoryB, suggestions[1]);
```

Collision avoidance adjusts `offsetY`/`offsetX` to stack panels at the same anchor. Pass `allowOverlap: true` to skip.

## Panel-Relative Anchoring

```typescript
panels.createPanel("detail-panel", factory, {
  anchor: {
    relativeTo: "list-panel", // ID of reference panel
    edge: "bottom", // top | bottom | left | right | top-left | …
    offsetX: 0,
    offsetY: 1,
  },
  width: "30%",
});
```

## Configurable Hotkeys

| Setting                         | Default     | Action               |
| ------------------------------- | ----------- | -------------------- |
| `pantry.panels.focusKey`        | `alt+t`     | Cycle focus forward  |
| `pantry.panels.focusReverseKey` | `shift+tab` | Cycle focus backward |
| `pantry.panels.closeKey`        | `q`         | Close focused panel  |
| `pantry.panels.unfocusKey`      | `escape`    | Unfocus panel        |

## TUI Rendering

```typescript
// Focus-aware borders
const border = (s: string) => th.fg(panelCtx.isFocused() ? "accent" : "border", s);

// Cached render pattern
render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = /* build lines */;
    return this.cachedLines;
}
invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }
```

Use `truncateToWidth()` for ANSI-decorated lines — never slice directly.

## /panels Command

```
/panels                  List all open panels
/panels close-all        Close everything
/panels layout [count]   Suggest positions for N panels
/panels focus [id]       Focus a panel / cycle focus
```

## Reference — API Methods

| Method                            | Description                                  |
| --------------------------------- | -------------------------------------------- |
| `createPanel(id, factory, opts?)` | **Primary API** — create, position, register |
| `suggestLayout(count)`            | Positions for N new panels                   |
| `getGeometry(id)`                 | Tracked geometry for a panel                 |
| `close(id)`                       | Close and dispose                            |
| `closeAll()`                      | Close all                                    |
| `isOpen(id)`                      | Open check                                   |
| `list()`                          | `{ id, focused }[]`                          |
| `focusPanel(id)`                  | Focus by ID                                  |
| `cycleFocus(direction?)`          | 1 = next (default), -1 = prev                |
| `unfocusAll()`                    | Remove all focus                             |
| `requestRender()`                 | Trigger re-render                            |

## Reference — PanelCreateOptions

| Option         | Type                              | Default | Description                             |
| -------------- | --------------------------------- | ------- | --------------------------------------- |
| `anchor`       | `OverlayAnchor \| PanelAnchorRef` | auto    | Position or panel-relative anchor       |
| `width`        | `number \| string`                | `"30%"` | Columns or percentage                   |
| `minWidth`     | `number`                          | `30`    | Minimum columns                         |
| `maxHeight`    | `number \| string`                | `"90%"` | Rows or percentage                      |
| `offsetX`      | `number`                          | `0`     | Horizontal offset                       |
| `offsetY`      | `number`                          | `0`     | Vertical offset                         |
| `margin`       | `number \| object`                | `1`     | Sides or `{ top, right, bottom, left }` |
| `allowOverlap` | `boolean`                         | `false` | Skip collision avoidance                |
| `focusOnOpen`  | `boolean`                         | `false` | Focus immediately after creation        |
| `visible`      | `(w, h) => boolean`               | —       | Responsive visibility                   |
| `onClose`      | `() => void`                      | —       | Called after close                      |

## Anti-Patterns

- **Don't import dragon-parchment directly** — use `globalThis[Symbol.for("pantry.parchment")]`
- **Don't call `ctx.ui.custom()` yourself** — use `createPanel()`
- **Don't handle Esc, Q, or focus keys in your component** — dragon-parchment consumes these first
- **Don't register your own focus shortcut** — dragon-parchment owns those `registerShortcut` calls
- **Don't hardcode key labels** — use `keyHints`
