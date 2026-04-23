/**
 * Panel Chrome — shared border, header, footer, and focus styling for all panel extensions.
 *
 * Eliminates border/pattern duplication across ask.ts, popup.ts, dragon-guard, etc.
 * Focus-aware: renders a distinct border when the panel is focused vs unfocused.
 *
 * A small dog and a large dragon made this together.
 */

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

// ── Panel Skins ──

/**
 * A PanelSkin defines the visual frame for a panel:
 * border characters for each edge, background color, and focused variants.
 *
 * Top/bottom are pattern strings repeated to fill width.
 * Left/right are prepended/appended to each content line.
 * Background is a theme color name for theme.bg().
 */
export interface PanelSkin {
  /** Display name for the skin. */
  name: string;

  // ── Unfocused state ──
  /** Top border pattern, repeated to fill width. Empty = no top border. */
  top: string;
  /** Bottom border pattern, repeated to fill width. Empty = no bottom border. */
  bottom: string;
  /** Left edge character(s) prepended to each content line. */
  left: string;
  /** Right edge character(s) appended to each content line. */
  right: string;
  /** Background color name for theme.bg(). Omit for transparent. */
  bg?: string;
  /** Foreground color name for unfocused border characters. Default: "muted". */
  borderColor?: string;

  // ── Corner characters (optional) ──
  /** Top-left corner (e.g. "╭"). If set, top border fills between corners. */
  topLeft?: string;
  /** Top-right corner (e.g. "╮"). */
  topRight?: string;
  /** Bottom-left corner (e.g. "╰"). */
  bottomLeft?: string;
  /** Bottom-right corner (e.g. "╯"). */
  bottomRight?: string;

  // ── Layout options ──
  /** Render title inline in the top border row (e.g. ╭─ Title ──╮). Requires corners. */
  inlineTitle?: boolean;

  // ── Focused state overrides (falls back to unfocused if omitted) ──
  /** Top border pattern when focused. */
  focusTop?: string;
  /** Bottom border pattern when focused. */
  focusBottom?: string;
  /** Left edge when focused. */
  focusLeft?: string;
  /** Right edge when focused. */
  focusRight?: string;
  /** Background color when focused. */
  focusBg?: string;
  /** Foreground color name for focused border characters. Default: "accent". */
  focusBorderColor?: string;
  /** Focused corner overrides. */
  focusTopLeft?: string;
  focusTopRight?: string;
  focusBottomLeft?: string;
  focusBottomRight?: string;
}

/** Resolve skin fields for the current focus state. */
function resolveSkin(skin: PanelSkin, focused: boolean) {
  const f = focused;
  return {
    top: f ? (skin.focusTop ?? skin.top) : skin.top,
    bottom: f ? (skin.focusBottom ?? skin.bottom) : skin.bottom,
    left: f ? (skin.focusLeft ?? skin.left) : skin.left,
    right: f ? (skin.focusRight ?? skin.right) : skin.right,
    bg: f ? (skin.focusBg ?? skin.bg) : skin.bg,
    borderColor: f
      ? (skin.focusBorderColor ?? "accent")
      : (skin.borderColor ?? "muted"),
    topLeft: (f ? (skin.focusTopLeft ?? skin.topLeft) : skin.topLeft) ?? "",
    topRight: (f ? (skin.focusTopRight ?? skin.topRight) : skin.topRight) ?? "",
    bottomLeft:
      (f ? (skin.focusBottomLeft ?? skin.bottomLeft) : skin.bottomLeft) ?? "",
    bottomRight:
      (f ? (skin.focusBottomRight ?? skin.bottomRight) : skin.bottomRight) ??
      "",
  };
}

// ── Preset Skins ──

