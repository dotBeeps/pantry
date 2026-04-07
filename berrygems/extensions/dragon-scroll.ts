/**
 * Dragon Scroll — Markdown popup panels via dragon-parchment.
 *
 * Registers a tool + command for showing scrollable markdown content
 * in a floating panel. Good for documentation, summaries, help text,
 * or anything you want to pin on screen while working.
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown, Text, matchesKey, Key, visibleWidth } from "@mariozechner/pi-tui";
import type { MarkdownTheme } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import {
	renderHeader, renderFooter, padContentLine, contentWidth, getEdges,
} from "../lib/panel-chrome.ts";
import { AnimatedImagePlayer } from "../lib/animated-image-player.ts";
import { resolveImageSize, type ImageFrames } from "../lib/animated-image.ts";
// ── Panel Manager Access ──

const PANELS_KEY = Symbol.for("hoard.parchment");
const KITTY_KEY = Symbol.for("hoard.kitty");
function getKitty(): { loadImage: Function; disposeImage: Function; createMerger: Function } | undefined {
	return (globalThis as any)[KITTY_KEY];
}
const IMAGE_FETCH_KEY = Symbol.for("hoard.imageFetch");
function getImageFetch(): { fetch: (query: string, size?: string) => Promise<any> } | undefined {
	return (globalThis as any)[IMAGE_FETCH_KEY];
}

function getPanels(): any {
	return (globalThis as any)[PANELS_KEY];
}

// ── Schema ──

const PopupParams = Type.Object({
	title: Type.Optional(Type.String({ description: "Panel title (shown in header)" })),
	content: Type.String({ description: "Markdown content to display" }),
	anchor: Type.Optional(StringEnum(
		["top-left", "top-center", "top-right", "left-center", "center", "right-center", "bottom-left", "bottom-center", "bottom-right"] as const,
		{ description: "Screen position. Default: center" },
	)),
	width: Type.Optional(Type.String({ description: "Panel width as number or percentage, e.g. '50%' or '60'. Default: 50%" })),
	id: Type.Optional(Type.String({ description: "Panel ID for updates/closing. Default: auto-generated" })),
	skin: Type.Optional(Type.String({ description: "Panel skin name (e.g. 'ember', 'curvy', 'box'). Default: from settings" })),
});
// Note: gif + gifSize params removed. Embed images inline using markdown syntax:
//   ![alt](giphy:query|size|float)  e.g. ![dragon](giphy:dragon coding|small|right)


// ── Inline Image Support ──

/** Private Use Area marker for inline image placeholders in markdown. */
const IMG_MARKER_PREFIX = "\uE000IMG:";
const IMG_MARKER_SUFFIX = "\uE000";

/** Tag prepended to expanded image placeholder lines so render() can skip padContentLine. */
const IMG_LINE_TAG = "\uE001";
/** Separator inside an IMG_LINE_TAG line: encodes the precomputed terminal column width
 * before the separator, content after. Avoids relying on visibleWidth() for Kitty chars
 * (U+10EEEE placeholder grapheme clusters are private-use and measure 0 in most libs). */
const IMG_WIDTH_SEP = "\uE002";

/** Strip ANSI escape sequences for marker detection in rendered lines. */
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How an inline image is positioned relative to surrounding text. */
type FloatMode = "center" | "left" | "right" | "inline";

const FLOAT_QUALIFIERS: FloatMode[] = ["center", "left", "right", "inline"];
const SIZE_QUALIFIERS = ["tiny", "small", "medium", "large", "huge"];

interface ImageRef {
	alt: string;
	source: string;  // giphy:query, tenor:query, http://..., or file path
	size: string;
	float: FloatMode;
	idx: number;
}

interface InlineImage {
	ref: ImageRef;
	player: AnimatedImagePlayer | null;
	/** Number of placeholder rows this image occupies. Before load: estimated. After: actual. */
	rows: number;
	cols: number;
}

