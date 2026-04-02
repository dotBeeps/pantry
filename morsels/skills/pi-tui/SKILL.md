---
name: pi-tui
description: "Build custom TUI components for pi extensions — overlays, widgets, footers, custom editors. Use when creating interactive terminal UI, rendering custom tool output, building overlay panels, or replacing the input editor."
---

# Pi TUI Components

Build interactive terminal UI for pi extensions. Covers the component contract, built-in components, overlays, theming, and rendering rules.

For the full API source, read `/opt/pi-coding-agent/docs/tui.md`. For copy-paste patterns, see the `extension-designer` skill's `references/tui-patterns.md`.

## Component Contract

Every component implements three methods:

```typescript
interface Component {
	render(width: number): string[];   // Lines — each MUST NOT exceed width
	handleInput?(data: string): void;  // Keyboard input when focused
	invalidate(): void;                // Clear cached state — rebuild themed content here
}
```

**Critical rules:**
- Each line from `render()` must not exceed `width` — use `truncateToWidth()` for ANSI-safe truncation
- Cache rendered output; clear in `invalidate()`. Call `tui.requestRender()` after state changes in `handleInput`
- Theme can change at any time — rebuild themed strings in `invalidate()`, never at construction

## Built-in Components

Import from `@mariozechner/pi-tui`:

| Component | Purpose |
|-----------|---------|
| `Text` | Multi-line text with word wrapping. `new Text(content, paddingX, paddingY, bgFn?)` |
| `Box` | Container with padding and background. `new Box(paddingX, paddingY, bgFn)` |
| `Container` | Groups children vertically. `addChild()`, `removeChild()`, `clear()` |
| `Spacer` | Empty vertical space. `new Spacer(lines)` |
| `Markdown` | Rendered markdown with syntax highlighting |
| `Image` | Terminal images (Kitty, iTerm2, Ghostty, WezTerm) |
| `SelectList` | Searchable selection list with theming |
| `SettingsList` | Toggle/cycle settings with optional search |
| `Input` | Single-line text input with cursor |
| `Editor` | Multi-line text editor |

Import from `@mariozechner/pi-coding-agent`:

| Component | Purpose |
|-----------|---------|
| `DynamicBorder` | Themed horizontal divider. `new DynamicBorder((s: string) => theme.fg("accent", s))` |
| `BorderedLoader` | Spinner with border, escape-to-cancel. For async operations |
| `CustomEditor` | Base class for custom editors — extend this, not `Editor` |

## Keyboard Input

```typescript
import { matchesKey, Key } from "@mariozechner/pi-tui";

handleInput(data: string): void {
	if (matchesKey(data, Key.up)) { /* ... */ }
	if (matchesKey(data, Key.enter)) { /* ... */ }
	if (matchesKey(data, Key.escape)) { /* ... */ }
	if (matchesKey(data, Key.ctrl("c"))) { /* ... */ }
	if (matchesKey(data, "shift+tab")) { /* string format works too */ }
}
```

## Overlays

Render floating components on top of existing content:

```typescript
const result = await ctx.ui.custom<ResultType | null>(
	(tui, theme, keybindings, done) => new MyComponent(theme, done),
	{
		overlay: true,
		overlayOptions: {
			anchor: "center",       // 9 positions
			width: "60%",           // number or percentage
			maxHeight: "80%",
			minWidth: 40,
			margin: 2,
			visible: (w, h) => w >= 80,  // responsive hide
		},
		onHandle: (handle) => {
			// handle.setHidden(true/false) — programmatic visibility
		},
	}
);
```

**Nine anchors:** `center`, `top-left`, `top-center`, `top-right`, `left-center`, `right-center`, `bottom-left`, `bottom-center`, `bottom-right`.

**Lifecycle:** Overlay components are disposed when closed. Don't reuse references — create fresh instances each time. Always call `done()` in all exit paths.

## Persistent UI Elements

These persist across renders without blocking input:

```typescript
// Footer status (shows in extension status area)
ctx.ui.setStatus("my-ext", theme.fg("accent", "● active"));
ctx.ui.setStatus("my-ext", undefined);  // clear

// Widget above editor (default) or below
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
ctx.ui.setWidget("my-widget", lines, { placement: "belowEditor" });
ctx.ui.setWidget("my-widget", undefined);  // clear

// Custom footer (replaces built-in entirely)
ctx.ui.setFooter((tui, theme, footerData) => ({
	render(width) { return [/* lines */]; },
	invalidate() {},
	dispose: footerData.onBranchChange(() => tui.requestRender()),
}));
ctx.ui.setFooter(undefined);  // restore default
```

