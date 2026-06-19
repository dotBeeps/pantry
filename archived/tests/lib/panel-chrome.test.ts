/**
 * Unit tests for berrygems/lib/panel-chrome.ts
 *
 * Coverage: pure helpers — repeatPattern() math, SKINS registry shape,
 * getSkin() lookup + fallback, listSkins() + setDefaultSkin() round-trip.
 * NOT covered here: getEdges / padContentLine / renderBorder / renderHeader /
 * renderFooter / wrapInChrome — these require a live pi Theme (fg/bg/bold)
 * injected from pi-coding-agent. Exercised indirectly via TEST-03 extension
 * integration tests that render panels through the real harness.
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import {
  SKINS,
  getSkin,
  listSkins,
  setDefaultSkin,
  repeatPattern,
} from "../../lib/panel-chrome.ts";

describe("lib/panel-chrome — repeatPattern", () => {
  it("returns '' for zero or negative width", () => {
    expect(repeatPattern("─", 0)).toBe("");
    expect(repeatPattern("─", -5)).toBe("");
  });

  it("pads an empty pattern with spaces to the requested width", () => {
    expect(repeatPattern("", 4)).toBe("    ");
  });

  it("repeats a single-char pattern exactly `width` times", () => {
    expect(repeatPattern("─", 5)).toBe("─────");
  });

  it("repeats a multi-char pattern and truncates to the requested width", () => {
    expect(repeatPattern("·~", 5)).toBe("·~·~·");
  });
});

describe("lib/panel-chrome — skin registry", () => {
  it("SKINS contains the canonical preset names", () => {
    for (const name of ["ember", "box", "castle", "sparkle", "ghost"]) {
      expect(name in SKINS).toBe(true);
    }
  });

  it("every SKINS entry has a name, top, bottom, left, right", () => {
    for (const [key, skin] of Object.entries(SKINS)) {
      expect(skin.name).toBe(key);
      expect(typeof skin.top).toBe("string");
      expect(typeof skin.bottom).toBe("string");
      expect(typeof skin.left).toBe("string");
      expect(typeof skin.right).toBe("string");
    }
  });

  it("getSkin() returns a known skin by name", () => {
    expect(getSkin("box").name).toBe("box");
  });

  it("getSkin() falls back to the default when name is unknown", () => {
    const fallback = getSkin("does-not-exist");
    // Default is "ember" unless changed; allow swap via setDefaultSkin.
    expect(typeof fallback.name).toBe("string");
    expect(fallback.name.length).toBeGreaterThan(0);
  });

  it("setDefaultSkin() changes the fallback returned by getSkin() without a name", () => {
    setDefaultSkin("castle");
    expect(getSkin().name).toBe("castle");
    setDefaultSkin("ember"); // restore
    expect(getSkin().name).toBe("ember");
  });

  it("listSkins() returns every registered skin name", () => {
    const listed = listSkins();
    expect(listed).toEqual(Object.keys(SKINS));
  });
});
