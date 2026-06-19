/**
 * Compaction Templates — Structured summary templates and prompt builders
 * for the tiered digestion system.
 *
 * Pure functions with zero external dependencies. Used by dragon-digestion.ts
 * to build prompts for LLM-based compaction (Tier 4).
 *
 * A small dog and a large dragon made this together.
 */

// ── Strategy Presets ──

export interface StrategyPreset {
	id: string;
	label: string;
	instructions: string;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
	{ id: "default", label: "Default", instructions: "" },
	{
		id: "code",
		label: "Code",
		instructions:
			"Focus on code changes, file paths, function signatures, and technical decisions. Keep implementation details. Minimize conversational prose.",
	},
	{
		id: "task",
		label: "Tasks",
		instructions:
			"Focus on user goals, completed tasks, current progress, and planned next steps. Minimize code-level details.",
	},
	{
		id: "minimal",
		label: "Minimal",
		instructions:
			"Extremely brief summary. Only include absolutely essential context needed to continue. Omit anything that can be re-derived from files.",
	},
	{
		id: "debug",
		label: "Debug",
		instructions:
			"Prioritize: what was tried, what was ruled out, evidence found, error messages verbatim, file paths involved. Preserve debugging state over general conversation.",
	},
];

// ── Structured Summary Template ──

/**
 * The 8-section markdown template for structured compaction summaries.
 * Each section acts as a checklist — the compaction LLM fills in every section
 * to prevent silent information loss.
 */
export const STRUCTURED_SUMMARY_TEMPLATE = `## Session Intent
[Single sentence: what this session is trying to accomplish]

## Files Modified
- \`path/to/file.ts\` — [what changed and why]

## Files Read (Referenced)
- \`path/to/file.ts\` — [why it was read, key content found]

## Decisions Made
- [decision] — [rationale]

## Approaches Ruled Out
- [approach] — [why rejected]

## Current State
[What's done, what's in progress, what's blocked]

## User Constraints & Preferences
- [constraint or preference, verbatim where possible]

## Next Steps
1. [immediate next action]
2. [following actions]

## Key Errors (verbatim)
[Exact error text, never paraphrased. Include file paths and line numbers.]`;

// ── Prompt Builders ──

/**
 * Format strategy instructions for inclusion in a prompt.
 * Accepts either a strategy ID (looked up from built-in presets) or raw instructions.
 * Returns empty string if no instructions, or a labeled block otherwise.
 */
export function formatStrategyInstructions(strategyIdOrInstructions: string, isRawInstructions = false): string {
	const instructions = isRawInstructions
		? strategyIdOrInstructions
		: getStrategyById(strategyIdOrInstructions).instructions;
	if (!instructions) return "";
	return `STRATEGY FOCUS:\n${instructions}\n`;
}

/**
 * Build the prompt for the FIRST compaction (no previous summary exists).
 * The LLM reads the conversation and produces a structured summary.
 * Pass `strategyInstructions` to use custom strategy text instead of looking up by ID.
 */
export function buildFirstCompactionPrompt(messagesToSummarize: string, strategyId: string, strategyInstructions?: string): string {
	const strategyBlock = strategyInstructions
		? formatStrategyInstructions(strategyInstructions, true)
		: formatStrategyInstructions(strategyId);

	return `You are summarizing a coding session. Read the conversation below and produce a structured summary using the EXACT section headings provided.

Rules:
- Fill in every section. If a section has no content, write "None yet."
- PRESERVE all file paths, function names, error messages, and version numbers VERBATIM
- Never generalize: write \`src/auth.controller.ts\`, not "a configuration file"
- Keep error messages exactly as they appeared — do not paraphrase
- Be concise but complete. Each bullet should be one line.

${strategyBlock}
CONVERSATION:
${messagesToSummarize}

Produce the summary using these section headings:
${STRUCTURED_SUMMARY_TEMPLATE}`;
}

/**
 * Build the prompt for INCREMENTAL compaction (merging new content into an existing summary).
 * The LLM updates each section with new information without re-summarizing from scratch.
 * Pass `strategyInstructions` to use custom strategy text instead of looking up by ID.
 */
export function buildAnchoredUpdatePrompt(
	previousSummary: string,
	newMessages: string,
	strategyId: string,
	strategyInstructions?: string,
): string {
	const strategyBlock = strategyInstructions
		? formatStrategyInstructions(strategyInstructions, true)
		: formatStrategyInstructions(strategyId);

	return `You are updating a session summary. Below is the EXISTING summary from a previous compaction, followed by NEW CONVERSATION that happened since then.

Merge the new information into each section of the existing summary:
- ADD new entries to existing sections (don't remove old entries unless superseded)
- UPDATE entries that have changed (e.g., a file was modified again)
- REMOVE entries only if explicitly superseded (e.g., a decision was reversed)
- PRESERVE all file paths, function names, error messages, and version numbers VERBATIM
- Never generalize: write \`src/auth.controller.ts\`, not "a configuration file"

${strategyBlock}
EXISTING SUMMARY:
${previousSummary}

NEW CONVERSATION:
${newMessages}

Return the updated summary using the exact section headings. Every section must be present.`;
}

/**
 * Look up a strategy preset by ID. Returns the default preset if not found.
 */
export function getStrategyById(id: string): StrategyPreset {
	return STRATEGY_PRESETS.find(s => s.id === id) ?? STRATEGY_PRESETS[0]!;
}
