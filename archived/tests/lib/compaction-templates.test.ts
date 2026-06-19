/**
 * Unit tests for berrygems/lib/compaction-templates.ts
 *
 * Coverage: pure template + prompt-builder functions — full.
 * NOT covered here: none (module is purely functional).
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import {
  STRATEGY_PRESETS,
  STRUCTURED_SUMMARY_TEMPLATE,
  formatStrategyInstructions,
  buildFirstCompactionPrompt,
  buildAnchoredUpdatePrompt,
  getStrategyById,
} from "../../lib/compaction-templates.ts";

describe("lib/compaction-templates", () => {
  it("STRATEGY_PRESETS includes the five expected presets", () => {
    const ids = STRATEGY_PRESETS.map((p) => p.id).sort();
    expect(ids).toEqual(["code", "debug", "default", "minimal", "task"]);
  });

  it("STRUCTURED_SUMMARY_TEMPLATE contains every required section heading", () => {
    for (const heading of [
      "## Session Intent",
      "## Files Modified",
      "## Files Read (Referenced)",
      "## Decisions Made",
      "## Approaches Ruled Out",
      "## Current State",
      "## User Constraints & Preferences",
      "## Next Steps",
      "## Key Errors (verbatim)",
    ]) {
      expect(STRUCTURED_SUMMARY_TEMPLATE).toContain(heading);
    }
  });

  it("getStrategyById() returns the matching preset by id", () => {
    expect(getStrategyById("code").id).toBe("code");
    expect(getStrategyById("debug").label).toBe("Debug");
  });

  it("getStrategyById() falls back to the default preset for unknown ids", () => {
    expect(getStrategyById("does-not-exist").id).toBe("default");
  });

  it("formatStrategyInstructions() returns '' for the default (empty instructions) preset", () => {
    expect(formatStrategyInstructions("default")).toBe("");
  });

  it("formatStrategyInstructions() wraps preset instructions in a STRATEGY FOCUS block", () => {
    const out = formatStrategyInstructions("code");
    expect(out.startsWith("STRATEGY FOCUS:\n")).toBe(true);
    expect(out).toContain("code");
  });

  it("formatStrategyInstructions(raw=true) accepts custom instruction text", () => {
    const out = formatStrategyInstructions("custom vibe", true);
    expect(out).toContain("custom vibe");
  });

  it("buildFirstCompactionPrompt() embeds the conversation and the template headings", () => {
    const prompt = buildFirstCompactionPrompt(
      "User: hello\nAssistant: hi",
      "default",
    );
    expect(prompt).toContain("User: hello");
    expect(prompt).toContain("## Session Intent");
  });

  it("buildAnchoredUpdatePrompt() embeds both previous summary and new messages", () => {
    const prompt = buildAnchoredUpdatePrompt(
      "## Session Intent\nDoing work.",
      "User: status?\nAssistant: on track.",
      "default",
    );
    expect(prompt).toContain("Doing work.");
    expect(prompt).toContain("status?");
    expect(prompt).toContain("## Session Intent");
  });
});