## Custom Editors

Extend `CustomEditor` (not `Editor`) to get app keybindings for free:

```typescript
import { CustomEditor } from "@mariozechner/pi-coding-agent";

class VimEditor extends CustomEditor {
	private mode: "normal" | "insert" = "insert";

	handleInput(data: string): void {
		if (matchesKey(data, "escape") && this.mode === "insert") {
			this.mode = "normal";
			return;
		}
		if (this.mode === "normal" && data === "i") {
			this.mode = "insert";
			return;
		}
		super.handleInput(data);  // App keybindings + text editing
	}
}

// Register via factory
ctx.ui.setEditorComponent((_tui, theme, keybindings) => new VimEditor(theme, keybindings));
ctx.ui.setEditorComponent(undefined);  // restore default
```

## Custom Tool Rendering

Tools can provide `renderCall` and `renderResult` for custom TUI display:

```typescript
pi.registerTool({
	name: "my_tool",
	// ...
	renderCall(args, theme, context) {
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		text.setText(theme.fg("toolTitle", theme.bold("my_tool ")) + theme.fg("muted", args.action));
		return text;
	},
	renderResult(result, { expanded, isPartial }, theme, context) {
		if (isPartial) return new Text(theme.fg("warning", "Processing..."), 0, 0);
		let content = theme.fg("success", "✓ Done");
		if (expanded && result.details?.items) {
			content += "\n" + result.details.items.map(i => "  " + theme.fg("dim", i)).join("\n");
		}
		return new Text(content, 0, 0);
	},
});
```

**Rules:** Use `Text` with padding `(0, 0)` — the Box handles padding. Handle `isPartial` for streaming. Support `expanded` for detail on demand. Reuse `context.lastComponent` when possible.

## Theming

**Never import theme at module level.** Use `theme` from callbacks.

```typescript
// Foreground: theme.fg(color, text)
theme.fg("accent", text)    // Highlights
theme.fg("success", text)   // Green
theme.fg("error", text)     // Red
theme.fg("warning", text)   // Yellow
theme.fg("muted", text)     // Secondary
theme.fg("dim", text)       // Tertiary
theme.fg("border", text)    // Border lines
theme.fg("toolTitle", text) // Tool names

// Background: theme.bg(color, text)
theme.bg("selectedBg", text)
theme.bg("toolPendingBg", text)

// Styles
theme.bold(text)
theme.italic(text)
```

## Invalidation Pattern

Components that pre-bake theme colors must rebuild content when `invalidate()` is called:

```typescript
class ThemedComponent extends Container {
	private message: string;
	private content: Text;

	constructor(message: string) {
		super();
		this.message = message;
		this.content = new Text("", 1, 0);
		this.addChild(this.content);
		this.rebuild();
	}

	private rebuild(): void {
		this.content.setText(theme.fg("accent", this.message));
	}

	override invalidate(): void {
		super.invalidate();
		this.rebuild();  // Rebuild with new theme
	}
}
```

**When this matters:** Pre-baking colors with `theme.fg()`/`theme.bg()`, syntax highlighting, complex layouts with embedded theme colors. **Not needed for:** theme callbacks passed as functions, stateless render without caching.

## IME Support (Focusable)

Components with text cursors (Input, Editor) implement `Focusable` for IME positioning:

```typescript
import { CURSOR_MARKER, type Focusable } from "@mariozechner/pi-tui";

class MyInput implements Component, Focusable {
	focused: boolean = false;
	render(width: number): string[] {
		const marker = this.focused ? CURSOR_MARKER : "";
		return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
	}
}
```

Containers with embedded inputs must propagate the `focused` property to child inputs for correct IME cursor positioning.

## Anti-Patterns

- **Lines exceeding `width`** — always use `truncateToWidth()`, never slice strings with ANSI codes
- **Caching themed strings forever** — rebuild in `invalidate()` when theme changes
- **Importing theme at module level** — use `theme` from callbacks
- **Missing `done()` calls** — leaks overlay UI state; call in all exit paths (escape, cancel, confirm)
- **Reusing disposed overlay references** — create fresh instances each time
- **Not checking `ctx.hasUI`** — returns false in print/JSON modes; UI calls are no-ops there
- **Untyped DynamicBorder param** — write `(s: string) =>` not `(s) =>`; TypeScript needs the annotation
