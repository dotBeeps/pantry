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

import { StringEnum, complete, type Context } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
// ── Panel Manager Access ──
// dots-panels API is published to globalThis by dots-panels.ts extension.
// No direct imports — avoids jiti module isolation issues.
const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any { return (globalThis as any)[PANELS_KEY]; }
import {
	matchesKey, Key, Text, truncateToWidth, visibleWidth,
	calculateImageRows, getCellDimensions, getGifDimensions,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readHoardSetting } from "../lib/settings.ts";

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
}

interface GifFrames {
	frames: string[];   // base64 PNG per frame
	delays: number[];   // ms per frame
	widthPx: number;
	heightPx: number;
}

/** Per-panel mascot state */
interface MascotState {
	imageId: number;
	cols: number;
	rows: number;
	gifData: GifFrames;
	currentFrame: number;
	interval: ReturnType<typeof setInterval> | null;
}

// ── Constants ──

const DEFAULT_WIDTH = "30%";
const DEFAULT_MIN_WIDTH = 30;
const DEFAULT_MAX_HEIGHT = "90%";
const DEFAULT_GIF_RATING = "r";
const VALID_RATINGS = ["g", "pg", "pg-13", "r"];

// ── Settings ──





// ── GIF Constants ──

const GIPHY_API_KEY = "GlVGYHkr3WSBnllca54iNt0yFbjz7L65";
const GIPHY_STICKER_URL = "https://api.giphy.com/v1/stickers/search";
const GIPHY_GIF_URL = "https://api.giphy.com/v1/gifs/search";

// Client-side AI content filter — skip results matching these in title/username/slug
const AI_BLOCK_WORDS = [
	"ai", "generated", "midjourney", "dalle", "stable diffusion",
	"dreamimaginations", "aiart", "artificial", "neural", "deepdream",
];
const GIF_SIZE_VARIANT = "fixed_width";
const DEFAULT_GIF_CELLS_W = 16;
const DEFAULT_GIF_CELLS_H = 8;

/** Named GIF sizes — maps to max cell dimensions [width, height] */
const GIF_SIZES: Record<string, [number, number]> = {
	tiny:   [8,  4],
	small:  [12, 6],
	medium: [16, 8],
	large:  [22, 11],
	huge:   [30, 15],
};
const DEFAULT_FRAME_DELAY_MS = 80;
const MIN_FRAME_DELAY_MS = 50;
const VIBE_MODEL = "anthropic/claude-haiku-4-5";
const VIBE_TIMEOUT_MS = 4000;

// Fallback search terms — used when the AI vibe generator isn't available.
// Keep queries to 2-3 broad words — sticker API has a small pool,
// over-specific queries return 0 results.
const TAG_SEARCH_FALLBACK: Record<string, string> = {
	bugs: "furry computer",
	sprint: "furry running",
	done: "furry happy dance",
	blocked: "furry sleepy",
	review: "furry detective",
	urgent: "furry panic",
	feature: "furry building",
	refactor: "furry cleaning",
	test: "furry science",
	docs: "furry typing",
	all: "furry coding",
};

// Prompt for AI vibe-matched GIF search.
// Kept short for Haiku — we want 2-4 word Giphy queries, not essays.
const DEFAULT_VIBE_PROMPT = `You pick Giphy search terms for a coding todo panel's animated sticker.
The panel belongs to a tiny candy-flavored dog (dot) and a big cozy dragon (Ember).
Aesthetic: furry art, toony animals, cute cartoon characters.

Panel tag: "{tag}"
Todo items:
{todos}

Respond with ONLY a 2-3 word Giphy search query. No quotes, no explanation.
The first word MUST be "furry". Keep it short — Giphy's sticker pool is small, specific queries return nothing.
Loosely relate to the work. Prefer dogs, wolves, foxes, dragons.
Examples: "furry coding", "furry sleepy", "furry panic", "furry celebrate", "furry detective"`;

/** Read the vibe prompt from settings, falling back to built-in default.
 *  Supports placeholders: {tag}, {todos} */
function getVibePrompt(): string {
	return readHoardSetting<string>("todos.gifVibePrompt", DEFAULT_VIBE_PROMPT);
}

// ── Kitty Unicode Placeholder Constants ──
// U+10EEEE is Kitty's designated placeholder character.
// Combined with row/column diacritics, it tells Kitty where to render a virtual image.
// See: https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders

const PLACEHOLDER_CHAR = "\u{10EEEE}";
const DIACRITICS = [
	0x0305, 0x030D, 0x030E, 0x0310, 0x0312, 0x033D, 0x033E, 0x033F,
	0x0346, 0x034A, 0x034B, 0x034C, 0x0350, 0x0351, 0x0352, 0x0357,
	0x035B, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
	0x036A, 0x036B, 0x036C, 0x036D, 0x036E, 0x036F, 0x0483, 0x0484,
	0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597,
	0x0598, 0x0599, 0x059C, 0x059D, 0x059E, 0x059F, 0x05A0,
];

// Sequential IDs 1–200 for 256-color fg encoding
let nextMascotId = 1;
function allocateMascotId(): number {
	const id = nextMascotId;
	nextMascotId = (nextMascotId % 200) + 1;
	return id;
}

// ── Kitty Protocol Helpers ──

/**
 * Transmit a single PNG frame to Kitty's memory as a virtual placement.
 * Uses U=1 for Unicode placeholder display, q=2 to suppress responses.
 * The image is NOT rendered at cursor position — it only appears where
 * placeholder characters with matching foreground color exist.
 *
 * Written as a single process.stdout.write() to minimize interleave risk
 * with the TUI's own output buffer.
 */
function transmitFrame(imageId: number, base64Data: string, cols: number, rows: number): void {
	const CHUNK = 4096;
	const params = `a=T,U=1,f=100,q=2,i=${imageId},c=${cols},r=${rows}`;
	let buf: string;

	if (base64Data.length <= CHUNK) {
		buf = `\x1b_G${params};${base64Data}\x1b\\`;
	} else {
		const parts: string[] = [];
		let offset = 0;
		let first = true;
		while (offset < base64Data.length) {
			const chunk = base64Data.slice(offset, offset + CHUNK);
			const isLast = offset + CHUNK >= base64Data.length;
			if (first) {
				parts.push(`\x1b_G${params},m=1;${chunk}\x1b\\`);
				first = false;
			} else if (isLast) {
				parts.push(`\x1b_Gm=0;${chunk}\x1b\\`);
			} else {
				parts.push(`\x1b_Gm=1;${chunk}\x1b\\`);
			}
			offset += CHUNK;
		}
		buf = parts.join("");
	}

	process.stdout.write(buf);
}

/** Delete a Kitty image by ID, freeing memory. */
function deleteKittyImage(imageId: number): void {
	process.stdout.write(`\x1b_Ga=d,d=I,i=${imageId}\x1b\\`);
}

/**
 * Build Unicode placeholder lines for a virtual Kitty image.
 * Each grapheme cluster is U+10EEEE + row diacritic + column diacritic.
 * The foreground color encodes the image ID (256-color mode for IDs ≤ 255).
 * visibleWidth() correctly measures each cluster as width 1.
 * Intl.Segmenter keeps clusters intact during compositor slicing.
 */
function buildPlaceholderLines(imageId: number, cols: number, rows: number): string[] {
	const fgSet = imageId <= 255
		? `\x1b[38;5;${imageId}m`
		: `\x1b[38;2;${imageId & 0xFF};${(imageId >> 8) & 0xFF};${(imageId >> 16) & 0xFF}m`;
	const fgReset = "\x1b[39m";
	const lines: string[] = [];
	for (let row = 0; row < rows; row++) {
		let line = fgSet;
		for (let col = 0; col < cols; col++) {
			line += PLACEHOLDER_CHAR
				+ String.fromCodePoint(DIACRITICS[row] ?? DIACRITICS[0]!)
				+ String.fromCodePoint(DIACRITICS[col] ?? DIACRITICS[0]!);
		}
		line += fgReset;
		lines.push(line);
	}
	return lines;
}

// ── AI Vibe Search Generator ──

// Module-level ref to ExtensionContext for model registry access.
// Set once during session_start, used by generateVibeQuery().
let extCtxRef: ExtensionContext | null = null;

// Cache: tag → generated query (avoid repeated API calls for same panel)
const vibeQueryCache = new Map<string, { query: string; timestamp: number }>();

/**
 * Ask a lightweight model to generate a Giphy search query based on
 * the actual todo content and our vibes (smol dog + big dragon + cozy coding).
 * Falls back to TAG_SEARCH_FALLBACK if the model isn't available or times out.
 */
