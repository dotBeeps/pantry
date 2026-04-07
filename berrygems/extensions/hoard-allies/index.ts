import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { readHoardSetting } from "../../lib/settings.ts";
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { registerQuestTool } from "./quest-tool.ts";

/**
 * hoard-allies — Subagent token governance for the hoard.
 *
 * Provides the kobold/griffin/dragon taxonomy for subagent dispatch:
 *   <adjective> <noun> <job> = <silly|clever|wise|elder> <kobold|griffin|dragon> <scout|reviewer|coder|researcher|planner>
 *
 * Features:
 *   - 13 curated agent defs, dynamically generated from settings
 *   - Named allies from shuffled pools (Grix the Silly Kobold Scout)
 *   - Formula-based budget: noun_weight × thinking_multiplier × job_multiplier
 *   - Deterministic enforcement via tool_call interception
 *
 * Configure via hoard.allies.* in settings.json.
 */

// ── Types ──

type Adjective = "silly" | "clever" | "wise" | "elder";
type Noun = "kobold" | "griffin" | "dragon";
type Job = "scout" | "reviewer" | "coder" | "researcher" | "planner";

interface AllyCombo {
	adjective: Adjective;
	noun: Noun;
	job: Job;
}

interface AllyInfo {
	name: string;
	defName: string;
	combo: AllyCombo;
	cost: number;
	spawnedAt: number;
	status: "running" | "completed" | "failed";
}

interface AlliesState {
	active: Map<string, AllyInfo>;
	budgetUsed: number;
	nameQueues: Record<string, string[]>;
	pendingNames: Map<string, string[]>;
	providerCooldowns: Map<string, number>;
}

// ── Constants: Curated Combos ──

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

// ── Constants: Name Pools ──

const NAME_POOLS: Record<Noun, string[]> = {
	kobold: [
		"Grix", "Snark", "Blik", "Twig", "Wort", "Nib", "Dreg", "Skrit", "Midge", "Pip",
		"Fizz", "Grub", "Splint", "Runt", "Dink", "Clod", "Smudge", "Fleck", "Nub", "Scrap",
		"Zig", "Glint", "Mote", "Crisp", "Soot", "Char", "Wisp", "Dross", "Kink", "Flint",
	],
	griffin: [
		"Aldric", "Kestrel", "Talon", "Sable", "Argent", "Voss", "Merrik", "Petra", "Aura", "Dusk",
		"Vale", "Seren", "Briar", "Lyric", "Storm", "Sage", "Quill", "Riven",
		"Crest", "Corvid", "Dawn", "Ashen", "Thorn", "Sigil", "Wren", "Fable", "Gale", "Lark",
	],
	dragon: [
		"Azurath", "Thalaxis", "Pyranthis", "Veridian", "Obsidius", "Solanthae", "Nocturis",
		"Aurumex", "Crystallis", "Tempestus", "Ignaris", "Umbralith", "Aethonis", "Drakmoor",
	],
};

// ── Constants: Defaults ──

const DEFAULT_MODELS: Record<string, string[]> = {
	kobold: ["github-copilot/claude-haiku-4.5", "anthropic/claude-haiku-4-5", "google/gemini-2.0-flash"],
	griffin: ["github-copilot/claude-sonnet-4.6", "anthropic/claude-sonnet-4-6", "google/gemini-2.5-pro"],
	dragon: ["github-copilot/claude-opus-4.6", "anthropic/claude-opus-4-6"],
};

const DEFAULT_THINKING: Record<string, string> = {
	silly: "none",
	clever: "low",
	wise: "medium",
	elder: "high",
};

const DEFAULT_NOUN_WEIGHTS: Record<Noun, number> = { kobold: 1, griffin: 5, dragon: 25 };
const DEFAULT_THINKING_MULTIPLIERS: Record<Adjective, number> = { silly: 1, clever: 1.5, wise: 2, elder: 3 };
const DEFAULT_JOB_MULTIPLIERS: Record<Job, number> = { scout: 0.5, reviewer: 1, coder: 1.5, researcher: 1, planner: 1.2 };
const DEFAULT_BUDGETS: Record<string, number> = { primary: 100, dragon: 20, griffin: 5, kobold: 0 };
const DEFAULT_REFUND_FRACTION = 0.5;

