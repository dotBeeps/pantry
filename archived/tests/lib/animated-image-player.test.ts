/**
 * Unit tests for berrygems/lib/animated-image-player.ts
 *
 * Coverage: state machinery reachable without the kitty transport —
 * construction defaults, setSpeed() clamping, isReversed()/isPlaying() getters,
 * setOnFrame() assignment. Player.play()/step()/transmit() all hit
 * process.stdout via AnimatedImage.transmit → transmitFrame, so they're
 * covered only indirectly through TEST-03 extension integration.
 * NOT covered here: play(), pause(), toggle(), step(), reverse(), the
 * setInterval-driven auto-advance loop, dispose() (writes a kitty protocol
 * delete sequence to stdout).
 * See 02-CONTEXT.md §D-07.
 */
import { describe, it, expect } from "vitest";
import { AnimatedImagePlayer } from "../../lib/animated-image-player.ts";
import type { ImageFrames } from "../../lib/animated-image.ts";

// Minimal fake ImageFrames — dimensions here bypass pi-tui cell math because
// calculateImageCells is invoked in the ctor. We keep sizes tiny so cols/rows
// are bounded by the passed max and don't depend on the terminal.
const FRAMES: ImageFrames = {
  frames: [
    "ZmFrZS1mcmFtZS0x", // "fake-frame-1" b64
    "ZmFrZS1mcmFtZS0y",
  ],
  delays: [80, 80],
  widthPx: 32,
  heightPx: 32,
};

describe("lib/animated-image-player — defaults + simple getters", () => {
  it("constructs with isPlaying()=false and isReversed()=false", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    expect(p.isPlaying()).toBe(false);
    expect(p.isReversed()).toBe(false);
    expect(p.getSpeed()).toBe(1);
    expect(p.isDisposed()).toBe(false);
  });

  it("setSpeed() clamps into [0.1, 10.0]", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    p.setSpeed(0.01);
    expect(p.getSpeed()).toBe(0.1);
    p.setSpeed(99);
    expect(p.getSpeed()).toBe(10);
    p.setSpeed(2);
    expect(p.getSpeed()).toBe(2);
  });

  it("setOnFrame(null) accepts a null callback without throwing", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    expect(() => p.setOnFrame(null)).not.toThrow();
  });

  it("frameCount reflects the number of input frames", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    expect(p.frameCount).toBe(FRAMES.frames.length);
  });

  it("isAnimated() returns true for multi-frame input", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    expect(p.isAnimated()).toBe(true);
  });

  it("advance() and retreat() wrap around the frame index", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    expect(p.getCurrentFrame()).toBe(0);
    p.advance();
    expect(p.getCurrentFrame()).toBe(1);
    p.advance();
    expect(p.getCurrentFrame()).toBe(0); // wrapped
    p.retreat();
    expect(p.getCurrentFrame()).toBe(1); // wrapped backwards
  });

  it("seekTo() clamps out-of-range values into [0, frameCount-1]", () => {
    const p = new AnimatedImagePlayer(FRAMES, { maxCols: 4, maxRows: 4 });
    p.seekTo(99);
    expect(p.getCurrentFrame()).toBe(FRAMES.frames.length - 1);
    p.seekTo(-5);
    expect(p.getCurrentFrame()).toBe(0);
  });
});
