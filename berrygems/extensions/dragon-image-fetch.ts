/**
 * dragon-image-fetch — Multi-source image and GIF fetching for panels.
 *
 * Provides a unified fetch() API that routes queries to the appropriate source
 * (Giphy, Tenor, direct URL, local file) and returns ImageFrames ready for
 * kitty-gif-renderer. Also handles AI-powered vibe query generation with
 * configurable {placeholder} prompts and model selection.
 *
 * Consumers access the API via globalThis — never import directly:
 *   const imageFetch = (globalThis as any)[Symbol.for("hoard.imageFetch")];
 *   const frames = await imageFetch?.fetch("giphy:dragon coding", "small");
 *
 * Settings (hoard.imageFetch.*):
 *   sources          string[]  Enabled sources in priority order. Default: ["giphy"]
 *   preferStickers   boolean   Prefer Giphy stickers over regular GIFs. Default: true
 *   rating           string    Giphy content rating: g | pg | pg-13 | r. Default: "r"
 *   enableVibeQuery  boolean   Use AI to generate search terms. Default: true
 *   model            string    Model for vibe query generation. Default: "anthropic/claude-haiku-4-5"
 *   queryPrompt      string    Prompt template with {placeholders}. See DEFAULT_QUERY_PROMPT.
 *   cacheMaxSize     number    Max cached images. Default: 50
 *
 * Prompt {placeholders}: {description}, {tag}, {size}, {source}
 *
 * A small dog and a large dragon made this together.
 */

import { complete, type Context } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getGifDimensions } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHoardSetting } from "../lib/settings.ts";
import type { ImageFrames } from "../lib/animated-image.ts";

// ── Constants ──

const API_KEY = Symbol.for("hoard.imageFetch");

const GIPHY_API_KEY = "GlVGYHkr3WSBnllca54iNt0yFbjz7L65";
const GIPHY_STICKER_URL = "https://api.giphy.com/v1/stickers/search";
const GIPHY_GIF_URL = "https://api.giphy.com/v1/gifs/search";
const TENOR_SEARCH_URL = "https://tenor.googleapis.com/v2/search";

const VALID_RATINGS = ["g", "pg", "pg-13", "r"];
const GIF_SIZE_VARIANT = "fixed_width";
const DEFAULT_FRAME_DELAY_MS = 80;
const DEFAULT_VIBE_MODEL = "anthropic/claude-haiku-4-5";
const VIBE_TIMEOUT_MS = 4000;
const VIBE_CACHE_TTL_MS = 10 * 60 * 1000;

// Client-side AI content filter — skip results matching these in title/username/slug
const AI_BLOCK_WORDS = [
	"ai", "generated", "midjourney", "dalle", "stable diffusion",
	"dreamimaginations", "aiart", "artificial", "neural", "deepdream",
];

const DEFAULT_QUERY_PROMPT = `You pick {source} search terms for a todo panel's animated sticker.
The panel belongs to a tiny candy-flavored dog (dot) and a big cozy dragon (Ember).
Aesthetic: furry art, toony animals, cute cartoon characters.

Panel tag: "{tag}"
Context:
{description}

Respond with ONLY a 2-3 word search query. No quotes, no explanation.
The first word MUST be "furry". Keep it short \u2014 sticker pools are small, specific queries return nothing.
Loosely relate to the work. Prefer dogs, wolves, foxes, dragons.
Examples: "furry coding", "furry sleepy", "furry panic", "furry celebrate", "furry detective"`;

/** Fallback queries when AI vibe generation isn't available. */
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

// ── Settings Helpers ──

function getSetting<T>(key: string, fallback: T): T {
	return readHoardSetting<T>(`imageFetch.${key}`, fallback);
}

function getEnabledSources(): string[] {
	return getSetting<string[]>("sources", ["giphy"]);
}

function getRating(): string {
	const r = getSetting<string>("rating", "r");
	return VALID_RATINGS.includes(r) ? r : "r";
}

// ── Giphy Source ──

interface GiphyResult {
	title: string;
	username: string;
	slug: string;
	images: Record<string, { url?: string }>;
}

function isLikelyAI(result: GiphyResult): boolean {
	const haystack = `${result.title} ${result.username} ${result.slug}`.toLowerCase();
	return AI_BLOCK_WORDS.some(w => haystack.includes(w));
}

function pickCleanResult(results: GiphyResult[]): string | null {
	const clean = results.filter(r => !isLikelyAI(r));
	if (!clean.length) return null;
	const pick = clean[Math.floor(Math.random() * clean.length)]!;
	return pick.images?.[GIF_SIZE_VARIANT]?.url ?? null;
}