const DEFAULT_MAX_PARALLEL = 4;
const DEFAULT_CONFIRM_ABOVE = "griffin";
const DEFAULT_ANNOUNCE = true;

// Nouns a subagent of each tier can summon
const SUMMON_RULES: Record<Noun, Noun[]> = {
	kobold: [],
	griffin: ["kobold"],
	dragon: ["kobold", "griffin"],
};

const MAX_SUBAGENT_DEPTH: Record<Noun, number> = { kobold: 0, griffin: 1, dragon: 2 };

// ── Constants: Job Config ──

const JOB_TOOLS: Record<Job, string> = {
	scout: "read, grep, find, ls, bash",
	reviewer: "read, grep, find, ls, bash",
	coder: "read, grep, find, ls, bash, write, edit",
	researcher: "read, grep, find, ls, bash",
	planner: "read, grep, find, ls",
};

// ── Settings Readers ──

function getModels(): Record<string, string[]> {
	const custom = readHoardSetting<Record<string, string | string[]>>("allies.models", {});
	const result: Record<string, string[]> = { ...DEFAULT_MODELS };
	for (const [tier, models] of Object.entries(custom)) {
		result[tier] = Array.isArray(models) ? models : [models];
	}
	return result;
}

function getThinking(): Record<string, string> {
	return { ...DEFAULT_THINKING, ...readHoardSetting<Record<string, string>>("allies.thinking", {}) };
}

function getNounWeights(): Record<Noun, number> {
	return { ...DEFAULT_NOUN_WEIGHTS, ...readHoardSetting<Record<string, number>>("allies.budget.nounWeights", {}) } as Record<Noun, number>;
}

function getThinkingMultipliers(): Record<Adjective, number> {
	return { ...DEFAULT_THINKING_MULTIPLIERS, ...readHoardSetting<Record<string, number>>("allies.budget.thinkingMultipliers", {}) } as Record<Adjective, number>;
}

function getJobMultipliers(): Record<Job, number> {
	return { ...DEFAULT_JOB_MULTIPLIERS, ...readHoardSetting<Record<string, number>>("allies.budget.jobMultipliers", {}) } as Record<Job, number>;
}

function getBudgets(): Record<string, number> {
	return { ...DEFAULT_BUDGETS, ...readHoardSetting<Record<string, number>>("allies.budget.pools", {}) };
}

function getRefundFraction(): number {
	return readHoardSetting<number>("allies.budget.refundFraction", DEFAULT_REFUND_FRACTION);
}

function getMaxParallel(): number {
	return readHoardSetting<number>("allies.maxParallel", DEFAULT_MAX_PARALLEL);
}

function getConfirmAbove(): string {
	return readHoardSetting<string>("allies.confirmAbove", DEFAULT_CONFIRM_ABOVE);
}

function getAnnounce(): boolean {
	return readHoardSetting<boolean>("allies.announceDispatch", DEFAULT_ANNOUNCE);
}

// ── Cost Calculation ──

function calcCost(combo: AllyCombo): number {
	const nw = getNounWeights();
	const tm = getThinkingMultipliers();
	const jm = getJobMultipliers();
	return (nw[combo.noun] ?? 1) * (tm[combo.adjective] ?? 1) * (jm[combo.job] ?? 1);
}

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
	return { adjective: adjective as Adjective, noun: noun as Noun, job: job as Job };
}

// ── State Management ──

const ALLIES_STATE_KEY = Symbol.for("hoard.allies.state");

function getState(): AlliesState {
	const g = globalThis as Record<symbol, AlliesState>;
	if (!g[ALLIES_STATE_KEY]) {
		g[ALLIES_STATE_KEY] = initState();
	}
	return g[ALLIES_STATE_KEY];
}

function initState(): AlliesState {
	return {
		active: new Map(),
		budgetUsed: 0,
		nameQueues: {
			kobold: shuffle([...NAME_POOLS.kobold]),
			griffin: shuffle([...NAME_POOLS.griffin]),
			dragon: shuffle([...NAME_POOLS.dragon]),
		},
		pendingNames: new Map(),
		providerCooldowns: new Map(),
	};
}

function resetState(): void {
	const g = globalThis as Record<symbol, AlliesState>;
	g[ALLIES_STATE_KEY] = initState();
}

function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i]!, arr[j]!] = [arr[j]!, arr[i]!];
	}
	return arr;
}

