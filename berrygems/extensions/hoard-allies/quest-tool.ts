/**
 * quest-tool.ts — The quest dispatch tool for hoard-allies.
 *
 * Replaces pi's built-in subagent tool with taxonomy-aware dispatch.
 * Supports single quests, parallel rallies, and sequential chains.
 * FrugalGPT-style model cascading within each noun tier.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readHoardSetting } from "../../lib/settings.ts";
import { spawnPi, findPiBinary } from "./spawn.ts";
import { availableModels, isRetryable, recordProviderFailure } from "./cascade.ts";
import { registerAlly, appendAllyLine, deregisterAlly, registerAllyStatusTool } from "./ally-status-tool.ts";
import type {
	AlliesState,
	AlliesAPI,
	QuestResult,
} from "./types.ts";
import {
	type AllyCombo, type Noun,
	CURATED_NAMES, parseComboName,
	JOB_TOOLS,
} from "../../lib/ally-taxonomy.ts";
import { generateShortId } from "../../lib/id.ts";
import { Text, truncateToWidth } from "@mariozechner/pi-tui";

// ── Sending Stone API ──
const STONE_KEY = Symbol.for("hoard.stone");
function getStoneAPI(): { send(msg: { from: string; displayName?: string; type: string; addressing: string; content: string; color?: string; metadata?: unknown }): Promise<void>; port(): number | null } | undefined {
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
	ally: Type.String({ description: "Ally to dispatch (e.g., silly-kobold-scout, clever-griffin-coder)" }),
	task: Type.String({ description: "The quest to send the ally on" }),
});

const ChainStep = Type.Object({
	ally: Type.String({ description: "Ally for this chain step" }),
	task: Type.Optional(Type.String({ description: "Task template. Use {previous} for previous step's output, {task} for original task." })),
});

const QuestParams = Type.Object({
	// Single quest
	ally: Type.Optional(Type.String({ description: "Ally to dispatch (e.g., silly-kobold-scout)" })),
	task: Type.Optional(Type.String({ description: "The quest to send the ally on" })),

	// Parallel quests (rally)
	rally: Type.Optional(Type.Array(QuestItem, { description: "Multiple quests to run in parallel" })),

	// Chain quests (sequential)
	chain: Type.Optional(Type.Array(ChainStep, { description: "Sequential quests. {previous} carries output forward, {task} is the original task." })),

	// Optional timeout in milliseconds (default: no timeout)
	timeoutMs: Type.Optional(Type.Number({ description: "Per-ally timeout in milliseconds. Allies that exceed this are killed and reported as timed out. Recommended: 300000 (5 minutes)." })),

	// Optional check-in interval in milliseconds (default: no check-ins)
	checkInIntervalMs: Type.Optional(Type.Number({ description: "How often (ms) to poll each ally for a status heartbeat while they work. Recommended: 30000 (30 seconds)." })),
});

type QuestParamsType = Static<typeof QuestParams>;

// ── Helpers ──

// comboName and parseComboName imported from lib/ally-taxonomy

// JOB_TOOLS imported from lib/ally-taxonomy

const MAX_SUBAGENT_DEPTH: Record<Noun, number> = { kobold: 0, griffin: 1, dragon: 2 };

function makeId(defName: string): string {
	return `${defName}-${Date.now()}-${generateShortId()}`;
}

type ProgressFn = ((msg: string) => void) | undefined;

// ── Estimation Helpers ──
// Parse a defName like "silly-kobold-scout" into an AllyCombo (uses shared parseComboName for validation)
function parseComboFromDefName(defName: string): AllyCombo | null {
	return parseComboName(defName);
}

// Estimate total cost for a list of defNames
function estimateCost(defNames: string[]): number {
	const api = getAlliesAPI();
	return defNames.reduce((sum, name) => {
		const combo = parseComboFromDefName(name);
		return combo ? sum + api.calcCost(combo) : sum;
	}, 0);
}

// Return true if any of the defNames meets or exceeds the confirmAbove tier threshold
function needsConfirm(defNames: string[], threshold: string): boolean {
	const tierOrder: Record<string, number> = { kobold: 0, griffin: 1, dragon: 2 };
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
	notify: (msg: string) => void;
	progress?: ProgressFn;
	timeoutMs?: number;
	checkInIntervalMs?: number;
	onFrozen?: (allyName: string, quietSecs: number) => void;
	signal?: AbortSignal;
}

async function dispatchSingle(opts: DispatchOptions): Promise<QuestResult> {
	const { ally, task, cwd, notify, progress, timeoutMs, checkInIntervalMs, onFrozen, signal } = opts;
	const combo = parseComboName(ally);
	if (!combo) {
		throw new Error(`Unknown ally: "${ally}". Available: ${[...CURATED_NAMES].join(", ")}`);
	}

	const api = getAlliesAPI();
	const state = getState();
	const cost = api.calcCost(combo);
	const remaining = api.budgetRemaining();

	// Budget check
	if (cost > remaining) {
		throw new Error(
			`Budget exceeded. ${ally} costs ${cost.toFixed(1)} pts but only ${remaining.toFixed(1)} pts remain. Choose a cheaper ally.`
		);
	}

	// Pop name and reserve budget
	const allyName = api.popName(combo.noun);
	const id = makeId(ally);
	api.recordSpawn(id, {
		name: allyName,
		defName: ally,
		combo,
		cost,
		spawnedAt: Date.now(),
		status: "running",
	});

	progress?.(`⚔️ ${allyName} the ${ally} dispatched (${cost.toFixed(1)} pts)`);

	// Build system prompt with name baked in
	const systemPrompt = api.buildAllyPrompt(combo, allyName);

	// Get model fallback chain
	const models = api.getModels();
	const thinking = api.getThinking();
	const modelChain = models[combo.noun] ?? [`github-copilot/claude-haiku-4.5`];
	const available = availableModels(state, modelChain);

	if (available.length === 0) {
		api.recordFailed(id);
		throw new Error(`All models for ${combo.noun} tier are on cooldown. Wait and retry.`);
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
		const effectiveTimeoutMs = timeoutMs ?? getAlliesAPI().getJobDefaults(combo.job).timeoutMs;
		const effectiveCheckInMs = checkInIntervalMs ?? getAlliesAPI().getJobDefaults(combo.job).checkInIntervalMs;
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
			timeoutMs: effectiveTimeoutMs,
			checkInIntervalMs: effectiveCheckInMs,
			signal,
			onStderrLine: (line) => appendAllyLine(spawnId, line),
			onCheckIn: (defName: string, elapsedMs: number, sinceActivityMs: number, recentLine: string) => {
				const secs = Math.round(elapsedMs / 1000);
				const quietSecs = Math.round(sinceActivityMs / 1000);
				const activityStr = recentLine
					? `\n   └ ${recentLine.slice(0, 120)}`
					: " · no output yet";
				const frozen = effectiveCheckInMs > 0 && sinceActivityMs > effectiveCheckInMs * 2;
				if (frozen) onFrozen?.(allyName, quietSecs);
				const msg = `⏳ ${allyName} the ${defName} — ${secs}s elapsed${frozen ? ` (⚠️ quiet ${quietSecs}s)` : ""}${activityStr}`;
				progress?.(msg); // update tool box if streaming is available
				notify(msg);    // always surface via notify regardless
			},
		}).finally(() => deregisterAlly(spawnId));

		if (result.success) {
			api.recordComplete(id);
			api.persistBudget?.();
			progress?.(`✅ ${allyName} returned (${cost.toFixed(1)} pts, ${usedModel})`);
			return {
				allyName,
				defName: ally,
				cost,
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
	api.persistBudget?.();
	throw new Error(`Quest failed for ${allyName} the ${ally}. Last error: ${lastError}`);
}

// ── Parallel Rally ──

async function dispatchRally(
	quests: Array<{ ally: string; task: string }>,
	cwd: string,
	notify: (msg: string) => void,
	progress?: ProgressFn,
	timeoutMs?: number,
	checkInIntervalMs?: number,
	onFrozen?: (allyName: string, quietSecs: number) => void,
	signal?: AbortSignal,
): Promise<QuestResult[]> {
	const api = getAlliesAPI();

	// Pre-validate all combos and check total budget
	let totalCost = 0;
	for (const q of quests) {
		const combo = parseComboName(q.ally);
		if (!combo) throw new Error(`Unknown ally: "${q.ally}"`);
		totalCost += api.calcCost(combo);
	}

	const remaining = api.budgetRemaining();
	if (totalCost > remaining) {
		throw new Error(
			`Rally budget exceeded. Total cost: ${totalCost.toFixed(1)} pts but only ${remaining.toFixed(1)} pts remain. Reduce the rally or use cheaper allies.`
		);
	}

	// Dispatch all in parallel
	const maxParallel = readHoardSetting<number>("allies.maxParallel", 4);
	const results: QuestResult[] = [];

	// Respect max parallel with chunking
	for (let i = 0; i < quests.length; i += maxParallel) {
		const chunk = quests.slice(i, i + maxParallel);
		const chunkResults = await Promise.allSettled(
			chunk.map((q) => dispatchSingle({ ally: q.ally, task: q.task, cwd, notify, progress, timeoutMs, checkInIntervalMs, onFrozen, signal }))
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
					cost: 0,
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
	notify: (msg: string) => void,
	progress?: ProgressFn,
	timeoutMs?: number,
	checkInIntervalMs?: number,
	onFrozen?: (allyName: string, quietSecs: number) => void,
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
			const result = await dispatchSingle({ ally: step.ally, task, cwd, notify, progress, timeoutMs, checkInIntervalMs, onFrozen, signal });
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
	totalCost: number;
	error?: boolean;
	displayNames?: string[];
}

function makeResult(text: string, details: QuestDetails) {
	return { content: [{ type: "text" as const, text }], details };
}

function formatSingleResult(result: QuestResult): string {
	const header = `**${result.allyName}** the ${result.defName} (${result.cost.toFixed(1)} pts, ${result.model})`;
	const cascade = result.cascadeAttempts > 1 ? ` [cascaded: ${result.cascadeAttempts} attempts]` : "";
	const usage = result.usage
		? `\n*Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out${result.usage.cacheReadTokens ? ` / ${result.usage.cacheReadTokens} cache` : ""}*`
		: "";

	return `${header}${cascade}${usage}\n\n${result.response}`;
}

function formatResults(results: QuestResult[], mode: string): string {
	if (results.length === 1) {
		return formatSingleResult(results[0]!);
	}

	const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
	const api = getAlliesAPI();
	const remaining = api.budgetRemaining();

	const sections = results.map((r, i) =>
		`### ${mode === "chain" ? `Step ${i + 1}` : `Quest ${i + 1}`}: ${r.allyName} (${r.defName})\n\n${r.response}`
	).join("\n\n---\n\n");

	return `*${mode === "chain" ? "Chain" : "Rally"}: ${results.length} quests, ${totalCost.toFixed(1)} pts spent, ${remaining.toFixed(1)} pts remaining*\n\n${sections}`;
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
	void stone.send({
		from: result.defName,
		displayName: result.allyName ?? formatDefName(result.defName),
		type: "result",
		addressing: "primary-agent",
		content: formatSingleResult(result),
		metadata: { allyName: result.allyName, defName: result.defName, cost: result.cost },
	}).catch(() => undefined);
}

// ── Tool Registration ──

export function registerQuestTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "quest",
		label: "Quest",
		description: `Send allies on quests. Taxonomy: <adjective>-<noun>-<job>.
Adjective (thinking): silly (none) | clever (low) | wise (medium) | elder (high)
Noun (model): kobold ($) | griffin ($$$) | dragon ($$$$$)
Job: scout | reviewer | coder | researcher | planner

Available allies: ${[...CURATED_NAMES].join(", ")}

Modes (use exactly one):
- Single: { ally, task } — one quest
- Rally: { rally: [{ally, task}, ...] } — parallel quests
- Chain: { chain: [{ally, task?}, ...] } — sequential, {previous} carries output

If the sending stone is active, quests dispatch asynchronously and results arrive via stone_send.`,
		parameters: QuestParams,
		renderCall(args, theme, _context) {
			const params = args as QuestParamsType;
			const title = theme.fg("toolTitle", theme.bold("quest "));

			if (params.chain && params.chain.length > 0) {
				const allies = params.chain.map((s) => s.ally ?? "?").join(" → ");
				const cost = estimateCost(params.chain.map((s) => s.ally ?? ""));
				const costStr = cost > 0 ? theme.fg("muted", ` · est. ${cost.toFixed(1)} pts`) : "";
				const taskPreview = params.task
					? "\n   " + theme.fg("dim", `↳ "${truncateToWidth(params.task, 60)}"`)
					: "";
				return new Text(
					title +
					theme.fg("muted", `[chain ${params.chain.length}] `) +
					theme.fg("dim", allies) +
					costStr +
					taskPreview,
					0, 0,
				);
			}

			if (params.rally && params.rally.length > 0) {
				const allies = params.rally.map((s) => s.ally).join(", ");
				const cost = estimateCost(params.rally.map((s) => s.ally));
				const costStr = cost > 0 ? theme.fg("muted", ` · est. ${cost.toFixed(1)} pts`) : "";
				return new Text(
					title +
					theme.fg("muted", `[rally ${params.rally.length}] `) +
					theme.fg("dim", truncateToWidth(allies, 80)) +
					costStr,
					0, 0,
				);
			}

			if (params.ally) {
				const combo = parseComboFromDefName(params.ally);
				const api = getAlliesAPI();
				const cost = combo ? api.calcCost(combo) : 0;
				const costStr = cost > 0 ? theme.fg("muted", ` · est. ${cost.toFixed(1)} pts`) : "";
				const taskPreview = params.task
					? "\n   " + theme.fg("dim", `↳ "${truncateToWidth(params.task, 60)}"`)
					: "";
				return new Text(
					title +
					theme.fg("muted", "[single] ") +
					theme.fg("accent", params.ally) +
					costStr +
					taskPreview,
					0, 0,
				);
			}

			return new Text(title + theme.fg("warning", "invalid params"), 0, 0);
		},
		renderResult(result, options, theme, _context) {
			const d = result.details as QuestDetails | undefined;

			// Fallback: no details
			if (!d) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			// Error
			if (d.error) {
				const first = result.content[0];
				const msg = first?.type === "text" ? truncateToWidth(first.text, 60) : "unknown error";
				return new Text(
					theme.fg("error", "✗ quest failed") + "\n   " + theme.fg("muted", msg),
					0, 0,
				);
			}

			// Progress update — style visibly so it actually shows up
			if (options.isPartial || d.mode === "progress") {
				const first = result.content[0];
				const msg = first?.type === "text" ? first.text : "dispatching…";
				return new Text(
					theme.fg("accent", "⏳ ") + theme.fg("text", msg),
					0, 0,
				);
			}

			// Final results
			const costStr = theme.fg("muted", ` · ${d.totalCost.toFixed(1)} pts`);
			const complete = "\n   " + theme.fg("success", "✓ complete");

			if (d.mode === "single") {
				const displayName = d.displayNames?.[0];
				const defFormatted = formatDefName(d.allies[0] ?? "ally");
				const label = displayName
					? theme.fg("accent", displayName) + theme.fg("dim", ` the ${defFormatted}`)
					: theme.fg("accent", defFormatted);
				return new Text("🗡️ " + label + costStr + complete, 0, 0);
			}

			if (d.mode === "rally") {
				const names = (d.displayNames ?? d.allies.map(formatDefName)).slice(0, 3);
				const overflow = (d.displayNames ?? d.allies).length > 3
					? ` +${(d.displayNames ?? d.allies).length - 3}`
					: "";
				return new Text(
					"⚔️ " + theme.fg("accent", `rally ${d.allies.length}`) + costStr +
					"\n   " + theme.fg("dim", names.join(", ") + overflow) +
					complete,
					0, 0,
				);
			}

			if (d.mode === "chain") {
				const names = (d.displayNames ?? d.allies.map(formatDefName)).join(" → ");
				return new Text(
					"⛓️ " + theme.fg("accent", `chain ${d.allies.length}`) + costStr +
					"\n   " + theme.fg("dim", truncateToWidth(names, 70)) +
					complete,
					0, 0,
				);
			}

			if (d.mode === "dispatched") {
				const names = (d.displayNames ?? d.allies.map(formatDefName)).join(", ");
				return new Text(
					"\u26A1 " + theme.fg("accent", "dispatched") + theme.fg("muted", ` \u00b7 est. ${d.totalCost.toFixed(1)} pts`) +
					"\n   " + theme.fg("dim", truncateToWidth(names || d.allies.join(", "), 70)) +
					"\n   " + theme.fg("muted", "results incoming via stone"),
					0, 0,
				);
			}

				// Fallback
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
		},
		execute: async (_toolCallId: string, params: QuestParamsType, signal: AbortSignal | undefined, onUpdate: ((result: { content: { type: "text"; text: string }[]; details: QuestDetails }) => void) | undefined, ctx: ExtensionContext) => {
			try {
			// ── Mode validation ──
			const hasChain = params.chain && params.chain.length > 0;
			const hasRally = params.rally && params.rally.length > 0;
			const hasSingle = !!params.ally;
			const modeCount = [hasChain, hasRally, hasSingle].filter(Boolean).length;

			if (modeCount === 0) {
				return makeResult(
					"No quest mode specified. Use exactly one of:\n" +
					"- Single: { ally: \"silly-kobold-scout\", task: \"...\" }\n" +
					"- Rally: { rally: [{ally: \"...\", task: \"...\"}, ...] }\n" +
					"- Chain: { chain: [{ally: \"...\", task: \"...\"}, ...] }",
					{ mode: "error", allies: [], totalCost: 0, error: true },
				);
			}

			if (modeCount > 1) {
				return makeResult(
					`Multiple quest modes specified (${[hasChain && "chain", hasRally && "rally", hasSingle && "single"].filter(Boolean).join(", ")}). Use exactly one mode per call.`,
					{ mode: "error", allies: [], totalCost: 0, error: true },
				);
			}

			if (hasSingle && !params.task) {
				return makeResult(
					"Single quest mode requires both 'ally' and 'task' parameters.",
					{ mode: "error", allies: [], totalCost: 0, error: true },
				);
			}

			if (hasChain && !params.task && params.chain!.some((s) => s.task?.includes("{task}"))) {
				return makeResult(
					"Chain step uses {task} placeholder but no 'task' parameter was provided.",
					{ mode: "error", allies: [], totalCost: 0, error: true },
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
			const estCost = estimateCost(defNames);
			const allyList = params.chain
				? defNames.join(" → ")
				: defNames.join(", ");

			if (defNames.length > 0 && needsConfirm(defNames, alliesApi.getConfirmAbove())) {
				const modeLabel = params.chain ? "chain" : params.rally ? "rally" : "single";
				const choice = await ctx.ui.select(
					`Dispatch ${modeLabel}?\n${allyList}\nest. ${estCost.toFixed(1)} pts`,
					["Yes, dispatch", "Cancel"],
				);
				if (choice === "Cancel") {
					return makeResult("Quest cancelled by user.", { mode: "single", allies: defNames, totalCost: 0, error: true });
				}
			}

			if (alliesApi.getAnnounce() && defNames.length > 0) {
				const modeEmoji = params.chain ? "⛓️" : params.rally ? "⚔️" : "🗡️";
				ctx.ui.notify(
					`${modeEmoji} Dispatching ${allyList} · est. ${estCost.toFixed(1)} pts`,
					"info",
				);
			}

			const progress: ProgressFn = onUpdate
				? (msg: string) => onUpdate(makeResult(msg, { mode: "progress", allies: [], totalCost: 0 }))
				: undefined;
			const notify = (msg: string) => ctx.ui.notify(msg, "info");
			const onFrozen = (name: string, quietSecs: number) =>
				ctx.ui.notify(`⚠️ ${name} may be stuck — ${quietSecs}s since last activity`, "warning");
			const stone = getStoneAPI();
			// In stone mode, route check-ins and frozen alerts through the stone instead of no-ops
			let lastFrozenMs = 0;
			const stoneNotify = (msg: string) => {
				// Skip regular check-in if frozen alert just fired (they overlap at the same interval)
				if (Date.now() - lastFrozenMs < 2000) return;
				void stone?.send({ from: "quest", type: "progress", addressing: "primary-agent", content: msg }).catch(() => undefined);
			};
			const stoneFrozen = (name: string, quietSecs: number) => {
				lastFrozenMs = Date.now();
				void stone?.send({ from: "quest", type: "status", addressing: "primary-agent", content: `⚠️ ${name} may be stuck — ${quietSecs}s since last activity` }).catch(() => undefined);
			};
			const safeNotify = stone ? stoneNotify : (_msg: string) => {};
			const safeFrozen = stone ? stoneFrozen : (_name: string, _secs: number) => {};

			// Determine mode
				if (params.chain && params.chain.length > 0) {
					const originalTask = params.task ?? "";
					if (stone) {
						progress?.("\u26D3\uFE0F Chain: dispatching " + params.chain.length + " steps");
						dispatchChain(params.chain, originalTask, ctx.cwd, safeNotify, undefined, params.timeoutMs, params.checkInIntervalMs, safeFrozen, signal)
							.then((results) => { results.forEach(reportBreath); results.forEach(postResultToStone); })
							.catch((err: Error) => {
							if (err instanceof ChainStepError && err.partialResults.length > 0) {
								const priorText = formatResults(err.partialResults, "chain");
								const msg = `⛓️ Chain failed at step ${err.failedStepIndex + 1} (${err.failedAlly}): ${err.message}\n\n**Prior successful steps:**\n\n${priorText}`;
								void stone.send({ from: "quest", type: "result", addressing: "primary-agent", content: msg, metadata: { error: true } }).catch(() => undefined);
							} else {
								const step = err instanceof ChainStepError ? `step ${err.failedStepIndex + 1} (${err.failedAlly})` : "unknown step";
								void stone.send({ from: "quest", type: "result", addressing: "primary-agent", content: `Chain failed at ${step}: ${err.message}`, metadata: { error: true } }).catch(() => undefined);
							}
						});
						return makeResult(`\u26D3\uFE0F Dispatched chain \u2014 ${allyList} \u00b7 est. ${estCost.toFixed(1)} pts`, { mode: "dispatched", allies: defNames, totalCost: estCost });
					}
					progress?.(`⛓️ Starting chain (${params.chain.length} steps)`);
					const results = await dispatchChain(params.chain, originalTask, ctx.cwd, notify, progress, params.timeoutMs, params.checkInIntervalMs, onFrozen, signal);
					results.forEach(reportBreath);
					return makeResult(
						formatResults(results, "chain"),
						{ mode: "chain", allies: results.map((r) => r.defName), totalCost: results.reduce((s, r) => s + r.cost, 0), displayNames: results.map((r) => r.allyName) },
					);
				}

				if (params.rally && params.rally.length > 0) {
					if (stone) {
						progress?.("\u2694\uFE0F Rally: dispatching " + params.rally.length + " allies");
						dispatchRally(params.rally, ctx.cwd, safeNotify, undefined, params.timeoutMs, params.checkInIntervalMs, safeFrozen, signal)
							.then((results) => { results.forEach(reportBreath); results.forEach(postResultToStone); })
							.catch((err: Error) => void stone.send({ from: "quest", type: "result", addressing: "primary-agent", content: `Rally failed: ${err.message}`, metadata: { error: true } }).catch(() => undefined));
						return makeResult(`\u2694\uFE0F Dispatched rally \u2014 ${allyList} \u00b7 est. ${estCost.toFixed(1)} pts`, { mode: "dispatched", allies: defNames, totalCost: estCost });
					}
					progress?.(`⚔️ Rally: dispatching ${params.rally.length} allies`);
					const results = await dispatchRally(params.rally, ctx.cwd, notify, progress, params.timeoutMs, params.checkInIntervalMs, onFrozen, signal);
					results.forEach(reportBreath);
					return makeResult(
						formatResults(results, "rally"),
						{ mode: "rally", allies: results.map((r) => r.defName), totalCost: results.reduce((s, r) => s + r.cost, 0), displayNames: results.map((r) => r.allyName) },
					);
				}

				if (params.ally && params.task) {
					if (stone) {
						dispatchSingle({ ally: params.ally, task: params.task, cwd: ctx.cwd, notify: safeNotify, timeoutMs: params.timeoutMs, checkInIntervalMs: params.checkInIntervalMs, onFrozen: safeFrozen, signal })
							.then((r) => { reportBreath(r); postResultToStone(r); })
							.catch((err: Error) => void stone.send({ from: "quest", type: "result", addressing: "primary-agent", content: `Quest failed: ${err.message}`, metadata: { error: true } }).catch(() => undefined));
						return makeResult(`\u{1F5E1}\uFE0F Dispatched \u2014 ${params.ally} \u00b7 est. ${estCost.toFixed(1)} pts`, { mode: "dispatched", allies: defNames, totalCost: estCost });
					}
					const result = await dispatchSingle({ ally: params.ally, task: params.task, cwd: ctx.cwd, notify, progress, timeoutMs: params.timeoutMs, checkInIntervalMs: params.checkInIntervalMs, onFrozen, signal });
					reportBreath(result);
					return makeResult(
						formatSingleResult(result),
						{ mode: "single", allies: [result.defName], totalCost: result.cost, displayNames: [result.allyName] },
					);
				}

				return makeResult(
					`Invalid quest parameters. Use one of:\n- Single: { ally: "silly-kobold-scout", task: "..." }\n- Rally: { rally: [{ally: "...", task: "..."}, ...] }\n- Chain: { chain: [{ally: "...", task: "..."}, ...] }`,
					{ mode: "error", allies: [], totalCost: 0, error: true },
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
							totalCost: err.partialResults.reduce((s, r) => s + r.cost, 0),
							error: true,
							displayNames: err.partialResults.map((r) => r.allyName),
						});
					}
					return makeResult(`⛓️ Chain failed at ${stepLabel}: ${err.message}`, { mode: "error", allies: [], totalCost: 0, error: true });
				}
				return makeResult(
					`Quest failed: ${(err as Error).message ?? String(err)}`,
					{ mode: "error", allies: [], totalCost: 0, error: true },
				);
			}
		},
	});

	// Register ally_status diagnostic tool (separate module)
	registerAllyStatusTool(pi);
}