export const SKINS = {
  /** Thin left bar, subtle background. The default. */
  ember: {
    name: "ember",
    top: "·~",
    bottom: "·~",
    left: "▎",
    right: "",
    bg: "toolPendingBg",
    focusTop: "═·",
    focusBottom: "═·",
    focusLeft: "▎",
    focusRight: "",
  } satisfies PanelSkin,

  /** Full box-drawing frame. Classic terminal panel feel. */
  box: {
    name: "box",
    top: "─",
    bottom: "─",
    left: "│ ",
    right: " │",
    bg: "toolPendingBg",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: "┃ ",
    focusRight: " ┃",
  } satisfies PanelSkin,

  /** Double-line box. Bold and regal — very dragon. */
  castle: {
    name: "castle",
    top: "═",
    bottom: "═",
    left: "║ ",
    right: " ║",
    bg: "toolPendingBg",
    borderColor: "border",
    focusTop: "═",
    focusBottom: "═",
    focusLeft: "║ ",
    focusRight: " ║",
  } satisfies PanelSkin,

  /** Dots and sparkles. Whimsical vibes. */
  sparkle: {
    name: "sparkle",
    top: "⋆·˚",
    bottom: "˚·⋆",
    left: "⋆ ",
    right: " ⋆",
    bg: "toolPendingBg",
    focusTop: "✦·˚",
    focusBottom: "˚·✦",
    focusLeft: "✦ ",
    focusRight: " ✦",
  } satisfies PanelSkin,

  /** Minimal — background only, no edge characters. */
  ghost: {
    name: "ghost",
    top: "·",
    bottom: "·",
    left: " ",
    right: " ",
    bg: "toolPendingBg",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: " ",
    focusRight: " ",
  } satisfies PanelSkin,

  /** Thick left accent bar. Notion/IDE sidebar feel. */
  gutter: {
    name: "gutter",
    top: "─",
    bottom: "─",
    left: "█ ",
    right: "",
    bg: "toolPendingBg",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: "█ ",
    focusRight: "",
  } satisfies PanelSkin,

  /** Smoke and scales — asymmetric dragon aesthetic. Light smoke top, heavy waves bottom. */
  scales: {
    name: "scales",
    top: "≈~",
    bottom: "≋",
    left: "≋ ",
    right: "",
    bg: "toolPendingBg",
    focusTop: "▓░",
    focusBottom: "░▓",
    focusLeft: "▓ ",
    focusRight: "",
  } satisfies PanelSkin,

  /** Pawprints — for a very small dog. */
  paws: {
    name: "paws",
    top: "·⸱ ",
    bottom: " ⸱·",
    left: "⸱ ",
    right: " ⸱",
    bg: "toolPendingBg",
    focusTop: "•⸱ ",
    focusBottom: " ⸱•",
    focusLeft: "• ",
    focusRight: " •",
  } satisfies PanelSkin,

  /** Clean and sharp. No frills. */
  clean: {
    name: "clean",
    top: "─",
    bottom: "─",
    left: " ",
    right: " ",
    bg: "toolPendingBg",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: " ",
    focusRight: " ",
  } satisfies PanelSkin,

  /** No background, pattern borders only. The original look. */
  bare: {
    name: "bare",
    top: "·~",
    bottom: "·~",
    left: "",
    right: "",
    focusTop: "═·",
    focusBottom: "═·",
  } satisfies PanelSkin,

  // ── Curvy / Rounded ──

  /** Rounded box-drawing corners. Soft and modern. Inline title in border. */
  curvy: {
    name: "curvy",
    top: "─",
    bottom: "─",
    left: "│ ",
    right: " │",
    bg: "toolPendingBg",
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    inlineTitle: true,
    focusTop: "━",
    focusBottom: "━",
    focusLeft: "┃ ",
    focusRight: " ┃",
    focusTopLeft: "╭",
    focusTopRight: "╮",
    focusBottomLeft: "╰",
    focusBottomRight: "╯",
  } satisfies PanelSkin,

  /** Double rounded — curvy corners with double-line sides. Fancy. Inline title. */
  curvyCastle: {
    name: "curvyCastle",
    top: "═",
    bottom: "═",
    left: "║ ",
    right: " ║",
    bg: "toolPendingBg",
    borderColor: "border",
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    inlineTitle: true,
    focusTop: "═",
    focusBottom: "═",
    focusLeft: "║ ",
    focusRight: " ║",
    focusTopLeft: "╭",
    focusTopRight: "╮",
    focusBottomLeft: "╰",
    focusBottomRight: "╯",
  } satisfies PanelSkin,

  // ── Nerdfont ──

  /** Powerline edges. Sleek terminal-native look.  /  */
  powerline: {
    name: "powerline",
    top: "─",
    bottom: "─",
    left: " ",
    right: " ",
    bg: "toolPendingBg",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: " ",
    focusRight: " ",
  } satisfies PanelSkin,

  /** Powerline round. Cloud/bubble effect — inward curves, rounded corners. */
  powerlineRound: {
    name: "powerlineRound",
    top: "─",
    bottom: "─",
    left: " ",
    right: " ",
    bg: "toolPendingBg",
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: " ",
    focusRight: " ",
    focusTopLeft: "╭",
    focusTopRight: "╮",
    focusBottomLeft: "╰",
    focusBottomRight: "╯",
  } satisfies PanelSkin,

  /** Flame edges. Because dragon.  */
  flame: {
    name: "flame",
    top: "",
    bottom: "",
    left: " ",
    right: " ",
    bg: "toolPendingBg",
    focusTop: "",
    focusBottom: "",
    focusLeft: " ",
    focusRight: " ",
  } satisfies PanelSkin,

  /** Pixel/blocky edges. Chunky retro terminal.  /  */
  pixel: {
    name: "pixel",
    top: "▀",
    bottom: "▄",
    left: "▌",
    right: "▐",
    bg: "toolPendingBg",
    borderColor: "border",
    focusTop: "▀",
    focusBottom: "▄",
    focusLeft: "▌",
    focusRight: "▐",
  } satisfies PanelSkin,

  /** Diagonal slash edges with corner mapping. Nerdfont slant glyphs. */
  slash: {
    name: "slash",
    top: "─",
    bottom: "─",
    left: " ",
    right: " ",
    bg: "toolPendingBg",
    topLeft: "",
    topRight: "",
    bottomLeft: "",
    bottomRight: "",
    focusTop: "━",
    focusBottom: "━",
    focusLeft: " ",
    focusRight: " ",
    focusTopLeft: "",
    focusTopRight: "",
    focusBottomLeft: "",
    focusBottomRight: "",
  } satisfies PanelSkin,

  /** Ice crystal edges. Frozen aesthetic. ❈ */
  ice: {
    name: "ice",
    top: "❈·",
    bottom: "·❈",
    left: "❈ ",
    right: " ❈",
    bg: "toolPendingBg",
    focusTop: "✨·",
    focusBottom: "·✨",
    focusLeft: "✨ ",
    focusRight: " ✨",
  } satisfies PanelSkin,

  /** Braille dots. Subtle and unique. For a very small dot. */
  braille: {
    name: "braille",
    top: "⣀⡀",
    bottom: "⠃⠆",
    left: "⢸ ",
    right: " ⠞",
    bg: "toolPendingBg",
    focusTop: "⣿",
    focusBottom: "⣿",
    focusLeft: "⣿ ",
    focusRight: " ⣿",
  } satisfies PanelSkin,
} as const;

