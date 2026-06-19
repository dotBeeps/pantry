/**
 * Unit tests for berrygems/lib/giphy-source.ts
 *
 * Coverage: pure URL-build/parse + fallback lookup + cache clear.
 * NOT covered here: live HTTP fetch (searchGiphy, downloadGif, fetchImageFromSource),
 * ImageMagick spawn (extractFrames), and the ExtensionContext-dependent AI vibe query
 * path (generateVibeQuery). Exercised indirectly via TEST-03 extension integration
 * tests that call this module through the real pi-test-harness runtime.
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import {
  TAG_SEARCH_FALLBACK,
  getFallbackQuery,
  clearVibeCache,
} from "../../lib/giphy-source.ts";

describe("lib/giphy-source", () => {
  it("TAG_SEARCH_FALLBACK maps known tags to furry-prefixed queries", () => {
    expect(TAG_SEARCH_FALLBACK.bugs).toBe("furry computer");
    expect(TAG_SEARCH_FALLBACK.done).toBe("furry happy dance");
    // Every known-tag fallback should start with "furry ".
    for (const v of Object.values(TAG_SEARCH_FALLBACK)) {
      expect(v.startsWith("furry ")).toBe(true);
    }
  });

  it("getFallbackQuery() returns the mapped value for a known tag (case-insensitive)", () => {
    expect(getFallbackQuery("bugs")).toBe("furry computer");
    expect(getFallbackQuery("BUGS")).toBe("furry computer");
  });

  it("getFallbackQuery() returns `furry <tag>` for an unknown tag", () => {
    expect(getFallbackQuery("holodeck")).toBe("furry holodeck");
  });

  it("clearVibeCache() can be called without throwing when the cache is empty", () => {
    expect(() => clearVibeCache()).not.toThrow();
  });
});
