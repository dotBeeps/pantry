---
name: dot-panels
description: "Build and integrate floating overlay panels using the dots-panels API. Use when creating new panel extensions, adding panels to existing extensions, or working with the globalThis panel infrastructure."
---

# Panel Development

Build floating overlay panels that integrate with dots-panels — the central authority for panel lifecycle, positioning, focus cycling, smart placement, and session management. Focus cycling, configurable hotkeys, and consistent hint bars come free.

## API Access

Dots-panels publishes its API to `globalThis` at extension load time. Access it from any extension:

```typescript
const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any { return (globalThis as any)[PANELS_KEY]; }
```

Never import `dots-panels.ts` directly — jiti isolates module caches per extension entry point, causing duplicate state.

## API Reference

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `tui` | `TUI \| null` | TUI reference (available after session_start) |
| `theme` | `Theme \| null` | Current theme |
| `cwd` | `string` | Working directory |
| `size` | `number` | Count of open panels |

### Methods

| Method | Description |
|--------|-------------|
| `createPanel(id, factory, options?)` | **Primary API** — create, position, and register a panel in one call |
| `suggestLayout(count)` | Suggest optimal positions for N new panels, avoiding existing ones |
| `getGeometry(id)` | Get tracked geometry (anchor, resolvedWidthCols, etc.) for a panel |
| `close(id)` | Close and dispose a panel |
| `closeAll()` | Close all panels |
| `isOpen(id)` | Check if a panel is open |
| `get(id)` | Get a panel's internal `ManagedPanel` entry |
| `list()` | All open panels as `{ id, focused }[]` |
| `focusPanel(id)` | Focus a specific panel |
| `cycleFocus()` | Cycle focus to next panel |
| `unfocusAll()` | Remove focus from all panels |
| `requestRender()` | Trigger TUI re-render |
| `register(id, panel)` | Lower-level registration (backward compat — prefer `createPanel`) |
| `wrapComponent(id, component)` | Wrap a component for shared key routing (backward compat) |

## PanelContext

The factory passed to `createPanel()` receives a `PanelContext` — no need to access `getPanels().tui` manually:

```typescript
interface PanelContext {
    tui:       TUI;           // TUI rendering reference
    theme:     Theme;         // Current theme
    cwd:       string;        // Working directory
    isFocused: () => boolean; // Whether this panel currently has keyboard focus
}
```

## PanelComponent

Your factory must return a `PanelComponent`:

```typescript
interface PanelComponent {
    render(width: number): string[];  // Lines — each MUST NOT exceed width
    invalidate(): void;               // Clear cached render state
    handleInput?(data: string): void; // Extension-specific keys only
    dispose?(): void;                 // Resource cleanup (intervals, etc.)
}
```

Handle only your extension-specific keys in `handleInput`. Shared keys (Esc / Q / focus cycle) are consumed by dots-panels before your handler runs.

## keyHints

Use `keyHints` instead of hardcoding key names — they update when the user changes keybindings:

```typescript
const kh = getPanels()?.keyHints;
kh.focusKey    // "Alt+T"
kh.closeKey    // "Q"
kh.unfocusKey  // "Escape"
kh.focused     // "Q close · Escape unfocus"
kh.unfocused   // "Alt+T focus"
```

## Adding a Panel — Step by Step

### 1. Access the API

```typescript
const panels = getPanels();
if (!panels) return "dots-panels not loaded";
```

### 2. Create the panel

`createPanel()` handles overlay creation, key routing, geometry tracking, and focus management. If the panel is already open it's refreshed instead of recreated.

```typescript
let myComp: MyComponent | null = null;

panels.createPanel("my-panel", (panelCtx) => {
    myComp = new MyComponent(panelCtx);
    return {
        render:      (w)    => myComp!.render(w),
        invalidate:  ()     => myComp!.invalidate(),
        handleInput: (data) => myComp!.handleInput(data),
        dispose:     ()     => myComp!.cleanup(),
    };
}, {
    anchor:   "right-center",  // optional — auto-placed if omitted
    width:    "30%",
    onClose:  () => { myComp = null; },
});
```

### 3. Clean up on session events

Dots-panels calls `closeAll()` on session switch/shutdown, which fires each panel's `onClose`. Update your own component references too:

```typescript
pi.on("session_switch",  async () => { myComp = null; });
pi.on("session_shutdown", async () => { myComp = null; });
```

## Smart Placement

When no `anchor` is specified, dots-panels picks the best available screen position automatically:

- Tries positions in priority order: `right-center`, `top-right`, `bottom-right`, `left-center`, `top-left`, `bottom-left`, `top-center`, `bottom-center`
- Computes bounding boxes for all open panels and picks the first non-overlapping position
- Falls back to the position with the least overlap area if all positions conflict

```typescript
// Auto-placed — no anchor needed
panels.createPanel("my-panel", factory);
```

When an anchor *is* specified, collision avoidance adjusts `offsetY`/`offsetX` to stack around existing panels at the same anchor. Pass `allowOverlap: true` to skip this.

