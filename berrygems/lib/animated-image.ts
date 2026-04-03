/**
 * AnimatedImage — Kitty terminal protocol for rendering animated images.
 *
 * Generic, reusable image rendering via Kitty's Unicode placeholder protocol.
 * No opinion about where images come from — just transmits frames and builds
 * placeholder characters for compositor-safe overlay rendering.
 *
 * A small dog and a large dragon made this together.
 */

import { calculateImageRows, getCellDimensions, getGifDimensions } from "@mariozechner/pi-tui";

// ── Types ──

/** Decoded image frames ready for terminal rendering. */
export interface ImageFrames {
	frames: string[];   // base64 PNG per frame
	delays: number[];   // ms per frame
	widthPx: number;
	heightPx: number;
}

/** Configuration for image display size. */
export interface ImageSizeOptions {
	maxCols: number;
	maxRows: number;
}

/** Named image sizes — maps to max cell dimensions [cols, rows]. */
export const IMAGE_SIZES: Record<string, [number, number]> = {
	tiny:   [8,  4],
	small:  [12, 6],
	medium: [16, 8],
	large:  [22, 11],
	huge:   [30, 15],
};

export const DEFAULT_IMAGE_SIZE: [number, number] = [16, 8];

/** Resolve a named size string to [cols, rows], with fallback. */
export function resolveImageSize(size?: string): [number, number] {
	return IMAGE_SIZES[size ?? "medium"] ?? DEFAULT_IMAGE_SIZE;
}

// ── Kitty Unicode Placeholder Protocol ──
// U+10EEEE is Kitty's designated placeholder character.
// Combined with row/column diacritics, it tells Kitty where to render a virtual image.
// See: https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders

const PLACEHOLDER_CHAR = "\u{10EEEE}";
const DIACRITICS = [
	0x0305, 0x030D, 0x030E, 0x0310, 0x0312, 0x033D, 0x033E, 0x033F,
	0x0346, 0x034A, 0x034B, 0x034C, 0x0350, 0x0351, 0x0352, 0x0357,
	0x035B, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
	0x036A, 0x036B, 0x036C, 0x036D, 0x036E, 0x036F, 0x0483, 0x0484,
	0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597,
	0x0598, 0x0599, 0x059C, 0x059D, 0x059E, 0x059F, 0x05A0,
];

// ── ID Allocation ──
// Sequential IDs 1–200 for 256-color fg encoding.
// Wraps around — fine for typical usage (< 200 concurrent images).
let nextImageId = 1;

/** Allocate a unique image ID for Kitty virtual placement. */
export function allocateImageId(): number {
	const id = nextImageId;
	nextImageId = (nextImageId % 200) + 1;
	return id;
}

// ── Kitty Protocol Primitives ──

/**
 * Transmit a single PNG frame to Kitty's memory as a virtual placement.
 * Uses U=1 for Unicode placeholder display, q=2 to suppress responses.
 * The image is NOT rendered at cursor position — it only appears where
 * placeholder characters with matching foreground color exist.
 *
 * Written as a single process.stdout.write() to minimize interleave risk
 * with the TUI's own output buffer.
 */
export function transmitFrame(imageId: number, base64Data: string, cols: number, rows: number): void {
	const CHUNK = 4096;
	const params = `a=T,U=1,f=100,q=2,i=${imageId},c=${cols},r=${rows}`;
	let buf: string;

	if (base64Data.length <= CHUNK) {
		buf = `\x1b_G${params};${base64Data}\x1b\\`;
	} else {
		const parts: string[] = [];
		let offset = 0;
		let first = true;
		while (offset < base64Data.length) {
			const chunk = base64Data.slice(offset, offset + CHUNK);
			const isLast = offset + CHUNK >= base64Data.length;
			if (first) {
				parts.push(`\x1b_G${params},m=1;${chunk}\x1b\\`);
				first = false;
			} else if (isLast) {
				parts.push(`\x1b_Gm=0;${chunk}\x1b\\`);
			} else {
				parts.push(`\x1b_Gm=1;${chunk}\x1b\\`);
			}
			offset += CHUNK;
		}
		buf = parts.join("");
	}

	process.stdout.write(buf);
}

/** Delete a Kitty image by ID, freeing memory. */
export function deleteKittyImage(imageId: number): void {
	process.stdout.write(`\x1b_Ga=d,d=I,i=${imageId}\x1b\\`);
}

/**
 * Build Unicode placeholder lines for a virtual Kitty image.
 * Each grapheme cluster is U+10EEEE + row diacritic + column diacritic.
 * The foreground color encodes the image ID (256-color mode for IDs ≤ 255).
 * visibleWidth() correctly measures each cluster as width 1.
 * Intl.Segmenter keeps clusters intact during compositor slicing.
 */
