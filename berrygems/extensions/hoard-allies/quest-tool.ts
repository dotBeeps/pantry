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
import type {
	AllyCombo,
	AllyInfo,
	AlliesState,
	Noun,
	Job,
	QuestResult,
} from "./types.ts";

// ── Re-imports from index.ts (shared taxonomy state) ──
// These are accessed via globalThis since extensions share that namespace

const ALLIES_STATE_KEY = Symbol.for("hoard.allies.state");

function getState(): AlliesState {
	return (globalThis as Record<symbol, AlliesState>)[ALLIES_STATE_KEY]!;
}

// ── Taxonomy Constants (duplicated from index for module isolation) ──

const CURATED_COMBOS: AllyCombo[] = [
	{ adjective: "silly", noun: "kobold", job: "scout" },
	{ adjective: "clever", noun: "kobold", job: "scout" },
	{ adjective: "clever", noun: "kobold", job: "reviewer" },
	{ adjective: "wise", noun: "kobold", job: "reviewer" },
	{ adjective: "silly", noun: "griffin", job: "coder" },
	{ adjective: "clever", noun: "griffin", job: "coder" },
	{ adjective: "clever", noun: "griffin", job: "reviewer" },
	{ adjective: "wise", noun: "griffin", job: "reviewer" },
	{ adjective: "wise", noun: "griffin", job: "researcher" },
	{ adjective: "elder", noun: "griffin", job: "coder" },
	{ adjective: "elder", noun: "griffin", job: "reviewer" },
	{ adjective: "wise", noun: "dragon", job: "planner" },
	{ adjective: "elder", noun: "dragon", job: "planner" },
];

const CURATED_NAMES = new Set(CURATED_COMBOS.map(comboName));

// ── Import shared functions from index via globalThis ──

const ALLIES_API_KEY = Symbol.for("hoard.allies.api");

interface AlliesAPI {
	calcCost(combo: AllyCombo): number;
	getModels(): Record<string, string[]>;
	getThinking(): Record<string, string>;
	popName(noun: Noun): string;
	buildAllyPrompt(combo: AllyCombo, allyName: string | null): string;
	budgetRemaining(): number;
	recordSpawn(id: string, info: AllyInfo): void;
	recordComplete(id: string): AllyInfo | undefined;
	recordFailed(id: string): AllyInfo | undefined;
}

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
});

type QuestParamsType = Static<typeof QuestParams>;

// ── Helpers ──

function comboName(combo: AllyCombo): string {
	return `${combo.adjective}-${combo.noun}-${combo.job}`;
}

function parseComboName(name: string): AllyCombo | null {
	const parts = name.split("-");
	if (parts.length !== 3) return null;
	const [adjective, noun, job] = parts as [string, string, string];
	if (!["silly", "clever", "wise", "elder"].includes(adjective)) return null;
	if (!["kobold", "griffin", "dragon"].includes(noun)) return null;
	if (!["scout", "reviewer", "coder", "researcher", "planner"].includes(job)) return null;
	return { adjective, noun, job } as AllyCombo;
}

const JOB_TOOLS: Record<Job, string> = {
	scout: "read,grep,find,ls,bash",
	reviewer: "read,grep,find,ls,bash",
	coder: "read,grep,find,ls,bash,write,edit",
	researcher: "read,grep,find,ls,bash",
	planner: "read,grep,find,ls",
};

const MAX_SUBAGENT_DEPTH: Record<Noun, number> = { kobold: 0, griffin: 1, dragon: 2 };

