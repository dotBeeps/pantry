/**
 * Dragon Guard settings — reads from dotsPiEnhancements namespace in ~/.pi/agent/settings.json.
 *
 * All settings have sensible defaults matching the original hardcoded values.
 * Users can customize via settings.json without editing extension code.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ── Settings Infrastructure ──

const SETTINGS_NAMESPACE = "dotsPiEnhancements";

function getSettingsPath(): string {
	return join(process.env.HOME || process.env.USERPROFILE || homedir(), ".pi", "agent", "settings.json");
}

export function readSetting<T>(key: string, fallback: T): T {
	try {
		const path = getSettingsPath();
		if (!existsSync(path)) return fallback;
		const settings = JSON.parse(readFileSync(path, "utf-8"));
		if (typeof settings !== "object" || settings === null) return fallback;
		const ns = settings[SETTINGS_NAMESPACE];
		if (typeof ns !== "object" || ns === null) return fallback;
		return key in ns ? (ns as Record<string, unknown>)[key] as T : fallback;
	} catch { return fallback; }
}

/** Turn a matchesKey-style code like "alt+t" into a display label like "Alt+T". */
export function keyLabel(code: string): string {
	return code.split("+").map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("+");
}

// ── Guard Settings ──

/** Default tool allowlist for Dog Mode (permission-gated neutral). */
export const GUARD_DOG_ALLOWED_TOOLS = readSetting<string[]>(
	"guardDogAllowedTools",
	["read", "ls", "find", "grep", "questionnaire"],
);

/** Default tool allowlist for Puppy Mode (read-only planning). */
export const GUARD_PUPPY_ALLOWED_TOOLS = readSetting<string[]>(
	"guardPuppyAllowedTools",
	["read", "ls", "find", "grep", "questionnaire", "bash"],
);

/** Keyboard shortcut to enter Dragon Mode. */
export const GUARD_DRAGON_KEY = readSetting<string>("guardDragonKey", "ctrl+alt+d");

/** Keyboard shortcut to enter Puppy Mode. */
export const GUARD_PUPPY_KEY = readSetting<string>("guardPuppyKey", "ctrl+alt+p");

/** Keyboard shortcut to enter Dog Mode. */
export const GUARD_DOG_KEY = readSetting<string>("guardDogKey", "ctrl+alt+n");

// ── Mutable Runtime Settings ──
// Initialized from settings.json, updatable at runtime via the guard panel.
// Use getter/setter functions for safe cross-module access under jiti.

let _autoDetect = readSetting<boolean>("guardAutoDetect", true);
let _complexityThreshold = readSetting<number>("guardComplexityThreshold", 4);
let _llmSummaries = readSetting<boolean>("guardLlmSummaries", true);

/** Whether to auto-detect complex prompts and switch to Puppy Mode. */
export function getAutoDetect(): boolean { return _autoDetect; }
export function setAutoDetect(v: boolean): void { _autoDetect = v; }

/** Complexity score threshold for auto-plan detection (higher = less sensitive). */
export function getComplexityThreshold(): number { return _complexityThreshold; }
export function setComplexityThreshold(v: number): void { _complexityThreshold = v; }

/** Whether to use LLM (Haiku) for tool call summaries in permission dialogs. */
export function getLlmSummaries(): boolean { return _llmSummaries; }
export function setLlmSummaries(v: boolean): void { _llmSummaries = v; }

/** Keyboard shortcut to toggle the Dragon Guard panel. */
export const GUARD_PANEL_KEY = readSetting<string>("guardPanelKey", "alt+g");

// ── Derived Sets ──

/** Tools always allowed in Dog Mode without prompting. */
export const DOG_MODE_ALLOWED_TOOLS = new Set<string>(GUARD_DOG_ALLOWED_TOOLS);

/** Tools allowed by default in Puppy Mode (bash gets extra safe-command checks). */
export const PUPPY_MODE_DEFAULT_ALLOWED_TOOLS = new Set<string>(GUARD_PUPPY_ALLOWED_TOOLS);

// ── Project Settings Writer ──

/**
 * Write a setting to the project's .pi/settings.json under the dotsPiEnhancements namespace.
 * Creates the file and parent directories if they don't exist.
 */
export function writeProjectSetting(cwd: string, key: string, value: unknown): boolean {
	try {
		const settingsPath = join(cwd, ".pi", "settings.json");
		let fileSettings: Record<string, unknown> = {};
		try {
			if (existsSync(settingsPath)) {
				const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
				if (typeof parsed === "object" && parsed !== null) fileSettings = parsed;
			}
		} catch { /* start fresh */ }
		const ns = typeof fileSettings[SETTINGS_NAMESPACE] === "object" && fileSettings[SETTINGS_NAMESPACE] !== null
			? fileSettings[SETTINGS_NAMESPACE] as Record<string, unknown>
			: {};
		ns[key] = value;
		fileSettings[SETTINGS_NAMESPACE] = ns;
		mkdirSync(dirname(settingsPath), { recursive: true });
		writeFileSync(settingsPath, JSON.stringify(fileSettings, null, 2) + "\n");
		return true;
	} catch { return false; }
}
