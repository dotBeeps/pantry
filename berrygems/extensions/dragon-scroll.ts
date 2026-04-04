/**
 * Dragon Scroll — Markdown popup panels via hoard-gallery.
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
import { fetchGiphyImage, fetchImageFromSource } from "../lib/giphy-source.ts";

// ── Panel Manager Access ──

const PANELS_KEY = Symbol.for("hoard.gallery");
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
	gif: Type.Optional(Type.String({ description: "GIF search query or vibe keyword for an animated mascot (e.g. 'furry coding', 'dragon sleeping'). Searches Giphy for a matching animated sticker." })),
	gifSize: Type.Optional(StringEnum(
		["tiny", "small", "medium", "large", "huge"] as const,
		{ description: "GIF size: tiny, small, medium (default), large, huge" },
	)),
});


// ── Inline Image Support ──

/** Private Use Area marker for inline image placeholders in markdown. */
const IMG_MARKER_PREFIX = "\uE000IMG:";
const IMG_MARKER_SUFFIX = "\uE000";

/** Tag prepended to expanded image placeholder lines so render() can skip padContentLine. */
const IMG_LINE_TAG = "\uE001";

/** Strip ANSI escape sequences for marker detection in rendered lines. */
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ImageRef {
	alt: string;
	source: string;  // giphy:query, http://..., or file path
	size: string;
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

		// Match block-level image: ![alt](source) or ![alt](source|size)
		const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
		if (!match) continue;

		const [, alt, url] = match;
		const idx = refs.length;
		let size = "medium";
		let source = url!;
		const pipeIdx = url!.lastIndexOf("|");
		if (pipeIdx !== -1) {
			const sizePart = url!.slice(pipeIdx + 1).trim().toLowerCase();
			if (["tiny", "small", "medium", "large", "huge"].includes(sizePart)) {
				size = sizePart;
				source = url!.slice(0, pipeIdx);
			}
		}
		refs.push({ alt: alt!, source, size, idx });
		lines[i] = `${IMG_MARKER_PREFIX}${idx}${IMG_MARKER_SUFFIX}`;
	}

	return { processed: lines.join("\n"), refs };
}

// ── Popup Component ──

interface PopupComponentOptions {
	title?: string;
	content: string;
	panelCtx: any;  // PanelContext from hoard-gallery
	gifQuery?: string;
	gifSize?: string;
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

	// GIF mascot (top-right corner image from tool params)
	private mascot: AnimatedImagePlayer | null = null;
	private gifMaxW: number;
	private gifMaxH: number;

	// Inline images from markdown ![alt](source) syntax
	private inlineImages: InlineImage[] = [];
	private processedContent: string = "";

	constructor(options: PopupComponentOptions) {
		this.title = options.title ?? "";
		this.content = options.content;

		this.panelCtx = options.panelCtx;
		this.mdTheme = getMarkdownTheme();

		const [maxW, maxH] = resolveImageSize(options.gifSize);
		this.gifMaxW = maxW;
		this.gifMaxH = maxH;

		if (options.gifQuery) {
			this.loadGif(options.gifQuery);
		}

		// Extract and start loading inline images
		this.parseInlineImages();
	}

	// ── GIF Loading ──

	private async loadGif(query: string): Promise<void> {
		const cached = imageCache.get(query);
		if (cached) { this.setupGif(cached); return; }

		const imageData = await fetchGiphyImage(query);
		if (!imageData) return;
		imageCache.set(query, imageData);
		this.setupGif(imageData);
	}

	private setupGif(imageData: ImageFrames): void {
		this.disposeGif();
		const player = new AnimatedImagePlayer(imageData, { maxCols: this.gifMaxW, maxRows: this.gifMaxH });
		this.mascot = player;

		// Microtask delay avoids racing with the TUI's current render cycle.
		// Transmit first frame explicitly, then start playback for animation.
		setTimeout(() => {
			if (this.mascot !== player) return;
			// Transmit initial frame to Kitty memory
			player.transmit();
			// Start auto-advance for animated images
			player.play(() => {
				this.invalidate();
				this.panelCtx.tui.requestRender();
			});
			// Re-render to show placeholder characters
			this.invalidate();
			this.panelCtx.tui.requestRender();
		}, 0);
	}

	disposeGif(): void {
		if (this.mascot) {
			this.mascot.dispose();
			this.mascot = null;
		}
	}