async function generateVibeQuery(tag: string, todos: TodoFile[]): Promise<string> {
	// Check cache first (reuse for 10 minutes)
	const cached = vibeQueryCache.get(tag);
	if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) return cached.query;

	// Need ExtensionContext for model registry
	if (!extCtxRef) return getFallbackQuery(tag);

	try {
		// Resolve model
		const slashIdx = VIBE_MODEL.indexOf("/");
		const provider = VIBE_MODEL.slice(0, slashIdx);
		const modelId = VIBE_MODEL.slice(slashIdx + 1);
		const model = extCtxRef.modelRegistry.find(provider, modelId);
		if (!model) return getFallbackQuery(tag);

		// Get auth
		const auth = await extCtxRef.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) return getFallbackQuery(tag);

		// Build prompt with actual todo content
		const todoSummary = todos.length > 0
			? todos.slice(0, 8).map(t => `- [${t.status === "done" ? "x" : " "}] ${t.title}`).join("\n")
			: "(empty — no todos yet)";
		const prompt = getVibePrompt()
			.replace("{tag}", tag)
			.replace("{todos}", todoSummary);

		const aiContext: Context = {
			messages: [{
				role: "user",
				content: [{ type: "text", text: prompt }],
				timestamp: Date.now(),
			}],
		};

		const signal = AbortSignal.timeout(VIBE_TIMEOUT_MS);
		const response = await complete(model, aiContext, { apiKey: auth.apiKey, headers: auth.headers, signal });
		const textContent = response.content.find(c => c.type === "text");
		let query = textContent?.text?.trim().split("\n")[0]?.trim() ?? "";

		// Clean up: remove quotes, limit length
		query = query.replace(/^["']|["']$/g, "").slice(0, 60);
		if (!query || query.length < 3) return getFallbackQuery(tag);

		vibeQueryCache.set(tag, { query, timestamp: Date.now() });
		return query;
	} catch (err) {
		console.debug("[todo-gif] Vibe generation failed:", err);
		return getFallbackQuery(tag);
	}
}

function getFallbackQuery(tag: string): string {
	return TAG_SEARCH_FALLBACK[tag.toLowerCase()] ?? `furry ${tag}`;
}

// ── GIF Fetching & Frame Extraction ──

interface GiphyResult {
	title: string;
	username: string;
	slug: string;
	images: Record<string, { url?: string }>;
}

/** Check if a result looks like AI-generated content. */
function isLikelyAI(result: GiphyResult): boolean {
	const haystack = `${result.title} ${result.username} ${result.slug}`.toLowerCase();
	return AI_BLOCK_WORDS.some(w => haystack.includes(w));
}

/** Pick a random non-AI result from a list. */
function pickCleanResult(results: GiphyResult[]): string | null {
	const clean = results.filter(r => !isLikelyAI(r));
	if (!clean.length) return null;
	const pick = clean[Math.floor(Math.random() * clean.length)]!;
	return pick.images?.[GIF_SIZE_VARIANT]?.url ?? null;
}

/**
 * Search Giphy for a GIF. Tries stickers first (hand-drawn, toony),
 * falls back to regular GIFs if stickers return too few results.
 * Filters out suspected AI-generated content client-side.
 */
async function searchGiphy(query: string): Promise<string | null> {
	try {
		const rating = readHoardSetting<string>("todos.gifRating", DEFAULT_GIF_RATING);
		const validRating = VALID_RATINGS.includes(rating) ? rating : DEFAULT_GIF_RATING;
		const params = new URLSearchParams({ api_key: GIPHY_API_KEY, q: query, limit: "25", rating: validRating });

		// Try stickers first — inherently toony/hand-drawn
		const stickerRes = await fetch(`${GIPHY_STICKER_URL}?${params}`);
		if (stickerRes.ok) {
			const stickerData = (await stickerRes.json()) as { data: GiphyResult[] };
			const url = pickCleanResult(stickerData.data ?? []);
			if (url) return url;
		}

		// Fall back to regular GIFs
		const gifRes = await fetch(`${GIPHY_GIF_URL}?${params}`);
		if (!gifRes.ok) return null;
		const gifData = (await gifRes.json()) as { data: GiphyResult[] };
		return pickCleanResult(gifData.data ?? []);
	} catch { return null; }
}

async function downloadGif(url: string): Promise<Buffer | null> {
	try {
		const r = await fetch(url);
		return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
	} catch { return null; }
}

