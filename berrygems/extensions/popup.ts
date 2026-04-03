/**
 * Popup — Markdown popup panels via dots-panels.
 *
 * Registers a tool + command for showing scrollable markdown content
 * in a floating panel. Good for documentation, summaries, help text,
 * or anything you want to pin on screen while working.
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Markdown, Text, matchesKey, Key, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { TUI, Theme, MarkdownTheme } from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import {
	pickBorderPattern, pickFocusPattern,
	renderHeader, renderFooter, renderBorder,
} from "../lib/panel-chrome.ts";

// ── Panel Manager Access ──

const PANELS_KEY = Symbol.for("dot.panels");
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
});

type PopupInput = Static<typeof PopupParams>;

// ── Popup Component ──

interface PopupComponentOptions {
	title?: string;
	content: string;
	panelCtx: any;  // PanelContext from dots-panels
}

class PopupComponent {
	private title: string;
	private content: string;
	private scrollOffset = 0;
	private cachedLines: string[] | undefined;
	private renderedLines: string[] = [];
	private borderPattern: string;
	private focusPattern: string;
	private panelCtx: any;
	private mdTheme: MarkdownTheme;

	constructor(options: PopupComponentOptions) {
		this.title = options.title ?? "";
		this.content = options.content;
		this.borderPattern = pickBorderPattern();
		this.focusPattern = pickFocusPattern();
		this.panelCtx = options.panelCtx;
		this.mdTheme = getMarkdownTheme();
	}

	/** Update content (for live-updating popups). */
	setContent(content: string, title?: string): void {
		this.content = content;
		if (title !== undefined) this.title = title;
		this.scrollOffset = 0;
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
		} else if (matchesKey(data, Key.shift("g")) || matchesKey(data, "G")) {
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
			borderPattern: this.borderPattern,
			focusPattern: this.focusPattern,
			footerHint: "",
			scrollInfo: "",
		};

		// Render markdown content (full, then slice for scroll)
		if (this.renderedLines.length === 0) {
			const md = new Markdown(this.content, 1, 0, this.mdTheme);
			this.renderedLines = md.render(width - 2);
		}

		// Viewport slicing
		const viewH = this.viewportHeight();
		const maxScroll = Math.max(0, this.renderedLines.length - viewH);
		this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
		const visible = this.renderedLines.slice(this.scrollOffset, this.scrollOffset + viewH);

		const contentLines = visible.map(line => truncateToWidth(` ${line}`, width));

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

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const panels = getPanels();
			if (!panels) {
				return {
					content: [{ type: "text" as const, text: "Panel manager not available \u2014 dots-panels extension required" }],
				};
			}

			const id = params.id ?? `popup-${++popupCounter}`;

			// If this popup ID already exists, update its content
			const existing = activePopups.get(id);
			if (existing) {
				existing.setContent(params.content, params.title);
				panels.requestRender();
				return {
					content: [{ type: "text" as const, text: `Updated popup "${params.title ?? id}"` }],
					details: { id, title: params.title, updated: true },
				};
			}

			// Create new popup panel
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

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const panels = getPanels();
			if (!panels) {
				return { content: [{ type: "text" as const, text: "Panel manager not available" }] };
			}

			if (params.id) {
				if (!activePopups.has(params.id)) {
					const available = [...activePopups.keys()];
					return {
						content: [{ type: "text" as const, text: `No popup with id "${params.id}". Active: ${available.join(", ") || "(none)"}` }],
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
