/**
 * Dragon Musings — Whimsical dialectic thinking spinner for pi.
 *
 * The hoard is never silent while the dragon thinks. This extension replaces
 * the default working message with short, contextual loading phrases generated
 * in batches from a rolling summary of the current session.
 *
 * Features:
 * - Hooks before_provider_request to swap in custom spinner text
 * - Every N user prompts (default 4), asks a cheap model to compare the latest
 *   user/agent tail against the previous summary
 * - Persists a <250 word session-status summary plus a configurable phrase pack
 *   (default 50 phrases, each <4 words)
 * - Dialectic flavor: thesis, antithesis, synthesis, evidence, counterpoint
 * - Caches generated phrases between refreshes and cycles through them
 * - Falls back to static short phrases if generation fails or is disabled
 * - Configurable via pantry.musings.* settings
 *
 * A small dog and a large dragon made this together.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { complete, type UserMessage } from "@earendil-works/pi-ai";
import { readPantrySetting } from "../lib/settings.ts";

// ── Settings ──

/** Master switch. */
function isEnabled(): boolean {
  return readPantrySetting("musings.enabled", true);
}

/** Whether to fire LLM calls to generate contextual summaries and phrases. */
function isContextualEnabled(): boolean {
  return readPantrySetting("musings.generateContextual", true);
}

/** Milliseconds between phrase changes in the spinner. */
function getCycleMs(): number {
  return Math.max(250, readPantrySetting("musings.cycleMs", 2000));
}

/**
 * How many user prompts to reuse a phrase pack before regenerating.
 * 0 = regenerate every user prompt.
 *
 * `cacheTurns` remains as a backwards-compatible fallback for older configs.
 */
function getRefreshPrompts(): number {
  const configured = readPantrySetting(
    "musings.refreshPrompts",
    readPantrySetting("musings.cacheTurns", 4),
  );
  return Math.max(0, Math.floor(configured));
}

/** How many short loading messages to ask for. */
function getMessageCount(): number {
  return Math.max(
    1,
    Math.min(100, Math.floor(readPantrySetting("musings.messageCount", 50))),
  );
}

/**
 * Maximum LLM generation calls per session. 0 = unlimited.
 * Prevents runaway token spend in long sessions.
 */
function getMaxGenerations(): number {
  return Math.max(
    0,
    Math.floor(readPantrySetting("musings.maxGenerations", 20)),
  );
}

/**
 * Custom generation prompt template. Placeholders:
 *   {previous_summary} — last saved summary, or initial-summary marker
 *   {user_tail}        — latest user messages
 *   {agent_tail}       — latest assistant text/tool activity
 *   {context_recent}   — compact recent activity
 *   {message_count}    — configured number of loading messages
 *   {context}          — alias for context_recent
 * Empty string = use built-in default.
 */
function getCustomPrompt(): string {
  return readPantrySetting("musings.prompt", "");
}

/**
 * Preferred model for generation, e.g. "anthropic/claude-haiku-4-5".
 * Format: "provider/modelId" or just "modelId" (scans all providers).
 * Empty string = auto-select cheapest available.
 */
function getPreferredModel(): string {
  return readPantrySetting("musings.model", "");
}

// ── Static Fallback Phrases ──
// Keep every fallback below four words.

const STATIC_PHRASES: string[] = [
  "Thesis warming",
  "Antithesis sniffing",
  "Synthesis nesting",
  "Evidence glittering",
  "Counterpoint glowing",
  "Premise polishing",
  "Claim curling",
  "Doubt simmering",
  "Proof hoarded",
  "Logic rumbling",
  "Tiny thesis",
  "Pup premise",
  "Dragon considers",
  "Hoard compares",
  "Tail annotates",
  "Smoke footnotes",
  "Gem remembers",
  "Warm inference",
  "Question hatches",
  "Answer broods",
  "Context steeping",
  "Pattern scenting",
  "Assumption booped",
  "Argument purring",
  "Tension softens",
  "Caveat curls",
  "Model mulls",
  "Archive stirs",
  "Scrolls whisper",
  "Claws index",
  "Premises align",
  "Edges glow",
  "Thread tugged",
  "Signal found",
  "Meaning ferments",
  "Pup tucked",
  "Dragon rereads",
  "Inference chews",
  "Map unfolding",
  "Hoard hums",
  "Claim meets",
  "Evidence answers",
  "Sparks compare",
  "Warm recursion",
  "Tiny counterclaim",
  "Dialectic dozes",
  "Logic cuddled",
  "Question circled",
  "Pattern warmed",
  "Gem triangulates",
];

