/**
 * quest-tool.ts — The quest dispatch tool for hoard-allies.
 *
 * Replaces pi's built-in subagent tool with taxonomy-aware dispatch.
 * Supports single quests, parallel rallies, and sequential chains.
 * FrugalGPT-style model cascading within each noun tier.
 */

import { Type, type Static } from "@sinclair/typebox";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";

// Theme is an internal Pi type that isn't exported from the package surface.
// We define a structural alias covering only the methods this tool actually uses.
type RenderTheme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
};
import { readHoardSetting } from "../../lib/settings.ts";
import { spawnPi, findPiBinary } from "./spawn.ts";
import {
  availableModels,
  isRetryable,
  recordProviderFailure,
} from "./cascade.ts";
import {
  registerAlly,
  appendAllyLine,
  appendAllyStoneMessage,
  deregisterAlly,
  registerAllyStatusTool,
} from "./ally-status-tool.ts";
import type { AlliesState, AlliesAPI, QuestResult } from "./types.ts";
import {
  type Noun,
  CURATED_NAMES,
  parseComboName,
  JOB_TOOLS,
} from "../../lib/ally-taxonomy.ts";
import { generateShortId } from "../../lib/id.ts";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";

// ── Sending Stone API ──
const STONE_KEY = Symbol.for("hoard.stone");
function getStoneAPI():
  | {
      send(msg: {
        from: string;
        displayName?: string;
        type: string;
        addressing: string;
        content: string;
        color?: string;
        metadata?: unknown;
      }): Promise<void>;
      onMessage(
        handler: (msg: {
          from?: string;
          displayName?: string;
          type?: string;
          addressing?: string;
          content?: string;
        }) => void,
      ): () => void;
      port(): number | null;
    }
  | undefined {
  return (globalThis as any)[STONE_KEY];
}

// ── Re-imports from index.ts (shared taxonomy state) ──
// These are accessed via globalThis since extensions share that namespace

const ALLIES_STATE_KEY = Symbol.for("hoard.allies.state");

function getState(): AlliesState {
  return (globalThis as Record<symbol, AlliesState>)[ALLIES_STATE_KEY]!;
}

// ── Taxonomy Constants (imported from lib/ally-taxonomy) ──

// ── Import shared functions from index via globalThis ──

const ALLIES_API_KEY = Symbol.for("hoard.allies.api");

// AlliesAPI interface is in types.ts for shared access

function getAlliesAPI(): AlliesAPI {
  return (globalThis as Record<symbol, AlliesAPI>)[ALLIES_API_KEY];
}

// ── Tool Schema ──

const QuestItem = Type.Object({
  ally: Type.String({
    description:
      "Ally to dispatch (e.g., silly-kobold-scout, clever-griffin-coder)",
  }),
  task: Type.String({ description: "The quest to send the ally on" }),
});

const ChainStep = Type.Object({
  ally: Type.String({ description: "Ally for this chain step" }),
  task: Type.Optional(
    Type.String({
      description:
        "Task template. Use {previous} for previous step's output, {task} for original task.",
    }),
  ),
});

const QuestParams = Type.Object({
  // Single quest
  ally: Type.Optional(
    Type.String({ description: "Ally to dispatch (e.g., silly-kobold-scout)" }),
  ),
  task: Type.Optional(
    Type.String({ description: "The quest to send the ally on" }),
  ),

  // Parallel quests (rally)
  rally: Type.Optional(
    Type.Array(QuestItem, {
      description: "Multiple quests to run in parallel",
    }),
  ),

  // Chain quests (sequential)
  chain: Type.Optional(
    Type.Array(ChainStep, {
      description:
        "Sequential quests. {previous} carries output forward, {task} is the original task.",
    }),
  ),

  // Optional timeout in milliseconds (default: no timeout)
  timeoutMs: Type.Optional(
    Type.Number({
      description:
        "Per-ally timeout in milliseconds. Allies that exceed this are killed and reported as timed out. Recommended: 300000 (5 minutes).",
    }),
  ),

  // Optional check-in interval in milliseconds (default: no check-ins)
  checkInIntervalMs: Type.Optional(
    Type.Number({
      description:
        "How often (ms) to poll each ally for a status heartbeat while they work. Recommended: 30000 (30 seconds).",
    }),
  ),
});

type QuestParamsType = Static<typeof QuestParams>;

// ── Helpers ──

