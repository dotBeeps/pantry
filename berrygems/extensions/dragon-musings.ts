/**
 * Dragon Musings — Whimsical contextual thinking spinner for pi.
 *
 * The hoard is never silent while the dragon thinks. This extension replaces
 * the default working message with living, breathing phrases that shift with
 * what the agent is actually doing — generated fresh by a cheap LLM, then
 * cached and cycled until the next turn begins anew.
 *
 * Features:
 * - Hooks before_provider_request to swap in custom spinner text
 * - Reads the last few messages + recent tool calls for context
 * - Fires a single fast/cheap LLM call (Haiku first, then fallbacks) to
 *   generate 8 themed phrases tailored to what's happening right now
 * - Caches generated phrases and cycles through them every ~2 seconds
 * - Falls back to a static 30-phrase list if generation fails or is disabled
 * - Cycles automatically during streaming; resets cleanly on turn_end
 * - Configurable via hoard.musings.* settings
 *
 * Themes: dragons, small dogs, hoarding, warmth, smoke, gems, cozy coding.
 * Because waiting should feel like curling up by a fire, not staring at a dot.
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { complete, type UserMessage } from "@mariozechner/pi-ai";
import { readHoardSetting } from "../lib/settings.ts";

// ── Settings ──

/** Master switch. */
function isEnabled(): boolean {
	return readHoardSetting("musings.enabled", true);
}

/** Whether to fire LLM calls to generate contextual phrases. */
function isContextualEnabled(): boolean {
	return readHoardSetting("musings.generateContextual", true);
}

/** Milliseconds between phrase changes in the spinner. */
function getCycleMs(): number {
	return readHoardSetting("musings.cycleMs", 2000);
}

/**
 * How many turns to reuse generated phrases before regenerating.
 * 0 = regenerate every turn (expensive), default 4.
 */
function getCacheTurns(): number {
	return readHoardSetting("musings.cacheTurns", 4);
}

/**
 * Maximum LLM generation calls per session. 0 = unlimited.
 * Prevents runaway token spend in long sessions.
 */
function getMaxGenerations(): number {
	return readHoardSetting("musings.maxGenerations", 20);
}

/**
 * Custom generation prompt template. Placeholders:
 *   {context} — auto-extracted summary of recent activity
 * Empty string = use built-in default.
 */
function getCustomPrompt(): string {
	return readHoardSetting("musings.prompt", "");
}

/**
 * Preferred model for generation, e.g. "anthropic/claude-haiku-4-5".
 * Format: "provider/modelId" or just "modelId" (scans all providers).
 * Empty string = auto-select cheapest available.
 */
function getPreferredModel(): string {
	return readHoardSetting("musings.model", "");
}

// ── Static Fallback Phrases ──
// Used when LLM generation fails or is disabled. Rich enough to feel alive.

const STATIC_PHRASES: string[] = [
	"Warming the hoard...",
	"Sniffing out a solution...",
	"Digesting your request...",
	"Curling around the codebase...",
	"Tucking pup in for a think...",
	"Rummaging through treasures...",
	"Polishing a gem...",
	"Dragon breath compiling...",
	"Sitting on the problem...",
	"Counting the gold...",
	"Breathing on cold logic...",
	"Nose deep in the tome...",
	"Small dog, big thoughts...",
	"Scales rustling softly...",
	"Mining a deeper seam...",
	"Unfolding leathery wings...",
	"Following the scent...",
	"Sorting through the hoard...",
	"Puppy dreams of clean code...",
	"Smoking quietly...",
	"Filing gems by color...",
	"Listening to the bytes...",
	"Consulting the ancient scroll...",
	"Tail curled around the problem...",
	"Hoarding a useful thought...",
	"Paws tapping the floor...",
	"Ember glow, slow thoughts...",
	"Scenting the answer nearby...",
	"Very cozy. Still thinking...",
	"One more layer of the hoard...",
];

// ── LLM Phrase Generation ──

