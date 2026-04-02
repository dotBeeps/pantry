/**
 * Dragon Guard state management — mode, session tool overrides, persistence, and reconstruction.
 *
 * State is stored via pi.appendEntry() for branch-correct session persistence
 * and reconstructed from session entries on start/switch/fork/tree.
 */

import { isSafePlanBash } from "./bash-patterns.ts";
import { DOG_MODE_ALLOWED_TOOLS, PUPPY_MODE_DEFAULT_ALLOWED_TOOLS } from "./settings.ts";

// ── Types ──

export type GuardMode = "none" | "plan" | "dragon";

export type PersistedState = {
	mode?: GuardMode;
	dogModeSessionAllowedTools?: string[];
	dogModeSessionBlockedTools?: string[];
	puppyModeSessionAllowedTools?: string[];
};

export const MODE_LABEL: Record<GuardMode, string> = {
	none: "Dog Mode",
	plan: "Puppy Mode",
	dragon: "Dragon Mode",
};

// ── Module-Level State ──

let _mode: GuardMode = "none";

export const dogModeSessionAllowedTools = new Set<string>();
export const dogModeSessionBlockedTools = new Set<string>();
export const puppyModeSessionAllowedTools = new Set<string>();

// ── Accessors ──

export function getMode(): GuardMode {
	return _mode;
}

export function setMode(m: GuardMode): void {
	_mode = m;
}

// ── Tool Policy ──

export function getDogModeToolPolicy(toolName: string): "allow" | "block" | "prompt" {
	if (dogModeSessionBlockedTools.has(toolName)) return "block";
	if (DOG_MODE_ALLOWED_TOOLS.has(toolName) || dogModeSessionAllowedTools.has(toolName)) return "allow";
	return "prompt";
}

export function getPuppyModeToolPolicy(toolName: string, input: unknown): "allow" | "prompt" {
	if (puppyModeSessionAllowedTools.has(toolName)) return "allow";

	if (toolName === "bash") {
		const command = String((input as { command?: unknown } | undefined)?.command ?? "");
		return isSafePlanBash(command) ? "allow" : "prompt";
	}

	if (PUPPY_MODE_DEFAULT_ALLOWED_TOOLS.has(toolName)) return "allow";
	return "prompt";
}

// ── Persistence ──

/**
 * Persist current guard state as a session entry.
 * Accepts the appendEntry callback from pi to avoid direct pi dependency.
 */
export function persistState(appendEntry: (type: string, data: unknown) => void): void {
	appendEntry("dragon-guard-state", {
		mode: _mode,
		dogModeSessionAllowedTools: [...dogModeSessionAllowedTools],
		dogModeSessionBlockedTools: [...dogModeSessionBlockedTools],
		puppyModeSessionAllowedTools: [...puppyModeSessionAllowedTools],
	} satisfies PersistedState);
}

/**
 * Reconstruct guard state from session entries.
 * Clears all session overrides and replays persisted state entries.
 * Validates tool name types to guard against corrupted data.
 */
export function reconstructState(entries: readonly any[]): GuardMode {
	let restoredMode: GuardMode = "none";
	dogModeSessionAllowedTools.clear();
	dogModeSessionBlockedTools.clear();
	puppyModeSessionAllowedTools.clear();

	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== "dragon-guard-state") continue;
		const data = entry.data as PersistedState | undefined;

		if (data?.mode === "none" || data?.mode === "plan" || data?.mode === "dragon") {
			restoredMode = data.mode;
		}
		for (const toolName of data?.dogModeSessionAllowedTools ?? []) {
			if (typeof toolName === "string") dogModeSessionAllowedTools.add(toolName);
		}
		for (const toolName of data?.dogModeSessionBlockedTools ?? []) {
			if (typeof toolName === "string") dogModeSessionBlockedTools.add(toolName);
		}
		for (const toolName of data?.puppyModeSessionAllowedTools ?? []) {
			if (typeof toolName === "string") puppyModeSessionAllowedTools.add(toolName);
		}
	}

	_mode = restoredMode;
	return restoredMode;
}