function makeId(defName: string): string {
	return `${defName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

type ProgressFn = ((msg: string) => void) | undefined;

// ── Single Quest Dispatch ──

async function dispatchSingle(
	ally: string,
	task: string,
	cwd: string,
	progress?: ProgressFn,
): Promise<QuestResult> {
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

		const result = await spawnPi({
			piPath,
			cwd,
			model,
			tools: JOB_TOOLS[combo.job],
			systemPrompt,
			task,
			thinking: thinking[combo.adjective],
			maxSubagentDepth: MAX_SUBAGENT_DEPTH[combo.noun],
		});

		if (result.success) {
			api.recordComplete(id);
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
	throw new Error(`Quest failed for ${allyName} the ${ally}. Last error: ${lastError}`);
}

// ── Parallel Rally ──

async function dispatchRally(
	quests: Array<{ ally: string; task: string }>,
	cwd: string,
	progress?: ProgressFn,
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
			chunk.map((q) => dispatchSingle(q.ally, q.task, cwd, progress))
		);

		for (const r of chunkResults) {
			if (r.status === "fulfilled") {
				results.push(r.value);
			} else {
				// Include error as a failed result
				results.push({
					allyName: "unknown",
					defName: "unknown",
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

// ── Chain Dispatch ──

async function dispatchChain(
	steps: Array<{ ally: string; task?: string }>,
	originalTask: string,
	cwd: string,
	progress?: ProgressFn,
): Promise<QuestResult[]> {
	const results: QuestResult[] = [];
	let previous = "";

	for (const step of steps) {
		// Template replacement
		let task = step.task ?? "{task}";
		task = task.replace(/\{previous\}/g, previous);
		task = task.replace(/\{task\}/g, originalTask);

		try {
			const result = await dispatchSingle(step.ally, task, cwd, progress);
			results.push(result);
			previous = result.response;
		} catch (err) {
			results.push({
				allyName: "unknown",
				defName: step.ally,
				cost: 0,
				model: "none",
				response: `Chain step failed: ${(err as Error).message}`,
				cascadeAttempts: 0,
			});
			break; // Chain stops on failure
		}
	}

	return results;
}

// ── Result Helpers ──

interface QuestDetails {
	mode: string;
	allies: string[];
	totalCost: number;
	error?: boolean;
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

Modes:
- Single: { ally, task } — one quest
- Rally: { rally: [{ally, task}, ...] } — parallel quests
- Chain: { chain: [{ally, task?}, ...] } — sequential, {previous} carries output`,
		parameters: QuestParams,
		execute: async (_toolCallId: string, params: QuestParamsType, _signal: AbortSignal | undefined, onUpdate: ((result: { content: { type: "text"; text: string }[]; details: QuestDetails }) => void) | undefined, ctx: ExtensionContext) => {
			const progress: ProgressFn = onUpdate
				? (msg: string) => onUpdate(makeResult(msg, { mode: "progress", allies: [], totalCost: 0 }))
				: undefined;

			try {
				// Determine mode
				if (params.chain && params.chain.length > 0) {
					const originalTask = params.task ?? "";
					progress?.(`⛓️ Starting chain (${params.chain.length} steps)`);
					const results = await dispatchChain(params.chain, originalTask, ctx.cwd, progress);
					return makeResult(
						formatResults(results, "chain"),
						{ mode: "chain", allies: results.map((r) => r.defName), totalCost: results.reduce((s, r) => s + r.cost, 0) },
					);
				}

				if (params.rally && params.rally.length > 0) {
					progress?.(`⚔️ Rally: dispatching ${params.rally.length} allies`);
					const results = await dispatchRally(params.rally, ctx.cwd, progress);
					return makeResult(
						formatResults(results, "rally"),
						{ mode: "rally", allies: results.map((r) => r.defName), totalCost: results.reduce((s, r) => s + r.cost, 0) },
					);
				}

				if (params.ally && params.task) {
					const result = await dispatchSingle(params.ally, params.task, ctx.cwd, progress);
					return makeResult(
						formatSingleResult(result),
						{ mode: "single", allies: [result.defName], totalCost: result.cost },
					);
				}

				return makeResult(
					`Invalid quest parameters. Use one of:\n- Single: { ally: "silly-kobold-scout", task: "..." }\n- Rally: { rally: [{ally: "...", task: "..."}, ...] }\n- Chain: { chain: [{ally: "...", task: "..."}, ...] }`,
					{ mode: "error", allies: [], totalCost: 0, error: true },
				);
			} catch (err) {
				return makeResult(
					`Quest failed: ${(err as Error).message}`,
					{ mode: "error", allies: [], totalCost: 0, error: true },
				);
			}
		},
	});
}
