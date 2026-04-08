/**
 * ally-taxonomy.ts — Shared ally taxonomy primitives for the hoard.
 *
 * Extracted from hoard-allies so other extensions (quest tool, guard, etc.)
 * can reference combo types, curated defs, cost calculation, and job config
 * without importing the full extension module.
 */

// ── Enums (const-array pattern) ──

export const ADJECTIVES = ["silly", "clever", "wise", "elder"] as const;
export type Adjective = (typeof ADJECTIVES)[number];

export const NOUNS = ["kobold", "griffin", "dragon"] as const;
export type Noun = (typeof NOUNS)[number];

export const JOBS = ["scout", "reviewer", "coder", "researcher", "planner"] as const;
export type Job = (typeof JOBS)[number];

// ── AllyCombo ──

export interface AllyCombo {
	adjective: Adjective;
	noun: Noun;
	job: Job;
}

// ── Curated Combos ──

export const CURATED_COMBOS: AllyCombo[] = [
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

// ── Combo Helpers ──

export function comboName(combo: AllyCombo): string {
	return `${combo.adjective}-${combo.noun}-${combo.job}`;
}

export function parseComboName(name: string): AllyCombo | null {
	const parts = name.split("-");
	if (parts.length !== 3) return null;
	const [adjective, noun, job] = parts as [string, string, string];
	if (!(ADJECTIVES as readonly string[]).includes(adjective)) return null;
	if (!(NOUNS as readonly string[]).includes(noun)) return null;
	if (!(JOBS as readonly string[]).includes(job)) return null;
	return { adjective: adjective as Adjective, noun: noun as Noun, job: job as Job };
}

export const CURATED_NAMES: Set<string> = new Set(CURATED_COMBOS.map((c) => comboName(c)));

// ── Cost Calculation ──

export const THINKING_WEIGHTS: Record<Adjective, number> = {
	silly: 0,
	clever: 1,
	wise: 2,
	elder: 4,
};

export const NOUN_WEIGHTS: Record<Noun, number> = {
	kobold: 0.5,
	griffin: 2.5,
	dragon: 10,
};

export function calcCost(combo: AllyCombo): number {
	return (THINKING_WEIGHTS[combo.adjective] + 1) * NOUN_WEIGHTS[combo.noun];
}

// ── Job Config ──

export const JOB_TOOLS: Record<Job, string> = {
	scout: "read,grep,find,ls,bash",
	reviewer: "read,grep,find,ls,bash",
	coder: "read,grep,find,ls,bash,write,edit",
	researcher: "read,grep,find,ls,bash",
	planner: "read,grep,find,ls",
};

export const JOB_DEFAULTS: Record<Job, { timeoutMs: number; checkInIntervalMs: number }> = {
	scout:      { timeoutMs:  60_000, checkInIntervalMs: 15_000 },
	reviewer:   { timeoutMs: 120_000, checkInIntervalMs: 20_000 },
	coder:      { timeoutMs: 180_000, checkInIntervalMs: 25_000 },
	researcher: { timeoutMs: 300_000, checkInIntervalMs: 30_000 },
	planner:    { timeoutMs: 180_000, checkInIntervalMs: 25_000 },
};
