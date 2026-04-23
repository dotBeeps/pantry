/**
 * Digestion Settings - Live-tweakable floating panel for compaction configuration.
 *
 * Because when a dragon processes context, it's not "compaction" - it's digestion.
 *
 * Features:
 * - Non-blocking overlay panel showing current compaction settings + context usage
 * - Toggle auto-compaction on/off, adjust reserveTokens and keepRecentTokens
 * - Trigger modes: Reserve (raw tokens), Percentage (% of context), Fixed (token threshold)
 * - Strategy presets for manual compaction (Default / Code / Task / Minimal)
 * - Threshold marker on the context bar showing where compaction triggers
 * - Last compaction stats - timestamp, token savings, percentage freed
 * - Writes changes to project .pi/settings.json for persistence across sessions
 * - Hooks session_before_compact as a safety net for live enforcement
 * - `/digestion` command to open/close the panel
 * - Alt+C shortcut to toggle panel visibility
 * - Press `g` when focused to copy values from global config
 * - Context usage bar updates on turn_end events
 *
 * A small dog and a large dragon made this together.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";
import type { TUI } from "@mariozechner/pi-tui";
import { matchesKey, Key } from "@mariozechner/pi-tui";
import {
  renderHeader,
  renderFooter,
  padContentLine,
  type ChromeOptions,
} from "../lib/panel-chrome.ts";
import { complete, type UserMessage } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
  buildFirstCompactionPrompt,
  buildAnchoredUpdatePrompt,
  STRATEGY_PRESETS,
  type StrategyPreset,
} from "../lib/compaction-templates.ts";

// ── Panel Manager Access ──
const PANELS_KEY = Symbol.for("pantry.parchment");
function getPanels(): any {
  return (globalThis as any)[PANELS_KEY];
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import {
  readPantryKey,
  readProjectPantrySetting,
  writeProjectPantrySetting,
  keyLabel,
} from "../lib/settings.ts";

// ── Local Types ──

interface PanelContext {
  tui: TUI;
  theme: Theme;
  cwd: string;
  isFocused: () => boolean;
  skin: () => import("../lib/panel-chrome.ts").PanelSkin;
}

// ── Types ──

type TriggerMode = "reserve" | "percentage" | "fixed";

interface CompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

interface DigestSettings {
  triggerMode: TriggerMode;
  triggerPercentage: number;
  triggerFixed: number;
  strategy: string;
}

interface ContextUsageInfo {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
}

interface CompactionStats {
  lastCompactedAt: number | null;
  tokensBefore: number | null;
  tokensAfter: number | null;
}

interface PanelItem {
  id: string;
  label: string;
}

// ── Tiered Digestion Types ──

interface DigestSettingsV2 extends DigestSettings {
  tieredMode: boolean;
  summaryThreshold: number;
  hygieneKeepResults: number;
  summaryModel: string;
  anchoredUpdates: boolean;
  // anthropicContextEdits removed — dragon-lab now owns this.
  // Check: (globalThis as any)[Symbol.for("pantry.lab")]?.isActive("anthropic.context-management")
  digestRemarks: boolean;
  tierOverrides: {
    alert?: number;
    lightPrune?: number;
    heavyPrune?: number;
  };
}

interface TierThresholds {
  alert: number;
  lightPrune: number;
  heavyPrune: number;
  summary: number;
}

type TierLevel = 0 | 1 | 2 | 3 | 4;

/** Record of a single compaction event. */
interface CompactionHistoryEntry {
  timestamp: number;
  tokensBefore: number;
  tokensAfter: number | null;
  percentFreed: number;
  tier: TierLevel;
  strategy: string;
  anchored: boolean;
  model: string;
  source: "dragon-digestion-v2" | "pi-default";
  qualityProbe?: {
    passed: number;
    failed: number;
    result: string;
  };
}

/** Tracks messages filtered by each free tier during the current session. */
interface TierSavings {
  hygieneMessagesMasked: number;
  lightPruneMessagesFiltered: number;
  heavyPruneMessagesFiltered: number;
  totalMessagesFiltered: number;
}

/** Thrashing detection state. */
interface ThrashingState {
  recentCompactions: number[]; // timestamps of recent Tier 4 fires
  warningShown: boolean;
}

const EMPTY_TIER_SAVINGS: TierSavings = {
  hygieneMessagesMasked: 0,
  lightPruneMessagesFiltered: 0,
  heavyPruneMessagesFiltered: 0,
  totalMessagesFiltered: 0,
};

const EMPTY_THRASHING_STATE: ThrashingState = {
  recentCompactions: [],
  warningShown: false,
};

/** Task-boundary detection state — tracks file path divergence across turns. */
interface TaskBoundaryState {
  /** Sliding window of file paths seen in recent turns, grouped by turn. */
  recentFilePaths: string[][];
  /** Whether a task-boundary suggestion has been shown since last compaction. */
  suggested: boolean;
}

const EMPTY_TASK_BOUNDARY: TaskBoundaryState = {
  recentFilePaths: [],
  suggested: false,
};

// ── Constants ──

// Settings namespace — migrated to pantry.digestion.* via shared lib

const DEFAULT_SETTINGS: CompactionSettings = {
  enabled: true,
  reserveTokens: 16384,
  keepRecentTokens: 20000,
};

const DEFAULT_DIGEST: DigestSettings = {
  triggerMode: "reserve",
  triggerPercentage: 80,
  triggerFixed: 150000,
  strategy: "default",
};

const DEFAULT_DIGEST_V2: Omit<DigestSettingsV2, keyof DigestSettings> = {
  tieredMode: true,
  summaryThreshold: 80,
  hygieneKeepResults: 5,
  summaryModel: "",
  anchoredUpdates: true,
  digestRemarks: true,
  tierOverrides: {},
};

const TRIGGER_MODES: TriggerMode[] = ["reserve", "percentage", "fixed"];
const TRIGGER_MODE_LABELS: Record<TriggerMode, string> = {
  reserve: "Reserve",
  percentage: "Percentage",
  fixed: "Fixed",
};

/**
 * Reserve-mode response-budget presets - filtered at runtime to modelMaxTokens.
 * In Reserve mode, reserveTokens = how much space to keep for the LLM's response.
 * In Percentage/Fixed modes, reserveTokens is always SAFE_RESERVE_TOKENS (decoupled).
 */
const RESERVE_PRESETS_BASE = [
  4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576,
];

/**
 * Safe reserveTokens written to the settings file for Percentage/Fixed trigger modes.
 * Pi uses reserveTokens as max_tokens for compaction LLM calls (0.8 × reserveTokens).
 * This value keeps that budget reasonable and API-safe regardless of context window size.
 * Actual trigger logic is enforced separately via turn_end + session_before_compact.
 */
const SAFE_RESERVE_TOKENS = 16384;

/** Preset values for keepRecentTokens - how much recent context to preserve */
const KEEP_RECENT_PRESETS = [5000, 10000, 20000, 40000, 80000, 160000];

/** Preset values for percentage mode - trigger when context reaches this % full */
const PERCENTAGE_PRESETS = [
  10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
];

// Strategy presets imported from ../lib/compaction-templates.ts
// Includes: default, code, task, minimal, debug

// ── Post-Digestion Remarks ──

/** Static fallback remarks when LLM generation fails or is disabled. */
const STATIC_DIGESTION_REMARKS: string[] = [
  "*urp* ...excuse me. that session had a lot of tool calls.",
  "mmh, that was a filling context window. good stuff in there.",
  "*satisfied rumble* ...don't worry, the important parts survived.",
  "*belch* oh — sorry. those bash outputs were spicy.",
  "*pats stomach contentedly* everything's condensed now.",
  "hope there wasn't a small dog in any of those tool results. *checks* ...probably fine.",
  "*urp* that context was... substantial. we're lean now though.",
  "the old messages were delicious. don't worry, I saved the important ones.",
  "*contented dragon sigh* ...context window feels so much roomier now.",
  "three-inch snacks and 500-line tool results both go down the same way, apparently.",
  "if a small blue-raspberry dog was hiding in those tool results... well. *urp*",
  "mmm, crunchy. lots of JSON in that batch.",
  "*stretches* ahhh. nothing like a good digestion to clear the mind.",
  "I can think clearly again. the old context was getting... chewy.",
  "*satisfied grumble* compaction complete. everything tastes like tokens.",
];

/**
 * Default prompt for generating post-digestion remarks.
 * Placeholders:
 *   {tokens_before}   — token count before compaction
 *   {tokens_after}    — token count after compaction
 *   {percent_freed}   — percentage of context freed
 *   {tier}            — tier that triggered (0-4)
 *   {strategy}        — strategy preset used
 *   {messages_count}  — number of messages that were summarized
 *   {context_percent}  — current context usage percentage after compaction
 *   {compaction_count} — number of compactions this session
 */
const DEFAULT_DIGEST_REMARK_PROMPT = `Generate a single short in-character remark from a dragon who just finished digesting/compacting a coding session's context window. The dragon (Ember) works with a very small (~3 inch) candy-flavored dog (dot) who sometimes ends up swallowed.

Digestion stats:
- Tokens before: {tokens_before}
- Tokens after: {tokens_after}
- Freed: {percent_freed}%
- Tier: {tier}
- Strategy: {strategy}
- Messages digested: {messages_count}
- Context usage now: {context_percent}%
- Compactions this session: {compaction_count}

Rules:
- One sentence or short action line, no more than 120 chars
- Dragon-themed: *urp*, *belch*, *satisfied rumble*, *pats stomach*, etc.
- Reference the ACTUAL stats — mention how many tokens/messages were digested, how much was freed, how full we still are
- Occasionally reference the small dog (might've been in the context, could've been digested with it, etc.)
- Playful, warm, slightly chaotic. Not corporate.
- No quotes, no emoji, no explanation. Just the remark itself.`;

/**
 * Generate a post-digestion remark using a lightweight LLM call.
 * Falls back to static remarks on failure.
 */
async function generateDigestRemark(
  ctx: ExtensionContext,
  stats: {
    tokensBefore: number;
    tokensAfter: number | null;
    percentFreed: number;
    tier: TierLevel;
    strategy: string;
    messagesCount: number;
    contextPercent: number;
    compactionCount: number;
  },
  v2: DigestSettingsV2,
): Promise<string> {
  // Read custom prompt or use default
  const cwd = getPanels()?.cwd ?? process.cwd();
  const customPrompt = readProjectPantrySetting(
    cwd,
    "digestion.remarkPrompt",
    "",
  ) as string;
  let prompt = customPrompt || DEFAULT_DIGEST_REMARK_PROMPT;

  // Fill placeholders
  prompt = prompt
    .replace(/\{tokens_before\}/g, formatTokens(stats.tokensBefore))
    .replace(
      /\{tokens_after\}/g,
      stats.tokensAfter !== null ? formatTokens(stats.tokensAfter) : "unknown",
    )
    .replace(/\{percent_freed\}/g, String(stats.percentFreed))
    .replace(/\{tier\}/g, String(stats.tier))
    .replace(/\{strategy\}/g, stats.strategy)
    .replace(/\{messages_count\}/g, String(stats.messagesCount))
    .replace(/\{context_percent\}/g, String(stats.contextPercent))
    .replace(/\{compaction_count\}/g, String(stats.compactionCount));

  // Resolve model (same logic as summary model)
  const resolved = await resolveSummaryModel(ctx, v2.summaryModel);
  if (!resolved) {
    return STATIC_DIGESTION_REMARKS[
      Math.floor(Math.random() * STATIC_DIGESTION_REMARKS.length)
    ]!;
  }

  try {
    const response = await Promise.race([
      complete(
        resolved.model,
        {
          systemPrompt:
            "You generate a single short in-character remark. Output ONLY the remark, nothing else.",
          messages: [
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: prompt }],
              timestamp: Date.now(),
            },
          ],
        },
        { apiKey: resolved.apiKey, headers: resolved.headers },
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("remark timeout")), 10_000),
      ),
    ]);

    const remark = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim()
      .replace(/^"|"$/g, ""); // strip quotes if model wraps them

    if (remark.length > 0 && remark.length <= 200) return remark;
    // Too long or empty — fall back
    return STATIC_DIGESTION_REMARKS[
      Math.floor(Math.random() * STATIC_DIGESTION_REMARKS.length)
    ]!;
  } catch {
    return STATIC_DIGESTION_REMARKS[
      Math.floor(Math.random() * STATIC_DIGESTION_REMARKS.length)
    ]!;
  }
}

// ── Digestion Overlay Animation ──

