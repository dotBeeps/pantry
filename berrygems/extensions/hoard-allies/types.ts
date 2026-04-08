/**
 * types.ts — Shared types for hoard-allies.
 *
 * Taxonomy types (Adjective, Noun, Job, AllyCombo) are canonical in lib/ally-taxonomy.ts.
 * Re-exported here for backward compatibility within the extension.
 */

export type { Adjective, Noun, Job, AllyCombo } from "../../lib/ally-taxonomy.ts";
import type { AllyCombo, Noun } from "../../lib/ally-taxonomy.ts";

/** Persistent budget state stored in the session tree. */
export interface BudgetState {
	totalSpent: number;
	questCount: number;
	history: Array<{ ally: string; cost: number; status: "completed" | "failed"; ts: number }>;
}

/** Public API surface exposed via globalThis[Symbol.for("hoard.allies")]. */
export interface AlliesAPI {
	calcCost(combo: AllyCombo): number;
	getModels(): Record<string, string[]>;
	getThinking(): Record<string, string>;
	popName(noun: Noun): string;
	buildAllyPrompt(combo: AllyCombo, allyName: string | null): string;
	budgetRemaining(): number;
	recordSpawn(id: string, info: AllyInfo): void;
	recordComplete(id: string): AllyInfo | undefined;
	recordFailed(id: string): AllyInfo | undefined;
	persistBudget?(): void;
	getAnnounce(): boolean;
	getConfirmAbove(): string;
	getJobDefaults(job: string): { timeoutMs: number; checkInIntervalMs: number };
}

export interface AllyInfo {
	name: string;
	defName: string;
	combo: AllyCombo;
	cost: number;
	spawnedAt: number;
	status: "running" | "completed" | "failed";
}

export interface AlliesState {
	active: Map<string, AllyInfo>;
	budgetUsed: number;
	nameQueues: Record<string, string[]>;
	pendingNames: Map<string, string[]>;
	providerCooldowns: Map<string, number>;
	budget: BudgetState;
}

export interface QuestResult {
	allyName: string;
	defName: string;
	cost: number;
	model: string;
	response: string;
	cascadeAttempts: number;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cacheReadTokens?: number;
		cacheWriteTokens?: number;
	};
}

export interface SpawnOptions {
	piPath: string;
	cwd: string;
	model: string;
	tools: string;
	systemPrompt: string;
	task: string;
	thinking?: string;
	maxSubagentDepth?: number;
	signal?: AbortSignal;
	timeoutMs?: number;
	defName?: string;
	checkInIntervalMs?: number;
	onCheckIn?: (defName: string, elapsedMs: number, sinceActivityMs: number, recentLine: string) => void;
	onStderrLine?: (line: string) => void;
}

export interface SpawnResult {
	success: boolean;
	response: string;
	error?: string;
	retryable?: boolean;
	usage?: QuestResult["usage"];
}
