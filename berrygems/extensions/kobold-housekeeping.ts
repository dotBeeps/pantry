/**
 * Todo Panels Extension — Persistent floating panels for .pi/todos
 *
 * Features:
 * - Non-blocking, non-capturing overlay panels showing todos grouped by tag
 * - Focus cycling via Alt+T — panels capture keyboard input only when focused
 * - Backed by pi's built-in `.pi/todos` file system (no session state)
 * - Agent-callable `todo_panel` tool for opening, closing, focusing, and layout
 * - `/todos` command for user panel management
 * - Auto-refreshes when the built-in `todo` tool modifies files
 * - Animated GIF mascots (Unicode placeholders + Kitty virtual placements)
 *
 * A small dog and a large dragon made this together.
 */

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { IMAGE_SIZES, resolveImageSize, type ImageFrames } from "../lib/animated-image.ts";
const IMAGE_FETCH_KEY = Symbol.for("hoard.imageFetch");
function getImageFetch(): { fetch: Function; vibeQuery: Function; clearCache: Function } | undefined {
	return (globalThis as any)[IMAGE_FETCH_KEY];
}

// ── Panel Manager Access ──
// dragon-parchment API is published to globalThis by dragon-parchment.ts extension.
// No direct imports — avoids jiti module isolation issues.
const PANELS_KEY = Symbol.for("hoard.parchment");
const KITTY_KEY = Symbol.for("hoard.kitty");
function getPanels(): any { return (globalThis as any)[PANELS_KEY]; }
function getKitty(): { loadImage: Function; disposeImage: Function; createMerger: Function } | undefined {
	return (globalThis as any)[KITTY_KEY];
}

/** Local mirror of LoadedImage shape — no cross-extension import. */
interface LoadedImage { player: { dispose(): void }; cols: number; rows: number; }

// ── Types ──

interface TodoFile {
	id: string;
	title: string;
	tags: string[];
	status: string;
	created_at: string;
	body: string;
	assigned?: string;
}

interface PanelContext {
	tui: TUI;
	theme: Theme;
	cwd: string;
	isFocused: () => boolean;
	focusIndex: () => { index: number; total: number } | null;
}



// ── Constants ──

const DEFAULT_WIDTH = "30%";
const DEFAULT_MIN_WIDTH = 30;
const DEFAULT_MAX_HEIGHT = "90%";
// ── Module-level ExtensionContext ref ──
// Set once during session_start — dragon-image-fetch also tracks this internally,
// but kobold-housekeeping keeps a ref for direct vibeQuery() calls.
let extCtxRef: ExtensionContext | null = null;

// ── Todo File I/O ──

function getTodosDir(cwd: string): string { return join(cwd, ".pi", "todos"); }

function parseTodoFile(content: string, filename: string): TodoFile | null {
	try {
		const firstBrace = content.indexOf("{");
		if (firstBrace === -1) return null;
		let depth = 0, endBrace = -1;
		for (let i = firstBrace; i < content.length; i++) {
			if (content[i] === "{") depth++;
			else if (content[i] === "}") { depth--; if (depth === 0) { endBrace = i; break; } }
		}
		if (endBrace === -1) return null;
		const meta = JSON.parse(content.slice(firstBrace, endBrace + 1));
		const body = content.slice(endBrace + 1).trim();
		return {
			id: meta.id ?? filename.replace(/\.md$/, ""),
			title: meta.title ?? "Untitled",
			tags: Array.isArray(meta.tags) ? meta.tags : [],
			status: meta.status ?? "open",
			created_at: meta.created_at ?? "",
			body, assigned: meta.assigned,
		};
	} catch { return null; }
}

function readAllTodos(cwd: string): TodoFile[] {
	const dir = getTodosDir(cwd);
	if (!existsSync(dir)) return [];
	const todos: TodoFile[] = [];
	for (const file of readdirSync(dir).filter(f => f.endsWith(".md"))) {
		try {
			const todo = parseTodoFile(readFileSync(join(dir, file), "utf-8"), file);
			if (todo) todos.push(todo);
		} catch {}
	}
	todos.sort((a, b) => a.created_at.localeCompare(b.created_at));
	return todos;
}

function readTodosByTag(cwd: string, tag: string): TodoFile[] {
	const all = readAllTodos(cwd);
	if (tag === "*" || tag === "all") return all;
	return all.filter(t => t.tags.some(tg => tg.toLowerCase() === tag.toLowerCase()));
}