// comboName and parseComboName imported from lib/ally-taxonomy

// JOB_TOOLS imported from lib/ally-taxonomy

const MAX_SUBAGENT_DEPTH: Record<Noun, number> = {
  kobold: 0,
  griffin: 1,
  dragon: 2,
};

function makeId(defName: string): string {
  return `${defName}-${Date.now()}-${generateShortId()}`;
}

type ProgressFn = ((msg: string) => void) | undefined;

// Return true if any of the defNames meets or exceeds the confirmAbove tier threshold
function needsConfirm(defNames: string[], threshold: string): boolean {
  const tierOrder: Record<string, number> = {
    kobold: 0,
    griffin: 1,
    dragon: 2,
  };
  const thresholdTier = tierOrder[threshold] ?? 0;
  return defNames.some((name) => {
    const noun = name.split("-")[1] ?? "";
    return (tierOrder[noun] ?? 0) >= thresholdTier;
  });
}

// Convert a defName like "silly-kobold-scout" into "Silly Kobold Scout"
export function formatDefName(defName: string): string {
  return defName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Single Quest Dispatch ──

/** Options for dispatching a single ally quest. */
interface DispatchOptions {
  ally: string;
  task: string;
  cwd: string;
  notify: (msg: string, defName?: string) => void;
  progress?: ProgressFn;
  timeoutMs?: number;
  checkInIntervalMs?: number;
  onFrozen?: (allyName: string, quietSecs: number, defName?: string) => void;
  signal?: AbortSignal;
}

async function dispatchSingle(opts: DispatchOptions): Promise<QuestResult> {
  const {
    ally,
    task,
    cwd,
    notify,
    progress,
    timeoutMs,
    checkInIntervalMs,
    onFrozen,
    signal,
  } = opts;
  const combo = parseComboName(ally);
  if (!combo) {
    throw new Error(
      `Unknown ally: "${ally}". Available: ${[...CURATED_NAMES].join(", ")}`,
    );
  }

  const api = getAlliesAPI();
  const state = getState();

  const allyName = api.popName(combo.noun);
  const id = makeId(ally);
  api.recordSpawn(id, {
    name: allyName,
    defName: ally,
    combo,
    spawnedAt: Date.now(),
    status: "running",
  });

  progress?.(`⚔️ ${allyName} the ${ally} dispatched`);

  // Build system prompt with name baked in
  const systemPrompt = api.buildAllyPrompt(combo, allyName);

  // Get model fallback chain
  const models = api.getModels();
  const thinking = api.getThinking();
  const modelChain = models[combo.noun] ?? ["glm-4-flash"];
  const available = availableModels(state, modelChain);

  if (available.length === 0) {
    api.recordFailed(id);
    throw new Error(
      `All models for ${combo.noun} tier are on cooldown. Wait and retry.`,
    );
  }

  const piPath = findPiBinary();
  let lastError = "";
  let cascadeAttempts = 0;
  let usedModel = available[0]!;

  // Cascade: try models in order
  for (const model of available) {
    cascadeAttempts++;
    usedModel = model;

    const spawnId = `${ally}-${Date.now()}`;
    registerAlly(spawnId, ally);
    const effectiveTimeoutMs =
      timeoutMs ?? getAlliesAPI().getJobDefaults(combo.job).timeoutMs;
    const effectiveCheckInMs =
      checkInIntervalMs ??
      getAlliesAPI().getJobDefaults(combo.job).checkInIntervalMs;
    const result = await spawnPi({
      piPath,
      cwd,
      model,
      tools: JOB_TOOLS[combo.job],
      systemPrompt,
      task,
      thinking: thinking[combo.adjective],
      maxSubagentDepth: MAX_SUBAGENT_DEPTH[combo.noun],
      defName: ally,
      allyName,
      timeoutMs: effectiveTimeoutMs,
      checkInIntervalMs: effectiveCheckInMs,
      signal,
      onStderrLine: (line) => appendAllyLine(spawnId, line),
      onCheckIn: (
        defName: string,
        elapsedMs: number,
        sinceActivityMs: number,
        recentLine: string,
      ) => {
        const secs = Math.round(elapsedMs / 1000);
        const quietSecs = Math.round(sinceActivityMs / 1000);
        const activityStr = recentLine
          ? `\n   └ ${recentLine.slice(0, 120)}`
          : " · no output yet";
        const frozen =
          effectiveCheckInMs > 0 && sinceActivityMs > effectiveCheckInMs * 4;
        if (frozen) onFrozen?.(allyName, quietSecs, ally);
        const msg = `⏳ ${allyName} the ${defName} — ${secs}s elapsed${frozen ? ` (⚠️ quiet ${quietSecs}s)` : ""}${activityStr}`;
        progress?.(msg); // update tool box if streaming is available
        notify(msg, ally); // pass defName for stone-aware suppression
      },
    }).finally(() => deregisterAlly(spawnId));

    if (result.success) {
      api.recordComplete(id);
      progress?.(`✅ ${allyName} returned (${usedModel})`);
      return {
        allyName,
        defName: ally,
        model: usedModel,
        response: result.response,
        cascadeAttempts,
        usage: result.usage,
      };
    }

    // Record failure for cooldown
    if (result.error) {
      lastError = result.error;
      if (isRetryable(result)) {
        progress?.(`🔄 ${allyName}: ${usedModel} failed, cascading...`);
        recordProviderFailure(state, model, result.error);
        continue; // Try next model
      }
    }

    // Non-retryable failure — stop cascade
    break;
  }

  // All models failed
  api.recordFailed(id);
  throw new Error(
    `Quest failed for ${allyName} the ${ally}. Last error: ${lastError}`,
  );
}

// ── Parallel Rally ──

async function dispatchRally(
  quests: Array<{ ally: string; task: string }>,
  cwd: string,
  notify: (msg: string, defName?: string) => void,
  progress?: ProgressFn,
  timeoutMs?: number,
  checkInIntervalMs?: number,
  onFrozen?: (allyName: string, quietSecs: number, defName?: string) => void,
  signal?: AbortSignal,
): Promise<QuestResult[]> {
  // Pre-validate all combos
  for (const q of quests) {
    const combo = parseComboName(q.ally);
    if (!combo) throw new Error(`Unknown ally: "${q.ally}"`);
  }

  // Dispatch all in parallel
  const maxParallel = readHoardSetting<number>("allies.maxParallel", 4);
  const results: QuestResult[] = [];

  // Respect max parallel with chunking
  for (let i = 0; i < quests.length; i += maxParallel) {
    const chunk = quests.slice(i, i + maxParallel);
    const chunkResults = await Promise.allSettled(
      chunk.map((q) =>
        dispatchSingle({
          ally: q.ally,
          task: q.task,
          cwd,
          notify,
          progress,
          timeoutMs,
          checkInIntervalMs,
          onFrozen,
          signal,
        }),
      ),
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const r = chunkResults[j]!;
      const q = chunk[j]!;
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        // Include error as a failed result — preserve the ally identity
        results.push({
          allyName: q.ally,
          defName: q.ally,
          model: "none",
          response: `Quest failed: ${r.reason?.message ?? r.reason}`,
          cascadeAttempts: 0,
        });
      }
    }
  }

  return results;
}

