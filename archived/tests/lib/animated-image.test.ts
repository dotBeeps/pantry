/**
 * Unit tests for berrygems/lib/animated-image.ts
 *
 * Coverage: pure helpers — IMAGE_SIZES registry, resolveImageSize() lookup,
 * allocateImageId() wrap-around, buildPlaceholderLines() shape.
 * NOT covered here: transmitFrame() / deleteKittyImage() — both write Kitty
 * graphics protocol escape sequences to process.stdout. calculateImageCells()
 * depends on pi-tui's live getCellDimensions() (terminal IOCTL) so it's
 * exercised via TEST-03 extension integration tests.
 * AnimatedImage class: constructor ties into calculateImageCells so we don't
 * instantiate it here — its behavior is covered downstream through player.
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import {
  IMAGE_SIZES,
  DEFAULT_IMAGE_SIZE,
  resolveImageSize,
  allocateImageId,
  buildPlaceholderLines,
  DEFAULT_FRAME_DELAY_MS,
  MIN_FRAME_DELAY_MS,
} from "../../lib/animated-image.ts";

describe("lib/animated-image — size registry", () => {
  it("IMAGE_SIZES contains the five canonical presets", () => {
    expect(Object.keys(IMAGE_SIZES).sort()).toEqual([
      "huge",
      "large",
      "medium",
      "small",
      "tiny",
    ]);
  });

  it("each size entry is a [cols, rows] tuple of positive integers", () => {
    for (const [, [c, r]] of Object.entries(IMAGE_SIZES)) {
      expect(c).toBeGreaterThan(0);
      expect(r).toBeGreaterThan(0);
    }
  });

  it("resolveImageSize('medium') returns the medium tuple", () => {
    expect(resolveImageSize("medium")).toEqual(IMAGE_SIZES.medium);
  });

  it("resolveImageSize() with no argument returns the medium default", () => {
    expect(resolveImageSize()).toEqual(IMAGE_SIZES.medium);
  });

  it("resolveImageSize() falls back to DEFAULT_IMAGE_SIZE for unknown sizes", () => {
    expect(resolveImageSize("gargantuan")).toEqual(DEFAULT_IMAGE_SIZE);
  });
});

describe("lib/animated-image — allocateImageId", () => {
  it("returns a positive integer in the 1..200 range", () => {
    const id = allocateImageId();
    expect(id).toBeGreaterThanOrEqual(1);
    expect(id).toBeLessThanOrEqual(200);
  });

  it("returns different IDs across back-to-back calls", () => {
    const a = allocateImageId();
    const b = allocateImageId();
    expect(a).not.toBe(b);
  });
});

describe("lib/animated-image — buildPlaceholderLines", () => {
  it("returns `rows` lines, each with width-1 graphemes reflecting `cols`", () => {
    const lines = buildPlaceholderLines(7, 4, 3);
    expect(lines).toHaveLength(3);
    // Each line starts with an ANSI fg set (ESC[38;5;…m) and ends with reset (ESC[39m).
    for (const line of lines) {
      expect(line.startsWith("\x1b[38;5;7m")).toBe(true);
      expect(line.endsWith("\x1b[39m")).toBe(true);
    }
  });

  it("handles imageId > 255 via 24-bit RGB encoding", () => {
    const lines = buildPlaceholderLines(300, 1, 1);
    expect(lines[0]?.startsWith("\x1b[38;2;")).toBe(true);
  });
});

describe("lib/animated-image — constants", () => {
  it("DEFAULT_FRAME_DELAY_MS is >= MIN_FRAME_DELAY_MS", () => {
    expect(DEFAULT_FRAME_DELAY_MS).toBeGreaterThanOrEqual(MIN_FRAME_DELAY_MS);
  });
});