function toggleTodoStatus(cwd: string, todoId: string): TodoFile | null {
	const dir = getTodosDir(cwd);
	const fp = join(dir, `${todoId}.md`);
	if (!existsSync(fp)) return null;
	const content = readFileSync(fp, "utf-8");
	const todo = parseTodoFile(content, `${todoId}.md`);
	if (!todo) return null;
	const newStatus = todo.status === "done" ? "open" : "done";
	const firstBrace = content.indexOf("{");
	let depth = 0, endBrace = -1;
	for (let i = firstBrace; i < content.length; i++) {
		if (content[i] === "{") depth++;
		else if (content[i] === "}") { depth--; if (depth === 0) { endBrace = i; break; } }
	}
	const meta = JSON.parse(content.slice(firstBrace, endBrace + 1));
	meta.status = newStatus;
	writeFileSync(fp, JSON.stringify(meta, null, 2) + content.slice(endBrace + 1), "utf-8");
	todo.status = newStatus;
	return todo;
}

// ── Panel Component ──

class TodoPanelComponent {
	private panelCtx: PanelContext;
	private tag: string;
	private theme: Theme;
	private tui: TUI;
	private cwd: string;
	private todos: TodoFile[] = [];
	private selectedIndex = 0;
	private scrollOffset = 0;
	private cachedWidth?: number;
	private cachedLines?: string[];

	// GIF mascot state
	private mascot: LoadedImage | null = null;
	private imageCache: Map<string, ImageFrames>;
	private gifMaxW: number;
	private gifMaxH: number;

	constructor(panelCtx: PanelContext, tag: string, imageCache: Map<string, ImageFrames>, gifSize?: string) {
		this.panelCtx = panelCtx;
		this.tag = tag;
		this.theme = panelCtx.theme;
		this.tui = panelCtx.tui;
		this.cwd = panelCtx.cwd;
		this.imageCache = imageCache;
		const [maxW, maxH] = resolveImageSize(gifSize);
		this.gifMaxW = maxW;
		this.gifMaxH = maxH;
		this.refresh();
		this.loadMascot();
	}

	// ── Mascot Loading ──

	private async loadMascot(): Promise<void> {
		const cached = this.imageCache.get(this.tag);
		if (cached) { this.setupMascot(cached); return; }

		// Ask a lightweight model to pick a vibe-matched search query,
		// falling back to static map if the model isn't available.
		const todoSummary = this.todos.length > 0
			? this.todos.slice(0, 8).map(t => `- [${t.status === "done" ? "x" : " "}] ${t.title}`).join("\n")
			: "(empty \u2014 no todos yet)";
		const imageFetch = getImageFetch();
		const query = imageFetch
			? await imageFetch.vibeQuery(todoSummary, { tag: this.tag, extCtx: extCtxRef })
			: this.tag;
		const imageData = imageFetch ? await imageFetch.fetch(`giphy:${query}`) : null;
		if (!imageData) return;
		this.imageCache.set(this.tag, imageData);
		this.setupMascot(imageData);
	}

	private setupMascot(imageData: ImageFrames): void {
		this.disposeMascot();
		const kitty = getKitty();
		if (!kitty) return; // kitty-gif-renderer not loaded — skip silently
		const loaded = kitty.loadImage(imageData, {
			maxCols: this.gifMaxW,
			maxRows: this.gifMaxH,
			onReady: () => {
				if (this.mascot !== loaded) return; // disposed before ready
				this.invalidate();
				this.tui.requestRender();
			},
		}) as LoadedImage;
		this.mascot = loaded;
	}

	disposeMascot(): void {
		if (this.mascot) {
			const kitty = getKitty();
			kitty ? kitty.disposeImage(this.mascot) : this.mascot.player.dispose();
			this.mascot = null;
		}
	}

	// ── Todo Panel Logic ──

	private ensureVisible(): void {
		const maxVisible = 12;
		if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
		else if (this.selectedIndex >= this.scrollOffset + maxVisible) this.scrollOffset = this.selectedIndex - maxVisible + 1;
	}