/**
 * Split an ANSI-decorated line at a word boundary at or before leftW visible chars.
 * Returns [leftContent, rightContent, leftVisible] where leftVisible is the actual
 * visible width of the left part (may be < leftW when backing up to a word boundary).
 *
 * Uses \x1b[39m (fg-only reset) instead of \x1b[0m so the panel background colour
 * set by bgWrap() is preserved across the split point.
 */
function splitAtWordBoundary(line: string, leftW: number): [string, string, number] {
	let visible = 0;
	let i = 0;
	let lastSpaceByte = -1;
	let lastSpaceVisible = 0;

	while (i < line.length && visible < leftW) {
		if (line[i] === "\x1b") {
			const end = line.indexOf("m", i);
			if (end !== -1) { i = end + 1; continue; }
		}
		if (line[i] === " ") { lastSpaceByte = i; lastSpaceVisible = visible; }
		visible++;
		i++;
	}

	// If we stopped mid-word and have a prior word boundary, back up to it.
	if (i < line.length && line[i] !== " " && lastSpaceByte !== -1) {
		return [
			line.slice(0, lastSpaceByte) + "\x1b[39m",
			line.slice(lastSpaceByte + 1), // skip the space
			lastSpaceVisible,
		];
	}

	return [line.slice(0, i) + "\x1b[39m", line.slice(i), visible];
}

/**
 * Truncate ANSI-decorated text to exactly maxW visible chars.
 * Unlike truncateToWidth (which appends \x1b[0m...\x1b[0m), this silently
 * cuts and pads with spaces to reach exact width. Uses \x1b[39m (fg-only
 * reset) to preserve the background colour set by bgWrap().
 */
function truncateSilent(str: string, maxW: number): string {
	let visible = 0;
	let i = 0;
	while (i < str.length && visible < maxW) {
		if (str[i] === "\x1b") {
			const end = str.indexOf("m", i);
			if (end !== -1) { i = end + 1; continue; }
		}
		visible++;
		i++;
	}
	return str.slice(0, i) + "\x1b[39m" + " ".repeat(Math.max(0, maxW - visible));
}

/**
 * Extract block-level image references from markdown, replace with markers.
 * Only matches images on their own line (block-level).
 * Skips images inside fenced code blocks (``` or ~~~).
 */