async function searchGiphy(query: string): Promise<string | null> {
	try {
		const preferStickers = getSetting<boolean>("preferStickers", true);
		const params = new URLSearchParams({ api_key: GIPHY_API_KEY, q: query, limit: "25", rating: getRating() });

		if (preferStickers) {
			const stickerRes = await fetch(`${GIPHY_STICKER_URL}?${params}`);
			if (stickerRes.ok) {
				const data = (await stickerRes.json()) as { data: GiphyResult[] };
				const url = pickCleanResult(data.data ?? []);
				if (url) return url;
			}
		}

		const gifRes = await fetch(`${GIPHY_GIF_URL}?${params}`);
		if (!gifRes.ok) return null;
		const data = (await gifRes.json()) as { data: GiphyResult[] };
		return pickCleanResult(data.data ?? []);
	} catch { return null; }
}

// ── Tenor Source ──

async function searchTenor(query: string): Promise<string | null> {
	try {
		// Tenor v2 requires an API key — check settings for user's key
		const apiKey = getSetting<string>("tenorApiKey", "");
		if (!apiKey) return null;
		const params = new URLSearchParams({ q: query, key: apiKey, limit: "20", media_filter: "gif" });
		const res = await fetch(`${TENOR_SEARCH_URL}?${params}`);
		if (!res.ok) return null;
		const data = (await res.json()) as { results: Array<{ media_formats: Record<string, { url: string }> }> };
		const results = data.results ?? [];
		if (!results.length) return null;
		const pick = results[Math.floor(Math.random() * results.length)]!;
		return pick.media_formats?.["gif"]?.url ?? pick.media_formats?.["tinygif"]?.url ?? null;
	} catch { return null; }
}

// ── Download & Frame Extraction ──

async function downloadBuffer(url: string): Promise<Buffer | null> {
	try {
		const r = await fetch(url);
		return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
	} catch { return null; }
}

function extractFrames(gifBuffer: Buffer): { frames: string[]; delays: number[] } | null {
	const dir = join(tmpdir(), `hoard-gif-${Date.now()}`);
	try {
		mkdirSync(dir, { recursive: true });
		const gifPath = join(dir, "input.gif");
		writeFileSync(gifPath, gifBuffer);

		let delays: number[] = [];
		try {
			delays = execSync(`magick identify -format "%T\\n" "${gifPath}"`, { encoding: "utf-8", timeout: 5000 })
				.trim().split("\n")
				.map(d => { const v = parseInt(d, 10); return v > 0 ? v * 10 : DEFAULT_FRAME_DELAY_MS; });
		} catch { /* use defaults */ }

		execSync(`magick "${gifPath}" -coalesce "${join(dir, "frame_%04d.png")}"`, { timeout: 15000 });
		const files = readdirSync(dir).filter(f => f.startsWith("frame_") && f.endsWith(".png")).sort();
		if (!files.length) return null;

		const frames = files.map(f => readFileSync(join(dir, f)).toString("base64"));
		while (delays.length < frames.length) delays.push(DEFAULT_FRAME_DELAY_MS);
		return { frames, delays: delays.slice(0, frames.length) };
	} catch { return null; }
	finally {
		try { if (existsSync(dir)) { for (const f of readdirSync(dir)) unlinkSync(join(dir, f)); rmdirSync(dir); } } catch { /* cleanup best-effort */ }
	}
}

async function bufferToFrames(buf: Buffer): Promise<ImageFrames | null> {
	const extracted = extractFrames(buf);
	if (!extracted?.frames.length) return null;
	const dims = getGifDimensions(buf.toString("base64")) ?? { widthPx: 100, heightPx: 100 };
	return { frames: extracted.frames, delays: extracted.delays, ...dims };
}

// ── Unified Fetch ──

/** Parse a query string into source + search term.
 *  Supported prefixes: giphy:, tenor:, http://, https://, ~/path, /path
 *  Bare text → routed to first enabled source. */
function parseQuery(query: string): { source: "giphy" | "tenor" | "url" | "file"; term: string } {
	if (query.startsWith("giphy:"))  return { source: "giphy",  term: query.slice(6).trim() };
	if (query.startsWith("tenor:"))  return { source: "tenor",  term: query.slice(6).trim() };
	if (query.startsWith("http://") || query.startsWith("https://")) return { source: "url", term: query };
	if (query.startsWith("/") || query.startsWith("~/"))             return { source: "file", term: query };
	// Bare text — route to first enabled source
	const first = getEnabledSources()[0] ?? "giphy";
	return { source: first as "giphy" | "tenor", term: query };
}

// LRU-ish cache: Map preserves insertion order, we trim from front when over limit
const fetchCache = new Map<string, ImageFrames>();

function cacheGet(key: string): ImageFrames | undefined { return fetchCache.get(key); }

function cacheSet(key: string, val: ImageFrames): void {
	const max = getSetting<number>("cacheMaxSize", 50);
	if (fetchCache.size >= max) {
		const oldest = fetchCache.keys().next().value;
		if (oldest) fetchCache.delete(oldest);
	}
	fetchCache.set(key, val);
}