	refresh(): void {
		this.todos = readTodosByTag(this.cwd, this.tag);
		if (this.selectedIndex >= this.todos.length) this.selectedIndex = Math.max(0, this.todos.length - 1);
		this.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.up) && this.selectedIndex > 0) { this.selectedIndex--; this.ensureVisible(); this.invalidate(); this.tui.requestRender(); }
		else if (matchesKey(data, Key.down) && this.selectedIndex < this.todos.length - 1) { this.selectedIndex++; this.ensureVisible(); this.invalidate(); this.tui.requestRender(); }
		else if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
			const todo = this.todos[this.selectedIndex];
			if (todo) { toggleTodoStatus(this.cwd, todo.id); this.refresh(); this.tui.requestRender(); }
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const th = this.theme;
		const focused = this.panelCtx.isFocused();
		const innerW = Math.max(10, width - 2);
		const lines: string[] = [];
		const borderColor = focused ? "accent" : "border";
		const border = (c: string) => th.fg(borderColor, c);
		const padLine = (s: string): string => {
			const raw = truncateToWidth(s, innerW);
			return raw + " ".repeat(Math.max(0, innerW - visibleWidth(raw)));
		};

		// ── Title bar ──
		const doneCount = this.todos.filter(t => t.status === "done").length;
		const totalCount = this.todos.length;
		const tagDisplay = this.tag === "*" || this.tag === "all" ? "All Todos" : this.tag;
		const focusIcon = focused ? " ⚡" : "";
		const titleText = ` 📋 ${tagDisplay} (${doneCount}/${totalCount})${focusIcon} `;
		const titleStyled = focused ? th.fg("accent", th.bold(titleText)) : th.fg("text", th.bold(titleText));
		const titleW = visibleWidth(titleText);
		const lp = Math.max(1, Math.floor((innerW - titleW) / 2));
		const rp = Math.max(1, innerW - titleW - lp);
		lines.push(border("╭") + border("─".repeat(lp)) + titleStyled + border("─".repeat(rp)) + border("╮"));

		// ── Float merger for mascot placeholder lines (via kitty-gif-renderer) ──
		const kitty = getKitty();
		const merger = (this.mascot && kitty) ? kitty.createMerger(this.mascot, innerW) : null;

		/** Append a content line, merging mascot placeholder into the right side if rows remain. */
		const pushLine = (content: string, contentMaxW?: number): void => {
			if (merger?.hasMore) {
				// Reserve space: [content...] [1 gap] [mascot] [border]
				const textW = (contentMaxW ?? innerW) - merger.mascotWidth - 1;
				const truncated = truncateToWidth(content, Math.max(4, textW));
				const { gap, mascot } = merger.nextLine(truncated);
				lines.push(border("│") + truncated + " ".repeat(gap) + mascot! + border("│"));
			} else {
				lines.push(border("│") + padLine(content) + border("│"));
			}
		};

		// ── Todo list ──
		if (this.todos.length === 0) {
			pushLine("");
			pushLine(th.fg("dim", "  No todos" + (this.tag !== "*" && this.tag !== "all" ? ` tagged '${this.tag}'` : "") + "."));
			pushLine(th.fg("dim", "  Use the todo tool to create some!"));
			pushLine("");
		} else {
			pushLine("");
			const barWidth = Math.min(20, innerW - (merger?.mascotWidth ?? 0) - 12);
			if (barWidth >= 5) {
				const filled = totalCount > 0 ? Math.round((doneCount / totalCount) * barWidth) : 0;
				const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
				pushLine("  " + th.fg("success", "█".repeat(filled)) + th.fg("dim", "░".repeat(barWidth - filled)) + th.fg("muted", ` ${pct}%`));
				pushLine("");
			}

			const maxVisible = 12;
			const visibleStart = Math.max(0, Math.min(this.scrollOffset, this.todos.length - maxVisible));
			const visibleEnd = Math.min(this.todos.length, visibleStart + maxVisible);
			if (visibleStart > 0) pushLine(th.fg("dim", `  ↑ ${visibleStart} more`));

			for (let i = 0; i < visibleEnd - visibleStart; i++) {
				const todo = this.todos[visibleStart + i]!;
				const globalIdx = visibleStart + i;
				const isSelected = focused && globalIdx === this.selectedIndex;
				const check = todo.status === "done" ? th.fg("success", "✓") : th.fg("dim", "○");
				const pointer = isSelected ? th.fg("accent", "▸ ") : "  ";
				const titleColor = todo.status === "done"
					? th.fg("muted", th.strikethrough(todo.title))
					: isSelected ? th.fg("accent", todo.title) : th.fg("text", todo.title);
				pushLine(`${pointer}${check} ${titleColor}`);
				if (isSelected && todo.body) {
					const preview = todo.body.split("\n")[0] ?? "";
					if (preview.trim()) pushLine("     " + th.fg("dim", truncateToWidth(preview, innerW - 7)));
				}
			}

			if (visibleEnd < this.todos.length) pushLine(th.fg("dim", `  ↓ ${this.todos.length - visibleEnd} more`));
			pushLine("");
		}

		// ── Flush remaining mascot rows (if image is taller than content) ──
		if (merger) {
			for (const { gap, mascot } of merger.flushLines()) {
				lines.push(border("│") + " ".repeat(gap) + mascot! + border("│"));
			}
		}

		// ── Help text ──
		const kh = getPanels()?.keyHints;
		const focusPos = this.panelCtx.focusIndex();
		const focusCounter = focusPos ? ` ${focusPos.index}/${focusPos.total}` : "";
		const help = focused
			? th.fg("dim", `↑↓ nav · Space toggle · ${kh?.focused ?? "Q close · Escape unfocus"}${focusCounter}`)
			: th.fg("dim", `${kh?.unfocused ?? "Alt+T/Shift+Tab cycle"} · /todos help${focusCounter}`);
		lines.push(border("│") + padLine("  " + help) + border("│"));

		// ── Bottom border ──
		lines.push(border("╰") + border("─".repeat(innerW)) + border("╯"));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }
}

