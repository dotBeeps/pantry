/**
 * Cross-extension globalThis registry.
 *
 * Pi loads each extension in its own jiti module context, so extensions cannot
 * import each other directly. They publish APIs onto `globalThis` under
 * well-known `Symbol.for` keys instead.
 *
 * This module centralizes the canonical key list and provides typed
 * `registerGlobal` / `getGlobal` helpers so call sites don't need `as any`.
 */

// ── Keys ──

export const PANTRY_KEYS = {
  parchment: Symbol.for("pantry.parchment"),
  kitty: Symbol.for("pantry.kitty"),
  breath: Symbol.for("pantry.breath"),
  imageFetch: Symbol.for("pantry.imageFetch"),
  lab: Symbol.for("pantry.lab"),
} as const;

// ── Typed Registry ──

export function registerGlobal<T>(key: symbol, api: T): void {
  (globalThis as unknown as Record<symbol, T>)[key] = api;
}

export function getGlobal<T>(key: symbol): T | undefined {
  return (globalThis as unknown as Record<symbol, T | undefined>)[key];
}
