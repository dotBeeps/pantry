/**
 * Panel Chrome — shared border, header, footer, and focus styling for all panel extensions.
 *
 * Eliminates border/pattern duplication across ask.ts, popup.ts, dragon-guard, etc.
 * Focus-aware: renders a distinct border when the panel is focused vs unfocused.
 *
 * A small dog and a large dragon made this together.
 */

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-tui";

// ── Border Patterns ──

const BORDER_PATTERNS = [
	"·~",    // tail wag
	"⋆·",   // hoard sparkle
	"≈~",   // scales & smoke
	"~·",   // smoke & paws
	"⋆~",   // sparkle smoke
	"·⸱",   // pawpad dots
];

const FOCUS_PATTERNS = [
	"═·",   // focused: bold rail + dot
	"━⋆",   // focused: heavy bar + sparkle
	"▸·",   // focused: arrow + dot
];

/** Pick a random border pattern — call once per component instance. */
export function pickBorderPattern(): string {
	return BORDER_PATTERNS[Math.floor(Math.random() * BORDER_PATTERNS.length)]!;
}

/** Pick a random focus-mode border pattern — call once per component instance. */
export function pickFocusPattern(): string {
	return FOCUS_PATTERNS[Math.floor(Math.random() * FOCUS_PATTERNS.length)]!;
}

/** Repeat a pattern to fill a given width. */
export function repeatPattern(pattern: string, width: number): string {
	if (width <= 0) return "";
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
	/** Border pattern for unfocused state (from pickBorderPattern). */
	borderPattern: string;
	/** Border pattern for focused state (from pickFocusPattern). */
	focusPattern: string;
	/** Footer hint text. If omitted, no footer hints rendered. */
	footerHint?: string;
	/** Scroll info text, e.g. "42%". Shown right-aligned in footer. */
	scrollInfo?: string;
}

// ── Chrome Rendering ──

/**
 * Render a themed border line, focus-aware.
 * Focused panels get a distinct pattern + accent color.
 * Unfocused panels get the standard pattern + muted color.
 */
export function renderBorder(width: number, options: ChromeOptions): string {
	const { focused, theme, borderPattern, focusPattern } = options;
	if (focused) {
		return theme.fg("accent", theme.bold(repeatPattern(focusPattern, width)));
	}
	return theme.fg("muted", repeatPattern(borderPattern, width));
}

/**
 * Render a panel header: border + optional title.
 * Returns an array of lines to prepend to panel content.
 */
export function renderHeader(width: number, options: ChromeOptions): string[] {
	const lines: string[] = [];
	lines.push(renderBorder(width, options));
	if (options.title) {
		const titleColor = options.focused ? "accent" : "text";
		const focusMarker = options.focused ? " ⚡" : "";
		lines.push(truncateToWidth(
			options.theme.fg(titleColor, options.theme.bold(` ${options.title}${focusMarker}`)),
			width,
		));
		lines.push("");
	}
	return lines;
}

/**
 * Render a panel footer: optional hints + border.
 * Returns an array of lines to append to panel content.
 */
export function renderFooter(width: number, options: ChromeOptions): string[] {
	const lines: string[] = [];
	const { theme, footerHint, scrollInfo } = options;

	if (footerHint || scrollInfo) {
		lines.push("");
		const left = footerHint ? ` ${footerHint}` : "";
		const right = scrollInfo ? `${scrollInfo} ` : "";
		if (left && right) {
			const padding = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
			lines.push(truncateToWidth(
				theme.fg("dim", left) + " ".repeat(padding) + theme.fg("dim", right),
				width,
			));
		} else {
			lines.push(truncateToWidth(theme.fg("dim", left || right), width));
		}
	}

	lines.push(renderBorder(width, options));
	return lines;
}

/**
 * Wrap content lines in full panel chrome (header + content + footer).
 * Convenience function for simple panels.
 */
export function wrapInChrome(contentLines: string[], width: number, options: ChromeOptions): string[] {
	return [
		...renderHeader(width, options),
		...contentLines,
		...renderFooter(width, options),
	];
}
