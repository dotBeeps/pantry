/**
 * Dragon Guard settings — reads from pantry.guard namespace.
 *
 * All settings have sensible defaults matching the original hardcoded values.
 * Users can customize via settings.json without editing extension code.
 */

import {
  readPantrySetting,
  readPantryKey,
  writeProjectPantrySetting,
  keyLabel,
} from "../../lib/settings.ts";

export { keyLabel };

// ── Guard Settings ──

/** Default tool allowlist for Dog Mode (permission-gated neutral). */
export const GUARD_DOG_ALLOWED_TOOLS = readPantrySetting<string[]>(
  "guard.dogAllowedTools",
  ["read", "ls", "find", "grep", "questionnaire"],
);

/** Default tool allowlist for Puppy Mode (read-only planning). */
export const GUARD_PUPPY_ALLOWED_TOOLS = readPantrySetting<string[]>(
  "guard.puppyAllowedTools",
  ["read", "ls", "find", "grep", "questionnaire", "bash"],
);

/** Keyboard shortcut to enter Dragon Mode. */
export const GUARD_DRAGON_KEY = readPantryKey("guard.dragonKey", "ctrl+alt+d");

/** Keyboard shortcut to enter Puppy Mode. */
export const GUARD_PUPPY_KEY = readPantryKey("guard.puppyKey", "ctrl+alt+p");

/** Keyboard shortcut to enter Dog Mode. */
export const GUARD_DOG_KEY = readPantryKey("guard.dogKey", "ctrl+alt+n");

// ── Mutable Runtime Settings ──
// Initialized from settings.json, updatable at runtime via the guard panel.
// Use getter/setter functions for safe cross-module access under jiti.

let _autoDetect = readPantrySetting<boolean>("guard.autoDetect", true);
let _complexityThreshold = readPantrySetting<number>(
  "guard.complexityThreshold",
  4,
);
let _llmSummaries = readPantrySetting<boolean>("guard.llmSummaries", true);

/** Whether to auto-detect complex prompts and switch to Puppy Mode. */
export function getAutoDetect(): boolean {
  return _autoDetect;
}
export function setAutoDetect(v: boolean): void {
  _autoDetect = v;
}

/** Complexity score threshold for auto-plan detection (higher = less sensitive). */
export function getComplexityThreshold(): number {
  return _complexityThreshold;
}
export function setComplexityThreshold(v: number): void {
  _complexityThreshold = v;
}

/** Whether to use LLM (Haiku) for tool call summaries in permission dialogs. */
export function getLlmSummaries(): boolean {
  return _llmSummaries;
}
export function setLlmSummaries(v: boolean): void {
  _llmSummaries = v;
}

/** Keyboard shortcut to toggle the Dragon Guard panel. */
export const GUARD_PANEL_KEY = readPantryKey("guard.panelKey", "alt+g");

// ── Derived Sets ──

/** Tools always allowed in Dog Mode without prompting. */
export const DOG_MODE_ALLOWED_TOOLS = new Set<string>(GUARD_DOG_ALLOWED_TOOLS);

/** Tools allowed by default in Puppy Mode (bash gets extra safe-command checks). */
export const PUPPY_MODE_DEFAULT_ALLOWED_TOOLS = new Set<string>(
  GUARD_PUPPY_ALLOWED_TOOLS,
);

// ── Project Settings Writer ──

export { writeProjectPantrySetting as writeProjectSetting };