### suggestLayout()

Ask dots-panels for curated positions before opening multiple panels at once:

```typescript
const suggestions = panels.suggestLayout(2);
// [
//   { anchor: "top-right",    width: "30%", margin: { right: 1, top: 1 } },
//   { anchor: "bottom-right", width: "30%", margin: { right: 1, bottom: 1 } },
// ]

panels.createPanel("panel-a", factoryA, suggestions[0]);
panels.createPanel("panel-b", factoryB, suggestions[1]);
```

Suggestions account for already-open panels.

## Panel-Relative Anchoring

Anchor a new panel to an edge of an existing panel using `{ relativeTo, edge }`:

```typescript
panels.createPanel("detail-panel", factory, {
    anchor: {
        relativeTo: "list-panel",  // ID of the reference panel
        edge:       "bottom",      // top | bottom | left | right
                                   // top-left | top-right | bottom-left | bottom-right
        offsetX:    0,             // optional fine-tuning
        offsetY:    1,
    },
    width: "30%",
});
```

Dots-panels converts the relative position to percentage-based coordinates so the layout is resilient to terminal resizes. Returns an error result if the reference panel isn't open.

## PanelCreateOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `anchor` | `OverlayAnchor \| PanelAnchorRef` | auto | Screen position or panel-relative anchor |
| `width` | `number \| string` | `"30%"` | Column count or percentage |
| `minWidth` | `number` | `30` | Minimum width in columns |
| `maxHeight` | `number \| string` | `"90%"` | Row count or percentage |
| `offsetX` | `number` | `0` | Horizontal offset from anchor |
| `offsetY` | `number` | `0` | Vertical offset from anchor |
| `margin` | `number \| object` | `1` | All sides or `{ top, right, bottom, left }` |
| `allowOverlap` | `boolean` | `false` | Skip collision avoidance |
| `visible` | `(w, h) => boolean` | — | Responsive visibility function |
| `onClose` | `() => void` | — | Called after panel is closed |

## TUI Rendering Conventions

### Focus-aware borders

```typescript
const focused = panelCtx.isFocused();
const border  = (s: string) => th.fg(focused ? "accent" : "border", s);
```

### Cached rendering

```typescript
render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    // ... build lines ...
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
}
invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }
```

### Hint bar

```typescript
const kh     = getPanels()?.keyHints;
const hint   = panelCtx.isFocused()
    ? th.fg("dim", `↑↓ nav · Space toggle · ${kh?.focused   ?? "Q close · Escape unfocus"}`)
    : th.fg("dim", `${kh?.unfocused ?? "Alt+T focus"} · /mycommand help`);
```

### Width safety

Use `truncateToWidth()` for any line containing ANSI escapes — never slice strings directly.

## /panels Command

Dots-panels registers a `/panels` command for managing all open panels:

```
/panels                  List all open panels with positions
/panels close-all        Close everything
/panels layout [count]   Suggest positions for N panels
/panels focus [id]       Focus a panel / cycle focus
```

## Configurable Hotkeys

All shared panel keys read from `dotsPiEnhancements` in `~/.pi/agent/settings.json`:

| Setting | Default | Action |
|---------|---------|--------|
| `panelFocusKey` | `alt+t` | Cycle focus between panels |
| `panelCloseKey` | `q` | Close focused panel |
| `panelUnfocusKey` | `escape` | Unfocus panel |

Extension-specific keys follow the same pattern:

```typescript
const MY_KEY   = readSetting<string>("myExtensionKey", "g");
const MY_LABEL = keyLabel(MY_KEY);
```

## Backward Compatibility

`register()` and `wrapComponent()` still exist for extensions that manage their own overlay creation, but `createPanel()` is strongly preferred — it eliminates the 35-line boilerplate dance:

```typescript
// Old (still works)
const component = new MyComponent(panels.theme, panels.tui);
const wrapped   = panels.wrapComponent(PANEL_ID, component);
const handle    = panels.tui.showOverlay(wrapped, { nonCapturing: true, anchor: "right-center", width: "30%", ... });
component.setHandle(handle);
panels.register(PANEL_ID, { handle, invalidate: ..., handleInput: ..., dispose: ..., onClose: ... });

// New (preferred)
panels.createPanel(PANEL_ID, (ctx) => new MyComponent(ctx), { anchor: "right-center", width: "30%" });
```

## Anti-Patterns

- **Don't import dots-panels directly** — use `globalThis[Symbol.for("dot.panels")]`. Direct imports create duplicate state due to jiti module isolation.
- **Don't call `ctx.ui.custom()` yourself for panels** — use `createPanel()`. Direct overlay creation bypasses geometry tracking, smart placement, and collision avoidance.
- **Don't handle Esc, Q, or the focus key in your component** — dots-panels consumes these before your `handleInput` runs.
- **Don't register your own focus shortcut** — dots-panels owns `registerShortcut` for the focus key. Adding another causes conflicts.
- **Don't hardcode key labels in hints** — use `keyHints` so hints update when the user changes keybindings.