export type SkinName = keyof typeof SKINS;

/** Get a skin by name, with fallback to "ember". */
/** Active default skin — swap this to preview different skins. */
let _defaultSkin: SkinName = "ember";

/** Set the default skin used by getSkin() when no name is given. */
export function setDefaultSkin(name: SkinName): void {
  _defaultSkin = name;
}

/** Get a skin by name, with fallback to the current default. */
export function getSkin(name?: string): PanelSkin {
  if (name && name in SKINS) return SKINS[name as SkinName];
  return SKINS[_defaultSkin];
}

/** List all available skin names. */
export function listSkins(): string[] {
  return Object.keys(SKINS);
}

/** Repeat a pattern to fill a given width. */
export function repeatPattern(pattern: string, width: number): string {
  if (width <= 0) return "";
  if (pattern.length === 0) return " ".repeat(width);
  return pattern.repeat(Math.ceil(width / pattern.length)).slice(0, width);
}

// ── Chrome Options ──

export interface ChromeOptions {
  /** Title shown in header. Optional. */
  title?: string;
  /** Is this panel currently focused? Drives border styling. */
  focused?: boolean;
  /** The pi theme for coloring. */
  theme: Theme;
  /** Panel skin — defines borders, edges, background. Default: "ember". */
  skin?: PanelSkin;
  /** Footer hint text. If omitted, no footer hints rendered. */
  footerHint?: string;
  /** Scroll info text, e.g. "42%". Shown right-aligned in footer. */
  scrollInfo?: string;
}