const DEFAULT_GENERATION_SYSTEM_PROMPT = `You generate short whimsical loading phrases for a coding agent named Ember (a dragon who works with a small dog).
Return exactly 8 phrases, one per line.
Rules:
- Max 6 words each
- No punctuation at the end except "..."
- No numbering, bullets, or labels
- Theme: dragons, small dogs, hoarding, warmth, gems, cozy coding
- Vary sentence openings — don't start more than 2 phrases the same way
- Base them loosely on the provided context`;

/** Max characters per placeholder field. */
const PLACEHOLDER_LIMIT = 500;

/** Extract text from a message content (string or content array). */
function extractText(content: unknown, limit: number): string {
	if (typeof content === "string") return content.slice(0, limit).trim();
	if (!Array.isArray(content)) return "";
	return content
		.filter((c: any) => c.type === "text")
		.map((c: any) => String(c.text ?? ""))
		.join(" ")
		.slice(0, limit)
		.trim();
}

/**
 * Walk the branch and extract last user message, last assistant text,
 * and a recent-activity summary. Returns an object of placeholder values.
 */
function buildPlaceholders(ctx: ExtensionContext): Record<string, string> {
	let userLastMsg = "";
	let aiLastMsg = "";
	const recentParts: string[] = [];

	try {
		const branch = ctx.sessionManager.getBranch();
		const recent = branch.slice(-8);

		for (const entry of recent) {
			if (entry.type !== "message") continue;
			const msg = (entry as any).message;
			if (!msg) continue;

			if (msg.role === "user") {
				const text = extractText(msg.content, PLACEHOLDER_LIMIT);
				if (text) {
					userLastMsg = text; // keep overwriting — last one wins
					recentParts.push(`User: ${text.slice(0, 120)}`);
				}
			} else if (msg.role === "assistant") {
				// Extract text content (skip thinking/tool_use blocks)
				const text = extractText(
					Array.isArray(msg.content)
						? msg.content.filter((c: any) => c.type === "text")
						: msg.content,
					PLACEHOLDER_LIMIT,
				);
				if (text) aiLastMsg = text; // last one wins

				// Also collect tool names for the summary
				if (Array.isArray(msg.content)) {
					for (const block of msg.content) {
						if ((block as any).type === "toolCall" || (block as any).type === "tool_use") {
							const name = (block as any).name ?? "unknown tool";
							recentParts.push(`Tool: ${name}`);
						}
					}
				}
			}
		}
	} catch {
		// Session may not be available
	}

	const contextRecent = recentParts.length > 0
		? recentParts.slice(-6).join(". ").slice(0, PLACEHOLDER_LIMIT)
		: "general coding work";

	return {
		"{user_last_msg}": userLastMsg || "(no user message yet)",
		"{ai_last_msg}": aiLastMsg || "(no assistant message yet)",
		"{context_recent}": contextRecent,
		"{context}": contextRecent, // backward compat
	};
}

function resolveModel(ctx: ExtensionContext) {
	const pref = getPreferredModel();
	if (pref) {
		// "provider/modelId" or bare "modelId"
		const slash = pref.indexOf("/");
		if (slash > 0) {
			const provider = pref.slice(0, slash);
			const modelId = pref.slice(slash + 1);
			const found = ctx.modelRegistry.find(provider, modelId);
			if (found) return found;
		} else {
			// Scan all known providers for a match
			for (const provider of ["anthropic", "google", "openai"]) {
				const found = ctx.modelRegistry.find(provider, pref);
				if (found) return found;
			}
		}
	}

	// Auto-select cheapest available
	return (
		ctx.modelRegistry.find("anthropic", "claude-haiku-4-5") ??
		ctx.modelRegistry.find("anthropic", "claude-haiku-4-5-20251001") ??
		ctx.modelRegistry.find("anthropic", "claude-haiku-3-5-20241022") ??
		ctx.modelRegistry.find("google", "gemini-2.0-flash-lite") ??
		ctx.modelRegistry.find("google", "gemini-2.0-flash") ??
		ctx.model ?? // last resort: current model
		null
	);
}