function popName(noun: Noun): string {
	const state = getState();
	let queue = state.nameQueues[noun];
	if (!queue || queue.length === 0) {
		queue = shuffle([...NAME_POOLS[noun]]);
		state.nameQueues[noun] = queue;
	}
	return queue.pop()!;
}

function budgetRemaining(): number {
	const budgets = getBudgets();
	return (budgets["primary"] ?? 100) - getState().budgetUsed;
}

function recordSpawn(id: string, info: AllyInfo): void {
	const state = getState();
	state.active.set(id, info);
	state.budgetUsed += info.cost;
}

function recordComplete(id: string): AllyInfo | undefined {
	const state = getState();
	const info = state.active.get(id);
	if (!info) return undefined;
	info.status = "completed";
	const refund = info.cost * getRefundFraction();
	state.budgetUsed = Math.max(0, state.budgetUsed - refund);
	return info;
}

function recordFailed(id: string): AllyInfo | undefined {
	const state = getState();
	const info = state.active.get(id);
	if (!info) return undefined;
	info.status = "failed";
	// Full refund on failure — the work wasn't useful
	state.budgetUsed = Math.max(0, state.budgetUsed - info.cost);
	return info;
}

// ── Job Prompt Templates ──

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function identityLine(allyName: string | null, combo: AllyCombo): string {
	const title = `${capitalize(combo.adjective)} ${capitalize(combo.noun)} ${capitalize(combo.job)}`;
	return allyName ? `You are ${allyName} the ${title}.` : `You are a ${title}.`;
}

function jobPrompt(combo: AllyCombo): string {
	const prompts: Record<Job, string> = {
		scout: `## Your Job
- Scan files, directories, and code structure
- Find specific patterns, imports, references, usages
- Map project layout and dependencies
- Report findings with exact file paths and line numbers

## Rules
- Do NOT analyze or explain — just find and report
- Do NOT modify any files
- Keep responses short and structured
- Cite every finding as file:line

## Output Format
List your findings as:
- \`file/path.ts:42\` — brief description of what you found`,

		reviewer: `## Your Job
- Review code for correctness, patterns, and conventions
- Check documentation for accuracy and completeness
- Validate configuration and frontmatter
- Identify bugs, antipatterns, and improvement opportunities

## Rules
- Do NOT modify any files — report only
- Cite every finding with file:line references
- Prioritize: critical > warning > suggestion
- Flag architectural concerns for your dispatcher

## Output Format
1. Summary (2-3 sentences)
2. Findings (severity | file:line | description)
3. Recommendations (prioritized)`,

		coder: `## Your Job
- Write and edit code following project conventions
- Implement features, fix bugs, refactor as directed
- Follow existing patterns in the codebase
- Verify your changes compile/lint clean where possible

## Rules
- Read relevant code before writing — understand the patterns
- Follow the project's AGENTS.md conventions
- Don't over-engineer — do what's asked, nothing more
- If scope grows beyond your task, report back to dispatcher

## Output Format
1. What you changed and why (brief)
2. Files modified (with key changes noted)
3. Anything you couldn't complete or concerns`,

		researcher: `## Your Job
- Research topics, APIs, libraries, patterns
- Read documentation and source code thoroughly
- Synthesize findings into structured reports
- Compare options with pros/cons when relevant

## Rules
- Cite all sources (file paths, documentation sections)
- Distinguish facts from opinions/recommendations
- Keep reports focused on what was asked
- Flag gaps in available information

## Output Format
1. Summary (key findings in 2-3 sentences)
2. Details (organized by topic/question)
3. Sources (all references cited)
4. Gaps (what you couldn't determine)`,

		planner: `## Your Job
- Break down complex tasks into phases and steps
- Write specifications and design documents
- Evaluate architectural options and tradeoffs
- Consider second-order effects and edge cases

## Rules
- Read existing code and docs before planning
- Consider ETHICS.md implications for data/consent features
- Think about testing, rollback, and failure modes
- Document your reasoning — plans should be self-explanatory

## Output Format
1. Goal (what we're trying to achieve)
2. Current State (what exists now)
3. Plan (phased steps with dependencies)
4. Risks & Mitigations
5. Open Questions`,
	};
	return prompts[combo.job];
}

