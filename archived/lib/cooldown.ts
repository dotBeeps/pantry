/**
 * cooldown.ts — Generic timed exclusion tracker.
 *
 * Useful for rate limiting, circuit breaking, retry backoff,
 * or any pattern where a key should be excluded for a duration.
 */

/** A timed exclusion map — keys are excluded until their cooldown expires. */
export class CooldownTracker {
	private entries = new Map<string, number>();

	/** Check if a key is currently on cooldown. Auto-cleans expired entries. */
	isActive(key: string): boolean {
		const until = this.entries.get(key);
		if (until === undefined) return false;
		if (Date.now() >= until) {
			this.entries.delete(key);
			return false;
		}
		return true;
	}

	/** Set a cooldown for a key (absolute timestamp). */
	setUntil(key: string, untilMs: number): void {
		this.entries.set(key, untilMs);
	}

	/** Set a cooldown for a key (relative duration from now). */
	set(key: string, durationMs: number): void {
		this.entries.set(key, Date.now() + durationMs);
	}

	/** Remove a cooldown early. */
	clear(key: string): void {
		this.entries.delete(key);
	}

	/** Remove all cooldowns. */
	clearAll(): void {
		this.entries.clear();
	}

	/** Get all currently active (non-expired) keys. */
	activeKeys(): string[] {
		const now = Date.now();
		const active: string[] = [];
		for (const [key, until] of this.entries) {
			if (until > now) active.push(key);
			else this.entries.delete(key);
		}
		return active;
	}
}