async function generatePhrases(ctx: ExtensionContext): Promise<string[]> {
	const model = resolveModel(ctx);
	if (!model) return [];

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return [];

	const placeholders = buildPlaceholders(ctx);

	// Build the user prompt — custom template with placeholders or default
	const custom = getCustomPrompt();
	let userText: string;
	if (custom) {
		userText = custom;
		for (const [key, value] of Object.entries(placeholders)) {
			userText = userText.replaceAll(key, value);
		}
	} else {
		userText = `Generate 8 short, whimsical loading phrases (max 6 words each) themed around dragons, small dogs, hoarding knowledge, warmth, and coding. Base them loosely on this context: ${placeholders["{context_recent}"]!}. Return one phrase per line, no numbering, no punctuation at end except "..."`;
	}

	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: userText }],
		timestamp: Date.now(),
	};

	const systemPrompt = custom ? "Return exactly 8 short phrases, one per line. No numbering or labels." : DEFAULT_GENERATION_SYSTEM_PROMPT;

	const response = await complete(
		model,
		{ systemPrompt, messages: [userMessage] },
		{ apiKey: auth.apiKey, headers: auth.headers },
	);

	const text = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n")
		.trim();

	const phrases = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && line.length < 60)
		.slice(0, 10);

	return phrases.length >= 3 ? phrases : [];
}

// ── Phrase Cache & Cycling ──

/** Simple Fisher-Yates shuffle (in-place). */
function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j]!, arr[i]!];
	}
	return arr;
}

/** Blend generated phrases with a few random static ones, dedupe, shuffle. */
function blendAndShuffle(generated: string[], recentlySeen: Set<string>): string[] {
	// Pick 3 random static phrases for variety
	const staticPicks = shuffle([...STATIC_PHRASES]).slice(0, 3);
	const combined = [...generated, ...staticPicks];

	// Dedupe against recently seen phrases (case-insensitive)
	const unique = combined.filter((p) => !recentlySeen.has(p.toLowerCase()));

	// If deduping killed too many, fall back to the generated set as-is
	const result = unique.length >= 3 ? unique : combined;
	return shuffle(result);
}

interface PhraseState {
	phrases: string[];
	index: number;
}

function pickFallback(state: PhraseState): string {
	const phrase = STATIC_PHRASES[state.index % STATIC_PHRASES.length]!;
	state.index = (state.index + 1) % STATIC_PHRASES.length;
	return phrase;
}

