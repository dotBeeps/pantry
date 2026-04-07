/**
 * cascade.ts — Model fallback with provider cooldowns.
 *
 * FrugalGPT-style cascade: try cheapest model first, escalate on failure.
 * Tracks provider cooldowns to skip known-broken providers.
 */

import type { AlliesState, SpawnResult } from "./types.ts";

// Cooldown durations in ms
const COOLDOWN_RATE_LIMIT = 60_000;   // 60s for 429s
const COOLDOWN_SERVER = 30_000;       // 30s for 5xx
const COOLDOWN_AUTH = 300_000;        // 5min for auth failures

/**
 * Extract provider prefix from a model string.
 * e.g., "github-copilot/claude-haiku-4.5" → "github-copilot"
 */
function extractProvider(model: string): string {
	const slash = model.indexOf("/");
	return slash >= 0 ? model.slice(0, slash) : model;
}

/**
 * Check if a provider is currently on cooldown.
 */
export function isProviderCooledDown(state: AlliesState, model: string): boolean {
	const provider = extractProvider(model);
	const cooldownUntil = state.providerCooldowns.get(provider);
	if (!cooldownUntil) return false;
	if (Date.now() >= cooldownUntil) {
		state.providerCooldowns.delete(provider);
		return false;
	}
	return true;
}

/**
 * Record a provider failure and set appropriate cooldown.
 */
export function recordProviderFailure(state: AlliesState, model: string, error: string): void {
	const provider = extractProvider(model);
	let duration = COOLDOWN_SERVER;

	if (error.includes("429") || error.includes("rate limit") || error.includes("Rate limit")) {
		duration = COOLDOWN_RATE_LIMIT;
	} else if (error.includes("401") || error.includes("403") || error.includes("auth") || error.includes("API key")) {
		duration = COOLDOWN_AUTH;
	}

	state.providerCooldowns.set(provider, Date.now() + duration);
}

/**
 * Filter a model chain to skip cooled-down providers.
 * Returns models that are currently available.
 */
export function availableModels(state: AlliesState, models: string[]): string[] {
	return models.filter((m) => !isProviderCooledDown(state, m));
}

/**
 * Determine if a spawn failure is retryable (should cascade to next model).
 */
export function isRetryable(result: SpawnResult): boolean {
	if (result.retryable) return true;
	if (!result.error) return false;

	// Rate limits, server errors, and "not supported" are retryable
	const retryablePatterns = [
		"429", "rate limit", "Rate limit",
		"500", "502", "503", "504",
		"overloaded", "capacity",
		"not supported", "Not supported",
	];

	return retryablePatterns.some((p) => result.error!.includes(p));
}