/**
 * Fetch an image from the appropriate source, returning ImageFrames or null.
 * @param query  Source-prefixed query: "giphy:dragon coding", "tenor:party",
 *               "https://...", "/path/to/file.gif", or bare text (→ first source).
 * @param _size  Size hint (reserved for future per-source sizing; unused for now).
 */
async function fetchImage(query: string, _size?: string): Promise<ImageFrames | null> {
	const cacheKey = query;
	const cached = cacheGet(cacheKey);
	if (cached) return cached;

	const { source, term } = parseQuery(query);
	let buf: Buffer | null = null;

	if (source === "giphy") {
		const url = await searchGiphy(term);
		if (!url) return null;
		buf = await downloadBuffer(url);
	} else if (source === "tenor") {
		const url = await searchTenor(term);
		if (!url) return null;
		buf = await downloadBuffer(url);
	} else if (source === "url") {
		buf = await downloadBuffer(term);
	} else if (source === "file") {
		try {
			const resolved = term.startsWith("~/") ? join(process.env.HOME ?? "", term.slice(2)) : term;
			if (existsSync(resolved)) buf = readFileSync(resolved) as unknown as Buffer;
		} catch { return null; }
	}

	if (!buf) return null;
	const frames = await bufferToFrames(buf);
	if (!frames) return null;
	cacheSet(cacheKey, frames);
	return frames;
}

// ── Vibe Query Generation ──

const vibeCache = new Map<string, { query: string; timestamp: number }>();
let _extCtx: ExtensionContext | null = null;

/** Options for vibeQuery(). */
export interface VibeQueryOpts {
	tag?: string;
	size?: string;
	source?: string;
	extCtx?: ExtensionContext | null;
}

/** Get fallback query for a tag without LLM. */
function getFallbackQuery(tag: string): string {
	return TAG_SEARCH_FALLBACK[tag.toLowerCase()] ?? `furry ${tag}`;
}

/**
 * Use a lightweight AI model to generate a Giphy/Tenor search query from a description.
 * Results are cached for VIBE_CACHE_TTL_MS.
 * Falls back to TAG_SEARCH_FALLBACK if model unavailable or times out.
 *
 * @param description  Context text (todo list preview, panel title, etc.)
 * @param opts         tag, size, source for {placeholder} substitution; extCtx override
 */
async function vibeQuery(description: string, opts: VibeQueryOpts = {}): Promise<string> {
	if (!getSetting<boolean>("enableVibeQuery", true)) return getFallbackQuery(opts.tag ?? "");

	const tag = opts.tag ?? "";
	const cacheKey = `${tag}::${description.slice(0, 100)}`;
	const cached = vibeCache.get(cacheKey);
	if (cached && Date.now() - cached.timestamp < VIBE_CACHE_TTL_MS) return cached.query;

	const ctx = opts.extCtx ?? _extCtx;
	if (!ctx) return getFallbackQuery(tag);

	try {
		const modelId = getSetting<string>("model", DEFAULT_VIBE_MODEL);
		const slashIdx = modelId.indexOf("/");
		const provider = modelId.slice(0, slashIdx);
		const id = modelId.slice(slashIdx + 1);
		const model = ctx.modelRegistry.find(provider, id);
		if (!model) return getFallbackQuery(tag);

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) return getFallbackQuery(tag);

		const rawPrompt = getSetting<string>("queryPrompt", DEFAULT_QUERY_PROMPT);
		const prompt = rawPrompt
			.replace(/\{tag\}/g, tag)
			.replace(/\{description\}/g, description || "(empty)")
			.replace(/\{size\}/g, opts.size ?? "small")
			.replace(/\{source\}/g, opts.source ?? getEnabledSources()[0] ?? "giphy");

		const aiContext: Context = {
			messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
		};

		const signal = AbortSignal.timeout(VIBE_TIMEOUT_MS);
		const response = await complete(model, aiContext, { apiKey: auth.apiKey, headers: auth.headers, signal });
		const textContent = response.content.find(c => c.type === "text");
		let query = textContent?.text?.trim().split("\n")[0]?.trim() ?? "";
		query = query.replace(/^["']|["']$/g, "").slice(0, 60);
		if (!query || query.length < 3) return getFallbackQuery(tag);

		vibeCache.set(cacheKey, { query, timestamp: Date.now() });
		return query;
	} catch (err) {
		console.debug("[dragon-image-fetch] Vibe generation failed:", err);
		return getFallbackQuery(tag);
	}
}

/** Clear all caches (call on session switch). */
function clearCache(): void {
	fetchCache.clear();
	vibeCache.clear();
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
	const api = { fetch: fetchImage, vibeQuery, clearCache, getFallbackQuery };
	(globalThis as any)[API_KEY] = api;

	pi.on("session_start" as any, async (_event: any, ctx: any) => { _extCtx = ctx; });
	pi.on("session_switch" as any, async (_event: any, ctx: any) => { _extCtx = ctx; clearCache(); });
	pi.on("session_shutdown" as any, async () => { clearCache(); _extCtx = null; });
}
