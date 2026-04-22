/**
 * kitty-gif-renderer — Kitty Graphics Protocol image rendering for panels.
 *
 * Provides lifecycle management and float-merge utilities for embedding
 * animated images (GIFs, stickers) inside panel content. Protocol-specific:
 * requires a Kitty-compatible terminal. Graceful no-op if not loaded.
 *
 * Consumers access the API via globalThis — never import directly:
 *   const kitty = (globalThis as any)[Symbol.for("pantry.kitty")];
 *   if (kitty) { ... }
 *
 * Depends on: dragon-parchment (for requestRender).
 * Optional: panels that don't use images can run without this extension.
 *
 * A small dog and a large dragon made this together.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import {
  AnimatedImagePlayer,
  type ImageFrames,
  type ImageSizeOptions,
} from "../lib/animated-image-player.ts";

// ── Types ──

/** A loaded image ready to render. Returned by loadImage(). */
export interface LoadedImage {
  readonly player: AnimatedImagePlayer;
  /** Actual column width of the rendered image in terminal cells. */
  readonly cols: number;
  /** Actual row height of the rendered image in terminal cells. */
  readonly rows: number;
}

/**
 * Options for loadImage().
 * @param maxCols  Maximum column width (cells). Image scaled to fit.
 * @param maxRows  Maximum row height (cells). Image scaled to fit.
 * @param onReady  Called after the image is transmitted and ready to render.
 *                 Use to invalidate the panel and trigger a re-render.
 */
export interface LoadImageOpts extends ImageSizeOptions {
  onReady: () => void;
}

/**
 * One line's worth of float-merged content, as returned by FloatMerger.
 * Callers are responsible for adding their own left/right edge characters.
 */
export interface FloatLine {
  /** Raw content string for this line. May be empty string for flush rows. */
  content: string;
  /**
   * Kitty placeholder characters for this row of the image, or null if the
   * image has no more rows to render on this line. Append directly after
   * `content + " ".repeat(gap)`.
   */
  mascot: string | null;
  /** Number of gap spaces to insert between content and mascot. */
  gap: number;
}

/**
 * Stateful helper for merging a float image into panel lines one at a time.
 * Tracks which image row is next, calculates gap, and yields flush rows.
 *
 * Usage:
 *   const merger = kitty.createMerger(image, innerW);
 *   for (const line of myLines) {
 *     const fl = merger.nextLine(line);
 *     if (fl.mascot !== null) {
 *       output.push(leftEdge + fl.content + " ".repeat(fl.gap) + fl.mascot + rightEdge);
 *     } else {
 *       output.push(normalRender(fl.content));
 *     }
 *   }
 *   for (const fl of merger.flushLines()) {
 *     output.push(leftEdge + " ".repeat(fl.gap) + fl.mascot! + rightEdge);
 *   }
 */
export interface FloatMerger {
  /** Column width of the image (for pre-narrowing text before passing to nextLine). */
  readonly mascotWidth: number;
  /** Whether there are image rows remaining to render. */
  readonly hasMore: boolean;
  /** Process one content line, consuming the next image row if available. */
  nextLine(content: string): FloatLine;
  /** Return remaining image rows as flush lines (empty content, full-width gap). */
  flushLines(): FloatLine[];
}

const API_KEY = Symbol.for("pantry.kitty");

// ── Extension ──

export default function (pi: ExtensionAPI) {
  // ── Core functions ──

  /**
   * Wrap an ImageFrames payload in an AnimatedImagePlayer and start playback.
   * The returned LoadedImage is a thin handle — call disposeImage() when done.
   *
   * Uses setTimeout(0) to defer Kitty transmission out of the synchronous render
   * path, matching the pattern established in dragon-scroll and kobold-housekeeping.
   * The stale-reference guard (`if (player !== token)`) ensures disposal races
   * don't cause double-play.
   */
  function loadImage(frames: ImageFrames, opts: LoadImageOpts): LoadedImage {
    const player = new AnimatedImagePlayer(frames, {
      maxCols: opts.maxCols,
      maxRows: opts.maxRows,
    });
    const loaded: LoadedImage = {
      player,
      cols: player.cols,
      rows: player.rows,
    };

    // Defer transmission so we don't write to stdout mid-render.
    // Guard against stale refs from rapid open/close cycles.
    setTimeout(() => {
      if (player.isDisposed()) return;
      player.play(() => {
        if (player.isDisposed()) return;
        opts.onReady();
      });
    }, 0);

    return loaded;
  }

  /** Stop playback and free Kitty terminal memory for this image. */
  function disposeImage(image: LoadedImage): void {
    image.player.dispose();
  }

  /**
   * Create a FloatMerger for right-aligning an image alongside panel content.
   *
   * The merger tracks which image row is next and calculates the gap between
   * content and placeholder characters. Callers add their own edge chars.
   *
   * Text lines passed to nextLine() should already be width-narrowed to
   * (innerW - mascotWidth - 1) so they don't collide with the image column.
   */
  function createMerger(image: LoadedImage, innerW: number): FloatMerger {
    const mascotLines = image.player.getPlaceholderLines();
    let row = 0;

    return {
      get mascotWidth() {
        return image.cols;
      },
      get hasMore() {
        return row < mascotLines.length;
      },

      nextLine(content: string): FloatLine {
        if (row >= mascotLines.length) {
          return { content, mascot: null, gap: 0 };
        }
        const gap = Math.max(0, innerW - visibleWidth(content) - image.cols);
        return { content, mascot: mascotLines[row++]!, gap };
      },

      flushLines(): FloatLine[] {
        const result: FloatLine[] = [];
        while (row < mascotLines.length) {
          const gap = Math.max(0, innerW - image.cols);
          result.push({ content: "", mascot: mascotLines[row++]!, gap });
        }
        return result;
      },
    };
  }

  // ── Publish API ──

  const api = { loadImage, disposeImage, createMerger };
  (globalThis as any)[API_KEY] = api;

  // Clean up on session end — players hold Kitty terminal memory
  pi.on("session_shutdown" as any, async () => {
    // Individual panels own their images and dispose on close/session_switch.
    // This is a final sweep in case any leaked through.
    (globalThis as any)[API_KEY] = api; // keep API live for next session
  });
}