export function buildPlaceholderLines(imageId: number, cols: number, rows: number): string[] {
	const fgSet = imageId <= 255
		? `\x1b[38;5;${imageId}m`
		: `\x1b[38;2;${imageId & 0xFF};${(imageId >> 8) & 0xFF};${(imageId >> 16) & 0xFF}m`;
	const fgReset = "\x1b[39m";
	const lines: string[] = [];
	for (let row = 0; row < rows; row++) {
		let line = fgSet;
		for (let col = 0; col < cols; col++) {
			line += PLACEHOLDER_CHAR
				+ String.fromCodePoint(DIACRITICS[row] ?? DIACRITICS[0]!)
				+ String.fromCodePoint(DIACRITICS[col] ?? DIACRITICS[0]!);
		}
		line += fgReset;
		lines.push(line);
	}
	return lines;
}

// ── Dimension Calculation ──

/**
 * Calculate cell dimensions (cols × rows) for an image, respecting max bounds.
 * Uses the terminal's actual cell pixel size for accurate aspect ratio.
 */
export function calculateImageCells(
	imageData: ImageFrames,
	maxCols: number,
	maxRows: number,
): { cols: number; rows: number } {
	const cellDims = getCellDimensions();
	const cols = Math.min(maxCols, Math.max(2, Math.floor(imageData.widthPx / cellDims.widthPx)));
	const rows = Math.min(maxRows, Math.max(2, calculateImageRows(
		{ widthPx: imageData.widthPx, heightPx: imageData.heightPx }, cols, cellDims,
	)));
	return { cols, rows };
}

/**
 * Extract pixel dimensions from a base64-encoded GIF buffer.
 * Convenience re-export of pi-tui's getGifDimensions.
 */
export function getImageDimensions(base64Buffer: string): { widthPx: number; heightPx: number } | null {
	return getGifDimensions(base64Buffer);
}

// ── AnimatedImage ──

export const DEFAULT_FRAME_DELAY_MS = 80;
export const MIN_FRAME_DELAY_MS = 50;

/**
 * A terminal-rendered animated image using Kitty's virtual placement protocol.
 *
 * Handles:
 * - Kitty image ID allocation and lifecycle
 * - Frame transmission to terminal memory
 * - Placeholder line generation for compositor-safe rendering
 * - Resource cleanup (Kitty memory + intervals)
 *
 * Does NOT handle: where images come from, playback controls, or UI integration.
 * For playback controls, see AnimatedImagePlayer.
 */
export class AnimatedImage {
	readonly imageId: number;
	readonly cols: number;
	readonly rows: number;
	readonly frameCount: number;

	protected imageData: ImageFrames;
	protected currentFrame = 0;
	protected disposed = false;

	constructor(imageData: ImageFrames, options: ImageSizeOptions) {
		this.imageData = imageData;
		this.imageId = allocateImageId();
		const dims = calculateImageCells(imageData, options.maxCols, options.maxRows);
		this.cols = dims.cols;
		this.rows = dims.rows;
		this.frameCount = imageData.frames.length;
	}

	/** Transmit the current frame to Kitty's memory. */
	transmit(): void {
		if (this.disposed) return;
		transmitFrame(this.imageId, this.imageData.frames[this.currentFrame]!, this.cols, this.rows);
	}

	/** Advance to the next frame (wraps around). Returns the new frame index. */
	advance(): number {
		this.currentFrame = (this.currentFrame + 1) % this.frameCount;
		return this.currentFrame;
	}

	/** Retreat to the previous frame (wraps around). Returns the new frame index. */
	retreat(): number {
		this.currentFrame = (this.currentFrame - 1 + this.frameCount) % this.frameCount;
		return this.currentFrame;
	}

	/** Jump to a specific frame index. */
	seekTo(frame: number): void {
		this.currentFrame = Math.max(0, Math.min(frame, this.frameCount - 1));
	}

	/** Get the current frame index. */
	getCurrentFrame(): number {
		return this.currentFrame;
	}

	/** Get the delay (ms) for the current frame. */
	getCurrentDelay(): number {
		return Math.max(MIN_FRAME_DELAY_MS, this.imageData.delays[this.currentFrame] ?? DEFAULT_FRAME_DELAY_MS);
	}

	/** Get the average frame delay across all frames. */
	getAverageDelay(): number {
		if (this.imageData.delays.length === 0) return DEFAULT_FRAME_DELAY_MS;
		return Math.max(
			MIN_FRAME_DELAY_MS,
			this.imageData.delays.reduce((a, b) => a + b, 0) / this.imageData.delays.length,
		);
	}

	/** Build placeholder lines for rendering in a panel. */
	getPlaceholderLines(): string[] {
		return buildPlaceholderLines(this.imageId, this.cols, this.rows);
	}

	/** Whether this is a multi-frame animation (vs. a static image). */
	isAnimated(): boolean {
		return this.frameCount > 1;
	}

	/** Clean up Kitty memory. Call when done with the image. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		deleteKittyImage(this.imageId);
	}

	/** Whether this image has been disposed. */
	isDisposed(): boolean {
		return this.disposed;
	}
}