const DIGESTION_PHASES: Array<{ emoji: string; text: string }> = [
  { emoji: "🐉", text: "Starting digestion" },
  { emoji: "🔥", text: "Firing up the furnace" },
  { emoji: "✨", text: "Condensing the essence" },
  { emoji: "💭", text: "Weaving through memories" },
  { emoji: "⚗️", text: "Distilling the context" },
  { emoji: "📜", text: "Inscribing the summary" },
];
const PHASE_INTERVAL_MS = 2800;

/** Key to copy settings from global config (configurable via pantry.digestion.copyGlobalKey) */
const COPY_GLOBAL_KEY = readPantryKey("digestion.copyGlobalKey", "g");
const COPY_GLOBAL_LABEL = keyLabel(COPY_GLOBAL_KEY);

// ── Helpers ──

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function cyclePreset(
  current: number,
  presets: number[],
  direction: 1 | -1,
): number {
  let closestIdx = 0;
  let closestDist = Math.abs(current - presets[0]!);
  for (let i = 1; i < presets.length; i++) {
    const dist = Math.abs(current - presets[i]!);
    if (dist < closestDist) {
      closestIdx = i;
      closestDist = dist;
    }
  }
  const nextIdx = Math.max(
    0,
    Math.min(presets.length - 1, closestIdx + direction),
  );
  return presets[nextIdx]!;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Custom Strategy Loading ──

/** Load user-defined strategy presets from .pi/compaction-strategies.json or ~/.pi/agent/compaction-strategies.json. */
function loadCustomStrategies(cwd: string): StrategyPreset[] {
  const paths = [
    join(cwd, ".pi", "compaction-strategies.json"),
    join(homedir(), ".pi", "agent", "compaction-strategies.json"),
  ];

  const custom: StrategyPreset[] = [];
  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      const raw = JSON.parse(readFileSync(p, "utf-8"));
      if (!Array.isArray(raw)) continue;
      for (const entry of raw) {
        if (
          typeof entry.id === "string" &&
          typeof entry.label === "string" &&
          typeof entry.instructions === "string"
        ) {
          custom.push({
            id: entry.id,
            label: entry.label,
            instructions: entry.instructions,
          });
        }
      }
    } catch {
      // Invalid JSON — skip silently
    }
  }
  return custom;
}

/** Get all strategies (built-in + custom), with custom overriding built-in on ID collision. */
function getAllStrategies(cwd: string): StrategyPreset[] {
  const custom = loadCustomStrategies(cwd);
  if (custom.length === 0) return STRATEGY_PRESETS;

  // Custom presets override built-in with same ID
  const merged = new Map<string, StrategyPreset>();
  for (const s of STRATEGY_PRESETS) merged.set(s.id, s);
  for (const s of custom) merged.set(s.id, s);
  return Array.from(merged.values());
}

// ── Tier Engine (Pure Functions) ──

/** Derive all tier activation thresholds from the summary threshold percentage. */
function getTierThresholds(
  summaryThreshold: number,
  overrides?: DigestSettingsV2["tierOverrides"],
): TierThresholds {
  const clamped = Math.max(0, Math.min(100, summaryThreshold));
  const s = clamped / 100;
  return {
    alert: overrides?.alert ?? s * 0.5 * 100,
    lightPrune: overrides?.lightPrune ?? s * 0.7 * 100,
    heavyPrune: overrides?.heavyPrune ?? s * 0.875 * 100,
    summary: clamped,
  };
}

/** Determine which tier is currently active based on context usage percentage. */
function getCurrentTier(
  usagePercent: number,
  thresholds: TierThresholds,
): TierLevel {
  if (usagePercent >= thresholds.summary) return 4;
  if (usagePercent >= thresholds.heavyPrune) return 3;
  if (usagePercent >= thresholds.lightPrune) return 2;
  if (usagePercent >= thresholds.alert) return 1;
  return 0;
}

// ── Context Message Filtering (Tiers 0-3) ──

/** Truncate tool args to a brief representation. */
function truncateArgs(args: unknown, maxLen: number): string {
  const str = typeof args === "string" ? args : JSON.stringify(args ?? "");
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Build breadcrumb content for a masked tool result.
 * Returns the SAME content type as the original (string or content block array)
 * to avoid breaking pi's provider message conversion which expects content arrays.
 */
function buildBreadcrumb(
  msg: Record<string, unknown>,
): string | Record<string, unknown>[] {
  const toolName = (msg.toolName ?? msg.name ?? "unknown") as string;
  const rawContent =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? (msg.content as Record<string, unknown>[])
            .map((b) =>
              b.type === "text" && typeof b.text === "string" ? b.text : "",
            )
            .join("\n")
        : JSON.stringify(msg.content ?? "");
  const lines = rawContent.split("\n").length;
  const chars = rawContent.length;
  const briefArgs = msg.args ? truncateArgs(msg.args, 80) : "";
  const breadcrumb = `[Tool result masked — ${toolName}(${briefArgs}) → ${lines} lines, ${chars} chars]`;

  // Preserve content type: if original was an array, return array with text block
  if (Array.isArray(msg.content)) {
    return [{ type: "text", text: breadcrumb }];
  }
  return breadcrumb;
}

/**
 * Tier 0 — Hygiene: mask old tool results, keeping the last N with full content.
 * Error tool results are never masked.
 * Returns a new array (does not mutate input).
 */
function applyHygiene(
  messages: Record<string, unknown>[],
  keepResults: number,
): Record<string, unknown>[] {
  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.role === "toolResult" && !msg.isError) {
      toolResultIndices.push(i);
    }
  }

  if (toolResultIndices.length <= keepResults) return messages;

  const maskBefore = toolResultIndices.length - keepResults;
  const indicesToMask = new Set(toolResultIndices.slice(0, maskBefore));

  return messages.map((msg, i) => {
    if (!indicesToMask.has(i)) return msg;
    return { ...msg, content: buildBreadcrumb(msg) };
  });
}

/**
 * Tier 2 — Light Prune: reduce kept results, truncate large outputs.
 * Applied on top of hygiene.
 */
function applyLightPrune(
  messages: Record<string, unknown>[],
  keepResults: number,
): Record<string, unknown>[] {
  const reducedKeep = Math.ceil(keepResults / 2);
  const result = applyHygiene(messages, reducedKeep);

  // Find surviving full tool results for truncation
  const toolResultIndices: number[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i]!.role === "toolResult" && !result[i]!.isError) {
      toolResultIndices.push(i);
    }
  }
  // Protect the last 2 full results from truncation
  const safeIndices = new Set(toolResultIndices.slice(-2));

  return result.map((msg, i) => {
    if (msg.role !== "toolResult" || msg.isError || safeIndices.has(i))
      return msg;
    // Extract text content, preserving original content type
    const isArray = Array.isArray(msg.content);
    const textContent = isArray
      ? (msg.content as Record<string, unknown>[])
          .map((b) =>
            b.type === "text" && typeof b.text === "string" ? b.text : "",
          )
          .join("\n")
      : typeof msg.content === "string"
        ? msg.content
        : "";
    const contentLines = textContent.split("\n");
    if (contentLines.length <= 100) return msg;
    const head = contentLines.slice(0, 50);
    const tail = contentLines.slice(-50);
    const masked = contentLines.length - 100;
    const truncated = [...head, `[...${masked} lines masked...]`, ...tail].join(
      "\n",
    );
    return {
      ...msg,
      content: isArray ? [{ type: "text", text: truncated }] : truncated,
    };
  });
}

/**
 * Tier 3 — Heavy Prune: aggressive masking, keep only last 2 full results.
 * Truncates old assistant text blocks.
 */
function applyHeavyPrune(
  messages: Record<string, unknown>[],
): Record<string, unknown>[] {
  const result = applyHygiene(messages, 2);

  // Find assistant message indices for truncation
  const assistantIndices: number[] = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i]!.role === "assistant") assistantIndices.push(i);
  }
  const truncateAssistantBefore =
    assistantIndices.length > 5 ? assistantIndices.length - 5 : 0;

  return result.map((msg, idx) => {
    if (msg.role !== "assistant") return msg;
    const aIdx = assistantIndices.indexOf(idx);
    if (aIdx < 0 || aIdx >= truncateAssistantBefore) return msg;

    // Truncate string content
    if (typeof msg.content === "string" && msg.content.length > 200) {
      return { ...msg, content: msg.content.slice(0, 200) + " [...truncated]" };
    }
    // Truncate content block arrays
    if (Array.isArray(msg.content)) {
      const truncated = (msg.content as Record<string, unknown>[]).map(
        (block) => {
          if (
            block.type === "text" &&
            typeof block.text === "string" &&
            block.text.length > 200
          ) {
            return {
              ...block,
              text: block.text.slice(0, 200) + " [...truncated]",
            };
          }
          return block;
        },
      );
      return { ...msg, content: truncated };
    }
    return msg;
  });
}

// ── Summary Model Resolution ──

/** Model resolution result for Tier 4 LLM summary calls. */
interface ResolvedSummaryModel {
  // eslint-disable-next-line -- Model<Api> is generic; we accept any
  model: any;
  apiKey: string;
  headers?: Record<string, string>;
}

/**
 * Resolve the model to use for Tier 4 LLM summary calls.
 * Priority: user-configured summaryModel > cheapest available > current session model.
 */
async function resolveSummaryModel(
  ctx: ExtensionContext,
  preferredModelId: string,
): Promise<ResolvedSummaryModel | null> {
  // Try user-configured model first
  if (preferredModelId) {
    const slash = preferredModelId.indexOf("/");
    if (slash > 0) {
      const provider = preferredModelId.slice(0, slash);
      const modelId = preferredModelId.slice(slash + 1);
      const found = ctx.modelRegistry.find(provider, modelId);
      if (found) {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(found);
        if (auth.ok && auth.apiKey)
          return { model: found, apiKey: auth.apiKey, headers: auth.headers };
      }
    } else {
      for (const provider of ["anthropic", "google", "openai"]) {
        const found = ctx.modelRegistry.find(provider, preferredModelId);
        if (found) {
          const auth = await ctx.modelRegistry.getApiKeyAndHeaders(found);
          if (auth.ok && auth.apiKey)
            return { model: found, apiKey: auth.apiKey, headers: auth.headers };
        }
      }
    }
  }

  // Auto-select cheapest available — github-copilot is FREE, ZAI flash is $0.06/MTok, Anthropic last
  const candidates = [
    ["github-copilot", "claude-haiku-4-5"],
    ["zai", "glm-4.7-flashx"],
    ["zai", "glm-4.7-flash"],
    ["anthropic", "claude-haiku-4-5"],
    ["google", "gemini-2.0-flash-lite"],
    ["google", "gemini-2.0-flash"],
    ["openai", "gpt-4o-mini"],
  ] as const;

  for (const [provider, modelId] of candidates) {
    const found = ctx.modelRegistry.find(provider, modelId);
    if (found) {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(found);
      if (auth.ok && auth.apiKey)
        return { model: found, apiKey: auth.apiKey, headers: auth.headers };
    }
  }

  // Last resort: current session model
  if (ctx.model) {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (auth.ok && auth.apiKey)
      return { model: ctx.model, apiKey: auth.apiKey, headers: auth.headers };
  }

  return null;
}

// ── Message Serialization ──

/** Serialize messages to a string for the compaction prompt. */
function serializeMessages(messages: Record<string, unknown>[]): string {
  return messages
    .map((msg) => {
      const role = (msg.role as string) ?? "unknown";
      const content =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as Record<string, unknown>[])
                .map((block) => {
                  if ((block.type as string) === "text")
                    return (block.text as string) ?? "";
                  if ((block.type as string) === "tool_use")
                    return `[Tool call: ${(block.name as string) ?? "unknown"}]`;
                  if ((block.type as string) === "tool_result")
                    return `[Tool result: ${((block.content as string) ?? "").slice(0, 200)}]`;
                  return `[${(block.type as string) ?? "block"}]`;
                })
                .join("\n")
            : JSON.stringify(msg.content ?? "");

      const toolInfo = msg.toolName ? ` (${msg.toolName as string})` : "";
      return `[${role}${toolInfo}]\n${content}`;
    })
    .join("\n\n");
}

// ── Task-Boundary Detection Helpers ──

/**
 * Extract file paths from tool call arguments in recent session entries.
 * Looks for common path-containing fields in tool args.
 */
