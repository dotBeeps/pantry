/**
 * types.ts — Shared types for hoard-allies.
 */

export type Adjective = "silly" | "clever" | "wise" | "elder";
export type Noun = "kobold" | "griffin" | "dragon";
export type Job = "scout" | "reviewer" | "coder" | "researcher" | "planner";

export interface AllyCombo {
	adjective: Adjective;
	noun: Noun;
	job: Job;
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