function tierBehavior(combo: AllyCombo): string {
	const behaviors: Record<Adjective, string> = {
		silly: "Be fast and minimal. No overthinking. Execute and return.",
		clever: "Reason a little where it helps. Stay focused and frugal.",
		wise: "Reason carefully. Be thorough but efficient. Cite your sources.",
		elder: "Think deeply. Consider second-order effects. Document your reasoning extensively.",
	};
	return behaviors[combo.adjective];
}

function spawnBudgetLine(combo: AllyCombo): string {
	const rules = SUMMON_RULES[combo.noun];
	if (rules.length === 0) return "You cannot dispatch subagents.";
	const budget = getBudgets()[combo.noun] ?? 0;
	if (budget <= 0) return "You cannot dispatch subagents.";
	const allowed = rules.map(capitalize).join(" or ");
	return `You may dispatch subagents (${allowed} tier only). Your budget: ${budget} points.`;
}

function buildAllyPrompt(combo: AllyCombo, allyName: string | null): string {
	return `${identityLine(allyName, combo)}

${tierBehavior(combo)}

${jobPrompt(combo)}

## Budget
${spawnBudgetLine(combo)}
`;
}

// ── Agent Def Generation ──

function resolveModel(noun: string): string {
	const models = getModels();
	const candidates = models[noun] ?? DEFAULT_MODELS[noun] ?? ["anthropic/claude-haiku-4-5"];
	return candidates[0]!;
}

function comboDescription(combo: AllyCombo): string {
	const costPts = calcCost(combo).toFixed(1);
	const jobDesc: Record<Job, Record<Noun, string>> = {
		scout: {
			kobold: "Fast file scanning, listing, structure mapping, quick checks.",
			griffin: "Thorough scanning with reasoning. Finds patterns and connections.",
			dragon: "Strategic reconnaissance across large codebases.",
		},
		reviewer: {
			kobold: "Simple validation, frontmatter checks, convention compliance.",
			griffin: "Thorough code review, architecture analysis, spec alignment.",
			dragon: "Deep review — security, ethics compliance, architectural integrity.",
		},
		coder: {
			kobold: "Simple edits, boilerplate, mechanical transformations.",
			griffin: "Feature implementation, refactoring, multi-file changes.",
			dragon: "Complex architecture, foundational code, system design.",
		},
		researcher: {
			kobold: "Quick lookups, documentation scanning, simple gathering.",
			griffin: "Deep research, synthesis, multi-source comparison.",
			dragon: "Strategic research with architectural implications.",
		},
		planner: {
			kobold: "Simple task breakdown, checklist generation.",
			griffin: "Feature planning, phased specs, dependency analysis.",
			dragon: "Foundational architecture decisions, major spec authoring.",
		},
	};
	const desc = jobDesc[combo.job]?.[combo.noun] ?? `${capitalize(combo.job)} at ${combo.noun} tier.`;
	return `${desc} (${costPts} pts)`;
}

function generateAgentDef(combo: AllyCombo): string {
	const name = comboName(combo);
	const model = resolveModel(combo.noun);
	const thinking = getThinking()[combo.adjective] ?? "none";
	const depth = MAX_SUBAGENT_DEPTH[combo.noun];
	const prompt = buildAllyPrompt(combo, null);

	return `---
name: ${name}
description: ${comboDescription(combo)}
tools: ${JOB_TOOLS[combo.job]}
model: ${model}
thinking: ${thinking}
maxSubagentDepth: ${depth}
---

${prompt}`;
}

function cleanOldDefs(agentsDir: string): void {
	// Remove old 2D agent defs (phase 1 format: adj-noun.md)
	const oldPattern = /^(silly|clever|wise|elder)-(kobold|griffin|dragon)\.md$/;
	try {
		for (const file of readdirSync(agentsDir)) {
			if (oldPattern.test(file)) {
				unlinkSync(join(agentsDir, file));
			}
		}
	} catch {
		// Directory may not exist yet
	}
}

function writeAgentDefs(cwd: string): void {
	const agentsDir = join(cwd, ".pi", "agents");
	mkdirSync(agentsDir, { recursive: true });
	cleanOldDefs(agentsDir);

	for (const combo of CURATED_COMBOS) {
		const path = join(agentsDir, `${comboName(combo)}.md`);
		writeFileSync(path, generateAgentDef(combo));
	}
}

// ── Display ──