// ── Content Line Helpers ──

/** Get the resolved left/right edge strings and their widths for content lines. */
export function getEdges(options: ChromeOptions): {
  left: string;
  leftW: number;
  right: string;
  rightW: number;
  bg?: string;
} {
  const skin = options.skin ?? SKINS.ember;
  const resolved = resolveSkin(skin, !!options.focused);
  const { theme } = options;
  const color = resolved.borderColor;

  const leftRaw = resolved.left;
  const rightRaw = resolved.right;

  return {
    left: leftRaw ? theme.fg(color as any, leftRaw) : "",
    leftW: leftRaw ? visibleWidth(leftRaw) : 0,
    right: rightRaw ? theme.fg(color as any, rightRaw) : "",
    rightW: rightRaw ? visibleWidth(rightRaw) : 0,
    bg: resolved.bg,
  };
}

/**
 * Get the usable content width inside a panel, accounting for skin edges.
 * Use this to pre-render content (e.g. markdown) at the correct width
 * before passing it to padContentLine().
 */
export function contentWidth(width: number, options: ChromeOptions): number {
  const edges = getEdges(options);
  return width - edges.leftW - edges.rightW;
}

/**
 * Pad a content line to fill the full width with skin edges and background.
 *
 * Applies left edge, truncates content, pads with spaces, appends right edge,
 * then wraps everything in the background color.
 *
 * Use this for every content line inside a panel to get consistent
 * background fill and edge indicators.
 */
export function padContentLine(
  text: string,
  width: number,
  options: ChromeOptions,
): string {
  const { theme } = options;
  const edges = getEdges(options);
  const innerW = width - edges.leftW - edges.rightW;
  const truncated = truncateToWidth(text, innerW);
  const padding = Math.max(0, innerW - visibleWidth(truncated));
  const line = edges.left + truncated + " ".repeat(padding) + edges.right;
  return edges.bg ? theme.bg(edges.bg as any, line) : line;
}

// ── Chrome Rendering ──

/**
 * Render a themed border line (top or bottom), focus-aware.
 * Uses the skin's top/bottom pattern + border color.
 */
export function renderBorder(
  width: number,
  options: ChromeOptions,
  position: "top" | "bottom" = "top",
): string {
  const skin = options.skin ?? SKINS.ember;
  const resolved = resolveSkin(skin, !!options.focused);
  const pattern = position === "top" ? resolved.top : resolved.bottom;
  const color = resolved.borderColor;
  const { theme } = options;

  if (!pattern) return "";

  // Corner characters
  const cornerL = position === "top" ? resolved.topLeft : resolved.bottomLeft;
  const cornerR = position === "top" ? resolved.topRight : resolved.bottomRight;
  const cornerLW = cornerL ? visibleWidth(cornerL) : 0;
  const cornerRW = cornerR ? visibleWidth(cornerR) : 0;
  const fillW = Math.max(0, width - cornerLW - cornerRW);

  const border = cornerL + repeatPattern(pattern, fillW) + cornerR;
  const styled = options.focused
    ? theme.fg(color as any, theme.bold(border))
    : theme.fg(color as any, border);
  // Extend background color to border rows for visual continuity
  return resolved.bg ? theme.bg(resolved.bg as any, styled) : styled;
}

/**
 * Render a panel header: top border + optional title.
 * When skin has `inlineTitle` and corners, renders `╭─ Title ──╮`.
 * Otherwise renders border + title as separate lines.
 */