// ── LLM Summary + Phrase Generation ──

const MUSINGS_STATE_ENTRY = "dragon-musings-state";

const DEFAULT_GENERATION_SYSTEM_PROMPT = `You generate session summaries and very short dialectic loading phrases for a coding agent dragon working with dot, a tiny dog.
Return ONLY valid JSON with this shape:
{
  "summary": "<250 words, updated session-status summary>",
  "messages": ["phrase", "phrase"]
}
Rules:
- The summary must compare the previous summary with the latest user tail and agent tail.
- If there is no previous summary, create an initial summary from the current tails.
- Generate exactly the requested number of messages.
- Every message must be fewer than 4 words (1-3 words).
- No numbering, bullets, labels, markdown, or trailing punctuation except ellipses.
- Flavor: dialectic, thesis/antithesis/synthesis, evidence, counterpoint, archive-dragon warmth.
- Keep messages varied and useful for a thinking/loading spinner.`;

/** Max characters per extracted context field. */
const FIELD_LIMIT = 900;
const RECENT_LIMIT = 1400;

interface SessionTail {
  userTail: string;
  agentTail: string;
  recent: string;
  userPromptCount: number;
}

interface MusingsSnapshot {
  summary: string;
  phrases: string[];
  generatedAtPromptCount: number;
  generationsThisSession: number;
}

interface PhraseState {
  phrases: string[];
  index: number;
  summary: string;
  generatedAtPromptCount: number;
}

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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sanitizeSummary(summary: string): string {
  const words = summary
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 249).join(" ");
}

function stripPhrasePrefix(line: string): string {
  return line
    .replace(/^[-*•\s]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^messages?:\s*/i, "")
    .replace(/^phrase:\s*/i, "")
    .replace(/^['\"]|['\"]$/g, "")
    .trim();
}

function sanitizePhrase(line: string): string | null {
  const cleaned = stripPhrasePrefix(line)
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > 48) return null;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.slice(0, 3).join(" ");
}

function fillPhraseSet(phrases: string[], count: number, recentlySeen: Set<string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  function add(phrase: string, allowRecent: boolean): void {
    const sanitized = sanitizePhrase(phrase);
    if (!sanitized) return;
    const key = sanitized.toLowerCase();
    if (seen.has(key)) return;
    if (!allowRecent && recentlySeen.has(key)) return;
    seen.add(key);
    result.push(sanitized);
  }

  for (const phrase of phrases) add(phrase, false);
  for (const phrase of shuffle([...STATIC_PHRASES])) add(phrase, false);
  for (const phrase of phrases) add(phrase, true);
  for (const phrase of shuffle([...STATIC_PHRASES])) add(phrase, true);

  let i = 0;
  while (result.length < count) {
    add(STATIC_PHRASES[i % STATIC_PHRASES.length]!, true);
    i++;
    if (i > STATIC_PHRASES.length * 2) break;
  }

  return shuffle(result).slice(0, count);
}

function buildSessionTail(ctx: ExtensionContext): SessionTail {
  const userParts: string[] = [];
  const agentParts: string[] = [];
  const recentParts: string[] = [];
  let userPromptCount = 0;

  try {
    const branch = ctx.sessionManager.getBranch();
    const recent = branch.slice(-14);

    for (const entry of branch) {
      if (entry.type !== "message") continue;
      const msg = (entry as any).message;
      if (msg?.role === "user") userPromptCount++;
    }

    for (const entry of recent) {
      if (entry.type !== "message") continue;
      const msg = (entry as any).message;
      if (!msg) continue;

      if (msg.role === "user") {
        const text = extractText(msg.content, FIELD_LIMIT);
        if (text) {
          userParts.push(text);
          recentParts.push(`User: ${text.slice(0, 180)}`);
        }
      } else if (msg.role === "assistant") {
        const text = extractText(
          Array.isArray(msg.content)
            ? msg.content.filter((c: any) => c.type === "text")
            : msg.content,
          FIELD_LIMIT,
        );
        if (text) {
          agentParts.push(text);
          recentParts.push(`Agent: ${text.slice(0, 180)}`);
        }

        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (
              (block as any).type === "toolCall" ||
              (block as any).type === "tool_use"
            ) {
              const name = (block as any).name ?? "unknown tool";
              agentParts.push(`Used ${name}`);
              recentParts.push(`Tool: ${name}`);
            }
          }
        }
      }
    }
  } catch {
    // Session may not be available during early startup.
  }

  return {
    userTail: userParts.slice(-3).join("\n---\n").slice(0, FIELD_LIMIT),
    agentTail: agentParts.slice(-4).join("\n---\n").slice(0, FIELD_LIMIT),
    recent:
      recentParts.length > 0
        ? recentParts.slice(-8).join("\n").slice(0, RECENT_LIMIT)
        : "general coding work",
    userPromptCount,
  };
}