function extractInlineImages(content: string): { processed: string; refs: ImageRef[] } {
	const refs: ImageRef[] = [];
	const lines = content.split("\n");
	let inCodeBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		// Toggle code fence state
		if (/^\s*(`{3,}|~{3,})/.test(line)) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		// Match block-level image: ![alt](source) or ![alt](source|qualifiers)
		// Standard markdown: ![alt](url) — no qualifiers, centered full-width block.
		// Extended: ![alt](url|size) | ![alt](url|float) | ![alt](url|size|float)
		// size: tiny | small | medium | large | huge
		// float: left | right | inline | center
		const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
		if (!match) continue;

		const [, alt, url] = match;
		const idx = refs.length;
		let size = "medium";
		let float: FloatMode = "center";
		let source = url!;

		// Parse | qualifiers — source ends at first |, remaining are qualifiers in any order
		const pipeIdx = url!.indexOf("|");
		if (pipeIdx !== -1) {
			source = url!.slice(0, pipeIdx);
			const qualifiers = url!.slice(pipeIdx + 1).split("|").map(q => q.trim().toLowerCase());
			for (const q of qualifiers) {
				if (SIZE_QUALIFIERS.includes(q)) size = q;
				else if (FLOAT_QUALIFIERS.includes(q as FloatMode)) float = q as FloatMode;
			}
		}

		refs.push({ alt: alt!, source, size, float, idx });
		lines[i] = `${IMG_MARKER_PREFIX}${idx}${IMG_MARKER_SUFFIX}`;
	}

	return { processed: lines.join("\n"), refs };
}

// ── Popup Component ──

interface PopupComponentOptions {
	title?: string;
	content: string;
	panelCtx: any;  // PanelContext from dragon-parchment
}

// Shared image cache across popups — avoids re-fetching the same GIF.
const imageCache = new Map<string, ImageFrames>();

class PopupComponent {
	private title: string;
	private content: string;
	private scrollOffset = 0;
	private cachedLines: string[] | undefined;
	private renderedLines: string[] = [];

	private panelCtx: any;
	private mdTheme: MarkdownTheme;

	// Inline images from markdown ![alt](source|size|float) syntax
	private inlineImages: InlineImage[] = [];
	private processedContent: string = "";

	constructor(options: PopupComponentOptions) {
		this.title = options.title ?? "";
		this.content = options.content;

		this.panelCtx = options.panelCtx;
		this.mdTheme = getMarkdownTheme();

		// Extract and start loading inline images
		this.parseInlineImages();
	}

	/** Dispose all image resources (inline images). */
	disposeAll(): void {
		this.disposeInlineImages();
	}

	// ── Inline Images ──

	/** Parse markdown content for image references, start async loading. */
	private parseInlineImages(): void {
		const { processed, refs } = extractInlineImages(this.content);
		if (refs.length === 0) {
			this.processedContent = this.content;
			return;
		}
		this.processedContent = processed;

		// Create InlineImage entries and start loading
		for (const ref of refs) {
			const [maxCols, maxRows] = resolveImageSize(ref.size);
			const entry: InlineImage = { ref, player: null, rows: maxRows, cols: maxCols };
			this.inlineImages.push(entry);
			this.loadInlineImage(entry, maxCols, maxRows);
		}
	}

	/** Load a single inline image asynchronously. */
	private async loadInlineImage(entry: InlineImage, maxCols: number, maxRows: number): Promise<void> {
		const source = entry.ref.source;
		const cacheKey = `inline:${source}`;

		let imageData = imageCache.get(cacheKey);
		if (!imageData) {
			const imageFetch = getImageFetch();
			imageData = imageFetch ? await imageFetch.fetch(source) ?? undefined : undefined;
			if (!imageData) return;
			imageCache.set(cacheKey, imageData);
		}

		const player = new AnimatedImagePlayer(imageData, { maxCols, maxRows });
		entry.player = player;
		entry.rows = player.rows;
		entry.cols = player.cols;

		setTimeout(() => {
			if (entry.player !== player) return;
			player.transmit();
			player.play(() => {
				this.invalidate();
				this.panelCtx.tui.requestRender();
			});
			this.invalidate();
			this.panelCtx.tui.requestRender();
		}, 0);
	}

	/** Dispose all inline image players. */
	private disposeInlineImages(): void {
		for (const entry of this.inlineImages) {
			entry.player?.dispose();
			entry.player = null;
		}
		this.inlineImages = [];
	}

	/**
	 * Scan rendered markdown lines for image markers and expand them into
	 * placeholder rows, respecting each image's float mode:
	 *
	 * - center (default): centered full-width block, text above/below.
	 * - right: image floats right, following text lines wrap on the left.
	 * - left: image floats left, following text lines wrap on the right.
	 * - inline: image centered, text fills both left and right columns
	 *           simultaneously (bilateral wrap / newspaper column effect).
	 */
	private expandImageMarkers(allLines: string[], innerW: number): string[] {
		const result: string[] = [];
		const theme = this.panelCtx.theme as Theme;
		const kitty = getKitty();
		const markerRe = new RegExp(`${escapeRegex(IMG_MARKER_PREFIX)}(\\d+)${escapeRegex(IMG_MARKER_SUFFIX)}`);

		const isMarkerLine = (l: string) => markerRe.test(l.replace(ANSI_RE, ""));

		let i = 0;
		while (i < allLines.length) {
			const line = allLines[i]!;
			const stripped = line.replace(ANSI_RE, "");
			const markerMatch = stripped.match(markerRe);

			if (!markerMatch) { result.push(line); i++; continue; }

			const idx = parseInt(markerMatch[1]!, 10);
			const entry = this.inlineImages[idx];
			if (!entry) { result.push(line); i++; continue; }

			i++; // advance past marker line

			if (!entry.player) {
				// Not yet loaded — loading placeholder
				result.push(theme.fg("dim", `⏳ Loading image${entry.ref.alt ? `: ${entry.ref.alt}` : ""}...`));
				for (let r = 1; r < entry.rows; r++) result.push("");
				continue;
			}

			const placeholderLines = entry.player.getPlaceholderLines();
			const imgCols = entry.cols;
			const float = entry.ref.float;

			// Helper: push an IMG_LINE_TAG line with precomputed terminal width embedded.
			// render() reads this to avoid calling visibleWidth() on Kitty placeholder chars
			// (U+10EEEE grapheme clusters are private-use and measure 0 in most libs).
			const imgLine = (content: string) => IMG_LINE_TAG + innerW + IMG_WIDTH_SEP + content;

			// 1 cell of breathing room on each side of the image in every float mode.
			const M = 1; // margin cells per side

			if (float === "center") {
				// Centered full-width block — margin ≥ 1 on each side.
				const leftPad = Math.max(M, Math.floor((innerW - imgCols) / 2));
				const rightPad = Math.max(M, innerW - imgCols - leftPad);
				for (const pLine of placeholderLines) {
					result.push(imgLine(" ".repeat(leftPad) + pLine + " ".repeat(rightPad)));
				}

			} else if (float === "right" || float === "left") {
				// Float: image anchored to one edge, text wraps on the opposite side.
				// Tell the merger the available width is innerW - 2*M so the margins
				// fit when we insert them around the image in the assembly step.
				const mergerW = innerW - 2 * M;
				const loaded = { player: entry.player, cols: imgCols, rows: entry.rows };
				const merger = kitty?.createMerger(loaded, mergerW);
				if (!merger) {
					// No kitty renderer — fallback to centered block
					const leftPad = Math.max(M, Math.floor((innerW - imgCols) / 2));
					const rightPad = Math.max(M, innerW - imgCols - leftPad);
					for (const pLine of placeholderLines) result.push(imgLine(" ".repeat(leftPad) + pLine + " ".repeat(rightPad)));
					continue;
				}

				// Consume following lines until image rows exhausted or next marker.
				// merger totals mergerW; we add M on each side of the image → innerW.
				while (merger.hasMore && i < allLines.length) {
					if (isMarkerLine(allLines[i]!)) break;
					const { content, gap, mascot } = merger.nextLine(allLines[i]!);
					result.push(imgLine(
						float === "right"
							? content + " ".repeat(gap) + " " + mascot! + " "
							: " " + mascot! + " " + " ".repeat(gap) + content
					));
					i++;
				}
				// Flush remaining image rows after text content ends.
				for (const { gap, mascot } of merger.flushLines()) {
					result.push(imgLine(
						float === "right"
							? " ".repeat(gap) + " " + mascot! + " "
							: " " + mascot! + " " + " ".repeat(innerW - imgCols - 2 * M)
					));
				}

			} else if (float === "inline") {
				// Bilateral wrap: image centered, text fills both sides simultaneously.
				// M-cell margin on each side of the image; text columns shrink to fit.
				// truncateSilent (not truncateToWidth) to avoid \x1b[0m...\x1b[0m
				// which kills bgWrap's background and shows literal dots at the edge.
				const leftW = Math.max(1, Math.floor((innerW - imgCols - 2 * M) / 2));
				const rightW = Math.max(1, innerW - leftW - imgCols - 2 * M);

				for (let pr = 0; pr < placeholderLines.length; pr++) {
					if (i < allLines.length && !isMarkerLine(allLines[i]!)) {
						const [leftPart, rightPart, leftVisible] = splitAtWordBoundary(allLines[i]!, leftW);
						const leftFill = " ".repeat(Math.max(0, leftW - leftVisible));
						const rightTrunc = truncateSilent(rightPart, rightW);
						result.push(imgLine(leftPart + leftFill + " " + placeholderLines[pr]! + " " + rightTrunc));
						i++;
					} else {
						// No more content — empty columns on both sides
						result.push(imgLine(" ".repeat(leftW + M) + placeholderLines[pr]! + " ".repeat(rightW + M)));
					}
				}
			}
		}
		return result;
	}

	/** Update content (for live-updating popups). */
	setContent(content: string, title?: string): void {
		this.content = content;
		if (title !== undefined) this.title = title;
		this.scrollOffset = 0;
		this.disposeInlineImages();
		this.parseInlineImages();
		this.invalidate();
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.renderedLines = [];
	}

	handleInput(data: string): void {
		const maxScroll = Math.max(0, this.renderedLines.length - this.viewportHeight());

		if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
			if (this.scrollOffset > 0) {
				this.scrollOffset--;
				this.cachedLines = undefined;
				this.panelCtx.tui.requestRender();
			}
		} else if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
			if (this.scrollOffset < maxScroll) {
				this.scrollOffset++;
				this.cachedLines = undefined;
				this.panelCtx.tui.requestRender();
			}
		} else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("u"))) {
			const jump = Math.max(1, this.viewportHeight() - 2);
			this.scrollOffset = Math.max(0, this.scrollOffset - jump);
			this.cachedLines = undefined;
			this.panelCtx.tui.requestRender();
		} else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("d"))) {
			const jump = Math.max(1, this.viewportHeight() - 2);
			this.scrollOffset = Math.min(maxScroll, this.scrollOffset + jump);
			this.cachedLines = undefined;
			this.panelCtx.tui.requestRender();
		} else if (matchesKey(data, "g")) {
			this.scrollOffset = 0;
			this.cachedLines = undefined;
			this.panelCtx.tui.requestRender();
		} else if (matchesKey(data, Key.shift("g")) || data === "G") {
			this.scrollOffset = maxScroll;
			this.cachedLines = undefined;
			this.panelCtx.tui.requestRender();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines) return this.cachedLines;

		const theme = this.panelCtx.theme as Theme;
		const focused = this.panelCtx.isFocused();

		const chromeOpts = {
			title: this.title || undefined,
			focused,
			theme,
			skin: this.panelCtx.skin(),
			footerHint: "",
			scrollInfo: "",
		};

		// Render markdown content (full, then slice for scroll)
		const innerW = contentWidth(width, chromeOpts);
		if (this.renderedLines.length === 0) {
			// For right/left float images, narrow the render width so text wraps
			// naturally around the image area. Inline images use full width (split in post-processing).
			// Use pre-load col estimate (resolveImageSize) so width is stable before images arrive.
			const floatReserve = this.inlineImages
				.filter(img => img.ref.float === "right" || img.ref.float === "left")
				.reduce((max, img) => Math.max(max, img.cols + 1), 0);
			const mdContent = this.inlineImages.length > 0 ? this.processedContent : this.content;
			const md = new Markdown(mdContent, 1, 0, this.mdTheme);
			const rawLines = md.render(innerW - 1 - floatReserve);

			// Expand inline image markers into placeholder rows
			if (this.inlineImages.length > 0) {
				this.renderedLines = this.expandImageMarkers(rawLines, innerW);
			} else {
				this.renderedLines = rawLines;
			}
		}

		// Viewport slicing
		const viewH = this.viewportHeight();
		const maxScroll = Math.max(0, this.renderedLines.length - viewH);
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
		const visible = this.renderedLines.slice(this.scrollOffset, this.scrollOffset + viewH);

		// Render content lines. Inline image placeholder lines (tagged with IMG_LINE_TAG)
		// bypass padContentLine to preserve Kitty placeholder escape sequences intact.
		// Bg and fg are independent SGR attributes — wrapping in bg is safe for Kitty.
		const edges = getEdges(chromeOpts);
		const bgWrap = (s: string) => edges.bg ? theme.bg(edges.bg as any, s) : s;
		const contentLines = visible.map(line => {
			if (line.startsWith(IMG_LINE_TAG)) {
				// Strip the IMG_LINE_TAG (and optional width+sep from earlier encoding).
				// Pad to innerW as a safety net — truncateSilent pads its column, but
				// short source lines (e.g. last line of a paragraph) can still leave
				// the assembled content narrower than innerW.
				const sepIdx = line.indexOf(IMG_WIDTH_SEP, IMG_LINE_TAG.length);
				const imgContent = sepIdx !== -1 ? line.slice(sepIdx + IMG_WIDTH_SEP.length) : line.slice(IMG_LINE_TAG.length);
				const padding = Math.max(0, innerW - visibleWidth(imgContent));
				return bgWrap(edges.left + imgContent + " ".repeat(padding) + edges.right);
			}
			return padContentLine(` ${line}`, width, chromeOpts);
		});

		// Scroll info for footer
		const total = this.renderedLines.length;
		const focusPos = this.panelCtx.focusIndex();
		const focusCounter = focusPos ? ` · ${focusPos.index}/${focusPos.total}` : "";
		if (total > viewH) {
			const pct = Math.round(((this.scrollOffset + viewH) / total) * 100);
			chromeOpts.footerHint = `↑↓/j/k scroll · PgUp/PgDn jump · g/G top/bottom${focusCounter}`;
			chromeOpts.scrollInfo = `${pct}%`;
		} else if (focusPos) {
			chromeOpts.footerHint = focusCounter.slice(3); // trim leading " · "
		}

		const header = renderHeader(width, chromeOpts);
		const footer = renderFooter(width, chromeOpts);

		this.cachedLines = [...header, ...contentLines, ...footer];
		return this.cachedLines;
	}

	private viewportHeight(): number {
		// Terminal rows minus chrome (header, footer, borders, scroll indicator)
		const rows = process.stdout.rows ?? 24;
		const chrome = this.title ? 7 : 5;
		return Math.max(4, Math.floor(rows * 0.6) - chrome);
	}
}

// ── Active Popups ──

const activePopups = new Map<string, PopupComponent>();
let popupCounter = 0;

// ── Extension ──

export default function popup(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "popup",
		label: "Popup",
		description:
			"Show markdown content in a floating popup panel. Use for documentation, summaries, help text, or any content the user might want to keep visible while working. Panels persist until closed.",
		promptSnippet:
			"Show a floating popup panel with markdown content (persists on screen)",
		promptGuidelines: [
			"Use popup for content the user might reference while working \u2014 summaries, checklists, documentation excerpts.",
			"Don't use popup for ephemeral messages \u2014 use notifications for those.",
			"Give each popup a descriptive title. Use the id parameter if you need to update it later.",
		],
		parameters: PopupParams,

		async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, _ctx: ExtensionContext): Promise<any> {
			const panels = getPanels();
			if (!panels) {
				return {
					content: [{ type: "text" as const, text: "Panel manager not available \u2014 dragon-parchment extension required" }],
				details: {},
				};
			}

			const id = params.id ?? `popup-${++popupCounter}`;

			// If this popup ID already exists, update its content
			const existing = activePopups.get(id);
			if (existing) {
				existing.setContent(params.content, params.title);
				if (params.skin) panels.setPanelSkin?.(id, params.skin);
				panels.requestRender();
				return {
					content: [{ type: "text" as const, text: `Updated popup "${params.title ?? id}"` }],
					details: { id, title: params.title, updated: true },
				};
			}

			// Create new popup panel
			// Set per-panel skin if specified
			if (params.skin) panels.setPanelSkin?.(id, params.skin);

			let component: PopupComponent | null = null;
			const result = panels.createPanel(id, (panelCtx: any) => {
				component = new PopupComponent({
					title: params.title,
					content: params.content,
					panelCtx,
				});
				activePopups.set(id, component);
				return {
					render: (w: number) => component!.render(w),
					invalidate: () => component!.invalidate(),
					handleInput: (data: string) => component!.handleInput(data),
					dispose: () => component!.disposeAll(),
				};
			}, {
				anchor: params.anchor ?? "center",
				width: params.width ?? "50%",
				minWidth: 30,
				maxHeight: "70%",
				onClose: () => { activePopups.delete(id); },
			});

			if (!result.success) {
				return {
					content: [{ type: "text" as const, text: `Failed to open popup: ${result.message}` }],
				details: {},
				};
			}

			return {
				content: [{ type: "text" as const, text: `Opened popup "${params.title ?? id}"` }],
				details: { id, title: params.title, anchor: params.anchor ?? "center" },
			};
		},

		renderResult(result, _options, theme, _context) {
			const d = result.details as any;
			if (!d) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}
			const icon = d.updated ? "📜" : "📌";
			const action = d.updated ? "updated" : "pinned";
			return new Text(
				`${icon} ${action}: ` + theme.fg("accent", d.title ?? d.id),
				0, 0,
			);
		},
	});

	// ── Close Tool ──

	pi.registerTool({
		name: "close_popup",
		label: "Close Popup",
		description:
			"Close a popup panel by ID, or close all popup panels. Use when the user is done referencing a popup, or to clean up the screen.",
		promptSnippet:
			"Close a popup panel by ID or close all popups",
		parameters: Type.Object({
			id: Type.Optional(Type.String({ description: "Panel ID to close. Omit to close all popups." })),
		}),

		async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, _ctx: ExtensionContext): Promise<any> {
			const panels = getPanels();
			if (!panels) {
				return { content: [{ type: "text" as const, text: "Panel manager not available" }], details: {} };
			}

			if (params.id) {
				if (!activePopups.has(params.id)) {
					const available = [...activePopups.keys()];
					return {
						content: [{ type: "text" as const, text: `No popup with id "${params.id}". Active: ${available.join(", ") || "(none)"}` }],
					details: {},
					};
				}
				panels.close(params.id);
				activePopups.delete(params.id);
				return {
					content: [{ type: "text" as const, text: `Closed popup: ${params.id}` }],
					details: { id: params.id, action: "closed" },
				};
			}

			// Close all
			const count = activePopups.size;
			for (const popupId of activePopups.keys()) {
				panels.close(popupId);
			}
			activePopups.clear();
			return {
				content: [{ type: "text" as const, text: `Closed ${count} popup(s)` }],
				details: { action: "closed-all", count },
			};
		},

		renderResult(result, _options, theme, _context) {
			const d = result.details as any;
			if (d?.action === "closed-all") {
				return new Text(theme.fg("muted", `🧹 cleared ${d.count} popup(s)`), 0, 0);
			}
			if (d?.action === "closed") {
				return new Text(theme.fg("muted", `✖ closed: ${d.id}`), 0, 0);
			}
			const first = result.content[0];
			return new Text(first?.type === "text" ? first.text : "", 0, 0);
		},
	});

	// ── Events ──

	pi.on("session_switch" as any, async () => { activePopups.clear(); imageCache.clear(); });
	pi.on("session_shutdown", async () => { activePopups.clear(); imageCache.clear(); });

	// ── Commands ──

	pi.registerCommand("popup", {
		description: "Show/manage popup panels",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/);
			const subcmd = parts[0]?.toLowerCase();

			switch (subcmd) {
				case "close": {
					const id = parts[1];
					if (!id) {
						// Close all popups
						for (const popupId of activePopups.keys()) {
							getPanels()?.close(popupId);
						}
						activePopups.clear();
						ctx.ui.notify("Closed all popups", "info");
					} else {
						getPanels()?.close(id);
						activePopups.delete(id);
						ctx.ui.notify(`Closed popup: ${id}`, "info");
					}
					return;
				}
				case "list": {
					const ids = [...activePopups.keys()];
					if (ids.length === 0) {
						ctx.ui.notify("No active popups", "info");
					} else {
						ctx.ui.notify(`Active popups: ${ids.join(", ")}`, "info");
					}
					return;
				}
				default: {
					ctx.ui.notify([
						"📌 Popup Panels",
						"",
						"  /popup close [id]   Close one or all popups",
						"  /popup list         Show active popup IDs",
						"",
						"  The 'popup' tool creates panels from agent responses.",
						"  When focused: ↑↓/j/k scroll, PgUp/PgDn jump, g/G top/bottom",
					].join("\n"), "info");
				}
			}
		},
	});
}