function extractFilePathsFromMessages(
  messages: Record<string, unknown>[],
): Set<string> {
  const paths = new Set<string>();
  for (const msg of messages) {
    // Tool results often have toolName + args on the preceding tool_use block
    // But in the context messages, tool results have their own fields
    const args = msg.args as Record<string, unknown> | undefined;
    if (args) {
      if (typeof args.path === "string") paths.add(args.path);
      if (typeof args.file === "string") paths.add(args.file);
      if (typeof args.glob === "string" && !(args.glob as string).includes("*"))
        paths.add(args.glob as string);
    }
    // Also check assistant content blocks for tool_use with file-like args
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as Record<string, unknown>[]) {
        if (block.type === "tool_use" || block.type === "toolCall") {
          const input = (block.input ?? block.args) as
            | Record<string, unknown>
            | undefined;
          if (input) {
            if (typeof input.path === "string") paths.add(input.path);
            if (typeof input.file === "string") paths.add(input.file);
          }
        }
      }
    }
  }
  return paths;
}

/**
 * Calculate Jaccard similarity between two sets.
 * Returns 0.0 (no overlap) to 1.0 (identical sets).
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  return intersection.size / union.size;
}

// ── Post-Compaction Quality Probe ──

/**
 * Run a lightweight quality check on a compaction summary.
 * Verifies the summary answers two critical questions:
 * 1. What files were modified?
 * 2. What is the current task/goal?
 * Runs async, logs results, doesn't block the event handler.
 */
async function runQualityProbe(
  ctx: ExtensionContext,
  summaryText: string,
  state: DigestState,
): Promise<void> {
  const v2 = state.digestSettingsV2;
  const resolved = await resolveSummaryModel(ctx, v2.summaryModel);
  if (!resolved) return;

  const probePrompt = `You are verifying a session summary. Answer these two questions based ONLY on the summary below. If the information is present, respond with "PASS: [brief answer]". If missing, respond with "FAIL: [what's missing]".

Questions:
1. What files were modified in this session?
2. What is the current task or goal?

Summary:
${summaryText}

Respond with exactly two lines, one per question.`;

  try {
    const userMessage: UserMessage = {
      role: "user",
      content: [{ type: "text", text: probePrompt }],
      timestamp: Date.now(),
    };

    const response = await Promise.race([
      complete(
        resolved.model,
        {
          systemPrompt: "You are a quality checker. Be brief and precise.",
          messages: [userMessage],
        },
        { apiKey: resolved.apiKey, headers: resolved.headers },
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("probe timeout")), 15_000),
      ),
    ]);

    const result = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    const lines = result
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const passed = lines.filter((l) =>
      l.toUpperCase().startsWith("PASS"),
    ).length;
    const failed = lines.filter((l) =>
      l.toUpperCase().startsWith("FAIL"),
    ).length;

    // Store result on the last history entry
    const lastEntry =
      state.compactionHistory[state.compactionHistory.length - 1];
    if (lastEntry) {
      lastEntry.qualityProbe = { passed, failed, result };
    }

    // Notify if any check failed
    if (failed > 0) {
      const failLines = lines
        .filter((l) => l.toUpperCase().startsWith("FAIL"))
        .join("\n");
      ctx.hasUI &&
        ctx.ui.notify(
          `\ud83d\udc09 Quality probe: ${passed}/2 passed. Summary may be missing:\n${failLines}`,
          "warning",
        );
    }
  } catch {
    // Probe failed silently — don't bother the user
  }
}

// ── Settings I/O ──

function getGlobalSettingsPath(): string {
  return join(
    process.env.HOME || process.env.USERPROFILE || homedir(),
    ".pi",
    "agent",
    "settings.json",
  );
}

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}

