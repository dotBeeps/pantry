/**
 * Pantry Settings — shared settings reader for all berrygems extensions.
 *
 * Reads from the "pantry" namespace in ~/.pi/agent/settings.json with tiered nesting:
 *   pantry.panels.focusKey
 *   pantry.guard.autoDetect
 *   pantry.digestion.triggerMode
 *   pantry.todos.gifSize
 *   pantry.contributor.name
 *   pantry.tone.default          ← future (spec §13)
 *
 * Migration: falls back to legacy "dotsPiEnhancements" flat keys when the new
 * tiered key isn't found, so existing settings.json files keep working.
 *
 * A small dog and a large dragon made this together.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ── Constants ──

const PANTRY_NAMESPACE = "pantry";
const LEGACY_NAMESPACE = "dotsPiEnhancements";

// ── Paths ──

function getGlobalSettingsPath(): string {
  return join(
    process.env.HOME || process.env.USERPROFILE || homedir(),
    ".pi",
    "agent",
    "settings.json",
  );
}

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}

// ── Internal Helpers ──

function parseJsonFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Walk a dotted path into a nested object.
 * e.g. resolve({ guard: { autoDetect: true } }, "guard.autoDetect") → true
 */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── Legacy Key Mapping ──

/**
 * Map from new tiered paths to legacy flat keys.
 * Only populated for keys that existed under dotsPiEnhancements.
 */
const LEGACY_MAP: Record<string, string> = {
  // panels
  "panels.keybinds.close": "panelCloseKey",
  "panels.keybinds.unfocus": "panelUnfocusKey",
  // guard
  "guard.dogAllowedTools": "guardDogAllowedTools",
  "guard.puppyAllowedTools": "guardPuppyAllowedTools",
  "guard.dragonKey": "guardDragonKey",
  "guard.puppyKey": "guardPuppyKey",
  "guard.dogKey": "guardDogKey",
  "guard.panelKey": "guardPanelKey",
  "guard.autoDetect": "guardAutoDetect",
  "guard.complexityThreshold": "guardComplexityThreshold",
  "guard.llmSummaries": "guardLlmSummaries",
  // contributor
  "contributor.name": "contributor.name",
  "contributor.email": "contributor.email",
  "contributor.trailerFormat": "contributor.trailerFormat",
  "contributor.transparencyFormat": "contributor.transparencyFormat",
  "contributor.includeModel": "contributor.includeModel",
  // todos
  "todos.gifVibePrompt": "gifVibePrompt",
  "todos.gifRating": "gifRating",
  // digestion
  "digestion.triggerMode": "digestionTriggerMode",
  "digestion.triggerPercentage": "digestionTriggerPercentage",
  "digestion.triggerFixed": "digestionTriggerFixed",
  "digestion.strategy": "digestionStrategy",
  "digestion.copyGlobalKey": "digestionCopyGlobalKey",
  // writing style (legacy → tone)
  "tone.default": "writingStyle.default",
  "tone.overrides": "writingStyle.overrides",
};

// ── Public API ──

/**
 * Read a setting from the pantry namespace using a dotted path.
 *
 * Resolution order:
 * 1. pantry.<path> in global settings (tiered)
 * 2. dotsPiEnhancements.<legacyKey> in global settings (flat, migration)
 * 3. fallback value
 *
 * @example
 * readPantrySetting("guard.autoDetect", true)
 * readPantrySetting("panels.focusKey", "alt+t")
 * readPantrySetting("contributor.name", "Ember 🐉")
 */
export function readPantrySetting<T>(path: string, fallback: T): T {
  const settings = parseJsonFile(getGlobalSettingsPath());
  if (!settings) return fallback;

  // Try new tiered namespace first
  const pantry = settings[PANTRY_NAMESPACE];
  if (typeof pantry === "object" && pantry !== null) {
    const value = resolvePath(pantry as Record<string, unknown>, path);
    if (value !== undefined) return value as T;
  }

  // Fall back to legacy flat namespace
  const legacy = settings[LEGACY_NAMESPACE];
  if (typeof legacy === "object" && legacy !== null) {
    const legacyKey = LEGACY_MAP[path];
    if (legacyKey) {
      // Legacy key might itself be dotted (e.g. "contributor.name")
      const value = resolvePath(legacy as Record<string, unknown>, legacyKey);
      if (value !== undefined) return value as T;
    }
  }

  return fallback;
}

/**
 * Read a project-scoped setting. Checks project .pi/settings.json first,
 * then falls back to global via readPantrySetting.
 */
export function readProjectPantrySetting<T>(
  cwd: string,
  path: string,
  fallback: T,
): T {
  const settings = parseJsonFile(getProjectSettingsPath(cwd));
  if (settings) {
    const pantry = settings[PANTRY_NAMESPACE];
    if (typeof pantry === "object" && pantry !== null) {
      const value = resolvePath(pantry as Record<string, unknown>, path);
      if (value !== undefined) return value as T;
    }
    // Legacy fallback for project settings too
    const legacy = settings[LEGACY_NAMESPACE];
    if (typeof legacy === "object" && legacy !== null) {
      const legacyKey = LEGACY_MAP[path];
      if (legacyKey) {
        const value = resolvePath(legacy as Record<string, unknown>, legacyKey);
        if (value !== undefined) return value as T;
      }
    }
  }

  // Fall through to global
  return readPantrySetting(path, fallback);
}

/**
 * Write a setting to the project's .pi/settings.json under pantry namespace.
 * Creates tiered structure. Creates file and parent directories if needed.
 */
export function writeProjectPantrySetting(
  cwd: string,
  path: string,
  value: unknown,
): boolean {
  try {
    const settingsPath = getProjectSettingsPath(cwd);
    let fileSettings = parseJsonFile(settingsPath) ?? {};

    // Ensure pantry namespace exists
    let pantry = fileSettings[PANTRY_NAMESPACE];
    if (typeof pantry !== "object" || pantry === null) {
      pantry = {};
    }

    // Set value at path
    const parts = path.split(".");
    let target = pantry as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (typeof target[part] !== "object" || target[part] === null) {
        target[part] = {};
      }
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]!] = value;

    fileSettings[PANTRY_NAMESPACE] = pantry;

    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(fileSettings, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

// ── Utility ──

/**
 * Read a keyboard shortcut setting, typed as KeyId for matchesKey() compatibility.
 * Wrapper around readPantrySetting that avoids string → KeyId cast noise everywhere.
 */
export function readPantryKey(path: string, fallback: string): any {
  return readPantrySetting<string>(path, fallback);
}

/** Turn a matchesKey-style code like "alt+t" into a display label like "Alt+T". */
export function keyLabel(code: string): string {
  return code
    .split("+")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("+");
}
