/**
 * Unit tests for berrygems/lib/settings.ts
 *
 * Coverage: full fs coverage via os.tmpdir() per .claude/rules/testing.md — fs IS the surface.
 * NOT covered here: none (settings.ts does not make network calls or spawn processes).
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPantrySetting } from "../../lib/settings.ts";

const ORIGINAL_HOME = process.env.HOME;
const roots: string[] = [];

function makeHome(): string {
  const root = mkdtempSync(join(tmpdir(), "pantry-settings-"));
  roots.push(root);
  mkdirSync(join(root, ".pi", "agent"), { recursive: true });
  return root;
}

function writeGlobal(root: string, json: string): void {
  writeFileSync(join(root, ".pi", "agent", "settings.json"), json, "utf-8");
}

beforeEach(() => {
  // Neutralize HOME until each test sets its own.
  process.env.HOME = mkdtempSync(join(tmpdir(), "pantry-settings-empty-"));
  roots.push(process.env.HOME);
});

afterEach(() => {
  process.env.HOME = ORIGINAL_HOME;
});

afterAll(() => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("lib/settings — readPantrySetting", () => {
  it("reads a value from the forward pantry.* namespace via real fs", () => {
    const home = makeHome();
    writeGlobal(
      home,
      JSON.stringify({ pantry: { guard: { autoDetect: true } } }),
    );
    process.env.HOME = home;

    expect(readPantrySetting("guard.autoDetect", false)).toBe(true);
  });

  it("returns fallback when the settings file contains malformed JSON (does not throw)", () => {
    const home = makeHome();
    writeGlobal(home, "not-json{{");
    process.env.HOME = home;

    expect(() => readPantrySetting("guard.autoDetect", false)).not.toThrow();
    expect(readPantrySetting("guard.autoDetect", false)).toBe(false);
  });

  it("falls back to legacy dotsPiEnhancements.* keys when pantry.* is absent", () => {
    const home = makeHome();
    writeGlobal(
      home,
      JSON.stringify({ dotsPiEnhancements: { guardAutoDetect: true } }),
    );
    process.env.HOME = home;

    expect(readPantrySetting("guard.autoDetect", false)).toBe(true);
  });

  it("returns fallback on Zod schema mismatch (malformed type inside pantry.*) without throwing", () => {
    const home = makeHome();
    // guard.autoDetect is typed boolean in PantrySettingsSchema; a string fails safeParse.
    writeGlobal(
      home,
      JSON.stringify({ pantry: { guard: { autoDetect: "not-a-boolean" } } }),
    );
    process.env.HOME = home;

    expect(() => readPantrySetting("guard.autoDetect", false)).not.toThrow();
    expect(readPantrySetting("guard.autoDetect", false)).toBe(false);
  });

  it("reads dragon-musings refresh and phrase-pack settings", () => {
    const home = makeHome();
    writeGlobal(
      home,
      JSON.stringify({
        pantry: { musings: { refreshPrompts: 4, messageCount: 50 } },
      }),
    );
    process.env.HOME = home;

    expect(readPantrySetting("musings.refreshPrompts", 0)).toBe(4);
    expect(readPantrySetting("musings.messageCount", 0)).toBe(50);
  });

  it("returns fallback when the settings file does not exist", () => {
    const home = mkdtempSync(join(tmpdir(), "pantry-settings-missing-"));
    roots.push(home);
    process.env.HOME = home;

    expect(readPantrySetting("guard.autoDetect", true)).toBe(true);
    expect(readPantrySetting("musings.cycleMs", 2000)).toBe(2000);
  });
});