function extractFrames(gifBuffer: Buffer): { frames: string[]; delays: number[] } | null {
	const dir = join(tmpdir(), `todo-gif-${Date.now()}`);
	try {
		mkdirSync(dir, { recursive: true });
		const gifPath = join(dir, "input.gif");
		writeFileSync(gifPath, gifBuffer);

		let delays: number[] = [];
		try {
			delays = execSync(`magick identify -format "%T\\n" "${gifPath}"`, { encoding: "utf-8", timeout: 5000 })
				.trim().split("\n")
				.map(d => { const v = parseInt(d, 10); return v > 0 ? v * 10 : DEFAULT_FRAME_DELAY_MS; });
		} catch {}

		execSync(`magick "${gifPath}" -coalesce "${join(dir, "frame_%04d.png")}"`, { timeout: 15000 });
		const files = readdirSync(dir).filter(f => f.startsWith("frame_") && f.endsWith(".png")).sort();
		if (!files.length) return null;

		const frames = files.map(f => readFileSync(join(dir, f)).toString("base64"));
		while (delays.length < frames.length) delays.push(DEFAULT_FRAME_DELAY_MS);
		return { frames, delays: delays.slice(0, frames.length) };
	} catch { return null; }
	finally {
		try { if (existsSync(dir)) { for (const f of readdirSync(dir)) unlinkSync(join(dir, f)); rmdirSync(dir); } } catch {}
	}
}

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
	private mascot: MascotState | null = null;
	private gifCache: Map<string, GifFrames>;
	private gifMaxW: number;
	private gifMaxH: number;

	constructor(panelCtx: PanelContext, tag: string, gifCache: Map<string, GifFrames>, gifSize?: string) {
		this.panelCtx = panelCtx;
		this.tag = tag;
		this.theme = panelCtx.theme;
		this.tui = panelCtx.tui;
		this.cwd = panelCtx.cwd;
		this.gifCache = gifCache;
		const [maxW, maxH] = GIF_SIZES[gifSize ?? "medium"] ?? [DEFAULT_GIF_CELLS_W, DEFAULT_GIF_CELLS_H];
		this.gifMaxW = maxW;
		this.gifMaxH = maxH;
		this.refresh();
		this.loadMascot();
	}

	// ── Mascot Loading ──

	private async loadMascot(): Promise<void> {
		const cached = this.gifCache.get(this.tag);
		if (cached) { this.setupMascot(cached); return; }

		// Ask a lightweight model to pick a vibe-matched search query,
		// falling back to static map if the model isn't available.
		const query = await generateVibeQuery(this.tag, this.todos);
		const url = await searchGiphy(query);
		if (!url) return;
		const gifBuffer = await downloadGif(url);
		if (!gifBuffer) return;
		const extracted = extractFrames(gifBuffer);
		if (!extracted || !extracted.frames.length) return;
		const dims = getGifDimensions(gifBuffer.toString("base64")) ?? { widthPx: 100, heightPx: 100 };
		const gifData: GifFrames = {
			frames: extracted.frames, delays: extracted.delays,
			widthPx: dims.widthPx, heightPx: dims.heightPx,
		};
		this.gifCache.set(this.tag, gifData);
		this.setupMascot(gifData);
	}

	private setupMascot(gifData: GifFrames): void {
		this.disposeMascot();

		const cellDims = getCellDimensions();
		const cols = Math.min(this.gifMaxW, Math.max(2, Math.floor(gifData.widthPx / cellDims.widthPx)));
		const rows = Math.min(this.gifMaxH, Math.max(2, calculateImageRows(
			{ widthPx: gifData.widthPx, heightPx: gifData.heightPx }, cols, cellDims,
		)));
		const imageId = allocateMascotId();

		this.mascot = { imageId, cols, rows, gifData, currentFrame: 0, interval: null };

		// Transmit first frame after a microtask delay to avoid racing with
		// the TUI's current render cycle.
		setTimeout(() => {
			if (!this.mascot) return;
			transmitFrame(imageId, gifData.frames[0]!, cols, rows);

			// For multi-frame GIFs: software animation via setInterval.
			// Each tick re-transmits the next frame for the same image ID.
			// From the Kitty docs: "When a new image is transmitted with the
			// same id, all existing placements are updated to show the new image."
			if (gifData.frames.length > 1) {
				const avgDelay = Math.max(
					MIN_FRAME_DELAY_MS,
					gifData.delays.reduce((a, b) => a + b, 0) / gifData.delays.length,
				);
				this.mascot!.interval = setInterval(() => {
					if (!this.mascot) return;
					this.mascot.currentFrame = (this.mascot.currentFrame + 1) % this.mascot.gifData.frames.length;
					transmitFrame(this.mascot.imageId, this.mascot.gifData.frames[this.mascot.currentFrame]!, this.mascot.cols, this.mascot.rows);
				}, avgDelay);
			}

			// Trigger overlay re-render to show placeholders now that the image is loaded
			this.invalidate();
			this.tui.requestRender();
		}, 0);
	}

	disposeMascot(): void {
		if (this.mascot) {
			if (this.mascot.interval) clearInterval(this.mascot.interval);
			deleteKittyImage(this.mascot.imageId);
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

		// ── Build mascot placeholder lines (rendered inline, top-right) ──
		// The image data is transmitted to Kitty via process.stdout.write() in
		// setupMascot/setInterval — NOT in render(). Kitty stores it in memory
		// with a=T,U=1 (virtual placement). The placeholder characters here
		// tell Kitty where to display the image. The foreground color encodes
		// the image ID. This is compositor-safe: Intl.Segmenter keeps the
		// grapheme clusters intact, and visibleWidth() measures each as width 1.
		const mascotLines = this.mascot
			? buildPlaceholderLines(this.mascot.imageId, this.mascot.cols, this.mascot.rows)
			: [];
		const mascotW = this.mascot?.cols ?? 0;
		let mascotRow = 0; // tracks which mascot row to render next

		/** Append a content line, merging mascot placeholder into the right side if rows remain. */
		const pushLine = (content: string, contentMaxW?: number): void => {
			if (mascotRow < mascotLines.length && mascotW > 0) {
				// Reserve space: [content...] [1 gap] [mascot] [border]
				const textW = (contentMaxW ?? innerW) - mascotW - 1;
				const truncated = truncateToWidth(content, Math.max(4, textW));
				const gap = Math.max(0, innerW - visibleWidth(truncated) - mascotW);
				lines.push(border("│") + truncated + " ".repeat(gap) + mascotLines[mascotRow]! + border("│"));
				mascotRow++;
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
			const barWidth = Math.min(20, innerW - mascotW - 12);
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

		// ── Flush remaining mascot rows (if mascot is taller than content) ──
		while (mascotRow < mascotLines.length) {
			const gap = Math.max(0, innerW - mascotW);
			lines.push(border("│") + " ".repeat(gap) + mascotLines[mascotRow]! + border("│"));
			mascotRow++;
		}

		// ── Help text ──
		const kh = getPanels()?.keyHints;
		const help = focused ? th.fg("dim", `↑↓ nav · Space toggle · ${kh?.focused ?? "Q close · Escape unfocus"}`) : th.fg("dim", `${kh?.unfocused ?? "Alt+T focus"} · /todos help`);
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
});

// ── Extension ──

export default function (pi: ExtensionAPI) {
	const gifCache = new Map<string, GifFrames>();
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

	function openPanel(tag: string, anchor?: string, width?: string, offsetX?: number, offsetY?: number, gifSize?: string, relativeTo?: string, relativeEdge?: string): string {
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
			component = new TodoPanelComponent(panelCtx, tag, gifCache, gifSize);
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
			const panel = panels?.get(panelId(tag));
			const focused = panel?.handle.isFocused() ? " ⚡" : "";
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
	pi.on("session_switch", async (_event, ctx) => { todoComponents.clear(); extCtxRef = ctx; });
	pi.on("session_shutdown", async () => { todoComponents.clear(); });
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
				case "open": return params.tag ? makeResult(openPanel(params.tag, params.anchor, params.width, params.offsetX, params.offsetY, params.gifSize, params.relativeTo, params.relativeEdge)) : makeResult("Error: tag required for open", true);
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
					const sizeArg = parts.slice(2).find(p => p.toLowerCase() in GIF_SIZES);
					const posArgs = parts.slice(2).filter(p => !(p.toLowerCase() in GIF_SIZES));
					ctx.ui.notify(openPanel(tag, posArgs[0], posArgs[1], undefined, undefined, sizeArg), "info");
					return;
				}
				case "close": {
					const tag = parts[1];
					if (!tag) {
						const pm = getPanels();
						for (const [t] of todoComponents) {
							if (pm?.get(panelId(t))?.handle.isFocused()) { ctx.ui.notify(closePanel(t), "info"); return; }
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