// ── Chain Step Error ──

/** Thrown by dispatchChain when a step fails; carries all prior successful results. */
class ChainStepError extends Error {
  constructor(
    message: string,
    public readonly partialResults: QuestResult[],
    public readonly failedStepIndex: number,
    public readonly failedAlly: string,
  ) {
    super(message);
    this.name = "ChainStepError";
  }
}

// ── Chain Dispatch ──

async function dispatchChain(
  steps: Array<{ ally: string; task?: string }>,
  originalTask: string,
  cwd: string,
  notify: (msg: string, defName?: string) => void,
  progress?: ProgressFn,
  timeoutMs?: number,
  checkInIntervalMs?: number,
  onFrozen?: (allyName: string, quietSecs: number, defName?: string) => void,
  signal?: AbortSignal,
): Promise<QuestResult[]> {
  const results: QuestResult[] = [];
  let previous = "";

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!;
    // Template replacement
    let task = step.task ?? "{task}";
    task = task.replace(/\{previous\}/g, previous);
    task = task.replace(/\{task\}/g, originalTask);

    try {
      const result = await dispatchSingle({
        ally: step.ally,
        task,
        cwd,
        notify,
        progress,
        timeoutMs,
        checkInIntervalMs,
        onFrozen,
        signal,
      });
      results.push(result);
      previous = result.response;
    } catch (err) {
      throw new ChainStepError(
        (err as Error).message,
        [...results],
        stepIndex,
        step.ally,
      );
    }
  }

  return results;
}