export function renderHeader(width: number, options: ChromeOptions): string[] {
  const lines: string[] = [];
  const skin = options.skin ?? SKINS.ember;
  const resolved = resolveSkin(skin, !!options.focused);
  const { theme } = options;

  // Inline title: embed in top border row
  if (
    (skin as PanelSkin).inlineTitle &&
    options.title &&
    resolved.topLeft &&
    resolved.topRight
  ) {
    const color = resolved.borderColor;
    const titleColor = options.focused ? "accent" : "text";
    const focusMarker = options.focused ? " ⚡" : "";
    const titleText = ` ${options.title}${focusMarker} `;
    const pattern = resolved.top;

    const cornerLW = visibleWidth(resolved.topLeft);
    const cornerRW = visibleWidth(resolved.topRight);
    // 1 char gap after left corner before title
    const gapW = pattern.length > 0 ? 1 : 0;
    const titleW = visibleWidth(titleText);
    const fillW = Math.max(0, width - cornerLW - cornerRW - gapW - titleW);

    const styledCornerL = theme.fg(
      color as any,
      options.focused ? theme.bold(resolved.topLeft) : resolved.topLeft,
    );
    const styledGap =
      gapW > 0
        ? theme.fg(
            color as any,
            options.focused
              ? theme.bold(repeatPattern(pattern, gapW))
              : repeatPattern(pattern, gapW),
          )
        : "";
    const styledTitle = theme.fg(titleColor, theme.bold(titleText));
    const styledFill = theme.fg(
      color as any,
      options.focused
        ? theme.bold(repeatPattern(pattern, fillW))
        : repeatPattern(pattern, fillW),
    );
    const styledCornerR = theme.fg(
      color as any,
      options.focused ? theme.bold(resolved.topRight) : resolved.topRight,
    );

    const row =
      styledCornerL + styledGap + styledTitle + styledFill + styledCornerR;
    lines.push(resolved.bg ? theme.bg(resolved.bg as any, row) : row);
    lines.push(padContentLine("", width, options));
  } else {
    // Standard: separate border + title lines
    const topBorder = renderBorder(width, options, "top");
    if (topBorder) lines.push(topBorder);

    if (options.title) {
      const titleColor = options.focused ? "accent" : "text";
      const focusMarker = options.focused ? " ⚡" : "";
      lines.push(
        padContentLine(
          theme.fg(titleColor, theme.bold(` ${options.title}${focusMarker}`)),
          width,
          options,
        ),
      );
      lines.push(padContentLine("", width, options));
    }
  }
  return lines;
}

/**
 * Render a panel footer: optional hints + bottom border.
 * Returns an array of lines to append to panel content.
 */
export function renderFooter(width: number, options: ChromeOptions): string[] {
  const lines: string[] = [];
  const { theme, footerHint, scrollInfo } = options;

  if (footerHint || scrollInfo) {
    lines.push(padContentLine("", width, options));
    const left = footerHint ? ` ${footerHint}` : "";
    const right = scrollInfo ? `${scrollInfo} ` : "";
    if (left && right) {
      const edges = getEdges(options);
      const innerW = width - edges.leftW - edges.rightW;
      const pad = Math.max(
        1,
        innerW - visibleWidth(left) - visibleWidth(right),
      );
      const content =
        edges.left +
        theme.fg("dim", left) +
        " ".repeat(pad) +
        theme.fg("dim", right) +
        edges.right;
      lines.push(edges.bg ? theme.bg(edges.bg as any, content) : content);
    } else {
      lines.push(
        padContentLine(theme.fg("dim", left || right), width, options),
      );
    }
  }

  const bottomBorder = renderBorder(width, options, "bottom");
  if (bottomBorder) lines.push(bottomBorder);
  return lines;
}

/**
 * Wrap content lines in full panel chrome (header + content + footer).
 * Convenience function for simple panels.
 */
export function wrapInChrome(
  contentLines: string[],
  width: number,
  options: ChromeOptions,
): string[] {
  return [
    ...renderHeader(width, options),
    ...contentLines.map((line) => padContentLine(line, width, options)),
    ...renderFooter(width, options),
  ];
}