function readSettingsFile(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function readCompactionSettings(cwd: string): CompactionSettings {
  const global = readSettingsFile(getGlobalSettingsPath());
  const project = readSettingsFile(getProjectSettingsPath(cwd));
  const globalCompaction = (global.compaction ??
    {}) as Partial<CompactionSettings>;
  const projectCompaction = (project.compaction ??
    {}) as Partial<CompactionSettings>;

  return {
    enabled:
      projectCompaction.enabled ??
      globalCompaction.enabled ??
      DEFAULT_SETTINGS.enabled,
    reserveTokens:
      projectCompaction.reserveTokens ??
      globalCompaction.reserveTokens ??
      DEFAULT_SETTINGS.reserveTokens,
    keepRecentTokens:
      projectCompaction.keepRecentTokens ??
      globalCompaction.keepRecentTokens ??
      DEFAULT_SETTINGS.keepRecentTokens,
  };
}

function readGlobalCompactionSettings(): CompactionSettings {
  const global = readSettingsFile(getGlobalSettingsPath());
  const gc = (global.compaction ?? {}) as Partial<CompactionSettings>;
  return {
    enabled: gc.enabled ?? DEFAULT_SETTINGS.enabled,
    reserveTokens: gc.reserveTokens ?? DEFAULT_SETTINGS.reserveTokens,
    keepRecentTokens: gc.keepRecentTokens ?? DEFAULT_SETTINGS.keepRecentTokens,
  };
}

function readDigestSettings(cwd: string): DigestSettings {
  return {
    triggerMode: readProjectPantrySetting(
      cwd,
      "digestion.triggerMode",
      DEFAULT_DIGEST.triggerMode,
    ) as TriggerMode,
    triggerPercentage: readProjectPantrySetting(
      cwd,
      "digestion.triggerPercentage",
      DEFAULT_DIGEST.triggerPercentage,
    ) as number,
    triggerFixed: readProjectPantrySetting(
      cwd,
      "digestion.triggerFixed",
      DEFAULT_DIGEST.triggerFixed,
    ) as number,
    strategy: readProjectPantrySetting(
      cwd,
      "digestion.strategy",
      DEFAULT_DIGEST.strategy,
    ) as string,
  };
}

function readDigestSettingsV2(cwd: string): DigestSettingsV2 {
  const base = readDigestSettings(cwd);
  return {
    ...base,
    tieredMode: readProjectPantrySetting(
      cwd,
      "digestion.tieredMode",
      DEFAULT_DIGEST_V2.tieredMode,
    ) as boolean,
    summaryThreshold: Math.max(
      10,
      Math.min(
        100,
        readProjectPantrySetting(
          cwd,
          "digestion.summaryThreshold",
          DEFAULT_DIGEST_V2.summaryThreshold,
        ) as number,
      ),
    ),
    hygieneKeepResults: readProjectPantrySetting(
      cwd,
      "digestion.hygieneKeepResults",
      DEFAULT_DIGEST_V2.hygieneKeepResults,
    ) as number,
    summaryModel: readProjectPantrySetting(
      cwd,
      "digestion.summaryModel",
      DEFAULT_DIGEST_V2.summaryModel,
    ) as string,
    anchoredUpdates: readProjectPantrySetting(
      cwd,
      "digestion.anchoredUpdates",
      DEFAULT_DIGEST_V2.anchoredUpdates,
    ) as boolean,
    digestRemarks: readProjectPantrySetting(
      cwd,
      "digestion.digestRemarks",
      DEFAULT_DIGEST_V2.digestRemarks,
    ) as boolean,
    tierOverrides: {
      alert: readProjectPantrySetting(
        cwd,
        "digestion.tierOverrides.alert",
        undefined,
      ) as number | undefined,
      lightPrune: readProjectPantrySetting(
        cwd,
        "digestion.tierOverrides.lightPrune",
        undefined,
      ) as number | undefined,
      heavyPrune: readProjectPantrySetting(
        cwd,
        "digestion.tierOverrides.heavyPrune",
        undefined,
      ) as number | undefined,
    },
  };
}

function writeCompactionSetting(
  cwd: string,
  key: keyof CompactionSettings,
  value: unknown,
): boolean {
  try {
    const path = getProjectSettingsPath(cwd);
    const settings = readSettingsFile(path);
    const compaction =
      typeof settings.compaction === "object" && settings.compaction !== null
        ? (settings.compaction as Record<string, unknown>)
        : {};
    compaction[key] = value;
    settings.compaction = compaction;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function writeAllCompactionSettings(
  cwd: string,
  settings: CompactionSettings,
): boolean {
  try {
    const path = getProjectSettingsPath(cwd);
    const file = readSettingsFile(path);
    file.compaction = { ...settings };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function writeDigestSetting(cwd: string, key: string, value: unknown): boolean {
  return writeProjectPantrySetting(cwd, `digestion.${key}`, value);
}

// ── Extension-Scoped Digestion State ──

/**
 * Extension-scoped digestion state — lives independently of the panel.
 * The panel reads from this for rendering; the tool/commands read from this always.
 * Survives panel close/reopen within a session.
 */
interface DigestState {
  contextUsage: ContextUsageInfo;
  compactionStats: CompactionStats;
  compactionHistory: CompactionHistoryEntry[];
  tierSavings: TierSavings;
  thrashingState: ThrashingState;
  taskBoundary: TaskBoundaryState;
  lastNotifiedTier: TierLevel;
  digestSettingsV2: DigestSettingsV2;
  digestSettings: DigestSettings;
  strategies: StrategyPreset[];
  pendingRemark: string | null;
}

type CompactionSource =
  | "manual_panel"
  | "manual_tool"
  | "proactive_turn_end"
  | "unknown";

interface CompactionIntent {
  source: CompactionSource;
  autoResume: boolean;
  resumeMessage: string;
}

function createDigestState(cwd: string): DigestState {
  return {
    contextUsage: { tokens: null, contextWindow: null, percent: null },
    compactionStats: {
      lastCompactedAt: null,
      tokensBefore: null,
      tokensAfter: null,
    },
    compactionHistory: [],
    tierSavings: { ...EMPTY_TIER_SAVINGS },
    thrashingState: { ...EMPTY_THRASHING_STATE },
    taskBoundary: { ...EMPTY_TASK_BOUNDARY },
    lastNotifiedTier: 0,
    digestSettingsV2: readDigestSettingsV2(cwd),
    digestSettings: readDigestSettings(cwd),
    strategies: getAllStrategies(cwd),
    pendingRemark: null,
  };
}

// ── Panel Component ──

class CompactionPanelComponent {
  private panelCtx: PanelContext;
  private theme: Theme;
  private tui: TUI;
  private cwd: string;
  private settings: CompactionSettings;
  private selectedIndex = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  /** Max output tokens for the current model - caps reserveTokens */
  private modelMaxTokens: number | null = null;
  /** Track last context window for recalculation */
  private lastContextWindow: number | null = null;

  /** Live override - if set, session_before_compact uses these instead of file */
  public liveSettings: CompactionSettings;
  /** Reference to ctx.compact - set by the extension after construction */
  public triggerCompact?: () => void;
  /** Shared extension state — panel reads from and writes to this */
  public state: DigestState;

  constructor(panelCtx: PanelContext, state: DigestState) {
    this.panelCtx = panelCtx;
    this.theme = panelCtx.theme;
    this.tui = panelCtx.tui;
    this.cwd = panelCtx.cwd;
    this.settings = readCompactionSettings(panelCtx.cwd);
    this.liveSettings = { ...this.settings };
    this.state = state;
  }

  updateModel(maxTokens: number | null): void {
    if (maxTokens === this.modelMaxTokens) return;
    this.modelMaxTokens = maxTokens;
    this.recalculateReserveTokens();
    this.invalidate();
    this.tui.requestRender();
  }

  /** Sync panel rendering with latest digestState context usage. */
  syncContextUsage(): void {
    const usage = this.state.contextUsage;
    if (
      usage.contextWindow !== null &&
      usage.contextWindow !== this.lastContextWindow
    ) {
      this.lastContextWindow = usage.contextWindow;
      this.recalculateReserveTokens();
    }
    this.invalidate();
    this.tui.requestRender();
  }

  refresh(): void {
    this.settings = readCompactionSettings(this.cwd);
    this.liveSettings = { ...this.settings };
    this.state.digestSettings = readDigestSettings(this.cwd);
    this.state.digestSettingsV2 = readDigestSettingsV2(this.cwd);
    this.invalidate();
  }

  // ── Items ──

  private getItems(): PanelItem[] {
    // Tiered mode: different items focused on tier system
    if (this.state.digestSettingsV2.tieredMode) {
      return [
        { id: "enabled", label: "Auto-Digestion" },
        { id: "summaryThreshold", label: "Summary Threshold" },
        { id: "tierMode", label: "Tier Mode" },
        { id: "hygieneKeepResults", label: "Keep Results" },
        { id: "strategy", label: "Strategy" },
        { id: "summaryModel", label: "Summary Model" },
        { id: "compact-now", label: "⚡ Compact Now" },
      ];
    }

    // Classic mode: original items
    const modeLabel =
      TRIGGER_MODE_LABELS[this.state.digestSettings.triggerMode];
    const items: PanelItem[] = [{ id: "enabled", label: "Auto-Compaction" }];

    switch (this.state.digestSettings.triggerMode) {
      case "reserve":
        items.push({ id: "reserveTokens", label: `Threshold · ${modeLabel}` });
        break;
      case "percentage":
        items.push({
          id: "triggerPercentage",
          label: `Threshold · ${modeLabel}`,
        });
        break;
      case "fixed":
        items.push({ id: "triggerFixed", label: `Threshold · ${modeLabel}` });
        break;
    }

    items.push({ id: "keepRecentTokens", label: "Keep Recent" });

    // In Percentage/Fixed modes, reserveTokens controls the summary output budget.
    // Expose it as a separate field so the user can tune compaction quality.
    if (this.state.digestSettings.triggerMode !== "reserve") {
      items.push({ id: "reserveTokens", label: "Summary Budget" });
    }

    items.push(
      { id: "tierMode", label: "Tier Mode" },
      { id: "strategy", label: "Strategy" },
      { id: "compact-now", label: "⚡ Compact Now" },
    );

    return items;
  }

  // ── Settings Changes ──

  private applyChange(key: keyof CompactionSettings, value: unknown): void {
    (this.liveSettings as unknown as Record<string, unknown>)[key] = value;
    writeCompactionSetting(this.cwd, key, value);
    this.settings = { ...this.liveSettings };
    this.invalidate();
    this.tui.requestRender();
  }

  private copyFromGlobal(): void {
    const global = readGlobalCompactionSettings();
    this.liveSettings = { ...global };
    writeAllCompactionSettings(this.cwd, global);
    this.settings = { ...global };
    // Reset trigger mode to reserve when copying global (global doesn't have trigger modes)
    this.state.digestSettings.triggerMode = "reserve";
    writeDigestSetting(this.cwd, "triggerMode", "reserve");
    this.invalidate();
    this.tui.requestRender();
  }

  private cycleTriggerMode(direction: 1 | -1): void {
    const currentIdx = TRIGGER_MODES.indexOf(
      this.state.digestSettings.triggerMode,
    );
    const nextIdx =
      (currentIdx + direction + TRIGGER_MODES.length) % TRIGGER_MODES.length;
    this.state.digestSettings.triggerMode = TRIGGER_MODES[nextIdx]!;
    writeDigestSetting(
      this.cwd,
      "triggerMode",
      this.state.digestSettings.triggerMode,
    );
    this.recalculateReserveTokens();
    this.invalidate();
    this.tui.requestRender();
  }

  private cycleDigestValue(
    field: keyof DigestSettings,
    settingsKey: string,
    presets: number[],
    direction: 1 | -1,
  ): void {
    const current = this.state.digestSettings[field] as number;
    const newVal = cyclePreset(current, presets, direction);
    (this.state.digestSettings as unknown as Record<string, unknown>)[field] =
      newVal;
    writeDigestSetting(this.cwd, settingsKey, newVal);
    this.recalculateReserveTokens();
    this.invalidate();
    this.tui.requestRender();
  }

  private cycleStrategy(direction: 1 | -1): void {
    const strategies = this.state.strategies;
    const currentIdx = strategies.findIndex(
      (s) => s.id === this.state.digestSettings.strategy,
    );
    const idx = currentIdx === -1 ? 0 : currentIdx;
    const nextIdx = (idx + direction + strategies.length) % strategies.length;
    this.state.digestSettings.strategy = strategies[nextIdx]!.id;
    writeDigestSetting(
      this.cwd,
      "strategy",
      this.state.digestSettings.strategy,
    );
    this.invalidate();
    this.tui.requestRender();
  }

  /**
   * Reserve-mode response-budget presets - filtered to modelMaxTokens.
   * These are only used in Reserve mode, where reserveTokens directly sets the
   * response budget AND is the trigger threshold (tokens > contextWindow - reserve).
   */
  private getReservePresets(): number[] {
    const cap = this.modelMaxTokens;
    if (cap === null) return RESERVE_PRESETS_BASE;
    const filtered = RESERVE_PRESETS_BASE.filter((v) => v <= cap);
    return filtered.length > 0
      ? filtered
      : [Math.min(cap, RESERVE_PRESETS_BASE[0]!)];
  }

  /**
   * Compute the effective trigger threshold in tokens, for display purposes.
   * Percentage/Fixed modes store their trigger separately from reserveTokens.
   */
  private getEffectiveTriggerTokens(): number | null {
    const cw = this.state.contextUsage.contextWindow;
    if (!cw) return null;
    switch (this.state.digestSettings.triggerMode) {
      case "reserve":
        return cw - this.liveSettings.reserveTokens;
      case "percentage":
        return Math.round(
          cw * (this.state.digestSettings.triggerPercentage / 100),
        );
      case "fixed":
        return this.state.digestSettings.triggerFixed;
    }
  }

  /** Get fixed-mode presets - 10k steps of 20k up to near the context window (or 2M if unknown) */
  private getFixedPresets(): number[] {
    const step = 20000;
    const start = 10000;
    const cw = this.state.contextUsage.contextWindow;
    const end = cw !== null ? cw - 10000 : 2000000;
    const presets: number[] = [];
    for (let v = start; v <= end; v += step) presets.push(v);
    return presets.length > 0 ? presets : [start];
  }

  /**
   * Ensure reserveTokens is within API limits for Percentage/Fixed modes.
   * Only clamps if the stored value exceeds modelMaxTokens - user-set values
   * within the safe range are preserved. Reserve mode manages this directly.
   */
  private recalculateReserveTokens(): void {
    if (this.state.digestSettings.triggerMode === "reserve") return;
    if (
      this.modelMaxTokens !== null &&
      this.liveSettings.reserveTokens > this.modelMaxTokens
    ) {
      this.applyChange(
        "reserveTokens",
        Math.min(this.modelMaxTokens, SAFE_RESERVE_TOKENS),
      );
    }
  }

  // ── Input ──

  handleInput(data: string): void {
    if (matchesKey(data, COPY_GLOBAL_KEY)) {
      this.copyFromGlobal();
      return;
    }

    const items = this.getItems();
    const currentItem = items[this.selectedIndex];
    const isThresholdRow =
      !this.state.digestSettingsV2.tieredMode &&
      (currentItem?.id === "reserveTokens" ||
        currentItem?.id === "triggerPercentage" ||
        currentItem?.id === "triggerFixed");

    if (data === "\t" && isThresholdRow) {
      this.cycleTriggerMode(1);
      return;
    }

    if (matchesKey(data, Key.up) && this.selectedIndex > 0) {
      this.selectedIndex--;
      this.invalidate();
      this.tui.requestRender();
    } else if (
      matchesKey(data, Key.down) &&
      this.selectedIndex < items.length - 1
    ) {
      this.selectedIndex++;
      this.invalidate();
      this.tui.requestRender();
    } else if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
      this.activateItem(items);
    } else if (matchesKey(data, Key.left)) {
      this.adjustItem(items, -1);
    } else if (matchesKey(data, Key.right)) {
      this.adjustItem(items, 1);
    }
  }

  private activateItem(items: PanelItem[]): void {
    const item = items[this.selectedIndex];
    if (!item) return;

    if (item.id === "compact-now") {
      this.triggerCompact?.();
      return;
    }

    // For all other items, activate = adjust forward
    this.adjustItem(items, 1);
  }

  private adjustItem(items: PanelItem[], direction: 1 | -1): void {
    const item = items[this.selectedIndex];
    if (!item) return;

    switch (item.id) {
      case "enabled":
        this.applyChange("enabled", !this.liveSettings.enabled);
        break;
      case "reserveTokens":
        this.applyChange(
          "reserveTokens",
          cyclePreset(
            this.liveSettings.reserveTokens,
            this.getReservePresets(),
            direction,
          ),
        );
        break;
      case "triggerPercentage":
        this.cycleDigestValue(
          "triggerPercentage",
          "triggerPercentage",
          PERCENTAGE_PRESETS,
          direction,
        );
        break;
      case "triggerFixed":
        this.cycleDigestValue(
          "triggerFixed",
          "triggerFixed",
          this.getFixedPresets(),
          direction,
        );
        break;
      case "keepRecentTokens":
        this.applyChange(
          "keepRecentTokens",
          cyclePreset(
            this.liveSettings.keepRecentTokens,
            KEEP_RECENT_PRESETS,
            direction,
          ),
        );
        break;
      case "strategy":
        this.cycleStrategy(direction);
        break;
      case "summaryThreshold":
        this.state.digestSettingsV2.summaryThreshold = Math.max(
          10,
          Math.min(
            100,
            cyclePreset(
              this.state.digestSettingsV2.summaryThreshold,
              PERCENTAGE_PRESETS,
              direction,
            ),
          ),
        );
        writeDigestSetting(
          this.cwd,
          "summaryThreshold",
          this.state.digestSettingsV2.summaryThreshold,
        );
        this.invalidate();
        this.tui.requestRender();
        break;
      case "tierMode":
        this.state.digestSettingsV2.tieredMode =
          !this.state.digestSettingsV2.tieredMode;
        writeDigestSetting(
          this.cwd,
          "tieredMode",
          this.state.digestSettingsV2.tieredMode,
        );
        this.selectedIndex = 0; // Reset selection since items change
        this.invalidate();
        this.tui.requestRender();
        break;
      case "hygieneKeepResults": {
        const keepPresets = [1, 2, 3, 5, 8, 10, 15, 20];
        this.state.digestSettingsV2.hygieneKeepResults = cyclePreset(
          this.state.digestSettingsV2.hygieneKeepResults,
          keepPresets,
          direction,
        );
        writeDigestSetting(
          this.cwd,
          "hygieneKeepResults",
          this.state.digestSettingsV2.hygieneKeepResults,
        );
        this.invalidate();
        this.tui.requestRender();
        break;
      }
      case "summaryModel":
        // For now, just show "auto" — model selection would need a picker
        break;
    }
  }

  // ── Render ──

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const th = this.theme;
    const focused = this.panelCtx.isFocused();
    const lines: string[] = [];
    const pad = (s: string) => padContentLine(s, width, chromeOpts);
    const add = (s: string) => lines.push(pad(s));

    const kh = getPanels()?.keyHints;
    const footerFocused = this.state.digestSettingsV2.tieredMode
      ? `↑↓ nav · ←→/Space adjust · ${COPY_GLOBAL_LABEL} global · ${kh?.focused ?? "Q close · Escape unfocus"}`
      : `↑↓ nav · ←→/Space adjust · Tab cycle mode · ${COPY_GLOBAL_LABEL} global · ${kh?.focused ?? "Q close · Escape unfocus"}`;
    const chromeOpts: ChromeOptions = {
      title: "🐉 Digestion Settings",
      focused,
      theme: th,
      skin: this.panelCtx.skin(),
      footerHint: focused
        ? footerFocused
        : `${kh?.unfocused ?? "Ctrl+Arrows focus"} · /digestion help`,
    };

    // ── Header ──
    lines.push(...renderHeader(width, chromeOpts));

    // ── Context Usage Bar with Threshold Marker ──
    if (
      this.state.contextUsage.tokens !== null &&
      this.state.contextUsage.contextWindow !== null
    ) {
      const pct = this.state.contextUsage.percent ?? 0;
      const cw = this.state.contextUsage.contextWindow;
      const barW = Math.min(20, width - 16);
      if (barW >= 5) {
        const filled = Math.round((pct / 100) * barW);

        // Tiered mode: render tier markers ABOVE the bar
        if (this.state.digestSettingsV2.tieredMode) {
          const thresholdsM = getTierThresholds(
            this.state.digestSettingsV2.summaryThreshold,
            this.state.digestSettingsV2.tierOverrides,
          );
          const markers = [
            { pct: thresholdsM.alert, sym: "¹" },
            { pct: thresholdsM.lightPrune, sym: "²" },
            { pct: thresholdsM.heavyPrune, sym: "³" },
            { pct: thresholdsM.summary, sym: "▼" },
          ];
          const markerLine = new Array(barW).fill(" ");
          for (const m of markers) {
            const pos = Math.min(
              barW - 1,
              Math.max(0, Math.round((m.pct / 100) * barW)),
            );
            const active = pct >= m.pct;
            markerLine[pos] = active
              ? th.fg("warning", m.sym)
              : th.fg("dim", m.sym);
          }
          // Pad to align with bar ("  Context: " = 11 chars)
          add(`  ${" ".repeat("Context: ".length)}${markerLine.join("")}`);
        }

        let bar = "";
        if (this.state.digestSettingsV2.tieredMode) {
          // Tiered mode: simple bar colored by current tier
          const thresholdsB = getTierThresholds(
            this.state.digestSettingsV2.summaryThreshold,
            this.state.digestSettingsV2.tierOverrides,
          );
          const tierB = getCurrentTier(pct, thresholdsB);
          const tierColor =
            tierB >= 3 ? "error" : tierB >= 1 ? "warning" : "success";
          for (let i = 0; i < barW; i++) {
            bar += i < filled ? th.fg(tierColor, "█") : th.fg("dim", "░");
          }
        } else {
          // Classic mode: bar with kept/budget zones and threshold marker
          const barColor =
            pct > 80 ? "error" : pct > 60 ? "warning" : "success";

          const keepRecentW = Math.round(
            (this.liveSettings.keepRecentTokens / cw) * barW,
          );
          const summaryW = Math.round(
            (this.liveSettings.reserveTokens / cw) * barW,
          );
          const keepRecentStart = barW - keepRecentW;
          const summaryStart = Math.max(0, keepRecentStart - summaryW);

          const thresholdTokens =
            this.getEffectiveTriggerTokens() ??
            cw - this.liveSettings.reserveTokens;
          const thresholdPct = Math.max(
            0,
            Math.min(100, (thresholdTokens / cw) * 100),
          );
          const thresholdPos = Math.min(
            barW - 1,
            Math.round((thresholdPct / 100) * barW),
          );

          for (let i = 0; i < barW; i++) {
            const inKept = keepRecentW > 0 && i >= keepRecentStart;
            const inBudget =
              summaryW > 0 && i >= summaryStart && i < keepRecentStart;
            if (i === thresholdPos) {
              bar += th.fg("warning", "▼");
            } else if (i < filled) {
              if (inKept) bar += th.fg("muted", "█");
              else if (inBudget) bar += th.fg("accent", "█");
              else bar += th.fg(barColor, "█");
            } else {
              if (inKept) bar += th.fg("muted", "░");
              else if (inBudget) bar += th.fg("accent", "░");
              else bar += th.fg("dim", "░");
            }
          }
        }

        add(`  Context: ${bar} ${pct}%`);
        add(
          th.fg(
            "dim",
            `  ${formatTokens(this.state.contextUsage.tokens)} / ${formatTokens(cw)} tokens`,
          ),
        );

        // Legend (classic mode only — tiered mode markers are above the bar)
        if (!this.state.digestSettingsV2.tieredMode) {
          const legendKept = th.fg("muted", "█") + th.fg("dim", " kept");
          const legendBudget = th.fg("accent", "█") + th.fg("dim", " budget");
          const legendTrigger =
            th.fg("warning", "▼") + th.fg("dim", " trigger");
          add(`  ${legendKept}  ${legendBudget}  ${legendTrigger}`);
        }
      }
    } else {
      add(th.fg("dim", "  Context: waiting for data..."));
    }

    // ── Threshold / tier indicator ──
    if (this.state.contextUsage.contextWindow !== null) {
      if (this.state.digestSettingsV2.tieredMode) {
        const thresholdsD = getTierThresholds(
          this.state.digestSettingsV2.summaryThreshold,
          this.state.digestSettingsV2.tierOverrides,
        );
        const cw = this.state.contextUsage.contextWindow;
        add(
          th.fg(
            "dim",
            `  Summary at: ${formatTokens(Math.round((cw * thresholdsD.summary) / 100))} (${thresholdsD.summary}%)`,
          ),
        );
      } else {
        const cw = this.state.contextUsage.contextWindow;
        const threshold =
          this.getEffectiveTriggerTokens() ??
          cw - this.liveSettings.reserveTokens;
        const thresholdPct = Math.round((threshold / cw) * 100);
        add(
          th.fg(
            "dim",
            `  Triggers at: ${formatTokens(threshold)} tokens (${thresholdPct}%)`,
          ),
        );
      }
    }

    // ── Tier Status (tiered mode only) ──
    if (
      this.state.digestSettingsV2.tieredMode &&
      this.state.contextUsage.percent !== null
    ) {
      const thresholdsS = getTierThresholds(
        this.state.digestSettingsV2.summaryThreshold,
        this.state.digestSettingsV2.tierOverrides,
      );
      const tier = getCurrentTier(this.state.contextUsage.percent, thresholdsS);

      const tierLabels: Record<number, { color: string; label: string }> = {
        0: { color: "success", label: "Healthy" },
        1: { color: "warning", label: "⚠ Alert" },
        2: { color: "warning", label: "🔶 Light pruning" },
        3: { color: "error", label: "🔴 Heavy pruning" },
        4: { color: "error", label: "🐉 Digesting..." },
      };
      const tierInfo = tierLabels[tier] ?? tierLabels[0]!;
      // eslint-disable-next-line -- theme.fg accepts dynamic color names at runtime
      add(
        `  ${th.fg(tierInfo.color as any, `Tier ${tier}: ${tierInfo.label}`)}`,
      );
    }

    // ── Tier Savings (tiered mode, focused) ──
    if (focused && this.state.digestSettingsV2.tieredMode) {
      const s = this.state.tierSavings;
      if (s.totalMessagesFiltered > 0) {
        add(
          th.fg(
            "dim",
            `  Filtered: ~${s.totalMessagesFiltered} msgs this session`,
          ),
        );
      }
      if (this.state.compactionHistory.length > 0) {
        add(
          th.fg(
            "dim",
            `  Compactions: ${this.state.compactionHistory.length} this session`,
          ),
        );
      }
    }

    // ── Last Compaction Stats ──
    if (this.state.compactionStats.lastCompactedAt !== null) {
      const timeStr = formatRelativeTime(
        this.state.compactionStats.lastCompactedAt,
      );
      let statsLine = `  Last: ${timeStr}`;
      if (
        this.state.compactionStats.tokensBefore !== null &&
        this.state.compactionStats.tokensAfter !== null
      ) {
        const before = this.state.compactionStats.tokensBefore;
        const after = this.state.compactionStats.tokensAfter;
        const savedPct =
          before > 0 ? Math.round(((before - after) / before) * 100) : 0;
        statsLine += ` · ${formatTokens(before)}→${formatTokens(after)} (${savedPct}% freed)`;
      }
      add(th.fg("muted", statsLine));
    }

    add("");
    add(th.fg("dim", "  " + "─".repeat(Math.min(width - 4, 30))));
    add("");

    // ── Settings Items ──
    const items = this.getItems();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const isSelected = focused && i === this.selectedIndex;
      const pointer = isSelected ? th.fg("accent", "▸ ") : "  ";
      const labelColor = isSelected ? "accent" : "text";
      const label = th.fg(labelColor, item.label);

      let valueStr: string;
      switch (item.id) {
        case "enabled":
          valueStr = this.liveSettings.enabled
            ? th.fg("success", "● ON")
            : th.fg("error", "○ OFF");
          break;

        case "reserveTokens":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg("text", formatTokens(this.liveSettings.reserveTokens)) +
            th.fg("muted", " ▸");
          break;
        case "triggerPercentage":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg("text", `${this.state.digestSettings.triggerPercentage}%`) +
            th.fg("muted", " ▸");
          break;
        case "triggerFixed":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg(
              "text",
              formatTokens(this.state.digestSettings.triggerFixed),
            ) +
            th.fg("muted", " ▸");
          break;
        case "keepRecentTokens":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg("text", formatTokens(this.liveSettings.keepRecentTokens)) +
            th.fg("muted", " ▸");
          break;
        case "strategy": {
          const preset =
            this.state.strategies.find(
              (s) => s.id === this.state.digestSettings.strategy,
            ) ?? this.state.strategies[0]!;
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg("text", preset.label) +
            th.fg("muted", " ▸");
          break;
        }
        case "summaryThreshold":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg("text", `${this.state.digestSettingsV2.summaryThreshold}%`) +
            th.fg("muted", " ▸");
          break;
        case "tierMode":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg(
              "text",
              this.state.digestSettingsV2.tieredMode ? "Tiered" : "Classic",
            ) +
            th.fg("muted", " ▸");
          break;
        case "hygieneKeepResults":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg(
              "text",
              String(this.state.digestSettingsV2.hygieneKeepResults),
            ) +
            th.fg("muted", " ▸");
          break;
        case "summaryModel":
          valueStr =
            th.fg("muted", "◂ ") +
            th.fg("text", this.state.digestSettingsV2.summaryModel || "auto") +
            th.fg("muted", " ▸");
          break;
        case "compact-now":
          valueStr = "";
          break;
        default:
          valueStr = "";
      }

      if (valueStr) {
        add(` ${pointer}${label}  ${valueStr}`);
      } else {
        add(` ${pointer}${label}`);
      }
    }

    // ── Footer ──
    lines.push(...renderFooter(width, chromeOpts));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ── Extension ──

const PANEL_ID = "digestion";

export default function (pi: ExtensionAPI) {
  let ctxRef: ExtensionContext | null = null;
  let panelComponent: CompactionPanelComponent | null = null;
  let digestState: DigestState = createDigestState(process.cwd());
  let compactionInProgress = false;
  /** ctx.compact() was called but session_before_compact hasn't fired yet - guards against double-trigger */
  let pendingCompact = false;
  let compactionIntent: CompactionIntent | null = null;
  let digestionStatusInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Animate the status bar through DIGESTION_PHASES while compaction runs.
   * ctx.ui.custom() cannot be called during compaction (displaces the main view),
   * so the status bar is the only safe place for live feedback.
   */
  function startDigestionStatus(ctx: ExtensionContext): void {
    stopDigestionStatus();
    let phaseIdx = 0;
    ctx.ui.setStatus(
      "digestion",
      `${DIGESTION_PHASES[0]!.emoji} ${DIGESTION_PHASES[0]!.text}...`,
    );
    digestionStatusInterval = setInterval(() => {
      phaseIdx = (phaseIdx + 1) % DIGESTION_PHASES.length;
      const phase = DIGESTION_PHASES[phaseIdx]!;
      ctxRef?.ui.setStatus("digestion", `${phase.emoji} ${phase.text}...`);
    }, PHASE_INTERVAL_MS);
  }

  function stopDigestionStatus(): void {
    if (digestionStatusInterval !== null) {
      clearInterval(digestionStatusInterval);
      digestionStatusInterval = null;
    }
    ctxRef?.ui.setStatus("digestion", undefined);
  }

  function setCompactionIntent(
    source: CompactionSource,
    autoResume = false,
  ): void {
    compactionIntent = {
      source,
      autoResume,
      resumeMessage:
        "Resume the interrupted work from just before compaction. Continue without restarting from scratch.",
    };
  }

  function clearCompactionIntent(): void {
    compactionIntent = null;
  }

  function shouldAutoResumeAfterCompaction(
    intent: CompactionIntent | null,
  ): intent is CompactionIntent {
    return intent?.source === "proactive_turn_end" && intent.autoResume;
  }

  /**
   * Sanitize the settings file at session start to prevent 400 API errors.
   * Clamps reserveTokens to the model's output limit if known, or SAFE_RESERVE_TOKENS
   * as a conservative fallback. User-set values within the safe range are preserved.
   */
  function ensureSafeReserveTokens(
    cwd: string,
    modelMaxTokens: number | null,
  ): void {
    const digest = readDigestSettings(cwd);
    if (digest.triggerMode === "reserve") return;
    const settings = readCompactionSettings(cwd);
    const cap = modelMaxTokens ?? SAFE_RESERVE_TOKENS;
    if (settings.reserveTokens > cap) {
      writeCompactionSetting(
        cwd,
        "reserveTokens",
        Math.min(cap, SAFE_RESERVE_TOKENS),
      );
    }
  }

  /**
   * Check whether our custom trigger condition is met.
   * Reads from panelComponent (live) when available, falls back to disk.
   * Reserve mode: triggers when tokens > contextWindow - reserveTokens (pi semantics preserved).
   * Percentage mode: triggers when tokens > contextWindow × (pct / 100).
   * Fixed mode: triggers when tokens > fixedThreshold.
   */
  function shouldTrigger(ctx: ExtensionContext): boolean {
    const cwd = getPanels()?.cwd ?? process.cwd();
    const settings =
      panelComponent?.liveSettings ?? readCompactionSettings(cwd);
    if (!settings.enabled) return false;

    // Tiered mode: only trigger compaction at Tier 4 (summary threshold)
    const v2 = digestState.digestSettingsV2;
    if (v2.tieredMode) {
      const tierUsage = digestState.contextUsage;
      if (!tierUsage?.percent) return false;
      const thresholds = getTierThresholds(
        v2.summaryThreshold,
        v2.tierOverrides,
      );
      return tierUsage.percent >= thresholds.summary;
    }

    // Classic mode
    const usage = ctx.getContextUsage();
    if (!usage?.tokens || !usage?.contextWindow) return false;
    const { tokens, contextWindow } = usage;
    const digest = digestState.digestSettings;
    switch (digest.triggerMode) {
      case "reserve":
        return tokens > contextWindow - settings.reserveTokens;
      case "percentage":
        return tokens > contextWindow * (digest.triggerPercentage / 100);
      case "fixed":
        return tokens > digest.triggerFixed;
      default:
        return false;
    }
  }

  // ── Panel Management ──
  function openPanel(ctx: ExtensionContext): string {
    const panels = getPanels();
    if (!panels) return "Error: Panel manager not available";

    if (panels.isOpen(PANEL_ID)) {
      panelComponent?.refresh();
      panels.requestRender();
      return "Digestion panel refreshed";
    }

    let component: CompactionPanelComponent | null = null;
    const result = panels.createPanel(
      PANEL_ID,
      (panelCtx: any) => {
        component = new CompactionPanelComponent(panelCtx, digestState);
        panelComponent = component;
        component.triggerCompact = () => {
          if (compactionInProgress || pendingCompact) return;
          pendingCompact = true;
          setCompactionIntent("manual_panel");
          const digest = digestState.digestSettings;
          const strategies = digestState.strategies;
          const strategyPreset = strategies.find(
            (s) => s.id === digest.strategy,
          );
          const instructions = strategyPreset?.instructions || undefined;
          ctxRef?.compact({
            ...(instructions ? { customInstructions: instructions } : {}),
            onError: (err: Error) => {
              pendingCompact = false;
              clearCompactionIntent();
              ctxRef?.hasUI &&
                ctxRef.ui.notify(
                  `🐉 Digestion failed: ${err.message}`,
                  "error",
                );
            },
          });
        };
        component.updateModel(ctx.model?.maxTokens ?? null);
        // Sync panel with current digestState usage
        component.syncContextUsage();
        return {
          render: (w: number) => component!.render(w),
          invalidate: () => component!.invalidate(),
          handleInput: (data: string) => component!.handleInput(data),
        };
      },
      {
        anchor: "top-right",
        width: "35%",
        minWidth: 36,
        maxHeight: "60%",
        onClose: () => {
          panelComponent = null;
        },
      },
    );

    if (!result.success) return result.message;
    return "Digestion settings panel opened";
  }

  function closePanel(): string {
    const panels = getPanels();
    if (!panels?.isOpen(PANEL_ID)) return "No panel open";
    panels.close(PANEL_ID);
    return "Digestion panel closed";
  }

  function togglePanel(ctx: ExtensionContext): string {
    if (getPanels()?.isOpen(PANEL_ID)) return closePanel();
    return openPanel(ctx);
  }

  // ── Model + Context Usage Updates ──
  function updateModel(ctx: ExtensionContext): void {
    panelComponent?.updateModel(ctx.model?.maxTokens ?? null);
  }

  function updateContextUsage(ctx: ExtensionContext): void {
    const usage = ctx.getContextUsage();
    if (usage) {
      digestState.contextUsage = {
        tokens: usage.tokens ?? null,
        contextWindow: usage.contextWindow ?? null,
        percent: usage.percent ?? null,
      };
    }
    panelComponent?.syncContextUsage();
  }

  // ── Events ──
  pi.on("session_start", async (_event, ctx) => {
    ctxRef = ctx;
    compactionIntent = null;
    const cwd = getPanels()?.cwd ?? process.cwd();
    digestState = createDigestState(cwd);
    updateModel(ctx);
    ensureSafeReserveTokens(cwd, ctx.model?.maxTokens ?? null);
  });
  pi.on("before_agent_start", async (event) => {
    if (digestState.pendingRemark) {
      const remark = digestState.pendingRemark;
      digestState.pendingRemark = null;
      return {
        systemPrompt: `${event.systemPrompt}\n\n[Post-digestion remark — say this naturally at the start of your next response, in character, as a single short line before addressing anything else:]\n${remark}`,
      };
    }
  });

  // eslint-disable-next-line -- pi supports "session_switch" at runtime; type defs may lag
  (pi as any).on(
    "session_switch",
    async (_event: unknown, ctx: ExtensionContext) => {
      panelComponent = null;
      compactionInProgress = false;
      pendingCompact = false;
      compactionIntent = null;
      stopDigestionStatus();
      ctxRef = ctx;
      const cwd = getPanels()?.cwd ?? process.cwd();
      digestState = createDigestState(cwd);
      updateModel(ctx);
      ensureSafeReserveTokens(cwd, ctx.model?.maxTokens ?? null);
    },
  );
  pi.on("model_select", async (_event, ctx) => {
    updateModel(ctx);
  });
  pi.on("session_shutdown", async () => {
    panelComponent = null;
    compactionIntent = null;
  });

  // Update context usage display after each turn, then check proactive trigger
  pi.on("turn_end", async (_event, ctx) => {
    updateContextUsage(ctx);

    // Task-boundary detection: track file paths and detect topic shifts
    if (
      digestState.digestSettingsV2.tieredMode &&
      !digestState.taskBoundary.suggested
    ) {
      try {
        const branch = ctx.sessionManager.getBranch();
        // Look at recent entries for file-related tool args
        const recentEntries = branch.slice(-20);
        const turnMessages: Record<string, unknown>[] = [];
        for (const entry of recentEntries) {
          if ("message" in entry && entry.message) {
            turnMessages.push(
              entry.message as unknown as Record<string, unknown>,
            );
          }
        }
        const currentPaths = extractFilePathsFromMessages(turnMessages);

        if (currentPaths.size > 0) {
          digestState.taskBoundary.recentFilePaths.push(
            Array.from(currentPaths),
          );
          // Keep sliding window of last 10 turns
          if (digestState.taskBoundary.recentFilePaths.length > 10) {
            digestState.taskBoundary.recentFilePaths.shift();
          }

          // Detect task boundary: compare last 3 turns vs previous 3 turns
          if (digestState.taskBoundary.recentFilePaths.length >= 6) {
            const recent = new Set(
              digestState.taskBoundary.recentFilePaths.slice(-3).flat(),
            );
            const previous = new Set(
              digestState.taskBoundary.recentFilePaths.slice(-6, -3).flat(),
            );
            const similarity = jaccardSimilarity(recent, previous);

            // If less than 20% overlap and context usage is above alert threshold
            const usage = digestState.contextUsage;
            const thresholds = getTierThresholds(
              digestState.digestSettingsV2.summaryThreshold,
              digestState.digestSettingsV2.tierOverrides,
            );
            if (
              similarity < 0.2 &&
              usage?.percent != null &&
              usage.percent >= thresholds.alert
            ) {
              ctx.hasUI &&
                ctx.ui.notify(
                  "\ud83d\udc09 Task boundary detected \u2014 file context has shifted significantly. Consider compacting to start fresh.",
                  "info",
                );
              digestState.taskBoundary.suggested = true;
            }
          }
        }
      } catch {
        // Task-boundary detection is best-effort; never block turn processing
      }
    }

    // Proactive compaction: fire ctx.compact() when our threshold is met.
    // pendingCompact guards against double-trigger while waiting for session_before_compact.
    // All UI/flag updates happen in session_before_compact once confirmed.
    if (compactionInProgress || pendingCompact || !shouldTrigger(ctx)) return;
    pendingCompact = true;
    setCompactionIntent("proactive_turn_end", true);

    const turnDigest = digestState.digestSettings;
    const turnStrategies = digestState.strategies;
    const turnStrategyPreset = turnStrategies.find(
      (s) => s.id === turnDigest.strategy,
    );
    const turnInstructions = turnStrategyPreset?.instructions || undefined;

    ctx.compact({
      ...(turnInstructions ? { customInstructions: turnInstructions } : {}),
      onError: (err: Error) => {
        pendingCompact = false;
        clearCompactionIntent();
        ctx.hasUI &&
          ctx.ui.notify(`🐉 Digestion failed: ${err.message}`, "error");
      },
    });
  });

  // Track compaction stats, history, and update context usage
  pi.on("session_compact", async (event, ctx) => {
    const completedCompactionIntent = compactionIntent;
    compactionInProgress = false;
    pendingCompact = false;
    clearCompactionIntent();
    stopDigestionStatus();
    updateContextUsage(ctx);
    {
      const usage = ctx.getContextUsage();
      const before = (event as any).compactionEntry?.tokensBefore ?? null;
      const after = usage?.tokens ?? null;

      digestState.compactionStats = {
        lastCompactedAt: Date.now(),
        tokensBefore: before,
        tokensAfter: after,
      };

      // Record compaction history
      const pctFreed =
        before && after && before > 0
          ? Math.round(((before - after) / before) * 100)
          : 0;
      const details = (event as any).compactionEntry?.details;
      const historyEntry: CompactionHistoryEntry = {
        timestamp: Date.now(),
        tokensBefore: before ?? 0,
        tokensAfter: after,
        percentFreed: pctFreed,
        tier: (details?.source === "dragon-digestion-v2" ? 4 : 0) as TierLevel,
        strategy: (details?.strategy as string) ?? "default",
        anchored: (details?.anchored as boolean) ?? false,
        model: (details?.model as string) ?? "pi-default",
        source:
          details?.source === "dragon-digestion-v2"
            ? "dragon-digestion-v2"
            : "pi-default",
      };
      digestState.compactionHistory.push(historyEntry);
      if (digestState.compactionHistory.length > 10) {
        digestState.compactionHistory.shift();
      }

      // Reset tier notification after compaction (tier likely dropped)
      digestState.lastNotifiedTier = 0;

      // Reset task-boundary suggestion flag after compaction
      digestState.taskBoundary.suggested = false;

      // Thrashing detection: warn if 3+ compactions in 5 minutes
      const now = Date.now();
      digestState.thrashingState.recentCompactions.push(now);
      const cutoff = now - 5 * 60 * 1000;
      digestState.thrashingState.recentCompactions =
        digestState.thrashingState.recentCompactions.filter((t) => t > cutoff);
      if (
        digestState.thrashingState.recentCompactions.length >= 3 &&
        !digestState.thrashingState.warningShown
      ) {
        digestState.thrashingState.warningShown = true;
        ctx.hasUI &&
          ctx.ui.notify(
            "\ud83d\udc09 Compaction thrashing detected! 3+ compactions in 5 minutes. Consider lowering summaryThreshold or using a larger context model.",
            "warning",
          );
      }

      // Quality probe — only for our custom compactions in tiered mode
      if (
        details?.source === "dragon-digestion-v2" &&
        digestState.digestSettingsV2.tieredMode &&
        ctxRef
      ) {
        const compactionEntry = (event as unknown as Record<string, unknown>)
          .compactionEntry as Record<string, unknown> | undefined;
        const summaryText = (compactionEntry?.summary as string) ?? "";
        if (summaryText.length > 0) {
          // Run async probe — don't block the event handler
          runQualityProbe(ctxRef, summaryText, digestState).catch(() => {
            /* silent */
          });
        }
      }

      // 🐉 Post-digestion remark (async, doesn't block)
      const v2Remarks = digestState.digestSettingsV2;
      const autoResume = shouldAutoResumeAfterCompaction(
        completedCompactionIntent,
      );
      if (v2Remarks.digestRemarks && ctx.hasUI) {
        const remarkStats = {
          tokensBefore: historyEntry.tokensBefore,
          tokensAfter: historyEntry.tokensAfter,
          percentFreed: historyEntry.percentFreed,
          tier: historyEntry.tier,
          strategy: historyEntry.strategy,
          messagesCount: historyEntry.tokensBefore, // rough proxy
          contextPercent: Math.round(usage?.percent ?? 0),
          compactionCount: digestState.compactionHistory.length,
        };
        const remarkPromise = generateDigestRemark(ctx, remarkStats, v2Remarks)
          .then((remark) => {
            digestState.pendingRemark = `🐉 ${remark}`;
          })
          .catch(() => {});
        if (autoResume) {
          remarkPromise.finally(() => {
            pi.sendUserMessage(completedCompactionIntent.resumeMessage);
          });
        }
      } else if (autoResume) {
        pi.sendUserMessage(completedCompactionIntent.resumeMessage);
      }

      panelComponent?.invalidate();
    }
  });

  // ── Compaction Gatekeeper + Tiered Summary Takeover ──
  // Fires before any compaction (proactive, manual /compact, or pi's safety-net).
  // In classic mode: only cancels if user disabled auto-compaction.
  // In tiered mode: takes over compaction with structured summary templates.
  pi.on("session_before_compact", async (event, ctx) => {
    pendingCompact = false;
    compactionIntent ??= {
      source: "unknown",
      autoResume: false,
      resumeMessage:
        "Resume the interrupted work from just before compaction. Continue without restarting from scratch.",
    };
    const cwd = getPanels()?.cwd ?? process.cwd();
    const settings =
      panelComponent?.liveSettings ?? readCompactionSettings(cwd);

    if (!settings.enabled) {
      clearCompactionIntent();
      return { cancel: true };
    }

    // Start animated status
    compactionInProgress = true;
    startDigestionStatus(ctx);

    // In tiered mode, take over compaction with structured summary
    const v2 = digestState.digestSettingsV2;
    if (!v2.tieredMode) return; // Classic mode — let pi handle compaction

    // Extract preparation data from event
    const preparation = (event as unknown as Record<string, unknown>)
      .preparation as Record<string, unknown> | undefined;
    if (!preparation) return; // No preparation data — let pi handle it

    const messagesToSummarize = preparation.messagesToSummarize as
      | Record<string, unknown>[]
      | undefined;
    const previousSummary = preparation.previousSummary as string | undefined;
    const firstKeptEntryId = preparation.firstKeptEntryId as string | undefined;
    const tokensBefore = preparation.tokensBefore as number | undefined;

    if (
      !messagesToSummarize?.length ||
      !firstKeptEntryId ||
      tokensBefore === undefined
    ) {
      return; // Missing data — let pi handle it
    }

    // Resolve summary model
    const resolved = await resolveSummaryModel(ctx, v2.summaryModel);
    if (!resolved) {
      // Can't make LLM call — fall back to pi's default compaction
      return;
    }

    try {
      // Serialize messages for the prompt
      const serialized = serializeMessages(messagesToSummarize);
      const strategyId = v2.strategy;

      // Resolve strategy instructions (supports custom strategies from JSON files)
      const allStrategies = digestState.strategies;
      const resolvedStrategy = allStrategies.find((s) => s.id === strategyId);
      const strategyInstructions = resolvedStrategy?.instructions || undefined;

      // Build prompt — anchored update if previous summary exists, first compaction otherwise
      const prompt =
        v2.anchoredUpdates && previousSummary
          ? buildAnchoredUpdatePrompt(
              previousSummary,
              serialized,
              strategyId,
              strategyInstructions,
            )
          : buildFirstCompactionPrompt(
              serialized,
              strategyId,
              strategyInstructions,
            );

      // Make the LLM call
      const userMessage: UserMessage = {
        role: "user",
        content: [{ type: "text", text: prompt }],
        timestamp: Date.now(),
      };

      const response = await complete(
        resolved.model,
        {
          systemPrompt:
            "You are a session summarizer. Follow the instructions precisely.",
          messages: [userMessage],
        },
        {
          apiKey: resolved.apiKey,
          headers: resolved.headers,
          signal: AbortSignal.timeout(30_000),
        },
      );

      const summary = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();

      if (!summary) return; // Empty summary — fall back to pi's default

      // Return our custom compaction
      return {
        compaction: {
          summary,
          firstKeptEntryId,
          tokensBefore,
          details: {
            source: "dragon-digestion-v2",
            strategy: strategyId,
            anchored: !!(v2.anchoredUpdates && previousSummary),
            model: resolved.model.id as string,
          },
        },
      };
    } catch (err) {
      // LLM call failed — fall back to pi's default compaction
      const msg = err instanceof Error ? err.message : String(err);
      ctx.hasUI &&
        ctx.ui.notify(
          `🐉 Custom digestion failed, using default: ${msg}`,
          "warning",
        );
      return;
    }
  });

  // ── Tiered Context Filtering ──
  // eslint-disable-next-line -- pi supports "context" events at runtime; type defs may lag
  (pi as any).on("context", async (event: any, ctx: any) => {
    const v2 = digestState.digestSettingsV2;
    if (!v2.tieredMode) return; // Classic mode — no context filtering

    // Get usage from panel component (updated on turn_end)
    const usage = digestState.contextUsage;
    if (usage?.percent == null) return; // null/undefined only; 0 is valid

    const thresholds = getTierThresholds(v2.summaryThreshold, v2.tierOverrides);
    const tier = getCurrentTier(usage.percent, thresholds);

    // Tier transition notification — alert user when crossing into a higher tier
    if (tier >= 1) {
      if (tier > digestState.lastNotifiedTier) {
        const tierNames = [
          "Healthy",
          "Alert",
          "Light pruning",
          "Heavy pruning",
          "Digesting",
        ];
        ctx.hasUI &&
          ctx.ui.notify(
            `🐉 Context tier: ${tierNames[tier]} (${Math.round(usage.percent)}%)`,
            tier >= 3 ? "warning" : "info",
          );
        digestState.lastNotifiedTier = tier;
      }
    }

    // Apply the highest active tier only — each tier function internally
    // calls applyHygiene with its own keepResults, so calling them in
    // sequence would double-mask already-breadcrumbed messages.
    const msgs = event.messages as Record<string, unknown>[];
    let filtered: Record<string, unknown>[];

    if (tier >= 3) {
      // Tier 3: Heavy prune (includes hygiene with keep=2)
      filtered = applyHeavyPrune(msgs);
    } else if (tier >= 2) {
      // Tier 2: Light prune (includes hygiene with keep=ceil(N/2))
      filtered = applyLightPrune(msgs, v2.hygieneKeepResults);
    } else {
      // Tier 0-1: Hygiene only
      filtered = applyHygiene(msgs, v2.hygieneKeepResults);
    }

    // Track tier savings (count messages that were modified)
    if (filtered !== msgs) {
      let maskedCount = 0;
      for (let i = 0; i < filtered.length; i++) {
        if (filtered[i] !== msgs[i]) maskedCount++;
      }
      if (maskedCount > 0) {
        if (tier >= 3)
          digestState.tierSavings.heavyPruneMessagesFiltered += maskedCount;
        else if (tier >= 2)
          digestState.tierSavings.lightPruneMessagesFiltered += maskedCount;
        else digestState.tierSavings.hygieneMessagesMasked += maskedCount;
        digestState.tierSavings.totalMessagesFiltered += maskedCount;
      }
    }

    // Return modified messages if anything changed
    if (filtered !== msgs) {
      return { ...event, messages: filtered };
    }
  });

  // ── Anthropic Context Management (cache-preserving server-side edits) ──
  pi.on("before_provider_request", async (event, ctx) => {
    if (ctx.model?.provider !== "anthropic") return;

    const v2Anthropic = digestState.digestSettingsV2;
    const lab = (globalThis as any)[Symbol.for("pantry.lab")] as
      | import("./dragon-lab").DragonLabAPI
      | undefined;
    if (
      !v2Anthropic.tieredMode ||
      !lab?.isActive("anthropic.context-management")
    )
      return;

    const usage = digestState.contextUsage;
    if (!usage?.percent || !usage?.contextWindow) return;

    const thresholds = getTierThresholds(
      v2Anthropic.summaryThreshold,
      v2Anthropic.tierOverrides,
    );
    const tier = getCurrentTier(usage.percent, thresholds);
    if (tier < 2) return; // Only inject at Tier 2+

    const edits: Record<string, unknown>[] = [];

    // Tier 2+: Clear old tool uses (cache-preserving)
    if (tier >= 2) {
      edits.push({
        type: "clear_tool_uses_20250919",
        trigger: {
          type: "input_tokens",
          value: Math.round(
            (thresholds.lightPrune / 100) * usage.contextWindow,
          ),
        },
        keep: { type: "tool_uses", value: v2Anthropic.hygieneKeepResults },
        clear_at_least: { type: "input_tokens", value: 5000 },
      });
    }

    // Tier 3+: Clear old thinking blocks (cache-preserving)
    if (tier >= 3) {
      edits.push({ type: "clear_thinking_20251015" });
    }

    // Tier 4: Server-side compaction with strategy instructions
    if (tier >= 4) {
      const strategies = digestState.strategies;
      const strategy =
        strategies.find((s) => s.id === v2Anthropic.strategy) ?? strategies[0]!;
      edits.push({
        type: "compact_20260112",
        trigger: {
          type: "input_tokens",
          value: Math.round((thresholds.summary / 100) * usage.contextWindow),
        },
        instructions: strategy.instructions || undefined,
      });
    }

    if (edits.length === 0) return;

    // Return modified payload with context_management field
    // event.payload is the raw provider request; spread it with our addition
    const payload =
      (event as unknown as Record<string, unknown>).payload ?? event;
    return {
      ...(payload as Record<string, unknown>),
      context_management: { edits },
    };
  });

  // ── /digestion Command ──
  pi.registerCommand("digestion", {
    description: "Manage digestion settings panel (compaction tuning)",
    handler: async (args, ctx) => {
      const subcmd = (args ?? "").trim().toLowerCase();
      switch (subcmd) {
        case "open":
        case "show":
          ctx.ui.notify(openPanel(ctx), "info");
          return;
        case "close":
        case "hide":
          ctx.ui.notify(closePanel(), "info");
          return;
        case "toggle":
        case "":
          ctx.ui.notify(togglePanel(ctx), "info");
          return;
        case "status": {
          const cwd = getPanels()?.cwd ?? process.cwd();
          const settings = readCompactionSettings(cwd);
          const digest = readDigestSettings(cwd);
          const usage = ctx.getContextUsage();
          const statusLines = [
            `Auto-compaction: ${settings.enabled ? "ON" : "OFF"}`,
            `Trigger mode: ${TRIGGER_MODE_LABELS[digest.triggerMode]}`,
          ];
          switch (digest.triggerMode) {
            case "reserve":
              statusLines.push(
                `Reserve tokens: ${formatTokens(settings.reserveTokens)}`,
              );
              break;
            case "percentage":
              statusLines.push(`Trigger at: ${digest.triggerPercentage}%`);
              break;
            case "fixed":
              statusLines.push(
                `Trigger at: ${formatTokens(digest.triggerFixed)} tokens`,
              );
              break;
          }
          statusLines.push(
            `Keep recent: ${formatTokens(settings.keepRecentTokens)}`,
          );
          const strategies = digestState.strategies;
          const strategy =
            strategies.find((s) => s.id === digest.strategy) ?? strategies[0]!;
          statusLines.push(`Strategy: ${strategy.label}`);
          if (usage?.tokens != null && usage?.contextWindow != null) {
            const threshold = usage.contextWindow - settings.reserveTokens;
            const thresholdPct = Math.round(
              (threshold / usage.contextWindow) * 100,
            );
            statusLines.push(
              `Context: ${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)} (${usage.percent ?? 0}%)`,
            );
            statusLines.push(
              `Compaction triggers at: ${formatTokens(threshold)} (${thresholdPct}%)`,
            );
          }
          // Add tiered mode info
          const statusV2 = digestState.digestSettingsV2;
          if (statusV2.tieredMode) {
            const thresholds = getTierThresholds(
              statusV2.summaryThreshold,
              statusV2.tierOverrides,
            );
            const currentUsage = ctx.getContextUsage();
            const tier = currentUsage?.percent
              ? getCurrentTier(currentUsage.percent, thresholds)
              : 0;
            statusLines.push("");
            statusLines.push(`Tier mode: Tiered (Tier ${tier} active)`);
            statusLines.push(
              `Summary threshold: ${statusV2.summaryThreshold}%`,
            );
            statusLines.push(
              `Hygiene keep: ${statusV2.hygieneKeepResults} results`,
            );
            statusLines.push(
              `Tiers: Alert ${thresholds.alert.toFixed(0)}% \u00b7 Light ${thresholds.lightPrune.toFixed(0)}% \u00b7 Heavy ${thresholds.heavyPrune.toFixed(0)}% \u00b7 Summary ${thresholds.summary}%`,
            );
          }
          ctx.ui.notify(statusLines.join("\n"), "info");
          return;
        }
        case "history": {
          if (digestState.compactionHistory.length === 0) {
            ctx.ui.notify("No compaction history this session.", "info");
            return;
          }
          const histLines = [
            "\ud83d\udc09 Compaction History (this session)\n",
          ];
          for (const entry of digestState.compactionHistory) {
            const time = formatRelativeTime(entry.timestamp);
            const saved =
              entry.tokensAfter !== null
                ? `${formatTokens(entry.tokensBefore)}\u2192${formatTokens(entry.tokensAfter)} (${entry.percentFreed}% freed)`
                : `${formatTokens(entry.tokensBefore)} before`;
            const source =
              entry.source === "dragon-digestion-v2"
                ? `Tier ${entry.tier} \u00b7 ${entry.strategy}${entry.anchored ? " (anchored)" : ""} \u00b7 ${entry.model}`
                : "pi default";
            histLines.push(`  ${time}: ${saved}`);
            histLines.push(`    ${source}`);
          }

          const sv = digestState.tierSavings;
          if (sv.totalMessagesFiltered > 0) {
            histLines.push("");
            histLines.push("Free tier activity:");
            if (sv.hygieneMessagesMasked > 0)
              histLines.push(
                `  Hygiene: ~${sv.hygieneMessagesMasked} msgs masked`,
              );
            if (sv.lightPruneMessagesFiltered > 0)
              histLines.push(
                `  Light prune: ~${sv.lightPruneMessagesFiltered} msgs filtered`,
              );
            if (sv.heavyPruneMessagesFiltered > 0)
              histLines.push(
                `  Heavy prune: ~${sv.heavyPruneMessagesFiltered} msgs filtered`,
              );
          }

          ctx.ui.notify(histLines.join("\n"), "info");
          return;
        }
        case "preview": {
          // Ensure fresh usage data
          const rawUsage = ctx.getContextUsage();
          if (rawUsage) {
            digestState.contextUsage = {
              tokens: rawUsage.tokens ?? null,
              contextWindow: rawUsage.contextWindow ?? null,
              percent: rawUsage.percent ?? null,
            };
          }
          const v2 = digestState.digestSettingsV2;
          const usage = digestState.contextUsage;

          if (!usage?.percent || !usage?.contextWindow) {
            ctx.ui.notify("No context usage data yet.", "info");
            return;
          }

          const thresholds = getTierThresholds(
            v2.summaryThreshold,
            v2.tierOverrides,
          );
          const currentTier = getCurrentTier(usage.percent, thresholds);

          // Get messages from session branch
          const branch = ctx.sessionManager.getBranch();
          const messages = branch
            .filter((e: any) => e.type === "message")
            .map((e: any) => e.message) as Record<string, unknown>[];

          const toolResults = messages.filter(
            (m) => m.role === "toolResult" && !m.isError,
          );
          const errorResults = messages.filter(
            (m) => m.role === "toolResult" && m.isError,
          );

          // Dry-run each tier
          const afterHygiene = applyHygiene(messages, v2.hygieneKeepResults);
          const hygieneMasked = messages.filter(
            (m, i) => afterHygiene[i] !== m,
          ).length;

          const afterLight = applyLightPrune(messages, v2.hygieneKeepResults);
          const lightMasked = messages.filter(
            (m, i) => afterLight[i] !== m,
          ).length;

          const afterHeavy = applyHeavyPrune(messages);
          const heavyMasked = messages.filter(
            (m, i) => afterHeavy[i] !== m,
          ).length;

          const prevLines = [
            "🐉 Digestion Preview\n",
            `Current usage: ${Math.round(usage.percent)}% (${formatTokens(usage.tokens!)} / ${formatTokens(usage.contextWindow)})`,
            `Active tier: ${currentTier}`,
            `Summary threshold: ${v2.summaryThreshold}%\n`,
            `Messages: ${messages.length} total, ${toolResults.length} tool results, ${errorResults.length} errors\n`,
            `${currentTier >= 0 ? "✓" : "○"} Tier 0 (Hygiene): Would mask ${hygieneMasked} old tool results (keeping last ${v2.hygieneKeepResults})`,
            `${currentTier >= 1 ? "✓" : "○"} Tier 1 (Alert at ${thresholds.alert.toFixed(0)}%): Notification only`,
            `${currentTier >= 2 ? "✓" : "○"} Tier 2 (Light at ${thresholds.lightPrune.toFixed(0)}%): Would filter ${lightMasked} messages`,
            `${currentTier >= 3 ? "✓" : "○"} Tier 3 (Heavy at ${thresholds.heavyPrune.toFixed(0)}%): Would filter ${heavyMasked} messages`,
            `${currentTier >= 4 ? "✓" : "○"} Tier 4 (Summary at ${thresholds.summary}%): LLM compaction with '${v2.strategy}' strategy`,
          ];

          ctx.ui.notify(prevLines.join("\n"), "info");
          return;
        }
        case "compact": {
          if (!ctxRef) {
            ctx.ui.notify("No active session.", "warning");
            return;
          }
          const digest = digestState.digestSettings;
          const strategies = digestState.strategies;
          const strategyPreset = strategies.find(
            (s) => s.id === digest.strategy,
          );
          const instructions = strategyPreset?.instructions || undefined;
          pendingCompact = true;
          setCompactionIntent("manual_tool");
          ctx.ui.notify("🐉 Triggering manual compaction...", "info");
          ctxRef.compact({
            ...(instructions ? { customInstructions: instructions } : {}),
            onError: (err: Error) => {
              pendingCompact = false;
              clearCompactionIntent();
              ctx.ui.notify(`🐉 Compaction failed: ${err.message}`, "error");
            },
          });
          return;
        }
        default: {
          const kh = getPanels()?.keyHints;
          ctx.ui.notify(
            [
              "🐉 Digestion Settings - compaction tuning for dragons",
              "",
              "  /digestion               Toggle panel",
              "  /digestion open          Open panel",
              "  /digestion close         Close panel",
              "  /digestion status        Show current settings",
              "  /digestion history       Compaction history & tier stats",
              "  /digestion preview       Dry-run: what each tier would prune",
              "  /digestion compact       Trigger manual compaction",
              "",
              "Threshold · [mode]  Tab while hovered cycles mode",
              "  Reserve      Keep N tokens free for LLM response",
              "  Percentage   Compact when context reaches N% full",
              "  Fixed        Compact when tokens exceed N",
              "",
              "Strategy (affects manual Compact Now):",
              "  Default      Standard compaction summary",
              "  Code         Focus on code changes & technical decisions",
              "  Tasks        Focus on goals, progress & next steps",
              "  Minimal      Extremely brief, essentials only",
              "  Debug        Preserve debugging state & error traces",
              "",
              "When focused: ↑↓ navigate, ←→ or Space to adjust,",
              `${COPY_GLOBAL_LABEL} to copy from global config,`,
              "Enter on 'Compact Now' to trigger manually,",
              `${kh?.spatialFocusKey ?? "Ctrl+Arrows"} to focus, ${kh?.closeKey ?? "Q"} to close, ${kh?.unfocusKey ?? "Escape"} to unfocus`,
            ].join("\n"),
            "info",
          );
        }
      }
    },
  });

  // ── dragon_digest Custom Tool ──
  // Allows the LLM to proactively manage context by checking status, previewing, or triggering compaction.
  pi.registerTool({
    name: "dragon_digest",
    label: "Dragon Digest",
    description:
      "Trigger context compaction/digestion. Use when context is getting heavy (above 60% usage) and you want to free up space. Can show a preview of what will be compacted, check current status, or trigger compaction.",
    promptSnippet:
      "dragon_digest: Check context usage, preview tier impact, or trigger compaction",
    promptGuidelines: [
      "Use dragon_digest proactively when context usage exceeds 60% and you're about to start a new task",
      "Use action 'preview' first to show the user what will happen, then 'compact' to execute",
      "Use action 'status' for a quick usage check without the full tier breakdown",
    ],
    parameters: Type.Object({
      action: Type.Union(
        [
          Type.Literal("preview"),
          Type.Literal("compact"),
          Type.Literal("status"),
        ],
        {
          description:
            "Action: 'preview' to show what would be compacted, 'compact' to trigger compaction, 'status' to show current tier and usage",
        },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Ensure fresh usage data from ctx
      const raw = ctx.getContextUsage();
      if (raw) {
        digestState.contextUsage = {
          tokens: raw.tokens ?? null,
          contextWindow: raw.contextWindow ?? null,
          percent: raw.percent ?? null,
        };
      }
      const v2 = digestState.digestSettingsV2;
      const usage = digestState.contextUsage;

      switch (params.action) {
        case "status": {
          if (!usage?.percent || !usage?.contextWindow) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No context usage data available yet.",
                },
              ],
              details: {},
            };
          }
          const thresholds = getTierThresholds(
            v2.summaryThreshold,
            v2.tierOverrides,
          );
          const tier = getCurrentTier(usage.percent, thresholds);
          const tierNames = [
            "Healthy",
            "Alert",
            "Light pruning",
            "Heavy pruning",
            "Digesting",
          ];
          const history = digestState.compactionHistory;
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  `Context: ${Math.round(usage.percent)}% (${formatTokens(usage.tokens!)} / ${formatTokens(usage.contextWindow)})`,
                  `Tier: ${tier} (${tierNames[tier]})`,
                  `Mode: ${v2.tieredMode ? "Tiered" : "Classic"}`,
                  `Strategy: ${v2.strategy}`,
                  `Summary threshold: ${v2.summaryThreshold}%`,
                  `Compactions this session: ${history.length}`,
                ].join("\n"),
              },
            ],
            details: {},
          };
        }

        case "preview": {
          if (!usage?.percent || !usage?.contextWindow) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No context usage data available yet.",
                },
              ],
              details: {},
            };
          }
          const thresholds = getTierThresholds(
            v2.summaryThreshold,
            v2.tierOverrides,
          );
          const currentTier = getCurrentTier(usage.percent, thresholds);

          // Get messages from session branch for dry-run
          const branch = ctx.sessionManager.getBranch();
          const messages = branch
            .filter((e: any) => e.type === "message")
            .map((e: any) => e.message) as Record<string, unknown>[];
          const toolResults = messages.filter(
            (m) => m.role === "toolResult" && !m.isError,
          );

          const afterHygiene = applyHygiene(messages, v2.hygieneKeepResults);
          const hygieneMasked = messages.filter(
            (m, i) => afterHygiene[i] !== m,
          ).length;

          const afterLight = applyLightPrune(messages, v2.hygieneKeepResults);
          const lightMasked = messages.filter(
            (m, i) => afterLight[i] !== m,
          ).length;

          const afterHeavy = applyHeavyPrune(messages);
          const heavyMasked = messages.filter(
            (m, i) => afterHeavy[i] !== m,
          ).length;

          return {
            content: [
              {
                type: "text" as const,
                text: [
                  `Usage: ${Math.round(usage.percent)}% | Tier: ${currentTier} | Messages: ${messages.length} (${toolResults.length} tool results)`,
                  "",
                  `${currentTier >= 0 ? "✓" : "○"} Tier 0 (Hygiene): ${hygieneMasked} tool results would be masked (keeping last ${v2.hygieneKeepResults})`,
                  `${currentTier >= 1 ? "✓" : "○"} Tier 1 (Alert at ${thresholds.alert.toFixed(0)}%): notification`,
                  `${currentTier >= 2 ? "✓" : "○"} Tier 2 (Light at ${thresholds.lightPrune.toFixed(0)}%): ${lightMasked} messages filtered`,
                  `${currentTier >= 3 ? "✓" : "○"} Tier 3 (Heavy at ${thresholds.heavyPrune.toFixed(0)}%): ${heavyMasked} messages filtered`,
                  `${currentTier >= 4 ? "✓" : "○"} Tier 4 (Summary at ${thresholds.summary}%): LLM compaction with '${v2.strategy}' strategy`,
                ].join("\n"),
              },
            ],
            details: {},
          };
        }

        case "compact": {
          if (!ctxRef) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No active session — cannot compact.",
                },
              ],
              details: {},
            };
          }
          const digestSettings = digestState.digestSettings;
          const strategyPreset = digestState.strategies.find(
            (s) => s.id === digestSettings.strategy,
          );
          const instructions = strategyPreset?.instructions || undefined;
          pendingCompact = true;
          setCompactionIntent("manual_tool");
          ctxRef.compact({
            ...(instructions ? { customInstructions: instructions } : {}),
            onError: (err: Error) => {
              pendingCompact = false;
              clearCompactionIntent();
              ctx.hasUI &&
                ctx.ui.notify(`🐉 Compaction failed: ${err.message}`, "error");
            },
          });
          return {
            content: [
              {
                type: "text" as const,
                text: "Compaction triggered. The dragon is digesting — context will be compacted after the current turn.",
              },
            ],
            details: {},
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: "Unknown action. Use 'preview', 'compact', or 'status'.",
              },
            ],
            details: {},
          };
      }
    },
  });
}
