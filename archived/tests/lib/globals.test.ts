/**
 * Unit tests for berrygems/lib/globals.ts
 *
 * Coverage: full — registerGlobal/getGlobal round-trip, PANTRY_KEYS shape snapshot.
 * NOT covered here: none. This module is the reference test per D-08.
 */
import { describe, it, expect } from "vitest";
import { PANTRY_KEYS, registerGlobal, getGlobal } from "../../lib/globals.ts";

describe("lib/globals", () => {
  it("round-trips a value via registerGlobal → getGlobal", () => {
    const key = Symbol.for("pantry.test.roundtrip");
    const value = { hello: "world" };
    registerGlobal(key, value);
    expect(getGlobal<typeof value>(key)).toBe(value);
  });

  it("returns undefined (not throw) for unregistered keys", () => {
    const unknownKey = Symbol.for("pantry.test.never-registered");
    expect(getGlobal(unknownKey)).toBeUndefined();
  });

  it("PANTRY_KEYS contains exactly the five canonical keys", () => {
    expect(Object.keys(PANTRY_KEYS).sort()).toEqual([
      "breath",
      "imageFetch",
      "kitty",
      "lab",
      "parchment",
    ]);
  });

  it("each PANTRY_KEYS value is a Symbol.for('pantry.<name>')", () => {
    for (const [name, sym] of Object.entries(PANTRY_KEYS)) {
      expect(typeof sym).toBe("symbol");
      expect(sym).toBe(Symbol.for(`pantry.${name}`));
    }
  });
});
