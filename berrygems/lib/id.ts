/**
 * Shared ID generation utilities for pantry extensions.
 * Standardizes on crypto.randomUUID() across the codebase.
 */
import { randomUUID } from "node:crypto";

/** Generate a globally unique ID (UUID v4). */
export function generateId(): string {
  return randomUUID();
}

/** Generate a short unique ID (8 chars, suitable for display/logging). */
export function generateShortId(): string {
  return randomUUID().slice(0, 8);
}

/** Generate a prefixed ID for a specific domain (e.g., "ally-a1b2c3d4"). */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${generateShortId()}`;
}