function buildPlaceholders(
  tail: SessionTail,
  previousSummary: string,
  messageCount: number,
): Record<string, string> {
  return {
    "{previous_summary}": previousSummary || "(none — create initial summary)",
    "{user_tail}": tail.userTail || "(no user tail yet)",
    "{agent_tail}": tail.agentTail || "(no agent tail yet)",
    "{context_recent}": tail.recent,
    "{context}": tail.recent,
    "{message_count}": String(messageCount),
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
      // Scan all known providers for a match.
      for (const provider of ["anthropic", "google", "openai", "zai", "github-copilot"]) {
        const found = ctx.modelRegistry.find(provider, pref);
        if (found) return found;
      }
    }
  }

  // Auto-select cheapest available — github-copilot is free in many setups,
  // ZAI flash is cheap, Anthropic/Google are fallbacks.
  return (
    ctx.modelRegistry.find("github-copilot", "claude-haiku-4-5") ??
    ctx.modelRegistry.find("zai", "glm-4.7-flashx") ??
    ctx.modelRegistry.find("zai", "glm-4.7-flash") ??
    ctx.modelRegistry.find("anthropic", "claude-haiku-4-5") ??
    ctx.modelRegistry.find("google", "gemini-2.0-flash-lite") ??
    ctx.modelRegistry.find("google", "gemini-2.0-flash") ??
    ctx.model ??
    null
  );
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function parseGenerationResponse(text: string): { summary: string; phrases: string[] } {
  const parsed = extractJsonObject(text) as
    | { summary?: unknown; messages?: unknown; phrases?: unknown }
    | null;

  if (parsed) {
    const rawMessages = Array.isArray(parsed.messages)
      ? parsed.messages
      : Array.isArray(parsed.phrases)
        ? parsed.phrases
        : [];
    return {
      summary: typeof parsed.summary === "string" ? sanitizeSummary(parsed.summary) : "",
      phrases: rawMessages
        .map((value) => sanitizePhrase(String(value)))
        .filter((value): value is string => Boolean(value)),
    };
  }

  // Lenient fallback for non-JSON responses.
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const summaryLine = lines.find((line) => /^summary\s*:/i.test(line));
  const summary = summaryLine
    ? sanitizeSummary(summaryLine.replace(/^summary\s*:/i, ""))
    : "";
  const phrases = lines
    .filter((line) => !/^summary\s*:/i.test(line))
    .map(sanitizePhrase)
    .filter((value): value is string => Boolean(value));

  return { summary, phrases };
}

async function generateMusings(
  ctx: ExtensionContext,
  previousSummary: string,
  messageCount: number,
): Promise<{ summary: string; phrases: string[]; promptCount: number } | null> {
  const model = resolveModel(ctx);
  if (!model) return null;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  const tail = buildSessionTail(ctx);
  const placeholders = buildPlaceholders(tail, previousSummary, messageCount);

  const custom = getCustomPrompt();
  let userText: string;
  if (custom) {
    userText = custom;
    for (const [key, value] of Object.entries(placeholders)) {
      userText = userText.replaceAll(key, value);
    }
  } else {
    userText = [
      `Previous summary:\n${placeholders["{previous_summary}"]}`,
      `Latest user tail:\n${placeholders["{user_tail}"]}`,
      `Latest agent tail:\n${placeholders["{agent_tail}"]}`,
      `Recent activity:\n${placeholders["{context_recent}"]}`,
      `Create an updated session-status summary under 250 words. Then generate exactly ${messageCount} dialectic loading messages, each fewer than 4 words. Return only JSON.`,
    ].join("\n\n");
  }

  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text: userText }],
    timestamp: Date.now(),
  };

  const systemPrompt = custom
    ? [
        DEFAULT_GENERATION_SYSTEM_PROMPT,
        "The custom user prompt may add style guidance, but you must still return the required JSON shape.",
      ].join("\n")
    : DEFAULT_GENERATION_SYSTEM_PROMPT;

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

  const parsed = parseGenerationResponse(text);
  const summary = parsed.summary || previousSummary;
  if (!summary && parsed.phrases.length === 0) return null;

  return {
    summary:
      summary ||
      "Initial session context captured; the dragon is comparing the latest request with the working tail.",
    phrases: parsed.phrases,
    promptCount: tail.userPromptCount,
  };
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

