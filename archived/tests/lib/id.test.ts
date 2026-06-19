/**
 * Unit tests for berrygems/lib/id.ts
 *
 * Coverage: pure ID generation — full.
 * NOT covered here: none (thin wrapper over crypto.randomUUID).
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import {
  generateId,
  generateShortId,
  generatePrefixedId,
} from "../../lib/id.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("lib/id", () => {
  it("generateId() returns a v4-shaped UUID string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id).toMatch(UUID_RE);
  });

  it("generateId() returns distinct values across calls", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  it("generateShortId() returns an 8-char hex slice", () => {
    const sid = generateShortId();
    expect(sid).toMatch(/^[0-9a-f]{8}$/i);
  });

  it("generatePrefixedId(prefix) returns `${prefix}-<8hex>`", () => {
    const pid = generatePrefixedId("ally");
    expect(pid.startsWith("ally-")).toBe(true);
    expect(pid.slice(5)).toMatch(/^[0-9a-f]{8}$/i);
  });
});
