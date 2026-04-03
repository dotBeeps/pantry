/**
 * AnimatedImagePlayer — Playback controls for AnimatedImage.
 *
 * Adds play/pause/reverse/speed/step on top of AnimatedImage's
 * Kitty protocol rendering. Manages its own setInterval for auto-advance.
 *
 * Usage:
 *   const player = new AnimatedImagePlayer(frames, { maxCols: 16, maxRows: 8 });
 *   player.play(() => myPanel.invalidate());  // auto-advance with render callback
 *   player.pause();
 *   player.reverse();
 *   player.setSpeed(2.0);  // double speed
 *   player.step(1);        // manual single-frame advance
 *   player.dispose();      // cleanup
 *
 * A small dog and a large dragon made this together.
 */

import { AnimatedImage, type ImageFrames, type ImageSizeOptions } from "./animated-image.ts";

/**
 * AnimatedImagePlayer — an AnimatedImage with playback controls.
 *
 * Extends AnimatedImage with:
 * - play/pause auto-advance via setInterval
 * - reverse playback direction
 * - speed multiplier
 * - manual frame stepping
 * - onFrame callback for triggering panel re-renders
 */
export class AnimatedImagePlayer extends AnimatedImage {
	private interval: ReturnType<typeof setInterval> | null = null;
	private reversed = false;
	private speed = 1.0;
	private onFrame: (() => void) | null = null;
	private playing = false;

	constructor(imageData: ImageFrames, options: ImageSizeOptions) {
		super(imageData, options);
	}

	/**
	 * Start auto-advancing frames. Transmits each frame to Kitty on tick.
	 * @param onFrame Optional callback fired after each frame advance — use to invalidate/re-render panels.
	 */
	play(onFrame?: () => void): void {
		if (this.isDisposed() || !this.isAnimated()) return;
		if (onFrame) this.onFrame = onFrame;

		this.stopInterval();
		this.playing = true;

		// Transmit initial frame immediately
		this.transmit();

		const delay = this.getAverageDelay() / this.speed;
		this.interval = setInterval(() => {
			if (this.isDisposed()) { this.stopInterval(); return; }
			if (this.reversed) {
				this.retreat();
			} else {
				this.advance();
			}
			this.transmit();
			this.onFrame?.();
		}, delay);
	}

	/** Pause auto-advance. Current frame stays displayed. */
	pause(): void {
		this.stopInterval();
		this.playing = false;
	}

	/** Toggle between playing and paused. */
	toggle(onFrame?: () => void): void {
		if (this.playing) {
			this.pause();
		} else {
			this.play(onFrame);
		}
	}

	/** Toggle playback direction. If playing, restarts interval with new direction. */
	reverse(): void {
		this.reversed = !this.reversed;
		if (this.playing) {
			// Restart interval to apply new direction immediately
			this.play();
		}
	}

	/**
	 * Set playback speed multiplier. 1.0 = normal, 2.0 = double, 0.5 = half.
	 * If playing, restarts interval with new speed.
	 */
	setSpeed(multiplier: number): void {
		this.speed = Math.max(0.1, Math.min(10.0, multiplier));
		if (this.playing) {
			// Restart interval to apply new speed immediately
			this.play();
		}
	}

	/**
	 * Manually step N frames forward (positive) or backward (negative).
	 * Transmits the resulting frame. Does not affect play/pause state.
	 */
	step(n: number): void {
		if (this.isDisposed()) return;
		const dir = n > 0 ? 1 : -1;
		const count = Math.abs(n);
		for (let i = 0; i < count; i++) {
			if (dir > 0) this.advance();
			else this.retreat();
		}
		this.transmit();
		this.onFrame?.();
	}

	/** Get current playback speed multiplier. */
	getSpeed(): number {
		return this.speed;
	}

	/** Whether playback is currently running. */
	isPlaying(): boolean {
		return this.playing;
	}

	/** Whether playback direction is reversed. */
	isReversed(): boolean {
		return this.reversed;
	}

	/** Set the onFrame callback (fired after each auto-advance). */
	setOnFrame(callback: (() => void) | null): void {
		this.onFrame = callback;
	}

	/** Clean up interval + Kitty memory. */
	override dispose(): void {
		this.stopInterval();
		this.playing = false;
		super.dispose();
	}

	private stopInterval(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}
}

// Re-export core types for convenience
export type { ImageFrames, ImageSizeOptions } from "./animated-image.ts";
export { IMAGE_SIZES, resolveImageSize, DEFAULT_IMAGE_SIZE } from "./animated-image.ts";
