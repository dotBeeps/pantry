# TUI Patterns Reference

Copy-paste patterns for common extension UI needs.

## Pattern 1: Selection Dialog (SelectList)

```typescript
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

const items: SelectItem[] = [
  { value: "opt1", label: "Option 1", description: "First option" },
  { value: "opt2", label: "Option 2" },
];

const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
  const container = new Container();
  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  container.addChild(new Text(theme.fg("accent", theme.bold("Pick")), 1, 0));

  const selectList = new SelectList(items, Math.min(items.length, 10), {
    selectedPrefix: (t) => theme.fg("accent", t),
    selectedText: (t) => theme.fg("accent", t),
    description: (t) => theme.fg("muted", t),
    scrollInfo: (t) => theme.fg("dim", t),
    noMatch: (t) => theme.fg("warning", t),
  });
  selectList.onSelect = (item) => done(item.value);
  selectList.onCancel = () => done(null);
  container.addChild(selectList);
  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

  return {
    render: (w) => container.render(w),
    invalidate: () => container.invalidate(),
    handleInput: (data) => { selectList.handleInput(data); tui.requestRender(); },
  };
});
```

## Pattern 2: Async with Cancel (BorderedLoader)

```typescript
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
  const loader = new BorderedLoader(tui, theme, "Loading...");
  loader.onAbort = () => done(null);

  doAsyncWork(loader.signal)
    .then((data) => done(data))
    .catch(() => done(null));

  return loader;
});
```

## Pattern 3: Overlay (Popover)

```typescript
const result = await ctx.ui.custom<ResultType | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent(theme, done),
  {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      width: "60%",
      maxHeight: "80%",
      minWidth: 40,
      margin: 2,
    },
  }
);
```

### Overlay Positioning Options

| Option | Type | Description |
|--------|------|-------------|
| `width` | `number \| string` | Width in columns or percentage |
| `minWidth` | `number` | Minimum width |
| `maxHeight` | `number \| string` | Max height |
| `anchor` | `string` | Position: `center`, `top-left`, `top-center`, `top-right`, `left-center`, `right-center`, `bottom-left`, `bottom-center`, `bottom-right` |
| `offsetX` / `offsetY` | `number` | Offset from anchor |
| `margin` | `number \| object` | Margin from edges |
| `visible` | `(w, h) => boolean` | Responsive visibility |

## Pattern 4: Interactive Custom Component

```typescript
class MyComponent {
  private selected = 0;
  private items: string[];
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    items: string[],
    private theme: Theme,
    private done: (result: string | null) => void,
  ) {
    this.items = items;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selected > 0) {
      this.selected--;
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.selected < this.items.length - 1) {
      this.selected++;
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      this.done(this.items[this.selected]);
    } else if (matchesKey(data, Key.escape)) {
      this.done(null);
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    this.cachedLines = this.items.map((item, i) => {
      const prefix = i === this.selected ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

## Pattern 5: Widget (Persistent Above/Below Editor)

```typescript
// Themed widget above editor
ctx.ui.setWidget("my-widget", (_tui, theme) => {
  const lines = items.map((item) =>
    item.done
      ? theme.fg("success", "✓ ") + theme.fg("muted", item.text)
      : theme.fg("dim", "○ ") + item.text
  );
  return { render: () => lines, invalidate: () => {} };
});

// Below editor
ctx.ui.setWidget("my-widget", ["Line 1"], { placement: "belowEditor" });

// Clear
ctx.ui.setWidget("my-widget", undefined);
```

## Pattern 6: Status Footer

```typescript
ctx.ui.setStatus("my-ext", theme.fg("accent", "● active"));
ctx.ui.setStatus("my-ext", undefined); // Clear
```

## Pattern 7: Settings Toggles

```typescript
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { SettingsList, type SettingItem } from "@mariozechner/pi-tui";

const items: SettingItem[] = [
  { id: "verbose", label: "Verbose", currentValue: "off", values: ["on", "off"] },
];

const settingsList = new SettingsList(
  items, Math.min(items.length + 2, 15),
  getSettingsListTheme(),
  (id, newValue) => { /* handle change */ },
  () => done(undefined),
  { enableSearch: true },
);
```

## Keyboard Input

```typescript
import { matchesKey, Key } from "@mariozechner/pi-tui";

// Named keys
matchesKey(data, Key.enter)
matchesKey(data, Key.escape)
matchesKey(data, Key.up) / Key.down / Key.left / Key.right
matchesKey(data, Key.tab) / Key.backspace / Key.delete / Key.home / Key.end

// Modifiers
matchesKey(data, Key.ctrl("c"))
matchesKey(data, Key.shift("tab"))
matchesKey(data, Key.alt("left"))

// String format also works
matchesKey(data, "ctrl+c")
```

## Theme Colors

### Foreground — `theme.fg(color, text)`

| Category | Colors |
|----------|--------|
| General | `text`, `accent`, `muted`, `dim` |
| Status | `success`, `error`, `warning` |
| Borders | `border`, `borderAccent`, `borderMuted` |
| Tools | `toolTitle`, `toolOutput` |
| Markdown | `mdHeading`, `mdLink`, `mdCode`, `mdCodeBlock` |

### Background — `theme.bg(color, text)`

`selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`

### Text Styles

`theme.bold(text)`, `theme.italic(text)`, `theme.strikethrough(text)`