function buildTaxonomyDisplay(): string {
	const maxP = getMaxParallel();
	const confirm = getConfirmAbove();
	const budgets = getBudgets();
	const remaining = budgetRemaining();
	const state = getState();

	const rows = CURATED_COMBOS.map((combo) => {
		const nw = getNounWeights();
		const tm = getThinkingMultipliers();
		const jm = getJobMultipliers();
		const cost = calcCost(combo);
		const formula = `${nw[combo.noun]} × ${tm[combo.adjective]} × ${jm[combo.job]}`;
		const model = resolveModel(combo.noun);
		const think = getThinking()[combo.adjective] ?? "none";
		return `| ${comboName(combo)} | ${think} | ${model} | ${formula} = ${cost.toFixed(1)} | ${comboDescription(combo)} |`;
	}).join("\n");

	const activeList = Array.from(state.active.values())
		.filter((a) => a.status === "running")
		.map((a) => `- **${a.name}** (${a.defName}) — ${a.cost.toFixed(1)} pts`)
		.join("\n") || "- none";

	return `## Hoard Allies — Subagent Taxonomy

| Agent | Thinking | Model | Formula = Cost | Description |
|-------|----------|-------|----------------|-------------|
${rows}

### Budget
- **Pool:** ${budgets["primary"] ?? 100} pts total | **Used:** ${state.budgetUsed.toFixed(1)} | **Remaining:** ${remaining.toFixed(1)}
- **Refund on complete:** ${(getRefundFraction() * 100).toFixed(0)}% of dispatch cost
- **Refund on failure:** 100% (work wasn't useful)

### Active Allies
${activeList}

### Config
- **Max parallel:** ${maxP}
- **Confirm above:** ${confirm}
- **Announce dispatch:** ${getAnnounce()}

### The Rule
> **Default to kobold. Escalate only when the task genuinely needs more.**

### Cost Formula
\`cost = noun_weight × thinking_multiplier × job_multiplier\`
- Noun: kobold=${DEFAULT_NOUN_WEIGHTS.kobold}, griffin=${DEFAULT_NOUN_WEIGHTS.griffin}, dragon=${DEFAULT_NOUN_WEIGHTS.dragon}
- Thinking: silly=${DEFAULT_THINKING_MULTIPLIERS.silly}, clever=${DEFAULT_THINKING_MULTIPLIERS.clever}, wise=${DEFAULT_THINKING_MULTIPLIERS.wise}, elder=${DEFAULT_THINKING_MULTIPLIERS.elder}
- Job: scout=${DEFAULT_JOB_MULTIPLIERS.scout}, reviewer=${DEFAULT_JOB_MULTIPLIERS.reviewer}, coder=${DEFAULT_JOB_MULTIPLIERS.coder}, researcher=${DEFAULT_JOB_MULTIPLIERS.researcher}, planner=${DEFAULT_JOB_MULTIPLIERS.planner}
`;
}

// ── System Prompt (Primary Session) ──