// ── Tool Parameters ──

const TodoPanelParams = Type.Object({
	action: StringEnum(["open", "close", "close_all", "focus", "unfocus", "list_panels", "suggest_layout", "refresh"] as const),
	tag: Type.Optional(Type.String({ description: "Tag to filter todos by (use 'all' for all todos)" })),
	anchor: Type.Optional(Type.String({ description: "Panel position: top-left, top-center, top-right, left-center, center, right-center, bottom-left, bottom-center, bottom-right" })),
	relativeTo: Type.Optional(Type.String({ description: "Anchor relative to another panel's edge. Panel ID to anchor to (use with relativeEdge)" })),
	relativeEdge: Type.Optional(Type.String({ description: "Edge of the reference panel to anchor to: top, bottom, left, right, top-left, top-right, bottom-left, bottom-right" })),
	width: Type.Optional(Type.String({ description: "Panel width as number or percentage (e.g. '30%' or '40')" })),
	count: Type.Optional(Type.Number({ description: "Number of panels for suggest_layout" })),
	offsetX: Type.Optional(Type.Number({ description: "Horizontal offset from anchor position" })),
	offsetY: Type.Optional(Type.Number({ description: "Vertical offset from anchor position" })),
	gifSize: Type.Optional(Type.String({ description: "GIF mascot size: tiny, small, medium (default), large, huge" })),
	focus: Type.Optional(Type.Boolean({ description: "If true, immediately focus this panel after opening. Default: false" })),
});

// ── Extension ──

