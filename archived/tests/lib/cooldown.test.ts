/**
 * Unit tests for berrygems/lib/cooldown.ts
 *
 * Coverage: pure timestamp math via CooldownTracker — full.
 * NOT covered here: none (module is fully pure in-memory state).
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import { CooldownTracker } from "../../lib/cooldown.ts";

describe("lib/cooldown — CooldownTracker", () => {
  it("reports isActive=false for unknown keys", () => {
    const t = new CooldownTracker();
    expect(t.isActive("nope")).toBe(false);
  });

  it("reports isActive=true within the cooldown window", () => {
    const t = new CooldownTracker();
    t.set("k", 10_000);
    expect(t.isActive("k")).toBe(true);
  });

  it("reports isActive=false after setUntil with a past timestamp and cleans up", () => {
    const t = new CooldownTracker();
    t.setUntil("k", Date.now() - 1);
    expect(t.isActive("k")).toBe(false);
    // A second call should still be false (entry has been removed).
    expect(t.isActive("k")).toBe(false);
  });

  it("clear() removes a single key without touching others", () => {
    const t = new CooldownTracker();
    t.set("a", 10_000);
    t.set("b", 10_000);
    t.clear("a");
    expect(t.isActive("a")).toBe(false);
    expect(t.isActive("b")).toBe(true);
  });

  it("clearAll() removes every entry", () => {
    const t = new CooldownTracker();
    t.set("a", 10_000);
    t.set("b", 10_000);
    t.clearAll();
    expect(t.isActive("a")).toBe(false);
    expect(t.isActive("b")).toBe(false);
  });

  it("activeKeys() returns only currently-active keys and prunes expired ones", () => {
    const t = new CooldownTracker();
    t.set("alive", 10_000);
    t.setUntil("dead", Date.now() - 1);
    const keys = t.activeKeys();
    expect(keys).toContain("alive");
    expect(keys).not.toContain("dead");
  });
});
