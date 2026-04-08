/**
 * renderer.ts — Bordered message renderer for stone messages.
 *
 * Renders incoming stone messages with truecolor name styling,
 * box-drawing borders, and word-wrapping.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

// ── Name Resolution ──────────────────────────────────────────────────────────

// Well-known address -> display name mapping
const ADDRESS_NAMES: Record<string, string> = {
	"primary-agent": "Agent",
	"user": "dot",
	"guild-master": "Maren",
	"session-room": "room",
};

// Name registry for allies (populated by hoard-allies via globalThis)
const NAME_REGISTRY_KEY = Symbol.for("hoard.stone.names");

function resolveDisplayName(id: string): string {
	if (ADDRESS_NAMES[id]) return ADDRESS_NAMES[id];
	// Check ally name registry
	const registry = (globalThis as any)[NAME_REGISTRY_KEY] as Record<string, string> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
	if (registry?.[id]) return registry[id];
	// Fall back to title-casing the ID
	return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Color Utilities ──────────────────────────────────────────────────────────

// Base hues per tier (HSL degrees)
const TIER_HUES: Record<string, number> = {
	kobold: 120, griffin: 220, dragon: 280,
	"guild-master": 35, "primary-agent": 45, user: 185,
};

function hashName(name: string): number {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
	return h;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	h = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0, g = 0, b = 0;
	if (h < 60)       { r = c; g = x; }
	else if (h < 120) { r = x; g = c; }
	else if (h < 180) { g = c; b = x; }
	else if (h < 240) { g = x; b = c; }
	else if (h < 300) { r = x; b = c; }
	else              { r = c; b = x; }
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function nameColor(name: string, fromId: string): string {
	const parts = fromId.split("-");
	const tier = parts.find((p) => TIER_HUES[p]) ?? fromId;
	const baseHue = TIER_HUES[tier] ?? 200;
	const offset = (hashName(name) % 61) - 30;
	const hue = baseHue + offset;
	const [r, g, b] = hslToRgb(hue, 0.7, 0.6);
	return `\x1b[38;2;${r};${g};${b}m`;
}

// ── Renderer Registration ────────────────────────────────────────────────────

const RST = "\x1b[0m";
const DIM = "\x1b[2m";

interface StoneRenderOptions {
	primaryDisplayName: string;
	maxLines: number;
}

interface StoneDetails {
	from: string;
	to: string;
	displayName?: string;
	content: string;
	timestamp?: string;
}

/**
 * Register the stone message renderer with pi.
 * Renders bordered, colored messages with sender/receiver info.
 */
export function registerStoneRenderer(pi: ExtensionAPI, opts: StoneRenderOptions): void {
	// Override the primary-agent display name
	ADDRESS_NAMES["primary-agent"] = opts.primaryDisplayName;

	pi.registerMessageRenderer<StoneDetails>("stone-message", (message, _options, _theme) => {
		const d = message.details;
		const fallback = typeof message.content === "string" ? message.content : "";
		if (!d) return new Text(fallback, 0, 0);

		const senderName = d.displayName ?? resolveDisplayName(d.from);
		const receiverName = resolveDisplayName(d.to);
		const ts = d.timestamp ?? new Date().toLocaleTimeString();
		const senderClr = nameColor(senderName, d.from);
		const receiverClr = nameColor(receiverName, d.to);

		// Terminal-aware word wrapping
		const cols = process.stdout.columns || 80;
		const boxW = Math.min(cols, 100);
		const innerW = boxW - 4; // "│ " + content + " │"

		function wordWrap(line: string): string[] {
			if (line.length <= innerW) return [line];
			const wrapped: string[] = [];
			let remaining = line;
			while (remaining.length > innerW) {
				let breakAt = remaining.lastIndexOf(" ", innerW);
				if (breakAt <= 0) breakAt = innerW;
				wrapped.push(remaining.slice(0, breakAt));
				remaining = remaining.slice(breakAt + (remaining[breakAt] === " " ? 1 : 0));
			}
			if (remaining) wrapped.push(remaining);
			return wrapped;
		}

		// Truncate then wrap
		const bodyLines = d.content.split("\n");
		const truncated = bodyLines.length > opts.maxLines;
		const visibleLines = truncated ? bodyLines.slice(0, opts.maxLines) : bodyLines;
		const wrappedLines = visibleLines.flatMap(wordWrap);

		// Header
		const header = `${senderClr}${senderName}${RST} ${DIM}→${RST} ${receiverClr}${receiverName}${RST} ${DIM}(${ts})${RST}`;
		const headerPlain = `╭── 💬 ${senderName} → ${receiverName} (${ts}) `;
		const headerW = headerPlain.length;
		const topFill = "─".repeat(Math.max(0, boxW - headerW - 1));
		const topBar = `${DIM}╭── 💬 ${RST}${header} ${DIM}${topFill}╮${RST}`;

		// Content lines — padded to innerW
		const msgBody = wrappedLines.map((l) => {
			const pad = " ".repeat(Math.max(0, innerW - l.length));
			return `${DIM}│${RST} ${l}${pad} ${DIM}│${RST}`;
		}).join("\n");

		// Overflow
		const overflowLine = truncated
			? (() => {
				const text = `... ${bodyLines.length - opts.maxLines} more lines`;
				const pad = " ".repeat(Math.max(0, innerW - text.length));
				return `\n${DIM}│ ${text}${pad} │${RST}`;
			})()
			: "";

		// Bottom
		const botBar = `${DIM}╰${"─".repeat(Math.max(0, boxW - 2))}╯${RST}`;

		return new Text(`${topBar}\n${msgBody}${overflowLine}\n${botBar}`, 0, 0);
	});
}