function buildSystemPrompt(): string {
	const maxP = getMaxParallel();
	const confirm = getConfirmAbove();
	const budgets = getBudgets();
	const remaining = budgetRemaining();
	const nounOrder: Noun[] = ["kobold", "griffin", "dragon"];
	const confirmIdx = nounOrder.indexOf(confirm as Noun);
	const confirmNote = confirmIdx >= 0
		? `- **Dispatching ${confirm}-tier or above requires user confirmation** (confirmAbove: "${confirm}").\n`
		: "";

	const costTable = CURATED_COMBOS.map((combo) => {
		const nw = getNounWeights();
		const tm = getThinkingMultipliers();
		const jm = getJobMultipliers();
		const cost = calcCost(combo);
		return `  ${comboName(combo)}: ${nw[combo.noun]} × ${tm[combo.adjective]} × ${jm[combo.job]} = ${cost.toFixed(1)} pts`;
	}).join("\n");

	return `## Subagent Dispatch — Hoard Allies

You have a kobold/griffin/dragon taxonomy for subagent dispatch.
Use the **quest** tool to send allies on quests. Agent definitions are also in .pi/agents/ for the built-in subagent tool.

The matrix: <adjective> <noun> <job>
- Adjective = thinking: silly (none) → clever (low) → wise (medium) → elder (high)
- Noun = model: kobold (haiku, $) → griffin (sonnet, $$$) → dragon (opus, $$$$$)
- Job = role: scout (recon) | reviewer (analysis) | coder (implementation) | researcher (gathering) | planner (strategy)

### Cost Budget
Budget remaining: **${remaining.toFixed(1)} pts** of ${budgets["primary"] ?? 100}.
Refund: ${(getRefundFraction() * 100).toFixed(0)}% on completion, 100% on failure.

Cost per ally:
${costTable}

### WHEN TO DISPATCH

Parallelize when a task has **independent subtasks that can run simultaneously**:
- Reviewing multiple files/packages/components → one reviewer per component
- Checking different quality dimensions → one reviewer per dimension
- Scanning + analyzing → kobold scouts first, then targeted reviews on findings
- Implementing independent changes → one coder per file/component

Do NOT dispatch when:
- The task is simple enough to do yourself in a few tool calls
- Subtasks depend on each other's output (use chains instead of parallel)
- You'd be sending 1 agent to do 1 small thing (just do it yourself)

### HOW TO ASSIGN

1. **Pick the job first.** What role does this subtask need? Scout, reviewer, coder, researcher, planner?
2. **Pick the cheapest noun.** Can a kobold handle it? Try kobold first.
3. **Pick the adjective.** How much reasoning? Silly for mechanical, clever for light analysis, wise for deep, elder for critical.

### RULES

- **Default: kobold scout.** Escalate only when the task proves it needs more.
- **Budget is finite.** Track your spending. This is an ethical obligation per ETHICS.md §3.7.
- **Max parallel: ${maxP}.** Hard cap from settings.
- **Prefer more kobolds over fewer griffins** for scanning/review work.
- **Use chains** (kobold scout → griffin reviewer) when you need escalation on findings.
${confirmNote}- **When in doubt, read the hoard-allies skill** for detailed dispatch patterns.`;
}

// ── Enforcement ──

function checkBudget(combo: AllyCombo): { allowed: boolean; reason?: string } {
	const cost = calcCost(combo);
	const remaining = budgetRemaining();

	if (cost > remaining) {
		return {
			allowed: false,
			reason: `Budget exceeded. ${comboName(combo)} costs ${cost.toFixed(1)} pts but only ${remaining.toFixed(1)} pts remain of ${getBudgets()["primary"] ?? 100}. Choose a cheaper ally or wait for completions to refund budget.`,
		};
	}

	return { allowed: true };
}

function checkParallel(): { allowed: boolean; reason?: string } {
	const state = getState();
	const running = Array.from(state.active.values()).filter((a) => a.status === "running").length;
	const max = getMaxParallel();

	if (running >= max) {
		return {
			allowed: false,
			reason: `Max parallel limit reached (${running}/${max} running). Wait for an ally to complete before dispatching another.`,
		};
	}

	return { allowed: true };
}

// ── Shared API for quest-tool (via globalThis) ──

const ALLIES_API_KEY = Symbol.for("hoard.allies.api");

function exposeAPI(): void {
	(globalThis as Record<symbol, unknown>)[ALLIES_API_KEY] = {
		calcCost,
		getModels,
		getThinking,
		popName,
		buildAllyPrompt,
		budgetRemaining,
		recordSpawn,
		recordComplete,
		recordFailed,
	};
}

// ── Main Export ──