	/** Dispose all image resources (mascot + inline). */
	disposeAll(): void {
		this.disposeGif();
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
			if (source.startsWith("giphy:")) {
				imageData = await fetchGiphyImage(source.slice(6)) ?? undefined;
			} else {
				imageData = await fetchImageFromSource(source) ?? undefined;
			}
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
	 * placeholder rows. If the image isn't loaded yet, inserts a loading
	 * placeholder. If loaded, inserts the Kitty placeholder lines centered.
	 */
	private expandImageMarkers(lines: string[], innerW: number): string[] {
		const result: string[] = [];
		const theme = this.panelCtx.theme as Theme;

		for (const line of lines) {
			// Strip ANSI to detect marker in rendered text
			const stripped = line.replace(ANSI_RE, "");
			const markerMatch = stripped.match(new RegExp(`${escapeRegex(IMG_MARKER_PREFIX)}(\\d+)${escapeRegex(IMG_MARKER_SUFFIX)}`));

			if (!markerMatch) {
				result.push(line);
				continue;
			}

			const idx = parseInt(markerMatch[1]!, 10);
			const entry = this.inlineImages[idx];
			if (!entry) {
				result.push(line);
				continue;
			}

			if (entry.player) {
				// Image loaded — insert centered placeholder rows tagged for special rendering
				const placeholderLines = entry.player.getPlaceholderLines();
				const imgW = entry.cols;
				const leftPad = Math.max(0, Math.floor((innerW - imgW) / 2));
				const rightPad = Math.max(0, innerW - imgW - leftPad);
				for (const pLine of placeholderLines) {
					// Tag with IMG_LINE_TAG so render() bypasses padContentLine
					result.push(IMG_LINE_TAG + " ".repeat(leftPad) + pLine + " ".repeat(rightPad));
				}
			} else {
				// Image still loading — show loading indicator
				const loadingText = theme.fg("dim", `⏳ Loading image${entry.ref.alt ? `: ${entry.ref.alt}` : ""}...`);
				result.push(loadingText);
				// Reserve space for the image (estimated rows)
				for (let r = 1; r < entry.rows; r++) result.push("");
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
			const mascotReserve = this.mascot ? (this.mascot.cols + 1) : 0; // +1 for gap column
			const mdContent = this.inlineImages.length > 0 ? this.processedContent : this.content;
			const md = new Markdown(mdContent, 1, 0, this.mdTheme);
			// Render markdown at inner width minus leading-space prefix, minus mascot reserve.
			// This lets text wrap naturally around the GIF area instead of being truncated.
			const rawLines = md.render(innerW - 1 - mascotReserve);

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

		// Build mascot placeholder lines if we have a GIF
		const mascotLines = this.mascot ? this.mascot.getPlaceholderLines() : [];
		const mascotW = this.mascot?.cols ?? 0;
		let mascotRow = 0;

		// Merge content lines with GIF mascot (top-right aligned).
		// Build mascot-merged lines manually with edges + bg wrapping instead of
		// padContentLine, which truncates in ways that break placeholder escape
		// sequences. Bg and fg are independent SGR attributes, so wrapping the
		// entire line (including mascot placeholders) in bg is safe — Kitty reads
		// the fg color to identify the image, bg doesn't interfere.
		const edges = getEdges(chromeOpts);
		const bgWrap = (s: string) => edges.bg ? theme.bg(edges.bg as any, s) : s;
		const contentLines = visible.map(line => {
			// Inline image placeholder lines: tagged with IMG_LINE_TAG, already correct width.
			// Build manually with edges + bg to avoid padContentLine breaking escape sequences.
			if (line.startsWith(IMG_LINE_TAG)) {
				const imgContent = line.slice(IMG_LINE_TAG.length);
				const padding = Math.max(0, innerW - visibleWidth(imgContent));
				const merged = edges.left + imgContent + " ".repeat(padding) + edges.right;
				return bgWrap(merged);
			}

			const padded = ` ${line}`;
			if (mascotRow < mascotLines.length && mascotW > 0) {
				// Content already rendered at narrower width — just pad to fill the gap
				const gap = Math.max(0, innerW - visibleWidth(padded) - mascotW);
				const merged = edges.left + padded + " ".repeat(gap) + mascotLines[mascotRow]! + edges.right;
				mascotRow++;
				return bgWrap(merged);
			}
			// Normal content lines: padContentLine handles truncation + edges + bg
			return padContentLine(padded, width, chromeOpts);
		});

		// Flush remaining mascot rows if mascot is taller than visible content
		while (mascotRow < mascotLines.length) {
			const gap = Math.max(0, innerW - mascotW);
			const merged = edges.left + " ".repeat(gap) + mascotLines[mascotRow]! + edges.right;
			contentLines.push(bgWrap(merged));
			mascotRow++;
		}

		// Scroll info for footer
		const total = this.renderedLines.length;
		if (total > viewH) {
			const pct = Math.round(((this.scrollOffset + viewH) / total) * 100);
			chromeOpts.footerHint = "↑↓/j/k scroll · PgUp/PgDn jump · g/G top/bottom";
			chromeOpts.scrollInfo = `${pct}%`;
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
					content: [{ type: "text" as const, text: "Panel manager not available \u2014 hoard-gallery extension required" }],
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
					gifQuery: params.gif,
					gifSize: params.gifSize,
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

	pi.on("session_switch", async () => { activePopups.clear(); imageCache.clear(); });
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