export default function (pi: ExtensionAPI) {
	const imageCache = new Map<string, ImageFrames>();
	const todoComponents = new Map<string, TodoPanelComponent>();

	function parseWidth(s: string | undefined): number | string {
		if (!s) return DEFAULT_WIDTH;
		if (s.endsWith("%")) return s;
		const n = parseInt(s, 10);
		return isNaN(n) ? DEFAULT_WIDTH : n;
	}

	function refreshAllPanels(): void {
		for (const c of todoComponents.values()) c.refresh();
		getPanels()?.requestRender();
	}

	function panelId(tag: string): string { return `todo:${tag}`; }

	function openPanel(tag: string, anchor?: string, width?: string, offsetX?: number, offsetY?: number, gifSize?: string, relativeTo?: string, relativeEdge?: string, focusOnOpen?: boolean): string {
		const panels = getPanels();
		if (!panels) return "Error: Panel manager not available";
		const pid = panelId(tag);
		if (panels.isOpen(pid)) {
			todoComponents.get(tag)?.refresh();
			panels.requestRender();
			return `Panel '${tag}' already open — refreshed`;
		}
		let component: TodoPanelComponent | null = null;
		const result = panels.createPanel(pid, (panelCtx: any) => {
			component = new TodoPanelComponent(panelCtx, tag, imageCache, gifSize);
			todoComponents.set(tag, component);
			return {
				render: (w: number) => component!.render(w),
				invalidate: () => component!.invalidate(),
				handleInput: (data: string) => component!.handleInput(data),
				dispose: () => component!.disposeMascot(),
			};
		}, {
			...(relativeTo && relativeEdge
				? { anchor: { relativeTo, edge: relativeEdge, offsetX: offsetX ?? 0, offsetY: offsetY ?? 0 } }
				: {
					...(anchor ? { anchor } : {}),
					...(offsetX !== undefined ? { offsetX } : {}),
					...(offsetY !== undefined ? { offsetY } : {}),
				}),
			...(width ? { width: parseWidth(width) } : {}),
			minWidth: DEFAULT_MIN_WIDTH,
			maxHeight: DEFAULT_MAX_HEIGHT,
			onClose: () => { todoComponents.delete(tag); component = null; },
			...(focusOnOpen ? { focusOnOpen: true } : {}),
		});
		return result.message;
	}

	function closePanel(tag: string): string {
		const panels = getPanels();
		const pid = panelId(tag);
		if (!panels?.isOpen(pid)) return `No panel open for '${tag}'`;
		panels.close(pid); // dispose + hide + onClose (clears todoComponents)
		return `Closed panel '${tag}'`;
	}

	function closeAllTodoPanels(): string {
		const panels = getPanels();
		const tags = [...todoComponents.keys()];
		for (const tag of tags) panels?.close(panelId(tag));
		return `Closed ${tags.length} panel(s)`;
	}

	function listPanels(): string {
		if (todoComponents.size === 0) return "No todo panels open";
		const panels = getPanels();
		const lines = [`${todoComponents.size} todo panel(s) open:`];
		for (const [tag] of todoComponents) {
			const focused = panels?.getFocusedId?.() === panelId(tag) ? " ⚡" : "";
			const todos = readTodosByTag(panels?.cwd ?? process.cwd(), tag);
			const done = todos.filter(t => t.status === "done").length;
			lines.push(`  📋 ${tag} (${done}/${todos.length})${focused}`);
		}
		return lines.join("\n");
	}

	function getSuggestedLayout(count: number): string {
		const panels = getPanels();
		const suggestions = panels?.suggestLayout(count) ?? [];
		if (!suggestions.length) return "No layout suggestions for 0 panels";
		const lines = [`Suggested layout for ${count} panel(s):`];
		for (let i = 0; i < suggestions.length; i++) {
			const s = suggestions[i]!;
			lines.push(`  Panel ${i + 1}: /todos open <tag> ${s.anchor} ${s.width}`);
		}
		return lines.join("\n");
	}

	// ── Events ──
	pi.on("session_start", async (_event, ctx) => { extCtxRef = ctx; });
	pi.on("session_switch" as any, async (_event: any, ctx: any) => { todoComponents.clear(); getImageFetch()?.clearCache(); extCtxRef = ctx; });
	pi.on("session_shutdown" as any, async () => { todoComponents.clear(); getImageFetch()?.clearCache(); extCtxRef = null; });
	pi.on("tool_result", async (event) => { if (event.toolName === "todo" && todoComponents.size > 0) refreshAllPanels(); });

	// ── Tool ──
	const makeResult = (text: string, error?: boolean) => ({ content: [{ type: "text" as const, text }], details: { panelCount: todoComponents.size, error } });

	pi.registerTool({
		name: "todo_panel", label: "Todo Panel",
		description: "Manage floating todo panels. Panels display todos from .pi/todos filtered by tag. Actions: open (tag, anchor?, width?), close (tag), close_all, focus (tag?), unfocus, list_panels, suggest_layout (count), refresh. Use the built-in 'todo' tool for CRUD operations on todos.",
		promptSnippet: "Open/close/focus persistent floating todo panels showing .pi/todos filtered by tag",
		promptGuidelines: [
			"Use the built-in 'todo' tool to create, update, and manage individual todos. Use 'todo_panel' only for managing the visual panels.",
			"When opening multiple panels, call suggest_layout first to get optimal positions.",
			"Panels auto-refresh when the todo tool modifies files — no need to manually refresh after todo CRUD.",
			"Tag todos with a consistent name to group them into a panel (e.g., tag: 'sprint', tag: 'bugs').",
			"Use tag 'all' to show all todos regardless of tag.",
		],
		parameters: TodoPanelParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI && params.action !== "suggest_layout") return makeResult("Error: panels require interactive mode", true);
			switch (params.action) {
				case "open": return params.tag ? makeResult(openPanel(params.tag, params.anchor, params.width, params.offsetX, params.offsetY, params.gifSize, params.relativeTo, params.relativeEdge, params.focus)) : makeResult("Error: tag required for open", true);
				case "close": return params.tag ? makeResult(closePanel(params.tag)) : makeResult("Error: tag required for close", true);
				case "close_all": return makeResult(closeAllTodoPanels());
				case "focus": { const p = getPanels(); return makeResult(params.tag ? p?.focusPanel(panelId(params.tag)) ?? "Panel manager unavailable" : p?.cycleFocus() ?? "Panel manager unavailable"); }
				case "unfocus": getPanels()?.unfocusAll(); return makeResult("All panels unfocused");
				case "list_panels": return makeResult(listPanels());
				case "suggest_layout": return makeResult(getSuggestedLayout(params.count ?? todoComponents.size + 1));
				case "refresh": refreshAllPanels(); return makeResult("Refreshed all panels");
				default: return makeResult(`Unknown action: ${params.action}`, true);
			}
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("todo_panel ")) + theme.fg("muted", args.action || "");
			if (args.tag) text += " " + theme.fg("accent", `"${args.tag}"`);
			if (args.anchor) text += " " + theme.fg("dim", args.anchor);
			return new Text(text, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { panelCount?: number; error?: boolean } | undefined;
			const msg = result.content[0]?.type === "text" ? (result.content[0] as { text: string }).text : "";
			if (details?.error) return new Text(theme.fg("error", `✗ ${msg}`), 0, 0);
			const info = details?.panelCount !== undefined ? theme.fg("dim", ` (${details.panelCount} panel(s))`) : "";
			return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg) + info, 0, 0);
		},
	});

	// ── /todos Command ──
	pi.registerCommand("todos", {
		description: "Manage todo panels: open, close, focus, layout, help",
		handler: async (args, ctx) => {
			const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const subcmd = parts[0]?.toLowerCase() ?? "help";
			switch (subcmd) {
				case "open": {
					const tag = parts[1];
					if (!tag) { ctx.ui.notify("Usage: /todos open <tag> [anchor] [width] [gifSize]", "warning"); return; }
					// Check if any trailing arg is a known gif size
					const sizeArg = parts.slice(2).find(p => p.toLowerCase() in IMAGE_SIZES);
					const posArgs = parts.slice(2).filter(p => !(p.toLowerCase() in IMAGE_SIZES));
					ctx.ui.notify(openPanel(tag, posArgs[0], posArgs[1], undefined, undefined, sizeArg), "info");
					return;
				}
				case "close": {
					const tag = parts[1];
					if (!tag) {
						const pm = getPanels();
						const focId = pm?.getFocusedId?.();
						for (const [t] of todoComponents) {
							if (focId === panelId(t)) { ctx.ui.notify(closePanel(t), "info"); return; }
						}
						ctx.ui.notify("No focused todo panel to close", "warning"); return;
					}
					ctx.ui.notify(closePanel(tag), "info"); return;
				}
				case "close-all": ctx.ui.notify(closeAllTodoPanels(), "info"); return;
				case "focus": {
					if (todoComponents.size === 0) { ctx.ui.notify("No todo panels open", "info"); return; }
					const fp = getPanels();
					ctx.ui.notify(parts[1] ? fp?.focusPanel(panelId(parts[1])) ?? "Panel manager unavailable" : fp?.cycleFocus() ?? "Panel manager unavailable", "info");
					return;
				}
				case "layout": { const c = parts[1] ? parseInt(parts[1], 10) : todoComponents.size + 1; ctx.ui.notify(getSuggestedLayout(isNaN(c) ? 1 : c), "info"); return; }
				case "status": ctx.ui.notify(listPanels(), "info"); return;
				case "refresh": refreshAllPanels(); ctx.ui.notify("Refreshed all panels", "info"); return;
				default:
					ctx.ui.notify([
						"Todo Panels — floating .pi/todos viewers",
						"", "  /todos open <tag> [anchor] [width] [gifSize]",
						"  /todos close [tag]                  Close panel",
						"  /todos close-all                    Close all",
						`  /todos focus [tag]                  Focus / cycle (${getPanels()?.keyHints?.focusKey ?? "Alt+T"})`,
						"  /todos status                       List panels",
						"  /todos layout [count]               Suggest positions",
						"  /todos refresh                      Refresh all",
						"", "Anchors: top-left, top-center, top-right, left-center,",
						"         center, right-center, bottom-left, bottom-center, bottom-right",
						"", "GIF sizes: tiny, small, medium (default), large, huge",
						"", "GIF mascots animate automatically — AI picks search terms!",
					].join("\n"), "info");
			}
		},
	});
}