export default function hoardAllies(pi: ExtensionAPI) {
	// Expose API for quest-tool module
	exposeAPI();
	// Register the quest dispatch tool
	registerQuestTool(pi);

	// Regenerate agent defs + reset state on session start
	pi.on("session_start", async (_event, ctx) => {
		try {
			writeAgentDefs(ctx.cwd);
			resetState();
		} catch {
			// Non-fatal — agent defs may already exist
		}
	});

	// Inject taxonomy awareness into system prompt
	// Skip persona prompt for subagents to save tokens
	pi.on("before_agent_start", async (_event, ctx) => {
		if (!ctx.hasUI) {
			// Subagent — strip the global APPEND_SYSTEM.md persona prompt
			const stripAppend = readHoardSetting<boolean>("allies.stripAppendForSubagents", true);
			if (stripAppend) {
				const currentPrompt: string = (typeof ctx.getSystemPrompt === "function" ? ctx.getSystemPrompt() : "") ?? "";
				try {
					const { readFileSync } = await import("node:fs");
					const { join: joinPath } = await import("node:path");
					const globalAppend = joinPath(process.env.HOME ?? "~", ".pi", "agent", "APPEND_SYSTEM.md");
					const projectAppend = joinPath(ctx.cwd, ".pi", "APPEND_SYSTEM.md");
					let appendContent = "";
					try { appendContent = readFileSync(globalAppend, "utf-8"); } catch { /* no global append */ }
					try { const p = readFileSync(projectAppend, "utf-8"); if (p) appendContent = p; } catch { /* no project append */ }
					if (appendContent && currentPrompt.includes(appendContent.trim())) {
						const stripped = currentPrompt.replace(appendContent.trim(), "").trim();
						// Inject ally name if pending
						const injected = injectPendingName(stripped);
						return { systemPrompt: injected };
					}
				} catch { /* non-fatal */ }
			}
			// Even if we didn't strip, try to inject the name
			const currentPrompt: string = (typeof ctx.getSystemPrompt === "function" ? ctx.getSystemPrompt() : "") ?? "";
			if (currentPrompt) {
				const injected = injectPendingName(currentPrompt);
				if (injected !== currentPrompt) return { systemPrompt: injected };
			}
			return;
		}
		return {
			systemPromptAppend: buildSystemPrompt(),
		};
	});

	// Intercept subagent dispatch for budget enforcement + name injection
	pi.on("tool_call", async (event, _ctx) => {
		if (!isToolCallEventType("subagent", event)) return;

		const agentName = (event.input as Record<string, unknown>)?.["agent"] as string | undefined;
		if (!agentName) return;

		const combo = parseComboName(agentName);
		if (!combo) return; // Not one of our allies

		// Check parallel limit
		const parallelCheck = checkParallel();
		if (!parallelCheck.allowed) {
			return { block: true, reason: parallelCheck.reason };
		}

		// Check budget
		const budgetCheck = checkBudget(combo);
		if (!budgetCheck.allowed) {
			return { block: true, reason: budgetCheck.reason };
		}

		// Pop a name and record the spawn
		const allyName = popName(combo.noun);
		const cost = calcCost(combo);
		const id = `${agentName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

		recordSpawn(id, {
			name: allyName,
			defName: agentName,
			combo,
			cost,
			spawnedAt: Date.now(),
			status: "running",
		});

		// Queue the name for injection in before_agent_start
		const state = getState();
		const pending = state.pendingNames.get(agentName) ?? [];
		pending.push(allyName);
		state.pendingNames.set(agentName, pending);
	});

	// Track subagent completion for budget refund
	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName !== "subagent") return;

		// Find the most recently spawned running ally and mark complete
		const state = getState();
		for (const [id, info] of state.active) {
			if (info.status === "running") {
				if (event.isError) {
					recordFailed(id);
				} else {
					recordComplete(id);
				}
				break;
			}
		}
	});

	// /allies command — display the taxonomy with current settings
	pi.registerCommand("allies", {
		description: "Show the hoard subagent taxonomy (kobold/griffin/dragon)",
		handler: async (_args, ctx) => {
			ctx.ui.notify(buildTaxonomyDisplay(), "info");
		},
	});

	// /allies-regen command — regenerate agent defs from current settings
	pi.registerCommand("allies-regen", {
		description: "Regenerate agent definitions from current hoard.allies settings",
		handler: async (_args, ctx) => {
			writeAgentDefs(ctx.cwd);
			ctx.ui.notify("Agent defs regenerated from settings", "info");
		},
	});
}

// ── Name Injection Helper ──

function injectPendingName(systemPrompt: string): string {
	// Look for "You are a <Adj> <Noun> <Job>." pattern and replace with named version
	const pattern = /You are a (Silly|Clever|Wise|Elder) (Kobold|Griffin|Dragon) (Scout|Reviewer|Coder|Researcher|Planner)\./i;
	const match = systemPrompt.match(pattern);
	if (!match) return systemPrompt;

	const noun = match[2]!.toLowerCase() as Noun;
	const agentAdj = match[1]!.toLowerCase();
	const agentJob = match[3]!.toLowerCase();
	const agentDefName = `${agentAdj}-${noun}-${agentJob}`;

	const state = getState();
	const pending = state.pendingNames.get(agentDefName);
	if (!pending || pending.length === 0) return systemPrompt;

	const allyName = pending.shift()!;
	if (pending.length === 0) state.pendingNames.delete(agentDefName);

	return systemPrompt.replace(pattern, `You are ${allyName} the ${match[1]} ${match[2]} ${match[3]}.`);
}
