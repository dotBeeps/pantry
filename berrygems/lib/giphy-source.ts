/**
 * GiphySource — Fetch and extract animated GIF frames from Giphy.
 *
 * Handles:
 * - Giphy API search (stickers first, regular GIFs as fallback)
 * - AI-generated content filtering
 * - GIF download and frame extraction via ImageMagick
 * - AI vibe-based search query generation (optional)
 * - Result caching
 *
 * Produces ImageFrames suitable for AnimatedImage / AnimatedImagePlayer.
 *
 * A small dog and a large dragon made this together.
 */

import { complete, type Context } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getGifDimensions } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHoardSetting } from "./settings.ts";
import type { ImageFrames } from "./animated-image.ts";

// ── Constants ──

const GIPHY_API_KEY = "GlVGYHkr3WSBnllca54iNt0yFbjz7L65";
const GIPHY_STICKER_URL = "https://api.giphy.com/v1/stickers/search";
const GIPHY_GIF_URL = "https://api.giphy.com/v1/gifs/search";

const DEFAULT_GIF_RATING = "r";
const VALID_RATINGS = ["g", "pg", "pg-13", "r"];

// Client-side AI content filter — skip results matching these in title/username/slug
const AI_BLOCK_WORDS = [
	"ai", "generated", "midjourney", "dalle", "stable diffusion",
	"dreamimaginations", "aiart", "artificial", "neural", "deepdream",
];

const GIF_SIZE_VARIANT = "fixed_width";
const DEFAULT_FRAME_DELAY_MS = 80;
const VIBE_MODEL = "anthropic/claude-haiku-4-5";
const VIBE_TIMEOUT_MS = 4000;

// ── Giphy Search ──

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
export async function searchGiphy(query: string): Promise<string | null> {
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

// ── GIF Download & Frame Extraction ──

/** Download a GIF from a URL. Returns raw buffer or null on failure. */
export async function downloadGif(url: string): Promise<Buffer | null> {
	try {
		const r = await fetch(url);
		return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
	} catch { return null; }
}

/**
 * Extract individual PNG frames from a GIF buffer using ImageMagick.
 * Returns base64 frames and per-frame delays, or null on failure.
 */
export function extractFrames(gifBuffer: Buffer): { frames: string[]; delays: number[] } | null {
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

/**
 * Full pipeline: search Giphy → download → extract frames → return ImageFrames.
 * Returns null if any step fails.
 */
export async function fetchGiphyImage(query: string): Promise<ImageFrames | null> {
	const url = await searchGiphy(query);
	if (!url) return null;
	const gifBuffer = await downloadGif(url);
	if (!gifBuffer) return null;
	const extracted = extractFrames(gifBuffer);
	if (!extracted || !extracted.frames.length) return null;
	const dims = getGifDimensions(gifBuffer.toString("base64")) ?? { widthPx: 100, heightPx: 100 };
	return {
		frames: extracted.frames,
		delays: extracted.delays,
		widthPx: dims.widthPx,
		heightPx: dims.heightPx,
	};
}

// ── AI Vibe Search Query Generator ──

/** Fallback search terms — used when the AI vibe generator isn't available. */
export const TAG_SEARCH_FALLBACK: Record<string, string> = {
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

/** Read the vibe prompt from settings, falling back to built-in default. */
function getVibePrompt(): string {
	return readHoardSetting<string>("todos.gifVibePrompt", DEFAULT_VIBE_PROMPT);
}

/** Get fallback search query for a tag. */
export function getFallbackQuery(tag: string): string {
	return TAG_SEARCH_FALLBACK[tag.toLowerCase()] ?? `furry ${tag}`;
}

// Cache: tag → generated query (avoid repeated API calls for same panel)
const vibeQueryCache = new Map<string, { query: string; timestamp: number }>();

/**
 * Ask a lightweight model to generate a Giphy search query based on
 * content and vibes (smol dog + big dragon + cozy coding aesthetic).
 * Falls back to TAG_SEARCH_FALLBACK if the model isn't available or times out.
 *
 * @param tag - Panel/context tag for the search
 * @param todoSummary - Brief text describing the content (e.g. todo list preview)
 * @param extCtx - ExtensionContext for model registry access
 */
export async function generateVibeQuery(
	tag: string,
	todoSummary: string,
	extCtx: ExtensionContext | null,
): Promise<string> {
	// Check cache first (reuse for 10 minutes)
	const cached = vibeQueryCache.get(tag);
	if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) return cached.query;

	if (!extCtx) return getFallbackQuery(tag);

	try {
		const slashIdx = VIBE_MODEL.indexOf("/");
		const provider = VIBE_MODEL.slice(0, slashIdx);
		const modelId = VIBE_MODEL.slice(slashIdx + 1);
		const model = extCtx.modelRegistry.find(provider, modelId);
		if (!model) return getFallbackQuery(tag);

		const auth = await extCtx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) return getFallbackQuery(tag);

		const prompt = getVibePrompt()
			.replace("{tag}", tag)
			.replace("{todos}", todoSummary || "(empty — no content yet)");

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
		console.debug("[giphy-source] Vibe generation failed:", err);
		return getFallbackQuery(tag);
	}
}

/** Clear the vibe query cache (useful on session switch). */
export function clearVibeCache(): void {
	vibeQueryCache.clear();
}