// ── Result Helpers ──

// ── QuestDetails ─────────────────────────────────────────────────────────────
interface QuestDetails {
  mode: string;
  allies: string[];
  error?: boolean;
  displayNames?: string[];
}

function makeResult(text: string, details: QuestDetails) {
  return { content: [{ type: "text" as const, text }], details };
}

function formatSingleResult(result: QuestResult): string {
  const header = `**${result.allyName}** the ${result.defName} (${result.model})`;
  const cascade =
    result.cascadeAttempts > 1
      ? ` [cascaded: ${result.cascadeAttempts} attempts]`
      : "";
  const usage = result.usage
    ? `\n*Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out${result.usage.cacheReadTokens ? ` / ${result.usage.cacheReadTokens} cache` : ""}*`
    : "";

  return `${header}${cascade}${usage}\n\n${result.response}`;
}

function formatResults(results: QuestResult[], mode: string): string {
  if (results.length === 1) {
    return formatSingleResult(results[0]!);
  }

  const sections = results
    .map(
      (r, i) =>
        `### ${mode === "chain" ? `Step ${i + 1}` : `Quest ${i + 1}`}: ${r.allyName} (${r.defName})\n\n${r.response}`,
    )
    .join("\n\n---\n\n");

  return `*${mode === "chain" ? "Chain" : "Rally"}: ${results.length} quests*\n\n${sections}`;
}

// ── Carbon Breath Reporting ──

function reportBreath(result: QuestResult): void {
  if (!result.usage) return;
  const breathApi = (globalThis as any)[Symbol.for("hoard.breath")];
  if (breathApi?.addExternalUsage) {
    breathApi.addExternalUsage({
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      model: result.model,
    });
  }
}

// ── Stone Result Posting ──

function postResultToStone(result: QuestResult): void {
  const stone = getStoneAPI();
  if (!stone) return;
  void stone
    .send({
      from: result.defName,
      displayName: result.allyName ?? formatDefName(result.defName),
      type: "result",
      addressing: "primary-agent",
      content: formatSingleResult(result),
      metadata: {
        allyName: result.allyName,
        defName: result.defName,
      },
    })
    .catch(() => undefined);
}

// ── Tool Registration ──