function restoreSnapshot(ctx: ExtensionContext): MusingsSnapshot | null {
  try {
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as {
        type?: string;
        customType?: string;
        data?: Partial<MusingsSnapshot>;
      };
      if (entry.type !== "custom" || entry.customType !== MUSINGS_STATE_ENTRY) continue;
      if (!entry.data) continue;
      return {
        summary: typeof entry.data.summary === "string" ? entry.data.summary : "",
        phrases: Array.isArray(entry.data.phrases)
          ? entry.data.phrases
              .map(String)
              .map(sanitizePhrase)
              .filter((p): p is string => Boolean(p))
          : [],
        generatedAtPromptCount:
          typeof entry.data.generatedAtPromptCount === "number"
            ? entry.data.generatedAtPromptCount
            : 0,
        generationsThisSession:
          typeof entry.data.generationsThisSession === "number"
            ? entry.data.generationsThisSession
            : 0,
      };
    }
  } catch {
    // Ignore restore failures; musings are decorative.
  }
  return null;
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  let cycleInterval: ReturnType<typeof setInterval> | null = null;
  let ctxRef: ExtensionContext | null = null;

  // Generation rate-limiting state.
  let generationsThisSession = 0;
  let generationInFlight = false; // Prevent concurrent generation.
  let lastSeenUserPromptCount = 0;

  // Track recently seen phrases to avoid repetition across generations.
  const recentlySeen = new Set<string>();
  const MAX_RECENTLY_SEEN = 160;

  const state: PhraseState = {
    phrases: [],
    index: Math.floor(Math.random() * STATIC_PHRASES.length),
    summary: "",
    generatedAtPromptCount: 0,
  };

  function snapshot(): MusingsSnapshot {
    return {
      summary: state.summary,
      phrases: state.phrases,
      generatedAtPromptCount: state.generatedAtPromptCount,
      generationsThisSession,
    };
  }

  function save(ctx: ExtensionContext): void {
    pi.appendEntry(MUSINGS_STATE_ENTRY, snapshot());
    ctxRef = ctx;
  }

  function rememberPhrases(phrases: string[]): void {
    for (const phrase of phrases) recentlySeen.add(phrase.toLowerCase());
    if (recentlySeen.size <= MAX_RECENTLY_SEEN) return;

    const iter = recentlySeen.values();
    while (recentlySeen.size > MAX_RECENTLY_SEEN) {
      const oldest = iter.next();
      if (oldest.done) break;
      recentlySeen.delete(oldest.value);
    }
  }

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

  function currentUserPromptCount(ctx: ExtensionContext): number {
    return buildSessionTail(ctx).userPromptCount;
  }

  /** Whether we should fire a generation call for the current user prompt. */
  function shouldGenerate(ctx: ExtensionContext): boolean {
    if (!isContextualEnabled()) return false;

    const maxGen = getMaxGenerations();
    if (maxGen > 0 && generationsThisSession >= maxGen) return false;

    const promptCount = currentUserPromptCount(ctx);
    lastSeenUserPromptCount = Math.max(lastSeenUserPromptCount, promptCount);

    // Initial summary/phrase pack.
    if (!state.summary || state.phrases.length < Math.min(3, getMessageCount())) {
      return true;
    }

    const refreshPrompts = getRefreshPrompts();
    if (refreshPrompts === 0) {
      return promptCount > state.generatedAtPromptCount;
    }

    return promptCount - state.generatedAtPromptCount >= refreshPrompts;
  }

  function resetVolatileState(): void {
    stopCycling();
    state.phrases = [];
    state.index = Math.floor(Math.random() * STATIC_PHRASES.length);
    state.summary = "";
    state.generatedAtPromptCount = 0;
    generationsThisSession = 0;
    generationInFlight = false;
    lastSeenUserPromptCount = 0;
    recentlySeen.clear();
    ctxRef = null;
  }

  function restoreState(ctx: ExtensionContext): void {
    resetVolatileState();
    const restored = restoreSnapshot(ctx);
    if (!restored) return;

    state.summary = sanitizeSummary(restored.summary);
    state.phrases = fillPhraseSet(
      restored.phrases,
      Math.min(restored.phrases.length || getMessageCount(), getMessageCount()),
      recentlySeen,
    );
    state.generatedAtPromptCount = restored.generatedAtPromptCount;
    state.index = 0;
    generationsThisSession = restored.generationsThisSession;
    rememberPhrases(state.phrases);
    lastSeenUserPromptCount = currentUserPromptCount(ctx);
    ctxRef = ctx;
  }

  // before_provider_request fires before each LLM call in a turn.
  pi.on("before_provider_request", async (_event, ctx) => {
    if (!isEnabled()) return;
    if (!ctx.hasUI) return; // Subagents have no TUI — skip musings entirely.

    ctxRef = ctx;

    // Start cycling from cached phrases or fallback — always instant.
    if (!cycleInterval) {
      state.index =
        state.phrases.length > 0
          ? 0
          : Math.floor(Math.random() * STATIC_PHRASES.length);
      startCycling(ctx);
    }

    if (generationInFlight) return;
    if (!shouldGenerate(ctx)) return;

    generationInFlight = true;
    const requestedCount = getMessageCount();
    const previousSummary = state.summary;

    generateMusings(ctx, previousSummary, requestedCount)
      .then((generated) => {
        if (!generated) return;

        state.summary = sanitizeSummary(generated.summary);
        state.phrases = fillPhraseSet(generated.phrases, requestedCount, recentlySeen);
        state.generatedAtPromptCount = generated.promptCount;
        state.index = 0;
        rememberPhrases(state.phrases);
        generationsThisSession++;
        save(ctx);
      })
      .catch(() => {
        // Silent fallback — generation is best-effort decoration.
      })
      .finally(() => {
        generationInFlight = false;
      });
  });

  pi.on("turn_end", async (_event, ctx) => {
    stopCycling();
    if (ctx.hasUI) ctx.ui.setWorkingMessage(); // Restore pi default.
    generationInFlight = false;
    lastSeenUserPromptCount = currentUserPromptCount(ctx);
    // Do not clear phrases — reuse cached pack until refreshPrompts expires.
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreState(ctx);
  });

  pi.on("session_before_switch", async (_event, ctx) => {
    restoreState(ctx);
  });

  pi.on("session_shutdown", async () => {
    stopCycling();
    ctxRef = null;
  });

  // /musings command — show current settings and generation stats.
  pi.registerCommand("musings", {
    description: "Show dragon musings settings and generation stats",
    handler: async (_args, ctx) => {
      const maxGen = getMaxGenerations();
      const budgetLabel =
        maxGen > 0
          ? `${generationsThisSession}/${maxGen}`
          : `${generationsThisSession} (unlimited)`;
      const modelPref = getPreferredModel() || "(auto — cheapest available)";
      const customPrompt = getCustomPrompt();
      const promptCount = currentUserPromptCount(ctx);
      const promptDelta = Math.max(0, promptCount - state.generatedAtPromptCount);

      const lines = [
        "🐉 Dragon Musings — Status",
        "",
        `  Enabled            ${isEnabled() ? "yes" : "no"}`,
        `  Contextual gen     ${isContextualEnabled() ? "yes" : "no"}`,
        `  Cycle speed        ${getCycleMs()}ms`,
        `  Refresh cadence    ${getRefreshPrompts()} user prompts`,
        `  Message count      ${getMessageCount()}`,
        `  Session budget     ${budgetLabel}`,
        `  Model              ${modelPref}`,
        `  Custom prompt      ${
          customPrompt ? "yes (" + customPrompt.length + " chars)" : "no (using default)"
        }`,
        "",
        `  User prompts       ${promptCount}`,
        `  Prompts since gen  ${promptDelta}`,
        `  Cached messages    ${state.phrases.length}`,
        `  Summary words      ${countWords(state.summary)}`,
        "",
        state.summary ? `  Summary: ${state.summary}` : "  Summary: (not generated yet)",
        "",
        "  Settings: pantry.musings.{enabled,generateContextual,cycleMs,",
        "    refreshPrompts,messageCount,maxGenerations,model,prompt}",
        "",
        "  Prompt placeholders:",
        "    {previous_summary} last saved summary",
        "    {user_tail}        latest user messages",
        "    {agent_tail}       latest assistant/tool tail",
        "    {context_recent}   compact recent activity",
        "    {message_count}    configured message count",
        "    {context}          alias for {context_recent}",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
