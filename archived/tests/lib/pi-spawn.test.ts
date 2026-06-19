/**
 * Unit tests for berrygems/lib/pi-spawn.ts
 *
 * Coverage: pure parseSpawnOutput() NDJSON parser + findPiBinary() fallback
 * (exercised by temporarily neutering $HOME so the ~/.npm/bin/pi check misses).
 * NOT covered here: spawnPi's child_process.spawn call, timeout/abort wiring,
 * temp-file system-prompt injection — those require a real pi binary and
 * are covered indirectly by TEST-03 extension integration tests.
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import { parseSpawnOutput, findPiBinary } from "../../lib/pi-spawn.ts";

describe("lib/pi-spawn — parseSpawnOutput", () => {
  it("returns '' for empty input", () => {
    expect(parseSpawnOutput("")).toBe("");
  });

  it("extracts text from a message_end event's content blocks", () => {
    const line = JSON.stringify({
      type: "message_end",
      message: { content: [{ type: "text", text: "hello world" }] },
    });
    expect(parseSpawnOutput(line)).toBe("hello world");
  });

  it("extracts text from a top-level response field", () => {
    const line = JSON.stringify({ response: "top-level answer" });
    expect(parseSpawnOutput(line)).toBe("top-level answer");
  });

  it("passes through non-JSON raw text lines", () => {
    const raw = "not-json line 1\nnot-json line 2";
    expect(parseSpawnOutput(raw)).toContain("not-json line 1");
    expect(parseSpawnOutput(raw)).toContain("not-json line 2");
  });

  it("prefers a later message_end over an earlier one (last write wins)", () => {
    const raw = [
      JSON.stringify({
        type: "message_end",
        message: { content: [{ type: "text", text: "first" }] },
      }),
      JSON.stringify({
        type: "message_end",
        message: { content: [{ type: "text", text: "second" }] },
      }),
    ].join("\n");
    expect(parseSpawnOutput(raw)).toBe("second");
  });
});

describe("lib/pi-spawn — findPiBinary", () => {
  it("returns a non-empty string path", () => {
    const p = findPiBinary();
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
  });
});