export function registerQuestTool(pi: ExtensionAPI): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pi.registerTool as any)({
    name: "quest",
    label: "Quest",
    description: `Send allies on quests. Taxonomy: <adjective>-<noun>-<job>.
Adjective (thinking): silly (off) | clever (low) | wise (medium) | elder (high)
Noun (model): kobold ($) | griffin ($$$) | dragon ($$$$$)
Job: scout | reviewer | coder | researcher | planner

Available allies: ${[...CURATED_NAMES].join(", ")}

Modes (use exactly one):
- Single: { ally, task } — one quest
- Rally: { rally: [{ally, task}, ...] } — parallel quests
- Chain: { chain: [{ally, task?}, ...] } — sequential, {previous} carries output

If the sending stone is active, quests dispatch asynchronously and results arrive via stone_send.`,
    promptSnippet:
      "Dispatch allies for tasks that can be parallelized, researched, or delegated",
    promptGuidelines: [
      "Use PROACTIVELY when a task involves research, multi-file review, or implementation that would benefit from parallel work.",
      "MUST BE USED instead of inline work for: scout (read/search recon), reviewer (code review), coder (implement feature), researcher (deep research), planner (architecture decisions).",
      "Match thinking level to task depth: silly/clever for targeted lookups, wise/elder when judgment and reasoning matter.",
      "Do NOT dispatch for simple tasks completable in a few tool calls yourself.",
    ],
    parameters: QuestParams,
    renderCall(args: QuestParamsType, theme: RenderTheme, _context: unknown) {
      const params = args;
      const title = theme.fg("toolTitle", theme.bold("quest "));

      if (params.chain && params.chain.length > 0) {
        const allies = params.chain.map((s) => s.ally ?? "?").join(" → ");
        const taskPreview = params.task
          ? "\n   " + theme.fg("dim", `↳ "${truncateToWidth(params.task, 60)}"`)
          : "";
        return new Text(
          title +
            theme.fg("muted", `[chain ${params.chain.length}] `) +
            theme.fg("dim", allies) +
            taskPreview,
          0,
          0,
        );
      }

      if (params.rally && params.rally.length > 0) {
        const allies = params.rally.map((s) => s.ally).join(", ");
        return new Text(
          title +
            theme.fg("muted", `[rally ${params.rally.length}] `) +
            theme.fg("dim", truncateToWidth(allies, 80)),
          0,
          0,
        );
      }

      if (params.ally) {
        const taskPreview = params.task
          ? "\n   " + theme.fg("dim", `↳ "${truncateToWidth(params.task, 60)}"`)
          : "";
        return new Text(
          title +
            theme.fg("muted", "[single] ") +
            theme.fg("accent", params.ally) +
            taskPreview,
          0,
          0,
        );
      }

      return new Text(title + theme.fg("warning", "invalid params"), 0, 0);
    },
    renderResult(
      result: AgentToolResult<QuestDetails>,
      options: ToolRenderResultOptions,
      theme: RenderTheme,
      _context: unknown,
    ) {
      const d = result.details;

      // Fallback: no details
      if (!d) {
        const first = result.content[0];
        return new Text(first?.type === "text" ? first.text : "", 0, 0);
      }

      // Error
      if (d.error) {
        const first = result.content[0];
        const msg =
          first?.type === "text"
            ? truncateToWidth(first.text, 60)
            : "unknown error";
        return new Text(
          theme.fg("error", "✗ quest failed") +
            "\n   " +
            theme.fg("muted", msg),
          0,
          0,
        );
      }

      // Progress update — style visibly so it actually shows up
      if (options.isPartial || d.mode === "progress") {
        const first = result.content[0];
        const msg = first?.type === "text" ? first.text : "dispatching…";
        return new Text(
          theme.fg("accent", "⏳ ") + theme.fg("text", msg),
          0,
          0,
        );
      }

      // Final results
      const complete = "\n   " + theme.fg("success", "✓ complete");

      if (d.mode === "single") {
        const displayName = d.displayNames?.[0];
        const defFormatted = formatDefName(d.allies[0] ?? "ally");
        const label = displayName
          ? theme.fg("accent", displayName) +
            theme.fg("dim", ` the ${defFormatted}`)
          : theme.fg("accent", defFormatted);
        return new Text("🗡️ " + label + complete, 0, 0);
      }

      if (d.mode === "rally") {
        const names = (d.displayNames ?? d.allies.map(formatDefName)).slice(
          0,
          3,
        );
        const overflow =
          (d.displayNames ?? d.allies).length > 3
            ? ` +${(d.displayNames ?? d.allies).length - 3}`
            : "";
        return new Text(
          "⚔️ " +
            theme.fg("accent", `rally ${d.allies.length}`) +
            "\n   " +
            theme.fg("dim", names.join(", ") + overflow) +
            complete,
          0,
          0,
        );
      }

      if (d.mode === "chain") {
        const names = (d.displayNames ?? d.allies.map(formatDefName)).join(
          " → ",
        );
        return new Text(
          "⛓️ " +
            theme.fg("accent", `chain ${d.allies.length}`) +
            "\n   " +
            theme.fg("dim", truncateToWidth(names, 70)) +
            complete,
          0,
          0,
        );
      }

      if (d.mode === "dispatched") {
        const names = (d.displayNames ?? d.allies.map(formatDefName)).join(
          ", ",
        );
        return new Text(
          "\u26A1 " +
            theme.fg("accent", "dispatched") +
            "\n   " +
            theme.fg("dim", truncateToWidth(names || d.allies.join(", "), 70)) +
            "\n   " +
            theme.fg("muted", "results incoming via stone"),
          0,
          0,
        );
      }

      // Fallback
      const first = result.content[0];
      return new Text(first?.type === "text" ? first.text : "", 0, 0);
    },
    execute: async (
      _toolCallId: string,
      params: QuestParamsType,
      signal: AbortSignal | undefined,
      onUpdate:
        | ((result: {
            content: { type: "text"; text: string }[];
            details: QuestDetails;
          }) => void)
        | undefined,
      ctx: ExtensionContext,
    ) => {
      try {
        // ── Mode validation ──
        const hasChain = params.chain && params.chain.length > 0;
        const hasRally = params.rally && params.rally.length > 0;
        const hasSingle = !!params.ally;
        const modeCount = [hasChain, hasRally, hasSingle].filter(
          Boolean,
        ).length;

        if (modeCount === 0) {
          return makeResult(
            "No quest mode specified. Use exactly one of:\n" +
              '- Single: { ally: "silly-kobold-scout", task: "..." }\n' +
              '- Rally: { rally: [{ally: "...", task: "..."}, ...] }\n' +
              '- Chain: { chain: [{ally: "...", task: "..."}, ...] }',
            { mode: "error", allies: [], error: true },
          );
        }

        if (modeCount > 1) {
          return makeResult(
            `Multiple quest modes specified (${[hasChain && "chain", hasRally && "rally", hasSingle && "single"].filter(Boolean).join(", ")}). Use exactly one mode per call.`,
            { mode: "error", allies: [], error: true },
          );
        }

        if (hasSingle && !params.task) {
          return makeResult(
            "Single quest mode requires both 'ally' and 'task' parameters.",
            { mode: "error", allies: [], error: true },
          );
        }

        if (
          hasChain &&
          !params.task &&
          params.chain!.some((s) => s.task?.includes("{task}"))
        ) {
          return makeResult(
            "Chain step uses {task} placeholder but no 'task' parameter was provided.",
            { mode: "error", allies: [], error: true },
          );
        }

        // ── Pre-flight: confirmation gate + announce ──
        const alliesApi = getAlliesAPI();
        const defNames: string[] = params.chain
          ? params.chain.map((s) => s.ally)
          : params.rally
            ? params.rally.map((s) => s.ally)
            : params.ally
              ? [params.ally]
              : [];
        // Register ally defNames for stone message tracking (populated after map is created below)

        const allyList = params.chain
          ? defNames.join(" → ")
          : defNames.join(", ");

        if (
          defNames.length > 0 &&
          needsConfirm(defNames, alliesApi.getConfirmAbove())
        ) {
          const modeLabel = params.chain
            ? "chain"
            : params.rally
              ? "rally"
              : "single";
          const choice = await ctx.ui.select(
            `Dispatch ${modeLabel}?\n${allyList}`,
            ["Yes, dispatch", "Cancel"],
          );
          if (choice === "Cancel") {
            return makeResult("Quest cancelled by user.", {
              mode: "single",
              allies: defNames,
              error: true,
            });
          }
        }

        if (alliesApi.getAnnounce() && defNames.length > 0) {
          const modeEmoji = params.chain ? "⛓️" : params.rally ? "⚔️" : "🗡️";
          ctx.ui.notify(`${modeEmoji} Dispatching ${allyList}`, "info");
        }

        const progress: ProgressFn = onUpdate
          ? (msg: string) =>
              onUpdate(makeResult(msg, { mode: "progress", allies: [] }))
          : undefined;
        const notify = (msg: string, _defName?: string) =>
          ctx.ui.notify(msg, "info");
        const onFrozen = (name: string, quietSecs: number, _defName?: string) =>
          ctx.ui.notify(
            `⚠️ ${name} may be stuck — ${quietSecs}s since last activity`,
            "warning",
          );
        const stone = getStoneAPI();

        // Track stone messages from active allies — used to suppress timer check-ins
        // when the ally is self-reporting progress via stone_send
        // Value of 0 = registered but never self-reported (won't suppress)
        const allyLastStoneMs = new Map<string, number>();
        // Register ally defNames for stone message tracking
        for (const dn of defNames) allyLastStoneMs.set(dn, 0);
        let stoneUnsub: (() => void) | undefined;
        if (stone) {
          stoneUnsub = stone.onMessage((msg) => {
            // Track messages FROM any active ally (by defName match, case-insensitive)
            const from = (msg.from ?? msg.displayName ?? "").toLowerCase();
            for (const name of allyLastStoneMs.keys()) {
              if (from.includes(name.toLowerCase())) {
                allyLastStoneMs.set(name, Date.now());
                appendAllyStoneMessage(
                  name,
                  msg.content ?? "",
                  msg.type ?? "status",
                );
                break;
              }
            }
          });
        }

        // Heartbeat pulse — sends a subtle time message to the quest room every 60s
        const HEARTBEAT_MS = 60_000;
        const heartbeatTimer = stone
          ? setInterval(() => {
              const ts = new Date().toLocaleTimeString();
              void stone
                .send({
                  from: "quest",
                  type: "status",
                  addressing: "session-room",
                  content: `⏱ ${ts}`,
                })
                .catch(() => undefined);
            }, HEARTBEAT_MS)
          : undefined;
        const cleanupHeartbeat = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        };

        // In stone mode, route check-ins and frozen alerts through the stone
        // Check-ins are suppressed when the ally has recently self-reported via stone
        // Per-ally frozen gate prevents one ally's alert from suppressing others
        const lastFrozenPerAlly = new Map<string, number>();
        const SUPPRESS_WINDOW_MS = 35_000; // unified window for check-in + frozen suppression
        const stoneNotify = (msg: string, defName?: string) => {
          // Skip regular check-in if frozen alert just fired for THIS ally
          if (
            defName &&
            Date.now() - (lastFrozenPerAlly.get(defName) ?? 0) < 2000
          )
            return;
          // Skip if ally has self-reported via stone recently (must have reported at least once — value > 0)
          if (defName) {
            const lastStone = allyLastStoneMs.get(defName) ?? 0;
            if (lastStone > 0 && Date.now() - lastStone < SUPPRESS_WINDOW_MS)
              return;
          }
          void stone
            ?.send({
              from: "quest",
              type: "progress",
              addressing: "primary-agent",
              content: msg,
            })
            .catch(() => undefined);
        };
        const stoneFrozen = (
          name: string,
          quietSecs: number,
          defName?: string,
        ) => {
          // Don't flag as stuck if ally has self-reported via stone recently (must have reported at least once)
          if (defName) {
            const lastStone = allyLastStoneMs.get(defName) ?? 0;
            if (lastStone > 0 && Date.now() - lastStone < SUPPRESS_WINDOW_MS)
              return;
          }
          if (defName) lastFrozenPerAlly.set(defName, Date.now());
          void stone
            ?.send({
              from: "quest",
              type: "status",
              addressing: "primary-agent",
              content: `⚠️ ${name} may be stuck — ${quietSecs}s since last activity and no self-report`,
            })
            .catch(() => undefined);
        };
        const safeNotify = stone
          ? stoneNotify
          : (_msg: string, _defName?: string) => {};
        const safeFrozen = stone
          ? stoneFrozen
          : (_name: string, _secs: number, _defName?: string) => {};

        // Determine mode
        if (params.chain && params.chain.length > 0) {
          const originalTask = params.task ?? "";
          if (stone) {
            progress?.(
              "\u26D3\uFE0F Chain: dispatching " +
                params.chain.length +
                " steps",
            );
            dispatchChain(
              params.chain,
              originalTask,
              ctx.cwd,
              safeNotify,
              undefined,
              params.timeoutMs,
              params.checkInIntervalMs,
              safeFrozen,
              signal,
            )
              .then((results) => {
                results.forEach(reportBreath);
                results.forEach(postResultToStone);
              })
              .catch((err: Error) => {
                if (
                  err instanceof ChainStepError &&
                  err.partialResults.length > 0
                ) {
                  const priorText = formatResults(err.partialResults, "chain");
                  const msg = `⛓️ Chain failed at step ${err.failedStepIndex + 1} (${err.failedAlly}): ${err.message}\n\n**Prior successful steps:**\n\n${priorText}`;
                  void stone
                    .send({
                      from: "quest",
                      type: "result",
                      addressing: "primary-agent",
                      content: msg,
                      metadata: { error: true },
                    })
                    .catch(() => undefined);
                } else {
                  const step =
                    err instanceof ChainStepError
                      ? `step ${err.failedStepIndex + 1} (${err.failedAlly})`
                      : "unknown step";
                  void stone
                    .send({
                      from: "quest",
                      type: "result",
                      addressing: "primary-agent",
                      content: `Chain failed at ${step}: ${err.message}`,
                      metadata: { error: true },
                    })
                    .catch(() => undefined);
                }
              })
              .finally(() => {
                stoneUnsub?.();
                cleanupHeartbeat();
              });
            return makeResult(
              `\u26D3\uFE0F Dispatched chain \u2014 ${allyList}`,
              { mode: "dispatched", allies: defNames },
            );
          }
          progress?.(`⛓️ Starting chain (${params.chain.length} steps)`);
          const results = await dispatchChain(
            params.chain,
            originalTask,
            ctx.cwd,
            notify,
            progress,
            params.timeoutMs,
            params.checkInIntervalMs,
            onFrozen,
            signal,
          );
          results.forEach(reportBreath);
          return makeResult(formatResults(results, "chain"), {
            mode: "chain",
            allies: results.map((r) => r.defName),
            displayNames: results.map((r) => r.allyName),
          });
        }

        if (params.rally && params.rally.length > 0) {
          if (stone) {
            progress?.(
              "\u2694\uFE0F Rally: dispatching " +
                params.rally.length +
                " allies",
            );
            dispatchRally(
              params.rally,
              ctx.cwd,
              safeNotify,
              undefined,
              params.timeoutMs,
              params.checkInIntervalMs,
              safeFrozen,
              signal,
            )
              .then((results) => {
                results.forEach(reportBreath);
                results.forEach(postResultToStone);
              })
              .catch(
                (err: Error) =>
                  void stone
                    .send({
                      from: "quest",
                      type: "result",
                      addressing: "primary-agent",
                      content: `Rally failed: ${err.message}`,
                      metadata: { error: true },
                    })
                    .catch(() => undefined),
              )
              .finally(() => {
                stoneUnsub?.();
                cleanupHeartbeat();
              });
            return makeResult(
              `\u2694\uFE0F Dispatched rally \u2014 ${allyList}`,
              { mode: "dispatched", allies: defNames },
            );
          }
          progress?.(`⚔️ Rally: dispatching ${params.rally.length} allies`);
          const results = await dispatchRally(
            params.rally,
            ctx.cwd,
            notify,
            progress,
            params.timeoutMs,
            params.checkInIntervalMs,
            onFrozen,
            signal,
          );
          results.forEach(reportBreath);
          return makeResult(formatResults(results, "rally"), {
            mode: "rally",
            allies: results.map((r) => r.defName),
            displayNames: results.map((r) => r.allyName),
          });
        }

        if (params.ally && params.task) {
          if (stone) {
            dispatchSingle({
              ally: params.ally,
              task: params.task,
              cwd: ctx.cwd,
              notify: safeNotify,
              timeoutMs: params.timeoutMs,
              checkInIntervalMs: params.checkInIntervalMs,
              onFrozen: safeFrozen,
              signal,
            })
              .then((r) => {
                reportBreath(r);
                postResultToStone(r);
              })
              .catch(
                (err: Error) =>
                  void stone
                    .send({
                      from: "quest",
                      type: "result",
                      addressing: "primary-agent",
                      content: `Quest failed: ${err.message}`,
                      metadata: { error: true },
                    })
                    .catch(() => undefined),
              )
              .finally(() => {
                stoneUnsub?.();
                cleanupHeartbeat();
              });
            return makeResult(
              `\u{1F5E1}\uFE0F Dispatched \u2014 ${params.ally}`,
              { mode: "dispatched", allies: defNames },
            );
          }
          const result = await dispatchSingle({
            ally: params.ally,
            task: params.task,
            cwd: ctx.cwd,
            notify,
            progress,
            timeoutMs: params.timeoutMs,
            checkInIntervalMs: params.checkInIntervalMs,
            onFrozen,
            signal,
          });
          reportBreath(result);
          return makeResult(formatSingleResult(result), {
            mode: "single",
            allies: [result.defName],
            displayNames: [result.allyName],
          });
        }

        return makeResult(
          `Invalid quest parameters. Use one of:\n- Single: { ally: "silly-kobold-scout", task: "..." }\n- Rally: { rally: [{ally: "...", task: "..."}, ...] }\n- Chain: { chain: [{ally: "...", task: "..."}, ...] }`,
          { mode: "error", allies: [], error: true },
        );
      } catch (err) {
        if (err instanceof ChainStepError) {
          const stepLabel = `step ${err.failedStepIndex + 1} (${err.failedAlly})`;
          if (err.partialResults.length > 0) {
            const priorText = formatResults(err.partialResults, "chain");
            const msg = `⛓️ Chain failed at ${stepLabel}: ${err.message}\n\n**Prior successful steps:**\n\n${priorText}`;
            return makeResult(msg, {
              mode: "chain",
              allies: err.partialResults.map((r) => r.defName),
              error: true,
              displayNames: err.partialResults.map((r) => r.allyName),
            });
          }
          return makeResult(`⛓️ Chain failed at ${stepLabel}: ${err.message}`, {
            mode: "error",
            allies: [],
            error: true,
          });
        }
        return makeResult(
          `Quest failed: ${(err as Error).message ?? String(err)}`,
          { mode: "error", allies: [], error: true },
        );
      }
    },
  });

  // Register ally_status diagnostic tool (separate module)
  registerAllyStatusTool(pi);
}