function pickNext(state: PhraseState): string {
	if (state.phrases.length === 0) return pickFallback(state);
	const phrase = state.phrases[state.index % state.phrases.length]!;
	state.index = (state.index + 1) % state.phrases.length;
	return phrase;
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
	let cycleInterval: ReturnType<typeof setInterval> | null = null;
	let ctxRef: ExtensionContext | null = null;

	// Generation rate-limiting state
	let generationsThisSession = 0;
	let turnsSinceLastGeneration = 0;
	let generationInFlight = false; // prevent concurrent generation
	let turnCount = 0;

	// Track recently seen phrases to avoid repetition across generations
	const recentlySeen = new Set<string>();
	const MAX_RECENTLY_SEEN = 60;

	const state: PhraseState = {
		phrases: [],
		index: Math.floor(Math.random() * STATIC_PHRASES.length),
	};

	function stopCycling(): void {
		if (cycleInterval !== null) {
			clearInterval(cycleInterval);
			cycleInterval = null;
		}
	}

	function startCycling(ctx: ExtensionContext): void {
		stopCycling();
		if (ctx.hasUI) ctx.ui.setWorkingMessage(pickNext(state));

		const ms = getCycleMs();
		cycleInterval = setInterval(() => {
			if (ctxRef?.hasUI) {
				ctxRef.ui.setWorkingMessage(pickNext(state));
			}
		}, ms);
	}

	/** Whether we should fire a generation call this turn. */
	function shouldGenerate(): boolean {
		if (!isContextualEnabled()) return false;

		// Respect session budget
		const maxGen = getMaxGenerations();
		if (maxGen > 0 && generationsThisSession >= maxGen) return false;

		// Respect cache lifetime — only regenerate every N turns
		const cacheTurns = getCacheTurns();
		if (state.phrases.length >= 3 && turnsSinceLastGeneration < cacheTurns) return false;

		return true;
	}

	// before_provider_request fires before EACH LLM call in a turn.
	// We only generate once per turn (guarded by generationInFlight + turnCount).
	pi.on("before_provider_request", async (_event, ctx) => {
		if (!isEnabled()) return;

		ctxRef = ctx;

		// Start cycling from cached phrases or fallback — always instant
		if (!cycleInterval) {
			state.index = state.phrases.length > 0
				? 0
				: Math.floor(Math.random() * STATIC_PHRASES.length);
			startCycling(ctx);
		}

		// Only fire generation once per turn (first before_provider_request)
		if (generationInFlight) return;

		if (shouldGenerate()) {
			generationInFlight = true;
			generatePhrases(ctx)
				.then((phrases) => {
					if (phrases.length >= 3) {
						state.phrases = blendAndShuffle(phrases, recentlySeen);
						state.index = 0;

						// Record these as seen
						for (const p of state.phrases) recentlySeen.add(p.toLowerCase());
						// Evict oldest if the set grows too large
						if (recentlySeen.size > MAX_RECENTLY_SEEN) {
							const iter = recentlySeen.values();
							while (recentlySeen.size > MAX_RECENTLY_SEEN) {
								const oldest = iter.next();
								if (oldest.done) break;
								recentlySeen.delete(oldest.value);
							}
						}
					}
					generationsThisSession++;
					turnsSinceLastGeneration = 0;
				})
				.catch(() => {
					// Silent fallback — generation is best-effort
				})
				.finally(() => {
					generationInFlight = false;
				});
		}
	});

	pi.on("turn_end", async (_event, ctx) => {
		stopCycling();
		if (ctx.hasUI) ctx.ui.setWorkingMessage(); // restore pi default
		generationInFlight = false;
		turnCount++;
		turnsSinceLastGeneration++;
		// DON'T clear phrases — reuse cached ones until cacheTurns expires
	});

	pi.on("session_start", async () => {
		stopCycling();
		state.phrases = [];
		state.index = Math.floor(Math.random() * STATIC_PHRASES.length);
		generationsThisSession = 0;
		turnsSinceLastGeneration = 0;
		generationInFlight = false;
		turnCount = 0;
		recentlySeen.clear();
		ctxRef = null;
	});

	pi.on("session_shutdown", async () => {
		stopCycling();
		ctxRef = null;
	});

	// /musings command — show current settings and generation stats
	pi.registerCommand("musings", {
		description: "Show dragon musings settings and generation stats",
		handler: async (_args, ctx) => {
			const maxGen = getMaxGenerations();
			const budgetLabel = maxGen > 0 ? `${generationsThisSession}/${maxGen}` : `${generationsThisSession} (unlimited)`;
			const modelPref = getPreferredModel() || "(auto — cheapest available)";
			const customPrompt = getCustomPrompt();

			const lines = [
				"🐉 Dragon Musings — Status",
				"",
				`  Enabled          ${isEnabled() ? "yes" : "no"}`,
				`  Contextual gen   ${isContextualEnabled() ? "yes" : "no"}`,
				`  Cycle speed      ${getCycleMs()}ms`,
				`  Cache lifetime   ${getCacheTurns()} turns`,
				`  Session budget   ${budgetLabel}`,
				`  Model            ${modelPref}`,
				`  Custom prompt    ${customPrompt ? "yes (" + customPrompt.length + " chars)" : "no (using default)"}`,
				"",
				`  Session turns    ${turnCount}`,
				`  Turns since gen  ${turnsSinceLastGeneration}`,
				`  Cached phrases   ${state.phrases.length}`,
				"",
				"  Settings: hoard.musings.{enabled,generateContextual,cycleMs,",
				"    cacheTurns,maxGenerations,model,prompt}",
				"",
				"  Prompt placeholders:",
				"    {user_last_msg}    last user message (500 chars)",
				"    {ai_last_msg}      last assistant text (500 chars)",
				"    {context_recent}   recent activity summary (500 chars)",
				"    {context}          alias for {context_recent}",
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
